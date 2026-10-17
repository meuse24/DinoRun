<?php
// Runs only with the isolated config supplied by tests/admin-web.mjs.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
define('DINO_HIGHSCORES', true);
require dirname(__DIR__) . '/highscores-lib.php';
require dirname(__DIR__) . '/highscores-admin-lib.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expect_error(callable $action, int $status): void
{
    try {
        $action();
    } catch (DinoHttpError $failure) {
        check($failure->status === $status, 'Unexpected error status');
        return;
    }
    throw new RuntimeException('Expected an error');
}

$testRoot = getenv('DINO_ADMIN_TEST_ROOT');
check(is_string($testRoot) && is_dir($testRoot), 'Run through tests/admin-web.mjs with an isolated fixture');
$prefix = rtrim(str_replace('\\', '/', (string) realpath($testRoot)), '/') . '/';
check(strpos(str_replace('\\', '/', dino_data_dir()) . '/', $prefix) === 0, 'Refuse non-fixture data');

$originalPassword = stream_get_contents(STDIN);
$baseHash = dino_admin_password_hash();
check(password_verify($originalPassword, $baseHash), 'Isolated fixture credential supplied on stdin');
$credentialFile = dino_data_dir() . '/admin-password.php';
$nextPassword = 'random words for isolated test only';
foreach (['short', str_repeat('a', 73), str_repeat('ä', 37), "long enough but contains\0null", "invalid utf8 password \xff"] as $invalid) {
    expect_error(function () use ($baseHash, $originalPassword, $invalid): void {
        dino_admin_change_password($baseHash, $originalPassword, $invalid, $invalid);
    }, 400);
    check(!file_exists($credentialFile), 'Invalid password must not create credentials');
}
expect_error(function () use ($baseHash, $nextPassword): void {
    dino_admin_change_password($baseHash, 'wrong', $nextPassword, $nextPassword);
}, 400);
expect_error(function () use ($baseHash, $originalPassword, $nextPassword): void {
    dino_admin_change_password($baseHash, $originalPassword, $nextPassword, 'different');
}, 400);
expect_error(function () use ($baseHash, $originalPassword): void {
    dino_admin_change_password($baseHash, $originalPassword, $originalPassword, $originalPassword);
}, 400);
dino_admin_change_password($baseHash, $originalPassword, $nextPassword, $nextPassword);
$changedHash = dino_admin_password_hash();
check(password_verify($nextPassword, $changedHash) && !password_verify($originalPassword, $changedHash), 'Persisted password replaces bootstrap');
$raw = (string) file_get_contents($credentialFile);
check(strpos($raw, "<?php exit; ?>\n") === 0 && strpos($raw, $nextPassword) === false, 'Guarded hash only; no plaintext password');
expect_error(function () use ($baseHash, $originalPassword, $nextPassword): void {
    dino_admin_change_password($baseHash, $originalPassword, $nextPassword, $nextPassword);
}, 401);
check(file_get_contents($credentialFile) === $raw, 'Stale change cannot overwrite current credential');
// Boundary: 36 two-byte characters fit exactly; longer UTF-8 input is rejected.
$unicodePassword = str_repeat('ä', 36);
dino_admin_change_password($changedHash, $nextPassword, $unicodePassword, $unicodePassword);
check(password_verify($unicodePassword, dino_admin_password_hash()), '72-byte Unicode password supported');
check(glob(dino_data_dir() . '/.admin-password-*.php') === [], 'No credential temporary files left');
$invalidState = ['v' => 1, 'config_key' => '', 'password_hash' => dino_admin_password_hash()];
file_put_contents($credentialFile, "<?php exit; ?>\n" . json_encode($invalidState));
expect_error(function (): void { dino_admin_password_hash(); }, 503);
file_put_contents($credentialFile, 'corrupt');
expect_error(function (): void { dino_admin_password_hash(); }, 503);
expect_error(function () use ($baseHash, $originalPassword, $nextPassword): void {
    dino_admin_change_password($baseHash, $originalPassword, $nextPassword, $nextPassword);
}, 503);
check(file_get_contents($credentialFile) === 'corrupt', 'Storage failure never resets credentials silently');
unlink($credentialFile);

$now = 1700000000;
$hash = password_hash('isolated-test-value', PASSWORD_DEFAULT);
$session = ['admin_key' => hash('sha256', $hash), 'admin_started' => $now - 10, 'admin_seen' => $now - 5];
check(dino_admin_authenticated($session, $hash, $now), 'Valid session');
check(!dino_admin_authenticated([], $hash, $now), 'Anonymous session');
check(!dino_admin_authenticated($session, password_hash('changed-value', PASSWORD_DEFAULT), $now), 'Hash change revokes session');
$expired = $session;
$expired['admin_seen'] = $now - 1200;
check(!dino_admin_authenticated($expired, $hash, $now), 'Idle timeout');
$expired = $session;
$expired['admin_started'] = $now - 28800;
check(!dino_admin_authenticated($expired, $hash, $now), 'Absolute timeout despite recent activity');
$expired = $session;
$expired['admin_seen'] = $now + 1;
check(!dino_admin_authenticated($expired, $hash, $now), 'Reject future timestamps');

$store = dino_empty_store();
$entry = ['id' => '00000000-0000-4000-8000-000000000001', 'name' => 'DINO', 'score' => 900, 'achievedAt' => '2026-10-17T10:00:00Z'];
$store['lists']['normal'] = [$entry];
$store['lists']['relaxed'] = [array_replace($entry, ['id' => '00000000-0000-4000-8000-000000000002', 'name' => 'MILA'])];
$store['recent'] = [['id' => $entry['id']]];
dino_locked(function () use ($store): void { dino_save_store($store); });
$revision = dino_admin_revision($store, 'normal');
$changed = $store;
$changed['lists']['normal'][0]['score']++;
check($revision !== dino_admin_revision($changed, 'normal'), 'Reset binds to reviewed list');
$changed = $store;
$changed['lists']['relaxed'] = [];
check($revision === dino_admin_revision($changed, 'normal'), 'Unrelated list does not invalidate normal reset');
expect_error(function (): void { dino_admin_reset('invalid'); }, 400);
expect_error(function (): void { dino_admin_remove('not-an-id'); }, 400);
expect_error(function (): void { dino_admin_reset('normal', 'outdated'); }, 409);
check(dino_read_store() === $store, 'Rejected reset preserves data');
check(dino_admin_remove($entry['id'], 'relaxed') === null, 'Cannot delete from wrong mode');
$removed = dino_admin_remove($entry['id'], 'normal');
check($removed !== null && is_file($removed[2]), 'Deletion makes backup');
check(json_decode((string) file_get_contents($removed[2]), true) === $store, 'Backup contains the exact previous store');
check(dino_read_store()['recent'] === $store['recent'], 'Idempotency ring retained');
check(count(dino_read_store()['lists']['relaxed']) === 1, 'Other mode retained');
dino_admin_reset('all');
check(dino_read_store()['lists'] === ['normal' => [], 'relaxed' => []], 'Reset all');

file_put_contents(dino_store_file() . '.bak', json_encode($store));
file_put_contents(dino_store_file(), 'damaged primary');
$recovered = dino_admin_remove($entry['id'], 'normal');
check($recovered !== null, 'Moderation can use existing .bak recovery');
check(json_decode((string) file_get_contents($recovered[2]), true) === $store,
    'Timestamped backup retains the valid recovered data, not the corrupt primary');
check(count(dino_read_store()['lists']['relaxed']) === 1, 'Recovery keeps unrelated list');

// Throttles survive new sessions and reset only when the fixed window expires.
for ($i = 0; $i < 5; $i++) {
    dino_admin_login_attempt('192.0.2.1', $hash, $now);
}
expect_error(function () use ($hash, $now): void { dino_admin_login_attempt('192.0.2.1', $hash, $now); }, 429);
dino_admin_login_attempt('192.0.2.1', $hash, $now + 900);
for ($i = 1; $i < 30; $i++) {
    dino_admin_login_attempt('192.0.2.' . ($i + 1), $hash, $now + 900);
}
expect_error(function () use ($hash, $now): void { dino_admin_login_attempt('192.0.2.200', $hash, $now + 900); }, 429);
$raw = (string) file_get_contents(dino_data_dir() . '/admin-login.php');
check(strpos($raw, '192.0.2.') === false, 'No raw IPs stored');
file_put_contents(dino_data_dir() . '/admin-login.php', 'damaged');
expect_error(function () use ($hash, $now): void { dino_admin_login_attempt('192.0.2.1', $hash, $now + 1800); }, 503);
echo "PHP password change, session, moderation, backup, revision and throttle checks passed\n";
