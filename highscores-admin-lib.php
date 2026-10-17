<?php
// Shared moderation for the CLI and the authenticated web console.
declare(strict_types=1);

if (!defined('DINO_HIGHSCORES')) {
    http_response_code(404);
    exit;
}

function dino_admin_backup(): string
{
    $file = dino_store_file();
    if (!is_file($file)) {
        return '';
    }
    // The reader can recover from .bak when the primary JSON is damaged. Back
    // up that same valid source so moderation never preserves only corrupt data.
    $raw = @file_get_contents($file);
    if (!is_string($raw) || dino_parse_store($raw) === null) {
        $file .= '.bak';
        $raw = @file_get_contents($file);
        if (!is_string($raw) || dino_parse_store($raw) === null) {
            throw new DinoHttpError(503, 'storage', 'No valid backup source. Nothing was changed.');
        }
    }
    $dir = dino_data_dir() . '/backups';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new DinoHttpError(503, 'storage', 'Backup directory is not available. Nothing was changed.');
    }
    $target = $dir . '/highscores-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(8)) . '.json';
    if (!@copy($file, $target)) {
        throw new DinoHttpError(503, 'storage', 'Backup failed. Nothing was changed.');
    }
    return $target;
}

function dino_admin_revision(array $store, string $target): string
{
    $lists = $target === 'all' ? $store['lists'] : [$target => $store['lists'][$target]];
    return hash('sha256', (string) json_encode($lists));
}

function dino_admin_remove(string $id, ?string $mode = null): ?array
{
    if (!dino_is_id($id) || ($mode !== null && !dino_is_mode($mode))) {
        throw new DinoHttpError(400, 'input', 'Invalid entry.');
    }
    return dino_locked(function () use ($id, $mode): ?array {
        $store = dino_read_store();
        foreach ($store['lists'] as $key => $list) {
            if ($mode !== null && $key !== $mode) {
                continue;
            }
            foreach ($list as $index => $entry) {
                if ($entry['id'] === $id) {
                    $backup = dino_admin_backup();
                    array_splice($store['lists'][$key], $index, 1);
                    dino_save_store($store);
                    return [$key, $entry, $backup];
                }
            }
        }
        return null;
    });
}

function dino_admin_reset(string $target, ?string $revision = null): string
{
    if ($target !== 'all' && !dino_is_mode($target)) {
        throw new DinoHttpError(400, 'input', 'Invalid mode.');
    }
    return dino_locked(function () use ($target, $revision): string {
        $store = dino_read_store();
        if ($revision !== null && !hash_equals(dino_admin_revision($store, $target), $revision)) {
            throw new DinoHttpError(409, 'changed', 'The list changed. Please review it again.');
        }
        $backup = dino_admin_backup();
        foreach ($target === 'all' ? array_keys(DINO_MAX_SPEED) : [$target] as $mode) {
            $store['lists'][$mode] = [];
        }
        dino_save_store($store);
        return $backup;
    });
}

// Reserve attempts under the same lock so parallel requests cannot bypass the
// throttle. State contains HMAC IP keys, not raw IPs; its PHP guard also protects
// it if the configured data directory is accidentally served by PHP.
function dino_admin_login_attempt(string $ip, string $passwordHash, int $now): void
{
    dino_locked(function () use ($ip, $passwordHash, $now): void {
        $file = dino_data_dir() . '/admin-login.php';
        $prefix = "<?php exit; ?>\n";
        $buckets = [];
        if (is_file($file)) {
            $raw = @file_get_contents($file);
            if (!is_string($raw) || strpos($raw, $prefix) !== 0) {
                throw new DinoHttpError(503, 'storage', 'Login storage is not available.');
            }
            $buckets = json_decode(substr($raw, strlen($prefix)), true);
            if (!is_array($buckets)) {
                throw new DinoHttpError(503, 'storage', 'Login storage is not available.');
            }
        }
        foreach ($buckets as $key => $bucket) {
            if (!is_array($bucket) || !is_int($bucket['start'] ?? null) || !is_int($bucket['count'] ?? null)) {
                throw new DinoHttpError(503, 'storage', 'Login storage is damaged.');
            }
            if ($bucket['start'] + 900 <= $now) {
                unset($buckets[$key]);
            }
        }
        $client = hash_hmac('sha256', $ip, $passwordHash);
        foreach (['global' => 30, $client => 5] as $key => $limit) {
            if (isset($buckets[$key]) && $buckets[$key]['count'] >= $limit) {
                throw new DinoHttpError(429, 'rate', 'Too many login attempts.',
                    ['Retry-After' => (string) max(1, $buckets[$key]['start'] + 900 - $now)]);
            }
        }
        foreach (['global', $client] as $key) {
            $buckets[$key] = $buckets[$key] ?? ['start' => $now, 'count' => 0];
            $buckets[$key]['count']++;
        }
        dino_write_file($file, $prefix . json_encode($buckets, JSON_UNESCAPED_SLASHES) . "\n");
    });
}

function dino_admin_authenticated(array $session, string $hash, int $now): bool
{
    return isset($session['admin_key'], $session['admin_started'], $session['admin_seen'])
        && is_string($session['admin_key'])
        && hash_equals(hash('sha256', $hash), $session['admin_key'])
        && is_int($session['admin_started']) && is_int($session['admin_seen'])
        && $session['admin_started'] <= $now && $session['admin_seen'] <= $now
        && $now - $session['admin_started'] < 28800
        && $now - $session['admin_seen'] < 1200;
}

// The configured hash enables the console and acts as a recovery credential.
// Replacing it invalidates the saved override as well as every existing session.
function dino_admin_password_hash(): string
{
    $base = dino_config()['admin_password_hash'];
    if (!is_string($base) || password_get_info($base)['algoName'] === 'unknown') {
        throw new DinoHttpError(404, 'disabled', 'Not available.');
    }
    $file = dino_data_dir() . '/admin-password.php';
    if (!file_exists($file)) {
        return $base;
    }
    $prefix = "<?php exit; ?>\n";
    $raw = @file_get_contents($file);
    $state = is_string($raw) && strpos($raw, $prefix) === 0
        ? json_decode(substr($raw, strlen($prefix)), true) : null;
    if (!is_array($state) || ($state['v'] ?? null) !== 1
        || !is_string($state['config_key'] ?? null) || !is_string($state['password_hash'] ?? null)
        || preg_match('/^[a-f0-9]{64}$/D', $state['config_key']) !== 1
        || password_get_info($state['password_hash'])['algoName'] === 'unknown') {
        throw new DinoHttpError(503, 'storage', 'Password storage is not available.');
    }
    return hash_equals(hash('sha256', $base), $state['config_key']) ? $state['password_hash'] : $base;
}

function dino_admin_change_password(string $expectedHash, string $current, string $password, string $repeat): void
{
    dino_locked(function () use ($expectedHash, $current, $password, $repeat): void {
        $hash = dino_admin_password_hash();
        if (!hash_equals($hash, $expectedHash)) {
            throw new DinoHttpError(401, 'login', 'Password changed. Sign in again.');
        }
        if (strlen($current) > 1024 || !password_verify($current, $hash)) {
            throw new DinoHttpError(400, 'current_password', 'Current password is incorrect.');
        }
        // ASCII letters/digits only, with no minimum beyond a nonempty value.
        // Keep bcrypt's 72-byte boundary so passwords are never truncated.
        if (preg_match('/^[A-Za-z0-9]{1,72}$/D', $password) !== 1) {
            throw new DinoHttpError(400, 'password_format', 'Use 1 to 72 ASCII letters or digits.');
        }
        if (!hash_equals($password, $repeat)) {
            throw new DinoHttpError(400, 'password_repeat', 'Passwords do not match.');
        }
        if (password_verify($password, $hash)) {
            throw new DinoHttpError(400, 'password_same', 'Choose a different password.');
        }
        $newHash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($newHash)) {
            throw new DinoHttpError(503, 'storage', 'Password could not be saved.');
        }
        $state = ['v' => 1, 'config_key' => hash('sha256', dino_config()['admin_password_hash']),
            'password_hash' => $newHash];
        $raw = "<?php exit; ?>\n" . json_encode($state, JSON_UNESCAPED_SLASHES) . "\n";
        $file = dino_data_dir() . '/admin-password.php';
        // Restrict the temporary file before writing secrets; its .php suffix
        // and exit guard also protect accidental placement in a PHP webroot.
        $temp = dino_data_dir() . '/.admin-password-' . bin2hex(random_bytes(12)) . '.php';
        $handle = @fopen($temp, 'x');
        if ($handle === false) {
            throw new DinoHttpError(503, 'storage', 'Password could not be saved.');
        }
        try {
            if (!@chmod($temp, 0600) || @fwrite($handle, $raw) !== strlen($raw) || !@fflush($handle)) {
                throw new DinoHttpError(503, 'storage', 'Password could not be saved.');
            }
            fclose($handle);
            $handle = null;
            if (!@rename($temp, $file)) {
                throw new DinoHttpError(503, 'storage', 'Password could not be saved.');
            }
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
            if (is_file($temp)) {
                @unlink($temp);
            }
        }
    });
}
