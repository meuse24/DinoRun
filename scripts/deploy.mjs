// Upload the generated delivery to the web server. Not part of `npm run build`.
// Credentials come from the git-ignored ftp.txt and never appear in arguments.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const dryRun = flag('--dry-run');
const plainFtp = flag('--plain-ftp');
const force = flag('--force');
const also = args.flatMap((arg, i) => (arg === '--also' ? [args[i + 1]] : []));
// Files that may accompany a release. Config, data, secrets and tests never do.
const OPTIONAL = new Set([
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'dino.png', 'dino.svg',
  'dino-jump-jump.mp3', 'dino-boom-in-the-dunes.mp3',
  'highscores.php', 'highscores-lib.php', 'highscores-admin-lib.php', 'admin.php', 'score-console.php',
]);

const sha256 = data => createHash('sha256').update(data).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));

// ftp.txt: first line is the game URL, then "Server:", "Username:", "Passwort:".
const lines = fs.readFileSync(path.join(root, 'ftp.txt'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const field = name => lines.find(l => new RegExp(`^${name}\\s*[:=]`, 'i').test(l))?.replace(/^[^:=]*[:=]\s*/, '');
const gameUrl = new URL(lines.find(l => /^https:\/\//i.test(l)));
const host = field('server|host');
const user = field('username|user|benutzer');
const password = field('passwort|password|pass');
assert(host && user && password, 'ftp.txt needs Server, Username and Passwort lines');
const remoteDir = gameUrl.pathname.replace(/\/[^/]*$/, '').replace(/^\/+|\/+$/g, '');
const baseUrl = new URL('./', gameUrl).href;

// Pre-flight: the delivery must belong to the current source and worker.
const source = read('dino.html').toString('utf8');
const build = source.match(/const BUILD = '([^']+)'/)?.[1];
const cache = read('service-worker.js').toString('utf8').match(/CACHE_NAME = '([^']+)'/)?.[1];
assert(build && cache, 'BUILD or CACHE_NAME not found');
assert(read('release/dino.html').toString('utf8').includes(build),
  `release/dino.html does not contain BUILD ${build}; run npm run build`);
assert(fs.statSync(path.join(root, 'release/dino.html')).mtimeMs >= fs.statSync(path.join(root, 'dino.html')).mtimeMs,
  'release/dino.html is older than dino.html; run npm run build');
for (const name of also) assert(OPTIONAL.has(name) && fs.existsSync(path.join(root, name)), `Not an allowed extra file: ${name}`);

// Order matters: assets and HTML first, the worker last, so no mismatched cache is installed.
const uploads = [
  ...also.map(name => ({ local: name, remote: name })),
  { local: 'release/dino.html', remote: 'dino.html' },
  { local: 'service-worker.js', remote: 'service-worker.js' },
];

const live = await fetch(new URL('service-worker.js', baseUrl) + '?t=' + Date.now(), { cache: 'no-store' }).catch(() => null);
const liveCache = live?.ok ? (await live.text()).match(/CACHE_NAME = '([^']+)'/)?.[1] : null;
console.log(`Build ${build}, cache ${cache}; live cache ${liveCache ?? 'unknown'}; target ftp://${host}/${remoteDir}/`);
for (const { local, remote } of uploads) console.log(`  ${local} -> ${remote} (${read(local).length} bytes)`);
if (liveCache === cache && !force) {
  console.log('Live worker already has this cache version; bump BUILD/CACHE_NAME or pass --force.');
  process.exit(1);
}
if (dryRun) { console.log('Dry run: nothing uploaded.'); process.exit(0); }

const quote = text => '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
for (const { local, remote } of uploads) {
  const config = `user = ${quote(`${user}:${password}`)}\n`; // stdin: keeps the password out of the process list
  const result = spawnSync('curl', [
    '--silent', '--show-error', '--fail', '--ftp-create-dirs', ...(plainFtp ? [] : ['--ssl-reqd']),
    '-K', '-', '-T', path.join(root, local), `ftp://${host}/${remoteDir}/${remote}`,
  ], { input: config, encoding: 'utf8' });
  assert.equal(result.status, 0, `Upload of ${remote} failed: ${result.stderr.trim()}`);
  console.log(`Uploaded ${remote}`);
}

// Verify by hash over HTTPS (the server may need a moment to serve the new file).
for (const { local, remote } of uploads.filter(u => /\.(html|js)$/.test(u.remote))) {
  const expected = sha256(read(local));
  let actual;
  for (let attempt = 0; attempt < 5 && actual !== expected; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 2000));
    const response = await fetch(new URL(remote, baseUrl) + '?t=' + Date.now(), { cache: 'no-store' });
    actual = sha256(Buffer.from(await response.arrayBuffer()));
  }
  assert.equal(actual, expected, `${remote} on the server differs from ${local}`);
  console.log(`Verified ${remote} ${expected.slice(0, 12)}`);
}
