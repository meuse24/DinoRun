// Physical before/after GC comparison with normal rAF, trusted START and isolated origin.
// DINO_BASELINE_HTML required; supports DINO_CURRENT_HTML and existing performance options.
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
assert(!adb('shell','dumpsys','window').includes('mDreamingLockscreen=true'), 'Unlock the authorized phone and open Chrome before running this test');
const output=path.join(root,process.env.DINO_TEST_OUTPUT||'output/gc-optimization/android');fs.mkdirSync(output,{recursive:true});
const baselineFile=process.env.DINO_BASELINE_HTML||process.argv[2];
assert(baselineFile,'Pass a saved pre-change HTML');
const baseline=fs.readFileSync(path.resolve(root,baselineFile),'utf8');
const current=fs.readFileSync(path.resolve(root,process.env.DINO_CURRENT_HTML||'dino.html'),'utf8');
const sources={baseline,current};
const port=Number(process.env.DINO_PERF_PORT||8893),relayPort=Number(process.env.DINO_PERF_RELAY_PORT||9237);
const origin=`http://127.0.0.1:${port}`;
const server=http.createServer((req,res)=>{const key=new URL(req.url,origin).pathname.slice(1).replace('.html','');
  res.setHeader('Cache-Control','no-store');
  if(sources[key])res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(sources[key]);
  else res.writeHead(204).end();});
const rotation={auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation')};
const report={device:adb('shell','getprop','ro.product.model'),android:adb('shell','getprop','ro.build.version.release'),
  baseline:baselineFile,fixture:'Normal rAF, effects on, audio off, non-colliding hazards; automatic bonus/powerups/level banner disabled for matched phases.',
  hashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),runs:[],errors:[]};
const stats=a=>{a=a.slice(1);const s=[...a].sort((a,b)=>a-b),mean=a.reduce((a,b)=>a+b,0)/a.length;
  return{fps:+(1000/mean).toFixed(2),meanMs:+mean.toFixed(2),p50:+s[Math.floor(s.length*.5)].toFixed(2),p95:+s[Math.floor(s.length*.95)].toFixed(2),p99:+s[Math.floor(s.length*.99)].toFixed(2),maxMs:+s[s.length-1].toFixed(2),over20:+(100*a.filter(x=>x>20).length/a.length).toFixed(2)};};
let browser,page,relay,forward,originalStorage,reverse=false;
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  adb('shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main');
  assert(!adb('reverse','--list').includes(`tcp:${port}`));adb('reverse',`tcp:${port}`,`tcp:${port}`);reverse=true;
  forward=adb('forward','tcp:0','localabstract:chrome_devtools_remote');
  let ready=false;
  for(let i=0;i<30;i++){
    try{const response=await fetch(`http://127.0.0.1:${forward}/json/version`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert(ready,'Open Chrome on the unlocked authorized phone');
  relay=spawn(process.execPath,[path.join(root,'tests/android-cdp-relay.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,DINO_PLAYWRIGHT:process.env.DINO_PLAYWRIGHT||'D:/projects/pacman/node_modules/playwright/index.mjs',DINO_CDP_UPSTREAM:`http://127.0.0.1:${forward}`,DINO_CDP_RELAY_PORT:String(relayPort)}});
  await new Promise((resolve,reject)=>{relay.stdout.on('data',d=>{if(String(d).includes('ready'))resolve()});relay.stderr.on('data',d=>reject(Error(String(d))));relay.on('exit',c=>reject(Error('Relay exited '+c)));});
  browser=await pw.chromium.connectOverCDP(`http://127.0.0.1:${relayPort}`,{noDefaults:true});report.chrome=browser.version();
  adb('shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main');
  page=await browser.contexts()[0].newPage();await page.bringToFront();page.on('pageerror',e=>report.errors.push(String(e)));
  await page.addInitScript(()=>{
    window.__originOriginal=JSON.stringify(Object.entries(localStorage));
    let seed=937;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
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
  const variants=process.env.DINO_PERF_VARIANTS?.split(',')||['baseline','current','current','baseline'];
  assert(variants.every(v=>sources[v]),'Unknown requested variant');
  for(const layout of layouts){adb('shell','settings','put','system','user_rotation',layout==='landscape'?'1':'0');
    for(const variant of variants){
      const response=await page.goto(`${origin}/${variant}.html`);assert.equal(createHash('sha256').update(await response.body()).digest('hex'),report.hashes[variant]);await page.waitForFunction(()=>!!window.__dinoRunner);
      originalStorage??=await page.evaluate(()=>window.__originOriginal);
      await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout==='portrait');
      await touch('#settings-open');await page.waitForFunction(()=>document.querySelector('#settings').open);
      await touch('#fullscreen-toggle');await page.waitForFunction(()=>!!document.fullscreenElement);await touch('#settings-close');
      console.log('Measuring '+layout+'/'+variant);
      await page.evaluate(()=>{const r=window.__dinoRunner;r.effectsSetting.set(true,false);r.attract.select(1);r.draw(1);
        window.__perfWork=[];window.__perfResizes=0;
        const originalUpdate=r.update.bind(r),originalDraw=r.draw.bind(r);
        r.update=dt=>{window.__workStart=performance.now();return originalUpdate(dt)};
        r.draw=alpha=>{if(window.__nightProbe){r.game.night=true;r.game.nightAlpha=1;}
          const result=originalDraw(alpha);if(window.__workStart!==null&&window.__workStart!==undefined){window.__perfWork.push(performance.now()-window.__workStart);window.__workStart=null;}return result;};
        const original=r.resize.bind(r);r.resize=(...args)=>{window.__perfResizes++;return original(...args)};
        window.__measure=ms=>new Promise(resolve=>{const a=[];window.__perfWork=[];let last=performance.now(),start=last;
          const frame=t=>{a.push(t-last);last=t;if(t-start<ms)requestAnimationFrame(frame);else resolve({deltas:a,work:window.__perfWork,resizes:window.__perfResizes});};requestAnimationFrame(frame);});
      });
      await page.waitForTimeout(1600);
      const record={layout,variant,temperature:adb('shell','dumpsys','battery').match(/temperature:\s*(\d+)/)?.[1],phases:{}};
      for(const phase of (process.env.DINO_PERF_PHASES?.split(',') || ['play','night','busy'])){
        if(phase==='play'){
          await touch('#start-game');await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown);
          await page.evaluate(()=>{const g=window.__dinoGame,h=g.horizon,original=h.addObstacle.bind(h),empty=[];
            for(const o of h.obstacles)o.collisionBoxes=empty;
            h.addObstacle=(speed,score,gap)=>{original(speed,score,gap);h.obstacles[h.obstacles.length-1].collisionBoxes=empty;};
            // Keep the timed phases comparable: no automatic tally can freeze one run.
            g.bonusEnabled=false;g.boss.enabled=false;g.feather.enabled=false;g.shield.enabled=false;
            g.turbo.spawnTimer=Infinity;window.__dinoRunner.shownLevel=Infinity;
          });
          await page.waitForTimeout(1000);
        }
        if(phase==='night')await page.evaluate(()=>{window.__nightProbe=true;const g=window.__dinoGame;g.sceneryDistance=1000;g.capturePrevious();});
        // Optional berry phases compare the old scene with one persistent new
        // pickup, then bounded pickup feedback. Normal rAF and matched hazards.
        if(phase==='berry')await page.evaluate(()=>{const g=window.__dinoGame;
          if(!g.berry)return;
          g.berry.enabled=false;g.berry.pickup=g.berry.item;
          Object.assign(g.berry.item,{x:g.world.width*.65,prevX:g.world.width*.65,y:108,age:300});
        });
        if(phase==='berryCollect')await page.evaluate(()=>{const r=window.__dinoRunner,g=r.game;
          if(!g.berry)return;
          g.berry.pickup=null;
          window.__berryStress=setInterval(()=>r.handleEvent({type:'berry'}),1000);
        });
        if(phase==='busy')await page.evaluate(()=>{const r=window.__dinoRunner,g=r.game,e=r.renderer.effects;let n=0;
          window.__stress=setInterval(()=>{e.callout('SHIELD!',g.trex.x+24+(n%3)*90,g.trex.y-6,'shield');e.burst(220,100,48,'confetti');if(++n%4===0)e.announce('LEVEL 2','SPEED UP!');},400);});
        await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing',transferMode:'ReturnAsStream'});
        const sample=await page.evaluate(async()=>{performance.mark('dino-gc-start');const result=await window.__measure(5000);performance.mark('dino-gc-end');return result;});
        const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');
        const {stream}=await complete;let trace='';for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
        const events=JSON.parse(trace).traceEvents,start=events.find(e=>e.name==='dino-gc-start'),end=events.find(e=>e.name==='dino-gc-end');
        assert(start&&end,'Own-page trace markers');
        const gc=events.filter(e=>e.ph==='X'&&(e.name==='MinorGC'||e.name==='MajorGC')&&e.pid===start.pid&&e.tid===start.tid&&e.ts>=start.ts&&e.ts<=end.ts);
        const gcMs=gc.reduce((sum,e)=>sum+e.dur/1000,0);
        fs.writeFileSync(path.join(output,`${layout}-${variant}-${report.runs.length}-${phase}.trace.json`),trace);

        const work=stats(sample.work);delete work.fps;
        record.phases[phase]={...stats(sample.deltas),work,gcCount:gc.length,gcMs,gcMaxMs:Math.max(0,...gc.map(e=>e.dur/1000)),resizes:sample.resizes,
          geometry:await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return{viewport:[innerWidth,innerHeight],css:[r.width,r.height],backing:[c.width,c.height],world:window.__dinoGame.world.width,paused:window.__dinoRunner.paused}})};
      }
      await page.screenshot({path:path.join(output,`${layout}-${variant}-${report.runs.length}.png`)});
      report.runs.push(record);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(record));
    }
  }
  assert.deepEqual(report.errors,[]);
}finally{
  if(page&&originalStorage)await page.evaluate(data=>{localStorage.clear();for(const [k,v]of JSON.parse(data))localStorage.setItem(k,v);},originalStorage).catch(()=>{});
  await page?.close().catch(()=>{});await browser?.close().catch(()=>{});relay?.kill();
  for(const[k,v]of[['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])adb('shell','settings',v==='null'?'delete':'put','system',k,...(v==='null'?[]:[v]));
  if(forward)adb('forward','--remove',`tcp:${forward}`);if(reverse)adb('reverse','--remove',`tcp:${port}`);
  server.closeAllConnections();
  await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
