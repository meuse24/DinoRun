// Isolated alternating before/after Chromium work-time, GC trace and allocation sampling.
// Usage: node tests/gc-performance.mjs <baseline.html>
// DINO_CPU_RATE=4 approximates CPU contention; it does not emulate a physical phone.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
assert(process.argv[2], 'Pass a saved pre-change HTML');
const root = path.resolve(import.meta.dirname, '..');
const pw = await import(process.env.DINO_PLAYWRIGHT ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const rate = Number(process.env.DINO_CPU_RATE || 1);
const frames = Number(process.env.DINO_BENCH_FRAMES || 1200);
const rounds = Number(process.env.DINO_BENCH_ROUNDS || 4);
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/gc-optimization'), `performance-cpu${rate}`);
fs.mkdirSync(output, { recursive: true });
const sources = [fs.readFileSync(process.argv[2], 'utf8'), fs.readFileSync(path.join(root, 'dino.html'), 'utf8')];
const report = { rate, frames, rounds, browser: null, methodology: 'Manual fixed steps; update, HUD, polling and rendering. CPU work, not rAF FPS or GPU completion.', samples: [], allocations: [] };
report.sourceHashes = sources.map(source => createHash('sha256').update(source).digest('hex'));

async function open(version, scene) {
  // Separate processes avoid accumulated graphics buffers and cross-page GC.
  const browser = await pw.chromium.launch();
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/dino.html'
    ? route.fulfill({ contentType: 'text/html', body: sources[version] }) : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('dino-fullscreen-disabled', 'true');
    let seed = 937;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    Math.random = random;
    window.__dinoTest = { credits: 99, manualFrames: true, random, highscoreApiUrl: null };
    window.__benchRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
  });
  await page.goto('http://127.0.0.1/dino.html');
  await page.waitForFunction(() => !!window.__dinoRunner);
  await page.evaluate(async scene => {
    await document.fonts.ready;
    const r = window.__dinoRunner;
    r.renderer.prewarmToken = {}; // Exclude unrelated idle lettering setup.
    r.sound.enabled = false; r.music.sync(false); r.game.start(0);
    r.game.recoveryRemaining = 1e9; // Controlled survival, same recovery rendering in both versions.
    r.game.night = scene === 'night'; r.game.nightAlpha = scene === 'night' ? 1 : 0;
    window.benchStep = i => {
      r.gamepad.poll(); r.update(1000 / 60);
      if (scene === 'bursts' && i % 30 === 0) r.renderer.effects.burst(200, 100, 48, 'confetti');
      r.draw(1);
    };
    for (let i = 0; i < 180; i++) window.benchStep(i);
  }, scene);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('HeapProfiler.collectGarbage'); // Outside the measured interval.
  return { browser, page, cdp, errors };
}

async function workload(page) {
  return page.evaluate(async ({ frames, rate }) => {
    const times = new Float64Array(frames), r = window.__dinoRunner;
    let total = 0;
    for (let i = 0; i < frames; i++) {
      // Avoid building a huge unpresented drawing queue under DevTools throttling.
      if (rate > 1) await new Promise(window.__benchRAF);
      const start = performance.now();
      window.benchStep(i + 180);
      times[i] = performance.now() - start;
      total += times[i];
    }
    const mean = total / frames;
    times.sort();
    return { mean, p50: times[Math.floor(frames * 0.5)], p95: times[Math.floor(frames * 0.95)],
      p99: times[Math.floor(frames * 0.99)], max: times[frames - 1],
      over16ms: times.filter(time => time > 1000 / 60).length,
      state: JSON.stringify({ state: r.game.state, score: r.game.score, lives: r.game.lives,
        x: r.game.trex.x, y: r.game.trex.y,
        particles: r.renderer.effects.particles.map(p => [p.x, p.y, p.life, p.color]) }) };
  }, { frames, rate });
}

for (const scene of (process.env.DINO_BENCH_SCENES || 'day,night,bursts').split(',')) {
  let expected;
  for (let round = 0; round < rounds; round++) {
    const version = [0, 1, 1, 0][round % 4];
    const { browser, page, cdp, errors } = await open(version, scene);
    try {
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-v8.gc', transferMode: 'ReturnAsStream' });
      const measurement = await workload(page);
      const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream } = await completed;
      let trace = '';
      for (;;) {
        const part = await cdp.send('IO.read', { handle: stream });
        trace += part.base64Encoded ? Buffer.from(part.data, 'base64').toString() : part.data;
        if (part.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      fs.writeFileSync(path.join(output, `${scene}-${round}-${version ? 'after' : 'before'}.trace.json`), trace);
      const events = JSON.parse(trace).traceEvents;
      // Top-level GC intervals only; nested V8 scopes would double-count the same pause.
      const gc = events.filter(e => e.ph === 'X' && (e.name === 'MinorGC' || e.name === 'MajorGC'));
      const gcMs = gc.reduce((sum, e) => sum + e.dur / 1000, 0);
      if (expected === undefined) expected = measurement.state;
      assert.equal(measurement.state, expected, `${scene}: benchmark states differ`);
      delete measurement.state;
      const sample = { scene, version: version ? 'after' : 'before', round, ...measurement,
        gcCount: gc.length, gcMs, gcMaxMs: Math.max(0, ...gc.map(e => e.dur / 1000)) };
      report.samples.push(sample);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify(sample));
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  // Sampling is intentionally separate: the profiler itself changes timings and GC.
  if (process.env.DINO_SKIP_ALLOCATIONS !== '1') for (let version = 0; version < 2; version++) {
    const { browser, page, cdp, errors } = await open(version, scene);
    try {
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096,
        includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await workload(page);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      fs.writeFileSync(path.join(output, `${scene}-${version ? 'after' : 'before'}.heapprofile`), JSON.stringify(profile));
      let bytes = 0, sourceBytes = 0;
      const functions = new Map();
      function walk(node) {
        bytes += node.selfSize;
        if (node.callFrame.url === 'http://127.0.0.1/dino.html') {
          sourceBytes += node.selfSize;
          const name = node.callFrame.functionName + ':' + (node.callFrame.lineNumber + 1);
          functions.set(name, (functions.get(name) || 0) + node.selfSize);
        }
        for (const child of node.children) walk(child);
      }
      walk(profile.head);
      report.allocations.push({ scene, version: version ? 'after' : 'before', estimatedBytes: bytes,
        estimatedSourceBytes: sourceBytes, functions: [...functions].sort((a, b) => b[1] - a[1]).slice(0, 16) });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
}
console.log(`Report: ${path.join(output, 'report.json')}`);
