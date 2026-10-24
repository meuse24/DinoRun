// Real local-preview asset delivery and a pure deployment plan; no live service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import hosted from '../scripts/lib/hosted-assets.cjs';

const root = path.resolve(import.meta.dirname, '..');
const plan = hosted.deploymentFiles(['highscores-lib.php', hosted.MEDIA_ASSETS[0]]);
assert.equal(new Set(plan.map(file => file.remote)).size, plan.length);
assert.deepEqual(plan.slice(-2), [
  { local: 'release/dino.html', remote: 'dino.html' },
  { local: 'service-worker.js', remote: 'service-worker.js' },
]);
for (const asset of [...hosted.MEDIA_ASSETS, 'manifest.webmanifest', 'highscores-lib.php']) {
  const index = plan.findIndex(file => file.remote === asset);
  assert(index >= 0 && index < plan.length - 2, asset + ' precedes HTML/worker');
}
for (const forbidden of ['ftp.txt', 'highscores.config.php', '../dino.html', 'asset-sources/audio/Theme_song2.wav'])
  assert.throws(() => hosted.deploymentFiles([forbidden]), /Not an allowed extra file/);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
for (const icon of manifest.icons) assert(hosted.MEDIA_ASSETS.includes(icon.src.replace(/^\.\//, '')));
const nativeManifest = JSON.parse(fs.readFileSync(path.join(root, 'dino-android/app/src/main/res/raw/web_app_manifest.json')));
assert.deepEqual(nativeManifest.icons, manifest.icons);
const twa = JSON.parse(fs.readFileSync(path.join(root, 'dino-android/twa-manifest.json')));
for (const key of ['iconUrl', 'maskableIconUrl'])
  assert.equal(new URL(twa[key]).pathname, '/apps/dino/assets/images/icon-512.png');

const reserve = http.createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const server = spawn(process.execPath, ['dev-server.js'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DINO_DEV_PORT: String(port) },
});
const stopped = new Promise(resolve => server.once('exit', resolve));
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Preview startup timeout')), 10000);
    server.stdout.on('data', data => { if (String(data).includes('preview:')) { clearTimeout(timer); resolve(); } });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Preview exited: ' + code)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const asset of hosted.MEDIA_ASSETS) {
    const response = await fetch(`${origin}/${asset}`);
    assert.equal(response.status, 200, asset);
    assert.match(response.headers.get('content-type'), /^(image\/(png|svg\+xml)|audio\/mpeg)/);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(fs.readFileSync(path.join(root, asset))));
    const head = await fetch(`${origin}/${asset}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), fs.statSync(path.join(root, asset)).size);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
  for (const hidden of ['/asset-sources/audio/Theme_song2.wav', '/doc/README.md', '/assets/scripts/deploy.mjs', '/assets/images/../../highscores.config.php'])
    assert.equal((await fetch(origin + hidden)).status, 404, hidden);
  const state = await fetch(origin + '/dino.html');
  assert.equal(state.status, 200);
  console.log('All 7 hosted media assets: exact GET bytes, MIME and HEAD; private paths blocked; deployment order/allowlist passed.');
} finally {
  server.kill();
  await stopped;
}
