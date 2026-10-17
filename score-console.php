<?php
// Private web moderation. Enable via admin_password_hash in the server config.
// May be renamed; no required sibling frontend asset. Update the game's link if renamed.
declare(strict_types=1);
ini_set('display_errors', '0');

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, private, max-age=0');
header('Pragma: no-cache');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow, noarchive');
$nonce = base64_encode(random_bytes(18));
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-$nonce'; script-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

define('DINO_HIGHSCORES', true);
require __DIR__ . '/highscores-lib.php';
require __DIR__ . '/highscores-admin-lib.php';

function dino_admin_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function dino_admin_field(string $key): string
{
    return isset($_POST[$key]) && is_string($_POST[$key]) ? $_POST[$key] : '';
}

function dino_admin_redirect(string $mode): void
{
    header('Location: ' . rawurlencode(basename(__FILE__)) . '?mode=' . rawurlencode($mode), true, 303);
    exit;
}

function dino_admin_csrf_field(): void
{
    echo '<input type="hidden" name="csrf" value="' . dino_admin_escape($_SESSION['csrf']) . '">';
}

function dino_admin_label(string $mode): string
{
    return $mode === 'all' ? 'Beide Ranglisten' : ($mode === 'normal' ? 'Normal' : 'Relaxed');
}

$error = '';
$notice = '';
$unavailable = false;
$authenticated = false;
$confirmation = null;
$store = null;
$mode = 'normal';
$passwordPage = false;
try {
    $config = dino_config();
    $hash = dino_admin_password_hash();
    $https = in_array(strtolower((string) ($_SERVER['HTTPS'] ?? '')), ['on', '1'], true);
    $local = $config['admin_allow_local_http'] === true && PHP_SAPI === 'cli-server'
        && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    if (!$https && !$local) {
        throw new DinoHttpError(403, 'https', 'HTTPS required.');
    }
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'POST'], true)) {
        throw new DinoHttpError(405, 'method', 'Method not allowed.', ['Allow' => 'GET, POST']);
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 4096) {
        throw new DinoHttpError(413, 'input', 'Request too large.');
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    session_name('DinoScoreAdmin');
    $cookiePath = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    $cookiePath = rtrim($cookiePath, '/') . '/';
    session_set_cookie_params(['lifetime' => 0, 'path' => $cookiePath,
        'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    if (!session_start()) {
        throw new DinoHttpError(503, 'storage', 'Session is not available.');
    }
    $now = time();
    $authenticated = dino_admin_authenticated($_SESSION, $hash, $now);
    if (!$authenticated && isset($_SESSION['admin_key'])) {
        $_SESSION = [];
        $notice = 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.';
    }
    if ($authenticated) {
        $_SESSION['admin_seen'] = $now;
        if ($now - ($_SESSION['admin_rotated'] ?? 0) >= 900) {
            if (!session_regenerate_id(true)) {
                throw new DinoHttpError(503, 'storage', 'Session is not available.');
            }
            $_SESSION['admin_rotated'] = $now;
        }
    }
    if (!isset($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    $selected = $_SERVER['REQUEST_METHOD'] === 'POST' ? dino_admin_field('mode') : ($_GET['mode'] ?? 'normal');
    if (!dino_is_mode($selected)) {
        throw new DinoHttpError(400, 'input', 'Invalid mode.');
    }
    $mode = $selected;
    $passwordPage = $authenticated && (($_GET['view'] ?? '') === 'password'
        || ($_SERVER['REQUEST_METHOD'] === 'POST' && dino_admin_field('action') === 'change_password'));
    if (isset($_SESSION['flash'])) {
        $notice = $_SESSION['flash'];
        unset($_SESSION['flash']);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $action = dino_admin_field('action');
        if (!$authenticated && $action !== 'login') {
            throw new DinoHttpError(401, 'login', 'Authentication required.');
        }
        if (!hash_equals($_SESSION['csrf'], dino_admin_field('csrf'))
            || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            throw new DinoHttpError(403, 'csrf', 'Invalid request.');
        }
        if ($action === 'login') {
            dino_admin_login_attempt($_SERVER['REMOTE_ADDR'] ?? '', $hash, $now);
            $password = dino_admin_field('password');
            if (strlen($password) > 1024 || !password_verify($password, $hash)) {
                throw new DinoHttpError(401, 'password', 'Invalid password.');
            }
            if (!session_regenerate_id(true)) {
                throw new DinoHttpError(503, 'storage', 'Session is not available.');
            }
            $_SESSION = ['admin_key' => hash('sha256', $hash), 'admin_started' => $now,
                'admin_seen' => $now, 'admin_rotated' => $now, 'csrf' => bin2hex(random_bytes(32))];
            dino_admin_redirect($mode);
        } elseif ($action === 'change_password') {
            dino_admin_login_attempt($_SERVER['REMOTE_ADDR'] ?? '', $hash, $now);
            // Rotate before saving so a session-storage failure leaves the
            // credential untouched. Successful changes require a fresh login.
            if (!session_regenerate_id(true)) {
                throw new DinoHttpError(503, 'storage', 'Session is not available.');
            }
            dino_admin_change_password($hash, dino_admin_field('current_password'),
                dino_admin_field('new_password'), dino_admin_field('repeat_password'));
            $_SESSION = ['csrf' => bin2hex(random_bytes(32)),
                'flash' => 'Passwort geändert. Bitte mit dem neuen Passwort anmelden.'];
            dino_admin_redirect($mode);
        } elseif ($action === 'logout') {
            $_SESSION = [];
            session_regenerate_id(true);
            dino_admin_redirect($mode);
        } elseif ($action === 'confirm_remove' || $action === 'confirm_reset') {
            $store = dino_read_store();
            $confirmation = ['action' => $action === 'confirm_remove' ? 'remove' : 'reset',
                'mode' => $mode, 'token' => bin2hex(random_bytes(32)), 'expires' => $now + 300];
            if ($action === 'confirm_remove') {
                $id = dino_admin_field('id');
                $entry = null;
                foreach ($store['lists'][$mode] as $candidate) {
                    if ($candidate['id'] === $id) {
                        $entry = $candidate;
                        break;
                    }
                }
                if (!$entry) {
                    throw new DinoHttpError(404, 'missing', 'Entry no longer exists.');
                }
                $confirmation['id'] = $id;
                $confirmation['entry'] = $entry;
            } else {
                $target = dino_admin_field('target');
                if ($target !== 'all' && !dino_is_mode($target)) {
                    throw new DinoHttpError(400, 'input', 'Invalid target.');
                }
                $confirmation['target'] = $target;
                $confirmation['revision'] = dino_admin_revision($store, $target);
            }
            $_SESSION['pending'] = $confirmation;
        } elseif ($action === 'remove' || $action === 'reset') {
            $pending = $_SESSION['pending'] ?? [];
            if (($pending['action'] ?? '') !== $action || ($pending['mode'] ?? '') !== $mode
                || ($pending['expires'] ?? 0) <= $now
                || !hash_equals($pending['token'] ?? '', dino_admin_field('confirmation'))) {
                throw new DinoHttpError(403, 'confirmation', 'Review the action first.');
            }
            if (dino_admin_field('confirmed') !== 'yes'
                || ($action === 'reset' && dino_admin_field('reset_word') !== 'RESET')) {
                throw new DinoHttpError(400, 'confirmation', 'Confirmation is missing.');
            }
            // Consume before writing; repeating a POST cannot repeat the mutation.
            unset($_SESSION['pending']);
            if ($action === 'remove') {
                $removed = dino_admin_remove($pending['id'], $mode);
                if ($removed === null) {
                    throw new DinoHttpError(404, 'missing', 'Entry no longer exists.');
                }
                $backup = $removed[2];
                $_SESSION['flash'] = 'Eintrag ' . $removed[1]['name'] . ' wurde gelöscht.';
            } else {
                $backup = dino_admin_reset($pending['target'], $pending['revision']);
                $_SESSION['flash'] = dino_admin_label($pending['target']) . ' wurde zurückgesetzt.';
            }
            $_SESSION['flash'] .= $backup !== '' ? ' Sicherung: ' . basename($backup) : '';
            dino_admin_redirect($mode);
        } else {
            throw new DinoHttpError(400, 'input', 'Unknown action.');
        }
    } elseif (isset($_SESSION['pending'])) {
        // Returning to a list cancels a previous confirmation.
        unset($_SESSION['pending']);
    }
    if ($authenticated && !$passwordPage && $store === null) {
        $store = dino_read_store();
    }
} catch (DinoHttpError $failure) {
    http_response_code($failure->status);
    foreach ($failure->headers as $name => $value) {
        header($name . ': ' . $value);
    }
    $messages = ['disabled' => 'Diese Seite ist nicht verfügbar.',
        'https' => 'Bitte öffne die Verwaltung über HTTPS.',
        'password' => 'Die Anmeldung ist fehlgeschlagen.', 'login' => 'Bitte zuerst anmelden.',
        'current_password' => 'Das bisherige Passwort ist nicht korrekt.',
        'password_format' => 'Das neue Passwort darf nur Buchstaben (A–Z, a–z) und Zahlen (0–9) enthalten und muss 1 bis 72 Zeichen lang sein.',
        'password_repeat' => 'Die neuen Passwörter stimmen nicht überein.',
        'password_same' => 'Bitte wähle ein anderes Passwort als bisher.',
        'rate' => 'Zu viele Anmeldeversuche. Bitte nach Ablauf der Wartezeit erneut versuchen.',
        'csrf' => 'Diese Anfrage ist abgelaufen oder ungültig. Bitte die Seite neu laden.',
        'confirmation' => 'Die Bestätigung fehlt oder ist abgelaufen. Bitte die Aktion erneut auswählen.',
        'changed' => 'Die Rangliste hat sich inzwischen geändert. Bitte prüfe sie erneut.',
        'missing' => 'Dieser Eintrag ist nicht mehr vorhanden.',
        'storage' => 'Die Verwaltung ist momentan nicht verfügbar. Bitte später erneut versuchen.',
        'busy' => 'Die Ranglisten werden gerade gespeichert. Bitte erneut versuchen.'];
    $error = $messages[$failure->code_name] ?? 'Die Anfrage konnte nicht ausgeführt werden.';
    $unavailable = in_array($failure->code_name, ['disabled', 'https', 'method'], true)
        || session_status() !== PHP_SESSION_ACTIVE;
    $confirmation = null;
} catch (Throwable $failure) {
    http_response_code(503);
    error_log('Dino web moderation unavailable: ' . get_class($failure));
    $error = 'Die Verwaltung ist momentan nicht verfügbar. Bitte später erneut versuchen.';
    $unavailable = true;
    $confirmation = null;
}
?>
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="color-scheme" content="light dark">
  <title>Highscores verwalten · Dino Run</title>
  <style nonce="<?= dino_admin_escape($nonce) ?>">
    :root { color-scheme: light; --bg:#edf7fd; --panel:#fffaf2; --ink:#173f69; --line:#173f692a; --muted:#476583; --danger:#982e20; --accent:#e67842; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui,sans-serif; }
    header { border-bottom:1px solid var(--line); background:var(--panel); }
    .header-inner { max-width:1080px; margin:auto; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .account { display:flex; gap:8px; flex-wrap:wrap; }
    .brand { font-weight:1000; letter-spacing:-.04em; font-size:24px; color:var(--ink); }
    .brand span { color:var(--accent); } .eyebrow { display:block; font-size:11px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
    main { max-width:1080px; margin:auto; padding:32px 24px 48px; }
    h1 { margin:0 0 8px; font-size:clamp(28px,4vw,42px); line-height:1.15; letter-spacing:-.04em; }
    h2 { margin:0 0 12px; font-size:22px; } p { margin:8px 0 20px; } .muted, small { color:var(--muted); }
    .card { border:1px solid var(--line); border-radius:20px; background:var(--panel); padding:24px; box-shadow:0 5px 0 #173f6910; }
    .login { max-width:460px; margin:40px auto; } .login h1 { font-size:30px; }
    label { display:block; font-weight:700; margin:16px 0 8px; }
    input[type=password], input[type=text] { width:100%; border:1px solid var(--line); border-radius:12px; background:var(--bg); color:var(--ink); padding:14px; font:inherit; }
    button, .button, .tab { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:10px 18px; border:1px solid var(--line); border-radius:12px; background:var(--panel); color:var(--ink); font:800 15px/1.3 system-ui,sans-serif; text-decoration:none; cursor:pointer; }
    button:hover, .button:hover, .tab:hover { border-color:var(--ink); }
    :focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
    .primary { background:#f39a57; color:#173f69; border-color:#e67842; box-shadow:0 3px 0 #a54b2b; }
    .wide { width:100%; margin-top:20px; } .danger { color:var(--danger); } .danger-fill { background:var(--danger); color:white; border-color:var(--danger); }
    .message { padding:14px 18px; margin:0 0 24px; border:1px solid var(--line); border-left:5px solid #2d8260; border-radius:12px; background:var(--panel); overflow-wrap:anywhere; }
    .error { border-left-color:var(--danger); }
    .topline, .tabs, .actions { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .tabs { justify-content:flex-start; margin:24px 0; } .tab[aria-current=page] { background:var(--ink); color:var(--panel); }
    .summary { display:flex; gap:32px; flex-wrap:wrap; margin:24px 0; } .summary b { display:block; font:900 26px/1.3 monospace; }
    table { border-collapse:collapse; width:100%; text-align:left; font-variant-numeric:tabular-nums; }
    caption.eyebrow { display:table-caption; caption-side:top; text-align:left; margin:12px 0; }
    th { color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
    td, th { padding:14px 10px; border-bottom:1px solid var(--line); } td:first-child, th:first-child { padding-left:0; } td:last-child, th:last-child { text-align:right; padding-right:0; }
    tbody tr:last-child td { border-bottom:0; } .name { font:900 20px monospace; letter-spacing:.1em; } .score { font:800 20px monospace; }
    time { font-size:13px; color:var(--muted); } .empty { padding:32px 0; text-align:center; }
    .maintenance { margin-top:28px; } .maintenance p { max-width:650px; } .actions { justify-content:flex-start; margin-top:20px; }
    footer { margin-top:24px; font-size:13px; color:var(--muted); } .confirmation { max-width:700px; margin:24px auto; }
    .check { display:flex; gap:12px; align-items:flex-start; font-weight:500; } input[type=checkbox] { width:22px; height:22px; flex:none; accent-color:var(--ink); }
    .review-list { list-style:none; margin:16px 0; padding:0; } .review-list li { display:flex; gap:16px; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); }
    @media (max-width:600px) {
      .header-inner { padding:16px; } main { padding:24px 16px 36px; } .card { padding:18px; } .login { margin:24px auto; }
      .brand { font-size:22px; } .header-inner button { padding:10px 12px; } .summary { gap:24px; }
      thead { display:none; } table, tbody { display:block; } tr { display:grid; grid-template-columns:28px 1fr auto; gap:4px 10px; border-bottom:1px solid var(--line); padding:14px 0; align-items:center; }
      caption.eyebrow { display:block; margin:0 0 16px; }
      tbody tr:last-child { border:0; } td { padding:0!important; border:0; } td:nth-child(4) { grid-column:2; } td:nth-child(5) { grid-column:3; grid-row:1 / span 2; } td:nth-child(3) { grid-column:2; grid-row:2; }
      td:nth-child(4) { grid-row:3; } .name,.score { font-size:18px; } td:first-child { grid-row:1 / span 3; color:var(--muted); }
      .actions > * { flex:1 1 auto; } .topline { align-items:flex-start; } .tabs .tab { flex:1; } .review-list li { flex-wrap:wrap; }
    }
    @media (prefers-color-scheme:dark) { :root { color-scheme:dark; --bg:#101b42; --panel:#16284c; --ink:#dce9ff; --line:#dce9ff30; --muted:#afc6e0; --danger:#ffada0; } .danger-fill { background:#a13528; border-color:#a13528; color:white; } .tab[aria-current=page] { color:#101b42; } }
  </style>
</head>
<body>
<header><div class="header-inner">
  <div><div class="brand">DINO <span>RUN</span></div><span class="eyebrow">Private Verwaltung</span></div>
  <?php if ($authenticated && !$unavailable): ?>
  <nav class="account" aria-label="Verwaltung"><a class="button" href="?mode=<?= $mode ?>&amp;view=password">Passwort ändern</a><form method="post"><?php dino_admin_csrf_field(); ?><input type="hidden" name="mode" value="<?= $mode ?>"><input type="hidden" name="action" value="logout"><button type="submit">Abmelden</button></form></nav>
  <?php endif; ?>
</div></header>
<main>
  <?php if ($error !== ''): ?><p class="message error" role="alert"><?= dino_admin_escape($error) ?></p><?php endif; ?>
  <?php if ($notice !== '' && !$unavailable): ?><p class="message" role="status"><?= dino_admin_escape($notice) ?></p><?php endif; ?>
  <?php if ($unavailable): ?>
    <section class="card login"><h1>Verwaltung nicht verfügbar</h1><p>Bitte prüfe die Adresse oder versuche es später erneut.</p></section>
  <?php elseif (!$authenticated): ?>
    <section class="card login" aria-labelledby="login-title">
      <span class="eyebrow">Nur für den Administrator</span><h1 id="login-title">Highscores verwalten</h1>
      <p class="muted">Melde dich an, um Einträge zu prüfen und Ranglisten zu verwalten.</p>
      <form method="post">
        <?php dino_admin_csrf_field(); ?><input type="hidden" name="action" value="login"><input type="hidden" name="mode" value="<?= $mode ?>">
        <input type="hidden" name="username" value="admin" autocomplete="username">
        <label for="password">Administrator-Passwort</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024">
        <button class="primary wide" type="submit">Anmelden</button>
      </form>
      <footer>Die Sitzung endet nach 20 Minuten ohne Aktivität.</footer>
    </section>
  <?php elseif ($passwordPage): ?>
    <section class="card login" aria-labelledby="password-title">
      <span class="eyebrow">Administrator</span><h1 id="password-title">Passwort ändern</h1>
      <p class="muted">Nach dem Speichern werden alle Sitzungen beendet. Melde dich anschließend mit dem neuen Passwort an.</p>
      <form method="post">
        <?php dino_admin_csrf_field(); ?><input type="hidden" name="action" value="change_password"><input type="hidden" name="mode" value="<?= $mode ?>">
        <input type="hidden" name="username" value="admin" autocomplete="username">
        <label for="current-password">Bisheriges Passwort</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" required maxlength="1024">
        <p id="password-help" class="muted">1 bis 72 Zeichen. Erlaubt sind nur Buchstaben (A–Z, a–z) und Zahlen (0–9), keine Leerzeichen oder Sonderzeichen.</p>
        <label for="new-password">Neues Passwort</label><input id="new-password" name="new_password" type="password" autocomplete="new-password" aria-describedby="password-help" required maxlength="72" pattern="[A-Za-z0-9]+">
        <label for="repeat-password">Neues Passwort wiederholen</label><input id="repeat-password" name="repeat_password" type="password" autocomplete="new-password" required maxlength="72" pattern="[A-Za-z0-9]+">
        <button class="primary wide" type="submit">Passwort speichern</button>
        <div class="actions"><a class="button" href="?mode=<?= $mode ?>">Abbrechen</a></div>
      </form>
    </section>
  <?php elseif ($confirmation !== null): ?>
    <section class="card confirmation" aria-labelledby="confirm-title">
      <span class="eyebrow">Bitte prüfen</span>
      <h1 id="confirm-title"><?= $confirmation['action'] === 'remove' ? 'Eintrag löschen?' : 'Rangliste zurücksetzen?' ?></h1>
      <?php if ($confirmation['action'] === 'remove'): $entry = $confirmation['entry']; ?>
        <p>Dieser Eintrag wird aus der Rangliste <strong><?= dino_admin_label($mode) ?></strong> entfernt.</p>
        <ul class="review-list"><li><span class="name"><?= dino_admin_escape($entry['name']) ?></span><span class="score"><?= (int) $entry['score'] ?> Punkte</span></li></ul>
      <?php else: ?>
        <p>Alle Einträge im Bereich <strong><?= dino_admin_label($confirmation['target']) ?></strong> werden gelöscht.</p>
        <?php foreach ($confirmation['target'] === 'all' ? array_keys(DINO_MAX_SPEED) : [$confirmation['target']] as $key): ?>
        <h2><?= dino_admin_label($key) ?> · <?= count($store['lists'][$key]) ?> Einträge</h2>
        <ul class="review-list"><?php foreach ($store['lists'][$key] as $entry): ?><li><span class="name"><?= dino_admin_escape($entry['name']) ?></span><span><?= (int) $entry['score'] ?> Punkte</span></li><?php endforeach; ?></ul>
        <?php endforeach; ?>
      <?php endif; ?>
      <p class="muted">Vor dem Speichern wird automatisch eine Sicherung erstellt.</p>
      <form method="post">
        <?php dino_admin_csrf_field(); ?><input type="hidden" name="mode" value="<?= $mode ?>"><input type="hidden" name="action" value="<?= $confirmation['action'] ?>"><input type="hidden" name="confirmation" value="<?= $confirmation['token'] ?>">
        <?php if ($confirmation['action'] === 'reset'): ?><label for="reset-word">Zur Bestätigung RESET eingeben</label><input id="reset-word" name="reset_word" type="text" required autocomplete="off" spellcheck="false" pattern="RESET"><?php endif; ?>
        <label class="check"><input type="checkbox" name="confirmed" value="yes" required><span>Ich habe die Auswahl geprüft und möchte sie löschen.</span></label>
        <div class="actions"><a class="button" href="?mode=<?= $mode ?>">Abbrechen</a><button class="danger-fill" type="submit">Jetzt endgültig löschen</button></div>
      </form>
    </section>
  <?php else: ?>
    <div class="topline"><div><span class="eyebrow">Highscores</span><h1>Ranglisten verwalten</h1><p class="muted">Prüfe die Top 10 und entferne einzelne Einträge.</p></div></div>
    <nav class="tabs" aria-label="Spielmodus">
      <?php foreach (array_keys(DINO_MAX_SPEED) as $key): ?><a class="tab" href="?mode=<?= $key ?>"<?= $mode === $key ? ' aria-current="page"' : '' ?>><?= dino_admin_label($key) ?></a><?php endforeach; ?>
    </nav>
    <?php if ($store !== null): $entries = $store['lists'][$mode]; ?>
    <section class="card" aria-labelledby="list-title">
      <h2 id="list-title"><?= dino_admin_label($mode) ?></h2>
      <div class="summary"><div><span class="eyebrow">Einträge</span><b><?= count($entries) ?> / 10</b></div><div><span class="eyebrow">Höchster Punktestand</span><b><?= count($entries) ? (int) $entries[0]['score'] : '—' ?></b></div></div>
      <?php if (!$entries): ?><p class="empty">Hier sind noch keine Highscores gespeichert.</p><?php else: ?>
      <table><caption class="eyebrow">Gespeicherte Online-Highscores · <?= dino_admin_label($mode) ?></caption><thead><tr><th scope="col">Platz</th><th scope="col">Name</th><th scope="col">Punkte</th><th scope="col">Zeitpunkt (UTC)</th><th scope="col">Aktion</th></tr></thead><tbody>
      <?php foreach ($entries as $index => $entry): ?><tr>
        <td><?= $index + 1 ?></td><td class="name"><?= dino_admin_escape($entry['name']) ?></td><td class="score"><?= (int) $entry['score'] ?></td>
        <td><time datetime="<?= dino_admin_escape($entry['achievedAt']) ?>"><?= dino_admin_escape(str_replace('T', ' ', substr($entry['achievedAt'], 0, 16))) ?> UTC</time></td>
        <td><form method="post"><?php dino_admin_csrf_field(); ?><input type="hidden" name="action" value="confirm_remove"><input type="hidden" name="mode" value="<?= $mode ?>"><input type="hidden" name="id" value="<?= dino_admin_escape($entry['id']) ?>"><button class="danger" type="submit" aria-label="<?= dino_admin_escape($entry['name']) ?> löschen">Löschen</button></form></td>
      </tr><?php endforeach; ?></tbody></table>
      <?php endif; ?>
    </section>
    <section class="card maintenance" aria-labelledby="reset-title"><h2 id="reset-title">Ranglisten zurücksetzen</h2><p class="muted">Du prüfst die betroffenen Einträge vor dem Löschen. Die andere Rangliste bleibt beim Zurücksetzen eines einzelnen Modus erhalten.</p>
      <div class="actions"><?php foreach ([$mode, 'all'] as $target): ?><form method="post"><?php dino_admin_csrf_field(); ?><input type="hidden" name="action" value="confirm_reset"><input type="hidden" name="mode" value="<?= $mode ?>"><input type="hidden" name="target" value="<?= $target ?>"><button class="danger" type="submit"><?= dino_admin_label($target) ?> zurücksetzen</button></form><?php endforeach; ?></div>
    </section>
    <?php endif; ?>
    <footer>Änderungen betreffen die gespeicherten Server-Ranglisten. Geräteinterne Browser-Rekorde bleiben erhalten. Sicherungen werden auf dem Server aufbewahrt.</footer>
  <?php endif; ?>
</main>
</body>
</html>
