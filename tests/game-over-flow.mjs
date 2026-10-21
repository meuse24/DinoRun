// Desktop/emulated or physical Android round-end flow; no live score service.
// node tests/game-over-flow.mjs [game.html] [--android]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const physical=process.argv.includes('--android');
const artifact=path.resolve(process.argv.slice(2).find(arg=>arg!=='--android')||path.join(root,'dino.html'));
const html=fs.readFileSync(artifact,'utf8'), hash=createHash('sha256').update(html).digest('hex');
const engine=physical?'chromium':process.env.DINO_BROWSER||'chromium';
const variant=artifact.includes(path.sep+'release'+path.sep)?'release':'source';
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/game-over'),
  physical?'device':`${engine}-${variant}`);
fs.mkdirSync(output,{recursive:true});
const pw=await import(process.env.DINO_PLAYWRIGHT?pathToFileURL(process.env.DINO_PLAYWRIGHT).href:'playwright');
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',windowsHide:true}).trim();
const server=physical?null:http.createServer((request,response)=>{
  if(new URL(request.url,'http://localhost').pathname==='/dino.html'){
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);
  }else response.writeHead(204).end();
});
if(server)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=physical?(process.env.DINO_ANDROID_URL||'http://127.0.0.1:8877/dino.html'):
  `http://127.0.0.1:${server.address().port}/dino.html`;
const rotation=physical?{auto:adb('shell','settings','get','system','accelerometer_rotation'),
  user:adb('shell','settings','get','system','user_rotation')}:null;
const reports=[], errors=[];
let browser,page,originalStorage;
try{
  if(physical){
    assert.equal(adb('get-state'),'device');
    browser=await pw.chromium.connectOverCDP(process.env.DINO_CDP_URL||'http://127.0.0.1:9224',{noDefaults:true,timeout:20000});
    page=await browser.contexts()[0].newPage();
    adb('shell','settings','put','system','accelerometer_rotation','0');
  }else browser=await pw[engine].launch({headless:true});
  const layouts=physical?[['portrait','0'],['landscape','1']]:[
    ['desktop',{width:1280,height:720}],['portrait',{width:320,height:640}],['landscape',{width:663,height:234}]];
  for(const [layout,viewport] of layouts){
    const context=physical?page.context():await browser.newContext({viewport,serviceWorkers:'block',
      ...(layout==='desktop'?{}:{isMobile:true,hasTouch:true})});
    if(!physical)page=await context.newPage();
    await page.addInitScript(({physical})=>{
      let musicAudio;
      if(!physical){
        localStorage.setItem('dino-fullscreen-disabled','true');
        musicAudio=new EventTarget();musicAudio.play=()=>Promise.resolve();musicAudio.pause=()=>{};
      }
      window.__dinoTest={ credits: 99,manualFrames:!physical,highscoreApiUrl:null,musicAudio};
    },{physical});
    await page.route('**/highscores.php*',route=>route.abort());
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    if(physical){
      adb('shell','settings','put','system','user_rotation',viewport);
      await page.bringToFront();
    }
    // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
    await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
    const response=await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>!!window.__dinoRunner);
    if(physical){
      if(process.env.DINO_ANDROID_URL)assert.equal(createHash('sha256').update(await response.body()).digest('hex'),hash);
      else assert.equal(await page.evaluate(()=>window.__dinoArtifactSha256),hash);
      if(!originalStorage)originalStorage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
      await page.waitForFunction(portrait=>(innerHeight>innerWidth)===portrait,layout==='portrait');
    }
    await page.evaluate(physical=>{
      // This fixture origin's original storage is restored after physical checks.
      localStorage.clear();
      localStorage.setItem('dino-fullscreen-disabled','true');
      if(physical)window.__dinoRunner.newSession();
      window.__dinoRunner.game.on(e=>{
        if(e.type==='step' && !window.__contact)window.__dinoGame.horizon.obstacles.length=0;
      });
      window.__touches=[];
      document.addEventListener('pointerdown',e=>window.__touches.push({trusted:e.isTrusted,type:e.pointerType}),true);
    },physical);
    const cdp=physical?await context.newCDPSession(page):null;
    const click=async selector=>{
      const locator=page.locator(selector).first();
      if(!physical){await locator.click();return;}
      const box=await locator.boundingBox();assert(box,'Visible touch target '+selector);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const advance=async ms=>{
      if(physical){await page.waitForTimeout(ms);return;}
      await page.evaluate(ms=>{
        for(let t=0;t<ms;t+=1000/60)window.advanceTime(Math.min(1000/60,ms-t));
      },ms);
    };
    const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
    const start=async()=>{
      await click('#start-game');
      if(!physical)await advance(4000);
      await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown&&!window.__dinoGame.trex.jumping);
      assert.equal(await page.locator('#quit-game').isVisible(),false);
    };
    const crash=async(score,late=false)=>{
      await page.evaluate(({score,late})=>{
        const r=window.__dinoRunner,g=r.game,c=r.highscoreController;
        if(late){
          c.store.local=()=>Array.from({length:10},()=>({score:100}));
          c.store.cachedOnline=()=>null;c.online.normal={state:'idle'};
          c.api.list=()=>new Promise(resolve=>{window.__qualify=resolve;});
          g.recordAtStart=100;
        }
        g.lives=1; // Exercise the terminal collision, not a surviving hit.
        g.score=score;g.distance=score/0.025;g.gameTime=4000;g.trex.reset();g.turbo.reset();g.shield.reset();
        g.horizon.obstacles.length=0;
        for(let i=0;i<100;i++){
          g.horizon.obstacles.length=0;g.horizon.addObstacle(g.speed,1000);
          if(g.horizon.obstacles[0].type.name==='small')break;
        }
        const o=g.horizon.obstacles[0];o.x=g.trex.x+12+g.speed;o.gap=1e9;
        window.__contact=true;g.capturePrevious();
      },{score,late});
      if(!physical)await advance(100);
      await page.waitForFunction(()=>window.__dinoGame.crashed);
      await page.evaluate(()=>{window.__contact=false;window.__dinoRunner.draw(1);});
      assert.equal(await page.locator('#game-over-overlay').isVisible(),true);
      assert.equal(await page.locator('#round-panel').isVisible(),false);
      assert.equal(await page.locator('#result-view').count(),0);
      assert.equal(await page.locator('#play-again').count(),0);
    };
    const finish=async()=>{if(!physical)await advance(2700);};
    const attract=()=>page.waitForFunction(()=>window.__dinoGame.state==='attract'&&!window.__dinoRunner.paused);
    assert.equal(await page.locator('#quit-game').isVisible(),true);
    await page.screenshot({path:path.join(output,layout+'-attract.png')});
    await start();await crash(0);
    await page.screenshot({path:path.join(output,layout+'-overlay.png')});
    if(physical)await click('#game');else await page.keyboard.press('Space');
    assert.equal((await state()).state,'crashed','Input cannot skip or restart the overlay');
    await click('#settings-open');
    const deathTime=(await state()).deathTimeMs;
    await advance(350);assert.equal((await state()).deathTimeMs,deathTime,'Settings freezes the death scene');
    await click('#settings-close');await page.waitForFunction(()=>!window.__dinoRunner.paused);
    await finish();await attract();
    assert.equal(await page.locator('#scores').evaluate(d=>d.open),false);
    assert.equal(await page.evaluate(()=>window.__dinoRunner.stats.deaths),1);
    await start();await crash(12);await finish();
    await page.waitForFunction(()=>document.getElementById('scores').open);
    assert.equal(await page.locator('#game-over-overlay').isVisible(),false);
    await page.screenshot({path:path.join(output,layout+'-name.png')});
    await page.evaluate(()=>{
      const r=window.__dinoRunner;r.highscores.letters=[...'AAAA'];r.highscores.renderLetters();
      r.highscoreController.api.submit=async()=>{throw {kind:'name',needsNewName:true};};
    });
    await click('#name-picker button');await click('#entry-save');
    await page.waitForFunction(()=>document.getElementById('entry-message').textContent.includes('another name'));
    assert.equal((await state()).state,'crashed');
    await page.evaluate(()=>{window.__dinoRunner.highscoreController.api.submit=async()=>{throw {kind:'offline'};};});
    await click('#entry-save');await attract();
    assert.equal(await page.evaluate(()=>window.__dinoRunner.highscoreController.store.local('normal')[0].score),12);
    assert.equal(await page.evaluate(()=>window.__dinoRunner.stats.deaths),2);
    await start();await crash(13);await finish();
    await page.waitForFunction(()=>document.getElementById('scores').open);
    if(physical)await click('#entry-cancel');else await page.keyboard.press('Escape');
    await attract();
    await start();await crash(12,true);await finish();
    if(physical)await page.waitForFunction(()=>!window.__dinoGame.inDeathScene);
    assert.equal((await state()).state,'crashed');
    assert.equal(await page.locator('#scores').evaluate(d=>d.open),false);
    await page.evaluate(()=>window.__qualify({entries:[]}));
    await page.waitForFunction(()=>document.getElementById('scores').open);
    await click('#entry-cancel');await attract();
    await start();await crash(12,true);await finish();
    if(physical)await page.waitForFunction(()=>!window.__dinoGame.inDeathScene);
    await page.evaluate(()=>window.__qualify({entries:Array.from({length:10},()=>({score:100}))}));
    await advance(50);await attract();
    assert.equal(await page.locator('#scores').evaluate(d=>d.open),false,'Nonqualifying online result returns without name entry');
    assert.equal(await page.evaluate(()=>window.__dinoRunner.stats.deaths),5);
    await page.screenshot({path:path.join(output,layout+'-returned.png')});
    await click('#quit-game');await page.waitForFunction(()=>document.getElementById('goodbye').open);
    assert.equal(await page.evaluate(()=>window.__dinoRunner.stats.deaths),5);
    await page.screenshot({path:path.join(output,layout+'-off.png')});
    await click('#new-session');await attract();
    assert.equal(await page.evaluate(()=>window.__dinoRunner.stats.deaths),0);
    const touches=await page.evaluate(()=>window.__touches);
    if(physical)assert(touches.length>10&&touches.every(t=>t.trusted&&t.type==='touch'));
    reports.push({layout,size:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),
      zeroScore:'passed',invalidThenSavedName:'passed',cancel:'passed',lateQualification:'passed',nonqualification:'passed',
      statsAndOff:'passed',trustedTouches:touches.length});
    if(!physical)await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({artifact,hash,physical,engine,
    browser:browser.version(),model:physical?adb('shell','getprop','ro.product.model'):null,
    timing:physical?'normal rAF; real collision with controlled obstacle':'manual frames',reports,errors,liveScores:false},null,2));
  console.log(`${physical?'Physical Android':engine}: round-end overlay, save/cancel, late qualification and Off passed in ${reports.length} layouts`);
}catch(error){
  if(page&&!page.isClosed()){
    await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:String(error),
      state:await page.evaluate(()=>JSON.parse(window.render_game_to_text())).catch(()=>null)},null,2));
  }
  throw error;
}finally{
  if(physical){
    if(page&&originalStorage)await page.evaluate(values=>{
      localStorage.clear();for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);
    },originalStorage).catch(()=>{});
    for(const [key,value] of [['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])
      adb('shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));
    await page?.close();
  }
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
}
