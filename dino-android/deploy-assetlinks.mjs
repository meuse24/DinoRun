// Publish only this application's public Digital Asset Links statement.
// The game, service worker and private signing files are never uploaded here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = import.meta.dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'twa-manifest.json'), 'utf8'));
const assetFile = path.join(root, 'assetlinks.json');
const local = JSON.parse(fs.readFileSync(assetFile, 'utf8'));
assert.equal(manifest.host, 'meuse24.info');
assert.equal(manifest.packageId, 'info.meuse24.dinorun');
assert(local.some(s => s.target?.package_name === manifest.packageId));
const publicUrl = `https://${manifest.host}/.well-known/assetlinks.json`;
const response = await fetch(publicUrl, { redirect: 'error', cache: 'no-store' });
assert(response.ok || response.status === 404, `Unexpected asset links status ${response.status}`);
const existing = response.ok ? await response.json() : [];
assert(Array.isArray(existing), 'Existing assetlinks.json must contain an array');
const merged = [...existing];
for (const entry of local) {
  const match = merged.find(s => s.target?.namespace === entry.target.namespace &&
    s.target?.package_name === entry.target.package_name &&
    JSON.stringify(s.relation) === JSON.stringify(entry.relation));
  if (match) {
    match.target.sha256_cert_fingerprints = [...new Set([
      ...match.target.sha256_cert_fingerprints, ...entry.target.sha256_cert_fingerprints,
    ])];
  } else merged.push(entry);
}
const content = JSON.stringify(merged, null, 2) + '\n';
fs.writeFileSync(assetFile, content);
if (!process.argv.includes('--publish')) {
  console.log(`Prepared ${assetFile}; use --publish to upload to ${publicUrl}`);
  process.exit(0);
}
const lines = fs.readFileSync(path.join(root, '..', 'ftp.txt'), 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const field = name => lines.find(l => new RegExp(`^${name}\\s*[:=]`, 'i').test(l))
  ?.replace(/^[^:=]*[:=]\s*/, '');
const host = field('server|host');
const user = field('username|user|benutzer');
const password = field('passwort|password|pass');
assert(host && user && password, 'FTP configuration incomplete');
const quote = s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const result = spawnSync('curl.exe', [
  '--silent', '--show-error', '--fail', '--ssl-reqd', '--ftp-create-dirs',
  '--connect-timeout', '20', '--max-time', '90', '-K', '-',
  '-T', assetFile, `ftp://${host}/.well-known/assetlinks.json`,
], { input: `user = ${quote(`${user}:${password}`)}\n`, encoding: 'utf8' });
assert.equal(result.status, 0, `FTPS upload failed: ${result.stderr.trim()}`);
const verified = await fetch(publicUrl, { redirect: 'error', cache: 'no-store' });
assert(verified.ok, `Verification HTTP ${verified.status}`);
assert(/application\/json/i.test(verified.headers.get('content-type') || ''), 'Expected application/json');
const remote = Buffer.from(await verified.arrayBuffer());
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(remote), hash(content), 'HTTPS content differs from uploaded file');
console.log(`Published and SHA-256 verified ${publicUrl}`);
