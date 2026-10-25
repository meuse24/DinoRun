// Real MP3 playback plus deterministic media-clock/lifecycle and resource checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadPlaywright } from './helpers/playwright.mjs';

const root = path.resolve(import.meta.dirname, '..');
const artifact = path.resolve(process.argv[2] || path.join(root, 'dino.html'));
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/music-logo'),
  artifact.includes(path.sep + 'release' + path.sep) ? 'release' : 'source');
fs.mkdirSync(output, { recursive: true });
const requests = [];
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  requests.push(name);
  const file = name === 'dino.html' ? artifact : path.join(root, name);
  if (name !== 'dino.html' && !/^(dino-(boom-in-the-dunes|jump-jump)\.mp3|assets\/images\/icon-\d+\.png|service-worker\.js|manifest\.webmanifest)$/.test(name)) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'Content-Type': name.endsWith('.mp3') ? 'audio/mpeg' : name.endsWith('.js')
    ? 'text/javascript' : name.endsWith('.png') ? 'image/png' : name.endsWith('.webmanifest')
      ? 'application/manifest+json' : 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const pw = await loadPlaywright();
const engine = process.env.DINO_BROWSER || 'chromium';
const browser = await pw[engine].launch({ headless: true });
const errors = [], results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('dino-fullscreen-disabled', 'true');
    localStorage.setItem('dino-effects', 'on');
    window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null, transitions: false };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/dino.html`);
  await page.locator('#settings-open').click();
  // Windows WebKit cannot decode these MP3s; deterministic checks still exercise its DOM/CSS.
  if (engine === 'chromium') {
    for (const [track, time] of [['boom-in-the-dunes', 7], ['dino-jump-jump', 11]]) {
      await page.locator('#music-track').selectOption(track);
      await page.waitForFunction(() => !window.__dinoRunner.musicLogoPulse.waiting);
      await page.locator('#settings-close').click();
      await page.evaluate(time => { window.__dinoRunner.music.audio.currentTime = time; }, time);
      await page.waitForFunction(() => !window.__dinoRunner.music.audio.seeking);
      const scales = [];
      for (let i = 0; i < 24; i++) {
        await page.waitForTimeout(40);
        scales.push(await page.evaluate(() => {
          const r = window.__dinoRunner; r.draw(1); return r.musicLogoPulse.scale;
        }));
      }
      assert(new Set(scales).size > 3, 'Actual playing media must drive a varying logo');
      results.push({ actualMP3: true, track, scales });
      await page.locator('#settings-open').click();
    }
  }
  await page.evaluate(() => {
    const r = window.__dinoRunner;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    r.browser.focused = true;
    r.updatePause();
    r.music.audio.pause();
  });
  await page.waitForTimeout(100);
  const checks = await page.evaluate(() => {
    const r = window.__dinoRunner, pulse = r.musicLogoPulse, audio = r.music.audio;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    // Keep the real element; control just its media clock/status after verifying decoding.
    for (const [key, value] of Object.entries({ paused: false, muted: false, seeking: false,
      readyState: 4, currentTime: 0 })) Object.defineProperty(audio, key, { configurable: true, writable: true, value });
    r.music.wanted = true; r.music.unavailable = false;
    r.paused = false; pulse.waiting = false;
    const ranges = [];
    for (const track of ['boom-in-the-dunes', 'dino-jump-jump']) {
      r.music.track = track;
      let min = 2, max = 0, peakTime = 0;
      for (let i = 0; i < 900; i++) {
        audio.currentTime = i / 30; pulse.sync();
        min = Math.min(min, pulse.scale);
        if (pulse.scale > max) { max = pulse.scale; peakTime = audio.currentTime; }
      }
      check(min >= 1 && max === 1.8 && max - min >= 0.6, 'strong, bounded bass peaks');
      audio.currentTime = peakTime; pulse.sync();
      const peak = pulse.scale;
      audio.currentTime = 0; pulse.sync();
      audio.currentTime = peakTime; pulse.sync();
      check(pulse.scale === peak, 'seeking returns to the same song phase');
      // Sound-wave rings: one per bass onset, about one per beat; seeks never emit.
      const emit = pulse.ring, hits = [];
      pulse.ring = strength => { hits.push(strength); emit.call(pulse, strength); };
      audio.currentTime = 0; pulse.sync();
      for (let i = 1; i < 900; i++) { audio.currentTime = i / 30; pulse.sync(); }
      const rings = hits.length;
      check(rings >= 15 && rings <= 50, `${track}: ${rings} rings in 30 s follow the beat`);
      check(hits.every(strength => strength >= 0.6 && strength <= 1), 'ring strength is bounded');
      audio.currentTime = 0; pulse.sync(); audio.currentTime = peakTime; pulse.sync();
      check(hits.length === rings, 'seeks and loops only resynchronize');
      // Coarse frames (up to 8 samples apart) still find each beat once.
      hits.length = 0; audio.currentTime = 0; pulse.sync();
      for (let i = 4; i < 900; i += 4) { audio.currentTime = i / 30; pulse.sync(); }
      check(Math.abs(hits.length - rings) <= 2, 'frame rate does not change the ring count');
      pulse.ring = emit;
      const pool = pulse.logo.musicRings;
      check(pool.length === 3 && pulse.logo.querySelectorAll('.music-ring').length === 3, 'three pooled rings');
      ranges.push({ track, min, max, peakTime, rings });
    }
    const assertStops = (change, restore, name) => {
      pulse.ring(1);
      change(); pulse.sync(); check(!pulse.active && !pulse.logo.style.transform, name);
      check(pulse.logo.musicRings.every(ring => ring.getAnimations().length === 0), name + ' cancels rings');
      restore(); pulse.sync(); check(pulse.active, name + ' recovers');
    };
    assertStops(() => audio.paused = true, () => audio.paused = false, 'paused');
    assertStops(() => audio.muted = true, () => audio.muted = false, 'muted');
    assertStops(() => audio.seeking = true, () => audio.seeking = false, 'seeking');
    assertStops(() => audio.readyState = 1, () => audio.readyState = 4, 'buffering');
    assertStops(() => r.music.wanted = false, () => r.music.wanted = true, 'music zero/off');
    assertStops(() => r.paused = true, () => r.paused = false, 'menu overlay/lifecycle pause');
    assertStops(() => r.game.state = 'playing', () => r.game.state = 'attract', 'gameplay');
    assertStops(() => r.sessionView.panel.hidden = true, () => r.sessionView.panel.hidden = false, 'hidden logo');
    assertStops(() => r.effectsSetting.set(false, false), () => r.effectsSetting.set(true, false), 'effects off');
    for (const event of ['waiting', 'pause', 'emptied', 'ended', 'error']) {
      audio.dispatchEvent(new Event(event)); check(!pulse.active, event + ' resets immediately');
      r.music.wanted = true; r.music.unavailable = false;
      audio.paused = false; audio.dispatchEvent(new Event('playing')); pulse.sync();
      check(pulse.active, event + ' recovers on actual playing');
    }
    // Nothing changes in DOM if media time is unchanged. No animation timer belongs to this class.
    const observer = new MutationObserver(() => {});
    observer.observe(pulse.wrapper, { attributes: true, subtree: true });
    const start = performance.now();
    for (let i = 0; i < 1000; i++) pulse.sync();
    ranges.push({ unchangedSampleCalls: 1000, totalMs: performance.now() - start });
    check(observer.takeRecords().length === 0, 'unchanged samples do not mutate DOM');
    observer.disconnect();
    return ranges;
  });
  results.push(...checks);
  // Freeze each layout at the strongest actual song sample, after CSS interpolation.
  // Two rings frozen mid-flight make the waves visible in screenshots.
  const freezeRings = () => page.evaluate(() => {
    const pulse = window.__dinoRunner.musicLogoPulse;
    pulse.ring(0.7); pulse.ring(1);
    pulse.logo.musicRings.forEach((ring, i) => {
      const animation = ring.animation;
      if (!animation) return;
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration * (i === pulse.logo.musicRingNext ? 0 : 0.18 + 0.3 * i);
    });
  });
  const peak = async () => {
    await page.evaluate(time => {
      const r = window.__dinoRunner;
      r.music.audio.currentTime = time; r.resize(); r.draw(1);
    }, checks.find(item => item.track === 'dino-jump-jump').peakTime);
    await freezeRings();
    await page.waitForTimeout(90);
    const logo = await page.locator('#round-panel .brand-logo').boundingBox();
    const title = await page.locator('.title-word').first().boundingBox();
    const viewport = page.viewportSize();
    assert(logo && title && logo.x >= 0 && logo.y >= 0 && logo.x + logo.width <= title.x,
      'Peak logo must fit without covering the title');
    assert(logo.y + logo.height <= viewport.height);
  };
  await peak();
  await page.screenshot({ path: path.join(output, 'desktop-pulse.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !window.__dinoRunner.musicLogoPulse.active);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [width, height] of [[320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await peak();
    const bounds = await page.locator('#round-panel .brand-logo').boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0);
    await page.screenshot({ path: path.join(output, `pulse-${width}x${height}.png`) });
  }
  // All foreground menus share the same clock, including Help's separate document.
  for (const [width, height] of [[1280, 800], [320, 568], [663, 234]]) {
    await page.setViewportSize({ width, height });
    for (const view of ['settings', 'help', 'scores', 'entry']) {
      if (view === 'settings') await page.locator('#settings-open').click();
      else if (view === 'help') await page.locator('#info-link').click();
      else await page.evaluate(entry => {
        const r = window.__dinoRunner;
        r.highscores.open();
        if (entry) { r.highscores.view = 'entry'; r.highscores.apply(); }
      }, view === 'entry');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.music.wanted = true; r.musicLogoPulse.waiting = false;
        r.music.audio.paused = false; r.musicLogoPulse.sync();
      });
      await freezeRings();
      await page.waitForTimeout(90);
      const selector = view === 'help' ? '#help-dialog' : view === 'settings' ? '#settings' : '#scores';
      const scope = view === 'help' ? page.frameLocator('#info-view') : page.locator(selector);
      const logo = await scope.locator('.music-heading-logo .brand-logo').boundingBox();
      const title = await scope.locator('.menu-title > .heading-ink').boundingBox();
      const close = await scope.locator('.menu-back').boundingBox();
      assert(logo && title && close && logo.x >= 0 && logo.y >= 0 &&
        logo.x + logo.width <= title.x && title.x + title.width <= close.x,
      `${view}/${width}: peak fits beside the title and Back`);
      const state = await page.evaluate(() => {
        const r = window.__dinoRunner, pulse = r.musicLogoPulse;
        const before = r.game.simulationTime;
        window.advanceTime(500);
        return { paused: r.paused, active: pulse.active, scale: pulse.scale,
          menuScaled: !!pulse.menu.logo.style.transform,
          frozen: before === r.game.simulationTime,
          owner: pulse.logo.ownerDocument === document ? pulse.wrapper.closest('dialog').id : 'help' };
      });
      assert(state.paused && state.active && state.frozen && !state.menuScaled);
      assert.equal(state.owner, view === 'entry' ? 'scores' : view);
      assert.equal(state.scale, 1.8);
      results.push({ view, width, height, ...state });
      await page.screenshot({ path: path.join(output, `${view}-${width}x${height}.png`) });
      if (view === 'help') await page.frameLocator('#info-view').locator('[data-help-back]').first().click();
      else await page.locator(view === 'settings' ? '#settings-close' : '#scores-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
    }
  }
  // Actual foreground timer: runs without advancing/drawing the paused game, then stops.
  await page.locator('#settings-open').click();
  const timed = await page.evaluate(async () => {
    const r = window.__dinoRunner, pulse = r.musicLogoPulse;
    window.__dinoTest.manualFrames = false;
    const time = r.game.simulationTime;
    r.music.wanted = true; pulse.waiting = false; r.music.audio.paused = false;
    r.music.audio.currentTime = 0; pulse.sync();
    const before = pulse.scale;
    r.music.audio.currentTime = 11.633333333333333;
    await new Promise(resolve => setTimeout(resolve, 100));
    const changed = pulse.scale !== before, frozen = r.game.simulationTime === time;
    r.music.audio.muted = true; pulse.sync();
    const stopped = pulse.timer === null && !pulse.active;
    window.__dinoTest.manualFrames = true;
    r.music.audio.muted = false;
    return { changed, frozen, stopped };
  });
  assert(timed.changed && timed.frozen && timed.stopped);
  results.push({ overlayTimer: timed });
  assert.deepEqual(errors, []);
  assert(!requests.some(name => /highscores/.test(name)));
  fs.writeFileSync(path.join(output, `${engine}-report.json`), JSON.stringify({ engine, results, errors,
    physicalDevice: false, actualMP3: engine === 'chromium' }, null, 2));
  console.log(`${engine}: song phase, bounds, lifecycle, reduced motion, effects, unchanged DOM and three layouts passed`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
