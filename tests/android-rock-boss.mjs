// Physical Android Stone Jaw check: normal rAF, trusted CDP touch, safe USB preview.
// Start android-preview.cjs [artifact] and android-cdp-relay.mjs as in doc/FEATHER.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const artifact=path.resolve(process.argv[2]||path.join(root,'release/dino.html'));
const hash=createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/rock-boss'),'device');
fs.mkdirSync(output,{recursive:true});
const adb=(...args)=>execFileSync('adb',[...(process.env.DINO_ANDROID_SERIAL?['-s',process.env.DINO_ANDROID_SERIAL]:[]),...args],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(adb('get-state'),'device');
const rotation={auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation')};
const {chromium}=await import(process.env.DINO_PLAYWRIGHT?pathToFileURL(process.env.DINO_PLAYWRIGHT).href:'playwright');
const report={model:adb('shell','getprop','ro.product.model'),android:adb('shell','getprop','ro.build.version.release'),sha256:hash,
 timing:'normal rAF, no manual stepping; only encounter eligibility/pickup fixtures controlled',layouts:[],errors:[]};
let browser,page,storage,cdp;
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const shot=label=>page.screenshot({path:path.join(output,label+'.png')});
const center=async selector=>{const box=await page.locator(selector).boundingBox();assert(box,'Visible target '+selector);return{x:box.x+box.width/2,y:box.y+box.height/2};};
const down=point=>cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
const up=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
const tap=async selector=>{await down(await center(selector));await up();};
const prepare=async(mode='normal',speed=6)=>{
 await page.evaluate(({mode,speed})=>{
  const r=window.__dinoRunner,g=r.game;
  if(r.highscores.dialog.open)r.highscores.close();
  r.highscoreController.roundLeft();g.newSession();g.setMode(mode);g.beginRound();g.lives=1;g.endJump();
  r.sound.enabled=false;r.updateMusic();
  g.config={...g.config,acceleration:0};g.speed=speed;g.gameTime=4000;g.horizon.obstacles.length=0;
  g.turbo.spawnTimer=g.feather.spawnTimer=g.shield.spawnTimer=1e9;g.boss.remaining=0;
  window.__phoneBossEvents=[];
  g.capturePrevious();r.draw(1);document.getElementById('game').focus();
 },{mode,speed});
 await page.waitForFunction(()=>window.__dinoGame.boss.phase==='warning');
};
const active=()=>page.waitForFunction(()=>window.__dinoGame.boss.phase==='active');
const pass=async()=>{
 const point=await center('#touch-jump');
 await page.waitForFunction(()=>{const g=window.__dinoGame;return g.boss.rock?.x<=g.trex.x+g.speed*10;},{},{polling:'raf'});
 await down(point);await up();
 await page.waitForFunction(()=>window.__dinoGame.boss.completed||window.__dinoGame.crashed);
 const s=await state();assert.equal(s.state,'playing','Short jump must survive');assert.equal(s.boss.completed,1);
 const clear=await page.evaluate(()=>window.__phoneBossEvents.filter(e=>e.type==='bossClear'));
 assert.equal(clear.length,1);assert.equal(clear[0].clean,true,'Pass must not rely on shield');return s;
};
const frames=()=>page.evaluate(()=>new Promise(resolve=>{const deltas=[];let last;function frame(t){if(last!==undefined)deltas.push(t-last);last=t;if(deltas.length<30)requestAnimationFrame(frame);else{const sorted=[...deltas].sort((a,b)=>a-b);resolve({frames:deltas.length,median:sorted[15],p95:sorted[28],over33:deltas.filter(t=>t>33).length});}}requestAnimationFrame(frame);}));
try{
 browser=await chromium.connectOverCDP(process.env.DINO_CDP_URL||'http://127.0.0.1:9224',{noDefaults:true,timeout:20000});
 report.chrome=browser.version();page=await browser.contexts()[0].newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('**/highscores.php*',r=>r.abort());
 await page.addInitScript(()=>{window.__dinoTest={ credits: 99,highscoreApiUrl:null};});
 const response=await page.goto(process.env.DINO_ANDROID_URL||'http://127.0.0.1:8877/dino.html');
 await page.waitForFunction(()=>!!window.__dinoRunner);
 const injectedHash=await page.evaluate(()=>window.__dinoArtifactSha256);
 assert.equal(injectedHash||createHash('sha256').update(await response.body()).digest('hex'),hash,'Actual selected release is loaded');
 storage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 await page.evaluate(()=>localStorage.setItem('dino-fullscreen-disabled','true'));
 await page.reload();await page.waitForFunction(()=>!!window.__dinoRunner);
 assert.equal(await page.evaluate(()=>!!window.__dinoTest.manualFrames),false);
 assert.equal(await page.evaluate(()=>window.__dinoTest.highscoreApiUrl),null);
 cdp=await page.context().newCDPSession(page);
 await page.evaluate(()=>{
  window.__phoneTouches=[];window.__phoneBossEvents=[];
  document.addEventListener('pointerdown',e=>window.__phoneTouches.push({trusted:e.isTrusted,type:e.pointerType,target:e.target.closest('button')?.id||e.target.id}),true);
  window.__dinoGame.on(e=>{if(e.type.startsWith('boss')||e.type==='shieldPop'||e.type==='crash'||e.type==='jump'){
   const g=window.__dinoGame;window.__phoneBossEvents.push({type:e.type,clean:e.clean,obstacle:e.obstacle,x:g.boss.rock?.x,y:g.trex.y,released:g.trex.jumpReleased});}});
  const r=window.__dinoRunner;r.sound.enabled=false;r.updateMusic();
 });
 adb('shell','settings','put','system','accelerometer_rotation','0');
 for(const [layout,value]of [['portrait','0'],['landscape','1']]){
  adb('shell','settings','put','system','user_rotation',value);
  await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout==='portrait');
  const entry={layout,size:await page.evaluate(()=>[innerWidth,innerHeight]),cases:[]};report.layouts.push(entry);
  await prepare();await shot(layout+'-warning');
  entry.warningFrameSample=await frames();
  await active();await tap('#settings-open');await page.waitForFunction(()=>window.__dinoRunner.paused);
  const frozen=(await state()).boss;
  await page.waitForTimeout(250);assert.deepEqual((await state()).boss,frozen,'Settings freezes boss');
  const opposite=value==='0'?'1':'0';adb('shell','settings','put','system','user_rotation',opposite);
  await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout!=='portrait');
  assert.deepEqual((await state()).boss,frozen,'Paused rotation preserves boss');
  assert(await page.evaluate(()=>window.__dinoGame.boss.world===window.__dinoGame.world));
  adb('shell','settings','put','system','user_rotation',value);
  await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout==='portrait');
  await tap('#settings-close');await page.waitForFunction(()=>!window.__dinoRunner.paused);
  await shot(layout+'-approach');await pass();await shot(layout+'-clear');
  entry.cases.push('normal-speed short touch jump; Settings pause and paused rotation');
  console.log(layout+': normal jump/pause/rotation passed');
  for(const [mode,speed]of [['relaxed',5.3],['normal',8.5]]){
   await prepare(mode,speed);await active();await pass();await shot(layout+'-'+mode+'-'+speed+'-clear');
   entry.cases.push(mode+' speed '+speed+' clean touch passage');
  }
  await prepare();await active();
  await page.waitForFunction(()=>window.__dinoGame.crashed);
  assert.equal(await page.evaluate(()=>window.__dinoGame.crashObstacle),'rockBoss');
  const floor=(await state()).boss.rock.x;await page.waitForTimeout(150);
  assert.equal((await state()).boss.rock.x,floor,'Death freezes rock');
  await shot(layout+'-floor-hit');entry.cases.push('missed jump hits ledge; Game over and death freeze');
  await prepare();await active();
  const point=await center('#touch-jump');
  await page.waitForFunction(()=>{const g=window.__dinoGame;return g.boss.rock.x<=g.trex.x+g.speed*16;},{},{polling:'raf'});
  await down(point);
  try{await page.waitForFunction(()=>window.__dinoGame.crashed);}finally{await up();}
  assert.equal(await page.evaluate(()=>window.__dinoGame.crashObstacle),'rockBoss');
  assert((await state()).player.y<78,'Held jump hits ceiling');
  await shot(layout+'-roof-hit');entry.cases.push('held touch jump hits ceiling');
  await prepare();await active();await page.evaluate(()=>{window.__dinoGame.shield.charged=true;});
  await page.waitForFunction(()=>window.__dinoGame.boss.completed||window.__dinoGame.crashed);
  const shield=await state();assert.equal(shield.state,'playing');assert.equal(shield.shield.charged,false);
  const events=await page.evaluate(()=>window.__phoneBossEvents);
  assert.equal(events.filter(e=>e.type==='bossClear').length,1);assert.equal(events.find(e=>e.type==='bossClear').clean,false);
  assert.equal(events.filter(e=>e.type==='shieldPop').length,1);await shot(layout+'-shield-break');
  entry.cases.push('one shield charge shatters boss once');
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await page.waitForFunction(()=>window.__dinoRunner.renderer.effects.reducedMotion.matches);
  await prepare();await active();await page.evaluate(()=>{window.__dinoGame.shield.charged=true;});
  await page.waitForFunction(()=>window.__dinoGame.boss.completed);
  assert.equal((await state()).particles,0);await shot(layout+'-reduced');
  entry.cases.push('page-local reduced motion suppresses debris');
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await page.waitForFunction(()=>!window.__dinoRunner.renderer.effects.reducedMotion.matches);
  console.log(layout+': '+entry.cases.length+' physical boss scenarios passed');
 }
 report.touches=await page.evaluate(()=>window.__phoneTouches);
 assert(report.touches.length>0&&report.touches.every(t=>t.trusted&&t.type==='touch'));
 assert.deepEqual(report.errors,[]);
 report.rotationRestored=rotation;
 fs.writeFileSync(path.join(output,'android-rock-boss.json'),JSON.stringify(report,null,2));
 console.log('Physical Stone Jaw checks passed: '+report.model+', Chrome '+report.chrome);
}catch(error){
 if(page){await shot('failure').catch(()=>{});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:String(error),state:await state().catch(()=>null)},null,2));}
 throw error;
}finally{
 if(page&&storage)await page.evaluate(values=>{localStorage.clear();for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);},storage).catch(()=>{});
 await page?.close().catch(()=>{});
 for(const[key,value]of [['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])
  adb('shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));
 await browser?.close();
}
