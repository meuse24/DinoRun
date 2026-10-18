// Screen transitions (TRANSITIONS.md): hit-testing during document View Transitions,
// the full/basic/fallback call forms, deferred commits, close paths, Help navigation,
// safety net, external skips and unchanged simulation.
// Usage: node tests/screen-transitions.mjs [game.html]; DINO_BROWSER=chromium|webkit.
// The live highscore API is never contacted (`highscoreApiUrl: null`, network blocked).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/transitions'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-transitions-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const checks = [];
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log('ok - ' + name);
};

// Opens the game; level 'basic' removes the options form, 'none' the whole API.
async function openGame(browser, { level = 'full', transitions, manualFrames = true,
  viewport = { width: 1280, height: 720 }, touch = false } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block',
    ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  await context.route(/^https?:/, route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(({ level, transitions, manualFrames }) => {
    if (level !== 'full') delete ViewTransition.prototype.types;
    if (level === 'none') {
      delete Document.prototype.startViewTransition;
      delete Element.prototype.startViewTransition;
    }
    const musicAudio = new EventTarget();
    musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
    window.__dinoTest = { manualFrames, highscoreApiUrl: null, musicAudio,
      ...(transitions === undefined ? {} : { transitions }) };
    try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
  }, { level, transitions, manualFrames });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => !!window.__dinoRunner);
  await page.evaluate(() => {
    const r = window.__dinoRunner;
    window.__snap = () => {
      const active = document.activeElement;
      return {
        state: r.game.state, open: r.highscores.dialog.open, isOpen: r.highscores.isOpen,
        paused: r.paused, overlay: !document.getElementById('game-over-overlay').hidden,
        entry: !r.highscores.entryView.hidden, pending: r.transition.pending,
        current: r.transition.current?.type ?? null, vt: document.documentElement.dataset.vt ?? null,
        page: !document.getElementById('page').hidden,
        info: !document.getElementById('info-view').hidden,
        active: active?.id || active?.closest?.('#name-picker') && 'name-picker' || active?.tagName,
      };
    };
    // Starts a scoring round and steps until its death scene ends (in this same task).
    window.__crashAndFinish = async (score) => {
      const g = r.game;
      g.start(0); g.score = score; g.gameTime = 4000; g.gameOver();
      for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
      const sync = window.__snap();
      await null;
      return { sync, started: window.__snap() };
    };
  });
  return { context, page, errors };
}
const done = page => page.evaluate(() => window.__dinoTest.transitionDone());
const snap = page => page.evaluate(() => window.__snap());
const viewTransitionAnimations = page => page.evaluate(() => document.getAnimations()
  .filter(a => String(a.effect?.pseudoElement || '').startsWith('::view-transition')).length);

let browser;
const report = { engine, levels: {} };
try {
  browser = await pw[engine].launch({ headless: true });
  report.browser = browser.version();

  // 3.1: a document-wide transition captures every pointer on the root element.
  await check('hit testing during a document View Transition reaches only the root', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 400 } });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><style>
      ::view-transition { pointer-events: none; }
      ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 3s; }
      button, div { position: absolute; top: 100px; width: 160px; height: 80px; }
      #named { left: 40px; view-transition-name: named; } #plain { left: 300px; } #area { left: 560px; background: #ccc; }
      </style><button id="named">named</button><button id="plain">plain</button><div id="area"></div>
      <script>window.hits = []; document.addEventListener('pointerdown', e => hits.push(e.target.id || e.target.tagName), true);</script>`);
    const clickAll = async () => {
      for (const x of [120, 380, 640]) await page.mouse.click(x, 140);
      return page.evaluate(() => window.hits.splice(0));
    };
    await page.evaluate(() => {
      window.vt = document.startViewTransition(() => document.body.dataset.step = '1');
      return window.vt.ready;
    });
    const during = await clickAll();
    await page.evaluate(() => { window.vt.skipTransition(); return window.vt.finished; });
    const after = await clickAll();
    report.hitTesting = { during, after };
    assert.deepEqual(during, ['HTML', 'HTML', 'HTML']);
    assert.deepEqual(after, ['named', 'plain', 'area']);
    await context.close();
  });

  for (const level of ['full', 'basic', 'none', 'off']) {
    const options = level === 'off' ? { level: 'full', transitions: false } : { level };
    const { context, page, errors } = await openGame(browser, options);
    const deferred = level === 'full' || level === 'basic';
    const result = report.levels[level] = {};
    await check(`${level}: detection and enabled state`, async () => {
      const info = await page.evaluate(() => ({ level: window.__dinoRunner.transition.level,
        enabled: window.__dinoRunner.transition.enabled,
        motion: document.documentElement.classList.contains('motion') }));
      result.detected = info;
      assert.equal(info.level, level === 'off' ? 'full' : level);
      assert.equal(info.enabled, deferred);
      assert.equal(info.motion, level !== 'off');
    });

    await check(`${level}: T7a name entry opens ${deferred ? 'after the transition callback' : 'at once'}`, async () => {
      const { sync, started } = await page.evaluate(() => window.__crashAndFinish(12));
      result.entry = { sync, started };
      assert.equal(sync.state, 'crashed');
      assert.equal(sync.isOpen, true);
      assert.equal(sync.paused, true, 'The intent pauses at once');
      if (deferred) {
        assert.equal(sync.open, false, 'The dialog waits for the transition callback');
        assert.equal(sync.overlay, true, 'The old snapshot still shows Game over');
        assert.equal(sync.pending, true);
        assert.equal(started.current, 'entry');
        assert.equal(started.vt, level === 'basic' ? 'entry' : null);
      } else {
        assert.equal(sync.open, true);
        assert.equal(sync.overlay, false);
        assert.equal(sync.active, 'name-picker');
      }
      await done(page);
      const after = await snap(page);
      assert.equal(after.open, true);
      assert.equal(after.entry, true);
      assert.equal(after.overlay, false);
      assert.equal(after.active, 'name-picker', 'Focus moves only once the picker is visible');
      assert.equal(after.current, null);
      assert.equal(after.vt, null);
      assert.equal(await viewTransitionAnimations(page), 0);
      await page.screenshot({ path: path.join(output, `${level}-entry.png`) });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__dinoGame.state === 'attract' && !window.__dinoRunner.paused);
      const back = await snap(page);
      assert.equal(back.open, false);
      assert.equal(back.isOpen, false);
      assert.equal(back.active, 'start-game');
    });

    await check(`${level}: Escape and Back before commit never open the dialog`, async () => {
      for (const [score, close] of [[13, 'cancel'], [14, 'back']]) {
        const states = await page.evaluate(async ({ score, close }) => {
          const r = window.__dinoRunner, h = r.highscores;
          const g = r.game;
          g.start(0); g.score = score; g.gameTime = 4000; g.gameOver();
          for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
          const before = window.__snap();
          if (close === 'cancel') h.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
          else document.getElementById('entry-cancel').click();
          await window.__dinoTest.transitionDone();
          for (let i = 0; i < 10; i++) window.advanceTime(1000 / 60);
          return { before, after: window.__snap() };
        }, { score, close });
        assert.equal(states.before.isOpen, true);
        assert.equal(states.after.open, false, close + ' keeps the dialog closed');
        assert.equal(states.after.isOpen, false);
        assert.equal(states.after.state, 'attract');
        assert.equal(states.after.paused, false);
        assert.equal(states.after.overlay, false);
        assert.equal(states.after.active, 'start-game');
      }
    });

    await check(`${level}: stale close events are ignored`, async () => {
      const states = await page.evaluate(async () => {
        const r = window.__dinoRunner, h = r.highscores, g = r.game;
        g.start(0); g.score = 15; g.gameTime = 4000; g.gameOver();
        for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
        // A queued close event of an earlier instance arrives while the opening is pending.
        h.dialog.dispatchEvent(new Event('close'));
        const pending = window.__snap();
        await window.__dinoTest.transitionDone();
        // The close event of a dialog reopened by raiseModalDialogs() arrives while open.
        h.dialog.dispatchEvent(new Event('close'));
        const open = window.__snap();
        h.close();
        await window.__dinoTest.transitionDone();
        return { pending, open, closed: window.__snap() };
      });
      assert.equal(states.pending.isOpen, true);
      assert.equal(states.open.open, true);
      assert.equal(states.open.isOpen, true);
      assert.equal(states.open.state, 'crashed');
      assert.equal(states.closed.state, 'attract');
      assert.equal(states.closed.paused, false);
    });

    await check(`${level}: T9 list and entry views switch inside the open dialog`, async () => {
      const states = await page.evaluate(async () => {
        const r = window.__dinoRunner, h = r.highscores;
        h.open();
        await window.__dinoTest.transitionDone();
        const list = window.__snap();
        h.view = 'entry';
        h.showModal();
        const entryRequested = window.__snap();
        await window.__dinoTest.transitionDone();
        const entry = window.__snap();
        h.showList();
        await window.__dinoTest.transitionDone();
        const back = window.__snap();
        const closed = new Promise(resolve => h.dialog.addEventListener('close', resolve, { once: true }));
        h.close();
        await closed;
        return { list, entryRequested, entry, back, closed: window.__snap() };
      });
      assert.equal(states.list.open, true);
      assert.equal(states.list.entry, false);
      assert.equal(states.list.active, 'scores-close');
      assert.equal(states.entryRequested.entry, !deferred, 'The view switch waits for the callback');
      assert.equal(states.entry.entry, true);
      assert.equal(states.back.entry, false, JSON.stringify(states));
      assert.equal(states.closed.open, false);
      assert.equal(states.closed.paused, false);
    });

    await check(`${level}: T11 Help navigation applies after the transition`, async () => {
      const forward = await page.evaluate(() => {
        document.getElementById('info-link').click();
        return window.__snap();
      });
      assert.equal(await page.evaluate(() => location.hash), '#info');
      assert.equal(forward.paused, true, 'The guide pauses at once');
      assert.equal(forward.page, deferred, 'The page stays in the old snapshot until commit');
      await done(page);
      const help = await snap(page);
      assert.equal(help.page, false);
      assert.equal(help.info, true);
      assert.equal(await page.title(), 'Help · m24 Dino Run');
      await page.frameLocator('#info-view').locator('[data-help-back]').first().click();
      await page.waitForFunction(() => location.hash !== '#info');
      await done(page);
      const returned = await snap(page);
      assert.equal(returned.page, true);
      assert.equal(returned.info, false);
      assert.equal(returned.paused, false);
      assert.equal(returned.active, 'info-link');
      assert.equal(await page.title(), 'Dino Run');
    });

    if (deferred) {
      await check(`${level}: requests in one task coalesce to the highest priority`, async () => {
        const types = await page.evaluate(async () => {
          const t = window.__dinoRunner.transition;
          t.request('help-back');
          t.request('entry');
          t.request('back');
          await null;
          const started = t.current?.type;
          await window.__dinoTest.transitionDone();
          return { started, current: t.current, vt: document.documentElement.dataset.vt ?? null };
        });
        assert.deepEqual(types, { started: 'entry', current: null, vt: null });
      });

      await check(`${level}: a different type while pending ends without animation`, async () => {
        const result = await page.evaluate(async () => {
          const t = window.__dinoRunner.transition;
          t.request('forward');
          await null;
          const first = t.current;
          let skipped = false;
          first.vt.ready.catch(() => { skipped = true; });
          t.request('back');
          await first.vt.finished;
          await window.__dinoTest.transitionDone();
          return { skipped, committed: first.committed, current: t.current,
            vt: document.documentElement.dataset.vt ?? null };
        });
        assert.deepEqual(result, { skipped: true, committed: true, current: null, vt: null });
      });

      await check(`${level}: a newer transition owns cleanup`, async () => {
        const result = await page.evaluate(async () => {
          const t = window.__dinoRunner.transition;
          t.request('help-forward');
          await null;
          const first = t.current;
          await first.vt.updateCallbackDone;
          t.request('help-back');
          await null;
          const second = t.current;
          const vtDuringSecond = document.documentElement.dataset.vt ?? null;
          await first.vt.finished;
          const afterFirst = { current: t.current === second, vt: document.documentElement.dataset.vt ?? null };
          await window.__dinoTest.transitionDone();
          return { distinct: first !== second, vtDuringSecond, afterFirst,
            end: { current: t.current, vt: document.documentElement.dataset.vt ?? null } };
        });
        assert.equal(result.distinct, true);
        assert.equal(result.vtDuringSecond, level === 'basic' ? 'help-back' : null);
        assert.deepEqual(result.end, { current: null, vt: null });
      });

      // A held transition makes the safety net and external skips observable.
      const hold = () => page.evaluate(() => {
        let style = document.getElementById('test-hold');
        if (!style) {
          style = document.createElement('style');
          style.id = 'test-hold';
          style.textContent = '::view-transition-old(root),::view-transition-new(root){animation:test-hold 5s linear both}' +
            '@keyframes test-hold{to{opacity:1}}';
          document.head.append(style);
        }
        const t = window.__dinoRunner.transition;
        t.request('help-back');
        return new Promise(resolve => queueMicrotask(() => t.current.vt.ready.then(() => resolve(true), () => resolve(false))));
      });
      const release = () => page.evaluate(() => document.getElementById('test-hold').remove());

      await check(`${level}: a tap on the captured root ends the transition`, async () => {
        assert.equal(await hold(page), true);
        const box = await page.locator('#start-game').boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForFunction(() => window.__dinoRunner.transition.current === null);
        assert.equal((await snap(page)).state, 'attract', 'The tap during the transition is lost');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        assert.equal((await snap(page)).state, 'playing', 'The next tap reaches START at once');
        await page.evaluate(() => {
          const r = window.__dinoRunner;
          r.game.gameOver();
          for (let i = 0; r.game.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
          if (r.highscores.isOpen) r.highscores.close();
          return window.__dinoTest.transitionDone();
        });
        assert.equal((await snap(page)).state, 'attract');
      });

      await check(`${level}: external events skip a running transition`, async () => {
        for (const event of ['resize', 'blur', 'orientationchange']) {
          assert.equal(await hold(page), true);
          await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
          await page.waitForFunction(() => window.__dinoRunner.transition.current === null);
        }
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await release();
      });
    }

    await check(`${level}: mechanism A helpers end exits and keep leaving elements inert`, async () => {
      const result = await page.evaluate(async () => {
        const motion = window.__dinoRunner.motion;
        const el = document.createElement('div');
        document.body.append(el);
        let completed = 0;
        motion.leave(el, 'test', () => completed++);
        const immediate = { completed, leaving: el.dataset.leaving ?? null, inert: el.inert };
        el.style.animation = 'motion-test 300ms linear';
        const style = document.createElement('style');
        style.textContent = '@keyframes motion-test{to{opacity:0}}';
        document.head.append(style);
        motion.leave(el, 'test', () => completed++);
        const during = { completed, leaving: el.dataset.leaving ?? null, inert: el.inert,
          idle: motion.idle };
        motion.cancelLeave(el);
        const cancelled = { completed, leaving: el.dataset.leaving ?? null, inert: el.inert };
        el.style.animation = 'motion-test 300ms linear';
        motion.leave(el, 'test', () => completed++);
        await window.__dinoTest.transitionDone();
        const finished = { completed, leaving: el.dataset.leaving ?? null, inert: el.inert,
          idle: motion.idle };
        el.remove(); style.remove();
        return { immediate, during, cancelled, finished };
      });
      assert.deepEqual(result.immediate, { completed: 1, leaving: null, inert: false });
      if (level === 'off') {
        assert.deepEqual(result.during, { completed: 2, leaving: null, inert: false, idle: true });
        return;
      }
      assert.deepEqual(result.during, { completed: 1, leaving: 'test', inert: true, idle: false });
      assert.deepEqual(result.cancelled, { completed: 1, leaving: null, inert: false });
      assert.deepEqual(result.finished, { completed: 2, leaving: null, inert: false, idle: true });
    });

    assert.deepEqual(errors, [], level + ' page errors');
    await context.close();
  }

  await check('Help return restarts the real frame loop after a deferred commit', async () => {
    const { context, page, errors } = await openGame(browser, { manualFrames: false });
    await page.locator('#info-link').click();
    await page.waitForFunction(() => location.hash === '#info');
    await done(page);
    await page.frameLocator('#info-view').locator('[data-help-back]').first().click();
    await page.waitForFunction(() => location.hash !== '#info' && !window.__dinoRunner.paused);
    await done(page);
    const before = await page.evaluate(() => window.__dinoRunner.attract.elapsed);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__dinoRunner.attract.elapsed);
    assert(after > before + 100, `Attract clock advances after Help (${before} -> ${after})`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  await check('simulation and events are identical with and without transitions', async () => {
    const traces = [];
    for (const transitions of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
      await context.route(/^https?:/, route => route.abort());
      const page = await context.newPage();
      await page.addInitScript(transitions => {
        let seed = 4242, time = 1000;
        window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, transitions,
          now: () => time, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) };
        window.__advanceClock = ms => { time += ms; };
        try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
      }, transitions);
      await page.goto(pathToFileURL(file).href);
      await page.waitForFunction(() => !!window.__dinoRunner);
      traces.push(await page.evaluate(async () => {
        const r = window.__dinoRunner, g = r.game, events = [];
        g.on(e => { if (e.type !== 'step') events.push(e.type + (e.score === undefined ? '' : ':' + e.score)); });
        r.start();
        for (let frame = 0; frame < 2400; frame++) {
          if (frame % 50 === 10) r.jump();
          if (frame % 50 === 20) r.endJump();
          window.__advanceClock(1000 / 60);
          window.advanceTime(1000 / 60);
          if (g.crashed && !g.inDeathScene && r.highscores.isOpen) {
            await window.__dinoTest.transitionDone();
            r.highscores.close();
          }
        }
        return { events, score: g.score, state: g.state, distance: g.distance };
      }));
      await context.close();
    }
    report.simulation = traces[0];
    assert.deepEqual(traces[0], traces[1]);
  });
} finally {
  await browser?.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
fs.writeFileSync(path.join(output, 'screen-transitions.json'), JSON.stringify({ ...report, checks }, null, 2));
console.log(`${engine}: ${checks.length} screen transition checks passed`);
