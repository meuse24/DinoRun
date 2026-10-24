// Standalone, no live API. Optional source/release artifact and browser engine.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const engine = process.env.DINO_BROWSER || 'chromium';
const pw = await import(process.env.DINO_PLAYWRIGHT ? pathToFileURL(process.env.DINO_PLAYWRIGHT).href : 'playwright');
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/glow-berry'), engine);
fs.mkdirSync(output, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-berry-'));
const file = path.join(temp, 'dino.html');
fs.copyFileSync(process.argv[2] || path.join(root, 'dino.html'), file);
const browser = await pw[engine].launch({ headless: true });
const report = [];
try {
  for (const [name, width, height, touch] of [
    ['desktop',1280,720,false], ['portrait',390,844,true], ['landscape',844,390,true],
    ['compact-landscape',663,234,true], ['small-portrait',320,568,true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, screen: { width, height },
      hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 3 : 1, serviceWorkers: 'block' });
    await context.route(/^https?:/, r => r.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
      const audio = new EventTarget(); audio.pause = () => {}; audio.play = () => Promise.resolve();
      window.__dinoTest = { credits: 99, manualFrames: true, highscoreApiUrl: null, transitions: false, musicAudio: audio };
      localStorage.setItem('dino-fullscreen-disabled', 'true');
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => !!window.__dinoRunner);
    await page.evaluate(() => document.fonts.ready);
    const simulation = await page.evaluate(() => {
      const check = (ok, why) => { if (!ok) throw Error(why); };
      const Game = window.__dinoGame.constructor, dt = 1000/60;
      const make = (options = {}) => {
        let seed = 987;
        const g = new Game({ random: () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),
          cosmeticRandom: () => 0.5, bossEnabled: false, bonusEnabled: false, ...options });
        g.beginRound(0); g.endJump(); g.trex.reset(); g.gameTime = 4000;
        return g;
      };
      const windows = [];
      for (const mode of ['normal','relaxed']) for (const speed of [mode === 'normal' ? 6 : 4.2, mode === 'normal' ? 13 : 9]) {
        for (const multiplier of [1,1.18]) {
          let hits = 0;
          for (let lead = 0; lead < 70; lead++) {
            const g = make({ mode }); g.speed = speed;
            const travel = speed * multiplier;
            Object.assign(g.berry.item, { x: g.trex.x + 22 + lead*travel, prevX: 0, y: 108, age: 300 });
            g.berry.pickup = g.berry.item;
            g.jump(); g.endJump();
            for (let frame=0; frame<70; frame++) {
              g.trex.update(dt, true);
              if (g.berry.update(dt,g,travel)) { hits++; break; }
            }
          }
          check(hits >= 6, `short jump window ${mode}/${speed}/${multiplier}: ${hits}`);
          windows.push({mode,speed,multiplier,hits});
        }
      }
      for (const duck of [false,true]) {
        const g = make(); g.duck(duck);
        Object.assign(g.berry.item,{x:g.trex.x+22,y:108,age:300});g.berry.pickup=g.berry.item;
        check(!g.berry.update(dt,g,13*1.18),'standing/ducking cannot collect');
      }
      // A berry centered over a cactus must share a real SAFE short jump, not
      // merely intersect the dino before a later collision. Exercise real boxes.
      const cactusWindows=[];
      for(const speed of[4.2,6,9,13])for(const type of['small','large']) {
        if(speed<6&&type==='large')continue; // This unsafe combination is never spawned.
        let best=0,consecutive=0;
        for(let lead=0;lead<65;lead++) {
          const c=make({width:900});c.config={...c.config,acceleration:0};c.speed=speed;
          c.horizon.obstacles.length=0;
          for(let attempt=0;attempt<100;attempt++) {
            c.horizon.obstacles.length=0;c.horizon.addObstacle(speed,500);
            if(c.horizon.obstacles[0].type.name===type)break;
          }
          const o=c.horizon.obstacles[0];check(o.type.name===type,'fixture cactus type');
          o.size=speed>=8?(type==='large'?2:3):1;o.x=c.trex.x+44+lead*speed;o.gap=1e9;
          c.turbo.spawnTimer=c.feather.spawnTimer=c.shield.spawnTimer=1e9;
          Object.assign(c.berry.item,{x:o.x+o.width*o.size/2,y:108,age:300});c.berry.pickup=c.berry.item;
          c.jump();c.endJump();
          for(let frame=0;frame<55;frame++) {
            c.advance(dt);
            if(!c.trex.jumping && frame>5)break;
          }
          if(c.berries===1&&c.lives===3)consecutive++;else consecutive=0;
          best=Math.max(best,consecutive);
        }
        check(best>=6,`safe cactus short-jump window ${type}/${speed}: ${best}`);
        cactusWindows.push({speed,type,best});
      }
      const g = make({ width: 900 });
      g.horizon.obstacles.length=0;
      g.horizon.addObstacle(13,500);
      const last = g.horizon.obstacles[0];last.x=0;last.gap=3000;
      g.berry.spawnTimer=dt*2;
      g.berry.update(dt,g,6);check(!g.berry.pickup,'minimum timer');
      g.berry.update(dt,g,6);check(g.berry.pickup===g.berry.item,'spawn reuses item');
      const identity=g.berry.pickup;
      for(let i=0;i<4;i++)g.berry.update(dt,g,6);
      check(g.berry.pickup===identity,'one pickup');
      const xBeforeResize=g.berry.pickup.x,timerBeforeResize=g.berry.spawnTimer;
      g.resize(420);check(g.berry.pickup===identity&&g.berry.pickup.x===xBeforeResize&&g.berry.spawnTimer===timerBeforeResize,'resize keeps live pickup');
      g.resize(900);
      g.berry.pickup.x=-30;g.berry.update(dt,g,6);
      check(!g.berry.pickup && g.berry.spawnTimer>=18000 && g.berry.spawnTimer<=26000,'miss cooldown');
      const timer=g.berry.spawnTimer;g.takeHit(null);check(g.berry.spawnTimer===timer,'life keeps timer');
      for (const blocked of ['boss','bonus','training']) {
        const b=make({width:900}); b.berry.spawnTimer=0;
        if(blocked==='boss')b.boss.phase='warning';
        if(blocked==='bonus')b.pendingBonus={total:0};
        if(blocked==='training')b.boss.training=true;
        b.berry.update(dt,b,6);check(!b.berry.pickup,blocked+' blocks');
      }
      g.pendingBonus={total:0};g.berry.pickup=g.berry.item;g.berry.update(dt,g,6);
      check(!g.berry.pickup,'pending bonus dismisses existing berry');
      g.beginRound(0);check(g.berry.spawnTimer===12000 && !g.berry.pickup && g.berries===0 && g.berryScore===0,'round reset');

      // Identical standing pilots never collect: optional berry must not consume
      // RNG, suppress later hazards or change any other pickup schedule.
      const a=make({width:900}), b=make({width:900,berryEnabled:false});
      let spawns=0, wasVisible=false;
      for(let i=0;i<18000;i++) {
        a.recoveryRemaining=b.recoveryRemaining=1e9;
        a.advance(dt);b.advance(dt);
        check(a.horizon.rng.next===a.rng.next,'shared RNG unchanged');
        check(a.horizon.obstacles.length===b.horizon.obstacles.length,'obstacle count');
        for(let j=0;j<a.horizon.obstacles.length;j++) {
          const x=a.horizon.obstacles[j],y=b.horizon.obstacles[j];
          check(x.x===y.x && x.gap===y.gap && x.type.name===y.type.name && x.size===y.size,'bitwise obstacle sequence');
        }
        for(const kind of ['turbo','feather','shield'])
          check(a[kind].pickup?.x===b[kind].pickup?.x,'unchanged '+kind);
        if(a.berry.pickup && !wasVisible) {
          spawns++;
          const p=a.berry.pickup, o=a.horizon.obstacles.at(-1);
          if(p.placement==='gap') {
            check(p.x-o.x-o.width*o.size>=a.speed*25+24,'separate landing before berry');
            check(o.x+o.width*o.size+Math.min(o.gap,a.world.width+10)-p.x>=a.speed*30+68,'actual next obstacle gate');
          } else {
            check(o.type.name!=='ptero' && p.x===o.x+o.width*o.size/2,'existing cactus jump');
          }
        }
        wasVisible=!!a.berry.pickup;
      }
      check(spawns>0,'natural gaps must produce berries in a five-minute round');
      const natural=[];
      for(const width of[420,600])for(const mode of['normal','relaxed']) {
        const n=make({width,mode,bossEnabled:true,bonusEnabled:true});let count=0,visible=false;
        for(let frame=0;frame<7200;frame++) {
          n.recoveryRemaining=1e9;n.advance(dt);
          if(n.berry.pickup&&!visible)count++;
          visible=!!n.berry.pickup;
        }
        check(count>0,`real bonus/boss scheduling must allow berries: ${width}/${mode}`);
        natural.push({width,mode,count});
      }
      return {windows,cactusWindows,spawns,natural};
    });
    // Real Runner integration, responsive rendering and points/life/stat event.
    await page.evaluate(() => {
      const g=window.__dinoGame,r=window.__dinoRunner;
      r.highscoreController.roundLeft();g.newSession();g.beginRound(0);g.trex.reset();g.gameTime=14000;
      g.horizon.obstacles.length=0;
      g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=1e9;
      g.boss.remaining=1e9;g.bonusEnabled=false;
      g.berry.pickup=g.berry.item;Object.assign(g.berry.item,{x:g.trex.x+160,prevX:g.trex.x+160,y:108,age:300});
      g.capturePrevious();r.draw(1);
    });
    await page.screenshot({path:path.join(output,`${name}-day.png`)});
    await page.evaluate(()=>{
      const g=window.__dinoGame;g.horizon.addObstacle(6,0);
      const o=g.horizon.obstacles[0];o.x=g.berry.pickup.x-o.width*o.size/2;
      g.capturePrevious();window.__dinoRunner.draw(1);
    });
    await page.screenshot({path:path.join(output,`${name}-cactus.png`)});
    await page.evaluate(()=>{window.__dinoGame.horizon.obstacles.length=0;});
    await page.evaluate(()=>{window.__dinoGame.nightAlpha=1;window.__dinoRunner.draw(1);});
    await page.screenshot({path:path.join(output,`${name}-night.png`)});
    await page.evaluate(()=>{window.__dinoGame.nightAlpha=.5;window.__dinoRunner.draw(1);});
    await page.screenshot({path:path.join(output,`${name}-twilight.png`)});
    // Actual keyboard/touch starts a jump, then align only the pickup to contact.
    if(touch)await page.locator('#touch-jump').tap();else await page.keyboard.press('Space');
    await page.evaluate(()=>{
      const g=window.__dinoGame;
      for(let i=0;i<7;i++)window.advanceTime(1000/60);
      g.distance=0;g.bonusScore=0;g.berryScore=0;g.nextLifeScore=25;g.lives=2;
      g.berry.item.x=g.trex.x+22;g.berry.item.prevX=g.berry.item.x;
      window.advanceTime(1000/60);
    });
    const collected=await page.evaluate(()=>({state:JSON.parse(window.render_game_to_text()),
      stats:window.__dinoRunner.stats.berries,callout:window.__dinoRunner.renderer.effects.callouts.some(c=>c.text==='+25')}));
    assert.equal(collected.state.berry.count,1);assert.equal(collected.state.berry.score,25);
    assert.equal(collected.state.berry.pickup,null);assert.equal(collected.state.lives,3);
    assert.equal(collected.stats,1);assert(collected.callout);
    await page.evaluate(()=>{for(let i=0;i<5;i++)window.advanceTime(1000/60);});
    assert.equal(await page.evaluate(()=>window.__dinoGame.berryScore),25,'no duplicate or overwritten points');
    await page.screenshot({path:path.join(output,`${name}-collected.png`)});
    await page.evaluate(()=>{
      const r=window.__dinoRunner,g=r.game;
      r.effectsSetting.set(false,false);r.renderer.effects.callout('+25',g.trex.x+22,100,'berry');
      g.berry.pickup=g.berry.item;Object.assign(g.berry.item,{x:230,prevX:230,age:300});r.draw(1);
    });
    await page.screenshot({path:path.join(output,`${name}-effects-off.png`)});
    const cache=await page.evaluate(()=>{
      const r=window.__dinoRunner,c=r.renderer.ctx,sprites=r.renderer.berrySprites();
      const draw=c.drawImage.bind(c);let draws=0;
      c.drawImage=(...args)=>{draws++;return draw(...args);};r.renderer.drawBerry();c.drawImage=draw;
      const stable=r.renderer.berrySprites()===sprites;
      r.game.trex.reducedMotion.matches=true;r.renderer.effects.reducedMotion.matches=true;
      r.effectsSetting.set(true,false);r.draw(1);
      return{draws,stable,body:[sprites.body.width,sprites.body.height],aura:[sprites.aura.width,sprites.aura.height]};
    });
    assert.equal(cache.draws,1,'effects off only draws the berry');assert(cache.stable,'bounded sprite cache');
    assert(Math.max(...cache.body,...cache.aura)<=132,'bounded backing size');
    await page.screenshot({path:path.join(output,`${name}-reduced-motion.png`)});
    const timers=await page.evaluate(()=>{
      const r=window.__dinoRunner; document.getElementById('settings').showModal();r.updatePause();
      const before=r.game.berry.spawnTimer;for(let i=0;i<60;i++)r.update(1000/60);
      const after=r.game.berry.spawnTimer;document.getElementById('settings').close();r.updatePause();return{before,after};
    });
    assert.equal(timers.before,timers.after);
    await page.evaluate(()=>{
      const r=window.__dinoRunner;r.game.returnToAttract();r.effectsSetting.set(true,false);
      r.attract.select(2);r.draw(1);
    });
    await page.screenshot({path:path.join(output,`${name}-preview.png`)});
    assert.equal(await page.locator('.attract-powerup').count(),4);
    const layout=await page.evaluate(()=>{
      const slide=document.getElementById('attract-powerups').getBoundingClientRect(),
        hint=document.getElementById('landscape-hint').getBoundingClientRect();
      return{bottom:slide.bottom,hint:hint.top,portrait:innerHeight>=innerWidth};
    });
    if(layout.portrait)assert(layout.bottom+4<=layout.hint,`${name}: cards fit above footer`);
    assert.match(await page.locator('#info-view').getAttribute('srcdoc') || '', /Glow berry/);
    assert.deepEqual(errors,[]);
    report.push({name,...simulation});await context.close();
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(`Glow berry: ${report.length} layouts, physics, RNG, points and lifecycle passed (${engine})`);
} finally {await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
