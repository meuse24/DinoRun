import { loadPlaywright } from './helpers/playwright.mjs';
// Physical Android: Arcade effects probe and frame times with effects on/off.
// Requires the safe preview (tests/android-preview.cjs), USB bridges and Chrome
// as in doc/FEATHER.md. Never contacts the live highscore API. Clears only the
// preview origin's service worker/cache so the current artifact is measured, and
// removes the saved effects choice afterwards so a normal launch probes again.
// node tests/android-effects.mjs; DINO_ANDROID_URL, DINO_CDP_URL optional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pw = await loadPlaywright();
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/arcade-fx'), 'device');
fs.mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', windowsHide: true }).trim();
const url = process.env.DINO_ANDROID_URL || 'http://127.0.0.1:8877/dino.html';
const rotation = { auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'),
  user: adb('shell', 'settings', 'get', 'system', 'user_rotation') };
const report = { url, model: adb('shell', 'getprop', 'ro.product.model'), layouts: {} }, errors = [];
const stats = deltas => {
  const sorted = [...deltas].sort((a, b) => a - b), mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { fps: +(1000 / mean).toFixed(1), median: +sorted[sorted.length >> 1].toFixed(1),
    p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    slow: +(100 * deltas.filter(d => d > 20).length / deltas.length).toFixed(1) };
};
let browser, page;
try {
  assert.equal(adb('get-state'), 'device');
  browser = await pw.chromium.connectOverCDP(process.env.DINO_CDP_URL || 'http://127.0.0.1:9223',
    { noDefaults: true, timeout: 20000 });
  report.browser = browser.version();
  page = await browser.contexts()[0].newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/highscores.php*', route => route.abort());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: new URL(url).origin,
    storageTypes: 'service_workers,cache_storage' });
  const touch = async selector => {
    const box = await page.locator(selector).boundingBox();
    assert(box, 'Visible touch target ' + selector);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  for (const [layout, user] of [['landscape', '1'], ['portrait', '0']]) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', user);
    // First launch: no saved choice, so the real probe runs on this device.
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.removeItem('dino-effects'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__dinoRunner);
    await page.waitForFunction(portrait => (innerHeight > innerWidth) === portrait, layout === 'portrait');
    const result = report.layouts[layout] = { size: await page.evaluate(() => [innerWidth, innerHeight]) };
    await page.waitForFunction(() => !!window.__dinoRunner.effectsSetting.result, null, { timeout: 15000 });
    result.probe = await page.evaluate(() => ({ ...window.__dinoRunner.effectsSetting.result,
      enabled: window.__dinoRunner.effectsSetting.enabled }));
    await page.evaluate(() => {
      window.__record = ms => new Promise(resolve => {
        const deltas = []; let last = performance.now(); const start = last;
        const frame = now => { deltas.push(now - last); last = now;
          if (now - start < ms) requestAnimationFrame(frame); else resolve(deltas); };
        requestAnimationFrame(frame);
      });
    });
    for (const effects of [true, false]) {
      const key = effects ? 'on' : 'off';
      await page.evaluate(on => window.__dinoRunner.effectsSetting.set(on, false), effects);
      await page.waitForTimeout(800);
      const menu = stats(await page.evaluate(() => window.__record(4000)));
      await touch('#start-game');
      await page.waitForFunction(() => window.__dinoGame.playing && !window.__dinoGame.countingDown,
        null, { timeout: 10000 });
      // Busy round: no obstacles; a callout every 400 ms, banners, milestones and shake.
      await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game, e = r.renderer.effects;
        const words = [['SHIELD!', 'shield'], ['SMASH!', 'smash'], ['CHILI BOOST!', 'chili'], ['AIR JUMP!', 'feather']];
        let n = 0;
        window.__stopStress?.();
        const off = g.on(event => { if (event.type === 'step') g.horizon.obstacles.length = 0; });
        const timer = setInterval(() => {
          const [w, s] = words[n++ % 4];
          e.callout(w, g.trex.x + 24 + (n % 3) * 90, g.trex.y - 6, s);
          if (n % 4 === 0) e.announce('LEVEL ' + (n % 9 + 2), 'SPEED UP!');
          if (n % 5 === 0) { g.meter.achievement = -1; g.meter.flash = 1200; }
          if (n % 7 === 0) e.shake(3);
        }, 400);
        window.__stopStress = () => { clearInterval(timer); off(); };
      });
      const play = stats(await page.evaluate(() => window.__record(6000)));
      await page.screenshot({ path: path.join(output, `${layout}-play-effects-${key}.png`) });
      await page.evaluate(() => {
        window.__stopStress();
        const r = window.__dinoRunner, g = r.game;
        g.score = 0; g.gameOver(); r.returnToAttract();
      });
      await page.waitForFunction(() => window.__dinoGame.state === 'attract', null, { timeout: 10000 });
      result[key] = { menu, play };
    }
    console.log(layout, JSON.stringify(result));
  }
  await page.evaluate(() => localStorage.removeItem('dino-effects'));
  report.errors = errors;
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  console.log('Android effects measurement:', path.join(output, 'report.json'));
} finally {
  await page?.close().catch(() => {});
  await browser?.close().catch(() => {});
  adb('shell', 'settings', 'put', 'system', 'user_rotation', rotation.user);
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', rotation.auto);
}
