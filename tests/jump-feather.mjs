// Real-input powerup and smartphone regressions, using an isolated offline HTML.
// DINO_BROWSER=chromium|webkit; DINO_PLAYWRIGHT may name an installed ESM entry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/feather'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-feather-'));
const html = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), html);
let browser;
const report = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, frames, hazards = false) => page.evaluate(({ frames, hazards }) => {
  for (let i = 0; i < frames; i++) {
    // Isolate jump/control scenarios from unrelated natural obstacle collisions.
    if (!hazards && !window.__dinoRunner.paused) window.__dinoGame.horizon.obstacles.length = 0;
    window.advanceTime(1000 / 60);
  }
}, { frames, hazards });
const prepare = page => page.evaluate(() => {
  const r = window.__dinoRunner, g = r.game;
  r.highscoreController.roundLeft();
  g.newSession();
  g.beginRound(0);
  g.endJump();
  for (let i = 0; i < 60; i++) window.advanceTime(1000 / 60);
  g.gameTime = 4000;
  g.horizon.obstacles.length = 0;
  g.feather.spawnTimer = g.turbo.spawnTimer = 1e9;
  window.__featherEvents.length = 0;
  document.getElementById('game').focus();
});
const collect = async page => {
  await page.evaluate(() => {
    const g = window.__dinoGame;
    g.feather.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
  });
  await advance(page, 1);
  assert.equal((await state(page)).feather.charged, true, 'Overlapping pickup charges the feather');
};

try {
  browser = await pw[engine].launch({ headless: true });
  const device = engine === 'webkit' ? pw.devices['iPhone 13'] : pw.devices['Pixel 7'];
  for (const config of [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { ...device, name: 'phone-portrait', viewport: { width: 390, height: 844 } },
    { ...device, name: 'phone-landscape', viewport: { width: 844, height: 390 } },
  ]) {
    const { name, defaultBrowserType, ...options } = config;
    // Windows WebKit cannot navigate file:// with its offline flag already set.
    // Block HTTP before navigation, then set the flag after the standalone loads.
    const context = await browser.newContext({ ...options, offline: engine !== 'webkit', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await context.route(/^https?:/, route => route.abort());
    await page.addInitScript(() => {
      let seed = 143;
      window.__featherRandomCalls = 0;
      const audio = new EventTarget();
      audio.play = () => Promise.resolve();
      audio.pause = () => {};
      window.__dinoTest = {
        manualFrames: true, highscoreApiUrl: null, musicAudio: audio,
        now: () => 1000,
        random: () => {
          window.__featherRandomCalls++;
          return ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        },
      };
      try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
    });
    // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
    await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    if (engine === 'webkit') await context.setOffline(true);
    await page.waitForFunction(() => !!window.__dinoRunner);
    await page.evaluate(() => {
      window.__featherEvents = [];
      window.__dinoGame.on(e => window.__featherEvents.push({ type: e.type, airborne: !!e.airborne }));
    });
    await prepare(page);

    // Show the actual collectible before testing collection through fixed steps.
    await page.evaluate(() => {
      const r = window.__dinoRunner;
      r.game.feather.pickup = { x: 210, y: 157 };
      r.game.capturePrevious();
      r.draw(1);
    });
    await page.screenshot({ path: path.join(output, `${name}-pickup.png`) });
    await collect(page);
    await page.screenshot({ path: path.join(output, `${name}-charged.png`) });
    // Landing and a held/repeated first press must keep the stored charge.
    await page.keyboard.down('Space');
    await advance(page, 8);
    await page.keyboard.down('Space');
    assert.equal((await state(page)).feather.charged, true, 'Key repeat cannot spend the charge');
    await page.keyboard.up('Space');
    await advance(page, 60);
    assert.equal((await state(page)).player.jumping, false);
    assert.equal((await state(page)).feather.charged, true, 'Landing keeps the charge');
    await page.keyboard.press('Space');
    await advance(page, 10);
    const before = await state(page);
    await page.keyboard.down('Space');
    assert.equal((await state(page)).feather.charged, false);
    assert.equal(await page.evaluate(() => window.__dinoGame.pendingJumpUntil), 0);
    await advance(page, 2);
    assert((await state(page)).player.y < before.player.y, 'Air jump provides immediate lift');
    assert.equal(await page.locator('#coach').isVisible(), false, 'Spent feather must not still say ready');
    await page.screenshot({ path: path.join(output, `${name}-air-jump.png`) });
    await page.keyboard.up('Space');
    const velocity = (await state(page)).player.velocity;
    await page.keyboard.press('Space');
    assert.equal((await state(page)).player.velocity, velocity, 'No third jump without another feather');
    assert.equal(await page.evaluate(() => window.__featherEvents.filter(e => e.airborne).length), 1);

    // A collectible received mid-jump is available only on the next fresh press.
    await prepare(page);
    await page.keyboard.down('Space');
    await advance(page, 5);
    await collect(page);
    await page.keyboard.down('Space');
    assert.equal((await state(page)).feather.charged, true);
    await page.keyboard.up('Space');
    await page.keyboard.press('Space');
    assert.equal((await state(page)).feather.charged, false);

    // Pointer/touch uses the same command, including the visible mobile Jump button.
    await prepare(page);
    await collect(page);
    if (options.hasTouch) {
      await page.locator('#touch-jump').tap();
      await advance(page, 8);
      assert.equal((await state(page)).feather.charged, true);
      await page.locator('#touch-jump').tap();
    } else {
      const box = await page.locator('canvas').boundingBox();
      await page.mouse.click(box.x + 120, box.y + box.height / 2);
      await advance(page, 8);
      await page.mouse.click(box.x + 120, box.y + box.height / 2);
    }
    assert.equal((await state(page)).feather.charged, false, 'Pointer/touch air jump');

    await prepare(page);
    await collect(page);
    assert.deepEqual(await page.evaluate(() => {
      const r = window.__dinoRunner;
      const pad = { index: 0, connected: true, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0] };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      pad.buttons[0].pressed = true;
      r.gamepad.poll(true);
      r.gamepad.poll(true);
      const held = r.game.feather.charged;
      pad.buttons[0].pressed = false;
      r.gamepad.poll(true);
      window.advanceTime(1000 / 60);
      pad.buttons[0].pressed = true;
      r.gamepad.poll(true);
      const spent = r.game.feather.charged;
      pad.buttons[0].pressed = false;
      r.gamepad.poll(true);
      return [held, spent];
    }), [true, false], 'Gamepad rising edges, no held-button retrigger');

    // Simulation invariants: no stacking, RNG isolation, hazard separation, sweep and cooldown.
    await prepare(page);
    assert.deepEqual(await page.evaluate(() => {
      const g = window.__dinoGame, f = g.feather, t = g.trex;
      const step = 1000 / 60;
      const width = matchMedia('(max-width:600px) and (orientation:portrait)').matches ? 420 : 600;
      const calls = window.__featherRandomCalls;
      f.spawnTimer = 0;
      f.update(step, t, 6, [{ x: width + 24, width: 50, size: 1 }], null);
      const hazardSafe = !f.pickup;
      f.spawnTimer = 0;
      f.update(step, t, 6, [], { x: width + 24 });
      const chiliSafe = !f.pickup;
      f.spawnTimer = 0;
      f.update(step, t, 6, [], null);
      const spawned = f.pickup?.x === width + 24;
      f.pickup = { x: t.x + 60, y: t.y + 20 };
      const swept = f.update(step, t, 100, [], null) && f.charged;
      const timer = f.spawnTimer;
      for (let i = 0; i < 1000; i++) f.update(step, t, 6, [], null);
      const noStack = f.charged && !f.pickup && f.spawnTimer === timer;
      f.consume();
      f.update(17999, t, 0, [], null);
      const cooldown = !f.pickup;
      f.update(1, t, 0, [], null);
      const respawned = !!f.pickup;
      return { hazardSafe, chiliSafe, spawned, swept, noStack, cooldown, respawned,
        rngUntouched: calls === window.__featherRandomCalls };
    }), { hazardSafe: true, chiliSafe: true, spawned: true, swept: true, noStack: true,
      cooldown: true, respawned: true, rngUntouched: true });

    // Normal play reaches a collectible without test-granting a charge.
    await prepare(page);
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.feather.reset();
      for (let i = 0; i < 480 && !g.feather.charged; i++) {
        g.horizon.obstacles = g.horizon.obstacles.filter(o => o.x > g.trex.x + 100);
        window.advanceTime(1000 / 60);
      }
    });
    assert.equal((await state(page)).feather.charged, true, 'Natural spawn, scroll and collection');

    assert.equal(await page.evaluate(() => {
      const g = window.__dinoGame;
      const width = matchMedia('(max-width:600px) and (orientation:portrait)').matches ? 420 : 600;
      g.feather.charged = false;
      g.feather.pickup = { x: width + 24, y: 157 };
      g.horizon.obstacles.length = 0;
      window.advanceTime(1000 / 60);
      const reserved = g.horizon.obstacles.length === 0;
      g.feather.pickup = null;
      g.feather.charged = true;
      return reserved;
    }), true, 'Future obstacles respect the collectible corridor');

    // Chili coexistence, pause persistence and orientation changes.
    await page.evaluate(() => window.__dinoGame.turbo.activate(window.__dinoGame.trex));
    await page.locator('#settings-open').click();
    const paused = await state(page);
    await advance(page, 30);
    assert.deepEqual(await state(page), paused);
    await page.locator('#settings-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal((await state(page)).feather.charged, true);
    await page.keyboard.press('Space');
    await advance(page, 8);
    await page.keyboard.press('Space');
    assert.equal((await state(page)).feather.charged, false);
    assert((await state(page)).chili.remainingMs > 0);
    await page.setViewportSize(options.viewport);

    await prepare(page);
    await collect(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__dinoGame.trex.reducedMotion.matches);
    await page.evaluate(() => window.__dinoRunner.renderer.effects.reset());
    await page.keyboard.press('Space');
    await advance(page, 10);
    await page.keyboard.press('Space');
    assert.equal((await state(page)).feather.charged, false);
    assert.equal((await state(page)).particles, 0, 'Reduced motion suppresses burst particles');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    for (const delay of [1, 12, 20, 30]) {
      await prepare(page);
      await collect(page);
      await page.evaluate(() => { window.__dinoGame.speed = 13; window.__dinoGame.jump(); });
      await advance(page, delay);
      await page.evaluate(() => window.__dinoGame.jump());
      const minY = await page.evaluate(() => {
        let min = window.__dinoGame.trex.y;
        for (let i = 0; i < 80; i++) { window.advanceTime(1000 / 60); min = Math.min(min, window.__dinoGame.trex.y); }
        return min;
      });
      assert(minY >= 0, `Air jump must remain visible: y=${minY}`);
    }

    await prepare(page);
    await collect(page);
    await page.evaluate(() => {
      const g = window.__dinoGame, o = g.horizon.obstacles[0];
      o.x = g.trex.x + 10;
      o.type = { ...o.type, name: 'small' };
    });
    await advance(page, 1, true);
    assert.equal((await state(page)).state, 'crashed', 'A charged feather grants no immunity');
    assert.equal((await state(page)).feather.charged, false);
    await advance(page, 165);
    await page.evaluate(() => window.__dinoGame.restart(0));
    assert.equal((await state(page)).feather.charged, false);
    await page.evaluate(() => { const g = window.__dinoGame; g.feather.charged = true; g.newSession(); });
    assert.deepEqual((await state(page)).feather, { charged: false, pickup: null });

    await page.locator('#info-link').click();
    const help = page.frameLocator('#info-view').locator('#jump-feather-help');
    assert.match(await help.innerText(), /press jump again in the\s+air/);
    assert.match(await help.innerText(), /hold only one feather/);
    await help.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${name}-help.png`) });
    assert.deepEqual(errors, [], `${name}: browser errors`);
    assert(requests.every(url => url === pathToFileURL(html).href),
      `The offline game requested an external dependency: ${requests}`);
    report.push({ name, engine, version: browser.version(), touch: !!options.hasTouch,
      viewport: options.viewport, offline: true, checks: 'passed', errors });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Passed feather controls, physics, pickups, lifecycle and help in ${engine} ${browser.version()} (${report.length} layouts).`);
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
