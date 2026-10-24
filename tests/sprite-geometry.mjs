import { loadPlaywright } from './helpers/playwright.mjs';
// Compare retained sprite geometry against a saved pre-change HTML, without a server.
// Usage: node tests/sprite-geometry.mjs <baseline.html>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
assert(process.argv[2], 'Pass a saved pre-change HTML');
const pw = await loadPlaywright();
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output'), `sprite-geometry-${engine}`);
fs.mkdirSync(output, { recursive: true });
const browser = await pw[engine].launch();
const results = [];
try {
  for (const file of [process.argv[2], path.join(root, 'dino.html')]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/dino.html'
      ? route.fulfill({ contentType: 'text/html', body: fs.readFileSync(file, 'utf8') })
      : route.abort());
    await page.addInitScript(() => {
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null };
      window.requestAnimationFrame = () => 0;
    });
    await page.goto('http://127.0.0.1/dino.html');
    await page.waitForFunction(() => !!window.__dinoRunner);
    results.push(await page.evaluate(() => {
      const runner = window.__dinoRunner, renderer = runner.renderer;
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 720;
      const ctx = canvas.getContext('2d');
      renderer.ctx = ctx;
      ctx.fillStyle = '#c6d9e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Both wing frames, mouth cutouts, tail/arm/eye motion, transforms and alpha.
      const poses = [null, 'arms', 'grin', 'wave', 'tongue', 'fire', 'eyeroll', 'legs'];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < poses.length; col++) {
          const t = Object.assign(Object.create(runner.game.trex), {
            x: 15.123, y: 15.37, idleTime: row === 2 ? 923 : 0,
            idlePose: row === 2 ? poses[col] : null, idleProgress: 0.41,
            jumping: row !== 2, jumpPose: poses[col], jumpPoseTime: 127 + row * 31,
            tailOffset: row * 1.345, frameTimer: 37 + row * 21, frame: row % 2,
            running: true, dead: false, ducking: false, turbo: col === 5,
          });
          ctx.save();
          ctx.translate(col * 150 + 10.37, row * 240 + 10.123);
          ctx.scale(1.123 + row * 0.31, 1.123 + row * 0.31);
          ctx.globalAlpha = 1 - row * 0.17;
          renderer.drawTrex(t);
          renderer.drawPtero({ x: 12.37, y: 85.123, width: 46, frame: row % 2 });
          ctx.restore();
        }
      }
      const image = canvas.toDataURL();
      // Count JS path construction submissions, not raster work or GPU completion.
      let commands = 0;
      for (const name of ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'arc', 'closePath']) {
        const original = ctx[name].bind(ctx);
        ctx[name] = (...args) => { commands++; return original(...args); };
      }
      const bird = { x: 90.123, y: 100.37, width: 46, frame: 0 };
      renderer.drawPtero(bird);
      const birdCommands = commands;
      commands = 0;
      renderer.drawTrexBody(runner.game.trex);
      const bodyCommands = commands;
      let cache = null;
      if (renderer.pteroGeometry && renderer.trexDetails) {
        const birdPaths = renderer.pteroGeometry(), details = renderer.trexDetails();
        // Fail on any hot-path Path2D allocation after warm-up, even if replaced in a slot.
        const OriginalPath = window.Path2D;
        let allocations = 0;
        window.Path2D = new Proxy(OriginalPath, { construct(target, args) {
          allocations++; return new target(...args);
        } });
        try {
          for (let i = 0; i < 2000; i++) {
            ctx.setTransform(1 + i % 3, 0, 0, 1 + i % 3, 0, 0);
            bird.x = i * 0.137; bird.frame = i % 2;
            renderer.drawPtero(bird);
            renderer.drawTrexBody(Object.assign(Object.create(runner.game.trex), {
              x: bird.x, y: 10.123, tailOffset: Math.sin(i),
            }));
          }
        } finally { window.Path2D = OriginalPath; }
        cache = { reused: birdPaths === renderer.pteroGeometry() && details === renderer.trexDetails(),
          allocations, paths: 4 + birdPaths.wings.length + 2 + details.scales.length };
      }
      return { image, birdCommands, bodyCommands, cache };
    }));
    assert.deepEqual(errors, [], 'No browser exceptions');
    await page.close();
  }
  const page = await browser.newPage();
  const diff = await page.evaluate(async images => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 720;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), pixels = [];
    for (const src of images) {
      const image = new Image(); image.src = src; await image.decode();
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
      pixels.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    }
    let max = 0, changed = 0;
    for (let i = 0; i < pixels[0].length; i += 4) {
      let delta = 0;
      for (let k = 0; k < 4; k++) delta = Math.max(delta, Math.abs(pixels[0][i + k] - pixels[1][i + k]));
      max = Math.max(max, delta); if (delta) changed++;
    }
    return { max, changed, fraction: changed / (canvas.width * canvas.height) };
  }, results.map(result => result.image));
  for (let i = 0; i < results.length; i++) {
    fs.writeFileSync(path.join(output, i ? 'after.png' : 'before.png'), Buffer.from(results[i].image.split(',')[1], 'base64'));
    delete results[i].image;
  }
  const report = { diff, results };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  assert(diff.max <= 8 && diff.fraction < 0.0002, `Existing edge tolerance exceeded: ${JSON.stringify(diff)}`);
  assert(results[1].cache.reused && results[1].cache.allocations === 0 && results[1].cache.paths === 11,
    'Exactly eleven retained paths; no creation while position, frame, scale and tail change');
  assert(results[1].birdCommands < results[0].birdCommands && results[1].bodyCommands < results[0].bodyCommands,
    'Both methods must reduce path-building submissions');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
