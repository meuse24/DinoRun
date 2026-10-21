// Rotation, real UI input, isolated demo and responsive/offline attract screen.
// Optional HTML path; DINO_BROWSER=chromium|webkit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/attract'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-attract-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, frames) => page.evaluate(frames => {
  for (let i = 0; i < frames; i++) window.__dinoRunner.update(1000 / 60);
  window.__dinoRunner.draw(1);
}, frames);
const report = [];
let browser;
try {
  browser = await pw[engine].launch({ headless: true });
  const device = engine === 'webkit' ? pw.devices['iPhone 13'] : pw.devices['Pixel 7'];
  for (const config of [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'full-hd', viewport: { width: 1920, height: 1080 } },
    { name: 'laptop', viewport: { width: 1366, height: 768 } },
    { name: 'wide-short', viewport: { width: 1920, height: 500 } },
    { name: 'tablet', viewport: { width: 1024, height: 768 } },
    { ...device, name: 'portrait', viewport: { width: 390, height: 844 } },
    { ...device, name: 'landscape', viewport: { width: 844, height: 390 } },
    { ...device, name: 'compact-landscape', viewport: { width: 663, height: 234 } },
    { ...device, name: 'wide-phone', viewport: { width: 844, height: 234 } },
    { ...device, name: 'small-portrait', viewport: { width: 320, height: 568 } },
  ]) {
    const { name, defaultBrowserType, ...options } = config;
    const context = await browser.newContext({ ...options, screen: options.viewport, serviceWorkers: 'block' });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => requests.push(r.url()));
    await page.addInitScript(() => {
      const audio = new EventTarget();
      audio.play = () => Promise.resolve(); audio.pause = () => {};
      let seed = 937;
      window.__attractRandomCalls = 0;
      window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null, musicAudio: audio,
        now: () => 1000, random: () => {
          window.__attractRandomCalls++;
          return ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
        } };
      try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
    });
    // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
    await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
    await page.goto(pathToFileURL(file).href);
    await context.setOffline(true);
    await page.waitForFunction(() => !!window.__dinoRunner);
    assert.equal(await page.locator('#scores-open').count(), 0);
    assert.equal((await state(page)).state, 'attract');
    assert.equal((await state(page)).attract.panel, 'scores');
    assert.equal(await page.locator('#attract-score-empty').isVisible(), true);
    await page.screenshot({ path: path.join(output, `${name}-empty.png`) });
    await page.evaluate(() => {
      const r = window.__dinoRunner;
      for (let i = 0; i < 10; i++) r.highscoreController.store.addLocal('normal', {
        id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
        name: String.fromCharCode(65 + i).repeat(4), score: 900 - i * 50,
        achievedAt: '2026-10-17T10:00:00Z', device: 'desktop', input: 'keyboard',
      });
      r.attract.renderScores();
    });
    assert.equal(await page.locator('#attract-score-list li').count(), 5);
    assert.match(await page.locator('#attract-score-list').innerText(), /AAAA/);
    const before = await page.evaluate(() => ({
      local: window.__dinoRunner.highscoreController.store.local('normal'),
      highScore: window.__dinoGame.highScore,
    }));
    const startRect = await page.locator('#start-game').boundingBox();
    const checkStart = async () => {
      const rect = await page.locator('#start-game').boundingBox();
      assert(rect && rect.height >= 60 && rect.width >= 180, 'Prominent start target');
      for (const key of ['x', 'y', 'width', 'height'])
        assert(Math.abs(rect[key] - startRect[key]) <= 1, `${name}: Start ${key} moved between slides: ${JSON.stringify({ before: startRect, after: rect })}`);
      assert.equal(await page.locator('#start-game').evaluate(button => {
        const r = button.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth &&
          button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), true, 'Start remains on screen and unobstructed');
      assert.equal(await page.locator('#start-view h1').evaluate(title => {
        const r = title.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }), true, 'Title remains on screen');
      if (options.viewport.width > options.viewport.height) {
        const layout = await page.evaluate(() => {
          const stage = document.getElementById('stage').getBoundingClientRect();
          const game = document.getElementById('game').getBoundingClientRect();
          const style = getComputedStyle(document.getElementById('page'));
          const canvas = document.querySelector('canvas');
          return { stage: stage.toJSON(), game: game.toJSON(),
            available: innerWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            renderedAspect: canvas.width / canvas.height, logicalWidth: window.__dinoGame.world.width,
            previewWidth: window.__dinoRunner.attract.demo.world.width };
        });
        assert(Math.abs(layout.stage.width - layout.available) < 1, name + ': use the full safe width');
        assert(layout.stage.height <= 521, name + ': compact landscape height');
        assert(layout.game.top >= -1 && layout.game.bottom <= options.viewport.height + 1,
          name + ': preview fits vertically');
        assert(Math.abs(layout.renderedAspect / (layout.game.width / layout.game.height) - 1) < 0.005,
          name + ': preview artwork keeps equal horizontal/vertical scale');
        assert.equal(layout.logicalWidth, 600, 'Preview sizing leaves real gameplay world unchanged');
        assert(Math.abs(layout.previewWidth / 220 - layout.game.width / layout.game.height) < 0.005);
      }
    };
    await checkStart();
    await page.screenshot({ path: path.join(output, `${name}-scores.png`) });
    await page.evaluate(() => { document.getElementById('install-game').hidden = false; });
    await checkStart();
    assert.equal(await page.locator('#install-game').evaluate(button => {
      const r = button.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight &&
        button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true, 'Hosted install action stays usable beside Start and utility controls');
    await page.screenshot({ path: path.join(output, `${name}-install.png`) });
    await page.evaluate(() => { document.getElementById('install-game').hidden = true; });
    await page.locator('#start-game').focus();
    await advance(page, 242);
    assert.match(await page.locator('#attract-score-list').innerText(), /FFFF/);
    assert.match(await page.locator('#attract-score-list').innerText(), /JJJJ/);
    await checkStart();
    await advance(page, 242);
    assert.equal((await state(page)).attract.panel, 'demo');
    assert.equal(await page.locator('#start-game').evaluate(b => document.activeElement === b), true,
      'Rotation must not steal keyboard focus');
    await advance(page, 120);
    const demo = await state(page);
    assert.equal(demo.state, 'attract');
    assert.equal(demo.score, 0);
    assert(demo.attract.demo.score > 0);
    assert(demo.attract.demo.obstacles.length > 0, 'Demo uses real moving hazards');
    await checkStart();
    await page.screenshot({ path: path.join(output, `${name}-demo.png`) });
    // Explicit pause freezes both slide timer and the independent simulation.
    await page.locator('#attract-pause').click();
    const frozen = (await state(page)).attract;
    await advance(page, 120);
    assert.deepEqual((await state(page)).attract, frozen);
    await page.locator('#attract-pause').click();
    await advance(page, 485);
    assert.equal((await state(page)).attract.panel, 'powerups');
    await checkStart();
    // With transitions, the slide moves in 16 px (T2); measure its final layout.
    if (process.env.DINO_TRANSITIONS === '1') await page.evaluate(() => window.__dinoTest.transitionDone());
    assert.equal(await page.locator('.attract-powerup:visible').count(), 3);
    for (const card of await page.locator('.attract-powerup').all()) {
      assert.equal(await card.evaluate(card => {
        const r = card.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      }), true, 'Every power-up stays on screen');
    }
    await page.screenshot({ path: path.join(output, `${name}-powerups.png`) });
    fs.writeFileSync(path.join(output, `${name}-layout.json`), JSON.stringify(await page.evaluate(() =>
      Object.fromEntries(['#start-view h1', '#attract-content', '#attract-powerups', '#attract-footer'].map(selector => {
        const element = document.querySelector(selector), r = element.getBoundingClientRect();
        return [selector, { x: r.x, y: r.y, height: r.height, width: r.width,
          display: getComputedStyle(element).display, scroll: element.scrollTop }];
      }))), null, 2));
    // Help/settings suspend rotation; returning does not skip ahead.
    await page.locator('#settings-open').click();
    const paused = await state(page);
    await advance(page, 100);
    assert.deepEqual(await state(page), paused);
    await page.locator('#settings-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await advance(page, 545);
    assert.equal((await state(page)).attract.panel, 'scores', 'Carousel loops');
    const after = await page.evaluate(() => ({
      local: window.__dinoRunner.highscoreController.store.local('normal'),
      highScore: window.__dinoGame.highScore,
    }));
    assert.deepEqual(after, before, 'Demo cannot alter real records');
    assert.deepEqual(await page.evaluate(() => ({ games: window.__dinoRunner.stats.games,
      deaths: window.__dinoRunner.stats.deaths, round: window.__dinoRunner.highscoreController.round })),
    { games: 0, deaths: 0, round: null });
    assert.equal(await page.evaluate(() => {
      const r = window.__dinoRunner, calls = window.__attractRandomCalls;
      r.attract.select(1);
      for (let i = 0; i < 100; i++) r.attract.advance(1000 / 60);
      return calls === window.__attractRandomCalls && r.attract.demo.world !== r.game.world;
    }), true, 'Private RNG and world');
    const demoActions = await page.evaluate(() => {
      const a = window.__dinoRunner.attract;
      a.userPaused = false; a.select(1);
      let jumped = false, ducked = false;
      for (let i = 0; i < 550; i++) {
        a.advance(1000 / 60);
        jumped ||= a.demo.trex.jumping;
        ducked ||= a.demo.trex.ducking;
      }
      return { jumped, ducked };
    });
    assert.deepEqual(demoActions, { jumped: true, ducked: true }, 'Demo demonstrates both controls');
    // Every slide can start a real, empty round via the same touch/mouse target.
    for (const index of [0, 1, 2]) {
      await page.locator(`[data-attract-slide="${index}"]`).click();
      if (options.hasTouch) await page.locator('#start-game').tap();
      else await page.locator('#start-game').click();
      await advance(page, 1);
      const started = await state(page);
      assert.equal(started.state, 'playing');
      assert.equal(started.score, 0);
      assert.equal(started.shield.charged, false);
      assert.equal(started.feather.charged, false);
      assert.equal(started.chili.remainingMs, 0);
      // With transitions, START fades out inert for 140 ms (T4) before it is hidden.
      if (process.env.DINO_TRANSITIONS === '1') await page.evaluate(() => window.__dinoTest.transitionDone());
      assert.equal(await page.locator('#start-game').isVisible(), false);
      assert.equal(await page.evaluate(() => window.__dinoRunner.game.world.width),
        options.viewport.width <= 600 && options.viewport.height >= options.viewport.width ? 420 : 600);
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.highscoreController.roundLeft(); r.game.newSession(); r.draw(1);
      });
    }
    await page.locator('#start-game').focus();
    await page.keyboard.press('Enter');
    assert.equal((await state(page)).state, 'playing', 'Keyboard start');
    await page.evaluate(() => { window.__dinoGame.newSession(); window.__dinoRunner.draw(1); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__dinoGame.trex.reducedMotion.matches);
    await page.evaluate(() => { window.__dinoRunner.attract.userPaused = null; window.__dinoRunner.draw(1); });
    const reduced = (await state(page)).attract;
    await advance(page, 600);
    assert.deepEqual((await state(page)).attract, reduced, 'Reduced motion defaults to paused preview');
    await page.locator('[data-attract-slide="1"]').click();
    await checkStart();
    await page.screenshot({ path: path.join(output, `${name}-reduced-demo.png`) });
    if (name === 'desktop') {
      // Deferred online responses must not show the previous mode's leaderboard.
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        window.__attractLoads = [];
        window.__attractResolve = {};
        r.highscoreController.api.url = 'https://scores.invalid/test';
        r.highscoreController.api.list = mode => {
          window.__attractLoads.push(mode);
          return new Promise(resolve => { window.__attractResolve[mode] = resolve; });
        };
        r.attract.select(0); r.draw(1);
      });
      await page.locator('#settings-open').click();
      await page.locator('#mode-select').selectOption('relaxed');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        const entries = r.highscoreController.store.local('normal');
        window.__attractResolve.normal({ entries });
        window.__attractResolve.relaxed({ entries: [{ ...entries[0], name: 'ZZZZ', score: 444 }] });
      });
      await page.waitForFunction(() => window.__dinoRunner.highscoreController.online.relaxed.state === 'ok');
      assert.match(await page.locator('#attract-score-source').textContent(), /Online.*Relaxed/);
      assert.match(await page.locator('#attract-score-list').textContent(), /ZZZZ/);
      assert.doesNotMatch(await page.locator('#attract-score-list').textContent(), /AAAA/);
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await page.evaluate(() => {
        const a = window.__dinoRunner.attract;
        a.select(0); a.select(2); a.select(0);
      });
      assert.deepEqual(await page.evaluate(() => window.__attractLoads), ['normal', 'relaxed'],
        'Rotation cannot poll repeatedly');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.highscoreController.online.relaxed = { state: 'error' };
        r.attract.renderScores();
      });
      assert.match(await page.locator('#attract-score-source').textContent(), /Saved online/);
      assert.match(await page.locator('#attract-score-list').textContent(), /ZZZZ/);
      // A paused preview must also resize correctly across orientation changes.
      await page.locator('#settings-open').click();
      const elapsed = (await state(page)).attract.elapsedMs;
      for (const [width, height] of [[1920, 500], [390, 844], [844, 234], [1280, 720]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height,
          { width, height });
        await page.evaluate(() => { window.__dinoRunner.resize(); window.__dinoRunner.draw(1); });
        assert.equal((await state(page)).attract.elapsedMs, elapsed, 'Resize preserves paused preview time');
        const resized = await page.evaluate(() => {
          const r = document.getElementById('game').getBoundingClientRect(), c = document.querySelector('canvas');
          return { aspect: r.width / r.height, backing: c.width / c.height,
            rect: r.toJSON(), width: window.__dinoGame.world.width,
            wide: window.__dinoRunner.attract.wide, previewWidth: window.__dinoRunner.attract.demo.world.width,
            media: matchMedia('(orientation: landscape)').matches };
        });
        assert(Math.abs(resized.backing / resized.aspect - 1) < 0.005,
          'Orientation keeps preview proportions: ' + JSON.stringify({ width, height, resized }));
        assert.equal(resized.width, width === 390 ? 420 : 600);
      }
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await checkStart();
    }
    assert.deepEqual(errors, [], name + ': browser errors');
    assert(requests.every(url => url === pathToFileURL(file).href), 'Standalone requests no required asset');
    const geometry = await page.locator('#stage').boundingBox();
    report.push({ name, engine, version: browser.version(), viewport: options.viewport, geometry,
      touch: !!options.hasTouch, checks: 'passed', errors });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`${engine} ${browser.version()}: attract rotation, isolated demo, CTA/input and ${report.length} layouts passed`);
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
