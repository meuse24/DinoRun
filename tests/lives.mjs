// Three-life rounds, score-based 1UPs, recovery, power-ups and responsive HUD.
// Isolated offline file fixture; never uses the live highscore service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/lives'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-lives-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const browser = await pw[engine].launch({ headless: true });
const reports = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 720 }],
    ['portrait', { width: 320, height: 640 }],
    ['landscape', { width: 663, height: 234 }],
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block',
      ...(name === 'desktop' ? {} : { isMobile: true, hasTouch: true }) });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      const musicAudio = new EventTarget();
      musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
      localStorage.setItem('dino-fullscreen-disabled', 'true');
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio, transitions: false };
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!window.__dinoRunner);
    await context.setOffline(true);
    const model = await page.evaluate(() => {
      const Game = window.__dinoGame.constructor, dt = 1000 / 60;
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const fresh = (mode = 'normal', training = false) => {
        let seed = 17;
        const g = new Game({ mode, rockTraining: training, bossEnabled: false,
          random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) });
        g.beginRound(); g.endJump();
        for (let i = 0; i < 65; i++) g.update(dt);
        g.gameTime = 4000; g.horizon.obstacles.length = 0;
        g.turbo.spawnTimer = g.feather.spawnTimer = g.shield.spawnTimer = 1e9;
        return g;
      };
      const contact = (g, type = 'small', size = 1) => {
        let o;
        for (let i = 0; i < 100; i++) {
          g.horizon.obstacles.length = 0; g.horizon.addObstacle(13, 1000);
          o = g.horizon.obstacles[0]; if (o.type.name === type) break;
        }
        check(o.type.name === type, 'Real hazard type available: ' + type);
        o.size = size; o.gap = 1e9;
        o.x = g.trex.x + 12 + g.speed * g.turbo.multiplier;
        if (type === 'ptero') o.y = 156;
        g.update(dt);
      };
      const expire = g => {
        g.horizon.obstacles.length = 0;
        for (let i = 0; i < 109; i++) { g.horizon.obstacles.length = 0; g.update(dt); }
      };
      const results = [];
      for (const mode of ['normal', 'relaxed']) {
        const g = fresh(mode), events = [];
        g.on(e => { if (e.type !== 'step') events.push(e.type); });
        check(g.lives === 3, 'Three initial lives');
        const before = g.score;
        contact(g, 'large', 3);
        check(g.playing && !g.trex.dead && g.lives === 2 && g.recoveryRemaining === 1800, 'Cluster costs one life');
        check(g.score >= before && events.filter(e => e === 'crash').length === 0, 'No premature round end or score reset');
        g.shield.charged = true; contact(g, 'ptero');
        check(g.lives === 2 && g.shield.charged, 'Recovery preserves shield');
        g.shield.charged = false; expire(g);
        check(g.recoveryRemaining === 0, 'Recovery expires with simulation time');
        contact(g, 'ptero');
        check(g.playing && g.lives === 1, 'Bird costs the second life');
        expire(g); contact(g);
        check(g.crashed && g.trex.dead && g.lives === 0, 'Third hit ends the round');
        check(events.filter(e => e === 'crash').length === 1, 'Exactly one terminal event');
        g.returnToAttract(); g.beginRound();
        check(g.lives === 3 && g.nextLifeScore === 500 && g.recoveryRemaining === 0, 'New round resets lives and milestones');
        results.push(mode);
      }
      const g = fresh(), awards = [];
      g.on(e => { if (e.type === 'extraLife') awards.push(e.threshold); });
      const score = value => {
        g.horizon.obstacles.length = 0;
        g.distance = value / 0.025 - g.speed * g.turbo.multiplier + 0.0001;
        g.update(dt);
      };
      score(499); check(g.lives === 3, 'No early award');
      score(500); check(g.lives === 4 && g.nextLifeScore === 1250, 'First score crossing awards one life');
      score(500); check(g.lives === 4 && awards.length === 1, 'No repeated award at the same score');
      score(1250); check(g.lives === 5 && g.nextLifeScore === 2250, 'Second award and cap');
      score(2250); check(g.lives === 5 && g.nextLifeScore === 3500 && awards.length === 2, 'Full-cap milestone consumed');
      g.takeHit(); score(2250); check(g.lives === 4, 'No banked life after a hit');
      score(3500); check(g.lives === 5 && g.nextLifeScore === 5000, 'Growing milestone interval');
      const shield = fresh(); shield.shield.charged = true; contact(shield);
      check(shield.lives === 3 && !shield.shield.charged && shield.recoveryRemaining === 0, 'Shield takes the hit first');
      const crossing = fresh(); crossing.lives = 1;
      crossing.distance = 500 / 0.025 - crossing.speed + 0.0001;
      contact(crossing);
      check(crossing.playing && crossing.lives === 1 && crossing.nextLifeScore === 1250,
        'Milestone on the contact frame can save the final life');
      const chili = fresh(); chili.turbo.activate(chili.trex); contact(chili);
      check(chili.lives === 3, 'Chili burns cactus without spending life');
      contact(chili, 'ptero'); check(chili.lives === 2, 'Chili does not protect against birds');
      const feather = fresh(); feather.feather.charged = true; contact(feather);
      check(feather.lives === 2 && feather.feather.charged, 'Feather is preserved but gives no hit immunity');
      for (const y of [null, 10]) {
        const boss = fresh(); boss.boss.enabled = true; boss.boss.remaining = 0;
        for (let i = 0; i < 120 && !boss.boss.rock; i++) { boss.horizon.obstacles.length = 0; boss.update(dt); }
        check(!!boss.boss.rock, 'Real Stone Jaw encounter');
        boss.boss.rock.x = boss.trex.x + 10;
        if (y !== null) { boss.trex.y = y; boss.trex.jumping = true; boss.trex.velocity = 0; }
        boss.update(dt);
        check(boss.lives === 2 && boss.playing && !boss.boss.rock, 'Boss roof/floor costs one life and clears contact');
      }
      const training = fresh('normal', true);
      training.score = 10000; training.awardLives(); training.takeHit();
      check(training.lives === 3 && training.nextLifeScore === 500, 'Practice does not earn or consume round lives');
      return { modes: results, awards, hazards: ['cluster', 'bird', 'boss roof', 'boss floor'], powerUps: true, training: true };
    });
    if (name === 'desktop') await page.locator('#start-game').click();
    else await page.locator('#start-game').tap();
    await page.evaluate(() => {
      const r = window.__dinoRunner, g = r.game;
      for (let i = 0; i < 260; i++) { g.horizon.obstacles.length = 0; window.advanceTime(1000 / 60); }
      g.turbo.spawnTimer = g.feather.spawnTimer = g.shield.spawnTimer = g.boss.remaining = 1e9;
      r.draw(1);
    });
    assert.equal(await page.locator('#hud-lives').getAttribute('aria-label'), '3 of 5 lives. Next extra life at 500 points.');
    await page.screenshot({ path: path.join(output, `${name}-three-lives.png`) });
    await page.evaluate(() => { window.__dinoGame.takeHit(); window.__dinoRunner.draw(1); });
    const beforePause = await page.evaluate(() => window.__dinoGame.recoveryRemaining);
    await page.locator('#settings-open').click();
    await page.evaluate(() => { for (let i = 0; i < 120; i++) window.advanceTime(1000 / 60); });
    assert.equal(await page.evaluate(() => window.__dinoGame.recoveryRemaining), beforePause, 'Pause freezes protection');
    await page.locator('#settings-close').click();
    await page.waitForFunction(() => !window.__dinoRunner.paused);
    await page.screenshot({ path: path.join(output, `${name}-recovery.png`) });
    if (name !== 'desktop') {
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      assert.equal(await page.evaluate(() => window.__dinoGame.lives), 2, 'Rotation preserves lives');
      assert.equal(await page.evaluate(() => window.__dinoGame.recoveryRemaining), beforePause, 'Rotation preserves recovery');
      await page.setViewportSize(viewport);
      await page.locator('#touch-jump').tap();
    } else {
      await page.locator('#game').focus(); await page.keyboard.press('Space');
    }
    assert.equal(await page.evaluate(() => window.__dinoGame.trex.jumping), true, 'Jump remains responsive after a hit');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.evaluate(() => {
      const g = window.__dinoGame;
      g.distance = 500 / 0.025; window.advanceTime(34);
    });
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(state.lives, 3); assert.equal(state.nextLifeScore, 1250);
    assert.match(await page.locator('#hud-lives').getAttribute('aria-label'), /^3 of 5 lives/);
    await page.screenshot({ path: path.join(output, `${name}-extra-life-night.png`) });
    assert.deepEqual(errors, []);
    reports.push({ name, model, state });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'lives.json'), JSON.stringify(reports, null, 2));
  console.log(`${engine}: lives, milestone balance/cap, all hazards, power-ups, practice, pause and HUD passed in 3 layouts`);
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
