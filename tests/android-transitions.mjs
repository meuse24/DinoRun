// Physical Android: frame times during screen transitions and trusted-touch START
// latency with and without transitions. Requires the safe preview, USB bridges and
// the scoped CDP relay from doc/FEATHER.md. Never contacts the live highscore API.
// node tests/android-transitions.mjs; DINO_ANDROID_URL, DINO_CDP_URL optional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/transitions'), 'device');
fs.mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', windowsHide: true }).trim();
const url = process.env.DINO_ANDROID_URL || 'http://127.0.0.1:8877/dino.html';
const runs = Number(process.env.DINO_LATENCY_RUNS || 30);
const rotation = { auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'),
  user: adb('shell', 'settings', 'get', 'system', 'user_rotation') };
const report = { url, model: adb('shell', 'getprop', 'ro.product.model'), layouts: {} }, errors = [];
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
let browser, page;
try {
  assert.equal(adb('get-state'), 'device');
  browser = await pw.chromium.connectOverCDP(process.env.DINO_CDP_URL || 'http://127.0.0.1:9224',
    { noDefaults: true, timeout: 20000 });
  report.browser = browser.version();
  page = await browser.contexts()[0].newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/highscores.php*', route => route.abort());
  const cdp = await page.context().newCDPSession(page);
  const touch = async selector => {
    const box = await page.locator(selector).boundingBox();
    assert(box, 'Visible touch target ' + selector);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  for (const [layout, user] of [['portrait', '0'], ['landscape', '1']]) {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', user);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__dinoRunner && !!window.__dinoTest?.transitionDone);
    await page.waitForFunction(portrait => (innerHeight > innerWidth) === portrait, layout === 'portrait');
    const result = report.layouts[layout] = { size: await page.evaluate(() => [innerWidth, innerHeight]) };
    await page.evaluate(() => {
      const r = window.__dinoRunner;
      // Keep the round free of obstacles; crashes are triggered explicitly.
      r.game.on(e => { if (e.type === 'step') r.game.horizon.obstacles.length = 0; });
      window.__record = (ms) => new Promise(resolve => {
        const deltas = [];
        let last = performance.now();
        const start = last;
        const frame = now => {
          deltas.push(now - last); last = now;
          if (now - start < ms) requestAnimationFrame(frame); else resolve(deltas);
        };
        requestAnimationFrame(frame);
      });
      window.__latency = [];
      document.getElementById('start-game').addEventListener('pointerdown', e => {
        const t0 = e.timeStamp;
        const poll = now => {
          if (window.__dinoGame.trex.jumping) window.__latency.push(now - t0);
          else requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
      }, true);
      window.__toAttract = () => { const g = window.__dinoGame; g.score = 0; g.gameOver(); r.returnToAttract(); };
    });
    for (const transitions of [false, true]) {
    const label = transitions ? '' : 'Baseline';
    await page.evaluate(on => {
      const r = window.__dinoRunner;
      r.motion.enabled = on;
      r.transition.enabled = on && r.transition.level !== 'none';
      document.documentElement.classList.toggle('motion', on);
    }, transitions);
    await page.evaluate(() => window.__dinoTest.transitionDone());
    // T2: trigger the same slide transition as automatic rotation; no navigation UI.
    await page.evaluate(() => { window.__dinoRunner.attract.userPaused = false; });
    const t2 = page.evaluate(() => window.__record(500));
    await page.evaluate(index => { const r = window.__dinoRunner; r.attract.select(index, 'next'); r.draw(1); }, 2);
    result.t2 = await t2;
    await page.evaluate(() => window.__dinoTest.transitionDone());
    // T4: trusted touch on START, then T5 (crash) and T6 (automatic return).
    const t4 = page.evaluate(() => window.__record(500));
    await touch('#start-game');
    result.t4 = await t4;
    await page.waitForFunction(() => !window.__dinoGame.countingDown, null, { timeout: 10000 });
    result.t5 = await page.evaluate(() => {
      const recording = window.__record(500);
      window.__dinoGame.gameOver();
      return recording;
    });
    await page.screenshot({ path: path.join(output, `${layout}${label}-overlay.png`) });
    await page.waitForFunction(() => window.__dinoGame.inDeathScene === false || window.__dinoGame.state === 'attract');
    result.t6 = await page.evaluate(async () => {
      while (window.__dinoGame.state !== 'attract') await new Promise(r => requestAnimationFrame(r));
      return window.__record(500);
    });
    await page.evaluate(() => window.__dinoTest.transitionDone());
    await page.screenshot({ path: path.join(output, `${layout}${label}-attract.png`) });
    // T7a: a qualifying score; frames from shortly before the death scene ends.
    await touch('#start-game');
    await page.waitForFunction(() => window.__dinoGame.playing && !window.__dinoGame.countingDown, null, { timeout: 10000 });
    result.t7a = await page.evaluate(async () => {
      const r = window.__dinoRunner, g = r.game;
      g.recordAtStart = 0; g.score = 500; g.gameOver();
      while (g.inDeathScene && g.trex.deathTime < 2400) await new Promise(f => requestAnimationFrame(f));
      const deltas = await window.__record(900);
      if (!r.highscores.isOpen) throw new Error('No name entry opened');
      return deltas;
    });
    await page.evaluate(() => window.__dinoTest.transitionDone());
    await page.screenshot({ path: path.join(output, `${layout}${label}-entry.png`) });
    await page.evaluate(() => { window.__dinoRunner.highscores.close(); return window.__dinoTest.transitionDone(); });
    for (const name of ['t2', 't4', 't5', 't6', 't7a']) {
      const deltas = result[name];
      result[name + label] = { frames: deltas.length, over33: deltas.filter(d => d > 33).length,
        median: percentile(deltas, 0.5), max: Math.max(...deltas),
        slow: deltas.filter(d => d > 33).map(Math.round) };
      if (!transitions) delete result[name];
    }
    }
    result.failures = ['t2', 't4', 't5', 't6', 't7a'].filter(name => result[name].over33 > 2);
    // Latency: START touch to the first frame with the jump pose, transitions on/off.
    for (const transitions of [true, false]) {
      await page.evaluate(on => {
        const r = window.__dinoRunner;
        r.motion.enabled = on;
        document.documentElement.classList.toggle('motion', on);
        window.__latency.length = 0;
      }, transitions);
      for (let run = 0; run < runs; run++) {
        await page.evaluate(() => window.__dinoTest.transitionDone());
        await touch('#start-game');
        await page.waitForFunction(n => window.__latency.length === n, run + 1);
        await page.evaluate(() => window.__toAttract());
      }
      const samples = await page.evaluate(() => [...window.__latency]);
      result['latency' + (transitions ? 'On' : 'Off')] = { runs: samples.length,
        median: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
    }
    const frame = 1000 / 60 + 1;
    assert(Math.abs(result.latencyOn.median - result.latencyOff.median) <= frame, layout + ' latency median');
    assert(Math.abs(result.latencyOn.p95 - result.latencyOff.p95) <= frame, layout + ' latency p95');
    console.log(layout, JSON.stringify(result));
    assert.deepEqual(result.failures, [], layout + ': more than two frames over 33 ms');
  }
  assert.deepEqual(errors, []);
} finally {
  if (page) await page.close().catch(() => {});
  await browser?.close().catch(() => {});
  adb('shell', 'settings', 'put', 'system', 'user_rotation', rotation.user);
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', rotation.auto);
}
report.rotationRestored = rotation;
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log('Physical Android transition timing passed');
