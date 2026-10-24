// Sequential physical-phone attract diagnostics. Own origin, tab and bridges;
// normal rAF, no live scores, no changes to the shipped game or phone power mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const pwPath = process.env.DINO_PLAYWRIGHT || 'D:/projects/pacman/node_modules/playwright/index.mjs';
const pw = await import(pathToFileURL(pwPath).href);
const adbPath = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const serial = process.env.DINO_ANDROID_SERIAL;
assert(serial, 'Set DINO_ANDROID_SERIAL explicitly');
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], {encoding:'utf8'}).trim();
const output = path.resolve(root, process.env.DINO_TEST_OUTPUT || `output/attract-performance/${serial}`);
fs.mkdirSync(output, {recursive:true});
const source = fs.readFileSync(path.resolve(root, process.env.DINO_CURRENT_HTML || 'dino.html'), 'utf8');
const densityPattern = /const rasterDensity =[\s\S]*?;/;
const withDensity = cap => source.replace(densityPattern,
  `const rasterDensity = matchMedia('(pointer: coarse) and (orientation: landscape)').matches ? Math.min(density, ${cap}) : density;`);
const gpu = s => s.replaceAll("willReadFrequently: matchMedia('(pointer: coarse)').matches", 'willReadFrequently: false');
const sources = {
  current:source,
  ...(densityPattern.test(source) ? {cap2:withDensity(2), cap1:withDensity(1), cap15:withDensity(1.5), gpu:gpu(source), gpuCap2:gpu(withDensity(2))} : {}),
};
const port = 8894, relayPort = 9238, origin = `http://127.0.0.1:${port}`;
const server = http.createServer((req,res) => {
  const key = new URL(req.url, origin).pathname.slice(1).replace('.html','');
  res.setHeader('Cache-Control', 'no-store');
  if (sources[key]) res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(sources[key]);
  else res.writeHead(204).end();
});
const rotation = {auto:adb('shell','settings','get','system','accelerometer_rotation'),
  user:adb('shell','settings','get','system','user_rotation')};
const device = () => ({temperature:adb('shell','dumpsys','battery').match(/temperature:\s*(\d+)/)?.[1],
  powerSave:adb('shell','settings','get','global','low_power'),
  thermal:adb('shell','dumpsys','thermalservice').split('\n').filter(s=>/Thermal Status|mName=SKIN/.test(s))});
const report = {serial, model:adb('shell','getprop','ro.product.model'),
  android:adb('shell','getprop','ro.build.version.release'), rotation,
  sourceHash:createHash('sha256').update(source).digest('hex'), runs:[], errors:[]};
const stats = values => {
  const a = values.slice(1), sorted = [...a].sort((a,b)=>a-b);
  const mean = a.reduce((a,b)=>a+b,0)/a.length;
  return {count:a.length, meanMs:+mean.toFixed(3), fps:+(1000/mean).toFixed(2),
    p50:sorted[Math.floor(a.length*.5)], p95:sorted[Math.floor(a.length*.95)],
    over20:+(100*a.filter(x=>x>20).length/a.length).toFixed(2)};
};
let browser, page, relay, forward, reverse = false;
try {
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  assert(!adb('reverse','--list').includes(`tcp:${port}`));
  adb('reverse',`tcp:${port}`,`tcp:${port}`); reverse=true;
  forward=adb('forward','tcp:0','localabstract:chrome_devtools_remote');
  relay=spawn(process.execPath,[path.join(root,'tests/android-cdp-relay.mjs')],{cwd:root,windowsHide:true,
    stdio:['ignore','pipe','pipe'],env:{...process.env,DINO_PLAYWRIGHT:pwPath,
      DINO_CDP_UPSTREAM:`http://127.0.0.1:${forward}`,DINO_CDP_RELAY_PORT:String(relayPort)}});
  await new Promise((resolve,reject)=>{
    relay.stdout.on('data',d=>{if(String(d).includes('ready'))resolve();});
    relay.stderr.on('data',d=>reject(Error(String(d))));relay.on('exit',c=>reject(Error('Relay exited '+c)));
  });
  browser=await pw.chromium.connectOverCDP(`http://127.0.0.1:${relayPort}`,{noDefaults:true});
  report.chrome=browser.version();
  adb('shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main');
  page=await browser.contexts()[0].newPage(); await page.bringToFront();
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
  await page.addInitScript(()=>{
    const audio=new EventTarget(); audio.pause=()=>{};audio.play=()=>Promise.resolve();
    window.__dinoTest={credits:99,highscoreApiUrl:null,musicAudio:audio,transitions:false};
    localStorage.setItem('dino-fullscreen-disabled','true');localStorage.setItem('dino-effects','on');
    localStorage.setItem('dino-sound-muted','true');
    navigator.serviceWorker.register=()=>Promise.reject(Error('Isolated performance fixture'));
  });
  const cdp=await page.context().newCDPSession(page);
  const touch=async selector=>{
    const b=await page.locator(selector).boundingBox();assert(b,selector);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','settings','put','system','user_rotation','1');
  const variants=process.env.DINO_PERF_VARIANTS?.split(',')||['current','effectsOff','cssOff','cap2','gpu','current'];
  const panels=process.env.DINO_PERF_PANELS?.split(',').map(Number)||[0,1,2];
  assert(variants.every(v=>sources[v]||['effectsOff','cssOff','noCanvas','promote'].includes(v)), 'Unknown variant');
  assert(panels.every(p=>Number.isInteger(p)&&p>=0&&p<=2), 'Unknown panel');
  for(const variant of variants) {
    console.log(`Measuring ${report.model}/${variant}`);
    await page.goto(`${origin}/${sources[variant]?variant:'current'}.html`);
    await page.waitForFunction(()=>!!window.__dinoRunner&&innerWidth>innerHeight);
    await touch('#settings-open');await page.waitForFunction(()=>document.querySelector('#settings').open);
    await touch('#fullscreen-toggle');await page.waitForFunction(()=>!!document.fullscreenElement);
    await touch('#settings-close');
    if(variant==='cssOff') await page.addStyleTag({content:'*,*::before,*::after { animation: none !important; transition: none !important; }'});
    if(variant==='promote') await page.addStyleTag({content:'canvas { will-change: transform; transform: translateZ(0); }'});
    await page.evaluate(({variant,fps})=>{
      const r=window.__dinoRunner;r.effectsSetting.set(variant!=='effectsOff',false);
      if (fps) { r.fps.enabled=true; r.fps.reset(); r.fps.render(); }
      r.attract.durations=[1e9,1e9,1e9];
      const original=r.draw.bind(r);window.__drawWork=[];
      r.draw=(...args)=>{const t=performance.now();const result=original(...args);window.__drawWork.push(performance.now()-t);return result;};
      if(variant==='noCanvas')r.attract.draw=()=>true;
    },{variant,fps:process.env.DINO_PERF_FPS==='1'});
    const record={variant,device:device(),panels:[]};
    for(const panel of panels) {
      await page.evaluate(i=>window.__dinoRunner.attract.select(i),panel);
      await page.waitForTimeout(1500);
      const sample=await page.evaluate(ms=>new Promise(resolve=>{
        const deltas=[];window.__drawWork=[];let last,start;
        const frame=t=>{if(start===undefined)start=t;else deltas.push(t-last);last=t;
          if(t-start<ms)requestAnimationFrame(frame);else resolve({deltas,work:window.__drawWork});};
        requestAnimationFrame(frame);
      }),Number(process.env.DINO_PERF_SAMPLE_MS||6500));
      const geometry=await page.evaluate(()=>{
        const c=document.querySelector('canvas'),b=c.getBoundingClientRect(),r=window.__dinoRunner;
        return{viewport:[innerWidth,innerHeight],css:[b.width,b.height],backing:[c.width,c.height],dpr:devicePixelRatio,
          paused:r.paused,selected:r.attract.index,displayFps:r.fps.value,context:c.getContext('2d').getContextAttributes(),text:window.render_game_to_text()};
      });
      assert.equal(geometry.selected,panel);assert(!geometry.paused);
      const result={panel,...stats(sample.deltas),draw:stats(sample.work),geometry};
      record.panels.push(result);
      console.log(JSON.stringify({variant,panel,fps:result.fps,p95:result.p95,drawMs:result.draw.meanMs,backing:geometry.backing}));
      await page.screenshot({path:path.join(output,`${report.runs.length}-${variant}-${panel}.png`)});
    }
    report.runs.push(record);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  }
  assert.deepEqual(report.errors,[]);
} finally {
  await page?.close().catch(()=>{});await browser?.close().catch(()=>{});relay?.kill();
  // Let Chrome settle its fullscreen orientation unlock before restoring OS state.
  await new Promise(r=>setTimeout(r,800));
  for(const[k,v]of[['user_rotation',rotation.user],['accelerometer_rotation',rotation.auto]])
    adb('shell','settings',v==='null'?'delete':'put','system',k,...(v==='null'?[]:[v]));
  if(forward)adb('forward','--remove',`tcp:${forward}`);
  if(reverse)adb('reverse','--remove',`tcp:${port}`);
  await new Promise(r=>server.close(r));
  report.restoredRotation={auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation')};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  assert.deepEqual(report.restoredRotation,rotation,'Phone rotation was not restored');
}
