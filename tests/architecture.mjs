// Workflow tests without a browser DOM, plus independent worlds and rotation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'dino.html'), 'utf8');
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/architecture'), engine);
fs.mkdirSync(output, { recursive: true });
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
// Execute the real inline controller and name/entry helpers. No window, document,
// navigator or Canvas is provided; stores and network are injected test doubles.
const Controller = vm.runInNewContext([
  between('        const BLOCKED_NAMES', '        const LETTERS'),
  between('        const roundEntry', '        // Drops unknown labels'),
  source.match(/const isHighscoreName =[^\n]+/)[0],
  between('        class HighscoreController', '        // Presentation: score lists'),
  'HighscoreController',
].join('\n'), {
  HIGHSCORE_LIST_SIZE: 10, INPUTS: { keyboard: true, touch: true },
  newEntryId: randomUUID, utcNow: () => '2026-10-15T12:00:00Z',
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const error = (kind, needsNewName = false) => ({ kind, needsNewName });
const round = (score = 12, recordAtStart = 0) => ({ score, recordAtStart, mode: 'normal', gameTime: 4000 });
function fixture(entries = []) {
  const local = [...entries], cache = new Map(), requests = [], notices = [], records = [];
  const store = {
    local: () => [...local], cachedOnline: mode => cache.get(mode),
    cacheOnline: (mode, entries) => cache.set(mode, { entries }),
    addLocal: (mode, entry) => {
      if (!local.some(e => e.id === entry.id)) local.push(entry);
      return local.findIndex(e => e.id === entry.id) + 1;
    },
  };
  const api = {
    list: () => { const task = deferred(); requests.push({ type: 'list', ...task }); return task.promise; },
    submit: (round, name) => {
      const task = deferred(); requests.push({ type: 'submit', round, name, ...task }); return task.promise;
    },
  };
  const controller = new Controller({ store, api,
    onEntryReady: () => notices.push('entry'), onRecord: text => records.push(text) });
  return { controller, store, requests, notices, records, local };
}
const checks = [];
async function check(name, action) { await action(); checks.push(name); }

await check('qualification, zero and ties', async () => {
  const f = fixture();
  f.controller.roundEnded(round(0));
  assert.equal(f.controller.round, null);
  f.controller.roundEnded(round(), 'touch', 'phone');
  assert(Object.isFrozen(f.controller.round));
  assert.equal(f.controller.round.device, 'phone');
  assert.equal(f.controller.round.input, 'touch');
  assert.deepEqual(f.notices, ['entry']);
  const full = Array.from({ length: 10 }, () => ({ score: 100 }));
  assert.equal(f.controller.qualifiesForTop10(full, 100), false);
  assert.equal(f.controller.qualifiesForTop10(full, 101), true);
  assert.equal(f.controller.qualifiesForTop10(full.slice(1), 100), true);
});
await check('deferred qualification and round cancellation', async () => {
  const f = fixture(Array.from({ length: 10 }, () => ({ score: 100 })));
  f.controller.roundEnded(round(12, 100));
  assert.equal(f.controller.round, null);
  assert.equal(f.notices.length, 0);
  f.requests[0].resolve({ entries: [] });
  await f.requests[0].promise;
  assert.equal(f.controller.round.score, 12);
  assert.equal(f.notices.length, 1);
  const abandoned = fixture(Array.from({ length: 10 }, () => ({ score: 100 })));
  abandoned.controller.roundEnded(round(11, 100));
  abandoned.controller.roundLeft();
  abandoned.requests[0].resolve({ entries: [] });
  await abandoned.requests[0].promise;
  assert.equal(abandoned.controller.round, null);
  assert.equal(abandoned.notices.length, 0, 'Late qualification must not reopen an abandoned round');
});
await check('offline save, double-submit lock and idempotent retry', async () => {
  const f = fixture();
  f.controller.roundEnded(round());
  assert.equal((await f.controller.save('A')).invalidName, true);
  assert.equal((await f.controller.save('FUCK')).invalidName, true);
  assert.equal(f.requests.length, 0);
  const pending = f.controller.save('DINO');
  assert.equal(await f.controller.save('TEST'), null);
  f.requests[0].reject(error('offline'));
  const saved = await pending;
  assert.equal(saved.localRank, 1);
  assert.equal(f.controller.canResend, true);
  const retry = f.controller.retry();
  assert.equal(await f.controller.retry(), null);
  assert.equal(f.requests[1].round.id, f.requests[0].round.id);
  assert.equal(f.requests[1].name, 'DINO');
  f.requests[1].resolve({ status: 'saved', rank: 1, entries: [] });
  await retry;
  assert.equal(f.controller.canResend, false);
  assert.equal(f.local.length, 1);
  assert.equal(f.records.length, 2);
});
await check('server name rejection leaves the round editable', async () => {
  const f = fixture(); f.controller.roundEnded(round());
  const pending = f.controller.save('DINO');
  f.requests[0].reject(error('name_blocked', true));
  assert.equal((await pending).invalidName, true);
  assert.equal(f.controller.saving, false);
  assert.equal(f.controller.saved, null);
  assert.equal(f.local.length, 0);
  const next = f.controller.save('TEST');
  f.requests[1].resolve({ status: 'saved', entries: [] }); await next;
  assert.equal(f.local[0].name, 'TEST');
});
await check('late saves persist without unlocking a new round', async () => {
  const f = fixture(); f.controller.roundEnded(round());
  const old = f.controller.save('DINO');
  f.controller.roundLeft(); f.controller.roundEnded(round(20));
  const current = f.controller.save('TEST');
  f.requests[0].resolve({ status: 'saved', entries: [] });
  assert.equal(await old, null);
  assert.equal(f.controller.saving, true);
  assert.equal(f.controller.saved, null);
  assert.equal(f.local[0].name, 'DINO');
  f.requests[1].reject(error('offline')); await current;
  assert.equal(f.controller.saved.name, 'TEST');
});
await check('late retries cannot unlock a newer request', async () => {
  const f = fixture(); f.controller.roundEnded(round());
  const first = f.controller.save('DINO');
  f.requests[0].reject(error('offline')); await first;
  const oldRetry = f.controller.retry();
  f.controller.roundLeft(); f.controller.roundEnded(round(20));
  const current = f.controller.save('TEST');
  f.requests[1].resolve({ status: 'saved', entries: [] });
  assert.equal(await oldRetry, null);
  assert.equal(f.controller.saving, true);
  f.requests[2].reject(error('offline')); await current;
  assert.equal(f.controller.saved.name, 'TEST');
});
await check('online loading deduplicates and supports refresh after failure', async () => {
  const f = fixture();
  const pending = f.controller.loadOnline('normal');
  await f.controller.loadOnline('normal', true);
  assert.equal(f.requests.length, 1);
  f.requests[0].reject(error('offline')); await pending;
  assert.equal(f.controller.online.normal.state, 'error');
  const refresh = f.controller.loadOnline('normal', true);
  f.requests[1].resolve({ entries: [] }); await refresh;
  assert.equal(f.controller.online.normal.state, 'ok');
  await f.controller.loadOnline('normal');
  assert.equal(f.requests.length, 2);
});

const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const browser = await pw[engine].launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await context.route(/^https?:/, route => route.abort());
  await page.addInitScript(() => {
    window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null };
    localStorage.setItem('dino-fullscreen-disabled', 'true');
  });
  // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
  await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
  await page.goto(pathToFileURL(path.join(root, 'dino.html')).href);
  await page.waitForFunction(() => !!window.__dinoRunner);
  await check('worlds spawn independently and resize without resets', async () => {
    const result = await page.evaluate(() => {
      const Game = window.__dinoGame.constructor;
      const a = new Game({ width: 420, random: () => 0.5 });
      const b = new Game({ width: 900, random: () => 0.5 });
      a.resize(500);
      for (const g of [a, b]) {
        g.horizon.addObstacle(10, 0);
        g.feather.spawnTimer = g.turbo.spawnTimer = 0;
        g.feather.update(0, g.trex, 6, [], null);
        g.turbo.update(0, g.trex, 6, []);
      }
      let invalid = 0;
      for (const width of [0, -1, NaN, Infinity]) {
        try { a.resize(width); } catch { invalid++; }
      }
      return { widths: [a.world.width, b.world.width],
        obstacles: [a.horizon.obstacles[0].x, b.horizon.obstacles[0].x],
        feathers: [a.feather.pickup.x, b.feather.pickup.x],
        chili: [a.turbo.pickup.x, b.turbo.pickup.x], invalid,
        independent: a.world !== b.world };
    });
    assert.deepEqual(result, { widths: [500, 900], obstacles: [510, 910],
      feathers: [524, 924], chili: [524, 924], invalid: 4, independent: true });
  });
  await check('browser rotation preserves round and resizes all consumers', async () => {
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.beginRound(); g.score = 12; g.feather.charged = true;
      g.turbo.remaining = 3000; g.gameTime = 1234;
      g.capturePrevious(); window.__dinoRunner.draw(1);
    });
    assert.equal(await page.evaluate(() => window.__dinoGame.world.width), 420);
    await page.screenshot({ path: path.join(output, 'portrait.png') });
    for (const [viewport, width] of [[{ width: 844, height: 390 }, 600], [{ width: 390, height: 844 }, 420]]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(width => window.__dinoGame.world.width === width, width);
      assert.deepEqual(await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game;
        return { state: g.state, score: g.score, time: g.gameTime,
          feather: g.feather.charged, turbo: g.turbo.remaining,
          shared: [g.horizon, g.turbo, g.feather, r.renderer, r.renderer.effects]
            .every(component => component.world === g.world) };
      }), { state: 'playing', score: 12, time: 1234, feather: true, turbo: 3000, shared: true });
    }
  });
  for (const timing of ['before', 'after']) {
    await check(`online qualification ${timing} death scene opens the name dialog automatically`, async () => {
      await page.evaluate(() => {
        const r = window.__dinoRunner, g = r.game, c = r.highscoreController;
        c.store.local = () => Array.from({ length: 10 }, () => ({ score: 100 }));
        c.store.cachedOnline = () => null;
        c.online.normal = { state: 'idle' };
        c.api.list = () => new Promise(resolve => { window.__resolveQualification = resolve; });
        g.newSession(); g.start(0); g.recordAtStart = 100;
        g.score = 12; g.gameTime = 4000; g.gameOver();
      });
      assert.equal(await page.locator('#scores').evaluate(dialog => dialog.open), false);
      const finishDeath = () => page.evaluate(() => {
        for (let i = 0; i < 160; i++) window.advanceTime(1000 / 60);
      });
      if (timing === 'after') {
        await finishDeath();
        assert.equal(await page.locator('#scores').evaluate(dialog => dialog.open), false);
      }
      await page.evaluate(() => window.__resolveQualification({ entries: [] }));
      await page.waitForFunction(() => !!window.__dinoRunner.highscoreController.round);
      if (timing === 'before') {
        assert.equal(await page.locator('#scores').evaluate(dialog => dialog.open), false);
        await finishDeath();
      }
      await page.waitForFunction(() => document.getElementById('scores').open);
      assert.equal(await page.locator('#scores-entry-view').isVisible(), true);
      await page.screenshot({ path: path.join(output, `automatic-name-${timing}.png`) });
      await page.locator('#entry-cancel').click();
      await page.waitForFunction(() => !window.__dinoRunner.paused);
    });
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
fs.writeFileSync(path.join(output, 'architecture.json'), JSON.stringify({ engine, checks }, null, 2));
console.log(`${engine}: ${checks.length} architecture scenarios passed`);
