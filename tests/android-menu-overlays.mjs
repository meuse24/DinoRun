import { loadPlaywright } from './helpers/playwright.mjs';
// Physical Android, normal rAF and trusted touch; isolated origin and own tab.
// Requires scoped CDP relay (doc/FEATHER.md). No live highscore requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const artifact=path.resolve(process.argv[2]||path.join(root,'release/dino.html'));
const html=fs.readFileSync(artifact),hash=createHash('sha256').update(html).digest('hex');
const port=Number(process.env.DINO_ANDROID_OVERLAY_PORT||8881),url=`http://127.0.0.1:${port}/dino.html`;
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/menu-overlays'),'device');
fs.mkdirSync(output,{recursive:true});
const adb=(...args)=>execFileSync('adb',[...(process.env.DINO_ANDROID_SERIAL?['-s',process.env.DINO_ANDROID_SERIAL]:[]),...args],
  {encoding:'utf8',windowsHide:true}).trim();
assert.equal(adb('get-state'),'device');
const rotation={auto:adb('shell','settings','get','system','accelerometer_rotation'),
  user:adb('shell','settings','get','system','user_rotation')};
const pw=await loadPlaywright();
const assets=new Set(['assets/images/icon-192.png','assets/images/icon-512.png','assets/images/icon-180.png','manifest.webmanifest',
  'assets/audio/dino-jump-jump.mp3','assets/audio/dino-boom-in-the-dunes.mp3']);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,url).pathname.slice(1);res.setHeader('Cache-Control','no-store');
  if(name==='dino.html')res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
  else if(name==='fixture')res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Overlay fixture</title>');
  else if(assets.has(name)&&fs.existsSync(path.join(root,name))){
    res.writeHead(200,{'Content-Type':name.endsWith('.mp3')?'audio/mpeg':name.endsWith('.png')?'image/png':'application/manifest+json'});
    fs.createReadStream(path.join(root,name)).pipe(res);
  }else res.writeHead(204).end();
});
const report={artifact,hash,model:adb('shell','getprop','ro.product.model'),
  android:adb('shell','getprop','ro.build.version.release'),layouts:[],errors:[]};
let browser,page,storage,ownReverse=false;
try{
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  assert(!adb('reverse','--list').includes(`tcp:${port}`),'Fixture port must have no existing USB bridge');
  adb('reverse',`tcp:${port}`,`tcp:${port}`);ownReverse=true;
  browser=await pw.chromium.connectOverCDP(process.env.DINO_CDP_URL||'http://127.0.0.1:9224',{noDefaults:true,timeout:20000});
  report.chrome=browser.version();page=await browser.contexts()[0].newPage();await page.bringToFront();
  await page.goto(`http://127.0.0.1:${port}/fixture`);
  storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  await page.evaluate(()=>localStorage.setItem('dino-fullscreen-disabled','true'));
  await page.addInitScript(()=>{
    window.__dinoTest={highscoreApiUrl:null,credits:99};
    if(navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.reject(Error('Physical overlay fixture'));
    window.__overlayTouches=[];
    document.addEventListener('pointerdown',e=>window.__overlayTouches.push({trusted:e.isTrusted,type:e.pointerType}),true);
  });
  await page.route('**/highscores.php*',route=>route.abort());
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  const cdp=await page.context().newCDPSession(page);
  const touch=async(selector,frame=false)=>{
    const locator=frame?page.frameLocator('#info-view').locator(selector).first():page.locator(selector).first();
    await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();assert(box,'Visible target '+selector);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const settle=()=>page.evaluate(()=>window.__dinoTest.transitionDone());
  const rotate=async value=>{
    adb('shell','settings','put','system','user_rotation',value);
    await page.waitForFunction(portrait=>(innerHeight>innerWidth)===portrait,value==='0');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await settle();
  };
  const check=async selector=>{
    await page.waitForFunction(id=>document.querySelector(id).open,selector);await settle();
    const box=await page.locator(selector).evaluate(d=>{
      const b=d.getBoundingClientRect();return {modal:d.matches(':modal'),x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:innerWidth,h:innerHeight};
    });
    assert(box.modal&&box.x>=15&&box.y>=15&&box.right<=box.w-15&&box.bottom<=box.h-15,JSON.stringify(box));
    assert.equal(await page.locator('#page').isVisible(),true);
    const before=await page.evaluate(()=>window.__dinoGame.distance);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.__dinoGame.distance),before,'Real-rAF gameplay stays paused behind overlay');
    return box;
  };
  adb('shell','settings','put','system','accelerometer_rotation','0');
  const response=await page.goto(url,{waitUntil:'load'});
  assert.equal(createHash('sha256').update(await response.body()).digest('hex'),hash);
  await page.waitForFunction(()=>!!window.__dinoRunner);
  await page.evaluate(()=>window.__dinoGame.on(e=>{if(e.type==='step')window.__dinoGame.horizon.obstacles.length=0;}));
  await rotate('0');
  await touch('#start-game');await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown);
  for(const fullscreen of [false,true]){
    if(fullscreen){
      await touch('#settings-open');await settle();await touch('#fullscreen-toggle');
      await page.waitForFunction(()=>!!document.fullscreenElement);await settle();await touch('#settings-close');
      await page.waitForFunction(()=>!window.__dinoRunner.paused);
    }
    for(const [name,value] of [['portrait','0'],['landscape','1'],['reverse-landscape','3']]){
      await rotate(value);const label=(fullscreen?'fullscreen-':'browser-')+name;
      await touch('#settings-open');const settings=await check('#settings');
      await page.screenshot({path:path.join(output,label+'-settings.png')});
      const prior=await page.locator('#effects-toggle').getAttribute('aria-checked');
      await touch('#effects-toggle');
      assert.notEqual(await page.locator('#effects-toggle').getAttribute('aria-checked'),prior);
      await touch('#effects-toggle');
      await page.locator('#log-toggle').scrollIntoViewIfNeeded();
      await touch('#settings-close');await page.waitForFunction(()=>!window.__dinoRunner.paused);
      await touch('#info-link');const help=await check('#help-dialog');
      await page.screenshot({path:path.join(output,label+'-help.png')});
      await page.frameLocator('#info-view').locator('#about-version').scrollIntoViewIfNeeded();
      await touch('[data-help-back]',true);await page.waitForFunction(()=>location.hash!=='#info'&&!window.__dinoRunner.paused);await settle();
      await page.waitForFunction(()=>!window.__dinoGame.trex.jumping);
      await touch('#touch-jump');
      await page.waitForFunction(()=>window.__dinoGame.trex.jumping);
      report.layouts.push({label,settings,help,touchControls:'passed',resumeJump:'passed'});
    }
  }
  // Rotate while each overlay stays open, preserving paused gameplay and content.
  for(const [button,dialog] of [['#settings-open','#settings'],['#info-link','#help-dialog']]){
    await touch(button);await check(dialog);await rotate('0');await check(dialog);await rotate('1');await check(dialog);
    if(dialog==='#settings')await touch('#settings-close');else await touch('[data-help-back]',true);
    await page.waitForFunction(()=>!window.__dinoRunner.paused);await settle();
  }
  // New highscore overlay on the same physical device; cancel and local save.
  report.names=[];
  for(const [name,value] of [['portrait','0'],['landscape','1']]){
    await rotate(value);
    await page.evaluate(()=>{const g=window.__dinoGame;g.recordAtStart=0;g.score=12;g.gameOver();});
    const geometry=await check('#scores');
    await page.screenshot({path:path.join(output,name+'-name.png')});
    await touch('#name-picker button');
    await touch(name==='portrait'?'#entry-cancel':'#entry-save');
    await page.waitForFunction(()=>window.__dinoGame.state==='attract'&&!window.__dinoRunner.paused);await settle();
    report.names.push({name,geometry,action:name==='portrait'?'cancel':'local save'});
    if(name==='portrait'){await touch('#start-game');await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown);}
  }
  report.touches=await page.evaluate(()=>window.__overlayTouches);
  assert(report.touches.length>30&&report.touches.every(t=>t.trusted&&t.type==='touch'));
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){
  report.failure=String(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;
}finally{
  if(page&&storage)await page.evaluate(values=>{
    for(const [store,valuesForStore] of [[localStorage,values.local],[sessionStorage,values.session]]){
      store.clear();for(const [key,value] of Object.entries(valuesForStore))store.setItem(key,value);
    }
  },storage).catch(()=>{});
  await page?.close().catch(()=>{});await browser?.close().catch(()=>{});
  for(const [key,value] of [['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])
    adb('shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));
  report.rotationRestored=rotation;
  if(ownReverse)adb('reverse','--remove',`tcp:${port}`);
  await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log('Physical Android: Settings/Help in six browser/fullscreen orientations, open-dialog rotation and name cancel/save passed');
