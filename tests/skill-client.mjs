// Run the installed develop-web-game client against a safe deterministic fixture.
// Uses the actual skill script; the import hook only locates installed Playwright.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const skillRoot = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills/develop-web-game');
const client = path.join(skillRoot, 'scripts/web_game_playwright_client.js');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/refactoring'), 'skill-client');
fs.mkdirSync(output, { recursive: true });
for (const name of fs.readdirSync(output).filter(name => /^errors-\d+\.json$/.test(name)))
  fs.unlinkSync(path.join(output, name));
const fixture = fs.readFileSync(path.join(root, 'dino.html'), 'utf8').replace('<script>', `<script>
  localStorage.setItem('dino-fullscreen-disabled', 'true');
  const audio = new EventTarget();
  audio.pause = () => {};
  audio.play = () => Promise.resolve();
  window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio: audio };
</script><script>`);
const types = { '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (name === 'dino.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(fixture);
  } else if (name === path.basename(name) && types[path.extname(name)] && fs.existsSync(path.join(root, name))) {
    response.writeHead(200, { 'Content-Type': types[path.extname(name)] });
    fs.createReadStream(path.join(root, name)).pipe(response);
  } else response.writeHead(404).end();
});
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-skill-'));
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const args = [];
  if (process.env.DINO_PLAYWRIGHT) {
    const loader = path.join(temporary, 'playwright.mjs');
    fs.writeFileSync(loader, `import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        return specifier === 'playwright'
          ? { url: ${JSON.stringify(pathToFileURL(process.env.DINO_PLAYWRIGHT).href)}, shortCircuit: true }
          : next(specifier, context);
      }});`);
    args.push('--import', pathToFileURL(loader).href);
  }
  args.push(client, '--url', `http://127.0.0.1:${server.address().port}/dino.html`,
    '--actions-json', JSON.stringify({ steps: [
      { buttons: ['space'], frames: 3 },
      { buttons: [], frames: 100 },
      { buttons: ['down'], frames: 12 },
      { buttons: [], frames: 8 },
      { buttons: ['space'], frames: 5 },
      { buttons: [], frames: 5 },
    ] }), '--iterations', '2', '--pause-ms', '150', '--screenshot-dir', output);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (exitCode !== 0) throw new Error(`Skill client exited ${exitCode}`);
  const errorFiles = fs.readdirSync(output).filter(name => /^errors-\d+\.json$/.test(name));
  if (errorFiles.length) throw new Error(`Inspect skill client errors: ${errorFiles.join(', ')}`);
  const state = JSON.parse(fs.readFileSync(path.join(output, 'state-1.json'), 'utf8'));
  assert.equal(state.state, 'playing');
  assert.equal(state.paused, false);
  assert(state.score > 0, 'The action bursts must advance beyond the opening clear time');
  console.log(`Skill client passed; screenshots and state: ${output}`);
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
