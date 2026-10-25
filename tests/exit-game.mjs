// Goodbye Exit: real window.close() in fresh tabs and app windows, the hint when a
// browser refuses, history-free Help in app mode and three goodbye layouts.
// node tests/exit-game.mjs [game.html]  (Chromium; no live score service)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadPlaywright } from './helpers/playwright.mjs';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const html = fs.readFileSync(artifact, 'utf8');
const variant = artifact.includes(path.sep + 'release' + path.sep) ? 'release' : 'source';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/exit-game'), variant);
fs.mkdirSync(output, { recursive: true });
const { chromium } = await loadPlaywright();

// Hooks are injected by the server: a browser started with the URL has no init scripts,
// and only such a tab starts with the single history entry real launches have.
const hooks = (app) =>
  `<script>window.__dinoTest={credits:99,highscoreApiUrl:null,transitions:${process.env.DINO_TRANSITIONS === '1'}};` +
  "localStorage.setItem('dino-fullscreen-disabled','true');" +
  (app
    ? "{const m=matchMedia.bind(window);window.matchMedia=q=>/display-mode: fullscreen/.test(q)?" +
      "Object.assign(new EventTarget(),{matches:true,media:q,addListener(){},removeListener(){}}):m(q);}"
    : '') +
  '</script>';
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  // A real manifest and an inert worker keep the hosted install path free of fixture errors.
  if (url.pathname === '/manifest.webmanifest')
    return response.writeHead(200, { 'Content-Type': 'application/manifest+json' })
      .end(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  if (url.pathname === '/service-worker.js')
    return response.writeHead(200, { 'Content-Type': 'text/javascript' }).end('');
  if (url.pathname !== '/dino.html') return response.writeHead(204).end();
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html.replace(/<head[^>]*>/i, (head) => head + hooks(url.searchParams.has('app'))));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/dino.html`;
const errors = [];
const results = [];
const check = async (name, run) => {
  await run();
  results.push(name);
  console.log('ok -', name);
};
const watch = (page) => {
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
};
const ready = (page) => page.waitForFunction(() => window.__dinoRunner?.game?.state === 'attract');
const quit = async (page) => {
  await page.evaluate(() => window.__dinoRunner.quit());
  await page.waitForFunction(() => document.getElementById('goodbye').open);
};
const closed = (page) => page.waitForEvent('close', { timeout: 3000 }).then(() => true, () => false);

// A browser process launched with the game URL: its tab has exactly one history entry.
async function launched(query = '') {
  const profile = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dino-exit-game-'));
  const child = spawn(chromium.executablePath(), [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, base + query,
  ], { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().startsWith(base)) || (await context.waitForEvent('page'));
  watch(page);
  await ready(page);
  const stop = async () => {
    await browser.close().catch(() => {});
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return { page, stop };
}

try {
  await check('fresh browser tab: Exit closes the game without a prompt', async () => {
    const { page, stop } = await launched();
    try {
      assert.equal(await page.evaluate(() => history.length), 1);
      let dialogs = 0;
      page.on('dialog', () => dialogs++);
      await quit(page);
      const gone = closed(page);
      await page.click('#exit-game');
      assert.equal(await gone, true, 'window.close() closed the tab');
      assert.equal(dialogs, 0);
    } finally {
      await stop();
    }
  });

  await check('browser tab with Help history: refusal shows the close hint, New session recovers', async () => {
    const { page, stop } = await launched();
    try {
      await page.click('#info-link');
      await page.waitForFunction(() => location.hash === '#info' && document.getElementById('help-dialog').open);
      await page.goBack();
      await page.waitForFunction(() => location.hash !== '#info' && !document.getElementById('help-dialog').open);
      assert.equal(await page.evaluate(() => history.length), 2);
      await quit(page);
      await page.click('#exit-game');
      await page.waitForTimeout(300);
      assert.equal(page.isClosed(), false);
      const hint = await page.evaluate(() => {
        const element = document.getElementById('exit-hint');
        return { hidden: element.hidden, text: element.textContent, role: element.getAttribute('role'),
          open: document.getElementById('goodbye').open, paused: window.__dinoRunner.paused };
      });
      assert.deepEqual(hint, { hidden: false, role: 'status', open: true, paused: true,
        text: 'Your browser keeps this page open. Press Ctrl+W to close this tab.' });
      await page.click('#new-session');
      await ready(page);
      await quit(page);
      assert.equal(await page.locator('#exit-hint').isHidden(), true, 'a new goodbye starts without the hint');
    } finally {
      await stop();
    }
  });

  await check('app window: Help adds no history entry and Exit still closes', async () => {
    const { page, stop } = await launched('?app');
    try {
      assert.equal(await page.evaluate(() => matchMedia('(display-mode: fullscreen)').matches), true);
      await page.click('#info-link');
      await page.waitForFunction(() => location.hash === '#info' && document.getElementById('help-dialog').open);
      assert.equal(await page.evaluate(() => history.length), 1);
      // Back gesture / Escape reaches the modal guide as a cancel event.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => location.hash === '#game' && !document.getElementById('help-dialog').open);
      // A Back gesture without user activation closes the dialog directly.
      await page.click('#info-link');
      await page.waitForFunction(() => document.getElementById('help-dialog').open);
      await page.evaluate(() => document.getElementById('help-dialog').close());
      await page.waitForFunction(() => location.hash === '#game' && document.getElementById('info-view').hidden);
      assert.equal(await page.evaluate(() => [history.length, window.__dinoRunner.paused].join()), '1,false');
      await quit(page);
      const gone = closed(page);
      await page.click('#exit-game');
      assert.equal(await gone, true);
    } finally {
      await stop();
    }
  });

  await check('browser tab: a directly closed Help dialog steps back exactly once', async () => {
    const { page, stop } = await launched();
    try {
      await page.click('#info-link');
      await page.waitForFunction(() => document.getElementById('help-dialog').open);
      await page.evaluate(() => document.getElementById('help-dialog').close());
      await page.waitForFunction(() => location.hash !== '#info' && document.getElementById('info-view').hidden);
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => [location.pathname, history.length, !!history.state?.dinoHelp]),
        ['/dino.html', 2, false]);
    } finally {
      await stop();
    }
  });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const [layout, viewport] of [
      ['desktop', { width: 1280, height: 720 }],
      ['portrait', { width: 320, height: 640 }],
      ['landscape', { width: 663, height: 234 }],
    ]) {
      await check(`${layout}: goodbye actions and hint fit`, async () => {
        const context = await browser.newContext({ viewport, serviceWorkers: 'block',
          ...(layout === 'desktop' ? {} : { isMobile: true, hasTouch: true }) });
        const page = await context.newPage();
        watch(page);
        await page.goto(base);
        await ready(page);
        await quit(page);
        // Playwright tabs start with an extra history entry, so this path shows the hint.
        await page.locator('#exit-game').click();
        await page.waitForFunction(() => !document.getElementById('exit-hint').hidden);
        const box = await page.evaluate(() => {
          const rect = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
          const dialog = document.getElementById('goodbye');
          return { dialog: rect('goodbye'), start: rect('new-session'), exit: rect('exit-game'),
            hint: rect('exit-hint'), overflowX: dialog.scrollWidth > dialog.clientWidth };
        });
        assert(box.dialog.left >= 0 && box.dialog.right <= viewport.width, JSON.stringify(box.dialog));
        assert(box.dialog.top >= 0 && box.dialog.bottom <= viewport.height, JSON.stringify(box.dialog));
        assert.equal(box.overflowX, false);
        assert(box.hint.top >= box.dialog.top && box.hint.bottom <= box.dialog.bottom, 'hint scrolled into view');
        for (const button of [box.start, box.exit]) assert(button.height >= 44 && button.width >= 120, JSON.stringify(button));
        if (layout === 'landscape') assert.equal(Math.round(box.start.top), Math.round(box.exit.top), 'side by side');
        else assert(box.exit.top >= box.start.bottom, 'stacked below New session');
        await page.screenshot({ path: path.join(output, layout + '.png') });
        await context.close();
      });
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ artifact, results }, null, 2));
  console.log(`exit-game: ${results.length} checks passed`);
} finally {
  server.close();
}
