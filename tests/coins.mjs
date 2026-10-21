// Arcade credits: real button input, all start paths, persistence, cap and sound DSP.
// Offline file only; no payment service or live score requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT
  ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/coins'), engine);
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-coins-'));
const file = path.join(temporary, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const browser = await pw[engine].launch({ headless: true });
const reports = [];
try {
  const layouts = [
    ['desktop', 1280, 720], ['full-hd', 1920, 1080], ['tablet', 1024, 768],
    ['wide-short', 1920, 500], ['portrait', 390, 844], ['small-portrait', 320, 568],
    ['landscape', 844, 390], ['compact-landscape', 663, 234], ['wide-phone', 844, 234],
  ];
  for (const [name, width, height] of layouts) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block',
      ...(touch ? { isMobile: true, hasTouch: true } : {}) });
    await context.route(/^https?:/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      localStorage.setItem('dino-fullscreen-disabled', 'true');
      const musicAudio = new EventTarget();
      musicAudio.play = () => Promise.resolve(); musicAudio.pause = () => {};
      window.__dinoTest = { manualFrames: true, highscoreApiUrl: null, musicAudio };
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!window.__dinoRunner);
    await page.evaluate(() => window.__dinoTest.transitionDone());
    await context.setOffline(true);
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const tap = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    const target = async selector => {
      const visible = await page.locator(selector).evaluate(button => {
        const r = button.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height,
          fits: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          hit: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      assert(visible.fits && visible.hit && visible.height >= 44, `${name}: accessible ${selector}: ${JSON.stringify(visible)}`);
      return visible;
    };
    assert.equal((await state()).credits, 0);
    assert.equal(await page.locator('#start-game').isVisible(), false);
    const emptyTarget = await target('#insert-coin');
    assert(emptyTarget.height >= 60 && emptyTarget.width >= 180, 'Empty wallet gets a large primary coin action');
    await page.screenshot({ path: path.join(output, `${name}-insert-coin.png`) });
    // Keyboard, canvas input, controller and coordinator commands cannot start free.
    await page.locator('#game').focus();
    for (const key of ['Space', 'ArrowUp', 'Enter']) await page.keyboard.press(key);
    await page.locator('#game').scrollIntoViewIfNeeded();
    const canvasPoint = await page.locator('#game').evaluate(game => {
      const r = game.getBoundingClientRect();
      for (let y = Math.max(2, r.top + 2); y < Math.min(innerHeight, r.bottom) - 2; y += 8)
        for (let x = Math.max(2, r.left + 2); x < Math.min(innerWidth, r.right) - 2; x += 8)
          if (document.elementFromPoint(x, y)?.closest('#game')) return { x: x - r.left, y: y - r.top };
      return null;
    });
    assert(canvasPoint, 'An unobstructed piece of the game surface is available');
    if (touch) await page.locator('#game').tap({ position: canvasPoint });
    else await page.locator('#game').click({ position: canvasPoint });
    const denied = await page.evaluate(() => {
      const r = window.__dinoRunner;
      const old = r.gamepad.getGamepads;
      const pad = { index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 10 }, () => ({ pressed: false })) };
      r.gamepad.getGamepads = () => [pad];
      r.gamepad.requireRelease = false; r.gamepad.poll();
      pad.buttons[0].pressed = true; r.gamepad.poll();
      pad.buttons[0].pressed = false; r.gamepad.poll(); r.gamepad.getGamepads = old;
      return [r.start(), r.restart(), r.game.state, r.credits.balance];
    });
    assert.deepEqual(denied, [false, false, 'attract', 0]);
    await page.evaluate(() => {
      const sound = window.__dinoRunner.sound, original = sound.coin.bind(sound);
      window.__coinCalls = 0;
      sound.coin = () => { window.__coinCalls++; original(); };
    });
    await tap('#insert-coin');
    const coinNames = await page.locator('#coin-controls').evaluate(el => el.getAnimations({ subtree: true }).map(a => a.animationName));
    assert.equal((await state()).credits, 1);
    assert.equal((await state()).state, 'attract', 'Coin never auto-starts');
    assert.equal(await page.evaluate(() => window.__coinCalls), 1, 'One coin sound per activation');
    assert(await page.locator('#insert-coin svg').evaluate(icon => icon.getAnimations().length > 0), 'Coin responds visually');
    const startTarget = await target('#start-game');
    for (const key of ['x', 'y', 'width', 'height'])
      assert(Math.abs(startTarget[key] - emptyTarget[key]) <= 1, 'START replaces the primary coin target at the same position: ' + JSON.stringify({ name, emptyTarget, startTarget }));
    await page.screenshot({ path: path.join(output, `${name}-credited.png`) });
    if (name === 'desktop') {
      assert(coinNames.includes('motion-coin-count') && coinNames.includes('motion-coin-flip'), 'Counter and coin have event feedback: ' + JSON.stringify(coinNames));
      await page.evaluate(() => window.__dinoTest.transitionDone());
      await tap('#attract-pause');
      assert.equal(await page.locator('#insert-coin > span').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
      await tap('#attract-pause');
      await page.evaluate(() => window.__dinoRunner.effectsSetting.set(false, false));
      assert.equal(await page.locator('#insert-coin svg').evaluate(el => el.getAnimations().length), 0, 'Effects switch gates coin motion');
      assert.equal(await page.locator('#coin-count').evaluate(el => getComputedStyle(el).fontFamily.includes('Dino Pixel')), true);
      await page.evaluate(() => window.__dinoRunner.effectsSetting.set(true, false));
    }
    // Native keyboard activation adds exactly one more coin.
    await page.locator('#insert-coin').focus(); await page.keyboard.press('Enter');
    assert.equal((await state()).credits, 2);
    assert.equal(await page.evaluate(() => window.__coinCalls), 2);
    assert.deepEqual(await target('#start-game'), startTarget, 'Adding credits never moves START');
    // Windows WebKit cannot reload file:// while its offline flag is set.
    // HTTP is still blocked by the route above during this local-file navigation.
    if (engine === 'webkit') await context.setOffline(false);
    await page.reload(); await page.waitForFunction(() => !!window.__dinoRunner);
    if (engine === 'webkit') await context.setOffline(true);
    assert.equal((await state()).credits, 2, 'Per-tab credits survive reload');
    await tap('#start-game');
    assert.equal((await state()).state, 'playing');
    assert.equal((await state()).credits, 1);
    assert.equal((await state()).lives, 3, 'A credit buys the complete three-life round');
    const play = await page.evaluate(() => {
      const r = window.__dinoRunner;
      const inserted = r.insertCoin();
      r.startFromInput(); r.startFromInput();
      return { inserted, credits: r.credits.balance };
    });
    assert.deepEqual(play, { inserted: false, credits: 1 }, 'Jumps and held start inputs never spend again');
    const finish = () => page.evaluate(() => {
      const r = window.__dinoRunner;
      r.game.score = 0; r.game.gameOver(); r.game.trex.deathTime = 10000;
      r.highscoreController.roundLeft(); r.returnToAttract();
    });
    await finish();
    assert.equal(await page.locator('#start-game').isVisible(), true);
    await page.locator('#start-game').focus(); await page.keyboard.press('Enter');
    assert.equal((await state()).credits, 0);
    assert.equal(await page.locator('#start-game').isVisible(), false, 'Last credit hides START immediately');
    await finish();
    assert.equal(await page.locator('#start-game').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'insert-coin', 'Zero-credit return focuses visible action');
    await page.locator('#game').focus(); await page.keyboard.press('Space');
    assert.equal((await state()).state, 'attract');
    // Stored cap/invalid data and denied storage use the same model as the UI.
    const wallet = await page.evaluate(() => {
      const Wallet = window.__dinoRunner.credits.constructor;
      const capped = new Wallet({ get: () => '99', set: () => {} });
      const full = capped.insert(); capped.spend(); capped.insert();
      const invalid = new Wallet({ get: () => 'not-a-number', set: () => {} });
      const denied = new Wallet({ get: () => { throw Error('blocked'); }, set: () => { throw Error('blocked'); } });
      denied.insert(); const spent = denied.spend();
      return { cap: capped.balance, full, invalid: invalid.balance, empty: invalid.spend(), denied: denied.balance, spent };
    });
    assert.deepEqual(wallet, { cap: 99, full: false, invalid: 0, empty: false, denied: 0, spent: true });
    // Debug "Reset coins" clears the saved per-tab credits and hides START again.
    await tap('#insert-coin'); await tap('#insert-coin');
    assert.equal((await state()).credits, 2);
    await tap('#settings-open');
    await page.evaluate(() => window.__dinoTest.transitionDone());
    await tap('#debug-log > summary');
    await tap('#reset-coins');
    assert.equal((await state()).credits, 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('dino-credits')), '0');
    assert.equal(await page.locator('#coin-count').textContent(), '00');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__dinoTest.transitionDone());
    assert.equal(await page.locator('#start-game').isVisible(), false, 'Reset credits hide START');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.evaluate(() => window.__dinoRunner.draw(1));
    await tap('#insert-coin');
    assert.equal(await page.locator('#insert-coin svg').evaluate(icon => icon.getAnimations().length), 0);
    await page.screenshot({ path: path.join(output, `${name}-night-coin.png`) });
    let audio;
    if (name === 'desktop' && engine === 'chromium') {
      audio = await page.evaluate(async () => {
        const sound = window.__dinoRunner.sound;
        const saved = { context: sound.context, output: sound.output, enabled: sound.enabled, volume: sound.volume };
        const render = async (volume, enabled = true) => {
          const offline = new OfflineAudioContext(1, 26460, 44100);
          sound.context = { state: 'running', currentTime: 0,
            createOscillator: () => offline.createOscillator(), createGain: () => offline.createGain() };
          sound.output = offline.createGain(); sound.output.gain.value = volume / 100; sound.output.connect(offline.destination);
          sound.enabled = enabled; sound.volume = volume; sound.coin();
          const data = (await offline.startRendering()).getChannelData(0);
          return { energy: data.reduce((sum, v) => sum + v * v, 0), peak: data.reduce((max, v) => Math.max(max, Math.abs(v)), 0),
            tail: data.slice(22050).reduce((sum, v) => sum + v * v, 0) };
        };
        try { return { full: await render(100), quarter: await render(25), muted: await render(100, false), zero: await render(0) }; }
        finally { Object.assign(sound, saved); }
      });
      assert(audio.full.energy > 0.01 && audio.full.peak < 0.95, 'Coin renders audible, unclipped audio');
      assert(audio.full.tail < 1e-9, 'Coin ring ends within half a second');
      assert(Math.abs(audio.quarter.energy / audio.full.energy - 0.0625) < 0.001, 'Effects slider scales the actual audio');
      assert.equal(audio.muted.energy, 0); assert.equal(audio.zero.energy, 0);
      fs.writeFileSync(path.join(output, 'coin-audio.json'), JSON.stringify(audio, null, 2));
    }
    await page.evaluate(() => { const r = window.__dinoRunner; r.credits.balance = 98; r.sessionView.updateCredits(98); });
    await tap('#insert-coin');
    assert.equal(await page.locator('#coin-count').textContent(), '99');
    assert.equal(await page.locator('#insert-coin').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__dinoRunner.insertCoin()), false, 'Full cabinet never rings or adds more coins');
    assert.deepEqual(errors, []);
    reports.push({ name, startTarget, wallet, audio });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'coins.json'), JSON.stringify(reports, null, 2));
  console.log(`${engine}: coin input, start gating, persistence, consumption, cap, focus and ${engine === 'chromium' ? 'audio DSP' : 'audio lifecycle'} passed in ${reports.length} layouts`);
} finally {
  await browser.close(); fs.rmSync(temporary, { recursive: true, force: true });
}
