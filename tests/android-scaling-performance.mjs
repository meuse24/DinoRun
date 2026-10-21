// Matched physical-device comparison: pre-scaling Git source, current source,
// and an optional lower-raster-density experiment. Own origin/tab/CDP bridges.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const pw=await import(pathToFileURL(process.env.DINO_PLAYWRIGHT || 'D:/projects/pacman/node_modules/playwright/index.mjs').href);
const adbPath=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const adb=(...args)=>execFileSync(adbPath,['-s',process.env.DINO_ANDROID_SERIAL||'RF8MB125SXA',...args],{encoding:'utf8'}).trim();
const output=path.join(root,process.env.DINO_TEST_OUTPUT||'output/scaling-performance');fs.mkdirSync(output,{recursive:true});
const baseline=process.env.DINO_BASELINE_HTML ? fs.readFileSync(path.resolve(root,process.env.DINO_BASELINE_HTML),'utf8') :
  execFileSync('git',['show',`${process.env.DINO_BASELINE||'3217c9e'}:dino.html`],{cwd:root,encoding:'utf8'});
const current=fs.readFileSync(path.resolve(root,process.env.DINO_CURRENT_HTML||'dino.html'),'utf8');
const capped=current.replace('(window.devicePixelRatio || 1) * Math.max(rect.width / logicalWidth, 0.5)',
  'Math.min(window.devicePixelRatio || 1, 2) * Math.max(rect.width / logicalWidth, 0.5)');
const sources={baseline,current,...(capped!==current?{cap2:capped}:{})};
const port=Number(process.env.DINO_PERF_PORT||8892),relayPort=Number(process.env.DINO_PERF_RELAY_PORT||9236);
const origin=`http://127.0.0.1:${port}`;
const server=http.createServer((req,res)=>{const key=new URL(req.url,origin).pathname.slice(1).replace('.html','');
  res.setHeader('Cache-Control','no-store');
  if(sources[key])res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(sources[key]);
  else res.writeHead(204).end();});
const rotation={auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation')};
const report={device:adb('shell','getprop','ro.product.model'),android:adb('shell','getprop','ro.build.version.release'),
  baseline:process.env.DINO_BASELINE_HTML||process.env.DINO_BASELINE||'3217c9e',hashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),runs:[],errors:[]};
const stats=a=>{a=a.slice(1);const s=[...a].sort((a,b)=>a-b),mean=a.reduce((a,b)=>a+b,0)/a.length;
  return{fps:+(1000/mean).toFixed(2),meanMs:+mean.toFixed(2),p50:+s[Math.floor(s.length*.5)].toFixed(2),p95:+s[Math.floor(s.length*.95)].toFixed(2),over20:+(100*a.filter(x=>x>20).length/a.length).toFixed(2)};};
let browser,page,relay,forward,reverse=false;
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  assert(!adb('reverse','--list').includes(`tcp:${port}`));adb('reverse',`tcp:${port}`,`tcp:${port}`);reverse=true;
  forward=adb('forward','tcp:0','localabstract:chrome_devtools_remote');
  relay=spawn(process.execPath,[path.join(root,'tests/android-cdp-relay.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,DINO_PLAYWRIGHT:process.env.DINO_PLAYWRIGHT||'D:/projects/pacman/node_modules/playwright/index.mjs',DINO_CDP_UPSTREAM:`http://127.0.0.1:${forward}`,DINO_CDP_RELAY_PORT:String(relayPort)}});
  await new Promise((resolve,reject)=>{relay.stdout.on('data',d=>{if(String(d).includes('ready'))resolve()});relay.stderr.on('data',d=>reject(Error(String(d))));relay.on('exit',c=>reject(Error('Relay exited '+c)));});
  browser=await pw.chromium.connectOverCDP(`http://127.0.0.1:${relayPort}`,{noDefaults:true});report.chrome=browser.version();
  adb('shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main');
  page=await browser.contexts()[0].newPage();await page.bringToFront();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.addInitScript(()=>{
    const audio=new EventTarget();audio.pause=()=>{};audio.play=()=>Promise.resolve();
    window.__dinoTest={credits:99,highscoreApiUrl:null,musicAudio:audio,transitions:false};
    localStorage.setItem('dino-fullscreen-disabled','true');localStorage.setItem('dino-effects','on');
    localStorage.setItem('dino-sound-muted','true');
    navigator.serviceWorker.register=()=>Promise.reject(Error('Isolated performance fixture'));
  });
  const cdp=await page.context().newCDPSession(page);
  const touch=async selector=>{await page.locator(selector).scrollIntoViewIfNeeded();const b=await page.locator(selector).boundingBox();assert(b,selector);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  adb('shell','settings','put','system','accelerometer_rotation','0');
  const layouts=process.env.DINO_PERF_LAYOUTS?.split(',')||['landscape','portrait'];
  const variants=process.env.DINO_PERF_VARIANTS?.split(',')||Object.keys(sources);
  assert(variants.every(v=>sources[v]),'Unknown requested variant');
  for(const layout of layouts){adb('shell','settings','put','system','user_rotation',layout==='landscape'?'1':'0');
    for(const variant of variants){
      await page.goto(`${origin}/${variant}.html`);await page.waitForFunction(()=>!!window.__dinoRunner);
      await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout==='portrait');
      await touch('#settings-open');await page.waitForFunction(()=>document.querySelector('#settings').open);
      await touch('#fullscreen-toggle');await page.waitForFunction(()=>!!document.fullscreenElement);await touch('#settings-close');
      console.log('Measuring '+layout+'/'+variant);
      await page.evaluate(()=>{const r=window.__dinoRunner;r.effectsSetting.set(true,false);r.attract.select(1);r.draw(1);
        window.__perfWork=[];window.__perfResizes=0;
        for(const key of ['draw','update']){const original=r[key].bind(r);r[key]=(...args)=>{if(key==='draw'&&window.__nightProbe){r.game.night=true;r.game.nightAlpha=1;}
          const t=performance.now();const result=original(...args);if(key==='draw')window.__perfWork.push(performance.now()-t);return result;};}
        const original=r.resize.bind(r);r.resize=(...args)=>{window.__perfResizes++;return original(...args)};
        window.__measure=ms=>new Promise(resolve=>{const a=[];window.__perfWork=[];let last=performance.now(),start=last;
          const frame=t=>{a.push(t-last);last=t;if(t-start<ms)requestAnimationFrame(frame);else resolve({deltas:a,work:window.__perfWork,resizes:window.__perfResizes});};requestAnimationFrame(frame);});
      });
      await page.waitForTimeout(1600);
      const record={layout,variant,temperature:adb('shell','dumpsys','battery').match(/temperature:\s*(\d+)/)?.[1],phases:{}};
      for(const phase of (process.env.DINO_PERF_PHASES?.split(',') || (process.env.DINO_PERF_NIGHT ? ['demo','play','night','nightNoMoon','nightNoMountains','nightNoHud','busy'] : ['demo','play','busy']))){
        if(phase==='play'){
          await touch('#start-game');await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown);
          await page.evaluate(()=>window.__dinoGame.on(e=>{if(e.type==='step')window.__dinoGame.horizon.obstacles.length=0}));
          await page.waitForTimeout(1000);
        }
        if(phase==='night')await page.evaluate(()=>{window.__nightProbe=true;const g=window.__dinoGame;g.sceneryDistance=1000;g.capturePrevious();});
        if(phase==='nightNoMoon')await page.evaluate(()=>{const r=window.__dinoRunner;window.__savedDrawNight=r.renderer.drawNight;r.renderer.drawNight=()=>{};});
        if(phase==='nightNoMountains')await page.evaluate(()=>{const r=window.__dinoRunner.renderer;r.drawNight=window.__savedDrawNight;window.__savedMountains=r.drawMountainLayer;r.drawMountainLayer=()=>{};});
        if(phase==='nightNoHud')await page.evaluate(()=>{const r=window.__dinoRunner.renderer;r.drawMountainLayer=window.__savedMountains;window.__savedHud=r.drawDistanceMeter;r.drawDistanceMeter=()=>{};});
        if(phase==='busy'&&process.env.DINO_PERF_NIGHT)await page.evaluate(()=>{if(window.__savedHud)window.__dinoRunner.renderer.drawDistanceMeter=window.__savedHud;});
        if(phase==='busy')await page.evaluate(()=>{const r=window.__dinoRunner,g=r.game,e=r.renderer.effects;let n=0;
          window.__stress=setInterval(()=>{e.callout('SHIELD!',g.trex.x+24+(n%3)*90,g.trex.y-6,'shield');if(++n%4===0)e.announce('LEVEL 2','SPEED UP!');},400);});
        const sample=await page.evaluate(()=>window.__measure(4500));
        record.phases[phase]={...stats(sample.deltas),draw:stats(sample.work),resizes:sample.resizes,
          geometry:await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return{viewport:[innerWidth,innerHeight],css:[r.width,r.height],backing:[c.width,c.height],world:window.__dinoGame.world.width,paused:window.__dinoRunner.paused}})};
      }
      await page.screenshot({path:path.join(output,`${layout}-${variant}-${report.runs.length}.png`)});
      report.runs.push(record);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(record));
    }
  }
  assert.deepEqual(report.errors,[]);
}finally{
  await page?.close().catch(()=>{});await browser?.close().catch(()=>{});relay?.kill();
  for(const[k,v]of[['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])adb('shell','settings',v==='null'?'delete':'put','system',k,...(v==='null'?[]:[v]));
  if(forward)adb('forward','--remove',`tcp:${forward}`);if(reverse)adb('reverse','--remove',`tcp:${port}`);
  await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
