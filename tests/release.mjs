import { loadPlaywright } from './helpers/playwright.mjs';
// Compare the actual delivery HTML with the readable source, including DOM UI.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/release'), `comparison-${engine}`);
fs.mkdirSync(output, { recursive: true });
const original = fs.readFileSync(path.join(root, 'dino.html'), 'utf8');
const compact = fs.readFileSync(path.join(root, 'release/dino.html'), 'utf8');
const report = JSON.parse(fs.readFileSync(path.join(root, 'release/size-report.json'), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
assert.equal(report.source.sha256, hash(original), 'Rebuild after editing the source');
assert.equal(report.release.sha256, hash(compact));
assert.equal(report.savedBytes, Buffer.byteLength(original) - Buffer.byteLength(compact));
execFileSync(process.execPath, ['scripts/build-release.mjs'], { cwd: root });
assert.equal(fs.readFileSync(path.join(root, 'release/dino.html'), 'utf8'), compact,
  'The delivery must be reproducible');

const pw = await loadPlaywright();
const results = [];
for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 720 }],
  ['portrait', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }],
  ['compact-landscape', { width: 663, height: 234 }],
]) {
  if (process.env.DINO_RELEASE_LAYOUTS && !process.env.DINO_RELEASE_LAYOUTS.split(',').includes(name)) continue;
  // A fresh process bounds retained graphics resources between layouts.
  const browser = await pw[engine].launch({ headless: true });
  const before = new Map();
  try {
    for (const [version, html] of [['source', original], ['release', compact]]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block',
        ...(name === 'desktop' ? {} : { hasTouch: true, isMobile: true, deviceScaleFactor: 3 }) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await context.route(/^https?:/, route => route.request().url() === 'http://dino-release.test/dino.html'
        ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
      await page.addInitScript(() => {
        let seed = 937;
        const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        Math.random = random;
        const audio = new EventTarget();
        audio.play = () => Promise.resolve(); audio.pause = () => {};
        window.__dinoTest = { credits: 99, manualFrames: true, random, now: () => 1000,
          highscoreApiUrl: null, musicAudio: audio };
        localStorage.setItem('dino-fullscreen-disabled', 'true');
      });
      // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
      await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
      await page.goto('http://dino-release.test/dino.html');
      await page.waitForFunction(() => !!window.__dinoRunner);
      // Freeze CSS motion as well as the manual game clock. WebKit's screenshot
      // animation suppression alone does not consistently stop an infinite title
      // animation at the same phase across source/release navigations.
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      await page.waitForFunction(() => !!document.getElementById('info-view').contentDocument?.body);
      await page.frameLocator('#info-view').locator('body').evaluate(body => {
        const style = body.ownerDocument.createElement('style');
        style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
        body.append(style);
      });
      const advance = frames => page.evaluate(frames => {
        for (let i = 0; i < frames; i++) {
          window.__dinoGame.horizon.obstacles.length = 0;
          window.advanceTime(1000 / 60);
        }
      }, frames);
      const snapshot = async scene => {
        // Mobile WebKit can retain a native select's hover paint across contexts.
        // Normalize the pointer before comparing otherwise identical controls.
        await page.mouse.move(0, 0);
        const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
        const select = scene === 'settings' ? await page.locator('#mode-select').evaluate(element => ({
          rect: element.getBoundingClientRect().toJSON(), html: element.outerHTML,
          hover: element.matches(':hover'), focus: element.matches(':focus'),
          active: document.activeElement?.id,
          style: Object.fromEntries([...getComputedStyle(element)].map(key => [key, getComputedStyle(element).getPropertyValue(key)])),
        })) : null;
        const image = await page.screenshot({ animations: 'disabled',
          path: path.join(output, `${name}-${scene}-${version}.png`) });
        if (version === 'source') { before.set(scene, { state, image, select }); return; }
        assert.deepEqual(state, before.get(scene).state, `${name}/${scene}: game state changed`);
        const difference = await page.evaluate(async ({ a, b }) => {
          const images = [new Image(), new Image()];
          images[0].src = a; images[1].src = b;
          await Promise.all(images.map(image => image.decode()));
          if (images[0].width !== images[1].width || images[0].height !== images[1].height)
            throw Error('Screenshot dimensions changed');
          const canvas = document.createElement('canvas');
          canvas.width = images[0].width; canvas.height = images[0].height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(images[0], 0, 0);
          const old = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(images[1], 0, 0);
          const next = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let changed = 0, max = 0;
          for (let i = 0; i < old.length; i += 4) {
            let delta = 0;
            for (let k = 0; k < 4; k++) delta = Math.max(delta, Math.abs(old[i + k] - next[i + k]));
            if (delta) changed++;
            max = Math.max(max, delta);
          }
          canvas.width = canvas.height = 0;
          return { changed, max };
        }, { a: 'data:image/png;base64,' + before.get(scene).image.toString('base64'),
          b: 'data:image/png;base64,' + image.toString('base64') });
        results.push({ name, scene, ...difference });
        if (difference.changed && scene === 'settings') fs.writeFileSync(path.join(output, `${name}-select-diagnostic.json`),
          JSON.stringify({ source: before.get(scene).select, release: select }, null, 2));
        assert.equal(difference.changed, 0, `${name}/${scene}: ${JSON.stringify(difference)}`);
      };
      await snapshot('start');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.attract.select(1);
        for (let i = 0; i < 90; i++) r.update(1000 / 60);
        r.draw(1);
      });
      await snapshot('attract-demo');
      await page.evaluate(() => {
        const r = window.__dinoRunner; r.attract.select(2); r.draw(1);
      });
      await snapshot('attract-powerups');
      await page.evaluate(() => {
        const r = window.__dinoRunner; r.attract.select(0); r.draw(1);
      });
      await page.locator('#settings-open').click();
      await snapshot('settings');
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await page.locator('#info-link').click();
      await snapshot('help');
      await page.frameLocator('#info-view').locator('[data-help-back]').first().click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await page.locator('#start-game').click();
      await advance(160);
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.feather.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
      });
      await advance(1);
      await page.locator('#game').focus(); await page.keyboard.press('Space'); await advance(10);
      await snapshot('playing');
      // Pass the opening clear/countdown time before testing collectibles.
      await advance(60);
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.shield.pickup = { x: 240, y: 157 };
        g.capturePrevious(); window.__dinoRunner.draw(1);
      });
      await snapshot('shield-pickup');
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.shield.pickup = { x: g.trex.x + 25, y: g.trex.y + 24 };
      });
      await advance(1);
      assert.equal(await page.evaluate(() => window.__dinoGame.shield.charged), true);
      await snapshot('shield-protected');
      await advance(60);
      await page.evaluate(() => { window.__dinoGame.duck(true); window.__dinoRunner.draw(1); });
      await snapshot('shield-duck');
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.duck(false); g.shield.consume(); window.__dinoRunner.draw(1);
      });
      await snapshot('shield-pop');
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.turbo.stop(g.trex); g.feather.reset(); g.shield.reset();
        g.turbo.spawnTimer = g.feather.spawnTimer = g.shield.spawnTimer = 1e9;
        g.horizon.obstacles.length = 0;
        g.trex.y = g.trex.groundY; g.trex.jumping = false; g.trex.velocity = 0;
        g.boss.remaining = 0;
      });
      await advance(1);
      assert.equal(await page.evaluate(() => window.__dinoGame.boss.phase), 'warning');
      await snapshot('boss-warning');
      await advance(108);
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.boss.rock.x = g.world.width * 0.57;
        g.capturePrevious(); window.__dinoRunner.draw(1);
      });
      await snapshot('boss-approach');
      await page.evaluate(() => {
        const g = window.__dinoGame;
        g.shield.charged = true; g.boss.rock.x = g.trex.x - 18;
      });
      await advance(1);
      assert.equal(await page.evaluate(() => window.__dinoGame.boss.completed), 1);
      await snapshot('boss-clear');
      await page.evaluate(() => {
        const g = window.__dinoGame; g.score = 12; g.gameTime = 4000; g.gameOver();
        window.__dinoRunner.draw(1);
      });
      assert.equal(await page.locator('#game-over-overlay').isVisible(), true);
      await snapshot('game-over-overlay');
      await advance(160);
      await page.waitForFunction(() => document.getElementById('scores').open);
      await snapshot('automatic-name');
      await page.locator('#entry-cancel').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await page.evaluate(() => window.__dinoRunner.draw(1));
      assert.equal(await page.evaluate(() => window.__dinoGame.state), 'attract');
      await snapshot('returned-attract');
      assert.deepEqual(errors, [], `${name}/${version}: browser errors`);
      await context.close();
    }
  } finally { await browser.close(); }
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ engine, results }, null, 2) + '\n');
console.log(`${engine}: ${results.length} source/release UI and gameplay scenes are pixel-identical`);
