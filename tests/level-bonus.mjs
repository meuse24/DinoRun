// Real obstacle accounting, safe level transitions, capped score and responsive tally.
// Isolated file, no live scores. DINO_BROWSER=webkit is supported.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/level-bonus'), engine);
fs.mkdirSync(output, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-bonus-'));
const file = path.join(temp, 'dino.html'); fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const browser = await pw[engine].launch();
const reports = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }],
    ['portrait', { width: 320, height: 568 }], ['landscape', { width: 663, height: 234 }]]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block',
      ...(name === 'desktop' ? {} : { isMobile: true, hasTouch: true }) });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
      localStorage.setItem('dino-fullscreen-disabled', 'true');
      const musicAudio = new EventTarget(); musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
      window.__dinoTest = { credits: 3, highscoreApiUrl: null, manualFrames: true, transitions: false, musicAudio };
    });
    await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => !!window.__dinoRunner);
    const model = await page.evaluate(() => {
      const Game = window.__dinoGame.constructor, dt = 1000 / 60;
      const check = (v, m) => { if (!v) throw Error(m); };
      const fresh = (mode = 'normal') => {
        const g = new Game({ mode, random: () => .5, bossEnabled: false, featherEnabled: false, shieldEnabled: false });
        g.beginRound(); g.endJump();
        for (let i = 0; i < 65; i++) g.update(dt);
        g.gameTime = 4000; g.horizon.obstacles.length = 0;
        g.horizon.addObstacle = () => {}; // The accounting tests below inject real obstacle entities.
        g.turbo.spawnTimer = 1e9; return g;
      };
      const queue = (g, base = 200, clean = true, cleared = 8) => {
        g.distance = base / .025; g.score = base;
        g.section.clean = clean; g.section.cleared = cleared;
        g.speed = g.config.speed + 1; g.queueBonus();
      };
      const finish = g => { for (let i = 0; g.bonus && i < 120; i++) g.update(dt); check(!g.bonus, 'Automatic completion'); };
      // Use real grouped obstacles, with actual collision handling and single crossing.
      const pass = fresh(), source = new Game({ random: () => .1 });
      source.horizon.addObstacle(6, 0); const obstacle = source.horizon.obstacles[0];
      obstacle.size = 3; obstacle.x = pass.trex.x - obstacle.width * 3 + pass.speed - .1;
      pass.horizon.obstacles.push(obstacle); pass.update(dt); pass.update(dt);
      check(pass.section.cleared === 1, 'A cluster counts once, not once per cactus/frame');
      const shield = fresh(); source.horizon.addObstacle(6, 0);
      const hit = source.horizon.obstacles.at(-1); hit.x = shield.trex.x + 12 + shield.speed;
      shield.shield.charged = true; shield.horizon.obstacles.push(hit); shield.update(dt);
      check(!shield.shield.charged && !shield.section.clean && shield.section.cleared === 0,
        'Shield hit is not a clean pass or no-hit section');
      const burned = fresh(); source.horizon.addObstacle(6, 0);
      const cactus = source.horizon.obstacles.at(-1); cactus.x = burned.trex.x + 12 + burned.speed;
      burned.turbo.activate(burned.trex); burned.horizon.obstacles.push(cactus); burned.update(dt);
      check(burned.section.cleared === 0 && burned.section.clean, 'Burning is not a clean pass or damage');
      const results = [];
      for (const mode of ['normal', 'relaxed']) {
        const crossing = fresh(mode);
        crossing.speed = crossing.config.speed + 1 - crossing.config.acceleration / 2;
        crossing.distance = 200 / .025; crossing.section.cleared = 3;
        crossing.update(dt);
        check(crossing.bonus?.level === 2 && crossing.bonus.total === 8, 'Actual acceleration crossing queues and starts a safe tally');
        const g = fresh(mode), events = []; g.on(e => events.push(e));
        queue(g); check(g.pendingBonus.total === 13, 'Eight passes plus no-hit five');
        const snapshot = JSON.stringify(g.pendingBonus); g.section.cleared = 99; g.section.clean = false;
        g.trex.startJump(g.speed); g.beginBonusIfSafe(); check(!g.bonus, 'Never freeze a jump');
        g.trex.jumping = false; g.trex.y = g.trex.groundY;
        g.feather.pickup = { x: 700, y: 100 }; g.beginBonusIfSafe(); check(!g.bonus, 'Wait for collectible'); g.feather.pickup = null;
        g.turbo.remaining = 2000; g.beginBonusIfSafe(); check(!g.bonus, 'Do not consume active Chili during tally'); g.turbo.remaining = 0;
        g.boss.enabled = true; g.boss.phase = 'warning'; g.beginBonusIfSafe(); check(!g.bonus, 'Wait for boss');
        g.boss.enabled = false; g.boss.phase = 'idle';
        check(JSON.stringify(g.pendingBonus) === snapshot, 'Waiting does not change the earned summary');
        g.recoveryRemaining = 500; g.shield.charged = true; g.feather.charged = true;
        g.beginBonusIfSafe(); check(g.bonus && !g.pendingBonus, 'Begin only after clearance');
        const frozen = [g.distance, g.gameTime, g.speed, g.recoveryRemaining, g.boss.remaining, g.turbo.spawnTimer];
        g.jump(); check(!g.trex.jumping && !g.pendingJumpUntil, 'Input does not spend feather or buffer a jump');
        finish(g);
        check(g.bonusScore === 13 && g.score === 213, 'Full bonus paid exactly once');
        check(JSON.stringify(frozen) === JSON.stringify([g.distance, g.gameTime, g.speed, g.recoveryRemaining, g.boss.remaining, g.turbo.spawnTimer]), 'World and power-up timers freeze');
        check(g.shield.charged && g.feather.charged, 'Charged power-ups preserved');
        check(events.filter(e => e.type === 'bonusTick').length === 6, 'Six bounded coin beats');
        g.update(dt); check(g.score >= 213 && g.bonusScore === 13 && !g.bonus && !g.pendingBonus, 'Resume keeps bonus without duplicate payment');
        const cap = fresh(mode); queue(cap, 100, true, 100); check(cap.pendingBonus.total === 10, 'Ten-percent section cap');
        const berries = fresh(mode); berries.berries = 2; berries.berryScore = 50; berries.section.berries = 2;
        queue(berries); berries.refreshScore();
        check(berries.pendingBonus.berries === 2 && berries.section.berries === 0, 'Snapshot only the completed section berries');
        berries.berries++; berries.berryScore += 25; berries.section.berries++;
        berries.refreshScore(); berries.beginBonusIfSafe();
        check(berries.bonus.berries === 2 && berries.section.berries === 1, 'Later collections belong to the next section');
        finish(berries);
        check(berries.berryScore === 75 && berries.score === 288 && berries.bonusScore === 13, 'Berry flights never pay the same points twice');
        berries.returnToAttract();
        check(berries.section.berries === 0 && berries.berryScore === 0, 'Round cleanup resets berry recap');
        const damaged = fresh(mode); queue(damaged, 200, false, 4); check(damaged.pendingBonus.total === 4, 'No clean bonus after damage');
        const life = fresh(mode); life.lives = 2; queue(life, 499); life.beginBonusIfSafe(); finish(life);
        check(life.lives === 3 && life.nextLifeScore === 1250, 'Bonus crossing grants one extra life');
        life.update(dt); check(life.lives === 3, 'No repeated life reward');
        const top = fresh(mode); top.speed = top.config.maxSpeed; top.section.level = top.level;
        top.gameTime = 34000; top.distance = 1000 / .025; top.queueBonus();
        check(top.pendingBonus?.checkpoint, 'Top-speed checkpoints continue');
        const practice = fresh(mode); practice.boss.training = true; queue(practice); check(!practice.pendingBonus, 'Training excluded');
        const demo = new Game({ bonusEnabled: false }); demo.beginRound(); queue(demo); check(!demo.pendingBonus, 'Attract demo excluded');
        g.returnToAttract(); check(g.bonusScore === 0 && !g.bonus && !g.pendingBonus, 'Round cleanup');
        results.push(mode);
      }
      // Long run uses real spawns/physics and level crossings, not a fabricated bonus.
      let seed = 41;
      const run = new Game({ bossEnabled: false, featherEnabled: false, shieldEnabled: false,
        random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) });
      run.beginRound(); run.endJump(); run.turbo.spawnTimer = 1e9;
      let tallies = 0;
      run.on(e => { if (e.type === 'bonusEnd') tallies++; });
      for (let i = 0; i < 13000; i++) {
        run.shield.charged = true; // Failed bot timing must not end this long lifecycle fixture.
        const o = run.horizon.obstacles.find(o => o.x + o.width * o.size > run.trex.x);
        const near = o && o.x - run.trex.x - run.trex.width < run.speed * 18;
        run.duck(!!near && o.type.name === 'ptero' && o.y === 136 && !run.trex.jumping);
        if (near && !run.trex.jumping && (o.type.name !== 'ptero' || o.y !== 136)) run.jump();
        run.update(dt);
      }
      check(tallies >= 8 && run.bonusScore > 0, 'Natural levels and top-speed checkpoint complete');
      check(run.bonusScore <= Math.floor(Math.floor(run.distance * .025) * .1), 'Aggregate bonus stays within ten percent');
      return results;
    });
    // Real coordinator/renderer, pause, settings and touch input around an active tally.
    await page.locator('#start-game').click();
    await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game;
      g.trex.jumping = false; g.trex.y = g.trex.groundY; g.trex.velocity = 0;
      g.horizon.obstacles = []; g.turbo.pickup = g.feather.pickup = g.shield.pickup = null;
      g.boss.reset(); g.boss.remaining = 1e9; g.gameTime = 5000;
      g.distance = 499 / .025; g.score = 499; g.speed = 7;
      g.berries = 2; g.berryScore = 50; g.section.berries = 2; g.refreshScore();
      g.section.cleared = 8; g.lives = 2;
      window.__bonusNotes = []; r.sound.bonus = i => window.__bonusNotes.push(i);
      g.queueBonus(); g.beginBonusIfSafe();
      for (let i = 0; i < 36; i++) r.update(1000 / 60);
      r.draw(1);
    });
    const middle = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert(middle.bonus && middle.bonus.paid > 0 && middle.bonus.paid < middle.bonus.total);
    assert.equal(middle.bonus.berries, 2); assert.equal(middle.berry.score, 50);
    assert.equal(middle.credits, 2);
    await page.screenshot({ path: path.join(output, name + '-tally.png') });
    const effectCounts = await page.evaluate(() => {
      const r = window.__dinoRunner, ctx = r.renderer.ctx, arc = ctx.arc, draw = ctx.drawImage;
      const body = r.renderer.berrySprites().body;
      let coins = 0, berries = 0;
      ctx.drawImage = function(image, ...args) { if (image === body) berries++; return draw.call(this, image, ...args); };
      ctx.arc = function(x, y, radius, ...angles) {
        if (radius === 12 && this.fillStyle === '#ffd257') coins++;
        return arc.call(this, x, y, radius, ...angles);
      };
      try {
        r.draw(1); const on = coins, berriesOn = berries; coins = berries = 0;
        r.effectsSetting.set(false, false); r.draw(1); const off = coins, berriesOff = berries;
        r.effectsSetting.set(true, false);
        return { on, off, berriesOn, berriesOff, paid: r.game.bonus.paid };
      } finally { ctx.arc = arc; ctx.drawImage = draw; }
    });
    assert(effectCounts.on > 0 && effectCounts.off === 0, 'Effects off suppresses actual coin flight');
    assert(effectCounts.berriesOn > 0 && effectCounts.berriesOn <= 6 && effectCounts.berriesOff === 0, 'Bounded berry sprites fly only with effects on');
    assert.equal(effectCounts.paid, middle.bonus.paid, 'Effect setting never changes earned points');
    await page.locator('#settings-open').click();
    const beforePause = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__dinoRunner.update(1000 / 60); });
    assert.deepEqual(await page.evaluate(() => JSON.parse(window.render_game_to_text())), beforePause);
    await page.locator('#settings-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(40);
    await page.evaluate(() => window.__dinoRunner.draw(1));
    await page.screenshot({ path: path.join(output, name + '-reduced.png') });
    const completion = await page.evaluate(() => {
      const r = window.__dinoRunner;
      for (let i = 0; i < 90; i++) r.update(1000 / 60);
      r.draw(1); return { state: JSON.parse(window.render_game_to_text()), notes: window.__bonusNotes };
    });
    assert.equal(completion.state.bonus, null); assert.equal(completion.state.bonusScore, 13);
    assert.equal(completion.state.berry.score, 50, 'Recap keeps already awarded berry points unchanged');
    assert.equal(completion.state.lives, 3); assert.equal(completion.state.credits, 2);
    assert.deepEqual(completion.notes, [1, 2, 3, 4, 5, 6]);
    if (name === 'desktop' && engine === 'chromium') {
      const audio = await page.evaluate(async () => {
        const sound = window.__dinoRunner.sound, play = sound.constructor.prototype.bonus;
        const saved = { context: sound.context, output: sound.output, enabled: sound.enabled, volume: sound.volume };
        const render = async (volume, enabled = true) => {
          const offline = new OfflineAudioContext(1, 52920, 44100);
          let time = 0;
          sound.context = { state: 'running', get currentTime() { return time; },
            createOscillator: () => offline.createOscillator(), createGain: () => offline.createGain() };
          sound.output = offline.createGain(); sound.output.gain.value = volume / 100; sound.output.connect(offline.destination);
          sound.volume = volume; sound.enabled = enabled;
          for (let index = 1; index <= 6; index++) { time = (index - 1) * .15; play.call(sound, index); }
          const samples = (await offline.startRendering()).getChannelData(0);
          let energy = 0, peak = 0, tail = 0;
          for (let i = 0; i < samples.length; i++) {
            energy += samples[i] ** 2; peak = Math.max(peak, Math.abs(samples[i]));
            if (i > 44100) tail = Math.max(tail, Math.abs(samples[i]));
          }
          return { energy, peak, tail };
        };
        try { return { full: await render(100), quarter: await render(25), muted: await render(100, false), zero: await render(0) }; }
        finally { Object.assign(sound, saved); }
      });
      assert(audio.full.energy > .01 && audio.full.peak < .95 && audio.full.tail < 1e-9);
      assert(Math.abs(audio.quarter.energy / audio.full.energy - .0625) < .001);
      assert.equal(audio.muted.energy, 0); assert.equal(audio.zero.energy, 0);
      fs.writeFileSync(path.join(output, 'bonus-audio.json'), JSON.stringify(audio, null, 2));
    }
    if (name !== 'desktop') await page.locator('#touch-jump').tap();
    else await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__dinoGame.trex.jumping), true, 'Controls work immediately after tally');
    assert.deepEqual(errors, []);
    reports.push({ name, model, middle, completion }); await context.close();
  }
  fs.writeFileSync(path.join(output, 'bonus.json'), JSON.stringify(reports, null, 2));
  console.log(`${engine}: bonus accounting, safety, cap, lives, pause, input and ${reports.length} layouts passed`);
} finally { await browser.close(); fs.rmSync(temp, { recursive: true, force: true }); }
