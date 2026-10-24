import { loadPlaywright } from './helpers/playwright.mjs';
// Usage: DINO_PLAYWRIGHT=<ESM entry> node tests/snow-caps.mjs <pre-fix HTML>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await loadPlaywright();
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output'), 'snow-caps');
fs.mkdirSync(output, { recursive: true });
const sources = [fs.readFileSync(process.argv[2], 'utf8'), fs.readFileSync(path.join(root, 'dino.html'), 'utf8')];
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const config of [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true },
    { name: 'landscape-night', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, colorScheme: 'dark' },
  ]) {
    const { name, ...options } = config;
    const baseline = [];
    for (let version = 0; version < sources.length; version++) {
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.route('**/dino.html', route => route.fulfill({ contentType: 'text/html', body: sources[version] }));
      await page.addInitScript(() => {
        window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null };
        window.requestAnimationFrame = () => 0;
      });
      await page.goto('http://127.0.0.1:8765/dino.html');
      await page.waitForFunction(() => !!window.__dinoRunner);
      for (const night of [0, 0.5, 1]) {
        for (const offset of [0, 17.5, 127.999, 128.001, 24123.567 * 0.028, 1e8 * 0.028]) {
          const pixels = await page.evaluate(({ offset, night }) => {
            const r = window.__dinoRunner.renderer, ctx = r.ctx, c = ctx.canvas;
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore();
            // Observe retained snow paths instead of rewriting production source text.
            const fill = ctx.fill;
            ctx.fill = function (path, ...args) {
              if (r.mountainLayers.some(layer => layer?.faces.some(face => face.snow === path))) return;
              return fill.call(this, path, ...args);
            };
            try {
              r.drawMountainLayer(null, offset, 187, 64, 139, '#788593', night * 0.62, 17, true, 128, 0.3, '#121b3e');
            } finally { ctx.fill = fill; }
            return c.toDataURL();
          }, { offset, night });
          const index = report.filter(item => item.name === name).length;
          if (!version) baseline.push(pixels);
          else {
            assert.deepEqual(pixels, baseline[index], `${name}: non-snow pixels changed at ${offset}/${night}`);
            report.push({ name, offset, night, nonSnowPixelsIdentical: true });
          }
        }
      }
      if (version) {
        const geometryChecks = await page.evaluate(() => {
          const r = window.__dinoRunner.renderer, NativePath = window.Path2D;
          window.Path2D = class extends NativePath {
            constructor() { super(); this.points = []; }
            moveTo(x, y) { super.moveTo(x, y); this.points.push([x, y]); }
            lineTo(x, y) { super.lineTo(x, y); this.points.push([x, y]); }
          };
          let checked = 0;
          const fail = message => { throw new Error(message); };
          try {
            for (const tile of [0, 1, 2, 17, 188, 1000000]) {
              const geometry = r.mountainGeometry(tile, 187, 64, 139, 17, true, 128);
              for (const face of geometry.faces) {
                const [start, left, ls, summit] = face.dark.points;
                const [, rs, right, end] = face.light.points;
                const contour = [summit, ls, left, start, [start[0], 190], [end[0], 190], end, right, rs];
                const inside = ([x, y]) => {
                  let hit = false;
                  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
                    const a = contour[i], b = contour[j];
                    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
                  }
                  return hit;
                };
                const snow = face.snow.points;
                if (JSON.stringify(snow[0]) !== JSON.stringify(summit) || JSON.stringify(snow.at(-1)) !== JSON.stringify(summit)) fail('Snow summit detached');
                // Every segment must remain inside the mountain or exactly on its flank.
                for (let i = 1; i < snow.length; i++) {
                  for (const t of [0.1, 0.5, 0.9]) {
                    const p = snow[i - 1].map((v, axis) => v + (snow[i][axis] - v) * t);
                    const inward = [p[0] + (summit[0] - p[0]) * 1e-7, p[1] + 1e-7];
                    if (!inside(inward)) fail('Snow extends outside its mountain');
                  }
                }
                checked++;
              }
            }
          } finally { window.Path2D = NativePath; }
          return checked;
        });
        assert(geometryChecks > 30);
        report.push({ name, geometryChecks });
      }
      await page.evaluate(() => {
        window.__hideSnow = false;
        const r = window.__dinoRunner, g = r.game;
        g.state = 'playing'; g.nightAlpha = 0; g.sceneryDistance = 0;
        g.horizon.clouds.length = 0; g.horizon.obstacles.length = 0;
        g.capturePrevious(); r.draw(1);
        document.getElementById('start-view').hidden = true;
      });
      const screenshot = await page.evaluate(() => document.getElementById('canvas').toDataURL());
      fs.writeFileSync(path.join(output, `${name}-${version ? 'after' : 'before'}.png`), Buffer.from(screenshot.split(',')[1], 'base64'));
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Passed ${report.filter(item => item.nonSnowPixelsIdentical).length} non-snow image comparisons and ${report.reduce((sum, item) => sum + (item.geometryChecks || 0), 0)} mountain contour checks.`);
} finally { await browser.close(); }
