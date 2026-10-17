// Real PHP + browser checks, exclusively against temporary data/config/sessions.
// DINO_PHP selects php.exe; DINO_PLAYWRIGHT and DINO_BROWSER select the browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const php = process.env.DINO_PHP || 'php';
const engine = process.env.DINO_BROWSER || 'chromium';
// Fail on missing tools before creating any private temporary fixture files.
const phpVersion = execFileSync(php, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8', windowsHide: true });
const pw = await import(process.env.DINO_PLAYWRIGHT ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/admin-web'), engine);
fs.mkdirSync(output, { recursive: true });
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-admin-'));
const www = path.join(fixture, 'www'), data = path.join(fixture, 'data'), sessions = path.join(fixture, 'sessions');
for (const dir of [www, data, sessions]) fs.mkdirSync(dir);
for (const file of ['score-console.php', 'admin.php', 'highscores.php', 'highscores-lib.php', 'highscores-admin-lib.php'])
  fs.copyFileSync(path.join(root, file), path.join(www, file));
const secret = randomBytes(24).toString('base64url');
const passwordHash = execFileSync(php, ['-r', 'echo password_hash(stream_get_contents(STDIN), PASSWORD_DEFAULT);'],
  { input: secret, encoding: 'utf8', windowsHide: true });
const phpString = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "\\'") + "'";
const options = path.join(fixture, 'options.json'), config = path.join(fixture, 'config.php');
const settings = value => fs.writeFileSync(options, JSON.stringify({ admin_password_hash: passwordHash, ...value }));
settings({});
fs.writeFileSync(config, `<?php return array_merge(['data_dir'=>${phpString(data)}, 'admin_allow_local_http'=>true], json_decode(file_get_contents(${phpString(options)}),true));`);
const env = { ...process.env, DINO_HIGHSCORES_CONFIG: config, DINO_ADMIN_TEST_ROOT: fixture };
const storeFile = path.join(data, 'highscores.json');
const digest = () => createHash('sha256').update(fs.readFileSync(storeFile)).digest('hex');
const clearThrottle = () => { const file = path.join(data, 'admin-login.php'); if (fs.existsSync(file)) fs.unlinkSync(file); };
const credentialFile = path.join(data, 'admin-password.php');
const clearCredential = () => { if (fs.existsSync(credentialFile)) fs.unlinkSync(credentialFile); };
const entries = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'DINO', score: 900, achievedAt: '2026-10-17T10:00:00Z' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'LUCA', score: 700, achievedAt: '2026-10-17T10:01:00Z' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'MILA', score: 500, achievedAt: '2026-10-17T10:02:00Z' },
];
const initial = { v: 1, lists: { normal: entries, relaxed: [
  { ...entries[0], id: '00000000-0000-4000-8000-000000000004', name: 'TREX', score: 600 },
] }, recent: [{ id: entries[0].id }] };
const seed = () => fs.writeFileSync(storeFile, JSON.stringify(initial, null, 2));
const readStore = () => JSON.parse(fs.readFileSync(storeFile, 'utf8'));
const backups = () => fs.existsSync(path.join(data, 'backups')) ? fs.readdirSync(path.join(data, 'backups')).length : 0;
const run = (file, args = [], extra = {}) => execFileSync(php, [file, ...args],
  { env, encoding: 'utf8', windowsHide: true, ...extra });
const checks = [], layouts = [];
let server, browser, api;
let serverLog = '';
try {
  for (const file of ['score-console.php', 'admin.php', 'highscores-lib.php', 'highscores-admin-lib.php', 'tests/admin-web-unit.php'])
    execFileSync(php, ['-l', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
  assert.match(run(path.join(root, 'tests/admin-web-unit.php'), [], { input: secret }), /checks passed/);
  checks.push('PHP session expiry/hash revocation, moderation, exact backups, revisions, bounded per-IP/global throttle and corrupt-state rejection');
  clearThrottle(); seed();

  // CLI shares the same functions and preserves its existing commands.
  assert.match(run(path.join(www, 'admin.php'), ['list', 'normal']), /DINO/);
  const beforeRemove = readStore(), backupCount = backups();
  assert.match(run(path.join(www, 'admin.php'), ['remove', entries[0].id]), /Removed DINO 900 from normal/);
  assert.equal(backups(), backupCount + 1);
  assert.equal(readStore().lists.normal.length, 2);
  assert.deepEqual(readStore().lists.relaxed, beforeRemove.lists.relaxed);
  assert.deepEqual(readStore().recent, beforeRemove.recent);
  const beforeCancel = digest();
  assert.throws(() => run(path.join(www, 'admin.php'), ['reset', 'all'], { input: 'NO\n', stdio: ['pipe', 'pipe', 'pipe'] }));
  assert.equal(digest(), beforeCancel);
  run(path.join(www, 'admin.php'), ['reset', 'normal', '--yes']);
  assert.equal(readStore().lists.normal.length, 0);
  assert.equal(readStore().lists.relaxed.length, 1);
  const beforePassword = digest();
  const generated = run(path.join(www, 'admin.php'), ['create-password']);
  const generatedPassword = generated.split(/\r?\n/)[1];
  const generatedHash = generated.match(/'admin_password_hash' => '([^']+)'/)[1];
  assert.equal(execFileSync(php, ['-r', '$v=json_decode(stream_get_contents(STDIN),true);echo password_verify($v[0],$v[1])?"ok":"bad";'],
    { input: JSON.stringify([generatedPassword, generatedHash]), encoding: 'utf8', windowsHide: true }), 'ok');
  assert.equal(digest(), beforePassword, 'Password generation does not mutate scores');
  checks.push('CLI list/remove/reset/cancellation/create-password');

  // Competing resets serialize on the real storage lock; only the reviewed
  // version can be deleted. An unavailable backup must leave scores intact.
  seed();
  const worker = path.join(fixture, 'reset-worker.php');
  fs.writeFileSync(worker, `<?php define('DINO_HIGHSCORES',true); require ${phpString(path.join(www, 'highscores-lib.php'))};require ${phpString(path.join(www, 'highscores-admin-lib.php'))};try{dino_admin_reset('normal',$argv[1]);echo 'ok';}catch(DinoHttpError $e){echo $e->status;}`);
  const revision = execFileSync(php, ['-r', `define('DINO_HIGHSCORES',true);require ${phpString(path.join(www, 'highscores-lib.php'))};require ${phpString(path.join(www, 'highscores-admin-lib.php'))};echo dino_admin_revision(dino_read_store(),'normal');`], { env, encoding: 'utf8', windowsHide: true });
  const concurrent = await Promise.all([1, 2].map(() => promisify(execFile)(php, [worker, revision], { env, windowsHide: true })));
  assert.deepEqual(concurrent.map(r => r.stdout).sort(), ['409', 'ok']);
  seed();
  fs.renameSync(path.join(data, 'backups'), path.join(data, 'saved-backups'));
  fs.writeFileSync(path.join(data, 'backups'), 'unavailable');
  const beforeFailure = digest();
  assert.throws(() => run(path.join(www, 'admin.php'), ['remove', entries[0].id], { stdio: ['pipe', 'pipe', 'pipe'] }));
  assert.equal(digest(), beforeFailure);
  fs.unlinkSync(path.join(data, 'backups'));
  fs.renameSync(path.join(data, 'saved-backups'), path.join(data, 'backups'));
  checks.push('Concurrent reset conflict and fail-closed backup failure');

  const router = path.join(fixture, 'router.php');
  // TLS state simulation is confined to this generated test router. It checks
  // cookie flags, not actual encrypted transport; production never trusts XFP.
  fs.writeFileSync(router, `<?php if(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)==='/tls/score-console.php'){$_SERVER['HTTPS']='on';require ${phpString(path.join(www, 'score-console.php'))};return true;}return false;`);
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`, url = origin + '/score-console.php';
  server = spawn(php, ['-d', 'display_errors=0', '-d', 'session.save_path=' + sessions, '-S', `127.0.0.1:${port}`, '-t', www, router],
    { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.on('error', error => { serverLog += String(error); });
  server.stdout.on('data', chunk => { serverLog += chunk; });
  server.stderr.on('data', chunk => { serverLog += chunk; });
  for (let i = 0; i < 80; i++) {
    try { await fetch(url); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  api = await pw.request.newContext();
  const csrf = html => { const match = html.match(/name="csrf" value="([a-f0-9]{64})"/); assert(match, 'CSRF field'); return match[1]; };
  const post = (client, form, headers = {}) => client.post(url, { form, headers, maxRedirects: 0 });
  const login = async (client, password = secret) => {
    const form = await client.get(url);
    const response = await post(client, { action: 'login', mode: 'normal', csrf: csrf(await form.text()), password });
    assert.equal(response.status(), 303);
    return response;
  };
  settings({ admin_password_hash: '' });
  assert.equal((await api.get(url)).status(), 404);
  settings({ admin_allow_local_http: false });
  assert.equal((await api.get(url, { headers: { 'X-Forwarded-Proto': 'https' } })).status(), 403);
  const tls = await api.get(origin + '/tls/score-console.php');
  assert.equal(tls.status(), 200);
  assert.match(tls.headers()['set-cookie'], /secure/i);
  assert.match(tls.headers()['set-cookie'], /HttpOnly/i);
  assert.match(tls.headers()['set-cookie'], /SameSite=Strict/i);
  settings({});
  for (const file of ['admin.php', 'highscores-admin-lib.php', 'highscores-lib.php'])
    assert.equal((await api.get(origin + '/' + file)).status(), 404);
  assert.equal((await api.get(origin + '/data/highscores.json')).status(), 404);
  assert.equal((await api.fetch(url, { method: 'PUT' })).status(), 405);
  assert.equal((await api.post(url, { data: 'x'.repeat(5000) })).status(), 413);
  const untouched = digest();
  assert.equal((await post(api, { action: 'remove', mode: 'normal', id: entries[0].id })).status(), 401);
  const anonymous = await api.get(url), anonymousHtml = await anonymous.text();
  assert(!anonymousHtml.includes('DINO</td>'));
  assert(!anonymousHtml.includes(secret) && !anonymousHtml.includes(passwordHash), 'No credential disclosure');
  assert.match(anonymous.headers()['cache-control'], /no-store/);
  assert.match(anonymous.headers()['content-security-policy'], /script-src 'none'/);
  assert.match(anonymous.headers()['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(anonymous.headers()['referrer-policy'], 'no-referrer');
  assert.equal((await post(api, { action: 'login', mode: 'normal', password: secret, csrf: 'bad' })).status(), 403);
  assert.equal(digest(), untouched);
  assert.equal((await post(api, { action: 'change_password', mode: 'normal', current_password: secret,
    new_password: secret, repeat_password: secret })).status(), 401);
  assert(!fs.existsSync(credentialFile));
  checks.push('Disabled-by-default, HTTPS guard/XFP spoof denial, secure cookie flags, private headers, direct-file/anonymous/method/body/CSRF guards');

  clearThrottle();
  for (let i = 0; i < 5; i++) {
    const client = await pw.request.newContext();
    const token = csrf(await (await client.get(url)).text());
    assert.equal((await post(client, { action: 'login', mode: 'normal', csrf: token, password: 'wrong' })).status(), 401);
    await client.dispose();
  }
  const blockedToken = csrf(await (await api.get(url)).text());
  const blocked = await post(api, { action: 'login', mode: 'normal', csrf: blockedToken, password: secret }, { 'X-Forwarded-For': '192.0.2.99' });
  assert.equal(blocked.status(), 429); assert(Number(blocked.headers()['retry-after']) > 0);
  checks.push('Persistent login throttle across fresh cookies and spoofed forwarded IP');
  clearThrottle();
  const beforeCookie = (await api.storageState()).cookies.find(c => c.name === 'DinoScoreAdmin' && c.path === '/').value;
  await login(api);
  const afterCookie = (await api.storageState()).cookies.find(c => c.name === 'DinoScoreAdmin' && c.path === '/').value;
  assert.notEqual(afterCookie, beforeCookie, 'Rotate ID after authentication');
  let html = await (await api.get(url)).text(), token = csrf(html);
  assert.match(html, /DINO<\/td>/);
  assert.equal((await post(api, { action: 'remove', mode: 'normal', csrf: token, confirmed: 'yes' })).status(), 403);
  assert.equal((await post(api, { action: 'confirm_remove', mode: 'normal', csrf: 'bad', id: entries[0].id })).status(), 403);
  assert.equal((await post(api, { action: 'logout', mode: 'normal', csrf: token }, { 'Sec-Fetch-Site': 'cross-site' })).status(), 403);
  assert.equal(digest(), untouched);
  const review = await post(api, { action: 'confirm_reset', target: 'normal', mode: 'normal', csrf: token });
  const confirmation = (await review.text()).match(/name="confirmation" value="([a-f0-9]+)"/)[1];
  const changed = readStore(); changed.lists.normal[0].score++;
  fs.writeFileSync(storeFile, JSON.stringify(changed));
  const changedDigest = digest();
  assert.equal((await post(api, { action: 'reset', mode: 'normal', csrf: token, confirmation, confirmed: 'yes', reset_word: 'RESET' })).status(), 409);
  assert.equal(digest(), changedDigest);
  seed();
  const currentId = (await api.storageState()).cookies.find(c => c.name === 'DinoScoreAdmin' && c.path === '/').value;
  execFileSync(php, ['-r', 'session_name("DinoScoreAdmin");session_save_path($argv[2]);session_id($argv[1]);session_start();$_SESSION["admin_seen"]=time()-1200;session_write_close();', currentId, sessions], { windowsHide: true });
  html = await (await api.get(url)).text();
  assert.match(html, /Sitzung ist abgelaufen/); assert.match(html, /id="password"/); assert(!html.includes('DINO</td>'));
  await login(api);
  settings({ admin_password_hash: execFileSync(php, ['-r', 'echo password_hash("different-test-only-value",PASSWORD_DEFAULT);'], { encoding: 'utf8', windowsHide: true }) });
  assert.match(await (await api.get(url)).text(), /id="password"/);
  settings({});
  checks.push('Session-ID rotation, required action review, CSRF/cross-site denial, stale-list conflict, real HTTP idle expiry and password-change revocation');
  const publicApi = await api.get(origin + '/highscores.php?v=1&mode=normal');
  assert.equal(publicApi.status(), 200);
  assert((await publicApi.json()).entries.some(e => e.name === 'DINO'));
  checks.push('Existing public highscore API still serves the isolated store');

  // Exercise real password changes across independent sessions and requests.
  clearThrottle();
  await login(api);
  const peer = await pw.request.newContext();
  await login(peer);
  const passwordBeforeScores = digest(), configBefore = fs.readFileSync(config, 'utf8');
  let passwordToken = csrf(await (await api.get(url + '?view=password')).text());
  const newSecret = 'Zx' + randomBytes(3).toString('hex'); // Eight characters: short-password regression.
  const changeForm = { action: 'change_password', mode: 'normal', csrf: passwordToken,
    current_password: secret, new_password: newSecret, repeat_password: newSecret };
  assert.equal((await post(api, { ...changeForm, csrf: 'bad' })).status(), 403);
  assert.equal((await post(api, changeForm, { 'Sec-Fetch-Site': 'cross-site' })).status(), 403);
  assert(!fs.existsSync(credentialFile));
  for (let i = 0; i < 5; i++) {
    clearThrottle();
    const invalid = [ { current_password: 'wrong' }, { repeat_password: 'different' },
      { new_password: '', repeat_password: '' },
      { new_password: 'Ab!12', repeat_password: 'Ab!12' },
      { new_password: secret, repeat_password: secret } ][i];
    const rejected = await post(api, { ...changeForm, ...invalid });
    assert.equal(rejected.status(), 400);
    const rejectedHtml = await rejected.text();
    assert.match(rejectedHtml, /id="current-password"/);
    for (const value of [secret, newSecret]) assert(!rejectedHtml.includes(value), 'Do not echo passwords');
    assert(!fs.existsSync(credentialFile));
  }
  clearThrottle();
  for (let i = 0; i < 5; i++)
    assert.equal((await post(api, { ...changeForm, current_password: 'wrong' })).status(), 400);
  assert.equal((await post(api, changeForm)).status(), 429, 'Password reauthentication is rate limited');
  assert(!fs.existsSync(credentialFile));
  clearThrottle();
  assert.equal((await post(api, changeForm)).status(), 303);
  const savedCredential = fs.readFileSync(credentialFile, 'utf8');
  assert.match(savedCredential, /^<\?php exit; \?>\n/);
  assert(!savedCredential.includes(secret) && !savedCredential.includes(newSecret));
  if (process.platform !== 'win32') assert.equal(fs.statSync(credentialFile).mode & 0o777, 0o600);
  const guardedCopy = path.join(www, 'guarded-password-test.php');
  fs.copyFileSync(credentialFile, guardedCopy);
  const guardedResponse = await api.get(origin + '/guarded-password-test.php');
  assert.equal(guardedResponse.status(), 200);
  assert.equal(await guardedResponse.text(), '', 'PHP guard hides credential even if web-served');
  fs.unlinkSync(guardedCopy);
  assert.match(await (await api.get(url)).text(), /Passwort geändert/);
  assert.match(await (await peer.get(url)).text(), /id="password"/, 'Other sessions revoked');
  assert.equal((await post(peer, changeForm)).status(), 401, 'Stale authenticated POST rejected');
  passwordToken = csrf(await (await api.get(url)).text());
  assert.equal((await post(api, { action: 'login', mode: 'normal', csrf: passwordToken, password: secret })).status(), 401);
  await login(api, newSecret);
  assert.match(await (await api.get(url)).text(), /Ranglisten verwalten/);
  assert.equal(digest(), passwordBeforeScores, 'Credential change preserves scores');
  assert.equal(fs.readFileSync(config, 'utf8'), configBefore, 'No rewriting PHP config');
  settings({ admin_password_hash: '' });
  assert.equal((await api.get(url)).status(), 404, 'Config can still disable saved credentials');
  settings({ admin_password_hash: generatedHash });
  clearThrottle();
  await login(peer, generatedPassword);
  assert.match(await (await api.get(url)).text(), /id="password"/, 'Config recovery revokes saved-password session');
  settings({}); clearCredential(); clearThrottle();
  await peer.dispose();

  // Two independent PHP workers cannot overwrite a concurrently changed hash.
  const passwordWorker = path.join(fixture, 'password-worker.php');
  fs.writeFileSync(passwordWorker, `<?php define('DINO_HIGHSCORES',true);require ${phpString(path.join(www, 'highscores-lib.php'))};require ${phpString(path.join(www, 'highscores-admin-lib.php'))};$v=json_decode(stream_get_contents(STDIN),true);try{dino_admin_change_password($v[0],$v[1],$v[2],$v[2]);echo 'ok';}catch(DinoHttpError $e){echo $e->status;}catch(Throwable $e){echo '503';}`);
  const changeWorker = () => new Promise((resolve, reject) => {
    const child = spawn(php, [passwordWorker], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let result = '', stderr = '';
    child.stdout.on('data', b => { result += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(result) : reject(new Error('Password worker failed: ' + stderr)));
    child.stdin.end(JSON.stringify([passwordHash, secret, newSecret]));
  });
  assert.deepEqual((await Promise.all([changeWorker(), changeWorker()])).sort(), ['401', 'ok']);
  const beforeFailedWrite = fs.readFileSync(credentialFile, 'utf8');
  const persistedHash = JSON.parse(beforeFailedWrite.split('\n')[1]).password_hash;
  // Disable replacement in this one isolated worker, after verification and
  // temporary writing. An actual storage failure must retain the previous hash.
  const failedWrite = execFileSync(php, ['-d', 'disable_functions=rename', passwordWorker],
    { env, input: JSON.stringify([persistedHash, newSecret, randomBytes(24).toString('hex')]),
      encoding: 'utf8', windowsHide: true });
  assert.equal(failedWrite, '503');
  assert.equal(fs.readFileSync(credentialFile, 'utf8'), beforeFailedWrite);
  assert(!fs.readdirSync(data).some(file => file.startsWith('.admin-password-')), 'Failed write cleans temporary secret');
  assert.equal(digest(), passwordBeforeScores);
  clearCredential(); clearThrottle();
  checks.push('Short alphanumeric password validation/bounds, guarded atomic hash persistence/failure, reauthentication throttle, CSRF, all-session revocation, old/new login, config recovery/disable, concurrent-change conflict, unchanged scores/config');

  clearThrottle();
  browser = await pw[engine].launch({ headless: true });
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }], ['small', { width: 320, height: 568 }]]) {
    seed(); clearCredential(); clearThrottle();
    const context = await browser.newContext({ viewport, javaScriptEnabled: false,
      ...(name === 'desktop' ? {} : { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }),
      colorScheme: name === 'landscape' ? 'dark' : 'light' });
    await context.route('**/*', route => {
      const target = new URL(route.request().url());
      if (target.origin !== origin) return route.abort();
      if (target.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    let phase = 'navigation';
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push({ text: m.text(), location: m.location(), phase }); });
    await page.goto(url);
    // Keep the natural caret. WebKit also injects an empty body{} stylesheet
    // for animation synchronization; the strict CSP correctly rejects that.
    phase = 'login screenshot';
    await page.screenshot({ path: path.join(output, `${name}-login.png`), fullPage: true, caret: 'initial' });
    phase = 'login form';
    await page.getByLabel('Administrator-Passwort').fill(secret);
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.getByRole('heading', { name: 'Ranglisten verwalten' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No horizontal overflow');
    phase = 'normal screenshot';
    await page.screenshot({ path: path.join(output, `${name}-normal.png`), fullPage: true, caret: 'initial' });
    phase = 'delete review and cancel';
    await page.getByRole('button', { name: 'DINO löschen', exact: true }).click();
    await page.getByRole('heading', { name: 'Eintrag löschen?' }).waitFor();
    await page.getByRole('link', { name: 'Abbrechen', exact: true }).click();
    assert.equal(readStore().lists.normal.length, 3);
    await page.getByRole('button', { name: 'DINO löschen', exact: true }).click();
    const reviewToken = await page.locator('input[name=confirmation]').inputValue();
    const sessionCsrf = await page.locator('input[name=csrf]').first().inputValue();
    phase = 'confirm screenshot';
    await page.screenshot({ path: path.join(output, `${name}-confirm.png`), fullPage: true, caret: 'initial' });
    phase = 'delete and reset';
    await page.getByRole('checkbox').check();
    const count = backups();
    await page.getByRole('button', { name: 'Jetzt endgültig löschen' }).click();
    await page.getByRole('status').waitFor();
    assert.equal(readStore().lists.normal.length, 2); assert.equal(backups(), count + 1);
    assert.equal((await post(context.request, { action: 'remove', mode: 'normal', csrf: sessionCsrf, confirmation: reviewToken, confirmed: 'yes' })).status(), 403);
    assert.equal(readStore().lists.normal.length, 2, 'Replay cannot repeat deletion');
    await page.getByRole('button', { name: 'Normal zurücksetzen', exact: true }).click();
    await page.getByLabel('Zur Bestätigung RESET eingeben').fill('RESET');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Jetzt endgültig löschen' }).click();
    await page.getByText('Hier sind noch keine Highscores gespeichert.').waitFor();
    assert.equal(readStore().lists.relaxed.length, 1);
    await page.getByRole('link', { name: 'Relaxed', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 1);
    phase = 'relaxed screenshot';
    await page.screenshot({ path: path.join(output, `${name}-relaxed.png`), fullPage: true, caret: 'initial' });
    phase = 'reset all and logout';
    await page.getByRole('button', { name: 'Beide Ranglisten zurücksetzen', exact: true }).click();
    const resetToken = await page.locator('input[name=confirmation]').inputValue();
    const invalid = await post(context.request, { action: 'reset', mode: 'relaxed', csrf: sessionCsrf, confirmation: resetToken, confirmed: 'yes', reset_word: 'NO' });
    assert.equal(invalid.status(), 400); assert.equal(readStore().lists.relaxed.length, 1);
    await page.getByLabel('Zur Bestätigung RESET eingeben').fill('RESET');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Jetzt endgültig löschen' }).click();
    await page.getByText('Hier sind noch keine Highscores gespeichert.').waitFor();
    assert.deepEqual(readStore().lists, { normal: [], relaxed: [] });
    phase = 'password form';
    await page.getByRole('link', { name: 'Passwort ändern', exact: true }).click();
    await page.getByRole('heading', { name: 'Passwort ändern', exact: true }).waitFor();
    assert.equal(await page.locator('input[type=password]').count(), 3);
    assert.equal(await page.locator('#new-password').getAttribute('minlength'), null);
    assert.equal(await page.locator('#new-password').getAttribute('pattern'), '[A-Za-z0-9]+');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    phase = 'password screenshot';
    await page.screenshot({ path: path.join(output, `${name}-password.png`), fullPage: true, caret: 'initial' });
    phase = 'password cancel';
    await page.getByRole('link', { name: 'Abbrechen', exact: true }).click();
    assert(!fs.existsSync(credentialFile));
    await page.getByRole('link', { name: 'Passwort ändern', exact: true }).click();
    await page.getByLabel('Bisheriges Passwort', { exact: true }).fill(secret);
    await page.getByLabel('Neues Passwort', { exact: true }).fill('Ab!12');
    assert.equal(await page.locator('#new-password').evaluate(input => input.validity.patternMismatch), true);
    await page.getByLabel('Neues Passwort', { exact: true }).fill(newSecret);
    await page.getByLabel('Neues Passwort wiederholen', { exact: true }).fill(newSecret);
    await page.getByRole('button', { name: 'Passwort speichern', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Passwort geändert' }).waitFor();
    await page.getByLabel('Administrator-Passwort').fill(newSecret);
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.getByRole('heading', { name: 'Ranglisten verwalten' }).waitFor();
    await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
    await page.getByLabel('Administrator-Passwort').waitFor();
    const isScreenshotCsp = error => engine === 'webkit' && typeof error === 'object'
      && error.phase.endsWith(' screenshot')
      && error.text === "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy."
      && new URL(error.location.url).origin === origin && error.location.lineNumber === 0;
    const screenshotBlocks = errors.filter(isScreenshotCsp);
    const unexpected = errors.filter(error => !isScreenshotCsp(error));
    assert.deepEqual(unexpected, []);
    assert.equal(screenshotBlocks.length, engine === 'webkit' ? 5 : 0,
      'Only the five identified empty screenshot-helper styles may be rejected');
    layouts.push({ name, viewport, javascriptDisabled: true, checks: 'passed', browserErrors: unexpected,
      screenshotHarnessCspRejections: screenshotBlocks.map(error => error.phase) });
    await context.close();
  }
  assert(!/PHP (?:Warning|Fatal|Parse|Deprecated)|Uncaught/.test(serverLog), 'No PHP errors');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ engine, browser: browser.version(),
    php: phpVersion,
    checks, layouts, isolatedData: true, liveRequests: false, credentialsIncluded: false }, null, 2));
  console.log(`${engine}: PHP/web moderation security checks and ${layouts.length} responsive no-JavaScript layouts passed`);
} finally {
  await browser?.close(); await api?.dispose();
  if (server) { server.kill(); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); }); }
  fs.writeFileSync(path.join(output, 'php-server.log'), serverLog);
  const resolved = path.resolve(fixture);
  assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('dino-admin-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
