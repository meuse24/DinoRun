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
      // Window focus returns from the guide iframe asynchronously (WebKit).
      await page.waitForFunction(() => location.hash !== '#info' && !window.__dinoRunner.paused);
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

  // Mechanism A in the core loop (T4, T5, T5b, T6) with trusted mouse and touch input.
  for (const layout of ['desktop', 'touch']) {
    const touch = layout === 'touch';
    const { context, page, errors } = await openGame(browser, { touch,
      viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 } });
    await page.evaluate(() => {
      window.__motion = (selector) => [...document.querySelectorAll(selector)]
        .flatMap(el => el.getAnimations({ subtree: true }))
        .filter(a => String(a.animationName || '').startsWith('motion-'))
        .map(a => ({ name: a.animationName, target: a.effect.target.id || a.effect.target.tagName,
          delay: a.effect.getTiming().delay, end: a.effect.getComputedTiming().endTime, state: a.playState }));
      // Holds every motion animation at a fraction of its timing, or releases it.
      window.__holdMotion = (fraction) => {
        // A held exit must not end through its safety timeout; play() ends it normally.
        if (fraction !== null)
          for (const leave of window.__dinoRunner.motion.leaving.values()) clearTimeout(leave.timer);
        for (const a of document.getAnimations()) {
          if (!String(a.animationName || '').startsWith('motion-')) continue;
          if (fraction === null) { a.play(); continue; }
          a.pause();
          a.currentTime = a.effect.getComputedTiming().endTime * fraction;
        }
      };
      window.__pointerTargets = [];
      document.addEventListener('pointerdown', e => window.__pointerTargets.push(
        e.target.id || e.target.closest?.('[id]')?.id || e.target.tagName), true);
      window.__frames = n => { for (let i = 0; i < n; i++) window.advanceTime(1000 / 60); };
    });
    const tap = async (x, y) => {
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    };
    const center = async selector => {
      const box = await page.locator(selector).boundingBox();
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    await done(page);

    await check(`${layout}: T4 START begins the round in the input task; the menu leaves inert`, async () => {
      const before = await page.locator('#round-panel').boundingBox();
      await tap(...await center('#start-game'));
      assert.equal((await snap(page)).state, 'playing', 'Start is not delayed by the exit');
      const leaving = await page.evaluate(() => {
        window.advanceTime(0);
        window.__holdMotion(0.5);
        const panel = document.getElementById('round-panel');
        return { kind: panel.dataset.leaving, inert: panel.inert, hidden: panel.hidden,
          position: getComputedStyle(panel).position,
          stage: document.getElementById('stage').className,
          content: Number(getComputedStyle(document.getElementById('attract-content')).opacity),
          motion: window.__motion('#round-panel, #touch-jump, #touch-duck, #mobile-hud') };
      });
      const during = await page.locator('#round-panel').boundingBox();
      await page.screenshot({ path: path.join(output, `${layout}-t4-mid.png`) });
      assert.equal(leaving.kind, 'start');
      assert.equal(leaving.inert, true);
      assert.equal(leaving.hidden, false);
      assert.equal(leaving.position, 'absolute');
      assert.match(leaving.stage, /attract-leaving/);
      assert.doesNotMatch(leaving.stage, /\bidle\b/, 'The game layout applies at once');
      assert(Math.abs(during.x - before.x) <= 1 && Math.abs(during.y - before.y) <= 1 &&
        Math.abs(during.width - before.width) <= 1, 'The leaving menu stays in place');
      assert(leaving.content > 0.05 && leaving.content < 0.95, 'Half-way state ' + leaving.content);
      const names = new Set(leaving.motion.map(a => a.name));
      for (const name of ['motion-rise-out', 'motion-press-out', 'motion-fade-out'])
        assert(names.has(name), name + ' runs');
      if (touch) assert(leaving.motion.some(a => a.target === 'touch-jump' && a.name === 'motion-fade-in'));
      // Taps on the area under the leaving menu reach the game input.
      const [x, y] = await center('#round-panel');
      const reach = await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game;
        r.endJump();
        for (let i = 0; (g.trex.jumping || g.countingDown) && i < 400; i++) window.advanceTime(1000 / 60);
        window.__pointerTargets.length = 0;
        window.__jumps = 0;
        g.on(e => { if (e.type === 'jump') window.__jumps++; });
        return { grounded: !g.trex.jumping, leaving: r.motion.isLeaving(document.getElementById('round-panel')) };
      });
      assert.deepEqual(reach, { grounded: true, leaving: true });
      await tap(x, y);
      const groundTap = await page.evaluate(() => ({ targets: window.__pointerTargets.splice(0),
        jumps: window.__jumps, jumping: window.__dinoGame.trex.jumping }));
      assert(!groundTap.targets.some(t => ['round-panel', 'start-game', 'attract-content'].includes(t)),
        'Taps pass through the leaving menu: ' + groundTap.targets);
      assert.equal(groundTap.jumps, 1, 'On the ground a tap jumps');
      await page.evaluate(() => window.__frames(6));
      await tap(x, y);
      assert.equal(await page.evaluate(() => window.__jumps), 1, 'In the air without a feather no second jump');
      await page.evaluate(() => { window.__dinoGame.feather.charged = true; });
      await tap(x, y);
      assert.equal(await page.evaluate(() => window.__jumps), 2, 'A charged feather allows the air jump');
      if (touch) {
        await page.evaluate(() => window.__pointerTargets.splice(0));
        await page.touchscreen.tap(...await center('#touch-duck'));
        assert.equal((await page.evaluate(() => window.__pointerTargets.splice(0)))[0], 'touch-duck',
          'Touch buttons are usable while they fade in');
      }
      await page.evaluate(() => window.__holdMotion(null));
      await done(page);
      const after = await page.evaluate(() => ({ hidden: document.getElementById('round-panel').hidden,
        style: document.getElementById('round-panel').getAttribute('style'),
        leaving: document.querySelectorAll('[data-leaving]').length,
        stage: document.getElementById('stage').className }));
      assert.deepEqual({ ...after, stage: /attract-leaving/.test(after.stage) },
        { hidden: true, style: null, leaving: 0, stage: false });
    });

    await check(`${layout}: T5 Game over pops in after the hit stop and pauses with the game`, async () => {
      const crash = await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game;
        g.score = 0; g.gameOver();
        window.advanceTime(1000 / 60);
        const overlay = document.getElementById('game-over-overlay');
        return { enter: overlay.dataset.enter, hidden: overlay.hidden,
          motion: window.__motion('#game-over-overlay, #touch-jump, #touch-duck'),
          touchLeaving: document.getElementById('touch-jump').dataset.leaving ?? null,
          touchInert: document.getElementById('touch-jump').inert };
      });
      assert.equal(crash.enter, 'death');
      assert.equal(crash.hidden, false);
      const pop = crash.motion.find(a => a.target === 'game-over-overlay');
      assert.equal(pop.name, 'motion-pop-in');
      assert.equal(pop.delay, 120, 'Delay equals DEATH_HIT_MS');
      if (touch) {
        assert.equal(crash.touchLeaving, 'crash');
        assert.equal(crash.touchInert, true);
      }
      await page.evaluate(() => { window.__holdMotion(0.6); });
      await page.screenshot({ path: path.join(output, `${layout}-t5-mid.png`) });
      const midScale = await page.evaluate(() => Number(getComputedStyle(document.getElementById('game-over-overlay')).scale));
      assert(midScale > 0.85 && midScale < 1.1, 'Pop scale mid-way ' + midScale);
      // Held animations no longer follow CSS play state; restart the entrance first.
      await page.evaluate(() => {
        window.__holdMotion(null);
        window.__dinoRunner.motion.enter(document.getElementById('game-over-overlay'), 'death');
      });
      await page.locator('#settings-open').click();
      assert.equal(await page.evaluate(() => {
        const a = document.getElementById('game-over-overlay').getAnimations()[0];
        return !a || a.playState === 'paused';
      }), true, 'The pop pauses with the frozen death scene');
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
    });

    await check(`${layout}: T6 the result leaves and START returns usable and focused`, async () => {
      const back = await page.evaluate(() => {
        const g = window.__dinoGame;
        for (let i = 0; g.state !== 'attract' && i < 400; i++) window.advanceTime(1000 / 60);
        window.__holdMotion(0.3);
        const overlay = document.getElementById('game-over-overlay'), panel = document.getElementById('round-panel');
        return { state: g.state, overlay: overlay.dataset.leaving ?? null, overlayHidden: overlay.hidden,
          panel: panel.dataset.enter ?? null, panelHidden: panel.hidden, startInert: panel.inert,
          active: document.activeElement?.id, motion: window.__motion('#round-panel, #game-over-overlay') };
      });
      await page.screenshot({ path: path.join(output, `${layout}-t6-mid.png`) });
      assert.equal(back.state, 'attract');
      assert.equal(back.overlay, 'attract');
      assert.equal(back.overlayHidden, false);
      assert.equal(back.panel, 'attract');
      assert.equal(back.panelHidden, false);
      assert.equal(back.startInert, false);
      assert.equal(back.active, 'start-game');
      const names = new Set(back.motion.map(a => a.name));
      for (const name of ['motion-rise-in', 'motion-start-in', 'motion-fade-out'])
        assert(names.has(name), name + ' runs');
      await tap(...await center('#start-game'));
      assert.equal((await snap(page)).state, 'playing', 'START works during its entrance');
      await page.evaluate(() => {
        window.__holdMotion(null);
        const g = window.__dinoGame;
        g.score = 0; g.gameOver();
        for (let i = 0; g.state !== 'attract' && i < 400; i++) window.advanceTime(1000 / 60);
      });
      await done(page);
      assert.equal(await page.evaluate(() => document.querySelectorAll('[data-leaving], [data-enter]').length), 0);
    });

    await check(`${layout}: T5b the result lifts away while a late qualification is pending`, async () => {
      const waiting = await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game, c = r.highscoreController;
        c.store.local = () => Array.from({ length: 10 }, () => ({ score: 100 }));
        c.store.cachedOnline = () => null;
        c.online.normal = { state: 'idle' };
        c.api.url = 'https://scores.invalid/highscores.php';
        c.api.list = () => new Promise(resolve => { window.__qualify = resolve; });
        r.start();
        g.recordAtStart = 100; g.score = 12; g.gameTime = 4000; g.gameOver();
        for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
        const overlay = document.getElementById('game-over-overlay');
        return { state: g.state, leaving: overlay.dataset.leaving ?? null, motion: window.__motion('#game-over-overlay') };
      });
      assert.equal(waiting.state, 'crashed');
      assert.equal(waiting.leaving, 'wait');
      assert.equal(waiting.motion[0]?.name, 'motion-lift-out');
      await done(page);
      assert.equal(await page.locator('#game-over-overlay').isVisible(), false);
      await page.evaluate(() => window.__qualify({ entries: Array.from({ length: 10 }, () => ({ score: 100 })) }));
      await page.evaluate(() => window.__frames(2));
      assert.equal((await snap(page)).state, 'attract');
      await done(page);
    });

    await check(`${layout}: reduced motion keeps only short fades without movement`, async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => { window.__dinoRunner.attract.userPaused = false; });
      await tap(...await center('#start-game'));
      const start = await page.evaluate(async () => {
        window.advanceTime(0);
        const motion = window.__motion('#round-panel');
        await window.__dinoTest.transitionDone();
        return { motion, hidden: document.getElementById('round-panel').hidden };
      });
      assert(start.motion.every(a => a.end === 0), 'T4 is immediate');
      assert.equal(start.hidden, true);
      const crash = await page.evaluate(() => {
        const g = window.__dinoGame;
        g.score = 0; g.gameOver(); window.advanceTime(1000 / 60);
        window.__holdMotion(0.5);
        const motion = window.__motion('#game-over-overlay');
        const scale = getComputedStyle(document.getElementById('game-over-overlay')).scale;
        for (let i = 0; g.state !== 'attract' && i < 400; i++) window.advanceTime(1000 / 60);
        window.__holdMotion(0.5);
        const content = getComputedStyle(document.getElementById('attract-content'));
        const enter = window.__motion('#round-panel, #game-over-overlay');
        window.__holdMotion(null);
        return { motion, scale, translate: content.translate, enter };
      });
      assert(crash.motion.every(a => a.end <= 120 && a.delay === 0), JSON.stringify(crash.motion));
      assert(['1', 'none'].includes(crash.scale), 'No scaling: ' + crash.scale);
      assert(['none', '0px', '0px 0px'].includes(crash.translate), 'No movement: ' + crash.translate);
      assert(crash.enter.every(a => a.end <= 120), JSON.stringify(crash.enter));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await done(page);
    });

    assert.deepEqual(errors, [], layout + ' page errors');
    await context.close();
  }

  // Mechanism A on the attract screen (T1, T2, T3); START stays usable throughout.
  for (const layout of ['desktop', 'touch']) {
    const touch = layout === 'touch';
    const context = await browser.newContext({ serviceWorkers: 'block',
      viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      ...(touch ? { isMobile: true, hasTouch: true } : {}) });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
      const musicAudio = new EventTarget();
      musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio };
      try { localStorage.setItem('dino-fullscreen-disabled', 'true'); } catch {}
      // Records the first entrance (T1) with the animations it started.
      window.__enters = [];
      new MutationObserver(records => {
        for (const record of records) {
          const value = record.target.getAttribute('data-enter');
          if (value) window.__enters.push({ id: record.target.id, value,
            names: record.target.getAnimations({ subtree: true }).map(a => a.animationName) });
        }
      }).observe(document, { subtree: true, attributeFilter: ['data-enter'] });
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!window.__dinoRunner);
    const tap = async selector => {
      const box = await page.locator(selector).boundingBox();
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    };
    const motion = selector => page.evaluate(selector => [...document.querySelectorAll(selector)]
      .flatMap(el => el.getAnimations({ subtree: true }))
      .filter(a => String(a.animationName || '').startsWith('motion-'))
      .map(a => ({ name: a.animationName, target: a.effect.target.id || a.effect.target.className })), selector);
    const hold = fraction => page.evaluate(fraction => {
      for (const leave of window.__dinoRunner.motion.leaving.values()) clearTimeout(leave.timer);
      for (const a of document.getAnimations()) {
        if (!String(a.animationName || '').startsWith('motion-')) continue;
        if (fraction === null) { a.play(); continue; }
        a.pause(); a.currentTime = a.effect.getComputedTiming().endTime * fraction;
      }
    }, fraction);
    const startAndReturn = async selector => {
      await tap(selector);
      assert.equal((await snap(page)).state, 'playing', 'START works during the transition');
      await hold(null);
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.game.score = 0; r.game.gameOver(); r.returnToAttract();
        return window.__dinoTest.transitionDone();
      });
    };
    await page.evaluate(() => {
      window.__snap = () => ({ state: window.__dinoGame.state });
      const r = window.__dinoRunner;
      r.attract.userPaused = false;
      for (let i = 0; i < 10; i++) r.highscoreController.store.addLocal('normal', {
        id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
        name: String.fromCharCode(65 + i).repeat(4), score: 900 - i * 50,
        achievedAt: '2026-10-17T10:00:00Z', device: 'desktop', input: 'keyboard' });
      r.attract.renderScores();
    });

    await check(`${layout}: T1 the menu settles in on load with START from 0.6`, async () => {
      const enters = await page.evaluate(() => window.__enters);
      const load = enters.find(e => e.id === 'round-panel' && e.value === 'load');
      assert(load, 'T1 entrance recorded: ' + JSON.stringify(enters));
      for (const name of ['motion-rise-in', 'motion-dim-in']) assert(load.names.includes(name), name);
      await page.evaluate(() => window.__dinoRunner.motion.enter(document.getElementById('round-panel'), 'load'));
      await hold(0);
      const start = await page.evaluate(() => Number(getComputedStyle(document.getElementById('start-game')).opacity));
      assert(start >= 0.59 && start <= 0.61, 'START begins at 0.6, got ' + start);
      await hold(0.5);
      await page.screenshot({ path: path.join(output, `${layout}-t1-mid.png`) });
      await startAndReturn('#start-game');
    });

    await check(`${layout}: T2 slides move in the direction of the index change`, async () => {
      for (const [index, direction, sign] of [[2, 'next', -1], [1, 'prev', 1]]) {
        await tap(`[data-attract-slide="${index}"]`);
        await hold(0.5);
        const state = await page.evaluate(() => {
          const slides = [...document.querySelectorAll('.attract-slide')];
          const leaving = slides.find(s => s.dataset.leaving), entering = slides.find(s => s.dataset.enter);
          return { leaving: leaving && { id: leaving.id, kind: leaving.dataset.leaving, inert: leaving.inert,
            hidden: leaving.hidden, x: parseFloat(getComputedStyle(leaving).translate) || 0,
            area: getComputedStyle(leaving).gridArea },
            entering: entering && { id: entering.id, kind: entering.dataset.enter, inert: entering.inert },
            current: window.__dinoRunner.attract.index };
        });
        assert.equal(state.current, index);
        assert.equal(state.leaving?.kind, direction);
        assert.equal(state.leaving.inert, true);
        assert.equal(state.leaving.hidden, false);
        assert.equal(Math.sign(state.leaving.x), sign, 'Leaving slide moves with the change: ' + state.leaving.x);
        assert.equal(state.entering?.kind, direction);
        assert.equal(state.entering.inert, false);
        assert.deepEqual((await motion('.attract-slide')).map(a => a.name).sort(),
          ['motion-shift-in', 'motion-shift-out']);
        await page.screenshot({ path: path.join(output, `${layout}-t2-${direction}-mid.png`) });
        await hold(null);
        await page.evaluate(() => window.__dinoTest.transitionDone());
      }
      // Automatic rotation is forward; START works during the change.
      await page.evaluate(() => {
        const a = window.__dinoRunner.attract;
        a.advance(a.durations[a.index]);
      });
      await hold(0.3);
      assert.equal(await page.evaluate(() => document.querySelector('.attract-slide[data-leaving]')?.dataset.leaving), 'next');
      await startAndReturn('#start-game');
      // A paused preview switches at once.
      await page.evaluate(() => { window.__dinoRunner.attract.userPaused = true; });
      await tap('[data-attract-slide="2"]');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.attract-slide[data-leaving], .attract-slide[data-enter]').length), 0);
      await page.evaluate(() => { window.__dinoRunner.attract.userPaused = false; window.__dinoRunner.draw(1); });
    });

    await check(`${layout}: T3 the highscore pages crossfade`, async () => {
      await tap('[data-attract-slide="0"]');
      await hold(null);
      await page.evaluate(() => window.__dinoTest.transitionDone());
      await page.evaluate(() => window.__dinoRunner.attract.advance(4000));
      await hold(0.5);
      const state = await page.evaluate(() => {
        const ghost = document.querySelector('.attract-score-ghost'), list = document.getElementById('attract-score-list');
        return { ghost: ghost && { kind: ghost.dataset.leaving, hidden: ghost.getAttribute('aria-hidden'),
          first: ghost.querySelector('.attract-rank').textContent,
          opacity: Number(getComputedStyle(ghost).opacity), top: ghost.getBoundingClientRect().top },
          list: { kind: list.dataset.enter, first: list.querySelector('.attract-rank').textContent,
            opacity: Number(getComputedStyle(list.firstElementChild).opacity), top: list.getBoundingClientRect().top,
            delays: [...list.children].map(li => li.getAnimations()[0]?.effect.getTiming().delay) } };
      });
      assert.equal(state.ghost?.kind, 'page');
      assert.equal(state.ghost.hidden, 'true');
      assert.deepEqual([state.ghost.first, state.list.first], ['01', '06']);
      assert(Math.abs(state.ghost.top - state.list.top) <= 1, 'The copy covers the list');
      assert(state.ghost.opacity > 0.3 && state.ghost.opacity < 0.7, 'ghost ' + state.ghost.opacity);
      assert(state.list.opacity > 0.3 && state.list.opacity < 0.7, 'first row ' + state.list.opacity);
      assert.deepEqual(state.list.delays, [0, 20, 40, 60, 80], 'Rows stagger by 20 ms');
      await page.screenshot({ path: path.join(output, `${layout}-t3-mid.png`) });
      await startAndReturn('#start-game');
      assert.equal(await page.locator('.attract-score-ghost').count(), 0);
    });

    assert.deepEqual(errors, [], layout + ' attract page errors');
    await context.close();
  }

  // Mechanism C with real animations: T7a score morph, T9 dialog views, T11 Help.
  for (const level of ['full', 'basic']) {
    const { context, page, errors } = await openGame(browser, { level });
    await page.evaluate(() => {
      // Pseudo-element animations of the running View Transition, optionally held.
      window.__vt = (fraction) => {
        const list = document.getAnimations()
          .filter(a => String(a.effect?.pseudoElement || '').startsWith('::view-transition'));
        if (fraction !== undefined) for (const a of list) {
          a.pause(); a.currentTime = a.effect.getComputedTiming().endTime * fraction;
        }
        return [...new Set(list.map(a => a.effect.pseudoElement))].sort();
      };
      // Starts a crash/death-scene end and resolves once the transition animates.
      window.__entryReady = async (score) => {
        const r = window.__dinoRunner, g = r.game;
        g.start(0); g.score = score; g.gameTime = 4000; g.gameOver();
        for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
        await null;
        await r.transition.current.vt.ready;
        return { type: r.transition.current.type,
          dialogMotion: r.highscores.dialog.getAnimations().length,
          noMotion: r.highscores.dialog.classList.contains('no-motion') };
      };
    });
    const vt = fraction => page.evaluate(fraction => window.__vt(fraction), fraction);
    const release = () => page.evaluate(() => {
      const t = window.__dinoRunner.transition.current;
      for (const a of document.getAnimations()) if (a.playState === 'paused') a.play();
      return t?.vt.finished;
    });

    await check(`${level}: T7a the score morphs into the rising name sheet`, async () => {
      const ready = await page.evaluate(() => window.__entryReady(21));
      assert.equal(ready.type, 'entry');
      assert.equal(ready.noMotion, true, 'The dialog own animation is off during T7a');
      assert.equal(ready.dialogMotion, 0);
      const names = await vt(0.5);
      for (const name of ['::view-transition-group(result)', '::view-transition-new(sheet)',
        '::view-transition-old(root)', '::view-transition-new(root)'])
        assert(names.includes(name), name + ' in ' + names);
      await page.screenshot({ path: path.join(output, `${level}-t7a-mid.png`) });
      await release();
      await done(page);
      const after = await snap(page);
      assert.deepEqual([after.open, after.overlay, after.current, after.vt, after.active],
        [true, false, null, null, 'name-picker']);
      assert.deepEqual(await vt(), []);
    });

    await check(`${level}: T9 the dialog body steps forward and back`, async () => {
      for (const [view, type] of [['list', 'back'], ['entry', 'forward']]) {
        const names = await page.evaluate(async view => {
          const h = window.__dinoRunner.highscores;
          if (view === 'list') h.showList(); else h.showModal();
          await null;
          await window.__dinoRunner.transition.current.vt.ready;
          return { type: window.__dinoRunner.transition.current.type, names: window.__vt(0.5) };
        }, view);
        assert.equal(names.type, type);
        assert(names.names.includes('::view-transition-old(scores-body)'), names.names);
        assert(names.names.includes('::view-transition-new(scores-body)'), names.names);
        await page.screenshot({ path: path.join(output, `${level}-t9-${type}-mid.png`) });
        await release();
        await done(page);
        if (view === 'list') await page.evaluate(() => { window.__dinoRunner.highscores.view = 'entry'; });
      }
    });

    await check(`${level}: Escape during the morph returns at once and START works`, async () => {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__dinoGame.state === 'attract');
      await done(page);
      await page.evaluate(() => window.__entryReady(22));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__dinoRunner.transition.current === null);
      const box = await page.locator('#start-game').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      assert.equal((await snap(page)).state, 'playing', 'START is not captured after Escape');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.game.score = 0; r.game.gameOver(); r.returnToAttract();
        return window.__dinoTest.transitionDone();
      });
    });

    await check(`${level}: a new T7a while the previous dialog still exits`, async () => {
      await page.evaluate(() => window.__entryReady(23));
      await release();
      await done(page);
      await page.keyboard.press('Escape');
      const result = await page.evaluate(async () => {
        const exiting = getComputedStyle(document.getElementById('scores')).display !== 'none';
        await window.__entryReady(24);
        return { exiting, names: window.__vt() };
      });
      report.overlappingEntry = { ...report.overlappingEntry, [level]: result };
      assert(result.names.includes('::view-transition-group(result)'), result.names);
      await release();
      await done(page);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__dinoGame.state === 'attract' && !window.__dinoRunner.paused);
      await done(page);
    });

    await check(`${level}: a late qualification during the T5b exit still morphs cleanly`, async () => {
      const result = await page.evaluate(async () => {
        const r = window.__dinoRunner, g = r.game, c = r.highscoreController;
        const local = c.store.local, cached = c.store.cachedOnline, list = c.api.list;
        c.store.local = () => Array.from({ length: 10 }, () => ({ score: 100 }));
        c.store.cachedOnline = () => null;
        c.online.normal = { state: 'idle' };
        let qualify;
        c.api.list = () => new Promise(resolve => { qualify = resolve; });
        g.start(0); g.recordAtStart = 100; g.score = 12; g.gameTime = 4000; g.gameOver();
        for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
        const overlay = document.getElementById('game-over-overlay');
        const leaving = overlay.dataset.leaving ?? null;
        qualify({ entries: [] });
        await null; await null; await null;
        const type = r.transition.current?.type ?? null;
        const ready = await r.transition.current?.vt.ready.then(() => 'ready', e => e.name);
        const state = { leaving, type, ready, overlayHidden: overlay.hidden };
        Object.assign(c.store, { local, cachedOnline: cached });
        c.api.list = list;
        return state;
      });
      assert.deepEqual(result, { leaving: 'wait', type: 'entry', ready: 'ready', overlayHidden: true });
      await release();
      await done(page);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__dinoGame.state === 'attract' && !window.__dinoRunner.paused);
      await done(page);
    });

    await check(`${level}: T11 Help pushes in and returns`, async () => {
      const forward = await page.evaluate(async () => {
        document.getElementById('info-link').click();
        await null;
        await window.__dinoRunner.transition.current.vt.ready;
        return { type: window.__dinoRunner.transition.current.type, names: window.__vt(0.5) };
      });
      assert.equal(forward.type, 'help-forward');
      assert(forward.names.includes('::view-transition-old(root)'), forward.names);
      assert(forward.names.includes('::view-transition-new(root)'), forward.names);
      // Shows whether the engine captured the guide iframe in the new snapshot.
      await page.screenshot({ path: path.join(output, `${level}-t11-forward-mid.png`) });
      await release();
      await done(page);
      await page.evaluate(() => history.back());
      await page.waitForFunction(() => window.__dinoRunner.transition.current?.type === 'help-back');
      await page.evaluate(() => window.__dinoRunner.transition.current.vt.ready);
      await vt(0.5);
      await page.screenshot({ path: path.join(output, `${level}-t11-back-mid.png`) });
      await release();
      await page.waitForFunction(() => location.hash !== '#info' && !window.__dinoRunner.paused);
      await done(page);
      assert.deepEqual(await vt(), []);
      assert.equal((await snap(page)).page, true);
    });

    assert.deepEqual(errors, [], level + ' View Transition page errors');
    await context.close();
  }

  // Mechanism B: native dialog transitions (T7b, T8, T10, T12, T13, T14).
  for (const layout of ['desktop', 'portrait']) {
    const touch = layout === 'portrait';
    const { context, page, errors } = await openGame(browser, { touch,
      viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 } });
    await page.evaluate(() => {
      // Running dialog/backdrop transitions; `hold` pauses them at a fraction.
      window.__dialogMotion = (id, fraction) => {
        const dialog = document.getElementById(id);
        const list = document.getAnimations().filter(a => a.effect?.target === dialog);
        if (fraction !== undefined) for (const a of list) {
          a.pause(); a.currentTime = a.effect.getComputedTiming().endTime * fraction;
        }
        const style = getComputedStyle(dialog), backdrop = getComputedStyle(dialog, '::backdrop');
        return { open: dialog.open, display: style.display, opacity: Number(style.opacity),
          translate: style.translate, scale: style.scale, backdrop: Number(backdrop.opacity),
          // WebKit reports the ::backdrop pseudo-element as '' (the element itself is null).
          running: list.map(a => (a.transitionProperty || a.animationName) +
            (a.effect.pseudoElement === '' ? '::backdrop' : a.effect.pseudoElement || '') +
            ':' + Math.round(a.effect.getComputedTiming().endTime)).sort() };
      };
      window.__release = () => { for (const a of document.getAnimations()) if (a.playState === 'paused') a.play(); };
    });
    const dialogMotion = (id, fraction) => page.evaluate(([id, fraction]) => window.__dialogMotion(id, fraction), [id, fraction]);
    // Without `overlay` (WebKit 26.5, Firefox) dialogs open animated but close at once.
    const exits = await page.evaluate(() => CSS.supports('overlay: auto'));
    report.dialogExits = { ...report.dialogExits, [layout]: exits };
    const assertExit = (state, message) => {
      if (exits) assert.notEqual(state.display, 'none', message);
      else assert.equal(state.display, 'none', 'Fallback closes at once: ' + message);
    };
    await done(page);

    await check(`${layout}: T10 Settings opens and closes animated, also by Escape`, async () => {
      await page.locator('#settings-open').click();
      const opening = await dialogMotion('settings', 0.5);
      assert.equal(opening.open, true);
      assert(opening.running.some(r => r.startsWith('opacity:')), JSON.stringify(opening.running));
      assert(opening.running.some(r => r.startsWith('opacity::backdrop')), 'Backdrop fades');
      assert(opening.backdrop > 0.05 && opening.backdrop < 0.95, 'mid backdrop ' + opening.backdrop);
      assert(opening.opacity > 0.05 && opening.opacity < 0.95, 'mid opacity ' + opening.opacity);
      if (touch) assert.notEqual(opening.translate, 'none', 'Bottom sheet rises: ' + opening.translate);
      else assert(Number(opening.scale) < 1 && Number(opening.scale) > 0.96, 'scale ' + opening.scale);
      await page.screenshot({ path: path.join(output, `${layout}-t10-mid.png`) });
      await page.evaluate(() => window.__release());
      await done(page);
      await page.keyboard.press('Escape');
      const closing = await dialogMotion('settings');
      assert.equal(closing.open, false);
      assertExit(closing, 'Native Escape still animates the exit');
      if (exits) assert(closing.running.some(r => r.startsWith('opacity:')));
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await done(page);
      const closed = await dialogMotion('settings');
      assert.equal(closed.display, 'none');
      assert.equal(await page.evaluate(() => document.getElementById('settings').open), false, 'No reopening');
    });

    await check(`${layout}: raiseModalDialogs reopens without visible motion`, async () => {
      await page.locator('#settings-open').click();
      await done(page);
      const raised = await page.evaluate(() => {
        window.__dinoTest.raiseModalDialogs();
        return window.__dialogMotion('settings');
      });
      assert.equal(raised.open, true);
      assert.deepEqual(raised.running, []);
      assert.equal(raised.opacity, 1);
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await done(page);
    });

    await check(`${layout}: T14 install help closes animated after appinstalled`, async () => {
      await page.evaluate(() => {
        document.getElementById('install-help').showModal();
        window.__dinoRunner.updatePause();
      });
      assert.equal((await dialogMotion('install-help')).running.length > 0, true);
      await done(page);
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      const closing = await dialogMotion('install-help');
      assert.equal(closing.open, false);
      assertExit(closing, 'appinstalled closes animated');
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await done(page);
      assert.equal((await dialogMotion('install-help')).display, 'none');
    });

    await check(`${layout}: T7b late name entry opens synchronously, T8 closes to attract`, async () => {
      const opened = await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game, c = r.highscoreController;
        c.store.local = () => Array.from({ length: 10 }, () => ({ score: 100 }));
        c.store.cachedOnline = () => null;
        c.online.normal = { state: 'idle' };
        c.api.list = () => new Promise(resolve => { window.__qualify = resolve; });
        g.start(0); g.recordAtStart = 100; g.score = 12; g.gameTime = 4000; g.gameOver();
        for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
        return window.__dinoTest.transitionDone();
      }).then(() => page.evaluate(async () => {
        window.__qualify({ entries: [] });
        await null; await null;
        return { motion: window.__dialogMotion('scores', 0.5),
          current: window.__dinoRunner.transition.current?.type ?? null };
      }));
      assert.equal(opened.motion.open, true, 'T7b opens at once (no View Transition)');
      assert.equal(opened.current, null);
      assert.notEqual(opened.motion.translate, 'none');
      await page.screenshot({ path: path.join(output, `${layout}-t7b-mid.png`) });
      await page.evaluate(() => window.__release());
      await done(page);
      await page.locator('#entry-cancel').click();
      const closing = await page.evaluate(() => ({ motion: window.__dialogMotion('scores'),
        state: window.__dinoGame.state, panel: document.getElementById('round-panel').dataset.enter ?? null,
        active: document.activeElement?.id }));
      assert.equal(closing.state, 'attract');
      assertExit(closing.motion, 'T8 exit runs');
      assert.equal(closing.panel, 'attract', 'The menu returns as in T6');
      assert.equal(closing.active, 'start-game');
      const box = await page.locator('#start-game').boundingBox();
      if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      assert.equal((await snap(page)).state, 'playing', 'START works while the dialog leaves');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.game.score = 0; r.game.gameOver(); r.returnToAttract();
        return window.__dinoTest.transitionDone();
      });
    });

    await check(`${layout}: T12 goodbye and T13 new session`, async () => {
      await page.locator('#quit-game').click();
      const bye = await dialogMotion('goodbye', 0.5);
      assert.equal(bye.open, true);
      assert(bye.running.includes('opacity::backdrop:400'), JSON.stringify(bye.running));
      assert(bye.running.includes('scale:360'), JSON.stringify(bye.running));
      await page.screenshot({ path: path.join(output, `${layout}-t12-mid.png`) });
      await page.evaluate(() => window.__release());
      await done(page);
      await page.locator('#new-session').click();
      const fresh = await page.evaluate(() => ({ motion: window.__dialogMotion('goodbye'),
        panel: document.getElementById('round-panel').dataset.enter ?? null }));
      assert.equal(fresh.motion.open, false);
      if (exits) assert(fresh.motion.running.includes('opacity:200'), JSON.stringify(fresh.motion.running));
      else assert.equal(fresh.motion.display, 'none');
      assert.equal(fresh.panel, 'load');
      const box = await page.locator('#start-game').boundingBox();
      if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      assert.equal((await snap(page)).state, 'playing', 'START works during T13');
      await page.evaluate(() => {
        const r = window.__dinoRunner;
        r.game.score = 0; r.game.gameOver(); r.returnToAttract();
        return window.__dinoTest.transitionDone();
      });
    });

    await check(`${layout}: reduced motion dialogs only fade briefly`, async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('#settings-open').click();
      const reduced = await dialogMotion('settings', 0.5);
      assert(['none', '0px', '0px 0px'].includes(reduced.translate), reduced.translate);
      assert(['none', '1'].includes(reduced.scale), reduced.scale);
      assert(reduced.running.every(r => Number(r.split(':').at(-1)) <= 120), JSON.stringify(reduced.running));
      await page.evaluate(() => window.__release());
      await page.locator('#settings-close').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await done(page);
    });

    assert.deepEqual(errors, [], layout + ' dialog page errors');
    await context.close();
  }

  // Phase 6 polish: saved-row highlight, goodbye stagger and in-round hint fades.
  {
    const { context, page, errors } = await openGame(browser, {});
    await done(page);
    await check('a saved score lights up once on the highscore slide', async () => {
      const result = await page.evaluate(async () => {
        const r = window.__dinoRunner, g = r.game;
        r.highscoreController.api.submit = async () => { throw { kind: 'offline' }; };
        g.start(0); g.score = 31; g.gameTime = 4000; g.gameOver();
        for (let i = 0; g.inDeathScene && i < 400; i++) window.advanceTime(1000 / 60);
        await window.__dinoTest.transitionDone();
        await r.highscores.save();
        const row = document.querySelector('#attract-score-list li[data-enter="saved"]');
        return { state: g.state, row: row?.textContent ?? null,
          animation: row?.getAnimations().map(a => a.animationName) ?? [], pending: r.attract.highlight };
      });
      assert.equal(result.state, 'attract');
      assert.match(result.row, /00031/);
      assert.deepEqual(result.animation, ['motion-saved']);
      assert.equal(result.pending, null);
      await done(page);
    });
    await check('goodbye statistics stagger by 40 ms up to six rows', async () => {
      await page.locator('#quit-game').click();
      const delays = await page.evaluate(() => [...document.querySelectorAll('#goodbye .session-stat')]
        .map(item => item.getAnimations()[0]?.effect.getTiming().delay));
      assert.deepEqual(delays, [0, 40, 80, 120, 160, 200, 200]);
      await done(page);
      // raiseModalDialogs() must not replay the staggered statistics, also once
      // no-motion is released two frames later.
      const raised = await page.evaluate(async () => {
        const read = () => [...document.querySelectorAll('#goodbye .session-stat')]
          .map(item => ({ opacity: getComputedStyle(item).opacity, running: item.getAnimations().length }));
        window.__dinoTest.raiseModalDialogs();
        const now = read();
        for (let i = 0; i < 3; i++) await new Promise(f => requestAnimationFrame(f));
        await new Promise(f => setTimeout(f, 50));
        return { open: document.getElementById('goodbye').open, now, later: read() };
      });
      assert.equal(raised.open, true);
      for (const state of [...raised.now, ...raised.later]) assert.deepEqual(state, { opacity: '1', running: 0 });
      // A real close ends the raise: the next opening animates again.
      const reopened = await page.evaluate(async () => {
        const goodbye = document.getElementById('goodbye');
        const closed = new Promise(f => goodbye.addEventListener('close', f, { once: true }));
        goodbye.close();
        await closed;
        const settled = 'raised' in goodbye.dataset;
        goodbye.showModal();
        return { settled, running: goodbye.querySelector('.session-stat').getAnimations().length };
      });
      assert.deepEqual(reopened, { settled: false, running: 1 }, 'Entrance runs again after a real close');
      await done(page);
      await page.locator('#new-session').click();
      await done(page);
    });
    await check('coach hints fade in while hiding stays immediate', async () => {
      const result = await page.evaluate(() => {
        const r = window.__dinoRunner, coach = document.getElementById('coach');
        r.game.start(0);
        for (let i = 0; coach.hidden && i < 60; i++) window.advanceTime(1000 / 60);
        const shown = { hidden: coach.hidden, fades: coach.getAnimations().map(a => a.transitionProperty) };
        r.game.gameOver(); window.advanceTime(1000 / 60);
        return { shown, hiddenAfter: coach.hidden };
      });
      assert.equal(result.shown.hidden, false);
      assert.deepEqual(result.shown.fades, ['opacity']);
      assert.equal(result.hiddenAfter, true);
    });
    assert.deepEqual(errors, [], 'polish page errors');
    await context.close();
  }

  // Trusted input to the first rendered frame with the jump pose, real rAF loop.
  await check('START latency with and without transitions differs by at most one frame', async () => {
    const results = {};
    for (const transitions of [true, false]) {
      const { context, page, errors } = await openGame(browser, { manualFrames: false, transitions });
      await page.evaluate(() => {
        window.__latency = [];
        document.getElementById('start-game').addEventListener('pointerdown', e => {
          const t0 = e.timeStamp;
          const poll = now => {
            if (window.__dinoGame.trex.jumping) window.__latency.push(now - t0);
            else requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        }, true);
      });
      const [x, y] = await (async () => {
        const box = await page.locator('#start-game').boundingBox();
        return [box.x + box.width / 2, box.y + box.height / 2];
      })();
      for (let run = 0; run < 30; run++) {
        await page.evaluate(() => window.__dinoTest.transitionDone());
        await page.mouse.click(x, y);
        await page.waitForFunction(n => window.__latency.length === n, run + 1);
        await page.evaluate(() => {
          const r = window.__dinoRunner;
          r.game.score = 0; r.game.gameOver();
          r.returnToAttract();
        });
      }
      const samples = (await page.evaluate(() => window.__latency)).sort((a, b) => a - b);
      results[transitions ? 'on' : 'off'] = { median: samples[14], p95: samples[Math.ceil(30 * 0.95) - 1] };
      assert.deepEqual(errors, []);
      await context.close();
    }
    report.latency = results;
    console.log('  latency ms', JSON.stringify(results));
    // Headless WebKit has no real compositor/VSync: its rAF timing is reference only.
    // The physical-device measurement (tests/android-transitions.mjs) is authoritative.
    results.assessed = engine !== 'webkit';
    if (!results.assessed) return;
    assert(Math.abs(results.on.median - results.off.median) <= 1000 / 60 + 1, 'median');
    assert(Math.abs(results.on.p95 - results.off.p95) <= 1000 / 60 + 1, 'p95');
  });

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

  await check('Help return into a running round applies at once and the next tap jumps', async () => {
    const { context, page, errors } = await openGame(browser, {});
    await done(page);
    await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game;
      // No obstacles: the round must survive Help and the tap.
      g.on(e => { if (e.type === 'step') g.horizon.obstacles.length = 0; });
      g.start(0);
      // Land first: in the air without a feather a tap correctly does not jump.
      for (let i = 0; (g.trex.jumping || g.countingDown) && i < 400; i++) window.advanceTime(1000 / 60);
      window.__jumps = 0;
      g.on(e => { if (e.type === 'jump') window.__jumps++; });
      window.__targets = [];
      addEventListener('pointerdown', e => window.__targets.push(e.target.id || e.target.tagName), true);
    });
    await page.locator('#info-link').click();
    await page.waitForFunction(() => location.hash === '#info');
    await done(page);
    await page.frameLocator('#info-view').locator('[data-help-back]').first().click();
    await page.waitForFunction(() => location.hash !== '#info' && !window.__dinoRunner.paused);
    const back = await snap(page);
    assert.equal(back.state, 'playing');
    assert.equal(back.paused, false);
    assert.equal(back.current, null, 'No View Transition while the round runs');
    assert.equal(back.pending, false);
    assert.equal(back.page, true);
    assert.equal(back.info, false);
    assert.equal(await viewTransitionAnimations(page), 0);
    const box = await page.locator('#game').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const tapped = await page.evaluate(() => ({ targets: window.__targets.splice(0), jumps: window.__jumps }));
    assert(!tapped.targets.includes('HTML'), 'The tap is not captured by the root: ' + tapped.targets);
    assert.equal(tapped.jumps, 1, 'The first tap after Help jumps');
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
