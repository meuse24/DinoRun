import { loadPlaywright } from './helpers/playwright.mjs';
// Isolated Settings/Help modal behavior over a paused round; no live score API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const artifact=path.resolve(process.argv[2]||path.join(root,'dino.html'));
const html=fs.readFileSync(artifact,'utf8');
const engine=process.env.DINO_BROWSER||'chromium';
const output=path.join(process.env.DINO_TEST_OUTPUT||path.join(root,'output/menu-overlays'),engine);
fs.mkdirSync(output,{recursive:true});
const pw=await loadPlaywright();
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/dino.html'))res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
  else res.writeHead(204).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await pw[engine].launch({headless:true});
const errors=[],reports=[];
try {
  for(const [name,viewport] of [['desktop',{width:1280,height:900}],['portrait',{width:320,height:640}],
    ['landscape',{width:663,height:234}]]) {
    const context=await browser.newContext({viewport,serviceWorkers:'block',
      ...(name==='desktop'?{}:{isMobile:true,hasTouch:true})});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{
      localStorage.setItem('dino-fullscreen-disabled','true');
      const musicAudio=new EventTarget();musicAudio.play=()=>Promise.resolve();musicAudio.pause=()=>{};
      window.__dinoTest={credits:99,manualFrames:true,highscoreApiUrl:null,transitions:false,musicAudio};
    });
    const url=`http://127.0.0.1:${server.address().port}/dino.html`;
    await page.goto(url);await page.waitForFunction(()=>!!window.__dinoRunner);
    await page.locator('#start-game').click();
    await page.evaluate(()=>{
      window.__dinoGame.on(e=>{if(e.type==='step')window.__dinoGame.horizon.obstacles.length=0;});
      for(let i=0;i<250;i++)window.advanceTime(1000/60);
    });
    const check=async selector=>{
      const geometry=await page.locator(selector).evaluate(d=>{
        const b=d.getBoundingClientRect();return {modal:d.matches(':modal'),x:b.x,y:b.y,
          right:b.right,bottom:b.bottom,w:innerWidth,h:innerHeight};
      });
      assert(geometry.modal&&geometry.x>=15&&geometry.y>=15&&geometry.right<=geometry.w-15&&geometry.bottom<=geometry.h-15,
        'Modal leaves the gameplay visible around its edges');
      assert.equal(await page.locator('#page').isVisible(),true);
      assert.equal(await page.evaluate(()=>window.__dinoRunner.paused),true);
      const before=await page.evaluate(()=>window.__dinoGame.distance);
      await page.evaluate(()=>window.advanceTime(500));
      assert.equal(await page.evaluate(()=>window.__dinoGame.distance),before,'Background round stays frozen');
    };
    await page.locator('#settings-open').click();await check('#settings');
    await page.screenshot({path:path.join(output,name+'-settings.png')});
    await page.locator('#music-volume').scrollIntoViewIfNeeded();
    await page.locator('#music-volume').fill('25');
    assert.equal(await page.evaluate(()=>window.__dinoRunner.music.volume),25);
    await page.locator('#log-toggle').scrollIntoViewIfNeeded();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!window.__dinoRunner.paused);
    await page.locator('#info-link').click();await check('#help-dialog');
    const help=page.frameLocator('#info-view');
    await help.locator('[data-help-back]').first().focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.getElementById('page').contains(document.activeElement)),false,
      'Tab navigation cannot focus gameplay behind the Help modal');
    await help.locator('[data-help-back]').first().focus();
    await page.screenshot({path:path.join(output,name+'-help.png')});
    await help.locator('#about-version').scrollIntoViewIfNeeded();
    assert.match(await help.locator('#about-version').textContent(),/Dino Run · Version/);
    await help.locator('[data-help-back]').first().focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>location.hash!=='#info'&&!window.__dinoRunner.paused);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'info-link');
    await page.locator('#info-link').click();await page.goBack();
    await page.waitForFunction(()=>!document.getElementById('help-dialog').open&&!window.__dinoRunner.paused);
    await page.goto(url+'#info');await page.waitForFunction(()=>document.getElementById('help-dialog').open);
    await help.locator('[data-help-back]').first().click();
    await page.waitForFunction(()=>location.hash==='#game'&&!document.getElementById('help-dialog').open);
    reports.push({name,settings:'passed',help:'passed',escape:'passed',history:'passed',directLink:'passed'});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({artifact,engine,reports,errors},null,2));
  console.log(`${engine}: Settings/Help overlays, frozen gameplay, controls, Escape, history and direct links pass in 3 layouts`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
