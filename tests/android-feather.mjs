import { loadPlaywright } from './helpers/playwright.mjs';
// Physical Android check. Requires an authorized device, Chrome open and USB bridges:
// adb forward tcp:9223 localabstract:chrome_devtools_remote
// adb reverse tcp:8877 tcp:8877
// Run the safe preview from tests/android-preview.cjs, then this script.
// No device/viewport emulation or manual game frames; CDP touch input in real Chrome.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/feather'), 'device');
const artifactFile = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const artifactSha256 = createHash('sha256').update(fs.readFileSync(artifactFile)).digest('hex');
const testUrl = process.env.DINO_ANDROID_URL || 'http://127.0.0.1:8877/dino.html';
const testPort = new URL(testUrl).port;
fs.mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb',
  [...(process.env.DINO_ANDROID_SERIAL ? ['-s', process.env.DINO_ANDROID_SERIAL] : []), ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(adb('get-state'), 'device', 'An authorized Android device is required');
const original = {
  auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'),
  rotation: adb('shell', 'settings', 'get', 'system', 'user_rotation'),
};
const metadata = {
  artifact: path.relative(root, artifactFile), artifactSha256,
  model: adb('shell', 'getprop', 'ro.product.model'),
  android: adb('shell', 'getprop', 'ro.build.version.release'),
  build: fs.readFileSync(path.join(root, 'dino.html'), 'utf8').match(/const BUILD = '([^']+)'/)[1],
  input: 'Chrome CDP trusted touch on physical device; no viewport/device emulation',
  timing: 'normal requestAnimationFrame game loop; controlled pickup/obstacle fixtures',
};
const { chromium } = await loadPlaywright();
let browser, page, savedRecords;
let reverseRemoved = false;
const errors = [], layouts = [];
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  browser = await chromium.connectOverCDP(process.env.DINO_CDP_URL || 'http://127.0.0.1:9223', { noDefaults: true });
  metadata.browser = browser.version();
  page = await browser.contexts()[0].newPage();
  await page.addInitScript(() => { window.__dinoTest = { credits: 99, highscoreApiUrl: null }; });
  await page.route('**/highscores.php*', route => route.abort());
  await page.bringToFront();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const verifyArtifact = async response => {
    if (process.env.DINO_ANDROID_URL)
      assert.equal(createHash('sha256').update(await response.body()).digest('hex'), artifactSha256);
    else assert.equal(await page.evaluate(() => window.__dinoArtifactSha256), artifactSha256);
  };
  const initialResponse = await page.goto(testUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__dinoRunner);
  savedRecords = await page.evaluate(() => Object.fromEntries(
    ['chromium-dino-highscore', 'chromium-dino-highscore-relaxed'].map(key => [key, localStorage.getItem(key)])));
  assert.equal(await page.locator('#build-info').textContent(), 'Build ' + metadata.build);
  assert.equal(await page.evaluate(() => window.__dinoTest.highscoreApiUrl), null);
  await verifyArtifact(initialResponse);
  assert.equal(await page.evaluate(() => !!window.__dinoTest.manualFrames), false);
  const cdp = await page.context().newCDPSession(page);
  const touch = async (locator, hold = 0) => {
    const box = await locator.boundingBox();
    assert(box, 'Touch target must be visible');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    if (hold) await page.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.evaluate(() => {
    window.__deviceTouches = [];
    window.__deviceAirJumps = 0;
    document.addEventListener('pointerdown', event => window.__deviceTouches.push({
      pointerType: event.pointerType, trusted: event.isTrusted, target: event.target.id,
    }), true);
    // Keep unrelated hazards out of short control tests. Rendering/physics use real time.
    window.__dinoGame.on(event => {
      if (event.type === 'jump' && event.airborne) window.__deviceAirJumps++;
      if (event.type === 'step') window.__dinoGame.horizon.obstacles.length = 0;
    });
  });
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  for (const [name, rotation] of [['portrait', '0'], ['landscape', '1']]) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', rotation);
    await page.waitForFunction(portrait => (innerHeight > innerWidth) === portrait, name === 'portrait');
    if ((await state()).state === 'attract') await touch(page.locator('#start-game'));
    await page.waitForFunction(() => window.__dinoGame.playing && !window.__dinoGame.countingDown);
    await page.waitForFunction(() => !window.__dinoGame.trex.jumping);
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.feather.reset();
      g.feather.spawnTimer = g.turbo.spawnTimer = 1e9;
      g.feather.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
    });
    await page.waitForFunction(() => window.__dinoGame.feather.charged);
    await page.screenshot({ path: path.join(output, `${name}-ready.png`) });

    const jumpsBefore = await page.evaluate(() => window.__deviceAirJumps);
    await touch(page.locator('#touch-jump'), 100);
    assert.equal((await state()).feather.charged, true, 'Ground jump keeps charge');
    await page.waitForFunction(() => window.__dinoGame.trex.jumping);
    await touch(page.locator('#touch-jump'), 40);
    assert.equal((await state()).feather.charged, false, 'Fresh touch spends charge in air');
    assert.equal(await page.evaluate(() => window.__deviceAirJumps), jumpsBefore + 1);
    await page.screenshot({ path: path.join(output, `${name}-air-jump.png`) });
    await touch(page.locator('#touch-jump'));
    assert.equal(await page.evaluate(() => window.__deviceAirJumps), jumpsBefore + 1,
      'No third air jump');
    await page.waitForFunction(() => !window.__dinoGame.trex.jumping);

    const duck = await page.locator('#touch-duck').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: duck.x + duck.width / 2, y: duck.y + duck.height / 2 }] });
    assert.equal((await state()).player.ducking, true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await state()).player.ducking, false);

    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.feather.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
    });
    await page.waitForFunction(() => window.__dinoGame.feather.charged);
    await touch(page.locator('#settings-open'));
    assert.equal((await state()).paused, true);
    const frozen = await page.evaluate(() => window.__dinoGame.gameTime);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__dinoGame.gameTime), frozen);
    assert.equal((await state()).feather.charged, true);
    await touch(page.locator('#settings-close'));
    await page.waitForFunction(() => !window.__dinoRunner.paused);

    const performance = await page.evaluate(async () => {
      const intervals = [];
      let last, first;
      await new Promise(resolve => {
        const frame = t => {
          if (last !== undefined) intervals.push(t - last);
          first ??= t;
          last = t;
          if (t - first >= 4000) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const sorted = intervals.slice().sort((a, b) => a - b);
      return { frames: intervals.length, fps: intervals.length * 1000 / intervals.reduce((a, b) => a + b, 0),
        medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        maxMs: sorted.at(-1), scope: '4-second controlled scene; not a sustained FPS guarantee' };
    });
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      dpr: devicePixelRatio, screen: [screen.width, screen.height],
      context: window.__dinoRunner.renderer.ctx.getContextAttributes(),
      backing: [document.querySelector('canvas').width, document.querySelector('canvas').height] }));
    layouts.push({ name, viewport, performance, checks: 'passed' });
    console.log(`${name}: touch/feather/duck/pause passed; ${performance.fps.toFixed(1)} FPS in short controlled scene`);
  }

  await touch(page.locator('#info-link'));
  const help = page.frameLocator('#info-view');
  await help.locator('#jump-feather-help').scrollIntoViewIfNeeded();
  assert.match(await help.locator('#jump-feather-help').innerText(), /hold only one feather/);
  await page.screenshot({ path: path.join(output, 'help.png') });
  await touch(help.locator('[data-help-back]').first());
  await page.waitForFunction(() => !window.__dinoRunner.paused);
  await page.evaluate(() => { const g = window.__dinoGame; g.score = 0; g.gameOver(); });
  assert.equal((await state()).feather.charged, false);
  await page.waitForFunction(() => window.__dinoGame.state === 'attract' && window.__dinoRunner.canInput());
  await page.locator('#start-game').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#start-game').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return !!document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('#start-game');
  }), true, 'Restart must receive touches in the real short landscape viewport');
  await touch(page.locator('#start-game'));
  // Android synthesizes the button's click asynchronously after touchEnd.
  await page.waitForFunction(() => window.__dinoGame.playing);
  assert.equal((await state()).state, 'playing');
  assert.equal((await state()).feather.charged, false);
  const touches = await page.evaluate(() => window.__deviceTouches);
  assert(touches.length > 10 && touches.every(t => t.trusted && t.pointerType === 'touch'));
  await page.evaluate(() => {
    const g = window.__dinoGame;
    g.score = 12; g.recordAtStart = 0; g.gameOver();
  });
  await page.waitForFunction(() => document.getElementById('scores').open);
  assert.equal(await page.locator('#scores-entry-view').isVisible(), true);
  await page.screenshot({ path: path.join(output, 'automatic-name.png') });
  await touch(page.locator('#entry-cancel'));
  await page.waitForFunction(() => window.__dinoGame.state === 'attract' && !window.__dinoRunner.paused);
  await touch(page.locator('#start-game'));
  await page.waitForFunction(() => window.__dinoGame.playing);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(async ({ hash, raw }) => {
    const response = await caches.match(location.href.split('#')[0]);
    if (!response) return false;
    if (!raw) return (await response.text()).includes(hash);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') === hash;
  }, { hash: artifactSha256, raw: !!process.env.DINO_ANDROID_URL });
  // Break only this test origin's USB bridge, leaving the phone's connectivity
  // and all other browser tabs alone. The actual service worker must reload it.
  adb('reverse', '--remove', 'tcp:' + testPort);
  reverseRemoved = true;
  const offlineResponse = await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__dinoRunner);
  assert.equal(await page.evaluate(() => window.__dinoTest.highscoreApiUrl), null);
  await verifyArtifact(offlineResponse);
  await touch(page.locator('#start-game'));
  await page.waitForFunction(() => window.__dinoGame.playing && !window.__dinoGame.countingDown);
  await page.waitForFunction(() => !window.__dinoGame.trex.jumping);
  await page.evaluate(() => {
    const g = window.__dinoGame;
    g.feather.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
  });
  await page.waitForFunction(() => window.__dinoGame.feather.charged);
  await touch(page.locator('#touch-jump'), 100);
  await touch(page.locator('#touch-jump'), 40);
  assert.equal((await state()).feather.charged, false, 'Air jump works after actual offline reload');
  await page.screenshot({ path: path.join(output, 'offline-air-jump.png') });
  adb('reverse', 'tcp:' + testPort, 'tcp:' + testPort);
  reverseRemoved = false;
  assert.deepEqual(errors, []);
  const report = { metadata, layouts, help: 'passed', deathRestart: 'passed', automaticNameDialog: 'passed',
    trustedTouches: touches.length,
    offlineReloadAndAirJump: 'passed with test USB origin bridge disconnected',
    errors, orientationRestored: original };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Physical-device checks passed: ${metadata.model}, Android ${metadata.android}, Chrome ${metadata.browser}`);
} finally {
  if (page && savedRecords) await page.evaluate(values => {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
  }, savedRecords).catch(() => {});
  if (reverseRemoved) adb('reverse', 'tcp:' + testPort, 'tcp:' + testPort);
  adb('shell', 'settings', original.rotation === 'null' ? 'delete' : 'put', 'system', 'user_rotation',
    ...(original.rotation === 'null' ? [] : [original.rotation]));
  adb('shell', 'settings', original.auto === 'null' ? 'delete' : 'put', 'system', 'accelerometer_rotation',
    ...(original.auto === 'null' ? [] : [original.auto]));
  await page?.close();
  // connectOverCDP closes its transport only; other phone tabs remain open.
  await browser?.close();
}
