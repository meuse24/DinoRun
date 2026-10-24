import { loadPlaywright } from './helpers/playwright.mjs';
// Physical Android credit cabinet: own server/tab, trusted touch, real rAF/audio.
// Requires authorized USB Chrome and the scoped CDP bridge from doc/FEATHER.md.
// node tests/android-coins.mjs [game.html]; DINO_CDP_URL defaults to :9224.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const html = fs.readFileSync(artifact), hash = createHash('sha256').update(html).digest('hex');
const port = Number(process.env.DINO_ANDROID_COIN_PORT || 8878), url = `http://127.0.0.1:${port}/dino.html`;
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/coins'), 'device');
fs.mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb', [...(process.env.DINO_ANDROID_SERIAL ? ['-s', process.env.DINO_ANDROID_SERIAL] : []), ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
const pw = await loadPlaywright();
assert.equal(adb('get-state'), 'device');
const rotation = { auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'),
  user: adb('shell', 'settings', 'get', 'system', 'user_rotation') };
const assets = new Map(['assets/images/icon-192.png', 'assets/images/icon-512.png', 'assets/images/icon-180.png', 'manifest.webmanifest',
  'assets/audio/dino-jump-jump.mp3', 'assets/audio/dino-boom-in-the-dunes.mp3'].map(name => [name, path.join(root, name)]));
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
  const geometry = async label => {
    const result = await page.evaluate(() => {
      const ids = ['insert-coin', 'coin-count', 'start-game', 'info-link', 'settings-open', 'quit-game', 'install-game'];
      const boxes = Object.fromEntries(ids.map(id => {
        const e = document.getElementById(id), r = e.getBoundingClientRect();
        return [id, { x: r.x, y: r.y, width: r.width, height: r.height,
          visible: !!(r.width && r.height), fits: r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }];
      }));
      return { size: { width: innerWidth, height: innerHeight }, fullscreen: !!document.fullscreenElement, boxes,
        credits: window.__dinoRunner.credits.balance, manual: !!window.__dinoTest.manualFrames };
    });
    for (const [id, box] of Object.entries(result.boxes)) if (box.visible) {
      assert(box.fits, label + ': ' + id + ' fits viewport: ' + JSON.stringify(result));
      if (id !== 'coin-count') assert(box.hit, label + ': ' + id + ' is unobstructed');
    }
    const targets = Object.entries(result.boxes).filter(([, box]) => box.visible);
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
      const [a, x] = targets[i], [b, y] = targets[j];
      const width = Math.min(x.x + x.width, y.x + y.width) - Math.max(x.x, y.x);
      const height = Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y);
      assert(width <= 1 || height <= 1, `${label}: ${a} and ${b} must not overlap`);
    }
    assert.equal(result.boxes['start-game'].visible, result.credits > 0);
    assert.equal(result.manual, false);
    if (!result.credits) assert(result.boxes['insert-coin'].height >= 60 && result.boxes['insert-coin'].width >= 180);
    await page.screenshot({ path: path.join(output, label + '.png') });
    report.layouts.push({ label, ...result });
  };
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  const response = await page.goto(url, { waitUntil: 'load' });
  assert.equal(createHash('sha256').update(await response.body()).digest('hex'), hash, 'Exact phone artifact');
  await page.waitForFunction(() => !!window.__dinoRunner);
  storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  await page.evaluate(() => {
    localStorage.setItem('dino-fullscreen-disabled', 'false');
    localStorage.setItem('dino-effects', 'on'); localStorage.setItem('dino-sound-muted', 'false');
    localStorage.setItem('dino-effects-volume', '100');
  });
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.__dinoRunner);
  await rotate('0'); await page.evaluate(() => window.__dinoTest.transitionDone());
  // The first real coin must ring without triggering a fullscreen resize.
  await geometry('portrait-empty-default');
  await page.evaluate(() => {
    const sound = window.__dinoRunner.sound, original = sound.coin.bind(sound);
    sound.coin = () => {
      sound.unlock();
      if (!window.__coinAnalyser && sound.context && sound.output) {
        const analyser = sound.context.createAnalyser(); analyser.fftSize = 512; sound.output.connect(analyser);
        window.__coinAnalyser = analyser;
      }
      original();
    };
  });
  await touch('#insert-coin'); await page.waitForFunction(() => window.__dinoRunner.credits.balance === 1);
  report.audio = await page.evaluate(async () => {
    const sound = window.__dinoRunner.sound, values = new Float32Array(512), start = sound.context.currentTime;
    let peak = 0;
    await new Promise(resolve => {
      const began = performance.now();
      const sample = () => {
        window.__coinAnalyser?.getFloatTimeDomainData(values);
        for (const value of values) peak = Math.max(peak, Math.abs(value));
        if (performance.now() - began < 250) requestAnimationFrame(sample); else resolve();
      }; sample();
    });
    return { peak, state: sound.context.state, elapsed: sound.context.currentTime - start, gain: sound.output.gain.value };
  });
  assert(report.audio.peak > 0.00001 && report.audio.elapsed > 0.1 && report.audio.state === 'running', 'Real phone coin signal reaches audio output');
  report.touches.push(...await page.evaluate(() => window.__coinTouches));
  await page.evaluate(() => localStorage.setItem('dino-fullscreen-disabled', 'true'));
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.__dinoRunner);
  assert.equal((await state()).credits, 1, 'Real tab reload preserves the inserted credit');
  for (const [name, value] of [['portrait', '0'], ['landscape', '1'], ['reverse-landscape', '3']]) {
    await rotate(value); await page.evaluate(() => window.__dinoTest.transitionDone());
    if (!(await state()).credits) {
      await geometry(name + '-empty');
      await touch('#insert-coin'); await page.waitForFunction(() => window.__dinoRunner.credits.balance === 1);
    }
    await geometry(name + '-credited');
    await touch('#start-game'); await page.waitForFunction(() => window.__dinoGame.playing);
    assert.equal((await state()).credits, 0); assert.equal((await state()).lives, 3);
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.turbo.spawnTimer = g.feather.spawnTimer = g.shield.spawnTimer = g.boss.remaining = 1e9;
      g.on(e => { if (e.type === 'step' && g.playing) g.horizon.obstacles.length = 0; });
    });
    await page.waitForFunction(() => !window.__dinoGame.countingDown && !window.__dinoGame.trex.jumping, null, { timeout: 15000 });
    await touch('#settings-open'); await page.waitForFunction(() => window.__dinoRunner.paused);
    const before = (await state()).credits;
    await rotate(value === '0' ? '1' : '0');
    await touch('#settings-close'); await page.waitForFunction(() => !window.__dinoRunner.paused);
    assert.equal((await state()).credits, before, 'Pause/rotation never charges another credit');
    await touch('#touch-jump');
    assert.equal((await state()).credits, 0);
    assert.equal((await state()).player.jumping, true, 'Physical jump works after rotation');
    await page.screenshot({ path: path.join(output, name + '-playing-rotated.png') });
    await page.evaluate(() => {
      const r = window.__dinoRunner; r.game.score = 0; r.game.gameOver(); r.game.trex.deathTime = 10000;
      r.highscoreController.roundLeft(); r.returnToAttract();
    });
    await page.waitForFunction(() => window.__dinoGame.state === 'attract');
    assert.equal(await page.locator('#start-game').isVisible(), false);
  }
  await rotate('1'); await touch('#settings-open'); await touch('#fullscreen-toggle');
  await page.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 15000 });
  await touch('#settings-close'); await page.waitForFunction(() => !window.__dinoRunner.paused);
  await geometry('fullscreen-landscape-empty');
  await touch('#insert-coin'); await page.waitForFunction(() => window.__dinoRunner.credits.balance === 1);
  await geometry('fullscreen-landscape-credited');
  await rotate('0'); await geometry('fullscreen-portrait-credited');
  await rotate('3'); await geometry('fullscreen-reverse-credited');
  report.touches.push(...await page.evaluate(() => window.__coinTouches));
  assert(report.touches.length >= 15 && report.touches.every(t => t.trusted && t.type === 'touch'));
  assert.deepEqual(report.errors, []);
  report.rotationRestored = rotation;
  fs.writeFileSync(path.join(output, 'android-coins.json'), JSON.stringify(report, null, 2));
  console.log(`Physical coin checks passed: ${report.model}, Chrome ${report.chrome}, ${report.layouts.length} viewport states; real audio peak ${report.audio.peak}`);
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
