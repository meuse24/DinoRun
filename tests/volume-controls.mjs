import { loadPlaywright } from './helpers/playwright.mjs';
// Real media volume, native input, persistence and rendered effects. No live API.
// Usage: node tests/volume-controls.mjs [game.html]; DINO_BROWSER=webkit supported.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const artifact = process.argv[2] || path.join(root, 'dino.html');
const html = fs.readFileSync(artifact, 'utf8');
const engine = process.env.DINO_BROWSER || 'chromium';
const output = path.join(process.env.DINO_TEST_OUTPUT || path.join(root, 'output/volume'),
  `${engine}-${artifact.replaceAll('\\', '/').includes('release/') ? 'release' : 'source'}`);
fs.mkdirSync(output, {recursive:true});
const pw = await loadPlaywright();
const origin = 'http://dino-volume.test', url = origin + '/dino.html';
// Ten seconds of quiet PCM audio: tests the actual media element, not a stub.
const rate = 8000, samples = rate * 10, wave = Buffer.alloc(44 + samples * 2);
wave.write('RIFF'); wave.writeUInt32LE(wave.length-8,4); wave.write('WAVEfmt ',8);
wave.writeUInt32LE(16,16); wave.writeUInt16LE(1,20); wave.writeUInt16LE(1,22);
wave.writeUInt32LE(rate,24); wave.writeUInt32LE(rate*2,28); wave.writeUInt16LE(2,32);
wave.writeUInt16LE(16,34); wave.write('data',36); wave.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++)wave.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*1800),44+i*2);
const browser = await pw[engine].launch({headless:true});
// Windows WebKit rejects PCM media with MEDIA_ERR_SRC_NOT_SUPPORTED. Keep a
// real HTMLAudioElement for volume/muted, simulate only its playback lifecycle.
const simulatedPlayback = engine==='webkit' && process.platform==='win32';
const results = [];
const close = (actual, expected) => assert(Math.abs(actual-expected)<0.001, `${actual} != ${expected}`);
// OfflineAudioContext below verifies gain curves without relying on a headless
// sound-card clock, which can stall even when the context reports running.
const state = page => page.evaluate(() => {
  const r=window.__dinoRunner;
  return {music:r.music.volume,effects:r.sound.volume,enabled:r.sound.enabled,
    mediaVolume:r.music.audio.volume,mediaMuted:r.music.audio.muted,mediaPaused:r.music.audio.paused,
    position:r.music.audio.currentTime,gain:r.sound.output?.gain.value,
    contextState:r.sound.context?.state,contextTime:r.sound.context?.currentTime,
    musicText:document.getElementById('music-volume-value').value,
    effectsText:document.getElementById('effects-volume-value').value,
    game:JSON.parse(window.render_game_to_text())};
});
const setRange = (page,name,value) => page.locator('#'+name+'-volume').evaluate((input,value) => {
  input.value=value; input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
},value);
async function fixture(viewport,preset={},denied=false) {
  const context=await browser.newContext({viewport,serviceWorkers:'block',
    ...(viewport.width===1280?{}:{isMobile:true,hasTouch:true})});
  const errors=[], requests=[];
  await context.addInitScript(({preset,denied,simulatedPlayback})=>{
    localStorage.setItem('dino-fullscreen-disabled','true');
    if(!sessionStorage.getItem('volume-fixture-seeded')) {
      for(const [key,value] of Object.entries(preset))localStorage.setItem(key,value);
      sessionStorage.setItem('volume-fixture-seeded','true');
    }
    if(denied)for(const method of ['getItem','setItem'])Storage.prototype[method]=()=>{throw new DOMException('Blocked','SecurityError');};
    let musicAudio;
    if(simulatedPlayback) {
      musicAudio=new Audio(); let paused=true, position=0, src='';
      Object.defineProperties(musicAudio,{
        paused:{get:()=>paused},currentTime:{get:()=>position,set:value=>{position=value;}},
        src:{get:()=>src,set:value=>{src=value;position=0;}},
        play:{value:()=>{paused=false;musicAudio.dispatchEvent(new Event('playing'));return Promise.resolve();}},
        pause:{value:()=>{paused=true;}},
      });
    }
    window.__dinoTest={ credits: 99,manualFrames:true,highscoreApiUrl:null,musicAudio};
  },{preset,denied,simulatedPlayback});
  await context.route('**/*',route=>{
    requests.push(route.request().url());
    if(route.request().url()===url)return route.fulfill({contentType:'text/html',body:html});
    if(['/assets/audio/dino-jump-jump.mp3','/assets/audio/dino-boom-in-the-dunes.mp3'].some(name=>route.request().url()===origin+name))
      return route.fulfill({contentType:'audio/wav',body:wave});
    return route.fulfill({status:204});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  // Transitions stay off for deterministic screenshots unless DINO_TRANSITIONS=1.
  await page.addInitScript(on => { if (window.__dinoTest) window.__dinoTest.transitions = on; }, process.env.DINO_TRANSITIONS === '1');
  await page.goto(url); await page.bringToFront();
  await page.locator('#settings-open').click();
  return {context,page,errors,requests};
}
const playing = async page => {
  try { await page.waitForFunction(()=>!window.__dinoRunner.music.audio.paused,null,{timeout:5000}); }
  catch(error) {
    const media=await page.evaluate(()=>{
      const r=window.__dinoRunner,a=r.music.audio;
      return {unavailable:r.music.unavailable,wanted:r.music.wanted,focused:document.hasFocus(),
        browserFocused:r.browser.focused,readyState:a.readyState,error:a.error?.code};
    });
    throw new Error(error.message+' '+JSON.stringify(media));
  }
};
const settled = page => page.waitForTimeout(50);
try {
  for(const [name,viewport] of [['desktop',{width:1280,height:800}],['portrait',{width:320,height:640}],['landscape',{width:844,height:390}]]) {
    const {context,page,errors,requests}=await fixture(viewport);
    try {
      await playing(page);
      let s=await state(page);
      assert.equal(s.music,45); assert.equal(s.effects,100); close(s.mediaVolume,0.45);
      assert.equal(s.musicText,'45%'); assert.equal(s.effectsText,'100%');
      const music=page.getByRole('slider',{name:'Music volume'}), effects=page.getByRole('slider',{name:'Effects volume'});
      await music.press('Home'); s=await state(page);
      assert.equal(s.music,0); assert.equal(s.mediaMuted,true); assert.equal(s.mediaPaused,true);
      assert.equal(s.effects,100);
      await music.press('ArrowRight'); await playing(page); assert.equal((await state(page)).music,1);
      await music.press('End'); assert.equal((await state(page)).music,100);
      await music.press('ArrowLeft'); assert.equal((await state(page)).music,99);
      await page.evaluate(()=>{window.__dinoRunner.music.audio.currentTime=2;});
      const position=(await state(page)).position;
      await setRange(page,'music',31); s=await state(page);
      close(s.mediaVolume,0.31); assert(s.position>=position-0.03,'Changing volume does not restart the song');
      await effects.press('Home'); await settled(page); s=await state(page);
      assert.equal(s.effects,0); assert.equal(s.mediaVolume,0.31);
      await effects.press('End'); await effects.press('ArrowLeft'); await settled(page);
      assert.equal((await state(page)).effects,99);
      await setRange(page,'effects',62); await settled(page); assert.equal((await state(page)).effects,62);
      const range=await effects.boundingBox();
      assert(range.height>=44); assert(range.width<=viewport.width);
      if(name!=='desktop') {
        await effects.scrollIntoViewIfNeeded(); const box=await effects.boundingBox();
        await page.touchscreen.tap(box.x+box.width*0.75,box.y+box.height/2);
        const touched=(await state(page)).effects;
        assert(touched>60&&touched<90,'Native touch changes the slider');
      }
      await page.locator('#sound-toggle').click(); await settled(page); s=await state(page);
      assert.equal(s.enabled,false); assert.equal(s.mediaPaused,true);
      await setRange(page,'music',27); await setRange(page,'effects',55); await settled(page);
      s=await state(page); assert.equal(s.mediaPaused,true);
      assert.equal(s.music,27); assert.equal(s.effects,55);
      await page.reload(); await page.locator('#settings-open').click();
      s=await state(page); assert.equal(s.music,27); assert.equal(s.effects,55); assert.equal(s.enabled,false);
      await page.locator('#sound-toggle').click(); await playing(page); await settled(page);
      s=await state(page); close(s.mediaVolume,0.27);
      assert.equal(s.musicText,'27%'); assert.equal(s.effectsText,'55%');
      assert.equal(await page.locator('#settings-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      await page.locator('#volume-controls').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,name+'.png')});
      assert.equal(s.game.state,'attract'); assert.equal(s.game.paused,true); assert.equal(s.game.score,0);
      assert.deepEqual(s.game.audio,{enabled:true,musicVolume:27,effectsVolume:55,track:'boom-in-the-dunes'});
      const song=page.getByRole('combobox',{name:'Theme song'});
      assert.equal(await song.inputValue(),'boom-in-the-dunes');
      await page.evaluate(()=>{window.__dinoRunner.music.audio.currentTime=2;});
      await song.focus(); await song.press('End'); await song.press('Enter');
      await playing(page);
      assert.equal(await song.inputValue(),'dino-jump-jump');
      assert.equal(await page.evaluate(()=>window.__dinoRunner.music.audio.src.endsWith('assets/audio/dino-jump-jump.mp3')),true);
      assert((await state(page)).position<1,'Switching starts the selected song from the beginning');
      close((await state(page)).mediaVolume,0.27);
      await page.reload(); await page.locator('#settings-open').click(); await playing(page);
      assert.equal(await song.inputValue(),'dino-jump-jump','Song choice survives reload');
      await page.locator('#sound-toggle').click();
      await song.selectOption('boom-in-the-dunes');
      assert.equal((await state(page)).mediaPaused,true,'Changing songs respects master mute');
      await page.locator('#sound-toggle').click(); await playing(page);
      await setRange(page,'music',0); await song.selectOption('dino-jump-jump');
      assert.equal((await state(page)).mediaPaused,true,'Changing songs respects zero music volume');
      await setRange(page,'music',27); await playing(page);
      // A missing optional track must not prevent selecting the other one.
      await page.evaluate(()=>window.__dinoRunner.music.audio.dispatchEvent(new Event('error')));
      assert.equal(await page.evaluate(()=>window.__dinoRunner.music.unavailable),true);
      await song.selectOption('boom-in-the-dunes'); await playing(page);
      assert.equal(await page.evaluate(()=>window.__dinoRunner.music.unavailable),false);
      await page.locator('#settings-close').click(); await page.locator('#start-game').click();
      assert.equal((await state(page)).mediaPaused,true,'Gameplay pauses menu music');
      await page.locator('#settings-open').click(); await playing(page);
      await song.selectOption('dino-jump-jump'); await playing(page);
      assert.equal((await state(page)).game.paused,true,'Song choice does not resume paused gameplay');
      await page.locator('#settings-close').click();
      await page.waitForFunction(()=>!window.__dinoRunner.paused && window.__dinoRunner.music.audio.paused);
      assert.equal((await state(page)).mediaPaused,true,'Closing Settings resumes gameplay without menu music');
      await page.locator('#settings-open').click();
      await song.selectOption('boom-in-the-dunes'); await playing(page);
      await song.scrollIntoViewIfNeeded();
      const songBox=await song.boundingBox();
      assert(songBox.height>=44 && songBox.width<=viewport.width,'Native song picker fits touch layouts');
      await page.screenshot({path:path.join(output,name+'-songs.png')});
      results.push({name:name+'-songs',checks:'passed'});
      if(name==='desktop' && await page.evaluate(()=>!!(window.OfflineAudioContext||window.webkitOfflineAudioContext))) {
        const audio=await page.evaluate(async()=>{
          const sound=window.__dinoRunner.sound;
          const old={context:sound.context,output:sound.output,enabled:sound.enabled,volume:sound.volume,
            stepTimer:sound.stepTimer,stepSide:sound.stepSide};
          const render=async(level,muted=false)=>{
            const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
            const offline=new Offline(1,44100*3,44100);
            sound.context={state:'running',currentTime:0,destination:offline.destination,
              createOscillator:()=>offline.createOscillator(),createGain:()=>offline.createGain(),
              createBiquadFilter:()=>offline.createBiquadFilter()};
            sound.output=offline.createGain(); sound.output.gain.value=1; sound.output.connect(offline.destination);
            sound.enabled=true; sound.volume=100; sound.stepTimer=0; sound.stepSide=0;
            sound.switchClick(true); sound.updateSteps(1000,13,true); sound.crash();
            sound.countdown(false); sound.countdown(true); sound.shield(); sound.shield(true);
            sound.death(); sound.celebrate(); sound.play(); sound.boss(); sound.boss(true);
            if(muted){sound.enabled=false;sound.updateButton();}else sound.setVolume(level);
            const data=(await offline.startRendering()).getChannelData(0);
            let energy=0;for(let i=1000;i<data.length;i++)energy+=data[i]*data[i];
            return Math.sqrt(energy/(data.length-1000));
          };
          try {
            const full=await render(100), quarter=await render(25), zero=await render(0), muted=await render(100,true);
            return {full,quarter,zero,muted};
          }finally{
            sound.stopDeath(); Object.assign(sound,old); sound.setVolume(old.volume); sound.updateButton();
          }
        });
        assert(audio.full>0.001,'Actual effects generate audio');
        assert(Math.abs(audio.quarter/audio.full-0.25)<0.0001,'All effect paths scale together');
        assert(audio.zero<1e-9,'Zero silences already scheduled sounds');
        assert(audio.muted<1e-9,'Master mute silences scheduled death and other sounds');
        await page.evaluate(()=>{const s=window.__dinoRunner.sound;s.discard();s.unlock();});
        close(await page.evaluate(()=>window.__dinoRunner.sound.output.gain.value),0.55);
        results.push({name:'rendered-effects',...audio,contextRecreation:'passed'});
      } else if(name==='desktop') {
        results.push({name:'rendered-effects',supported:false,
          reason:'OfflineAudioContext is not available in this browser build; real DSP is checked in Chromium.'});
      }
      assert.deepEqual(errors,[]);
      assert(!requests.some(request=>request.includes('highscores.php')));
      results.push({name,viewport,checks:'passed',browserErrors:errors,liveAudioClockAdvanced:s.contextTime>0});
    }finally{await context.close();}
  }
  for(const [name,preset,denied,expected] of [
    ['saved-zero',{'dino-music-volume':'0','dino-effects-volume':'0'},false,[0,0]],
    ['invalid-storage',{'dino-music-volume':'NaN','dino-effects-volume':'150','dino-music-track':'__proto__'},false,[45,100]],
    ['empty-storage',{'dino-music-volume':' ','dino-effects-volume':'-1','dino-music-track':''},false,[45,100]],
    ['blocked-storage',{},true,[45,100]],
  ]) {
    const {context,page,errors}=await fixture({width:1280,height:800},preset,denied);
    try {
      let s=await state(page); assert.deepEqual([s.music,s.effects],expected);
      assert.equal(await page.locator('#music-track').inputValue(),'boom-in-the-dunes');
      await page.locator('#music-track').selectOption('dino-jump-jump');
      await setRange(page,'music',14); await setRange(page,'effects',36);
      s=await state(page); assert.deepEqual([s.music,s.effects],[14,36]);
      await page.reload(); await page.locator('#settings-open').click();
      s=await state(page); assert.deepEqual([s.music,s.effects],denied?[45,100]:[14,36]);
      assert.equal(await page.locator('#music-track').inputValue(),denied?'boom-in-the-dunes':'dino-jump-jump');
      assert.deepEqual(errors,[]); results.push({name,checks:'passed'});
    }finally{await context.close();}
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({engine,browser:browser.version(),artifact,results,
    liveRequests:false,physicalDevice:false,mediaPlaybackSimulated:simulatedPlayback},null,2));
  const dsp=results.find(result=>result.name==='rendered-effects');
  console.log(`${engine}: volume controls, native input, persistence and mute passed (${results.length} groups; ${dsp.supported===false?'DSP unavailable in this browser build':'rendered DSP verified'})`);
}finally{await browser.close();}
