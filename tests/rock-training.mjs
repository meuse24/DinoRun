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
   window.__dinoTest={manualFrames:true,transitions:false,highscoreApiUrl:null,musicAudio};
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
  await page.evaluate(()=>{window.__trainingRecords=[];window.__dinoGame.on(e=>{if(e.type==='record')window.__trainingRecords.push(e);});});
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
  const warning=await advanceTo('warning');assert(warning.boss.remainingMs>1700);assert(warning.rockTraining);
  for(let wave=1;wave<=3;wave++){
   await advanceTo('jump');
   if(wave===1)await page.screenshot({path:path.join(output,name+'-approach.png')});
   await page.locator('#game').focus();
   if(touch)await page.locator('#touch-jump').tap();else await page.keyboard.press('Space');
   const s=await advanceTo(wave);assert.equal(s.state,'playing');assert.equal(s.speed,speed);assert.equal(s.boss.completed,wave);
   assert.equal(await page.evaluate(()=>window.__dinoGame.highScore),high);
   if(wave===3)await page.screenshot({path:path.join(output,name+'-three-waves.png')});
  }
  await page.locator('#settings-open').click();await toggle.click();
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  assert.equal(await page.evaluate(()=>window.__dinoGame.rockTraining),true,'current training run stays isolated');
  await page.locator('#settings-close').click();await page.waitForFunction(()=>!window.__dinoRunner.paused);
  await advanceTo('crash');
  await page.evaluate(()=>{for(let i=0;i<12;i++)window.advanceTime(1000/60);});
  assert.match(await page.locator('#round-feedback').textContent(),/Rock training/);
  await page.screenshot({path:path.join(output,name+'-result.png')});
  await advanceTo('attract');
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
  assert.deepEqual(errors,[]);report.push({name,mode,speed,waves:3,highscoresUntouched:true,roundBoundary:true,reloadReset:true,errors});
  await context.close();console.log(name+': three training waves, switch, fixed pace, records and normal return passed');
 }
}finally{await browser.close();assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temporary,{recursive:true,force:true});}
fs.writeFileSync(path.join(output,'rock-training.json'),JSON.stringify(report,null,2));
console.log(engine+': rock training passed in '+report.length+' layouts');
