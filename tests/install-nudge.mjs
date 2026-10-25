// Contextual, non-modal install suggestion after the second finished round.
// node tests/install-nudge.mjs [game.html]  (no live score service)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadPlaywright } from './helpers/playwright.mjs';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const html = fs.readFileSync(artifact, 'utf8');
const engine = process.env.DINO_BROWSER || 'chromium';
const variant = artifact.includes(path.sep + 'release' + path.sep) ? 'release' : 'source';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/install-nudge'), `${engine}-${variant}`);
fs.mkdirSync(output, { recursive: true });
const pw = await loadPlaywright();
const server = http.createServer((request, response) => {
  if (new URL(request.url, 'http://localhost').pathname === '/dino.html')
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  else response.writeHead(204).end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/dino.html`;
const browser = await pw[engine].launch({ headless: true });
const errors = [];
const results = [];
const check = async (name, run) => {
  await run();
  results.push(name);
  console.log('ok -', name);
};

async function open(viewport, { mobile = false, nudge = true, prompt = true, scheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', colorScheme: scheme,
    ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => message.type() === 'error' && !/Manifest|MIME type|service ?worker/i.test(message.text()) &&
    errors.push(message.text()));
  await page.addInitScript((nudge) => {
    localStorage.setItem('dino-fullscreen-disabled', 'true');
    window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null, transitions: false, installNudge: nudge };
  }, nudge);
  await page.goto(url);
  await page.waitForFunction(() => window.__dinoRunner && window.__dinoInstallNudge);
  // Chromium's install event, with the native prompt replaced by a recorder.
  if (prompt) await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.__prompted = (window.__prompted || 0) + 1; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    dispatchEvent(event);
  });
  return { context, page };
}
// A finished round through the runner's real return path.
const round = (page) => page.evaluate(async () => {
  const r = window.__dinoRunner;
  r.game.state = 'crashed';
  r.returnToAttract();
  await new Promise((resolve) => setTimeout(resolve, 50));
  return !document.getElementById('install-nudge').hidden;
});
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dino-install-nudge') || '{}'));
const overlaps = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

try {
  for (const [layout, viewport, mobile] of [
    ['desktop', { width: 1280, height: 720 }, false],
    ['portrait', { width: 360, height: 740 }, true],
    ['landscape', { width: 844, height: 390 }, true],
    ['short-landscape', { width: 663, height: 234 }, true],
    ['tablet', { width: 820, height: 1180 }, true],
  ]) {
    await check(`${layout}: second round shows it beside, not over, the controls`, async () => {
      const { context, page } = await open(viewport, { mobile });
      assert.equal(await round(page), false, 'not after the first round');
      assert.equal(await round(page), true, 'after the second round');
      const boxes = await page.evaluate(() => Object.fromEntries(
        ['install-nudge', 'start-game', 'insert-coin', 'install-game', 'touch-controls', 'coin-controls'].map((id) => {
          const element = document.getElementById(id);
          const rect = element && !element.hidden ? element.getBoundingClientRect() : null;
          return [id, rect && rect.width ? rect.toJSON() : null];
        })));
      const card = boxes['install-nudge'];
      assert(card.x >= 0 && card.right <= viewport.width && card.y >= 0 && card.bottom <= viewport.height, JSON.stringify(card));
      for (const [id, box] of Object.entries(boxes))
        if (box && id !== 'install-nudge') assert(!overlaps(card, box), `${layout}: covers #${id} ${JSON.stringify(box)}`);
      const buttons = await page.locator('#install-nudge button').evaluateAll((all) => all.map((b) => b.getBoundingClientRect().height));
      assert(buttons.every((height) => height >= 40), 'touch-sized buttons');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'start-game', 'no focus theft');
      await page.screenshot({ path: path.join(output, layout + '.png') });
      await context.close();
    });
  }

  await check('non-modal: START works and hides it; once per page', async () => {
    const { context, page } = await open({ width: 1280, height: 720 });
    await round(page);
    await round(page);
    await page.click('#start-game');
    await page.evaluate(() => window.advanceTime(4000));
    assert.equal(await page.evaluate(() => window.__dinoGame.playing), true);
    assert.equal(await page.locator('#install-nudge').isHidden(), true);
    assert.equal(await round(page), false, 'shown at most once per page');
    assert.equal((await saved(page)).rounds, 3);
    await context.close();
  });

  await check('Not now snoozes two weeks; a second Not now ends it', async () => {
    const { context, page } = await open({ width: 1280, height: 720 });
    await round(page);
    await round(page);
    await page.click('#install-nudge-no');
    assert.equal(await page.locator('#install-nudge').isHidden(), true);
    let state = await saved(page);
    assert.equal(state.dismissed, 1);
    const days = (state.until - Date.now()) / 864e5;
    assert(days > 13.9 && days <= 14, String(days));
    await page.reload();
    await page.waitForFunction(() => window.__dinoInstallNudge);
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      dispatchEvent(event);
    });
    assert.equal(await round(page), false, 'snoozed');
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('dino-install-nudge'));
      state.until = Date.now() - 1;
      localStorage.setItem('dino-install-nudge', JSON.stringify(state));
    });
    assert.equal(await round(page), true, 'returns after the snooze');
    await page.click('#install-nudge-no');
    state = await saved(page);
    assert.equal(state.dismissed, 2);
    await page.reload();
    await page.waitForFunction(() => window.__dinoInstallNudge);
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('dino-install-nudge'));
      state.until = 0;
      localStorage.setItem('dino-install-nudge', JSON.stringify(state));
    });
    assert.equal(await round(page), false, 'never after two refusals');
    await context.close();
  });

  await check('Install opens the native prompt once and hides the card', async () => {
    const { context, page } = await open({ width: 1280, height: 720 });
    await round(page);
    await round(page);
    await page.click('#install-nudge-yes');
    await page.waitForFunction(() => window.__prompted === 1);
    assert.equal(await page.locator('#install-nudge').isHidden(), true);
    assert.equal((await saved(page)).dismissed, 1, 'a declined prompt counts as Not now');
    await context.close();
  });

  await check('no install route, browser tests and dialogs keep it hidden', async () => {
    let { context, page } = await open({ width: 1280, height: 720 }, { prompt: false });
    await round(page);
    assert.equal(await round(page), false, 'without beforeinstallprompt (not iOS)');
    await context.close();
    ({ context, page } = await open({ width: 1280, height: 720 }, { nudge: false }));
    await round(page);
    assert.equal(await round(page), false, 'other suites never see it');
    assert.equal(await page.evaluate(() => localStorage.getItem('dino-install-nudge')), null);
    await context.close();
    ({ context, page } = await open({ width: 1280, height: 720 }));
    await round(page);
    await page.evaluate(() => document.getElementById('settings').showModal());
    assert.equal(await round(page), false, 'not behind an open dialog');
    await context.close();
  });

  await check('dark scheme', async () => {
    const { context, page } = await open({ width: 360, height: 740 }, { mobile: true, scheme: 'dark' });
    await round(page);
    assert.equal(await round(page), true);
    await page.screenshot({ path: path.join(output, 'portrait-dark.png') });
    await context.close();
  });

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ artifact, engine, results }, null, 2));
  console.log(`${engine}: install nudge ${results.length} checks passed`);
} finally {
  await browser.close();
  server.close();
}
