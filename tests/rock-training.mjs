// Debug Rock training: real switch/input, repeated encounters and score isolation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),engine=process.env.DINO_BROWSER||'chromium';
const pw=await import(process.env.DINO_PLAYWRIGHT?pathToFileURL(process.env.DINO_PLAYWRIGHT).href:'playwright');
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/rock-training'),engine);
fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'dino-training-')),file=path.join(temporary,'dino.html');
fs.copyFileSync(process.argv[2]||path.join(root,'dino.html'),file);
const browser=await pw[engine].launch({headless:true}),report=[];
try{
 for(const[name,viewport,touch,mode]of [['desktop',{width:1280,height:720},false,'normal'],['portrait',{width:390,height:844},true,'normal'],['landscape',{width:844,height:390},true,'relaxed']]){
  const context=await browser.newContext({viewport,screen:viewport,hasTouch:touch,isMobile:touch,serviceWorkers:'block'});
  await context.route(/^https?:/,r=>r.abort());const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{const musicAudio=new EventTarget();musicAudio.play=()=>Promise.resolve();musicAudio.pause=()=>{};
   window.__dinoTest={ credits: 99,manualFrames:true,transitions:false,highscoreApiUrl:null,musicAudio};
   try{localStorage.setItem('dino-fullscreen-disabled','true');localStorage.setItem('chromium-dino-highscore','7');localStorage.setItem('chromium-dino-highscore-relaxed','9');}catch{}});
  await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>!!window.__dinoRunner);
  const toggle=page.getByRole('switch',{name:'Rock training',exact:true});
  await page.locator('#settings-open').click();await page.locator('#debug-log > summary').click();
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await toggle.press('Space');assert.equal(await toggle.getAttribute('aria-checked'),'true');
  assert.equal(await page.evaluate(()=>window.__dinoGame.rockTraining),false,'applies on next run');
  await page.locator('#mode-select').selectOption(mode);
  await toggle.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,name+'-debug.png')});
  await page.locator('#settings-close').click();await page.waitForFunction(()=>!window.__dinoRunner.paused);
  await page.locator('#start-game').click();
  assert.equal(await page.evaluate(()=>window.__dinoGame.rockTraining),true);
  const speed=mode==='normal'?6:4.2,high=mode==='normal'?7:9;
  let previousSpeed=speed;
  await page.evaluate(()=>{window.__trainingRecords=[];window.__trainingResults=[];window.__trainingSounds=[];const sound=window.__dinoRunner.sound;const bossSound=sound.boss.bind(sound);sound.boss=(clear,failed,training)=>{if(clear)window.__trainingSounds.push(!failed);bossSound(clear,failed,training);};window.__dinoGame.on(e=>{if(e.type==='trainingResult')window.__trainingResults.push(e.clean);});window.__dinoGame.on(e=>{if(e.type==='record')window.__trainingRecords.push(e);});});
  const advanceTo=kind=>page.evaluate(kind=>{
   const g=window.__dinoGame;
   for(let i=0;i<1000;i++){
    const ready=kind==='warning'?g.boss.phase==='warning':kind==='jump'?g.boss.rock?.x<=g.trex.x+g.speed*8:
     kind==='crash'?g.crashed:kind==='attract'?g.state==='attract':g.boss.completed>=kind;
    if(ready)return JSON.parse(window.render_game_to_text());
    if(g.crashed&&kind!=='crash'&&kind!=='attract')throw new Error('Unexpected training collision');
    if(g.horizon.obstacles.length||g.turbo.pickup||g.feather.pickup||g.shield.pickup)throw new Error('Non-rock spawn in training');
    window.advanceTime(1000/60);
   }
   throw new Error('Training did not reach '+kind);
  },kind);
  const warning=await advanceTo('warning');assert(warning.boss.remainingMs>500&&warning.boss.remainingMs<=600);assert(warning.rockTraining);
  for(let wave=1;wave<=3;wave++){
   await advanceTo('jump');
   if(wave===1)await page.screenshot({path:path.join(output,name+'-approach.png')});
   await page.locator('#game').focus();
   if(touch)await page.locator('#touch-jump').tap();else await page.keyboard.press('Space');
   const s=await advanceTo(wave);assert.equal(s.state,'playing');assert(s.speed>previousSpeed,'training accelerates between rocks');previousSpeed=s.speed;assert.equal(s.boss.completed,wave);assert(s.boss.remainingMs<=700);
   assert.equal(await page.evaluate(()=>window.__dinoGame.highScore),high);
   if(wave===3)await page.screenshot({path:path.join(output,name+'-three-waves.png')});
  }
  assert.deepEqual(await page.evaluate(()=>window.__trainingResults),[true,true,true]);
  // Miss entirely, then hit the roof with a held jump: both must continue alive.
  await advanceTo(4);
  assert.equal(await page.evaluate(()=>window.__dinoGame.boss.result),false);
  await page.screenshot({path:path.join(output,name+'-miss.png')});
  await advanceTo('jump');await page.locator('#game').focus();await page.keyboard.down('Space');
  await advanceTo(5);await page.keyboard.up('Space');
  assert.equal(await page.evaluate(()=>window.__dinoGame.boss.result),false);
  await advanceTo('jump');await page.keyboard.press('Space');await advanceTo(6);
  assert.deepEqual(await page.evaluate(()=>window.__trainingResults),[true,true,true,false,false,true]);
  assert.deepEqual(await page.evaluate(()=>window.__trainingSounds),[true,true,true,false,false,true]);
  assert.equal(await page.evaluate(()=>window.__dinoGame.state),'playing');
  await page.screenshot({path:path.join(output,name+'-recovered.png')});
  const pace=await page.evaluate(()=>{
   const g=window.__dinoGame,before=g.speed;window.advanceTime(1000/60);
   const increment=g.speed-before;g.speed=g.config.maxSpeed-g.config.acceleration/2;
   window.advanceTime(1000/60);const capped=g.speed;
   for(let i=0;i<60;i++)window.advanceTime(1000/60);
   return {increment,expected:g.config.acceleration,capped,maximum:g.config.maxSpeed,after:g.speed};
  });
  assert(Math.abs(pace.increment-pace.expected)<1e-9,'same acceleration as regular mode');
  assert.equal(pace.capped,pace.maximum);assert.equal(pace.after,pace.maximum);

  assert.equal(await page.locator('#training-exit').isVisible(),true);
  assert.equal(await page.locator('#training-exit').textContent(),'Exit');
  if(touch)await page.locator('#training-exit').tap();else await page.locator('#training-exit').press('Enter');
  assert.equal(await page.locator('#rock-training-toggle').getAttribute('aria-checked'),'false');
  assert.equal(await page.evaluate(()=>window.__dinoGame.state),'attract','exit returns to start');
  assert.equal(await page.locator('#training-exit').isVisible(),false);
  assert.equal(await page.locator('#scores').evaluate(e=>e.open),false);
  assert.equal(await page.evaluate(()=>window.__dinoRunner.highscoreController.pendingRound),null);
  assert.equal(await page.evaluate(()=>window.__dinoRunner.highscoreController.round),null);
  assert.deepEqual(await page.evaluate(()=>window.__trainingRecords),[]);
  assert.deepEqual(await page.evaluate(()=>({games:window.__dinoRunner.stats.games,best:window.__dinoRunner.stats.best,duration:window.__dinoRunner.stats.duration})),{games:0,best:0,duration:0});
  assert.deepEqual(await page.evaluate(()=>['chromium-dino-highscore','chromium-dino-highscore-relaxed'].map(k=>localStorage.getItem(k))),['7','9']);
  await page.locator('#start-game').click();
  assert.equal(await page.evaluate(()=>window.__dinoGame.rockTraining),false);
  await page.evaluate(()=>{const g=window.__dinoGame;for(let i=0;i<300&&!g.horizon.obstacles.length;i++)window.advanceTime(1000/60);});
  assert(await page.evaluate(()=>window.__dinoGame.horizon.obstacles.length>0),'ordinary hazards return');
  await page.locator('#settings-open').click();await toggle.click();
  assert.equal(await page.evaluate(()=>window.__dinoGame.rockTraining),false,'enabling mid-run does not relabel a normal round');
  await page.reload();await page.waitForFunction(()=>!!window.__dinoRunner);
  assert.equal(await page.locator('#rock-training-toggle').getAttribute('aria-checked'),'false');assert.equal(await page.evaluate(()=>window.__dinoGame.rockTraining),false);
  if(name==='desktop'&&engine==='chromium'){
   const audio=await page.evaluate(async()=>{
    const sound=window.__dinoRunner.sound,old={context:sound.context,output:sound.output,enabled:sound.enabled,volume:sound.volume};
    const render=async(failed,muted=false)=>{
     const offline=new OfflineAudioContext(1,22050,44100);
     sound.context={state:'running',currentTime:0,createOscillator:()=>offline.createOscillator(),createGain:()=>offline.createGain()};
     sound.output=offline.createGain();sound.output.connect(offline.destination);sound.enabled=!muted;sound.volume=100;
     sound.boss(true,failed,true);
     const data=(await offline.startRendering()).getChannelData(0);
     return {energy:data.reduce((sum,v)=>sum+v*v,0),tail:data.slice(9000).reduce((sum,v)=>sum+v*v,0)};
    };
    try{return {ok:await render(false),fail:await render(true),muted:await render(false,true)};}
    finally{Object.assign(sound,old);}
   });
   assert(audio.ok.energy>0.01&&audio.fail.energy>0.01,'Both feedback tones generate audio');
   assert.notEqual(audio.ok.energy,audio.fail.energy,'Distinct success/failure tones');
   assert.equal(audio.ok.tail+audio.fail.tail,0,'Feedback ends within 205ms');
   assert.equal(audio.muted.energy,0,'Feedback respects mute');
  }
  assert.deepEqual(errors,[]);report.push({name,mode,speed,waves:6,highscoresUntouched:true,roundBoundary:true,reloadReset:true,errors});
  await context.close();console.log(name+': six training waves, switch, increasing pace, records and normal return passed');
 }
}finally{await browser.close();assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temporary,{recursive:true,force:true});}
fs.writeFileSync(path.join(output,'rock-training.json'),JSON.stringify(report,null,2));
console.log(engine+': rock training passed in '+report.length+' layouts');
