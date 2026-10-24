import { loadPlaywright } from './helpers/playwright.mjs';
// Regression checks for heading text caching and deferred presentation only.
// Exercise the game-owned presenter through the existing Runner inspection hook.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const pw = await loadPlaywright();
const engine = process.env.DINO_BROWSER || 'chromium';
const browser = await pw[engine].launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route(/^https?:/, route => route.abort());
  await page.addInitScript(() => {
    const musicAudio = new EventTarget();
    musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
    window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null, musicAudio };
    try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
  });
  await page.goto(pathToFileURL(path.resolve(process.argv[2] || path.join(root, 'dino.html'))).href);
  await page.waitForFunction(() => !!window.__dinoRunner);
  await page.evaluate(() => window.__dinoTest.transitionDone());
  const result = await page.evaluate(async () => {
    const motion = window.__dinoRunner.headingMotion;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const heading = document.createElement('h2'), text = document.createElement('span');
    heading.append(text);
    motion.setText(text, 'DINO 🦖 RUN');
    const glyph = text.firstElementChild;
    motion.setText(text, 'DINO 🦖 RUN');
    check(text.firstElementChild === glyph, 'identical text/offset must reuse glyphs');
    motion.setText(text, 'DINO 🦖 RUN', 5);
    check(text.firstElementChild === glyph, 'offset-only changes must reuse glyphs');
    check(glyph.style.getPropertyValue('--wave-i') === '5', 'offset-only changes update phase');
    check(text.lastElementChild.style.getPropertyValue('--wave-i') === '14', 'spaces and Unicode count as phase steps');
    check(heading.getAttribute('aria-label') === 'DINO 🦖 RUN', 'accessible name preserves the whole heading');
    motion.setText(text, 'Help');
    check(text.firstElementChild !== glyph && heading.getAttribute('aria-label') === 'Help', 'new text rebuilds glyphs and name');
    const deferred = () => {
      let resolve, reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      return { finished, resolve, reject };
    };
    const dialog = document.createElement('dialog');
    dialog.open = true;
    const old = deferred(), current = deferred();
    motion.prepareDialog(dialog, old);
    motion.prepareDialog(dialog, current);
    old.resolve(); await Promise.resolve();
    check(dialog.hasAttribute('data-heading-pending'), 'stale completion cannot reveal a newer opening');
    current.reject(); await Promise.resolve();
    check(!dialog.hasAttribute('data-heading-pending'), 'failed transition also reveals the heading');
    const closing = deferred(), newer = deferred();
    motion.prepareDialog(dialog, closing);
    dialog.open = false;
    closing.resolve(); await Promise.resolve();
    check(dialog.hasAttribute('data-heading-pending'), 'closed dialog stays unrevealed');
    dialog.open = true;
    motion.prepareDialog(dialog, newer);
    motion.prepareDialog(dialog, null);
    newer.resolve(); await Promise.resolve();
    check(!dialog.hasAttribute('data-heading-pending'), 'CSS fallback clears pending state');
    return { glyphCache: true, unicodePhases: true, accessibleNames: true,
      staleCompletion: true, rejectedTransition: true, closedDialog: true, cssFallback: true };
  });
  assert.deepEqual(errors, []);
  const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/heading-motion'), engine);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'heading-motion.json'), JSON.stringify(result, null, 2));
  console.log(`${engine}: heading cache and deferred-start regressions passed`);
} finally {
  await browser.close();
}
