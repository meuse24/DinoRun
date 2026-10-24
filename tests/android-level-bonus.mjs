import { loadPlaywright } from './helpers/playwright.mjs';
// Physical Android level bonus: own server/tab, trusted touch, real rAF/audio.
// Requires authorized USB Chrome and the scoped CDP bridge from doc/FEATHER.md.
// node tests/android-level-bonus.mjs [game.html]; DINO_CDP_URL defaults to :9224.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const html = fs.readFileSync(artifact), hash = createHash('sha256').update(html).digest('hex');
const port = Number(process.env.DINO_ANDROID_BONUS_PORT || 8879), url = `http://127.0.0.1:${port}/dino.html`;
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/level-bonus'), 'device');
fs.mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb', [...(process.env.DINO_ANDROID_SERIAL ? ['-s', process.env.DINO_ANDROID_SERIAL] : []), ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
const pw = await loadPlaywright();
assert.equal(adb('get-state'), 'device');
const rotation = { auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'),
  user: adb('shell', 'settings', 'get', 'system', 'user_rotation') };
const assets = new Map(['assets/images/icon-192.png', 'assets/images/icon-512.png', 'assets/images/icon-180.png', 'manifest.webmanifest',
  'dino-jump-jump.mp3', 'dino-boom-in-the-dunes.mp3'].map(name => [name, path.join(root, name)]));
const server = http.createServer((request, response) => {
  const name = new URL(request.url, url).pathname.slice(1);
  response.setHeader('Cache-Control', 'no-store');
  if (name === 'dino.html') response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  else if (assets.has(name) && fs.existsSync(assets.get(name))) {
    const type = name.endsWith('.mp3') ? 'audio/mpeg' : name.endsWith('.png') ? 'image/png' : 'application/manifest+json';
    response.writeHead(200, { 'Content-Type': type }); fs.createReadStream(assets.get(name)).pipe(response);
  } else response.writeHead(204).end();
});
const report = { artifact, hash, model: adb('shell', 'getprop', 'ro.product.model'), layouts: [], touches: [], errors: [] };
let browser, page, storage, ownReverse = false;
try {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  if (!adb('reverse', '--list').includes(`tcp:${port}`)) { adb('reverse', `tcp:${port}`, `tcp:${port}`); ownReverse = true; }
  browser = await pw.chromium.connectOverCDP(process.env.DINO_CDP_URL || 'http://127.0.0.1:9224', { noDefaults: true, timeout: 20000 });
  report.chrome = browser.version();
  page = await browser.contexts()[0].newPage();
  await page.addInitScript(() => {
    window.__dinoTest = { highscoreApiUrl: null }; // No credit seed or manual clock.
    // This dedicated layout/audio origin does not install or replace a PWA worker.
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(Error('Physical layout fixture'));
    window.__coinTouches = [];
    window.addEventListener('pointerdown', event => window.__coinTouches.push({ trusted: event.isTrusted,
      type: event.pointerType, target: event.target.closest?.('button')?.id || event.target.id }), true);
  });
  await page.route('**/highscores.php*', route => route.abort());
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.bringToFront();
  const cdp = await page.context().newCDPSession(page);
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const touch = async selector => {
    const box = await page.locator(selector).boundingBox(); assert(box, 'Visible physical target ' + selector);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const rotate = async value => {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', value);
    await page.waitForFunction(portrait => (innerHeight > innerWidth) === portrait, value === '0');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };

  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  const response = await page.goto(url, { waitUntil: 'load' });
  assert.equal(createHash('sha256').update(await response.body()).digest('hex'), hash);
  await page.waitForFunction(() => !!window.__dinoRunner);
  storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.evaluate(() => {
    localStorage.setItem('dino-fullscreen-disabled', 'true');
    localStorage.setItem('dino-effects', 'on'); localStorage.setItem('dino-sound-muted', 'false');
    localStorage.setItem('dino-effects-volume', '100');
  });
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.__dinoRunner);
  await rotate('0'); await page.evaluate(() => window.__dinoTest.transitionDone());
  assert.equal(await page.locator('#attract-navigation, #attract-pause, .attract-dot').count(), 0);
  await page.screenshot({ path: path.join(output, 'attract-portrait.png') });
  await rotate('1'); await page.screenshot({ path: path.join(output, 'attract-landscape.png') });
  await rotate('0');
  report.attractLoop = [];
  for (const index of [1, 2, 0]) {
    await page.waitForFunction(i => window.__dinoRunner.attract.index === i, index, { timeout: 15000 });
    report.attractLoop.push((await state()).attract.panel);
  }
  assert.deepEqual(report.attractLoop, ['demo', 'powerups', 'scores']);
  await touch('#insert-coin'); await page.waitForFunction(() => window.__dinoRunner.credits.balance === 1);
  await touch('#start-game'); await page.waitForFunction(() => window.__dinoGame.playing);
  // Keep this UI/audio fixture safe while normal device rAF runs.
  await page.evaluate(() => {
    const g = window.__dinoGame;
    g.horizon.obstacles = []; g.horizon.addObstacle = () => {};
    g.turbo.spawnTimer = g.feather.spawnTimer = g.shield.spawnTimer = g.boss.remaining = 1e9;
    g.turbo.pickup = g.feather.pickup = g.shield.pickup = null;
    const r = window.__dinoRunner;
    window.__bonusNotes = [];
    const original = r.sound.bonus.bind(r.sound);
    r.sound.bonus = index => { window.__bonusNotes.push(index); original(index); };
    const analyser = r.sound.context.createAnalyser(); analyser.fftSize = 512;
    r.sound.output.connect(analyser); window.__bonusAnalyser = analyser;
  });
  await page.waitForFunction(() => !window.__dinoGame.countingDown && !window.__dinoGame.trex.jumping);
  for (const [name, rotation] of [['portrait', '0'], ['landscape', '1'], ['reverse-landscape', '3']]) {
    await rotate(rotation);
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.trex.jumping = false; g.trex.y = g.trex.groundY; g.trex.velocity = 0;
      g.horizon.obstacles = []; g.bonus = null; g.pendingBonus = null;
      g.section = { level: 1, baseScore: 0, cleared: 8, clean: true, time: 0 };
      g.distance = 499 / .025; g.score = 499; g.bonusScore = 0; g.speed = 7;
      g.lives = 2; g.lifeMilestones = 0; g.nextLifeScore = 500;
      window.__bonusNotes = []; g.queueBonus(); g.beginBonusIfSafe();
    });
    await page.waitForFunction(() => window.__dinoGame.bonus?.elapsed >= 200);
    await touch('#settings-open'); await page.waitForFunction(() => window.__dinoRunner.paused);
    const frozen = await state();
    await rotate(rotation === '0' ? '1' : '0');
    assert.deepEqual(await state(), frozen, 'Rotation/settings freeze the bonus and world');
    await rotate(rotation);
    await touch('#settings-close'); await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.screenshot({ path: path.join(output, name + '-bonus.png') });
    const audio = await page.evaluate(async () => {
      const values = new Float32Array(512), ctx = window.__dinoRunner.sound.context;
      let peak = 0; const start = ctx.currentTime;
      await new Promise(resolve => {
        const sample = () => {
          window.__bonusAnalyser.getFloatTimeDomainData(values);
          for (const v of values) peak = Math.max(peak, Math.abs(v));
          if (ctx.currentTime - start > .7) resolve(); else requestAnimationFrame(sample);
        }; sample();
      });
      return { peak, state: ctx.state };
    });
    assert(audio.peak > .001 && audio.state === 'running', 'Actual bonus audio signal');
    await page.waitForFunction(() => !window.__dinoGame.bonus);
    const result = await state();
    assert.equal(result.bonusScore, 13); assert.equal(result.lives, 3); assert.equal(result.credits, 0);
    assert.deepEqual(await page.evaluate(() => window.__bonusNotes), [1, 2, 3, 4, 5, 6]);
    await touch('#touch-jump'); await page.waitForFunction(() => window.__dinoGame.trex.jumping);
    const geometry = await page.evaluate(() => {
      const ids = ['touch-jump', 'touch-duck', 'info-link', 'settings-open'];
      return ids.map(id => {
        const e = document.getElementById(id), r = e.getBoundingClientRect();
        return { id, fits: r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
    });
    assert(geometry.every(x => x.fits && x.hit), 'Phone controls fit and remain unobstructed');
    report.layouts.push({ name, audio, geometry, result });
    await page.waitForFunction(() => !window.__dinoGame.trex.jumping);
  }
  report.touches = await page.evaluate(() => window.__coinTouches);
  assert(report.touches.every(t => t.trusted && t.type === 'touch'));
  assert.deepEqual(report.errors, []);
  report.rotationRestored = rotation;
  fs.writeFileSync(path.join(output, 'android-level-bonus.json'), JSON.stringify(report, null, 2));
  console.log('Physical bonus passed: ' + report.model + ', ' + report.layouts.length + ' rotations, pause/rotate/resume, touch and real audio');
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), report,
      state: await page.evaluate(() => JSON.parse(window.render_game_to_text())).catch(() => null) }, null, 2));
  }
  throw error;
} finally {
  if (page) {
    await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); }).catch(() => {});
    if (storage) await page.evaluate(values => { localStorage.clear(); for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, storage).catch(() => {});
    await page.close().catch(() => {});
  }
  for (const [key, value] of [['user_rotation', rotation.user], ['accelerometer_rotation', rotation.auto]])
    adb('shell', 'settings', value === 'null' ? 'delete' : 'put', 'system', key, ...(value === 'null' ? [] : [value]));
  await browser?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (ownReverse) adb('reverse', '--remove', `tcp:${port}`);
}
