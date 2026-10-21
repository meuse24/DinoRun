// Arcade effects switch and automatic performance probe: default on, saved choice,
// Canvas lettering/shake gating, CSS effect scope, Help propagation, probe decisions
// (fast, 30 Hz cap, slow, janky) and the time-capped slow-device decision.
// Isolated offline file play; no live score requests. Optional delivery HTML.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/effects-setting'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-effects-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const browser = await pw[engine].launch({ headless: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }], ['portrait', { width: 360, height: 700 }]]) {
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
    await page.evaluate(() => window.__dinoTest.transitionDone());
    const state = () => page.evaluate(() => {
      const r = window.__dinoRunner;
      return { enabled: r.effectsSetting.enabled, checked: document.getElementById('effects-toggle').getAttribute('aria-checked'),
        off: document.documentElement.classList.contains('effects-off'), saved: localStorage.getItem('dino-effects'),
        help: !document.getElementById('effects-help').hidden, lettering: r.renderer.effects.lettering,
        probing: !!r.effectsSetting.probe };
    });
    // Default: on, no saved value, and deterministic test frames never probe.
    assert.deepEqual(await state(), { enabled: true, checked: 'true', off: false, saved: null, help: false, lettering: true, probing: false });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#round-panel .title-breath'), '::before').animationName), 'arcade-glow');
    // Manual switch in Settings.
    await page.locator('#settings-open').click();
    await page.evaluate(() => window.__dinoTest.transitionDone());
    const toggle = page.locator('#effects-toggle');
    if (name === 'desktop') await toggle.click(); else await toggle.tap();
    assert.deepEqual(await state(), { enabled: false, checked: 'false', off: true, saved: 'off', help: false, lettering: false, probing: false });
    await page.screenshot({ path: path.join(output, `${name}-settings-off.png`) });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#settings-title .heading-wave-char')).animationName.includes('arcade')), false,
      'Screen headings fall back to the previous motion');
    // Canvas: no callouts, banners, shake or digit wave while off; lettering text stays.
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__dinoTest.transitionDone());
    const gated = await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game, e = r.renderer.effects;
      e.callout('SHIELD!', 50, 50, 'shield'); e.announce('LEVEL 2'); e.shake(4);
      g.meter.flash = 1050; r.renderer.drawDistanceMeter(g.meter, 100, 90, '#dce9ff', 1, null);
      return { callouts: e.callouts.length, banner: e.banner, shake: e.shakeTime, hud: r.renderer.hud };
    });
    assert.deepEqual([gated.callouts, gated.banner, gated.shake, gated.hud.scale, gated.hud.lift], [0, null, 0, 1, 0]);
    assert.equal(gated.hud.text, 'SC 00100');
    // The choice survives a reload, and a saved choice never probes.
    await page.reload();
    await page.waitForFunction(() => !!window.__dinoRunner);
    assert.deepEqual(await state(), { enabled: false, checked: 'false', off: true, saved: 'off', help: false, lettering: false, probing: false });
    // Help inherits the setting.
    await page.locator('#info-link').click();
    await page.waitForFunction(() => document.getElementById('info-view').contentDocument?.documentElement.classList.contains('help-page'));
    assert.equal(await page.frameLocator('#info-view').locator('html').evaluate(el => el.classList.contains('effects-off')), true);
    await page.evaluate(() => window.__dinoRunner.effectsSetting.set(true, false));
    assert.equal(await page.frameLocator('#info-view').locator('html').evaluate(el => el.classList.contains('effects-off')), false);
    await page.goBack();
    // Probe decisions with synthetic device timing (interval or repeating pattern, work).
    const decide = (interval, work, frames = 130) => page.evaluate(([interval, work, frames]) => {
      const setting = window.__dinoRunner.effectsSetting;
      localStorage.removeItem('dino-effects');
      setting.enabled = true; setting.automatic = false; setting.apply();
      setting.probe = { skipped: 0, warmup: 0, elapsed: 0, intervals: [], work: [] };
      let result = null;
      for (let i = 0; i < frames && !result; i++)
        result = setting.sample(Array.isArray(interval) ? interval[i % interval.length] : interval, work);
      return { result, enabled: setting.enabled, saved: localStorage.getItem('dino-effects'),
        help: !document.getElementById('effects-help').hidden };
    }, [interval, work, frames]);
    const fast = await decide(16.7, 1);
    assert.deepEqual([fast.result.slow, fast.enabled, fast.saved], [false, true, null], 'Fast device keeps effects, probes again later');
    const capped = await decide(33.3, 1);
    assert.deepEqual([capped.result.slow, capped.enabled], [false, true], 'A 30 Hz cap with light work is not slow');
    const busy = await decide(33.3, 9);
    assert.deepEqual([busy.result.slow, busy.enabled, busy.saved, busy.help], [true, false, 'auto-off', true]);
    const jank = await decide([70, 16.7, 16.7, 16.7, 16.7], 1);
    assert.equal(jank.result.slow, true, 'Frequent long frames switch effects off');
    const slow = await decide(120, 2, 40);
    assert(slow.result, 'A very slow device decides within about two seconds of samples');
    assert.equal(slow.result.slow, true);
    // A manual choice after an automatic switch-off wins and hides the note.
    await page.locator('#settings-open').click();
    await page.evaluate(() => window.__dinoTest.transitionDone());
    await page.screenshot({ path: path.join(output, `${name}-settings-auto-off.png`) });
    if (name === 'desktop') await toggle.click(); else await toggle.tap();
    assert.deepEqual(await state(), { enabled: true, checked: 'true', off: false, saved: 'on', help: false, lettering: true, probing: false });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`${engine}: effects switch, persistence, gating, Help and probe decisions passed in 2 layouts`);
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
