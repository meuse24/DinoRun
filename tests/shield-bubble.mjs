// Actual standalone HTML, isolated from scores/network. Optional delivery path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/shield'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-shield-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const report = [];
let browser;
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const prepare = page => page.evaluate(() => window.__shieldFixture.prepare());
const step = (page, frames = 1, clear = false) => page.evaluate(({ frames, clear }) => {
  for (let i = 0; i < frames; i++) {
    if (clear) window.__dinoGame.horizon.obstacles.length = 0;
    window.advanceTime(1000 / 60);
  }
}, { frames, clear });
const collect = async page => {
  await page.evaluate(() => {
    const g = window.__dinoGame;
    g.shield.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
  });
  await step(page);
  assert.equal((await state(page)).shield.charged, true);
};
const hazard = (page, type, size = 1) => page.evaluate(({ type, size }) =>
  window.__shieldFixture.hazard(type, size), { type, size });

try {
  browser = await pw[engine].launch({ headless: true });
  const device = engine === 'webkit' ? pw.devices['iPhone 13'] : pw.devices['Pixel 7'];
  for (const config of [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { ...device, name: 'portrait', viewport: { width: 390, height: 844 } },
    { ...device, name: 'landscape', viewport: { width: 844, height: 390 } },
  ]) {
    const { name, defaultBrowserType, ...options } = config;
    // Keep emulated device screen and viewport in the same orientation. A
    // portrait device screen with an initial landscape viewport leaves Windows
    // WebKit's layout/media queries stale on the first rotation back to portrait.
    const context = await browser.newContext({ ...options, screen: options.viewport, serviceWorkers: 'block' });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => requests.push(r.url()));
    await page.addInitScript(() => {
      let seed = 937;
      window.__shieldRandomCalls = 0;
      const audio = new EventTarget();
      audio.play = () => Promise.resolve(); audio.pause = () => {};
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio: audio,
        now: () => 1000, random: () => {
          window.__shieldRandomCalls++;
          return ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        } };
      try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
    });
    // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
    await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
    await page.goto(pathToFileURL(file).href);
    await context.setOffline(true);
    await page.waitForFunction(() => !!window.__dinoRunner);
    await page.evaluate(() => {
      const g = window.__dinoGame, r = window.__dinoRunner;
      window.__shieldEvents = [];
      g.on(e => { if (e.type !== 'step') window.__shieldEvents.push(e.type); });
      window.__shieldFixture = {
        prepare() {
          r.highscoreController.roundLeft();
          g.newSession(); g.beginRound(0); g.endJump();
          for (let i = 0; i < 65; i++) window.advanceTime(1000 / 60);
          g.gameTime = 4000;
          g.lives = 1; // Final-life shield/collision regressions.
          g.horizon.obstacles.length = 0;
          g.turbo.spawnTimer = g.feather.spawnTimer = g.shield.spawnTimer = 1e9;
          r.renderer.effects.reset();
          window.__shieldEvents.length = 0;
          g.capturePrevious(); r.draw(1);
          document.getElementById('game').focus();
        },
        hazard(type = 'small', size = 1) {
          // Use the real obstacle type, collision boxes and movement method.
          let o;
          for (let i = 0; i < 100; i++) {
            g.horizon.obstacles.length = 0;
            g.horizon.addObstacle(13, 1000);
            o = g.horizon.obstacles[0];
            if (o.type.name === type) break;
          }
          if (o.type.name !== type) throw new Error('Missing obstacle type: ' + type);
          o.size = size;
          o.gap = 1e9; // Keep the contact fixture free of a new, unrelated spawn.
          o.x = g.trex.x + 12 + g.speed * g.turbo.multiplier;
          if (type === 'ptero') o.y = 156;
          return { type: o.type.name, size: o.size };
        },
      };
    });
    await prepare(page);
    await page.screenshot({ path: path.join(output, `${name}-before.png`) });
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.shield.pickup = { x: 210, y: 157 };
      g.capturePrevious(); window.__dinoRunner.draw(1);
    });
    await page.screenshot({ path: path.join(output, `${name}-pickup.png`) });
    await collect(page);
    await page.screenshot({ path: path.join(output, `${name}-protected.png`) });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Shield ready'));

    // Stored charge lasts, survives jumps/ducking, and uses all existing controls.
    if (options.hasTouch) await page.locator('#touch-jump').tap();
    else await page.keyboard.press('Space');
    await step(page, 7, true);
    assert.equal((await state(page)).shield.charged, true);
    await page.screenshot({ path: path.join(output, `${name}-jump.png`) });
    await step(page, 65, true);
    await page.keyboard.down('ArrowDown');
    await step(page);
    assert.equal((await state(page)).player.ducking, true);
    await page.screenshot({ path: path.join(output, `${name}-duck.png`) });
    await page.keyboard.up('ArrowDown');
    await step(page, 1800, true);
    assert.equal((await state(page)).shield.charged, true, 'No expiry or duplicate pickup');
    assert.equal((await state(page)).shield.pickup, null);

    for (const [type, size] of [['small', 1], ['large', 3], ['ptero', 1]]) {
      await prepare(page); await collect(page);
      await hazard(page, type, size);
      const score = (await state(page)).score;
      await step(page);
      const saved = await state(page);
      assert.equal(saved.state, 'playing', `${type}/${size}: survive`);
      assert.equal(saved.shield.charged, false);
      assert(saved.shield.popRemainingMs > 0);
      assert.equal(saved.obstacles.length, 0, 'Whole obstacle is removed');
      assert(saved.score >= score, 'Round continues scoring');
      assert.equal(await page.evaluate(() => window.__shieldEvents.filter(e => e === 'shieldPop').length), 1);
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Shield popped'));
      assert.equal(await page.locator('#coach').isVisible(), false, 'No stale shield hint');
      await page.screenshot({ path: path.join(output, `${name}-pop-${type}.png`) });
      await step(page, 5);
      assert.equal((await state(page)).state, 'playing', 'No repeated hit from removed obstacle');
      await hazard(page, 'ptero');
      await step(page);
      assert.equal((await state(page)).state, 'crashed', 'Next hit is lethal during pop animation');
      assert.deepEqual((await state(page)).shield, { charged: false, pickup: null, popRemainingMs: 0 });
    }

    // Two separate contacts in one step cannot turn one charge into two lives.
    await prepare(page); await collect(page); await hazard(page, 'small');
    await page.evaluate(() => {
      const a = window.__dinoGame.horizon.obstacles;
      a.push(Object.assign(Object.create(Object.getPrototypeOf(a[0])), a[0]));
    });
    await step(page);
    assert.equal((await state(page)).state, 'crashed');
    assert.equal(await page.evaluate(() => window.__shieldEvents.filter(e => e === 'shieldPop').length), 1);

    // Collection precedes damage resolution in the same simulation step.
    await prepare(page); await hazard(page, 'small');
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.shield.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
    });
    await step(page);
    assert.equal((await state(page)).state, 'playing');
    assert.equal((await state(page)).shield.charged, false);
    assert.deepEqual(await page.evaluate(() => window.__shieldEvents), ['shield', 'shieldPop']);

    await prepare(page); await collect(page);
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.turbo.activate(g.trex); g.feather.charged = true;
    });
    await hazard(page, 'large', 3); await step(page);
    assert.equal((await state(page)).shield.charged, true, 'Chili saves the charge on cacti');
    assert.equal((await state(page)).feather.charged, true);
    await hazard(page, 'ptero'); await step(page);
    assert.equal((await state(page)).shield.charged, false, 'Bird consumes shield during Chili');
    assert((await state(page)).chili.remainingMs > 0);
    assert.equal((await state(page)).feather.charged, true);

    // No shield: preserve normal collision and duck-under-bird behavior.
    await prepare(page); await hazard(page, 'small'); await step(page);
    assert.equal((await state(page)).state, 'crashed');
    await prepare(page); await collect(page); await hazard(page, 'ptero');
    await page.evaluate(() => { window.__dinoGame.horizon.obstacles[0].y = 136; });
    await page.keyboard.down('ArrowDown'); await step(page);
    assert.equal((await state(page)).shield.charged, true, 'A near miss does not consume protection');
    await page.keyboard.up('ArrowDown');

    // Real pause freezes both held protection and pop/pickup clocks.
    await page.locator('#settings-open').click();
    const paused = await state(page);
    await step(page, 120);
    assert.deepEqual(await state(page), paused);
    await page.locator('#settings-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await page.waitForFunction(() => window.__dinoGame.world.width === 420);
    } catch (error) {
      console.error(name, await page.evaluate(() => ({
        inner: [innerWidth, innerHeight], world: window.__dinoGame.world.width,
        portrait: matchMedia('(max-width:600px) and (orientation:portrait)').matches,
        paused: window.__dinoRunner.paused,
      })));
      throw error;
    }
    assert.equal((await state(page)).shield.charged, true);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.__dinoGame.world.width === 600);
    assert.equal((await state(page)).shield.charged, true);
    await page.setViewportSize(options.viewport);
    await page.waitForFunction(() => window.__dinoGame.world.width ===
      (matchMedia('(max-width:600px) and (orientation:portrait)').matches ? 420 : 600));

    // Direct component checks cover timers/sweep without moving the whole world.
    assert.deepEqual(await page.evaluate(() => {
      const g = window.__dinoGame, s = new g.shield.constructor(true, { width: 420 });
      const calls = window.__shieldRandomCalls, dt = 1000 / 60, t = g.trex;
      s.update(9999, t, 0, [], null, null);
      const firstDelay = !s.pickup;
      s.update(1, t, 0, [], null, null);
      const worldWidth = s.pickup.x === 444;
      s.reset(); s.spawnTimer = 0;
      s.update(dt, t, 0, [{ x: 440, width: 50, size: 3 }], null, null);
      const hazardSafe = !s.pickup;
      s.spawnTimer = 0; s.update(dt, t, 0, [], { x: 444 }, null);
      const chiliSafe = !s.pickup;
      s.spawnTimer = 0; s.update(dt, t, 0, [], null, { x: 444 });
      const featherSafe = !s.pickup;
      s.pickup = { x: t.x + 80, y: t.y + 24 };
      const swept = s.update(dt, t, 120, [], null, null) && s.charged;
      const timer = s.spawnTimer;
      s.update(60000, t, 0, [], null, null);
      const noStack = s.charged && !s.pickup && s.spawnTimer === timer;
      const consumed = s.consume(), consumedTwice = s.consume();
      s.update(23999, t, 0, [], null, null);
      const cooldown = !s.pickup;
      s.update(1, t, 0, [], null, null);
      const respawned = !!s.pickup;
      s.pickup = { x: -25, y: 0 }; s.update(dt, t, 0, [], null, null);
      const missed = !s.pickup && s.spawnTimer === 24000;
      const disabled = new g.shield.constructor(false, g.world);
      disabled.update(60000, t, 0, [], null, null);
      return { firstDelay, worldWidth, hazardSafe, chiliSafe, featherSafe, swept,
        noStack, consumed, consumedTwice, cooldown, respawned, missed,
        disabled: !disabled.pickup, rngUntouched: calls === window.__shieldRandomCalls };
    }), { firstDelay: true, worldWidth: true, hazardSafe: true, chiliSafe: true,
      featherSafe: true, swept: true, noStack: true, consumed: true, consumedTwice: false,
      cooldown: true, respawned: true, missed: true, disabled: true, rngUntouched: true });

    await prepare(page);
    assert.deepEqual(await page.evaluate(() => {
      const g = window.__dinoGame, s = g.shield;
      s.pickup = { x: g.world.width + 24, y: 157 };
      g.feather.spawnTimer = g.turbo.spawnTimer = 0;
      window.advanceTime(1000 / 60);
      return { corridor: !g.horizon.obstacles.length,
        feather: !g.feather.pickup, chili: !g.turbo.pickup };
    }), { corridor: true, feather: true, chili: true });

    // Reach a naturally scheduled bubble by scrolling, without granting a charge.
    await prepare(page);
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.shield.reset();
      for (let i = 0; i < 1400 && !g.shield.charged; i++) {
        g.horizon.obstacles = g.horizon.obstacles.filter(o => o.x > g.trex.x + 110);
        window.advanceTime(1000 / 60);
      }
    });
    assert.equal((await state(page)).shield.charged, true, 'Natural spawn, scroll and collection');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => window.__dinoRunner.renderer.darkQuery.matches);
    await page.evaluate(() => window.__dinoRunner.draw(1));
    await page.screenshot({ path: path.join(output, `${name}-night.png`) });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__dinoGame.trex.reducedMotion.matches);
    await page.evaluate(() => window.__dinoRunner.renderer.effects.reset());
    await hazard(page, 'small'); await step(page);
    assert.equal((await state(page)).particles, 0);
    assert.equal((await state(page)).state, 'playing');
    await page.screenshot({ path: path.join(output, `${name}-reduced-pop.png`) });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Pause also freezes a visible pickup and a pop in progress.
    for (const kind of ['pickup', 'pop']) {
      await prepare(page);
      if (kind === 'pickup') await page.evaluate(() => {
        window.__dinoGame.shield.pickup = { x: 250, y: 157 };
      });
      else { await collect(page); await hazard(page, 'small'); await step(page); }
      await page.locator('#settings-open').click();
      const before = await state(page);
      await step(page, 60); assert.deepEqual(await state(page), before);
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
    }

    await prepare(page); await collect(page);
    await page.evaluate(() => window.__dinoGame.beginRound(0));
    assert.equal((await state(page)).shield.charged, false);
    await prepare(page); await collect(page);
    await page.evaluate(() => window.__dinoGame.newSession());
    assert.deepEqual((await state(page)).shield, { charged: false, pickup: null, popRemainingMs: 0 });

    await page.locator('#info-link').click();
    const help = page.frameLocator('#info-view').locator('#shield-bubble-help');
    assert.match(await help.innerText(), /survive one cactus, bird or boss hit/);
    assert.match(await help.innerText(), /hold only one shield/);
    await help.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${name}-help.png`) });
    assert.deepEqual(errors, [], `${name}: browser errors`);
    assert(requests.every(url => url === pathToFileURL(file).href), 'No external dependency');
    report.push({ name, engine, version: browser.version(), viewport: options.viewport,
      touch: !!options.hasTouch, offline: true, checks: 'passed', errors });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Shield collection, one-hit protection, coexistence, lifecycle and help passed in ${engine} ${browser.version()} (${report.length} layouts).`);
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
