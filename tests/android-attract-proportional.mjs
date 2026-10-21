// Actual production browser/TWA check on an ADB-connected phone. No gameplay
// starts, and page-scoped request blocking prevents live highscore requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/attract-proportional/physical');
fs.mkdirSync(output, {recursive:true});
const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const serial = process.env.DINO_ANDROID_SERIAL || 'RF8MB125SXA';
const adb = (...args) => execFileSync(adbPath, ['-s',serial,...args], {encoding:'utf8'}).trim();
const port = adb('forward','tcp:0','localabstract:chrome_devtools_remote');
const endpoint = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const rotation = {auto:adb('shell','settings','get','system','accelerometer_rotation'),
  user:adb('shell','settings','get','system','user_rotation')};
const expectedHash = createHash('sha256').update(fs.readFileSync(path.join(root,'release/dino.html'))).digest('hex');
const expectedBuild = JSON.parse(fs.readFileSync(path.join(root,'release/size-report.json'),'utf8')).build;
const report = {model:adb('shell','getprop','ro.product.model'),android:adb('shell','getprop','ro.build.version.release'),
  expectedHash,layouts:[],portraits:[],errors:[]};
const clients=[];
let ownTarget, originalPreference, preferenceSaved=false, app;
class Client {
  constructor(ws){this.ws=ws;this.next=0;this.pending=new Map();
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=this.pending.get(m.id);
      if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
      if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.text);
    });}
  call(method,params={}){return new Promise((resolve,reject)=>{const id=++this.next;
    const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Timeout: '+method));},20000);
    this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  async eval(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;}
  async wait(expression){for(let i=0;i<100;i++){try{if(await this.eval(expression))return;}catch{}await sleep(200);}throw Error('Wait: '+expression);}
  async touch(selector){const p=await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await this.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await this.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
}
async function connect(target){const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const c=new Client(ws);clients.push(c);return c;}
async function setup(c){await c.call('Runtime.enable');await c.call('Network.enable');
  await c.call('Network.setBlockedURLs',{urls:['*highscores.php*']});
  await c.eval(`if(!window.__proportionalTracking){window.__proportionalTracking=true;document.addEventListener('pointerdown',e=>{(window.__proportionalTouches??=[]).push({trusted:e.isTrusted,type:e.pointerType})},true)}`);}
async function latest(c){await c.wait('!!window.__dinoRunner');
  if(await c.eval('JSON.parse(render_game_to_text()).build')!==expectedBuild){
    await c.eval(`navigator.serviceWorker.getRegistration().then(r=>r?.update())`);
    await c.wait('!document.querySelector("#update-notice").hidden');await c.touch('#update-apply');
    await c.wait(`!!window.render_game_to_text && JSON.parse(render_game_to_text()).build === ${JSON.stringify(expectedBuild)}`);
  }
  assert.equal(await c.eval(`fetch(location.href).then(r=>r.arrayBuffer()).then(b=>crypto.subtle.digest('SHA-256',b)).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))`),expectedHash);
  await setup(c); // Consent may have reloaded the page and its touch recorder.
}
async function layouts(c,mode){for(const rotationValue of ['1','3']){
  adb('shell','settings','put','system','user_rotation',rotationValue);
  await c.wait(`screen.orientation.type === ${JSON.stringify(rotationValue==='1'?'landscape-primary':'landscape-secondary')}`);
  await sleep(700);
  for(const [panel,index] of [['scores',0],['demo',1],['powerups',2]]){
    await c.eval(`window.__dinoRunner.attract.select(${index},'next');window.__dinoRunner.draw(1)`);await sleep(700);
    const geometry=await c.eval(`(()=>{const r=document.querySelector('#stage').getBoundingClientRect();const g=document.querySelector('#game').getBoundingClientRect();const canvas=document.querySelector('canvas');const action=document.querySelector(window.__dinoRunner.credits.balance?'#start-game':'#insert-coin');const a=action.getBoundingClientRect();return{w:innerWidth,h:innerHeight,x:r.x,y:r.y,width:r.width,height:r.height,aspect:g.width/g.height,backing:canvas.width/canvas.height,action:{x:a.x,y:a.y,width:a.width,height:a.height,hit:action.contains(document.elementFromPoint(a.x+a.width/2,a.y+a.height/2))},fullscreen:matchMedia('(display-mode:fullscreen)').matches}})()`);
    const h=Math.min(geometry.w*220/600,geometry.h);
    assert(Math.abs(geometry.x)<1&&Math.abs(geometry.width-geometry.w)<1,'Full viewport width');
    assert(Math.abs(geometry.height-h)<1&&Math.abs(geometry.y-(geometry.h-h)/2)<1,'Aspect and centering');
    assert(Math.abs(geometry.backing/geometry.aspect-1)<0.005,'Undistorted Canvas');
    assert(geometry.action.hit&&geometry.action.x>=0&&geometry.action.y>=0&&geometry.action.x+geometry.action.width<=geometry.w+1&&geometry.action.y+geometry.action.height<=geometry.h+1,'Primary action usable');
    assert.equal(geometry.fullscreen,mode==='twa');
    report.layouts.push({mode,rotation:rotationValue,panel,...geometry});
    if(panel==='powerups')fs.writeFileSync(path.join(output,`${mode}-${rotationValue}.png`),execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p']));
  }
  await c.touch('#info-link');await c.wait('document.querySelector("#help-dialog").open');
  adb('shell','input','keyevent','4');await c.wait('!document.querySelector("#help-dialog").open');await sleep(300);
  await c.touch('#settings-open');await c.wait('document.querySelector("#settings").open');await sleep(300);
  await c.touch('#settings-close');await c.wait('!document.querySelector("#settings").open');
}}
async function portrait(c,mode){
  adb('shell','settings','put','system','user_rotation','0');await c.wait('innerHeight > innerWidth');await sleep(700);
  await c.eval('window.__dinoRunner.attract.select(1,"next");window.__dinoRunner.draw(1)');await sleep(700);
  const geometry=await c.eval(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};const canvas=document.querySelector('canvas');return{game:rect('#game'),caption:rect('.attract-demo-caption'),label:rect('.attract-demo-label'),hint:rect('#landscape-hint'),backing:canvas.width/canvas.height,w:innerWidth,h:innerHeight}})()`);
  assert(geometry.game.y >= geometry.caption.bottom+4 && geometry.game.bottom+4<=geometry.label.y && geometry.game.bottom+4<=geometry.hint.y,'Complete demo stays clear of caption, label and landscape hint');
  assert(Math.abs(geometry.backing/(geometry.game.width/geometry.game.height)-1)<0.005,'Portrait demo aspect');
  report.portraits.push({mode,...geometry});
  fs.writeFileSync(path.join(output,`${mode}-portrait-demo.png`),execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p']));
}
try{
  adb('shell','am','start','-n','info.meuse24.dinorun/.LauncherActivity');await sleep(1500);
  assert(adb('shell','dumpsys','window').includes('info.meuse24.dinorun'),'Installed app owns the foreground task');
  const targets=await(await fetch(endpoint+'/json/list')).json();
  for(const t of targets.filter(t=>t.url.startsWith('https://meuse24.info/apps/dino/dino.html'))){
    // A worker-consented reload changes document.referrer to the page URL.
    // Foreground Android task ownership above distinguishes the TWA after that reload.
    const c=await connect(t);if(await c.eval('matchMedia("(display-mode:fullscreen)").matches && document.visibilityState === "visible"')){app=c;break;}c.ws.close();}
  assert(app,'Visible installed TWA required');
  await setup(app);await latest(app);
  assert.equal(await app.eval('window.__dinoGame.state'),'attract','Run this test from the app start menu');
  originalPreference=await app.eval('localStorage.getItem("dino-fullscreen-disabled")');preferenceSaved=true;
  await app.eval('localStorage.setItem("dino-fullscreen-disabled","true")');
  adb('shell','settings','put','system','accelerometer_rotation','0');
  await portrait(app,'twa');await layouts(app,'twa');
  const version=await(await fetch(endpoint+'/json/version')).json();
  const controller=await connect(version);
  ownTarget=(await controller.call('Target.createTarget',{url:'https://meuse24.info/apps/dino/dino.html'})).targetId;
  await controller.call('Target.activateTarget',{targetId:ownTarget});await sleep(500);
  const browserTarget=(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.id===ownTarget);
  assert(browserTarget,'Created browser target must be discoverable');
  const browser=await connect(browserTarget);await setup(browser);await latest(browser);
  await browser.wait('document.visibilityState === "visible"');await portrait(browser,'browser');await layouts(browser,'browser');
  report.trustedTouches=[];for(const c of [app,browser])report.trustedTouches.push(...await c.eval('window.__proportionalTouches||[]'));
  assert(report.trustedTouches.length>=8&&report.trustedTouches.every(t=>t.trusted&&t.type==='touch'));
  assert.deepEqual(report.errors,[]);report.passed=true;
}finally{
  if(preferenceSaved&&app?.ws.readyState===WebSocket.OPEN)await app.eval(originalPreference===null?'localStorage.removeItem("dino-fullscreen-disabled")':`localStorage.setItem("dino-fullscreen-disabled",${JSON.stringify(originalPreference)})`).catch(()=>{});
  if(ownTarget)await fetch(endpoint+'/json/close/'+ownTarget).catch(()=>{});
  for(const c of clients){
    if(c.ws.readyState===WebSocket.OPEN)await c.call('Network.setBlockedURLs',{urls:[]}).catch(()=>{});
    c.ws.close();
  }
  for(const[key,value]of[['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])adb('shell','settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));
  adb('forward','--remove',`tcp:${port}`);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(`Physical ${report.model}: ${report.layouts.length} landscape and ${report.portraits.length} portrait production browser/TWA attract checks passed; hash ${expectedHash}`);
