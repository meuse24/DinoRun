// Actual standalone game: rock-boss trajectories, safety/lifecycle and trusted input.
// Usage: node tests/rock-boss.mjs [game.html]; DINO_BROWSER=chromium|webkit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'), engine=process.env.DINO_BROWSER||'chromium';
const pw=await import(process.env.DINO_PLAYWRIGHT?pathToFileURL(process.env.DINO_PLAYWRIGHT).href:'playwright');
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/rock-boss'),engine);
fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'dino-boss-'));
const file=path.join(temporary,'dino.html');fs.copyFileSync(process.argv[2]||path.join(root,'dino.html'),file);
const report={checks:[],trajectories:[],layouts:[]};
const browser=await pw[engine].launch({headless:true});
const check=async(name,fn)=>{const result=await fn();report.checks.push(name);console.log('ok - '+name);return result;};
const step=(page,frames=1)=>page.evaluate(frames=>{for(let i=0;i<frames;i++)window.advanceTime(1000/60);},frames);
try{
 const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
 await context.route(/^https?:/,r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  const musicAudio=new EventTarget();musicAudio.play=()=>Promise.resolve();musicAudio.pause=()=>{};
  window.__dinoTest={ credits: 99,manualFrames:true,transitions:false,highscoreApiUrl:null,musicAudio};
  try{localStorage.setItem('dino-fullscreen-disabled','true');}catch{}
 });
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>!!window.__dinoRunner);
 await page.evaluate(()=>{
  const Game=window.__dinoGame.constructor,dt=1000/60;
  window.__bossFixture={
   game(mode='normal',speed=6,width=600){
    const g=new Game({mode,width,random:()=>0.5,cosmeticRandom:()=>0.5});
    g.beginRound();g.lives=1;g.endJump(); /* Final-life geometry regressions. */for(let i=0;i<60;i++)g.update(dt);
    g.config={...g.config,acceleration:0};g.speed=speed;g.gameTime=4000;
    g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=1e9;
    g.horizon.obstacles.length=0;g.boss.remaining=0;
    return g;
   },
   active(mode='normal',speed=6,width=600){
    const g=this.game(mode,speed,width);g.update(dt);
    for(let i=0;i<110&&g.boss.phase==='warning';i++)g.update(dt);
    if(g.boss.phase!=='active')throw new Error('Boss never entered: '+g.boss.phase);
    g.boss.rock.x=240;g.boss.rock.prevX=240;
    return g;
   },
   trial(mode,speed,delay,hold=0){
    const g=this.active(mode,speed);let hitY=null;
    for(let frame=0;frame<160&&!g.crashed&&!g.boss.completed;frame++){
     if(frame===delay)g.jump();if(frame===delay+hold)g.endJump();g.update(dt);
     if(g.crashed)hitY=g.trex.y;
    }
    return {passed:g.boss.completed===1,hitY};
   },
  };
 });
 report.trajectories=await check('short-jump timing windows across both modes and all approach speeds',async()=>{
  const matrix=await page.evaluate(()=>[['normal',6],['normal',8.5],['normal',13],['relaxed',4.2],['relaxed',6],['relaxed',9]].map(([mode,speed])=>{
   const delays=[];for(let delay=0;delay<70;delay++)if(window.__bossFixture.trial(mode,speed,delay).passed)delays.push(delay);
   return {mode,speed,delays,windowMs:delays.length*1000/60};
  }));
  for(const row of matrix)assert(row.delays.length>=4,JSON.stringify(row));
  return matrix;
 });
 await check('floor and roof kill, the middle is genuinely open, Chili cannot burn stone',async()=>{
  const result=await page.evaluate(()=>{
   const f=window.__bossFixture,dt=1000/60;
   const contact=(y,turbo=false)=>{const g=f.active();g.boss.rock.x=g.trex.x+10;
    if(y!==null){g.trex.y=y;g.trex.jumping=true;g.trex.velocity=0;}
    if(turbo)g.turbo.activate(g.trex);g.update(dt);
    return {crashed:g.crashed,kind:g.crashObstacle};};
   return {floor:contact(null),roof:contact(10),opening:contact(90),chili:contact(null,true)};
  });
  assert.deepEqual(result,{floor:{crashed:true,kind:'rockBoss'},roof:{crashed:true,kind:'rockBoss'},
   opening:{crashed:false,kind:null},chili:{crashed:true,kind:'rockBoss'}});
 });
 await check('shield shatters once; clean passage preserves shield and score rules',async()=>{
  const delay=report.trajectories.find(r=>r.mode==='normal'&&r.speed===6).delays;
  const result=await page.evaluate(delay=>{
   const f=window.__bossFixture,dt=1000/60,g=f.active(),events=[];
   g.on(e=>{if(e.type!=='step')events.push(e);});g.shield.charged=true;g.turbo.activate(g.trex);
   g.boss.rock.x=g.trex.x+10;g.update(dt);for(let i=0;i<10;i++)g.update(dt);
   const h=f.active();h.shield.charged=true;
   for(let frame=0;frame<100&&!h.boss.completed&&!h.crashed;frame++){
    if(frame===delay){h.jump();h.endJump();}h.update(dt);
   }
   return {alive:g.playing,shield:g.shield.charged,completed:g.boss.completed,rock:g.boss.rock,
    clear:events.filter(e=>e.type==='bossClear').map(e=>e.clean),pop:events.filter(e=>e.type==='shieldPop').length,
    destroyed:events.some(e=>e.type==='destroy'),clean:h.playing&&h.boss.completed===1&&h.shield.charged,
    score:h.score,expected:Math.floor(h.distance*0.025)};
  },delay[Math.floor(delay.length/2)]);
  assert.deepEqual(result,{alive:true,shield:false,completed:1,rock:null,clear:[false],pop:1,destroyed:false,
   clean:true,score:result.expected,expected:result.expected});
 });
 await check('corridor drains, all pickup spawns wait, warning is unique and Chili must expire',async()=>{
  const result=await page.evaluate(()=>{
   const g=window.__bossFixture.game(),dt=1000/60,events=[];g.on(e=>events.push(e.type));
   g.horizon.addObstacle(6,0);const obstacle=g.horizon.obstacles[0];obstacle.gap=0;
   g.turbo.pickup={x:350,y:160};g.feather.spawnTimer=g.shield.spawnTimer=0;
   const oldX=g.turbo.pickup.x;g.update(dt);
   const draining=g.boss.phase==='clearing'&&g.horizon.obstacles.length===1&&g.turbo.pickup.x<oldX&&!g.feather.pickup&&!g.shield.pickup;
   g.horizon.obstacles.length=0;g.turbo.pickup=null;g.turbo.remaining=500;g.update(dt);
   const waiting=g.boss.phase==='clearing';g.turbo.remaining=0;g.trex.x=50;g.trex.ducking=true;g.update(dt);
   const cannotStall=g.boss.phase==='warning';g.trex.ducking=false;
   g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=0;
   const warning=g.boss.phase==='warning';for(let i=0;i<107;i++)g.update(dt);
   const warnedLongEnough=g.boss.phase==='warning';g.update(dt);g.update(dt);
   return {draining,waiting,cannotStall,warning,warnedLongEnough,active:g.boss.phase==='active',
    isolated:!g.horizon.obstacles.length&&!g.turbo.pickup&&!g.feather.pickup&&!g.shield.pickup,
    warnings:events.filter(e=>e==='bossWarning').length};
  });
  assert.deepEqual(result,{draining:true,waiting:true,cannotStall:true,warning:true,warnedLongEnough:true,active:true,isolated:true,warnings:1});
 });
 await check('first schedule excludes start grace; reset, death freeze, cooldown, resize and attract isolation',async()=>{
  const result=await page.evaluate(()=>{
   const f=window.__bossFixture,dt=1000/60,g=f.game();
   g.boss.reset();g.gameTime=0;const initial=g.boss.remaining;
   for(let i=0;i<179;i++)g.update(dt);
   const grace=g.boss.remaining===initial;
   g.gameTime=4000;g.horizon.obstacles.length=0;g.trex.ducking=true;
   for(let i=0;i<2159;i++){g.horizon.obstacles.length=0;g.update(dt);}
   const notEarly=g.boss.phase==='idle';g.horizon.obstacles.length=0;g.update(dt);
   const onSchedule=g.boss.phase==='warning';
   const h=f.active(),x=h.boss.rock.x;h.resize(420);
   const shared=h.boss.world===h.world&&h.boss.rock.x===x&&h.boss.world.width===420;
   h.gameOver(h.boss.rock);const frozen=h.boss.rock.x;for(let i=0;i<20;i++)h.update(dt);
   const deathFrozen=h.boss.rock.x===frozen;
   h.newSession();const reset=h.boss.phase==='idle'&&h.boss.remaining===initial&&!h.boss.rock&&!h.boss.completed;
   const b=f.active();b.boss.finish();for(let i=0;i<84;i++)b.update(dt);
   const cooldown=b.boss.phase==='idle'&&b.boss.remaining>44000;
   const feather=f.active();feather.feather.charged=true;feather.jump();feather.update(dt);feather.jump();
   const rescue=feather.trex.jumping&&!feather.feather.charged;
   return {grace,notEarly,onSchedule,shared,deathFrozen,reset,cooldown,rescue,
    demoDisabled:!window.__dinoRunner.attract.demo.boss.enabled&&!window.__dinoRunner.attract.backdrop.boss.enabled};
  });
  assert.deepEqual(result,{grace:true,notEarly:true,onSchedule:true,shared:true,deathFrozen:true,reset:true,cooldown:true,rescue:true,demoDisabled:true});
 });
 assert.deepEqual(errors,[]);await context.close();
 const delays=report.trajectories.find(r=>r.mode==='normal'&&r.speed===6).delays;
 const jumpDelay=delays[Math.floor(delays.length/2)];
 for(const [name,viewport,touch] of [['desktop',{width:1280,height:720},false],['portrait',{width:390,height:844},true],['landscape',{width:844,height:390},true]]){
  await check(name+': real input, passage, pause/resume, reduced motion and offline render',async()=>{
   const c=await browser.newContext({viewport,screen:viewport,hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
   await c.route(/^https?:/,r=>r.abort());const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await p.addInitScript(()=>{const musicAudio=new EventTarget();musicAudio.play=()=>Promise.resolve();musicAudio.pause=()=>{};
    window.__dinoTest={ credits: 99,manualFrames:true,transitions:false,highscoreApiUrl:null,musicAudio};
    try{localStorage.setItem('dino-fullscreen-disabled','true');}catch{}});
   await p.goto(pathToFileURL(file).href);await p.waitForFunction(()=>!!window.__dinoRunner);await c.setOffline(true);
   await p.evaluate(()=>{
    const r=window.__dinoRunner,g=r.game;r.sound.enabled=false;r.highscoreController.roundLeft();
    g.newSession();g.beginRound();g.lives=1;g.endJump(); /* Final-life geometry regressions. */for(let i=0;i<60;i++)window.advanceTime(1000/60);
    g.gameTime=4000;g.config={...g.config,acceleration:0};g.speed=6;g.horizon.obstacles.length=0;
    g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=1e9;g.boss.remaining=0;
    window.advanceTime(1000/60);g.capturePrevious();r.draw(1);
   });
   assert.equal(await p.evaluate(()=>window.__dinoGame.boss.phase),'warning');
   await p.screenshot({path:path.join(output,name+'-warning.png')});
   const before=await p.evaluate(()=>window.__dinoGame.boss.remaining);
   await p.locator('#settings-open').click();await step(p,6);
   assert.equal(await p.evaluate(()=>window.__dinoGame.boss.remaining),before,'settings pause freezes warning');
   await p.locator('#settings-close').click();await p.waitForFunction(()=>!window.__dinoRunner.paused);await step(p,110);
   assert.equal(await p.evaluate(()=>window.__dinoGame.boss.phase),'active');
   await p.evaluate(()=>{const g=window.__dinoGame;g.boss.rock.x=240;g.capturePrevious();window.__dinoRunner.draw(1);document.getElementById('game').focus();});
   await p.screenshot({path:path.join(output,name+'-approach.png')});
   const rockX=await p.evaluate(()=>window.__dinoGame.boss.rock.x);
   await p.locator('#settings-open').click();await step(p,6);
   assert.equal(await p.evaluate(()=>window.__dinoGame.boss.rock.x),rockX,'settings pause freezes active boss');
   await p.locator('#settings-close').click();await p.waitForFunction(()=>!window.__dinoRunner.paused);
   if(touch){
    await p.setViewportSize({width:viewport.height,height:viewport.width});
    assert.equal(await p.evaluate(()=>window.__dinoGame.boss.rock.x),rockX,'rotation preserves encounter');
    assert(await p.evaluate(()=>window.__dinoGame.boss.world===window.__dinoGame.world));
    await p.setViewportSize(viewport);
   }
   await p.locator('#game').focus();
   await step(p,jumpDelay);
   if(touch)await p.locator('#touch-jump').tap();else await p.keyboard.press('Space');
   let captured=false;
   for(let i=0;i<80;i++){
    await step(p);
    const s=await p.evaluate(()=>JSON.parse(window.render_game_to_text()));
    if(!captured&&s.boss.rock&&s.boss.rock.x<s.player.x+15){await p.screenshot({path:path.join(output,name+'-passage.png')});captured=true;}
    if(s.boss.completed||s.state==='crashed')break;
   }
   const s=await p.evaluate(()=>JSON.parse(window.render_game_to_text()));
   assert.equal(s.state,'playing');assert.equal(s.boss.completed,1);assert(captured);
   await p.screenshot({path:path.join(output,name+'-clear.png')});
   await p.emulateMedia({reducedMotion:'reduce'});
   await p.waitForFunction(()=>window.__dinoRunner.renderer.effects.reducedMotion.matches);
   await p.evaluate(()=>{const g=window.__dinoGame;g.boss.phase='clearing';g.horizon.obstacles.length=0;g.turbo.pickup=g.feather.pickup=g.shield.pickup=null;});
   await step(p,160);
   assert.equal(await p.evaluate(()=>window.__dinoGame.boss.phase),'active');
   await p.screenshot({path:path.join(output,name+'-reduced.png')});
   assert.equal(await p.evaluate(()=>window.__dinoRunner.renderer.effects.reducedMotion.matches),true);
   assert.equal(await p.evaluate(()=>window.__dinoRunner.renderer.effects.particles.length),0,'reduced motion suppresses debris');
   assert.deepEqual(errors,[]);report.layouts.push({name,viewport,touch,passage:true,paused:true,reducedMotion:true});await c.close();
  });
 }
}finally{await browser.close();assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temporary,{recursive:true,force:true});}
fs.writeFileSync(path.join(output,'rock-boss.json'),JSON.stringify(report,null,2));
console.log(engine+': '+report.checks.length+' boss checks passed');
