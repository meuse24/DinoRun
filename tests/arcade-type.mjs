// Arcade lettering: stable targets, pause, readable milestones and motion preferences.
// Uses isolated offline file play; no live score requests. Optional delivery HTML.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/arcade-type'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-arcade-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const browser = await pw[engine].launch({ headless: true });
const reports = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 720 }],
    ['portrait', { width: 320, height: 640 }],
    ['landscape', { width: 663, height: 234 }],
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block',
      ...(name === 'desktop' ? {} : { isMobile: true, hasTouch: true }) });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      const musicAudio = new EventTarget();
      musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio };
      localStorage.setItem('dino-fullscreen-disabled', 'true');
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!window.__dinoRunner);
    await page.evaluate(() => window.__dinoTest.transitionDone());
    await context.setOffline(true);
    const tap = selector => name === 'desktop'
      ? page.locator(selector).click() : page.locator(selector).tap();
    const target = await page.locator('#start-game').boundingBox();
    // Sample both the label's pulse and the sheen while the target stays anchored.
    for (const time of [0, 850, 4300, 4900]) {
      await page.evaluate(time => {
        for (const animation of document.getElementById('start-game').getAnimations({ subtree: true })) {
          animation.pause(); animation.currentTime = time;
        }
      }, time);
      assert.deepEqual(await page.locator('#start-game').boundingBox(), target);
      assert(await page.locator('#start-game').evaluate(button => {
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), 'Sheen never intercepts START');
    }
    await page.screenshot({ path: path.join(output, `${name}-arcade-menu.png`) });
    await page.locator('#start-game').evaluate(button => {
      for (const animation of button.getAnimations({ subtree: true })) animation.play();
    });
    await tap('#attract-pause');
    const paused = await page.locator('#start-game').evaluate(button => ({
      label: getComputedStyle(button.querySelector('.action-label')).animationPlayState,
      sheen: getComputedStyle(button, '::after').animationPlayState,
    }));
    assert.deepEqual(paused, { label: 'paused', sheen: 'paused' });
    await tap('#attract-pause');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.deepEqual(await page.locator('#start-game').evaluate(button => [
      getComputedStyle(button.querySelector('.action-label')).animationName,
      getComputedStyle(button, '::after').animationName,
    ]), ['none', 'none']);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' });
    await page.waitForFunction(() => !window.__dinoGame.trex.reducedMotion.matches);
    await page.evaluate(() => window.__dinoRunner.draw(1));
    await page.screenshot({ path: path.join(output, `${name}-arcade-night.png`) });
    await tap('#start-game');
    await page.evaluate(() => window.__dinoRunner.draw(1));
    await page.evaluate(() => window.__dinoTest.transitionDone());
    assert.equal(await page.evaluate(() => window.__dinoGame.playing), true);
    await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game;
      g.countdown = 0; g.score = 100; g.distance = 4000;
      g.meter.update(0, 100); g.meter.update(150, 100);
      r.renderer.effects.celebrate();
      r.draw(1);
    });
    const samples = await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game, ctx = r.renderer.ctx;
      const original = ctx.fillText, samples = [];
      ctx.fillText = function(text, ...args) {
        if (text.startsWith('SC ')) samples.push({ text, scale: this.getTransform().a,
          font: this.font, color: this.fillStyle });
        return original.call(this, text, ...args);
      };
      try {
        for (const flash of [1200, 1050, 800, 600, 200, 0]) {
          g.meter.flash = flash;
          r.renderer.drawDistanceMeter(g.meter, 100, 90, '#dce9ff', 1, null);
        }
      } finally { ctx.fillText = original; }
      g.meter.flash = 1050; r.draw(1);
      return samples;
    });
    assert.equal(samples.length, 6, 'Score remains readable in every milestone phase');
    assert(samples.every(sample => sample.text === 'SC 00100'));
    assert(samples[1].scale > samples[0].scale, 'Milestone punches once: ' + JSON.stringify(samples));
    assert.equal(samples[3].scale, samples[5].scale, 'Punch settles before the milestone ends');
    assert(samples.every(sample => sample.font.includes('18px')), 'Score has stronger size hierarchy');
    assert.equal(await page.locator('#hud-score').getAttribute('aria-label'), 'Score 100');
    assert.equal(await page.locator('#mobile-hud').evaluate(el => el.hasAttribute('data-milestone')), true);
    assert.equal(await page.locator('#hud-score').evaluate(el => getComputedStyle(el).color), 'rgb(255, 210, 87)');
    await page.screenshot({ path: path.join(output, `${name}-arcade-record.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__dinoGame.trex.reducedMotion.matches);
    const still = await page.evaluate(() => {
      const r = window.__dinoRunner, ctx = r.renderer.ctx, original = ctx.fillText, scales = [];
      ctx.fillText = function(text, ...args) {
        if (text.startsWith('SC ')) scales.push(this.getTransform().a);
        return original.call(this, text, ...args);
      };
      try {
        for (const flash of [1200, 1050, 0]) {
          r.game.meter.flash = flash;
          r.renderer.drawDistanceMeter(r.game.meter, 100, 90, '#dce9ff', 1, null);
        }
      } finally { ctx.fillText = original; }
      r.draw(1); return scales;
    });
    assert(still.every(scale => scale === still[0]), 'Reduced motion removes Canvas score movement');
    assert.equal(await page.locator('#hud-score').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
    reports.push({ name, samples, paused, reducedMotion: true });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'arcade-type.json'), JSON.stringify(reports, null, 2));
  console.log(`${engine}: arcade lettering, anchored START, pause, milestone readability, dark and reduced motion passed in 3 layouts`);
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}

