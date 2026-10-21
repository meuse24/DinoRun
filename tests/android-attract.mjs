// Physical Android: trusted touch and normal rAF, no device emulation.
// Use the safe android-preview.cjs server and USB bridges documented in doc/FEATHER.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const url = process.env.DINO_ANDROID_URL || 'http://127.0.0.1:8877/dino.html';
const hash = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/attract'), 'device');
fs.mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync('adb',
  [...(process.env.DINO_ANDROID_SERIAL ? ['-s', process.env.DINO_ANDROID_SERIAL] : []), ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(adb('get-state'), 'device');
const rotation = {
  auto: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'),
  user: adb('shell', 'settings', 'get', 'system', 'user_rotation'),
};
const { chromium } = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const errors = [], layouts = [];
let browser, page, savedFullscreen, savedRecords;
try {
  browser = await chromium.connectOverCDP(process.env.DINO_CDP_URL || 'http://127.0.0.1:9223', { noDefaults: true });
  page = await browser.contexts()[0].newPage();
  // The existing development server can be used without modifying its files or
  // touching the live API. Hooks execute before the game, including on reload.
  await page.addInitScript(() => { window.__dinoTest = { credits: 99, highscoreApiUrl: null }; });
  await page.route('**/highscores.php*', route => route.abort());
  await page.bringToFront();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const response = await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__dinoRunner);
  const loadedHash = createHash('sha256').update(await response.body()).digest('hex');
  if (process.env.DINO_ANDROID_URL) assert.equal(loadedHash, hash, 'Loaded artifact matches the selected file');
  else assert.equal(await page.evaluate(() => window.__dinoArtifactSha256), hash);
  assert.equal(await page.evaluate(() => window.__dinoTest.highscoreApiUrl), null);
  assert.equal(await page.evaluate(() => !!window.__dinoTest.manualFrames), false);
  savedFullscreen = await page.evaluate(() => localStorage.getItem('dino-fullscreen-disabled'));
  savedRecords = await page.evaluate(() => Object.fromEntries(
    ['chromium-dino-highscore', 'chromium-dino-highscore-relaxed'].map(key => [key, localStorage.getItem(key)])));
  // Test the browser's shorter non-fullscreen viewport as well as rotation.
  // The existing android-feather runner separately exercises normal fullscreen.
  await page.evaluate(() => localStorage.setItem('dino-fullscreen-disabled', 'true'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__dinoRunner);
  const cdp = await page.context().newCDPSession(page);
  const touch = async locator => {
    const box = await locator.boundingBox();
    assert(box, 'Touch target is visible');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const reset = () => page.evaluate(() => {
    const r = window.__dinoRunner;
    r.highscoreController.roundLeft(); r.game.newSession();
    r.attract.reset(); r.attract.userPaused = false; r.draw(1);
  });
  const checkStart = async before => {
    const rect = await page.locator('#start-game').boundingBox();
    // Android's transformed CSS pixels can report 59.999992 for a 60 px target.
    assert(rect && rect.height + 0.01 >= 60 && rect.width + 0.01 >= 180, 'Start size: ' + JSON.stringify(rect));
    if (before) for (const key of ['x', 'y', 'width', 'height'])
      assert(Math.abs(before[key] - rect[key]) <= 1, `Start ${key} stays fixed`);
    assert.equal(await page.locator('#start-game').evaluate(button => {
      const r = button.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth &&
        button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true, 'Start receives touches and fits on the actual phone');
    assert.equal(await page.evaluate(() => {
      if (!matchMedia('(orientation: landscape)').matches) return true;
      const stage = document.getElementById('stage').getBoundingClientRect();
      const style = getComputedStyle(document.getElementById('page'));
      const available = innerWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return Math.abs(stage.width - available) < 1 && stage.height <= 521;
    }), true, 'Landscape attract screen uses the full safe width and compact height');
    return rect;
  };
  await page.evaluate(() => {
    window.__phoneTouches = [];
    document.addEventListener('pointerdown', e => window.__phoneTouches.push({
      trusted: e.isTrusted, type: e.pointerType,
    }), true);
    window.__phoneHazards = 'clear';
    window.__dinoGame.on(e => {
      if (e.type === 'shieldPop') window.__phoneHazards = 'clear';
      if (e.type === 'step' && window.__phoneHazards === 'clear')
        window.__dinoGame.horizon.obstacles.length = 0;
    });
  });
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  for (const [name, value] of [['portrait', '0'], ['landscape', '1']]) {
    if (process.env.DINO_ANDROID_LAYOUTS && !process.env.DINO_ANDROID_LAYOUTS.split(',').includes(name)) continue;
    adb('shell', 'settings', 'put', 'system', 'user_rotation', value);
    await page.waitForFunction(portrait => (innerHeight > innerWidth) === portrait, name === 'portrait');
    await reset();
    // Older Android Chrome can retain :active on Start after the previous
    // orientation's touch. Compare its resting position, not the intentional
    // 2px pressed transform. Toggle the real preview pause control twice to
    // clear it without tapping through the pointer-transparent title.
    const initialStart = await page.locator('#start-game').evaluate(button => ({
      active: button.matches(':active'), transform: getComputedStyle(button).transform,
      rect: button.getBoundingClientRect().toJSON(),
    }));
    await touch(page.locator('#attract-pause'));
    await page.waitForFunction(() => window.__dinoRunner.attract.paused);
    await touch(page.locator('#attract-pause'));
    await page.waitForFunction(() => !window.__dinoRunner.attract.paused);
    await page.waitForFunction(() => !document.getElementById('start-game').matches(':active'));
    const start = await checkStart();
    await page.screenshot({ path: path.join(output, `${name}-scores.png`) });
    await page.waitForFunction(() => window.__dinoRunner.attract.index === 1);
    await page.waitForFunction(() => window.__dinoRunner.attract.demo.score > 235);
    await checkStart(start);
    assert.equal((await state()).score, 0);
    await page.screenshot({ path: path.join(output, `${name}-demo.png`) });
    await touch(page.locator('#attract-pause'));
    await page.waitForFunction(() => window.__dinoRunner.attract.paused);
    const frozen = (await state()).attract;
    await page.waitForTimeout(250);
    assert.deepEqual((await state()).attract, frozen);
    await touch(page.locator('#attract-pause'));
    await page.waitForFunction(() => window.__dinoRunner.attract.index === 2);
    await checkStart(start);
    assert.equal(await page.locator('.attract-powerup:visible').count(), 3);
    await page.screenshot({ path: path.join(output, `${name}-powerups.png`) });
    await touch(page.locator('#settings-open'));
    await page.waitForFunction(() => window.__dinoRunner.paused);
    const paused = (await state()).attract;
    await page.waitForTimeout(200);
    assert.deepEqual((await state()).attract, paused);
    await touch(page.locator('#settings-close'));
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.waitForFunction(() => window.__dinoRunner.attract.index === 0);
    for (const index of [0, 1, 2]) {
      await touch(page.locator(`[data-attract-slide="${index}"]`));
      await page.waitForFunction(i => window.__dinoRunner.attract.index === i, index);
      await checkStart(start);
      await touch(page.locator('#start-game'));
      await page.waitForFunction(() => window.__dinoGame.playing);
      assert.equal((await state()).shield.charged, false);
      assert.equal((await state()).feather.charged, false);
      assert.equal((await state()).chili.remainingMs, 0);
      assert.equal(await page.locator('#start-game').isVisible(), false);
      await reset();
    }
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      dpr: devicePixelRatio, screen: [screen.width, screen.height] }));
    layouts.push({ name, viewport, rotation: 'passed', previewPause: 'passed',
      startFromEveryPanel: 'passed', initialStart, target: start });
    console.log(`${name}: real rotation, demo, power-ups, preview pause and three touch starts passed`);
  }

  // A real-time shield pickup/hit fixture uses the game's actual obstacle types.
  await touch(page.locator('#start-game'));
  await page.waitForFunction(() => window.__dinoGame.playing && !window.__dinoGame.countingDown);
  await page.waitForFunction(() => !window.__dinoGame.trex.jumping);
  await page.evaluate(() => {
    const g = window.__dinoGame;
    g.shield.spawnTimer = g.feather.spawnTimer = g.turbo.spawnTimer = 1e9;
    g.shield.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
  });
  await page.waitForFunction(() => window.__dinoGame.shield.charged);
  await page.screenshot({ path: path.join(output, 'shield-protected.png') });
  const contact = async type => {
    await page.evaluate(type => {
      const g = window.__dinoGame;
      let obstacle;
      for (let i = 0; i < 100; i++) {
        g.horizon.obstacles.length = 0; g.horizon.addObstacle(13, 1000);
        obstacle = g.horizon.obstacles[0];
        if (obstacle.type.name === type) break;
      }
      if (obstacle.type.name !== type) throw new Error('Obstacle unavailable');
      obstacle.x = g.trex.x + 12 + g.speed * g.turbo.multiplier;
      obstacle.gap = 1e9;
      if (type === 'ptero') obstacle.y = 156;
      window.__phoneHazards = 'contact';
    }, type);
  };
  await contact('small');
  await page.waitForFunction(() => !window.__dinoGame.shield.charged);
  assert.equal((await state()).state, 'playing');
  await page.screenshot({ path: path.join(output, 'shield-pop.png') });
  await page.evaluate(() => { window.__dinoGame.lives = 1; });
  await contact('ptero');
  await page.waitForFunction(() => window.__dinoGame.crashed);
  await reset();
  const touches = await page.evaluate(() => window.__phoneTouches);
  assert(touches.length >= 14 && touches.every(t => t.trusted && t.type === 'touch'));
  assert.deepEqual(errors, []);
  const report = { artifact: path.relative(root, artifact), artifactSha256: hash, url,
    model: adb('shell', 'getprop', 'ro.product.model'),
    android: adb('shell', 'getprop', 'ro.build.version.release'), browser: browser.version(),
    input: 'trusted Chrome CDP touch on physical device; no emulation',
    timing: 'normal rAF; controlled shield/obstacle fixtures', layouts,
    shieldAndSubsequentDeath: 'passed', trustedTouches: touches.length, errors,
    rotationRestored: rotation };
  fs.writeFileSync(path.join(output, 'attract-report.json'), JSON.stringify(report, null, 2));
  console.log(`Physical attract/shield checks passed: ${report.model}, Chrome ${report.browser}`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    const diagnostic = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      portrait: matchMedia('(orientation: portrait)').matches,
      state: JSON.parse(window.render_game_to_text()),
      start: { rect: document.getElementById('start-game').getBoundingClientRect().toJSON(),
        minHeight: getComputedStyle(document.getElementById('start-game')).minHeight },
    })).catch(() => null);
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), diagnostic }, null, 2));
  }
  throw error;
} finally {
  if (page && savedRecords) await page.evaluate(values => {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
  }, savedRecords).catch(() => {});
  if (page && savedFullscreen !== undefined) await page.evaluate(value => {
    if (value === null) localStorage.removeItem('dino-fullscreen-disabled');
    else localStorage.setItem('dino-fullscreen-disabled', value);
  }, savedFullscreen).catch(() => {});
  for (const [key, value] of [['user_rotation', rotation.user], ['accelerometer_rotation', rotation.auto]])
    adb('shell', 'settings', value === 'null' ? 'delete' : 'put', 'system', key,
      ...(value === 'null' ? [] : [value]));
  await page?.close();
  await browser?.close();
}
