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
      window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null, musicAudio };
      localStorage.setItem('dino-fullscreen-disabled', 'true');
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!window.__dinoRunner);
    // Both embedded faces load offline from the file itself.
    assert.deepEqual(await page.evaluate(async () => {
      await document.fonts.ready;
      return ["16px 'Dino Pixel'", "16px 'Dino Display'"].map(font => document.fonts.check(font));
    }), [true, true]);
    assert.match(await page.locator('#start-game').evaluate(el => getComputedStyle(el).fontFamily), /Dino Display/);
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
    await page.evaluate(() => { const r = window.__dinoRunner; r.attract.userPaused = !r.attract.paused; r.draw(1); });
    const paused = await page.locator('#start-game').evaluate(button => ({
      label: getComputedStyle(button.querySelector('.action-label')).animationPlayState,
      light: getComputedStyle(button, '::before').animationPlayState,
      sheen: getComputedStyle(button, '::after').animationPlayState,
      glow: getComputedStyle(document.querySelector('#round-panel .title-breath'), '::before').animationPlayState,
    }));
    assert.deepEqual(paused, { label: 'paused', light: 'paused', sheen: 'paused', glow: 'paused' });
    await page.evaluate(() => { const r = window.__dinoRunner; r.attract.userPaused = !r.attract.paused; r.draw(1); });
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
      const r = window.__dinoRunner, g = r.game, samples = [];
      for (const flash of [1200, 1050, 800, 600, 200, 0]) {
        g.meter.flash = flash;
        r.renderer.drawDistanceMeter(g.meter, 100, 90, '#dce9ff', 1, null);
        samples.push({ ...r.renderer.hud });
      }
      g.meter.flash = 1050; r.draw(1);
      return samples;
    });
    assert.equal(samples.length, 6, 'Score remains readable in every milestone phase');
    assert(samples.every(sample => sample.text === 'SC 00100'));
    assert(samples[1].scale > samples[0].scale, 'Milestone punches once: ' + JSON.stringify(samples));
    assert(samples[1].lift < 0, 'Milestone digits hop in a wave');
    assert.equal(samples[3].scale, samples[5].scale, 'Punch settles before the milestone ends');
    assert(samples.slice(3).every(sample => sample.lift === 0), 'Digits settle before the milestone ends');
    assert(samples.every(sample => /16px .*Dino Pixel/.test(sample.font)), 'Score uses the pixel face: ' + samples[0].font);
    const pixelText = await page.evaluate(() => {
      const r = window.__dinoRunner.renderer, ctx = r.ctx, calls = [];
      let copies = 0;
      const fill = ctx.fillText, draw = ctx.drawImage;
      ctx.fillText = function(text, x, y) { calls.push({ text, x, y, font: this.font, style: this.fillStyle }); return fill.apply(this, arguments); };
      ctx.drawImage = function() { copies++; return draw.apply(this, arguments); };
      const before = { font: ctx.font, align: ctx.textAlign, baseline: ctx.textBaseline };
      try {
        r.drawPixelText('SC 00100', 100, 10, 16, '#ffd257', '#081330', 'right');
        const steady = calls.splice(0);
        r.drawPixelText('0123', 0, 0, 16, '#ffd257', null, 'left', (i) => -i);
        const lifted = calls.splice(0);
        const after = { font: ctx.font, align: ctx.textAlign, baseline: ctx.textBaseline };
        return { steady, lifted, copies, restored: JSON.stringify(before) === JSON.stringify(after) };
      } finally { ctx.fillText = fill; ctx.drawImage = draw; }
    });
    // Direct text keeps GPU canvases fast; per-glyph canvas copies halved A53 play.
    assert.equal(pixelText.copies, 0, 'HUD text copies no cached canvases');
    assert.equal(pixelText.steady.length, 2, 'A steady shadowed line is one shadow and one face fill');
    assert.deepEqual(pixelText.steady.map(c => [c.text, c.x, c.y, c.style]),
      [['SC 00100', -27, 11, '#081330'], ['SC 00100', -28, 10, '#ffd257']], 'Right-aligned with a 1px night shadow');
    assert(pixelText.steady.every(c => /16px .*Dino Pixel/.test(c.font)), 'Pixel face: ' + pixelText.steady[0].font);
    assert.deepEqual(pixelText.lifted.map(c => [c.text, c.x, c.y]), [['0', 0, 0], ['1', 16, -1], ['2', 32, -2], ['3', 48, -3]],
      'Hopping digits keep one-em advances and individual lifts');
    assert(pixelText.restored, 'Pixel text leaves the context font and alignment unchanged');
    // Event lettering: cached sprites, overshoot pop, rise and fade; level banners sweep.
    const lettering = await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game, e = r.renderer.effects, sizes = [];
      e.callouts.length = 0;
      e.callout('SHIELD!', g.trex.x, g.trex.y - 6, 'shield');
      const original = r.renderer.drawArcade, draws = [];
      r.renderer.drawArcade = function(text, style, x, y, scale, alpha) {
        draws.push({ text, y, scale, alpha }); return original.apply(this, arguments);
      };
      try {
        for (const step of [0, 120, 300, 500]) {
          e.update(step, g.trex, true, g.speed, false);
          r.renderer.drawCallouts(e);
        }
        e.announce('LEVEL 2', 'SPEED UP!');
        e.recordTime = 0;
        r.renderer.drawBanner(e, g);
      } finally { r.renderer.drawArcade = original; }
      const cached = r.renderer.textSprites.size;
      r.renderer.arcadeText('SHIELD!', 'shield');
      sizes.push(cached, r.renderer.textSprites.size);
      return { draws, sizes };
    });
    const pops = lettering.draws.filter(draw => draw.text === 'SHIELD!');
    assert.equal(pops.length, 4);
    assert(pops[1].scale > 1, 'Callout overshoots while popping in');
    assert(pops[3].y < pops[0].y && pops[3].scale === 1, 'Callout rises and settles');
    assert(lettering.draws.some(draw => draw.text === 'LEVEL 2'), 'Level banner draws');
    assert.equal(lettering.sizes[0], lettering.sizes[1], 'Lettering sprites are cached');
    assert.equal(await page.locator('#hud-score').getAttribute('aria-label'), 'Score 100');
    assert.equal(await page.locator('#mobile-hud').evaluate(el => el.hasAttribute('data-milestone')), true);
    assert.equal(await page.locator('#hud-score').evaluate(el => getComputedStyle(el).color), 'rgb(255, 210, 87)');
    await page.screenshot({ path: path.join(output, `${name}-arcade-record.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__dinoGame.trex.reducedMotion.matches);
    const still = await page.evaluate(() => {
      const r = window.__dinoRunner, scales = [];
      for (const flash of [1200, 1050, 0]) {
        r.game.meter.flash = flash;
        r.renderer.drawDistanceMeter(r.game.meter, 100, 90, '#dce9ff', 1, null);
        scales.push(r.renderer.hud.lift === 0 ? r.renderer.hud.scale : NaN);
      }
      r.draw(1); return scales;
    });
    assert(still.every(scale => scale === still[0]), 'Reduced motion removes Canvas score movement');
    assert.equal(await page.locator('#hud-score').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
    reports.push({ name, samples, paused, reducedMotion: true });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'arcade-type.json'), JSON.stringify(reports, null, 2));
  console.log(`${engine}: embedded faces, arcade lettering, anchored START, pause, milestone readability, callouts, dark and reduced motion passed in 3 layouts`);
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}

