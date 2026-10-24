// Sustained physical-phone gameplay: long real rounds with obstacles, night,
// boss and effects, sampled in windows together with thermal state. Variants run
// as consecutive segments for A/B comparison; optional trusted touch taps and
// rotations mirror the functional suite. Own origin, tab and bridges; restores
// rotation and stay-awake settings, no live scores.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const pwPath=process.env.DINO_PLAYWRIGHT||'D:/projects/pacman/node_modules/playwright/index.mjs';
const pw=await import(pathToFileURL(pwPath).href);
const adbPath=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const serial=process.env.DINO_ANDROID_SERIAL||'RFCW10RPKVW';
const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8'}).trim();
const output=path.resolve(root,process.env.DINO_TEST_OUTPUT||`output/sustained-performance/${serial}`);
fs.mkdirSync(output,{recursive:true});
const htmlPath=process.env.DINO_CURRENT_HTML||'release/dino.html';
const source=fs.readFileSync(path.resolve(root,htmlPath),'utf8');
const minutes=Number(process.env.DINO_SUSTAINED_MIN||12),windowMs=Number(process.env.DINO_SUSTAINED_WINDOW_S||30)*1000;
const layout=process.env.DINO_SUSTAINED_LAYOUT||'landscape';
const minFps=process.env.DINO_SUSTAINED_MIN_FPS?Number(process.env.DINO_SUSTAINED_MIN_FPS):null;
// current: the artifact as shipped. gpu: every 2D context loses willReadFrequently,
// i.e. the rejected all-GPU candidate, applied at runtime to any artifact.
// gpuSingle: gpu without the play backing swap (one Canvas, as the old candidate).
const variants=(process.env.DINO_SUSTAINED_VARIANTS||'current').split(',');
const tapMs=Number(process.env.DINO_SUSTAINED_TAP_MS||0),rotateMs=Number(process.env.DINO_SUSTAINED_ROTATE_S||0)*1000;
// Diagnostic only: drop obstacles every step, as the isolated scaling fixture does.
const noObstacles=process.env.DINO_SUSTAINED_NO_OBSTACLES==='1';
// Diagnostic only: hide DOM over the Canvas (CSS selectors) or skip renderer methods.
const bitmapHud=process.env.DINO_SUSTAINED_BITMAP_HUD==='1',directText=process.env.DINO_SUSTAINED_DIRECT_TEXT==='1';
const hide=process.env.DINO_SUSTAINED_HIDE||'',skip=(process.env.DINO_SUSTAINED_SKIP||'').split(',').filter(Boolean);
assert(['landscape','portrait'].includes(layout),'DINO_SUSTAINED_LAYOUT must be landscape or portrait');
assert(variants.every(v=>['current','gpu','gpuSingle'].includes(v)),'DINO_SUSTAINED_VARIANTS accepts current,gpu,gpuSingle');
const port=8898,relayPort=9239,origin=`http://127.0.0.1:${port}`;
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(new URL(req.url,origin).pathname==='/game.html')res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(source);
  else res.writeHead(204).end();
});
const device=()=>{
  const thermal=adb('shell','dumpsys','thermalservice');
  return{battery:Number(adb('shell','dumpsys','battery').match(/temperature:\s*(\d+)/)?.[1])/10,
    thermal:Number(thermal.match(/Thermal Status:\s*(\d+)/)?.[1]),
    skin:Number(thermal.match(/mValue=([\d.]+), mType=3/)?.[1])||null};
};
const stats=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),mean=a.reduce((x,y)=>x+y,0)/a.length;
  return{fps:+(1000/mean).toFixed(2),meanMs:+mean.toFixed(2),p50:+s[Math.floor(s.length*.5)].toFixed(2),
    p95:+s[Math.floor(s.length*.95)].toFixed(2),p99:+s[Math.floor(s.length*.99)].toFixed(2),
    over20:+(100*a.filter(x=>x>20).length/a.length).toFixed(2),over33:+(100*a.filter(x=>x>33.4).length/a.length).toFixed(2)};};
const settings={auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation'),
  stayOn:adb('shell','settings','get','global','stay_on_while_plugged_in')};
const report={serial,model:adb('shell','getprop','ro.product.model'),android:adb('shell','getprop','ro.build.version.release'),
  artifact:htmlPath,sourceHash:createHash('sha256').update(source).digest('hex'),layout,minutes,windowMs,variants,tapMs,rotateMs,settings,noObstacles,hide,skip,bitmapHud,directText,
  start:device(),windows:[],segments:[],errors:[]};
const slow=[];
const save=()=>{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(output,'slow-frames.json'),JSON.stringify(slow));};
const avg=list=>+(list.reduce((a,x)=>a+x.fps,0)/list.length).toFixed(2);
const summarize=w=>{
  const summary={windows:w.length,meanFps:avg(w),firstTwoFps:avg(w.slice(0,2)),lastTwoFps:avg(w.slice(-2)),minWindowFps:Math.min(...w.map(x=>x.fps)),
    over20:+(w.reduce((a,x)=>a+x.over20,0)/w.length).toFixed(2),drawMs:+(w.reduce((a,x)=>a+x.draw.meanMs,0)/w.length).toFixed(2),
    maxThermal:Math.max(...w.map(x=>x.device.thermal)),maxBattery:Math.max(...w.map(x=>x.device.battery)),hits:w.at(-1).hits};
  // Lift >1: the tag is over-represented among slow frames relative to all frames.
  const totals={};for(const x of w)for(const[k,c]of Object.entries(x.counts)){const t=totals[k]??={all:0,slow:0};t.all+=c.all;t.slow+=c.slow;}
  const base=totals.total.slow/totals.total.all;
  summary.slowShare=+(100*base).toFixed(2);
  summary.tags=Object.entries(totals).filter(([k])=>k!=='total').map(([tag,c])=>({tag,frames:c.all,slow:c.slow,
    slowRate:+(100*c.slow/c.all).toFixed(2),lift:+((c.slow/c.all)/(base||1)).toFixed(2)})).sort((a,b)=>b.lift-a.lift);
  return summary;
};
let browser,page,relay,forward,reverse=false;
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  assert(!adb('reverse','--list').includes(`tcp:${port}`),`Port ${port} already reversed`);
  adb('reverse',`tcp:${port}`,`tcp:${port}`);reverse=true;
  forward=adb('forward','tcp:0','localabstract:chrome_devtools_remote');
  relay=spawn(process.execPath,[path.join(root,'tests/android-cdp-relay.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,DINO_PLAYWRIGHT:pwPath,DINO_CDP_UPSTREAM:`http://127.0.0.1:${forward}`,DINO_CDP_RELAY_PORT:String(relayPort)}});
  await new Promise((resolve,reject)=>{relay.stdout.on('data',d=>{if(String(d).includes('ready'))resolve();});
    relay.stderr.on('data',d=>reject(Error(String(d))));relay.on('exit',c=>reject(Error('Relay exited '+c)));});
  browser=await pw.chromium.connectOverCDP(`http://127.0.0.1:${relayPort}`,{noDefaults:true});report.chrome=browser.version();
  adb('shell','am','start','-n','com.android.chrome/com.google.android.apps.chrome.Main');
  // The game holds no wake lock; keep the screen on for the run, restored below.
  adb('shell','svc','power','stayon','usb');
  adb('shell','settings','put','system','accelerometer_rotation','0');
  const rotate=target=>adb('shell','settings','put','system','user_rotation',target==='landscape'?'1':'0');
  const other=layout==='landscape'?'portrait':'landscape';
  const segmentMs=minutes*60000/variants.length,runStart=Date.now();
  for(const [index,variant] of variants.entries()){
    rotate(layout);
    page=await browser.contexts()[0].newPage();await page.bringToFront();
    page.on('pageerror',e=>report.errors.push(`${variant}: ${e}`));
    await page.addInitScript(variant=>{
      const audio=new EventTarget();audio.pause=()=>{};audio.play=()=>Promise.resolve();
      window.__dinoTest={credits:99,highscoreApiUrl:null,musicAudio:audio,transitions:false};
      localStorage.setItem('dino-fullscreen-disabled','true');localStorage.setItem('dino-effects','on');
      localStorage.setItem('dino-sound-muted','true');
      navigator.serviceWorker.register=()=>Promise.reject(Error('Isolated performance fixture'));
      if(variant.startsWith('gpu')){const get=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(type,options){
          if(type==='2d'&&options?.willReadFrequently)options={...options,willReadFrequently:false};
          return get.call(this,type,options);};}
    },variant);
    const cdp=await page.context().newCDPSession(page);
    const tapAt=async b=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
    const touch=async selector=>{await page.locator(selector).scrollIntoViewIfNeeded();const b=await page.locator(selector).boundingBox();assert(b,selector);await tapAt(b);};
    await page.goto(`${origin}/game.html`);await page.waitForFunction(()=>!!window.__dinoRunner);
    await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout==='portrait');
    await touch('#settings-open');await page.waitForFunction(()=>document.querySelector('#settings').open);
    await touch('#fullscreen-toggle');await page.waitForFunction(()=>!!document.fullscreenElement);await touch('#settings-close');
    await page.evaluate(()=>window.__dinoRunner.effectsSetting.set(true,false));
    if(variant==='gpuSingle')await page.evaluate(()=>{const r=window.__dinoRunner;r.playContext=r.previewContext;});
    await touch('#start-game');await page.waitForFunction(()=>window.__dinoGame.playing&&!window.__dinoGame.countingDown);
    await page.evaluate(([noObstacles,hide,skip,bitmapHud,directText])=>{
      const r=window.__dinoRunner,g=r.game;
      // Diagnostic: HUD pixel text straight through fillText instead of glyph canvases.
      if(directText){const family=r.renderer.hud.font.replace(/^\d+px /,'');
        if(!CSS.supports('font-family',family)||!document.fonts.check('16px '+family))throw Error('Pixel font unavailable: '+family);
        r.renderer.drawPixelText=function(text,x,y,size,color,shadow,align='left',lift=null){const c=this.ctx;
          const left=align==='right'?x-text.length*size:align==='center'?x-(text.length*size)/2:x;
          c.font=size+'px '+family;c.textBaseline='top';c.textAlign='left';
          for(let i=0;i<text.length;i++){if(text[i]===' ')continue;const dy=lift?lift(i):0;
            if(shadow){c.fillStyle=shadow;c.fillText(text[i],left+i*size+1,y+dy+1);}
            c.fillStyle=color;c.fillText(text[i],left+i*size,y+dy);}};}
      // Diagnostic: HUD glyph/run caches as ImageBitmaps instead of small canvases.
      if(bitmapHud){const toBitmap=o=>{if(o&&!(o.canvas instanceof ImageBitmap)){const c=new OffscreenCanvas(o.canvas.width,o.canvas.height);
          c.getContext('2d').drawImage(o.canvas,0,0);o.canvas=c.transferToImageBitmap();}return o;};
        const glyph=r.renderer.pixelGlyph.bind(r.renderer);r.renderer.pixelGlyph=(...a)=>toBitmap(glyph(...a));
        const text=r.renderer.drawPixelText.bind(r.renderer);r.renderer.drawPixelText=(...a)=>{for(const run of r.renderer.hudRuns.values())toBitmap(run);return text(...a);};}
      if(hide)document.head.append(Object.assign(document.createElement('style'),{textContent:hide+'{visibility:hidden!important}'}));
      for(const name of skip)r.renderer[name]=()=>{};
      if(noObstacles)g.on(e=>{if(e.type==='step')g.horizon.obstacles.length=0;});
      // Real obstacles, boss, level bonuses and night stay in the round. A simple
      // pilot jumps/ducks; missed hits still cost a life with its effects, but
      // lives are refilled before the last one so the round never ends.
      const takeHit=g.takeHit.bind(g);window.__hits=0;
      g.takeHit=o=>{if(g.lives<=1)g.lives=3;const hit=takeHit(o);if(hit)window.__hits++;return hit;};
      g.on(e=>{if(e.type!=='step'||!g.playing)return;const t=g.trex;
        const o=g.horizon.obstacles.find(o=>o.x+o.width*o.size>t.x),near=o&&o.x-(t.x+t.width)<g.speed*18;
        const high=near&&o.type.name==='ptero'&&o.y<t.y-10;
        g.duck(!!high&&!t.jumping);
        if(near&&!high&&!t.jumping)g.jump();
        if(!near&&!t.jumping&&t.ducking)g.duck(false);});
      // Active content per drawn frame. Slow frames are logged individually; every
      // frame also counts into per-tag totals so slow shares can be compared.
      const e=r.renderer.effects;
      const tags=()=>{const t=[],o=g.horizon.obstacles;
        if(g.bonus)t.push('bonus');if(g.pendingBonus)t.push('pendingBonus');
        if(g.boss.rock)t.push('rock');else if(g.boss.phase!=='idle')t.push('boss:'+g.boss.phase);
        if(g.turbo.remaining>0)t.push('turbo');if(g.turbo.pickup)t.push('chiliPickup');
        if(g.feather.charged)t.push('feather');if(g.feather.pickup)t.push('featherPickup');
        if(g.shield.charged)t.push('shield');if(g.shield.pickup)t.push('shieldPickup');if(g.shield.popRemaining>0)t.push('shieldPop');
        if(g.recoveryRemaining>0)t.push('recovery');if(g.trex.jumping)t.push('jumping');if(g.trex.ducking)t.push('ducking');
        if(e.particles.length>=40)t.push('particles40+');else if(e.particles.length>=15)t.push('particles15+');
        if(e.callouts.length)t.push('callouts');if(e.banner)t.push('banner');if(e.shakeTime>0)t.push('shake');
        if(g.meter.flash>0)t.push('meterFlash');
        const night=g.nightAlpha||0;t.push(night>=.99?'night':night>0?'dusk':'day');
        if(o.length>=3)t.push('obstacles3+');if(o.some(x=>x.type.name==='ptero'))t.push('ptero');
        return t;};
      const draw=r.draw.bind(r);window.__work=[];window.__slow=[];window.__counts={};let prev=performance.now();
      r.draw=(...args)=>{const s=performance.now(),result=draw(...args),end=performance.now(),work=end-s,delta=s-prev;prev=s;
        window.__work.push(work);const t=tags(),slow=work>8||delta>20;
        for(const k of t){const c=window.__counts[k]??={all:0,slow:0};c.all++;if(slow)c.slow++;}
        const c=window.__counts.total??={all:0,slow:0};c.all++;if(slow)c.slow++;
        if(slow&&window.__slow.length<2000)window.__slow.push({at:+(s/1000).toFixed(2),work:+work.toFixed(2),delta:+delta.toFixed(1),score:g.score,tags:t});
        return result;};
      window.__deltas=[];let last=performance.now();
      const frame=t=>{window.__deltas.push(t-last);last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
      window.__take=()=>{const ctx=r.renderer.ctx,out={deltas:window.__deltas.slice(1),work:window.__work,slow:window.__slow,counts:window.__counts,
        state:{playing:g.playing,paused:r.paused,hidden:document.hidden,fullscreen:!!document.fullscreenElement,
          score:g.score,speed:+g.speed.toFixed(2),night:+(g.nightAlpha||0).toFixed(2),boss:!!g.boss?.rock,lives:g.lives,hits:window.__hits,
          backing:[ctx.canvas.width,ctx.canvas.height],software:ctx.getContextAttributes?.().willReadFrequently??null}};
        window.__deltas=[];window.__work=[];window.__slow=[];window.__counts={};return out;};
    },[noObstacles,hide,skip,bitmapHud,directText]);
    // Trusted taps on the visible jump control while waiting; the pilot still steers.
    let jumpBox=null,taps=0;
    const wait=async ms=>{const until=Date.now()+ms;
      while(Date.now()<until){
        await page.waitForTimeout(Math.max(0,Math.min(tapMs||ms,until-Date.now())));
        if(!tapMs||Date.now()>=until)continue;
        jumpBox??=await page.locator('#touch-jump').boundingBox();
        if(jumpBox){await tapAt(jumpBox);taps++;}}};
    const started=Date.now(),end=started+segmentMs,windows=[];let lastRotation=started;
    console.log(`Segment ${index+1}/${variants.length} ${variant}: ${layout} on ${report.model}, ${(segmentMs/60000).toFixed(1)} min, `+
      `${windowMs/1000}s windows${tapMs?`, taps every ${tapMs}ms`:''}${rotateMs?`, rotation every ${rotateMs/1000}s`:''}`);
    while(Date.now()<end){
      let rotated=false;
      if(rotateMs&&Date.now()-lastRotation>=rotateMs&&end-Date.now()>windowMs){
        // Away and back, as in the functional suite; the round keeps running.
        rotate(other);await page.waitForFunction(p=>(innerHeight>innerWidth)===p,other==='portrait');await wait(4000);
        rotate(layout);await page.waitForFunction(p=>(innerHeight>innerWidth)===p,layout==='portrait');await wait(2000);
        jumpBox=null;lastRotation=Date.now();rotated=true;
        const state=await page.evaluate(()=>({paused:window.__dinoRunner.paused,playing:window.__dinoGame.playing}));
        report.rotations=[...(report.rotations||[]),{variant,t:Math.round((Date.now()-runStart)/1000),...state}];
        if(state.paused)await touch('#touch-jump').catch(()=>{});
      }
      await wait(Math.min(windowMs,end-Date.now()));
      const sample=await page.evaluate(()=>window.__take());
      const entry={variant,segment:index,t:Math.round((Date.now()-runStart)/1000),rotated,taps,...stats(sample.deltas),draw:stats(sample.work),
        ...sample.state,device:device(),slowFrames:sample.slow.length,counts:sample.counts};
      taps=0;windows.push(entry);report.windows.push(entry);
      slow.push(...sample.slow.map(x=>({variant,window:entry.t,...x})));save();
      console.log(`${String(entry.t).padStart(4)}s ${variant.padEnd(7)} ${entry.fps} FPS p95 ${entry.p95} >20ms ${entry.over20}% draw ${entry.draw?.meanMs}ms `+
        `thermal ${entry.device.thermal} ${entry.device.battery}°C score ${entry.score} hits ${entry.hits}${rotated?' rotated':''}${entry.fullscreen?'':' (not fullscreen)'}`);
      assert(entry.playing&&!entry.paused&&!entry.hidden,`Round stopped, paused or hidden: ${JSON.stringify(sample.state)}`);
    }
    await page.screenshot({path:path.join(output,`${layout}-${index}-${variant}-end.png`)});
    await page.evaluate(()=>localStorage.clear()).catch(()=>{});
    await page.close();page=null;
    report.segments.push({variant,index,...summarize(windows)});save();
  }
  report.summary=Object.fromEntries(variants.filter((v,i)=>variants.indexOf(v)===i).map(v=>[v,summarize(report.windows.filter(w=>w.variant===v))]));
  for(const [variant,s] of Object.entries(report.summary)){
    console.log(variant,JSON.stringify({...s,tags:undefined}));
    console.table(s.tags.filter(x=>x.frames>=300).slice(0,12));
  }
  save();
  assert.deepEqual(report.errors,[]);
  if(minFps!==null)for(const [variant,s] of Object.entries(report.summary))
    assert(s.minWindowFps>=minFps,`${variant} window below ${minFps} FPS: ${s.minWindowFps}`);
}finally{
  await page?.evaluate(()=>localStorage.clear()).catch(()=>{});
  await page?.close().catch(()=>{});await browser?.close().catch(()=>{});relay?.kill();
  const restore=(ns,k,v)=>adb('shell','settings',v==='null'?'delete':'put',ns,k,...(v==='null'?[]:[v]));
  const read=()=>({auto:adb('shell','settings','get','system','accelerometer_rotation'),user:adb('shell','settings','get','system','user_rotation'),
    stayOn:adb('shell','settings','get','global','stay_on_while_plugged_in')});
  if(forward)adb('forward','--remove',`tcp:${forward}`);if(reverse)adb('reverse','--remove',`tcp:${port}`);
  await new Promise(r=>server.close(r));
  // Leaving fullscreen can reset rotation settings shortly after a write (A53);
  // settle, then write and read back again until they hold.
  for(let attempt=0;attempt<4;attempt++){
    await new Promise(r=>setTimeout(r,800));
    restore('system','user_rotation',settings.user);restore('system','accelerometer_rotation',settings.auto);
    restore('global','stay_on_while_plugged_in',settings.stayOn);
    await new Promise(r=>setTimeout(r,800));
    report.restored=read();
    if(JSON.stringify(report.restored)===JSON.stringify(read())&&report.restored.auto===settings.auto&&
      report.restored.user===settings.user&&report.restored.stayOn===settings.stayOn)break;
  }
  save();
  assert.deepEqual(report.restored,settings,'Device settings restored');
}
