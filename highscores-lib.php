<?php
/*
 * Dino Run highscores: shared validation, ranking and file storage for highscores.php (HTTP API)
 * and admin.php (CLI moderation). Plain PHP 7.4+, no database and no Composer.
 *
 * Storage: one JSON file with both top 10 lists and a ring of the last 200 processed IDs.
 * Every change runs under an exclusive lock on a separate lock file and replaces the JSON file
 * atomically (temporary file + rename in the same directory), so readers never see partial data.
 */
declare(strict_types=1);

if (!defined('DINO_HIGHSCORES')) {
    // Direct HTTP requests to this include file reveal nothing.
    http_response_code(404);
    exit;
}

const DINO_API_VERSION = 1;
const DINO_LIST_SIZE = 10;
const DINO_RECENT_IDS = 200;
const DINO_MAX_INT = 2147483647;
const DINO_MAX_BODY = 2048;
// Must match GAME_MODES in dino.html: top speed in px per 60 Hz step.
const DINO_MAX_SPEED = ['normal' => 13, 'relaxed' => 9];
const DINO_TURBO = 1.18;
// Optional coarse labels shown as icons; mirrored in dino.html (DEVICES, INPUTS). Never raw user agents.
const DINO_DEVICES = ['phone', 'tablet', 'desktop'];
const DINO_INPUTS = ['keyboard', 'touch', 'mouse', 'gamepad'];
const DINO_POINTS_PER_PX = 0.025;
const DINO_SCORE_BONUS_RATE = 0.1;
const DINO_STEPS_PER_SECOND = 60;
// Mirrored in dino.html (BLOCKED_NAMES). Extend server-side via config 'blocked_names'.
const DINO_BLOCKED_NAMES = [
    'ANAL', 'ANUS', 'ARSE', 'CLIT', 'COCK', 'COON', 'CUNT', 'DICK', 'DYKE', 'FAGS', 'FICK',
    'FOTZ', 'FUCK', 'HEIL', 'HTLR', 'HURE', 'JIZZ', 'KIKE', 'KKKK', 'NAZI', 'NEGR', 'NIGA',
    'NIGG', 'PAKI', 'PISS', 'PORN', 'RAPE', 'SHIT', 'SLUT', 'SPIC', 'SSSS', 'TITS', 'TWAT',
    'WANK',
];

final class DinoHttpError extends RuntimeException
{
    public $status;
    public $code_name;
    public $headers;

    public function __construct(int $status, string $code, string $message, array $headers = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->code_name = $code;
        $this->headers = $headers;
    }
}

function dino_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $config = [
        // Prefer a directory outside the web root; set it in highscores.config.php.
        'data_dir' => __DIR__ . '/highscores-data',
        'allowed_origins' => [
            'https://meuse24.info',
            'https://www.meuse24.info',
            'http://meuse24.info',
            'http://www.meuse24.info',
            // Local copies of dino.html opened as file:// send "Origin: null".
            'null',
        ],
        'rate_limit' => 30,
        'rate_window' => 60,
        'rate_idle' => 600,
        'lock_timeout' => 3.0,
        'blocked_names' => [],
        // Web moderation is disabled until a password_hash() value is set.
        'admin_password_hash' => '',
        // Development only: honored solely by PHP's loopback CLI server.
        'admin_allow_local_http' => false,
    ];
    $file = __DIR__ . '/highscores.config.php';
    if (is_file($file)) {
        $local = require $file;
        if (is_array($local)) {
            $config = array_replace($config, $local);
        }
    }
    $env = getenv('DINO_HIGHSCORES_CONFIG');
    if (is_string($env) && $env !== '' && is_file($env)) {
        $local = require $env;
        if (is_array($local)) {
            $config = array_replace($config, $local);
        }
    }
    return $config;
}

function dino_is_mode($mode): bool
{
    return is_string($mode) && array_key_exists($mode, DINO_MAX_SPEED);
}

function dino_is_id($id): bool
{
    return is_string($id)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $id) === 1;
}

function dino_is_name($name): bool
{
    return is_string($name) && preg_match('/^[A-Z]{4}$/', $name) === 1;
}

function dino_name_blocked(string $name): bool
{
    $extra = array_map('strtoupper', (array) dino_config()['blocked_names']);
    return in_array($name, DINO_BLOCKED_NAMES, true) || in_array($name, $extra, true);
}

// Missing labels are allowed (older clients and entries); present ones must be known.
function dino_is_label($value, array $allowed): bool
{
    return $value === null || (is_string($value) && in_array($value, $allowed, true));
}

function dino_is_count($value): bool
{
    return is_int($value) && $value >= 1 && $value <= DINO_MAX_INT;
}

function dino_is_time($value): bool
{
    return is_string($value) && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $value) === 1;
}

// Whole round at top speed with Chili, plus capped section bonuses and rounding.
function dino_max_score(string $mode, int $durationMs): int
{
    $steps = intdiv($durationMs * DINO_STEPS_PER_SECOND + 999, 1000);
    return (int) floor($steps * DINO_MAX_SPEED[$mode] * DINO_TURBO * DINO_POINTS_PER_PX * (1 + DINO_SCORE_BONUS_RATE)) + 1;
}

// Score descending, then earlier date, then ID. dino.html uses the same rule.
function dino_compare(array $a, array $b): int
{
    if ($a['score'] !== $b['score']) {
        return $a['score'] < $b['score'] ? 1 : -1;
    }
    return strcmp($a['achievedAt'], $b['achievedAt']) ?: strcmp($a['id'], $b['id']);
}

function dino_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function dino_empty_store(): array
{
    return ['v' => 1, 'lists' => ['normal' => [], 'relaxed' => []], 'recent' => []];
}

function dino_valid_entry($entry): bool
{
    return is_array($entry)
        && dino_is_id($entry['id'] ?? null)
        && dino_is_name($entry['name'] ?? null)
        && dino_is_count($entry['score'] ?? null)
        && dino_is_time($entry['achievedAt'] ?? null);
}

function dino_public_entry(array $entry): array
{
    $public = [
        'id' => $entry['id'],
        'name' => $entry['name'],
        'score' => $entry['score'],
        'achievedAt' => $entry['achievedAt'],
    ];
    // Unknown labels in stored data are dropped instead of discarding the whole entry.
    foreach (['device' => DINO_DEVICES, 'input' => DINO_INPUTS] as $key => $allowed) {
        if (isset($entry[$key]) && dino_is_label($entry[$key], $allowed)) {
            $public[$key] = $entry[$key];
        }
    }
    return $public;
}

// Returns null for unreadable or structurally broken data; it is never replaced by an empty list.
function dino_parse_store(string $raw): ?array
{
    $data = json_decode($raw, true);
    if (!is_array($data) || ($data['v'] ?? null) !== 1 || !is_array($data['lists'] ?? null)) {
        return null;
    }
    $store = dino_empty_store();
    foreach (array_keys(DINO_MAX_SPEED) as $mode) {
        $list = $data['lists'][$mode] ?? [];
        if (!is_array($list)) {
            return null;
        }
        $entries = array_values(array_map('dino_public_entry', array_filter($list, 'dino_valid_entry')));
        usort($entries, 'dino_compare');
        $store['lists'][$mode] = array_slice($entries, 0, DINO_LIST_SIZE);
    }
    foreach (is_array($data['recent'] ?? null) ? $data['recent'] : [] as $item) {
        if (is_array($item) && dino_is_id($item['id'] ?? null)) {
            $store['recent'][] = $item;
        }
    }
    $store['recent'] = array_slice($store['recent'], -DINO_RECENT_IDS);
    return $store;
}

function dino_data_dir(): string
{
    return rtrim((string) dino_config()['data_dir'], '/');
}

function dino_store_file(): string
{
    return dino_data_dir() . '/highscores.json';
}

function dino_ensure_data_dir(): void
{
    $dir = dino_data_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        throw new DinoHttpError(503, 'storage', 'Highscore storage is not available.');
    }
    // Defence in depth if the directory ends up inside the web root.
    $deny = $dir . '/.htaccess';
    if (!is_file($deny)) {
        @file_put_contents($deny, "Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
    }
    if (!is_file($dir . '/index.html')) {
        @file_put_contents($dir . '/index.html', '');
    }
}

function dino_read_store(): array
{
    $file = dino_store_file();
    if (!is_file($file)) {
        return dino_empty_store();
    }
    foreach ([$file, $file . '.bak'] as $candidate) {
        $raw = is_file($candidate) ? @file_get_contents($candidate) : false;
        $store = is_string($raw) ? dino_parse_store($raw) : null;
        if ($store !== null) {
            return $store;
        }
    }
    throw new DinoHttpError(503, 'storage', 'Highscore data is damaged.');
}

// Atomic replacement: write a temporary file in the same directory, then rename it.
function dino_write_file(string $file, string $content): void
{
    $temp = dirname($file) . '/.' . basename($file) . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (@file_put_contents($temp, $content) !== strlen($content) || !@rename($temp, $file)) {
        @unlink($temp);
        throw new DinoHttpError(503, 'storage', 'Highscore data could not be saved.');
    }
}

function dino_write_json(string $file, array $data): void
{
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        throw new DinoHttpError(503, 'storage', 'Highscore data could not be saved.');
    }
    dino_write_file($file, $json . "\n");
}

function dino_save_store(array $store): void
{
    $file = dino_store_file();
    // Keep the previous good state; dino_read_store() falls back to it if the main file breaks.
    if (is_file($file)) {
        $previous = @file_get_contents($file);
        if (is_string($previous) && dino_parse_store($previous) !== null) {
            @file_put_contents($file . '.bak', $previous);
        }
    }
    dino_write_json($file, $store);
}

// Runs $work while holding the exclusive lock. All writers, including admin.php, use this.
function dino_locked(callable $work)
{
    dino_ensure_data_dir();
    $handle = @fopen(dino_data_dir() . '/highscores.lock', 'c');
    if ($handle === false) {
        throw new DinoHttpError(503, 'storage', 'Highscore storage is not available.');
    }
    try {
        $deadline = microtime(true) + (float) dino_config()['lock_timeout'];
        while (!flock($handle, LOCK_EX | LOCK_NB)) {
            if (microtime(true) >= $deadline) {
                throw new DinoHttpError(503, 'busy', 'Highscores are busy. Please try again.', ['Retry-After' => '2']);
            }
            usleep(25000);
        }
        try {
            return $work();
        } finally {
            flock($handle, LOCK_UN);
        }
    } finally {
        fclose($handle);
    }
}

function dino_rank(array $list, string $id): ?int
{
    foreach ($list as $index => $entry) {
        if ($entry['id'] === $id) {
            return $index + 1;
        }
    }
    return null;
}

/*
 * Adds a validated submission. Repeating an ID with identical data returns the stored outcome
 * without changes; the same ID with different data is a conflict.
 * Returns [store, changed, result].
 */
function dino_submit(array $store, array $input, string $now): array
{
    $mode = $input['mode'];
    $fingerprint = [$mode, $input['name'], $input['score'], $input['durationMs']];
    foreach (array_reverse($store['recent']) as $item) {
        if ($item['id'] !== $input['id']) {
            continue;
        }
        $known = [$item['mode'] ?? null, $item['name'] ?? null, $item['score'] ?? null, $item['durationMs'] ?? null];
        if ($known !== $fingerprint) {
            throw new DinoHttpError(409, 'conflict', 'This entry ID was already used for other data.');
        }
        $rank = dino_rank($store['lists'][$mode], $input['id']);
        return [$store, false, [
            'status' => $rank === null ? 'not_ranked' : 'ranked',
            'duplicate' => true,
            'rank' => $rank,
            'achievedAt' => $item['achievedAt'] ?? null,
        ]];
    }
    // IDs still in a top 10 but already outside the ring stay protected as well.
    foreach ($store['lists'] as $listMode => $list) {
        foreach ($list as $entry) {
            if ($entry['id'] !== $input['id']) {
                continue;
            }
            if ($listMode !== $mode || $entry['name'] !== $input['name'] || $entry['score'] !== $input['score']) {
                throw new DinoHttpError(409, 'conflict', 'This entry ID was already used for other data.');
            }
            return [$store, false, [
                'status' => 'ranked',
                'duplicate' => true,
                'rank' => dino_rank($list, $input['id']),
                'achievedAt' => $entry['achievedAt'],
            ]];
        }
    }
    $entry = dino_public_entry([
        'id' => $input['id'],
        'name' => $input['name'],
        'score' => $input['score'],
        'achievedAt' => $now,
        'device' => $input['device'],
        'input' => $input['input'],
    ]);
    $list = $store['lists'][$mode];
    $list[] = $entry;
    usort($list, 'dino_compare');
    $store['lists'][$mode] = array_slice($list, 0, DINO_LIST_SIZE);
    $rank = dino_rank($store['lists'][$mode], $entry['id']);
    $store['recent'][] = [
        'id' => $entry['id'],
        'mode' => $mode,
        'name' => $entry['name'],
        'score' => $entry['score'],
        'durationMs' => $input['durationMs'],
        'achievedAt' => $now,
    ];
    $store['recent'] = array_slice($store['recent'], -DINO_RECENT_IDS);
    return [$store, true, [
        'status' => $rank === null ? 'not_ranked' : 'ranked',
        'duplicate' => false,
        'rank' => $rank,
        'achievedAt' => $now,
    ]];
}

// Validates a decoded POST body; returns the normalised submission.
function dino_validate_submission($data): array
{
    if (!is_array($data) || array_keys($data) === range(0, count($data) - 1)) {
        throw new DinoHttpError(400, 'invalid', 'Expected a JSON object.');
    }
    if (($data['v'] ?? null) !== DINO_API_VERSION) {
        throw new DinoHttpError(400, 'version', 'Unsupported API version.');
    }
    if (!dino_is_mode($data['mode'] ?? null)) {
        throw new DinoHttpError(400, 'mode', 'Unknown game mode.');
    }
    if (!dino_is_id($data['id'] ?? null)) {
        throw new DinoHttpError(400, 'id', 'Invalid entry ID.');
    }
    if (!dino_is_name($data['name'] ?? null)) {
        throw new DinoHttpError(400, 'name', 'Names are exactly four letters A-Z.');
    }
    if (!dino_is_count($data['score'] ?? null)) {
        throw new DinoHttpError(400, 'score', 'Scores are positive whole numbers.');
    }
    if (!dino_is_count($data['durationMs'] ?? null)) {
        throw new DinoHttpError(400, 'duration', 'Durations are positive whole milliseconds.');
    }
    if (!dino_is_label($data['device'] ?? null, DINO_DEVICES)) {
        throw new DinoHttpError(400, 'device', 'Unknown device type.');
    }
    if (!dino_is_label($data['input'] ?? null, DINO_INPUTS)) {
        throw new DinoHttpError(400, 'input', 'Unknown input method.');
    }
    if (dino_name_blocked($data['name'])) {
        throw new DinoHttpError(422, 'name_blocked', 'Please choose another name.');
    }
    if ($data['score'] > dino_max_score($data['mode'], $data['durationMs'])) {
        throw new DinoHttpError(422, 'implausible', 'This score is not possible in that time.');
    }
    return [
        'id' => $data['id'],
        'mode' => $data['mode'],
        'name' => $data['name'],
        'score' => $data['score'],
        'durationMs' => $data['durationMs'],
        'device' => $data['device'] ?? null,
        'input' => $data['input'] ?? null,
    ];
}

/*
 * HMAC secret for the rate limit. Stored as a PHP file so that a web request to it (if the data
 * directory ends up reachable) only executes it and returns an empty page. The file is read as
 * text, never included. A secret.key from earlier versions is taken over and removed.
 */
function dino_secret(): string
{
    $dir = dino_data_dir();
    $file = $dir . '/secret.php';
    $raw = is_file($file) ? (string) @file_get_contents($file) : '';
    if (preg_match("/return '([0-9a-f]{64})';/", $raw, $match) === 1) {
        return $match[1];
    }
    $legacy = $dir . '/secret.key';
    $old = is_file($legacy) ? trim((string) @file_get_contents($legacy)) : '';
    $secret = preg_match('/^[0-9a-f]{64}$/', $old) === 1 ? $old : bin2hex(random_bytes(32));
    dino_write_file($file, "<?php\n// Highscore rate-limit secret. Keep private; replacing it resets the counters.\nreturn '$secret';\n");
    @chmod($file, 0600);
    if (is_file($legacy)) {
        @unlink($legacy);
    }
    return $secret;
}

/*
 * Fixed-window limit per client. Stores only an HMAC of the IP address with a server secret,
 * a counter and times; entries disappear after rate_idle seconds without requests.
 * Must run inside dino_locked().
 */
function dino_rate_limit(string $ip, int $now): void
{
    $config = dino_config();
    $file = dino_data_dir() . '/ratelimit.json';
    $raw = is_file($file) ? @file_get_contents($file) : false;
    $buckets = is_string($raw) ? json_decode($raw, true) : [];
    if (!is_array($buckets)) {
        $buckets = [];
    }
    foreach ($buckets as $key => $bucket) {
        if (!is_array($bucket) || ($bucket['seen'] ?? 0) + (int) $config['rate_idle'] <= $now) {
            unset($buckets[$key]);
        }
    }
    $key = substr(hash_hmac('sha256', $ip, dino_secret()), 0, 32);
    $bucket = $buckets[$key] ?? ['start' => $now, 'count' => 0, 'seen' => $now];
    if ($bucket['start'] + (int) $config['rate_window'] <= $now) {
        $bucket = ['start' => $now, 'count' => 0, 'seen' => $now];
    }
    $bucket['count']++;
    $bucket['seen'] = $now;
    $buckets[$key] = $bucket;
    dino_write_json($file, $buckets);
    if ($bucket['count'] > (int) $config['rate_limit']) {
        $wait = max(1, $bucket['start'] + (int) $config['rate_window'] - $now);
        throw new DinoHttpError(429, 'rate_limited', 'Too many entries. Please wait a moment.', ['Retry-After' => (string) $wait]);
    }
}

function dino_send(int $status, array $body, array $headers = []): void
{
    http_response_code($status);
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode(['v' => DINO_API_VERSION] + $body, JSON_UNESCAPED_SLASHES);
}

function dino_list_response(array $store, string $mode): array
{
    $entries = [];
    foreach ($store['lists'][$mode] as $index => $entry) {
        $entries[] = ['rank' => $index + 1] + dino_public_entry($entry);
    }
    return ['mode' => $mode, 'entries' => $entries, 'serverTime' => dino_now()];
}

function dino_api_main(): void
{
    ini_set('display_errors', '0');
    set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
        // Expected filesystem failures are silenced with @ and handled as storage errors.
        if (!(error_reporting() & $severity)) {
            return false;
        }
        throw new ErrorException($message, 0, $severity, $file, $line);
    });
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Vary: Origin');
    try {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
        if ($origin !== null) {
            // A foreign Origin is rejected before anything is read or written.
            if (!in_array($origin, (array) dino_config()['allowed_origins'], true)) {
                throw new DinoHttpError(403, 'origin', 'This origin may not use the highscores.');
            }
            header('Access-Control-Allow-Origin: ' . $origin);
        }
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'OPTIONS') {
            http_response_code(204);
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Max-Age: 86400');
            return;
        }
        if ($method === 'GET') {
            if (($_GET['v'] ?? null) !== (string) DINO_API_VERSION) {
                throw new DinoHttpError(400, 'version', 'Unsupported API version.');
            }
            $mode = $_GET['mode'] ?? null;
            if (!dino_is_mode($mode)) {
                throw new DinoHttpError(400, 'mode', 'Unknown game mode.');
            }
            // Writers replace the file atomically, so readers need no lock.
            dino_send(200, dino_list_response(dino_read_store(), $mode));
            return;
        }
        if ($method !== 'POST') {
            throw new DinoHttpError(405, 'method', 'Use GET or POST.', ['Allow' => 'GET, POST, OPTIONS']);
        }
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $body = $length > DINO_MAX_BODY ? '' : (string) file_get_contents('php://input', false, null, 0, DINO_MAX_BODY + 1);
        if ($length > DINO_MAX_BODY || strlen($body) > DINO_MAX_BODY) {
            throw new DinoHttpError(413, 'too_large', 'Request too large.');
        }
        $data = json_decode($body, true);
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $response = dino_locked(function () use ($data, $ip): array {
            dino_rate_limit($ip, time());
            $input = dino_validate_submission($data);
            [$store, $changed, $result] = dino_submit(dino_read_store(), $input, dino_now());
            if ($changed) {
                dino_save_store($store);
            }
            return $result + dino_list_response($store, $input['mode']);
        });
        dino_send(200, $response);
    } catch (DinoHttpError $error) {
        dino_send($error->status, ['error' => $error->code_name, 'message' => $error->getMessage()], $error->headers);
    } catch (Throwable $error) {
        error_log('Dino highscores: ' . $error->getMessage());
        dino_send(500, ['error' => 'server', 'message' => 'Unexpected server error.']);
    }
}
