// Actual MP3 decoding, song selection and cached byte ranges. No live API.
// Usage: node tests/theme-songs.mjs [game.html]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const artifact=path.resolve(process.argv[2]||path.join(root,'dino.html'));
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/theme-songs'),
  artifact.includes(path.sep+'release'+path.sep)?'release':'source');
fs.mkdirSync(output,{recursive:true});
const tracks=['dino-boom-in-the-dunes.mp3','dino-jump-jump.mp3'];
const assets=new Map([
  ['dino.html',[artifact,'text/html; charset=utf-8']],
  ['service-worker.js',[path.join(root,'service-worker.js'),'text/javascript']],
  ['manifest.webmanifest',[path.join(root,'manifest.webmanifest'),'application/manifest+json']],
  ...['icon-180.png','icon-192.png','icon-512.png'].map(name=>[name,[path.join(root,name),'image/png']]),
  ...tracks.map(name=>[name,[path.join(root,name),'audio/mpeg']]),
]);
const requests=[];
const server=http.createServer((request,response)=>{
  const name=new URL(request.url,'http://localhost').pathname.slice(1);
  requests.push(name);
  const asset=assets.get(name);
  if(!asset){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':asset[1],'Cache-Control':'no-store'});
  fs.createReadStream(asset[0]).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const pw=await import(process.env.DINO_PLAYWRIGHT?pathToFileURL(process.env.DINO_PLAYWRIGHT).href:'playwright');
let browser;
try{
  browser=await pw.chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  await context.addInitScript(()=>{
    localStorage.setItem('dino-fullscreen-disabled','true');
    window.__dinoTest={manualFrames:true,highscoreApiUrl:null};
  });
  const page=await context.newPage();
  const errors=[], expectedRangeErrors=[];
  let testingRanges=false;
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const text=message.text();
    if(testingRanges && /Failed to load resource:.*status of 416/.test(text))expectedRangeErrors.push(text);
    else errors.push(text);
  });
  await page.goto(origin+'/dino.html');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)
      await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await page.waitForFunction(async tracks=>{
    const cache=await caches.open('dino-run-v11');
    return (await Promise.all(tracks.map(name=>cache.match(name)))).every(Boolean);
  },tracks);
  const inspect=()=>page.evaluate(()=>{
    const music=window.__dinoRunner.music, audio=music.audio;
    return {track:music.track,src:audio.src,paused:audio.paused,loop:audio.loop,
      duration:audio.duration,error:audio.error?.code||null,volume:audio.volume};
  });
  const ready=()=>page.waitForFunction(()=>{
    const a=window.__dinoRunner.music.audio;
    return a.readyState>=2 && !a.paused && !a.error;
  });
  const results=[];
  await page.locator('#settings-open').click(); await ready();
  let state=await inspect();
  assert.equal(state.track,'boom-in-the-dunes'); assert(state.loop);
  assert(state.duration>0 && state.duration<120);
  results.push({name:'new-default-real-mp3',...state});
  await page.locator('#music-track').selectOption('dino-jump-jump'); await ready();
  state=await inspect(); assert(state.src.endsWith('/dino-jump-jump.mp3'));
  results.push({name:'original-real-mp3',...state});
  await context.setOffline(true);
  await page.reload(); await page.locator('#settings-open').click(); await ready();
  assert.equal((await inspect()).track,'dino-jump-jump');
  await page.locator('#music-track').selectOption('boom-in-the-dunes'); await ready();
  results.push({name:'offline-reload-and-switch',...await inspect()});
  testingRanges=true;
  const ranges=await page.evaluate(async tracks=>{
    const results=[];
    for(const name of tracks){
      for(const range of ['bytes=0-31','bytes=-16','bytes=999999999-']){
        const response=await fetch(name,{headers:{Range:range}});
        results.push({name,range,status:response.status,contentRange:response.headers.get('Content-Range'),
          bytes:Array.from(new Uint8Array(await response.arrayBuffer()))});
      }
    }
    return results;
  },tracks);
  for(const result of ranges){
    const bytes=fs.readFileSync(path.join(root,result.name));
    if(result.range==='bytes=999999999-'){
      assert.equal(result.status,416); assert.equal(result.contentRange,`bytes */${bytes.length}`);
    }else{
      assert.equal(result.status,206);
      const start=result.range==='bytes=0-31'?0:bytes.length-16;
      const end=result.range==='bytes=0-31'?31:bytes.length-1;
      assert.equal(result.contentRange,`bytes ${start}-${end}/${bytes.length}`);
      assert.deepEqual(result.bytes,Array.from(bytes.subarray(start,end+1)));
    }
  }
  assert(!requests.some(name=>name.includes('highscores.php')));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'offline-settings.png')});
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({artifact,browser:browser.version(),
    results,ranges,errors,expectedRangeErrors,liveRequests:false,physicalDevice:false},null,2));
  console.log('Actual MP3 playback, saved selection, offline switching and six byte-range responses passed');
  await context.close();
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
