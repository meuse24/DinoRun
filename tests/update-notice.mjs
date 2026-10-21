// Real two-version service-worker fixture under the production directory shape.
// node tests/update-notice.mjs [game.html]; no live scores, deployment or phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const html = fs.readFileSync(artifact, 'utf8');
const build = fs.readFileSync(path.join(root, 'dino.html'), 'utf8').match(/const BUILD = '([^']+)'/)[1];
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/updates'),
  `${engine}-${artifact.includes(path.sep + 'release' + path.sep) ? 'release' : 'source'}`);
fs.mkdirSync(output, { recursive: true });
let version = 1, down = false, broken = false;
const prefix = '/apps/dino/';
const server = http.createServer((request, response) => {
  if (down) { request.socket.destroy(); return; }
  const name = new URL(request.url, 'http://localhost').pathname.slice(prefix.length);
  response.setHeader('Cache-Control', 'no-cache');
  if (name === 'dino.html') {
    response.writeHead(broken ? 503 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html.replaceAll(build, `fixture-${version}`));
  } else if (name === 'service-worker.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(worker.replace(/dino-run-v\d+/, `dino-run-test-${version}`));
  } else if (['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'].includes(name)) {
    response.writeHead(200, { 'Content-Type': name.endsWith('.png') ? 'image/png' : 'application/manifest+json' });
    response.end(fs.readFileSync(path.join(root, name)));
  } else response.writeHead(404).end(); // Both songs are deliberately optional/missing.
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}dino.html`;
const pw = await import(process.env.DINO_PLAYWRIGHT ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const report = [], errors = [];
let browser;
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (page, ms) => page.evaluate(ms => {
  for (let t = 0; t < ms; t += 1000 / 60) window.advanceTime(Math.min(1000 / 60, ms - t));
}, ms);
const settle = page => page.waitForFunction(() => window.__dinoRunner && navigator.serviceWorker.controller);
const visit = page => page.evaluate(() => window.__visit);
const update = async page => {
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
  await page.waitForFunction(() => window.__dinoRunner.updates.waiting?.state === 'installed');
};
const finish = async page => {
  await page.evaluate(() => {
    const r = window.__dinoRunner;
    r.game.score = 0;
    r.game.gameOver();
    r.draw(1);
  });
  await advance(page, 3000);
  await page.waitForFunction(() => window.__dinoGame.state === 'attract');
  await page.evaluate(() => window.__dinoRunner.draw(1));
};
try {
  browser = await pw[engine].launch({ headless: true });
  for (const [layout, viewport] of [
    ['desktop', { width: 1280, height: 720 }],
    ['portrait', { width: 320, height: 640 }],
    ['landscape', { width: 663, height: 234 }],
  ]) {
    version = 1; down = false; broken = false;
    const context = await browser.newContext({ viewport,
      ...(layout === 'desktop' ? {} : { isMobile: true, hasTouch: true }) });
    await context.addInitScript(() => {
      window.__visit = crypto.randomUUID();
      localStorage.setItem('dino-fullscreen-disabled', 'true');
      const musicAudio = new EventTarget();
      musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio, transitions: false };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    const loaded = await page.goto(url);
    const initialVisit = await visit(page);
    await settle(page);
    assert.equal(await visit(page), initialVisit, 'First install never reloads');
    assert.equal((await state(page)).update.available, false);
    assert.equal(loaded.status(), 200);
    // About uses the actually running build, including after cached/offline updates.
    await page.locator('#info-link').click();
    await page.frameLocator('#info-view').locator('#about-version').waitFor({ state: 'visible' });
    assert.equal(await page.frameLocator('#info-view').locator('#about-version').textContent(), 'Dino Run · Version fixture-1');
    if (layout === 'desktop') {
      await page.frameLocator('#info-view').locator('#about-version').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'about-version.png') });
    }
    await page.evaluate(() => { location.hash = '#game'; });
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.locator('#start-game').click();
    await advance(page, 3200);
    assert.equal((await state(page)).state, 'playing');
    version = 2;
    await update(page);
    assert.equal((await state(page)).update.visible, false, 'No notice during a run');
    assert.equal(await visit(page), initialVisit, 'Installing does not reload');
    await finish(page);
    await page.locator('#update-notice').waitFor({ state: 'visible' });
    const notice = await page.locator('#update-notice').boundingBox();
    const start = await page.locator('#start-game').boundingBox();
    assert(notice.x >= 0 && notice.y >= 0 && notice.x + notice.width <= viewport.width + 1 &&
      notice.y + notice.height <= viewport.height + 1, 'Notice fits viewport');
    assert(notice.x + notice.width <= start.x || start.x + start.width <= notice.x ||
      notice.y + notice.height <= start.y || start.y + start.height <= notice.y, 'START remains uncovered');
    await page.screenshot({ path: path.join(output, `${layout}-notice.png`) });
    if (layout === 'desktop') {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      assert.equal((await state(page)).update.visible, true);
      await page.screenshot({ path: path.join(output, 'dark-reduced-motion.png') });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    }
    // Modal/name entry suppresses the notice immediately, including with no frames.
    await page.evaluate(() => document.getElementById('scores').showModal());
    await page.locator('#update-notice').waitFor({ state: 'hidden' });
    await page.evaluate(() => document.getElementById('scores').close());
    await page.locator('#update-notice').waitFor({ state: 'visible' });
    await page.locator('#info-link').click();
    await page.locator('#update-notice').waitFor({ state: 'hidden' });
    await page.evaluate(() => { location.hash = '#game'; });
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.evaluate(() => window.__dinoRunner.draw(1));
    await page.locator('#update-notice').waitFor({ state: 'visible' });
    if (layout === 'desktop') {
      // A lost activation message must not leave the player permanently locked.
      await page.evaluate(() => {
        const worker = window.__dinoRunner.updates.waiting;
        window.__postUpdate = worker.postMessage;
        worker.postMessage = () => {};
      });
      await page.locator('#update-apply').press('Enter');
      assert.equal((await state(page)).update.applying, true);
      await page.locator('#start-game').click();
      assert.equal((await state(page)).state, 'attract', 'No new run during an accepted update');
      await page.waitForFunction(() => !window.__dinoRunner.updates.applying, null, { timeout: 15000 });
      assert.match(await page.locator('#update-message').textContent(), /could not finish/);
      await page.evaluate(() => { window.__dinoRunner.updates.waiting.postMessage = window.__postUpdate; });
      await page.screenshot({ path: path.join(output, 'activation-retry.png') });
      await page.locator('#update-later').press('Enter');
    } else await page.locator('#update-later').tap();
    assert.equal((await state(page)).state, 'attract', 'Notice input never starts a round');
    assert.equal((await state(page)).update.visible, false);
    await page.locator('#start-game').click(); await advance(page, 3200); await finish(page);
    assert.equal((await state(page)).update.visible, false, 'Later lasts for this visit');
    // Ordinary reload remains on the installed HTML and rediscovers existing waiting worker.
    await page.reload(); await settle(page);
    await page.locator('#update-notice').waitFor({ state: 'visible' });
    assert.equal((await state(page)).build, 'fixture-1', 'Waiting update cannot leak through navigation');
    const other = await context.newPage();
    other.on('pageerror', error => errors.push(String(error)));
    await other.goto(url); await settle(other);
    await other.locator('#start-game').click(); await advance(other, 3200);
    const otherVisit = await visit(other);
    await page.bringToFront();
    // Activate/reload with no server: the successfully staged HTML is sufficient.
    down = true;
    const beforeUpdate = await visit(page);
    if (layout === 'desktop') await page.locator('#update-apply').press('Enter');
    else await page.locator('#update-apply').tap();
    await page.waitForFunction(before => window.__visit !== before && !!window.__dinoRunner, beforeUpdate);
    assert.equal((await state(page)).build, 'fixture-2');
    assert.equal((await state(page)).update.available, false);
    const updatedVisit = await visit(page);
    await page.waitForTimeout(200);
    assert.equal(await visit(page), updatedVisit, 'Accepted update reloads only once');
    assert.equal(await visit(other), otherVisit, 'Another tab keeps its run and document');
    assert.equal((await state(other)).state, 'playing');
    assert.equal((await state(other)).build, 'fixture-1');
    if (layout === 'desktop') {
      // If a third release arrives before the old tab accepts v2, prefer that
      // new waiting worker instead of merely reloading the already active v2.
      down = false; version = 6;
      await update(other);
      assert.equal(await other.evaluate(() => window.__dinoRunner.updates.ready), false);
      down = true;
    }
    await other.bringToFront(); await finish(other);
    await other.locator('#update-notice').waitFor({ state: 'visible' });
    await other.locator('#update-apply').click();
    const activeBuild = layout === 'desktop' ? 'fixture-6' : 'fixture-2';
    await other.waitForFunction(build => window.__dinoRunner && JSON.parse(render_game_to_text()).build === build, activeBuild);
    await other.locator('#start-game').click(); await advance(other, 3200);
    assert.equal((await state(other)).state, 'playing', 'Updated cached HTML plays offline');
    await other.screenshot({ path: path.join(output, `${layout}-offline-playing.png`) });
    down = false;
    await page.bringToFront();
    await page.reload(); await settle(page);
    // Failed required precaching must leave the installed version playable.
    version = 3; broken = true;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      window.__failedInstall = new Promise(resolve => reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(true); });
      }, { once: true }));
      await reg.update();
      await window.__failedInstall;
    });
    assert.equal((await state(page)).update.available, false);
    await page.reload(); await settle(page);
    assert.equal((await state(page)).build, activeBuild);
    broken = false;
    // A newer deployment replaces a waiting one and becomes active after all tabs close.
    version = 4; await update(page);
    version = 5; await update(page);
    await context.pages().reduce(async (previous, p) => { await previous; await p.close(); }, Promise.resolve());
    const reopened = await context.newPage();
    // Wait for the registration to finish natural activation before navigation.
    await reopened.goto(url); await settle(reopened);
    await reopened.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !reg.waiting && reg.active?.state === 'activated';
    });
    await reopened.reload(); await settle(reopened);
    assert.equal((await state(reopened)).build, 'fixture-5');
    assert.deepEqual(await reopened.evaluate(async () => (await caches.keys())
      .filter(name => name.startsWith('dino-run-'))), ['dino-run-test-5'], 'Activation removes obsolete/failed caches');
    report.push({ layout, firstInstall: true, waiting: true, gameplay: true, later: true,
      existingWaiting: true, twoTabs: true, offlineActivation: true, failedInstall: true, naturalActivation: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ engine, artifact, report, errors }, null, 2));
  console.log(`Update lifecycle passed in ${report.length} layouts: ${output}`);
} finally {
  down = false;
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
