import { loadPlaywright } from './helpers/playwright.mjs';
// Real-rAF, trusted-touch berry checks. Own origin/tab/bridges; no live scores.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const pw=await loadPlaywright();
const serial=process.env.DINO_ANDROID_SERIAL||'RF8MB125SXA';
const adb=(...args)=>execFileSync(path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe'),['-s',serial,...args],{encoding:'utf8',windowsHide:true}).trim();
assert(!adb('shell','dumpsys','window').includes('mDreamingLockscreen=true'),'Unlock phone and open Chrome');
const output=path.resolve(process.env.DINO_TEST_OUTPUT||path.join(root,'output/glow-berry/device'));
fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(path.resolve(root,process.argv[2]||'dino.html'));
const port=8886,relayPort=9240,origin=`http://127.0.0.1:${port}`;
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(new URL(req.url,origin).pathname==='/dino.html')res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
  else res.writeHead(204).end();
});
const settings={auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation')};
const report={model:adb('shell','getprop','ro.product.model'),hash:createHash('sha256').update(html).digest('hex'),settings,runs:[],recaps:[],sky:[],errors:[]};
let browser,page,relay,forward,reverse=false,storage;
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  assert(!adb('reverse','--list').includes(`tcp:${port}`),'Fixture port already in use');
  adb('reverse',`tcp:${port}`,`tcp:${port}`);reverse=true;
  forward=adb('forward','tcp:0','localabstract:chrome_devtools_remote');
  relay=spawn(process.execPath,[path.join(root,'tests/android-cdp-relay.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,DINO_CDP_UPSTREAM:`http://127.0.0.1:${forward}`,DINO_CDP_RELAY_PORT:String(relayPort)}});
  await new Promise((resolve,reject)=>{relay.stdout.on('data',d=>{if(String(d).includes('ready'))resolve();});relay.stderr.on('data',d=>reject(Error(String(d))));relay.on('exit',c=>reject(Error('Relay exited '+c)));});
  browser=await pw.chromium.connectOverCDP(`http://127.0.0.1:${relayPort}`,{noDefaults:true});
  page=await browser.contexts()[0].newPage();await page.bringToFront();
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.addInitScript(()=>{
    window.__originOriginal=JSON.stringify(Object.entries(localStorage));
    const audio=new EventTarget();audio.pause=()=>{};audio.play=()=>Promise.resolve();
    window.__dinoTest={credits:99,highscoreApiUrl:null,musicAudio:audio,transitions:false};
    localStorage.setItem('dino-fullscreen-disabled','true');localStorage.setItem('dino-sound-muted','false');
    navigator.serviceWorker.register=()=>Promise.reject(Error('Isolated berry fixture'));
    window.__touches=[];addEventListener('pointerdown',e=>window.__touches.push({trusted:e.isTrusted,target:e.target.closest?.('button')?.id||e.target.id}),true);
  });
  const cdp=await page.context().newCDPSession(page);
  const touch=async selector=>{
    const b=await page.locator(selector).boundingBox();assert(b,selector);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  adb('shell','settings','put','system','accelerometer_rotation','0');
  await page.goto(`${origin}/dino.html`);await page.waitForFunction(()=>!!window.__dinoRunner);
  storage=await page.evaluate(()=>window.__originOriginal);
  await touch('#start-game');await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown);
  for(const [name,rotation]of[['portrait','0'],['landscape','1'],['reverse-landscape','3']]){
    adb('shell','settings','put','system','user_rotation',rotation);
    await page.waitForFunction(p=>(innerHeight>innerWidth)===p,rotation==='0');
    for(const effects of[true,false]){
      await page.evaluate(effects=>{
        const r=window.__dinoRunner,g=r.game;
        r.effectsSetting.set(effects,false);g.beginRound(0);g.trex.reset();g.gameTime=14000;
        g.bonusEnabled=false;g.boss.enabled=false;g.horizon.obstacles.length=0;
        g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=g.berry.spawnTimer=Infinity;
        g.berry.pickup=g.berry.item;Object.assign(g.berry.item,{x:g.world.width+1000,prevX:g.world.width+1000,y:108,age:300});
        r.sound.updateSteps=()=>{};window.__berrySounds=0;
        window.__berrySound??=r.sound.berry.bind(r.sound);
        r.sound.berry=()=>{window.__berrySounds++;window.__berrySound();};
        const off=g.on(e=>{if(e.type==='step'&&g.trex.jumping&&g.trex.y<118){g.berry.item.x=g.trex.x+22;g.berry.item.prevX=g.berry.item.x;off();}});
      },effects);
      await touch('#touch-jump');
      await page.waitForFunction(()=>window.__dinoGame.berries===1);
      const state=await page.evaluate(()=>({state:JSON.parse(window.render_game_to_text()),sounds:window.__berrySounds,
        trusted:window.__touches.some(t=>t.trusted&&t.target==='touch-jump')}));
      assert.equal(state.state.berry.score,25);assert.equal(state.sounds,1);assert(state.trusted);
      await page.screenshot({path:path.join(output,`${name}-${effects?'on':'off'}-collect.png`)});
      await touch('#settings-open');await page.waitForFunction(()=>window.__dinoRunner.paused);
      const before=await page.evaluate(()=>window.__dinoGame.berry.spawnTimer);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>window.__dinoGame.berry.spawnTimer),before);
      await touch('#settings-close');await page.waitForFunction(()=>!window.__dinoRunner.paused);
      report.runs.push({name,effects,score:state.state.berry.score,trusted:state.trusted,sounds:state.sounds});
    }
    // Normal-rAF tally, real cached berry flights and pause, without re-paying.
    await page.evaluate(()=>{
      const r=window.__dinoRunner,g=r.game;
      r.effectsSetting.set(true,false);g.beginRound(0);g.trex.reset();g.gameTime=60000;
      g.horizon.obstacles.length=0;g.horizon.addObstacle=()=>{};
      g.turbo.pickup=g.feather.pickup=g.shield.pickup=g.berry.pickup=null;
      g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=g.berry.spawnTimer=Infinity;
      g.boss.enabled=false;g.bonusEnabled=true;g.speed=g.config.speed+1;
      g.distance=499/.025;g.berries=2;g.berryScore=50;g.section.berries=2;g.section.cleared=8;g.refreshScore();
      window.__berryFlightDraws=0;
      const ctx=r.renderer.ctx;
      window.__berryBaseDraw??=ctx.drawImage;
      ctx.drawImage=function(image,...args){
        if(g.bonus&&image===r.renderer.berryCache?.body)window.__berryFlightDraws++;
        return window.__berryBaseDraw.call(this,image,...args);
      };
      g.queueBonus();g.beginBonusIfSafe();r.draw(1);
    });
    await page.waitForFunction(()=>window.__dinoGame.bonus?.elapsed>=500);
    await page.screenshot({path:path.join(output,`${name}-berry-recap.png`)});
    await touch('#settings-open');await page.waitForFunction(()=>window.__dinoRunner.paused);
    const tallyTime=await page.evaluate(()=>window.__dinoGame.bonus?.elapsed);
    assert(tallyTime!==undefined,'Paused during real tally');await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.__dinoGame.bonus?.elapsed),tallyTime);
    await touch('#settings-close');await page.waitForFunction(()=>!window.__dinoRunner.paused);
    await page.waitForFunction(()=>!window.__dinoGame.bonus);
    const recap=await page.evaluate(()=>({berryScore:window.__dinoGame.berryScore,
      bonusScore:window.__dinoGame.bonusScore,draws:window.__berryFlightDraws}));
    assert.equal(recap.berryScore,50);assert.equal(recap.bonusScore,13);assert(recap.draws>0);
    report.recaps.push({name,...recap});
    // Match both sky phases, then verify the originally reported name dialog.
    for(const night of[false,true]){
      const sky=await page.evaluate(night=>{
        const r=window.__dinoRunner,g=r.game;
        g.nightAlpha=r.renderer.darkQuery.matches!==night?1:0;g.night=g.nightAlpha>.5;
        r.draw(1);return getComputedStyle(document.body).backgroundColor;
      },night);
      assert.equal(sky,night?'rgb(16, 27, 66)':'rgb(143, 211, 255)');
      report.sky.push({name,night,background:sky});
    }
    await page.evaluate(()=>{
      const r=window.__dinoRunner,g=r.game;
      g.nightAlpha=r.renderer.darkQuery.matches?1:0;g.night=g.nightAlpha>.5;
      g.score=946;g.gameOver();
      r.highscoreController.round={score:946,mode:'normal'};r.highscoreController.saved=false;
      r.highscores.openEntry();r.draw(1);
    });
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(143, 211, 255)');
    await page.screenshot({path:path.join(output,`${name}-day-name.png`)});
    await touch('#entry-cancel');
  }
  assert.deepEqual(report.errors,[]);console.log(`Physical ${report.model}: six trusted collections, three berry tallies, sky phases and day name dialogs passed`);
}finally{
  if(page&&storage)await page.evaluate(data=>{localStorage.clear();for(const[k,v]of JSON.parse(data))localStorage.setItem(k,v);},storage).catch(()=>{});
  await page?.close().catch(()=>{});await browser?.close().catch(()=>{});relay?.kill();
  for(const[k,v]of[['user_rotation',settings.user],['accelerometer_rotation',settings.auto]])adb('shell','settings',v==='null'?'delete':'put','system',k,...(v==='null'?[]:[v]));
  if(forward)adb('forward','--remove',`tcp:${forward}`);if(reverse)adb('reverse','--remove',`tcp:${port}`);
  server.closeAllConnections();await new Promise(r=>server.close(r));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
