import { loadPlaywright } from './helpers/playwright.mjs';
// Visual and deterministic regression checks for the Canvas vector caches.
// DINO_PLAYWRIGHT may point to an installed Playwright ESM entry point.
// Usage: node tests/render-cache.mjs <original dino.html> [preview URL]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const playwright = await loadPlaywright();
const baselineFile = process.argv[2];
assert(baselineFile, 'Pass the original HTML for the before/after comparison');
const url = process.argv[3] || 'http://127.0.0.1:8765/dino.html';
const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output'),
  engine === 'chromium' ? 'render-cache' : `render-cache-${engine}`);
fs.mkdirSync(output, { recursive: true });
const versions = [fs.readFileSync(baselineFile, 'utf8'), fs.readFileSync(path.join(root, 'dino.html'), 'utf8')];
let browser;
const configs = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { name: 'portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'dark', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' },
  { name: 'reduced', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' },
];
const scenes = [
  { name: 'day', distance: 0, night: 0 },
  { name: 'subpixel', distance: 17.1234567, night: 0.22, alpha: 0.37 },
  { name: 'near-boundary', distance: 128 / 0.028 - 0.001, night: 0.499 },
  { name: 'across-boundary', distance: 128 / 0.028 + 0.001, night: 0.501 },
  { name: 'foothill-boundary', distance: 92 / 0.072 + 0.001, night: 0.7 },
  { name: 'night', distance: 24123.56789, night: 1 },
  { name: 'long-run', distance: 100000000.345, night: 0.4 },
  { name: 'boost', distance: 1834.567, night: 0.3, boost: true, particles: true },
  { name: 'jump', distance: 319.234, night: 0.2, jump: true },
  { name: 'duck', distance: 452.19, night: 0.8, duck: true },
  { name: 'ghost', distance: 7612.13, night: 0.6, dead: true },
  { name: 'idle', distance: 0, night: 0, idle: true },
  { name: 'resize-portrait', distance: 8321.34, night: 0.2, viewport: { width: 390, height: 844 } },
  { name: 'resize-landscape', distance: 17632.14, night: 0.8, viewport: { width: 844, height: 390 } },
];
const report = [];
const runtime = [];
try {
  for (const cfg of configs) {
    const { name, ...options } = cfg;
    const snapshots = [];
    let originalTrace;
    const timings = [];
    for (let version = 0; version < 2; version++) {
      // Isolate long benchmarks and large DPR snapshots: closing a context alone
      // need not release the browser process's retained graphics resources.
      browser = await playwright[engine].launch({ headless: true });
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.route(url, route => route.fulfill({ contentType: 'text/html', body: versions[version] }));
      await page.addInitScript(() => {
        let seed = 937;
        const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        Math.random = random;
        // Compare the established game without the intentionally new pickup.
        window.__dinoTest = { credits: 99, random, now: () => 1000, highscoreApiUrl: null, featherEnabled: false };
        window.requestAnimationFrame = () => 0;
      });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__dinoRunner);
      for (const scene of scenes) {
        if (scene.viewport) {
          await page.setViewportSize(scene.viewport);
          await page.evaluate(() => window.__dinoRunner.resize());
        }
        const snapshot = await page.evaluate(scene => {
          const r = window.__dinoRunner, g = r.game, t = g.trex, h = g.horizon;
          r.paused = true;
          r.sound.enabled = false;
          r.music.sync(false);
          t.reset();
          g.state = scene.dead ? 'crashed' : scene.idle ? 'attract' : 'playing';
          g.gameTime = 12345;
          g.attractTime = scene.idle ? 8100 : 0;
          g.sceneryDistance = scene.distance;
          g.nightAlpha = scene.night;
          g.night = scene.night > 0.5;
          g.score = 230;
          t.running = !scene.dead && !scene.idle;
          t.frameTimer = 37;
          t.tailOffset = 1.345;
          t.ducking = !!scene.duck;
          t.jumping = !!scene.jump;
          t.jumpPose = scene.jump ? 'arms' : null;
          t.jumpPoseTime = scene.jump ? 123 : 0;
          t.y = t.groundY - (scene.jump ? 63.17 : 0);
          t.dead = !!scene.dead;
          t.deathTime = scene.dead ? 1873 : 0;
          t.turbo = !!scene.boost;
          g.turbo.remaining = scene.boost ? 3100 : 0;
          g.turbo.pickup = null;
          h.obstacles.length = 0;
          const next = h.rng.next;
          for (const [sample, x] of [[0.01, 153.123], [0.55, 268.543], [0.95, 367.235]]) {
            h.rng.next = () => sample;
            h.addObstacle(10, 300);
            h.obstacles.at(-1).x = x;
          }
          h.rng.next = next;
          h.groundOffset = 7.432;
          h.groundIndex = 32;
          r.renderer.effects.reset();
          if (scene.particles) {
            r.renderer.effects.burst(170, 165, 18, 'spark');
            r.renderer.effects.burst(180, 188, 20, 'landing');
          }
          g.capturePrevious();
          g.previous.sceneryDistance -= 6.7;
          t.prevY += 2.7;
          for (const o of h.obstacles) o.prevX += 6.7;
          for (const c of h.clouds) c.prevX += 0.2;
          // Start each snapshot from the same opaque buffer, including its fractional
          // bottom row; repeated draws otherwise accumulate antialiasing coverage there.
          const canvas = document.getElementById('canvas'), ctx = r.renderer.ctx;
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
          r.draw(scene.alpha ?? 1);
          return { image: canvas.toDataURL(), canvas: { width: canvas.width, height: canvas.height,
            contextLost: ctx.isContextLost?.() ?? false }, state: JSON.stringify({
            score: g.score, night: g.nightAlpha, trex: { x: t.x, y: t.y, jumping: t.jumping },
            obstacles: h.obstacles.map(o => [o.type.name, o.x, o.size]),
            particles: r.renderer.effects.particles,
          }) };
        }, scene);
        const filename = `${name}-${scene.name}-${version ? 'after' : 'before'}.png`;
        assert(snapshot.image.startsWith('data:image/png;base64,'),
          `${filename}: no Canvas PNG was produced: ${JSON.stringify(snapshot.canvas)}`);
        fs.writeFileSync(path.join(output, filename), Buffer.from(snapshot.image.split(',')[1], 'base64'));
        if (!version) snapshots.push(snapshot);
        else {
          const before = snapshots[scenes.indexOf(scene)];
          assert.equal(snapshot.state, before.state, `${name}/${scene.name}: simulation or cosmetic RNG changed`);
          const diff = await page.evaluate(async ({ before, after }) => {
            const image = new Image(), current = new Image();
            image.src = before; current.src = after;
            await Promise.all([image.decode(), current.decode()]);
            const probe = document.createElement('canvas');
            probe.width = image.width; probe.height = image.height;
            if (current.width !== probe.width || current.height !== probe.height) throw Error('Resolution changed');
            const ctx = probe.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(image, 0, 0);
            const a = ctx.getImageData(0, 0, probe.width, probe.height).data;
            ctx.clearRect(0, 0, probe.width, probe.height);
            ctx.drawImage(current, 0, 0);
            const b = ctx.getImageData(0, 0, probe.width, probe.height).data;
            let changed = 0, max = 0, total = 0, significant = 0;
            for (let i = 0; i < a.length; i += 4) {
              let delta = 0;
              for (let k = 0; k < 4; k++) { const d = Math.abs(a[i+k] - b[i+k]); max = Math.max(max, d); total += d; delta = Math.max(delta, d); }
              if (delta) changed++;
              if (delta > 8) significant++;
            }
            return { width: probe.width, height: probe.height, changed, significant, max, mean: total / a.length };
          }, { before: before.image, after: snapshot.image });
          report.push({ viewport: name, scene: scene.name, ...diff });
          // Moving retained paths can differ by a few antialiasing channel levels.
          // Reject shape/color changes or differences covering a perceptible area.
          assert(diff.max <= 8 && diff.changed / (diff.width * diff.height) < 0.0002,
            `${name}/${scene.name}: visual difference exceeds the edge rounding tolerance: ${JSON.stringify(diff)}`);
        }
      }
      const checks = await page.evaluate(version => {
        const r = window.__dinoRunner;
        const randomSource = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        const g = new r.game.constructor({ random: randomSource(9147), cosmeticRandom: randomSource(284),
          highScore: 30, featherEnabled: false, width: r.game.world?.width ?? 600 });
        const fx = new r.renderer.effects.constructor(
          new r.renderer.effects.rng.constructor(randomSource(819)), false, g.world);
        const lifecycle = {};
        g.on(event => {
          lifecycle[event.type] = (lifecycle[event.type] || 0) + 1;
          if (event.type === 'step') {
            fx.update(event.dt, g.trex, g.playing, g.speed, event.landed);
            if (event.landed) lifecycle.landings = (lifecycle.landings || 0) + 1;
          }
          if (event.type === 'destroy' || event.type === 'spark') fx.burst(event.x, event.y, event.type === 'destroy' ? 18 : 2, 'spark');
          if (event.type === 'crash') fx.burst(g.trex.x + 28, g.trex.y + 25, 20, 'impact');
          if (event.type === 'record') fx.celebrate();
        });
        g.start(0);
        const trace = [];
        let maxParticles = 0, reusedArrays = true;
        for (let frame = 0; frame < 12000; frame++) {
          if (g.crashed && g.canRestart()) g.restart(0);
          if (g.playing) {
            if (frame % 41 === 0) g.jump();
            if (frame % 41 === 7) g.endJump();
            if (frame % 103 === 70) g.duck(true);
            if (frame % 103 === 76) g.duck(false);
            if (frame % 719 === 100) g.turbo.activate(g.trex);
          }
          const arrays = [g.horizon.obstacles, g.horizon.clouds, fx.particles];
          g.advance(frame % 17 === 0 ? 1000 / 30 : 1000 / 60);
          reusedArrays &&= arrays[0] === g.horizon.obstacles && arrays[1] === g.horizon.clouds && arrays[2] === fx.particles;
          maxParticles = Math.max(maxParticles, fx.particles.length);
          if (frame % 60 === 0) trace.push(JSON.stringify({
            state: g.state, score: g.score, speed: g.speed, distance: g.sceneryDistance,
            trex: [g.trex.x, g.trex.y, g.trex.velocity, g.trex.jumping, g.trex.ducking],
            obstacles: g.horizon.obstacles.map(o => [o.type.name, o.x, o.y, o.size]),
            clouds: g.horizon.clouds, particles: fx.particles, turbo: [g.turbo.remaining, g.turbo.pickup],
          }));
        }
        const renderer = r.renderer;
        const model = r.game;
        model.state = 'playing'; model.trex.dead = false; model.trex.turbo = false;
        model.turbo.remaining = 0; model.sceneryDistance = model.previous.sceneryDistance = 0;
        renderer.effects.reset();
        // Check reuse while position and color change, then bounded memory over many tiles.
        let cacheChecks = null;
        if (version) {
          renderer.draw(1);
          const layers = renderer.mountainLayers.slice();
          model.sceneryDistance = model.previous.sceneryDistance = 0.5;
          model.nightAlpha = 0.77;
          renderer.draw(1);
          const reusedLayers = layers.every((layer, i) => layer === renderer.mountainLayers[i]);
          const reusedCactus = renderer.cactusGeometry(false) === renderer.cactusGeometry(false)
            && renderer.cactusGeometry(true) === renderer.cactusGeometry(true);
          let maxFaces = 0;
          for (let tile = 0; tile < 1000; tile++) {
            model.sceneryDistance = model.previous.sceneryDistance = tile * 100000 + 0.123;
            renderer.draw(1);
            for (const layer of renderer.mountainLayers) maxFaces = Math.max(maxFaces, layer.faces.length);
          }
          cacheChecks = { reusedLayers, reusedCactus, layers: renderer.mountainLayers.length, maxFaces };
        }
        // Paired CPU submission benchmark with scrolling, including occasional cache rebuilds.
        // This deliberately excludes GPU completion and is not a device FPS benchmark.
        model.nightAlpha = 0.3;
        model.sceneryDistance = model.previous.sceneryDistance = 0;
        for (let frame = 0; frame < 60; frame++) renderer.draw(1);
        const times = [];
        for (let round = 0; round < 5; round++) {
          const start = performance.now();
          for (let frame = 0; frame < 300; frame++) {
            model.sceneryDistance += 6.123;
            model.previous.sceneryDistance = model.sceneryDistance;
            renderer.draw(1);
          }
          times.push((performance.now() - start) / 300);
        }
        times.sort((a, b) => a - b);
        return { trace: JSON.stringify(trace), lifecycle, maxParticles, reusedArrays, cacheChecks, cpuMsPerDraw: times[2] };
      }, version);
      if (!version) originalTrace = checks.trace;
      else {
        const expected = JSON.parse(originalTrace), actual = JSON.parse(checks.trace);
        assert.equal(actual.length, expected.length, `${name}: simulation trace length changed`);
        const firstDifference = expected.findIndex((sample, i) => sample !== actual[i]);
        if (firstDifference !== -1) fs.writeFileSync(path.join(output, `${name}-trace-difference.json`),
          JSON.stringify({ sample: firstDifference,
            before: JSON.parse(expected[firstDifference]), after: JSON.parse(actual[firstDifference]) }, null, 2));
        assert.equal(firstDifference, -1, `${name}: deterministic simulation/effects changed; inspect trace-difference.json`);
        assert(checks.maxParticles <= 100 && checks.reusedArrays, `${name}: particle cap or array reuse failed`);
        assert(checks.lifecycle.crash > 0 && checks.lifecycle.restart > 0 && checks.lifecycle.landings > 0,
          `${name}: missing lifecycle coverage`);
        assert(checks.cacheChecks.reusedLayers && checks.cacheChecks.reusedCactus
          && checks.cacheChecks.layers === 2 && checks.cacheChecks.maxFaces <= 20, `${name}: cache bounds/reuse failed`);
      }
      timings.push({ version: version ? 'after' : 'before', cpuMsPerDraw: checks.cpuMsPerDraw,
        maxParticles: checks.maxParticles, lifecycle: checks.lifecycle, cacheChecks: checks.cacheChecks });
      assert.deepEqual(errors, [], `${name}: browser errors`);
      await context.close();
      await browser.close();
      browser = null;
    }
    runtime.push({ viewport: name, framesCompared: 12000, timings });
  }
} finally { await browser?.close(); }
fs.writeFileSync(path.join(output, 'visual-comparison.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(output, 'runtime-comparison.json'), JSON.stringify(runtime, null, 2));
console.log(JSON.stringify({ visualComparisons: report.length, maxChannelDifference: Math.max(...report.map(r => r.max)),
  maxChangedFraction: Math.max(...report.map(r => r.changed / (r.width * r.height))), runtime }, null, 2));
