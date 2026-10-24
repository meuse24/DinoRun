// Deterministic particle lifetime/reset and controller regressions against a saved HTML.
// Usage: node tests/gc-pooling.mjs <baseline.html>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
assert(process.argv[2], 'Pass a saved pre-change HTML');
const root = path.resolve(import.meta.dirname, '..');
const pw = await import(process.env.DINO_PLAYWRIGHT ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/gc-optimization'), `pooling-${engine}`);
fs.mkdirSync(output, { recursive: true });
const browser = await pw[engine].launch();
const results = [];
try {
  for (const file of [process.argv[2], path.join(root, 'dino.html')]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/dino.html'
      ? route.fulfill({ contentType: 'text/html', body: fs.readFileSync(file, 'utf8') }) : route.abort());
    await page.addInitScript(() => {
      window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null };
      window.requestAnimationFrame = () => 0;
    });
    await page.goto('http://127.0.0.1/dino.html');
    await page.waitForFunction(() => !!window.__dinoRunner);
    results.push(await page.evaluate(() => {
      const r = window.__dinoRunner;
      let seed = 1937;
      const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const fx = new r.renderer.effects.constructor(new r.renderer.effects.rng.constructor(random), false, r.game.world);
      const identities = new Set(), trace = [];
      let bounded = true, resetReused = true, maxActive = 0;
      const kinds = ['trail', 'spark', 'feather', 'shield', 'rock', 'confetti', 'impact', 'landing'];
      for (let i = 0; i < 2000; i++) {
        if (i % 11 === 0) fx.burst(100 + i * 0.13, 90, 48, kinds[(i / 11 | 0) % kinds.length]);
        if (i % 137 === 0) {
          const array = fx.particles;
          fx.reset();
          resetReused &&= array === fx.particles;
        }
        fx.update(1000 / 60, r.game.trex, true, 9, i % 113 === 0);
        for (const p of fx.particles) identities.add(p);
        maxActive = Math.max(maxActive, fx.particles.length);
        if (fx.freeParticles) {
          const all = [...fx.particles, ...fx.freeParticles];
          bounded &&= all.length <= 100 && new Set(all).size === all.length;
        }
        if (i % 7 === 0) trace.push(JSON.stringify(fx.particles));
      }
      fx.reset();
      fx.burst(100, 100, 110, 'confetti');
      const capped = fx.particles.length === 100;
      // First draw after recycling must use the new spawn, not stale previous coordinates.
      const freshInterpolation = fx.particles.every(p => p.prevX === undefined && p.prevY === undefined);
      fx.reset(); fx.reducedMotion.matches = true; fx.burst(100, 100, 100, 'confetti');
      const reducedMotion = fx.particles.length === 0;
      const log = [], records = new Set();
      let pads = [], fails = false;
      const fake = { playing: true, crashed: false,
        input: { setMethod: method => log.push(['method', method]) },
        announce() {}, duck: (value, source) => log.push(['duck', value, source]),
        endJump: () => log.push(['end']), startFromInput: () => log.push(['start']),
        unlockAudio: () => log.push(['audio']), restart: () => log.push(['restart']) };
      const control = new r.gamepad.constructor(fake, () => {
        if (fails) throw Error('disconnected provider');
        return pads;
      });
      const pad = index => ({ index, mapping: 'standard', connected: true,
        buttons: Array.from({ length: 16 }, () => ({ pressed: false })) });
      const a = pad(0), b = pad(1), unsupported = pad(2);
      unsupported.mapping = 'vendor'; unsupported.buttons[0].pressed = true;
      const poll = active => { control.poll(active); records.add(control.previous); if (control.current) records.add(control.current); };
      pads = [null, unsupported]; poll(true);
      pads = [null, a]; a.buttons[0].pressed = true; poll(true); poll(true);
      a.buttons[0].pressed = false; poll(true);
      a.buttons[1].pressed = true; poll(true); poll(false); poll(true);
      a.buttons[1].pressed = false; poll(true);
      a.buttons[0].pressed = true; poll(true);
      pads = [b]; b.buttons[0].pressed = true; poll(true); poll(true);
      b.buttons[0].pressed = false; poll(true); b.buttons[0].pressed = true; poll(true);
      b.buttons[0].pressed = false; poll(true);
      fake.crashed = true; b.buttons[9].pressed = true; poll(true);
      fails = true; poll(true); fails = false; pads = []; poll(true);
      for (let i = 0; i < 1000; i++) poll(true);
      // Warm HUD renders retain diagnostics and use one offsets buffer.
      r.renderer.drawDistanceMeter(r.game.meter, 120, 140, '#535353', 2, 60);
      const hud = r.renderer.hud, offsets = r.renderer.glyphOffsets;
      r.game.meter.flash = 840;
      for (let i = 0; i < 30; i++) r.renderer.drawDistanceMeter(r.game.meter, 120, 140, '#535353', 2, 60);
      return { trace, log, bounded, resetReused, maxActive, identities: identities.size, capped,
        freshInterpolation, reducedMotion, records: records.size,
        hudReused: hud === r.renderer.hud, offsetsReused: !!offsets && offsets === r.renderer.glyphOffsets,
        hud: { ...r.renderer.hud } };
    }));
    assert.deepEqual(errors, [], 'No browser errors');
    await page.close();
  }
  assert.deepEqual(results[1].trace, results[0].trace, 'Particle state, RNG order and active order unchanged');
  assert.deepEqual(results[1].log, results[0].log, 'Controller edge/release/disconnect/restart behavior unchanged');
  assert.deepEqual(results[1].hud, results[0].hud, 'Milestone diagnostic values unchanged');
  const after = results[1];
  assert(after.bounded && after.resetReused && after.identities <= 100 && after.maxActive <= 100);
  assert(after.capped && after.freshInterpolation && after.reducedMotion);
  assert(after.records <= 2 && after.hudReused && after.offsetsReused);
  const summary = results.map(({ trace, log, ...result }) => ({ ...result, samples: trace.length, inputEvents: log.length }));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ engine, results: summary }, null, 2));
} finally { await browser.close(); }
