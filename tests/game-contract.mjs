// Standalone contract: no historical HTML, PHP runtime or preview server needed.
// Usage: node tests/game-contract.mjs [game.html]
// DINO_PLAYWRIGHT may name an installed Playwright ESM entry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const source = fs.readFileSync(process.argv[2] || path.join(root, 'dino.html'), 'utf8');
// Named constants are audited in the readable source. The selected artifact
// itself is parsed and exercised below, including runtime mode/score behavior.
const ruleSource = fs.readFileSync(path.join(root, 'dino.html'), 'utf8');
const php = fs.readFileSync(path.join(root, 'highscores-lib.php'), 'utf8');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/refactoring'), `contract-${engine}`);
fs.mkdirSync(output, { recursive: true });
for (const [, script] of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
  new vm.Script(script);
assert(!/<script\b[^>]*\bsrc\s*=|<script\b[^>]*\btype\s*=\s*["']module/i.test(source),
  'The game must run without external or ES module scripts');
assert(!/<link\b[^>]*\brel\s*=\s*["']stylesheet|@import\s/i.test(source),
  'Styles must remain embedded');

const phpNumber = name => Number(php.match(new RegExp(`const ${name} = ([\\d.]+);`))?.[1]);
const jsNumber = name => Number(ruleSource.match(new RegExp(`\\b${name} = ([\\d.]+)[,;]`))?.[1]);
assert.equal(jsNumber('FPS'), phpNumber('DINO_STEPS_PER_SECOND'));
assert.equal(jsNumber('CHILI_MULTIPLIER'), phpNumber('DINO_TURBO'));
assert.equal(jsNumber('POINTS_PER_PX'), phpNumber('DINO_POINTS_PER_PX'));
assert.equal(jsNumber('HIGHSCORE_API_VERSION'), phpNumber('DINO_API_VERSION'));
assert.equal(jsNumber('HIGHSCORE_LIST_SIZE'), phpNumber('DINO_LIST_SIZE'));
const phpSpeeds = Object.fromEntries([...php.match(/const DINO_MAX_SPEED = \[(.+)\];/)[1]
  .matchAll(/'(\w+)' => ([\d.]+)/g)].map(([, mode, speed]) => [mode, Number(speed)]));

// The temporary directory deliberately contains only the HTML. No sibling assets.
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-contract-'));
const file = path.join(isolated, 'dino.html');
fs.writeFileSync(file, source);
let networkDown = false;
const server = http.createServer((request, response) => {
  if (networkDown) { request.socket.destroy(); return; }
  if (request.url === '/dino.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(source);
  } else if (['/service-worker.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
    '/icon-180.png'].includes(request.url)) {
    const types = { '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
    response.writeHead(200, { 'Content-Type': types[path.extname(request.url)] });
    fs.createReadStream(path.join(root, request.url.slice(1))).pipe(response);
  } else {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/dino.html`;
const playwright = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
let browser;
const report = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => {
  for (let remaining = ms; remaining > 0; remaining -= 1000 / 60)
    window.advanceTime(Math.min(remaining, 1000 / 60));
}, ms);

try {
  browser = await playwright[engine].launch({ headless: true });
  for (const config of [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'portrait', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { name: 'landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { name: 'compact-landscape', viewport: { width: 663, height: 234 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3.375 },
    { name: 'file-offline', viewport: { width: 1280, height: 720 }, file: true },
    { name: 'file-blocked-storage', viewport: { width: 390, height: 844 }, file: true, blocked: true },
  ]) {
    const { name, file: useFile, blocked, ...options } = config;
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    if (useFile && engine !== 'webkit') await context.setOffline(true);
    const page = await context.newPage();
    const errors = [];
    const network = [];
    const requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => requests.push(request.url()));
    await context.route(/^https?:/, route => {
      if (!useFile && route.request().url() === url) return route.continue();
      network.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(({ blocked }) => {
      let seed = 937;
      window.__contractRequests = 0;
      window.__dinoTest = {
        manualFrames: true,
        random: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296),
        now: () => 1000,
        highscoreApiUrl: null,
        highscoreFetch: async () => {
          window.__contractRequests++;
          throw new TypeError('Simulated unavailable network');
        },
      };
      if (blocked) Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Storage blocked', 'SecurityError'); },
      });
      else {
        localStorage.setItem('dino-fullscreen-disabled', 'true');
        if (localStorage.getItem('dino-mode') === null) localStorage.setItem('dino-mode', 'unknown');
        if (localStorage.getItem('chromium-dino-highscore') === null)
          localStorage.setItem('chromium-dino-highscore', 'invalid');
      }
    }, { blocked: !!blocked });
    await page.goto(useFile ? pathToFileURL(file).href : url, { waitUntil: 'load' });
    if (useFile && engine === 'webkit') await context.setOffline(true);
    await page.waitForFunction(() => !!window.__dinoRunner);
    assert.equal((await state(page)).state, 'attract', name);
    assert.equal((await state(page)).paused, false, name);
    assert.equal(await page.evaluate(() => window.__dinoGame.highScore), 0,
      'Missing or invalid records fall back to zero');
    assert.deepEqual(await page.evaluate(() => {
      const g = window.__dinoGame;
      const speeds = {};
      for (const mode of ['normal', 'relaxed']) {
        g.setMode(mode);
        speeds[mode] = g.config.maxSpeed;
      }
      g.setMode('normal');
      return speeds;
    }), phpSpeeds, 'Client/server maximum speeds');

    // Actual keyboard handlers start and release a jump, not a direct state edit.
    await page.locator('#game').focus();
    await page.keyboard.down('Space');
    assert.equal((await state(page)).state, 'playing');
    await page.keyboard.up('Space');
    await advance(page, 1300);
    assert.equal((await state(page)).player.jumping, false, `${name}: landing`);
    await page.keyboard.down('ArrowDown');
    assert.equal((await state(page)).player.ducking, true);
    await page.keyboard.up('ArrowDown');
    assert.equal((await state(page)).player.ducking, false);
    if (options.hasTouch) {
      await page.locator('#touch-duck').dispatchEvent('pointerdown',
        { pointerType: 'touch', pointerId: 9, button: 0 });
      assert.equal((await state(page)).player.ducking, true, 'Touch duck press');
      await page.locator('#touch-duck').dispatchEvent('pointerup',
        { pointerType: 'touch', pointerId: 9, button: 0 });
      assert.equal((await state(page)).player.ducking, false, 'Touch duck release');
    }
    await page.keyboard.down('Space');
    await advance(page, 100);
    assert.equal((await state(page)).player.jumping, true);
    await page.keyboard.up('Space');
    await page.screenshot({ path: path.join(output, `${name}-playing.png`) });

    await page.locator('#settings-open').click();
    assert.equal((await state(page)).paused, true);
    const paused = await state(page);
    await advance(page, 500);
    assert.deepEqual(await state(page), paused, 'Pause must freeze game state');
    await page.locator('#mode-select').selectOption('relaxed');
    assert.equal((await state(page)).mode, 'normal', 'Mode changes apply to the next round');
    await page.locator('#settings-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);

    await page.locator('#info-link').click();
    await page.waitForFunction(() => location.hash === '#info' && window.__dinoRunner.paused);
    const help = page.frameLocator('#info-view');
    await help.locator('[data-help-back]').first().click();
    await page.waitForFunction(() => location.hash !== '#info' && !window.__dinoRunner.paused);

    // Focus loss, canvas restoration and reduced motion must keep input/loop state coherent.
    await page.keyboard.down('ArrowDown');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await state(page)).paused, true);
    assert.equal((await state(page)).player.ducking, false);
    await page.keyboard.up('ArrowDown');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal((await state(page)).paused, false);
    await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new Event('contextlost')));
    assert.equal((await state(page)).paused, true);
    await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new Event('contextrestored')));
    assert.equal((await state(page)).paused, false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__dinoGame.trex.reducedMotion.matches);
    assert.equal(await page.evaluate(() => window.__dinoRunner.renderer.effects.reducedMotion.matches), true);

    await page.evaluate(() => {
      const r = window.__dinoRunner;
      r.game.score = 12;
      r.game.gameTime = 4000;
      r.gameOver();
    });
    assert.equal((await state(page)).state, 'crashed');
    await advance(page, 100);
    assert.equal(await page.evaluate(() => window.__dinoRunner.restart()), false,
      'The protected impact cannot be restarted');
    await advance(page, 2600);
    await page.waitForFunction(() => document.getElementById('scores').open);
    // Force an API error through an injected fetch, never the real server.
    await page.evaluate(() => {
      const view = window.__dinoRunner.highscores;
      view.controller.api.url = 'https://scores.invalid/highscores.php';
      view.letters = [...'TEST'];
      return view.save();
    });
    assert.equal(await page.evaluate(() => window.__contractRequests), 1);
    assert.equal(await page.evaluate(() => window.__dinoRunner.highscoreController.store.local('normal')[0].score), 12);
    assert.equal(await page.evaluate(() => window.__dinoRunner.highscores.source), 'local');
    await page.locator('#scores-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    assert.equal(await page.locator('#play-again').evaluate(button => {
      const rect = button.getBoundingClientRect();
      return !!document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest('#play-again');
    }), true, 'The transparent touch-controls grid must not cover the restart button');
    const simulationTime = await page.evaluate(() => window.__dinoGame.simulationTime);
    await page.locator('#play-again').click();
    const restarted = await state(page);
    assert.equal(restarted.state, 'playing');
    assert.equal(restarted.mode, 'relaxed');
    assert.equal(restarted.score, 0);
    assert.equal(await page.evaluate(() => window.__dinoGame.simulationTime), simulationTime,
      'Round restart keeps the simulation clock');
    assert.equal(await page.evaluate(() => window.__dinoRunner.readHighScore('normal')), 12,
      'Per-mode records remain available even when storage is blocked');

    await page.evaluate(() => window.__dinoRunner.quit());
    assert.equal(await page.locator('#goodbye').evaluate(dialog => dialog.open), true);
    await page.locator('#new-session').click();
    assert.equal((await state(page)).state, 'attract');
    assert.equal((await state(page)).paused, false);
    assert.equal(await page.evaluate(() => window.__dinoGame.simulationTime), 0);
    assert.equal(await page.evaluate(() => window.__dinoRunner.stats.games), 0);
    assert.equal(await page.evaluate(() => window.__dinoRunner.stats.deaths), 0);
    assert.equal(await page.evaluate(() => window.__dinoRunner.renderer.effects.particles.length), 0);
    await page.screenshot({ path: path.join(output, `${name}-reset.png`) });
    if (useFile) {
      // A shared direct Help link has no in-game history entry to go back to.
      if (engine === 'webkit') await context.setOffline(false);
      await page.goto(pathToFileURL(file).href + '#info', { waitUntil: 'load' });
      if (engine === 'webkit') await context.setOffline(true);
      await page.waitForFunction(() => !!window.__dinoRunner?.paused);
      await page.frameLocator('#info-view').locator('[data-help-back]').first().click();
      await page.waitForFunction(() => location.hash === '#game' && !window.__dinoRunner.paused);
      assert.equal((await state(page)).state, 'attract');
    }
    if (!blocked) {
      if (useFile && engine === 'webkit') await context.setOffline(false);
      await page.reload({ waitUntil: 'load' });
      if (useFile && engine === 'webkit') await context.setOffline(true);
      assert.equal((await state(page)).mode, 'relaxed');
      assert.equal(await page.evaluate(() => window.__dinoRunner.readHighScore('normal')), 12,
        'Per-mode records survive reload');
    }
    assert.deepEqual(errors, [], `${name}: uncaught browser errors`);
    assert(network.every(request => /(?:manifest\.webmanifest|icon-\d+\.png|dino-(?:jump-jump|boom-in-the-dunes)\.mp3)$/.test(request)),
      `${name}: unexpected runtime dependency: ${network}`);
    if (useFile) assert(requests.every(request => request.split('#')[0] === pathToFileURL(file).href
      || request.endsWith('/dino-jump-jump.mp3') || request.endsWith('/dino-boom-in-the-dunes.mp3')),
    `${name}: standalone copy requested a file other than optional music: ${requests}`);
    report.push({ name, lifecycle: 'passed', offline: !!useFile, blockedStorage: !!blocked, errors });
    await context.close();
  }
  // A real service worker must retain the hosted game for offline reopening,
  // even though the fixture deliberately returns 404 for the optional song.
  // Also exercise the normal rAF loop, not only the deterministic test hook.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    window.__dinoTest = { highscoreApiUrl: null };
    localStorage.setItem('dino-fullscreen-disabled', 'true');
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), 'manifest.webmanifest');
  // The Windows WebKit port fails main navigations with its offline flag even
  // when a service worker controls the page. Simulate an unreachable origin.
  if (engine === 'webkit') networkDown = true;
  else await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__dinoRunner);
  await page.locator('#game').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__dinoGame.gameTime > 100);
  await page.locator('#settings-open').click();
  const frozenTime = await page.evaluate(() => window.__dinoGame.gameTime);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__dinoGame.gameTime), frozenTime);
  await page.locator('#settings-close').click();
  await page.waitForFunction(before => window.__dinoGame.gameTime > before, frozenTime);
  await page.screenshot({ path: path.join(output, 'hosted-offline-playing.png') });
  assert.deepEqual(errors, [], 'Hosted offline reload and real frame loop');
  report.push({ name: 'hosted-offline', lifecycle: 'passed', offline: true, realFrames: true,
    networkFailure: engine === 'webkit' ? 'origin socket closed' : 'browser offline flag', errors });
  await context.close();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Passed inline syntax, client/server constants and ${report.length} browser lifecycle scenarios.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  // Delete only the explicitly created temporary directory.
  fs.rmSync(isolated, { recursive: true, force: true });
}
