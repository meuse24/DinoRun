// Physical-device smoke check. Attaches only to this app's production TWA.
// No gameplay is started and no highscore is submitted. Offline mode is scoped
// to the attached page; device Wi-Fi/mobile data and other tabs are untouched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = import.meta.dirname;
const config = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.bubblewrap/config.json'), 'utf8'));
const adb = path.join(config.androidSdkPath, 'platform-tools/adb.exe');
const serial = process.env.DINO_ANDROID_SERIAL || 'RF8MB125SXA';
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const port = run('forward', 'tcp:0', 'localabstract:chrome_devtools_remote');
const output = path.resolve(root, '../output/android-twa');
fs.mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let id = 0;
let socket;
const pending = new Map();
const checks = [];
const posts = [];
function connect(url) {
  const ws = new WebSocket(url);
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject, timeout } = pending.get(m.id);
      clearTimeout(timeout);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
    if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST') {
      posts.push(m.params.request.url);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(requestId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for (let n = 0; n < 60; n++) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function tap(selector) {
  const point = await evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight};
  })()`);
  const png = execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p']);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  run('shell', 'input', 'tap', String(Math.round(point.x * width / point.w)),
    String(Math.round(point.y * height / point.h)));
}
async function screenshot(name) {
  await sleep(1200); // Allow the real menu/dialog entrance animations to settle.
  fs.writeFileSync(path.join(output, name), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p']));
}
try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  for (const target of targets.filter(t => t.url.startsWith('https://meuse24.info/apps/dino/dino.html'))) {
    socket = await connect(target.webSocketDebuggerUrl);
    if (await evaluate('document.referrer.startsWith("android-app://info.meuse24.dinorun/") && document.visibilityState === "visible"')) break;
    socket.close();
    socket = null;
  }
  assert(socket, 'Open the installed Dino Run Android app before running this check');
  await call('Page.enable');
  await call('Network.enable');
  assert(await evaluate('matchMedia("(display-mode: fullscreen)").matches'));
  checks.push('Android app referrer and fullscreen display mode');
  await tap('#info-link');
  await waitFor('document.querySelector("#help-dialog").open');
  await screenshot('help.png');
  run('shell', 'input', 'keyevent', '4');
  await waitFor('!document.querySelector("#help-dialog").open');
  checks.push('Trusted physical touch opens Help; Android Back closes Help');
  await tap('#settings-open');
  await waitFor('document.querySelector("#settings").open');
  await screenshot('settings.png');
  await tap('#settings-close');
  await waitFor('!document.querySelector("#settings").open');
  checks.push('Trusted physical touch opens and closes Settings');
  const cached = await evaluate('navigator.serviceWorker.controller?.scriptURL');
  assert(cached?.startsWith('https://meuse24.info/apps/dino/service-worker.js'));
  await evaluate('window.__twaProbeToken = true');
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await call('Page.reload');
  await waitFor('document.readyState === "complete" && !!window.__dinoRunner && !window.__twaProbeToken');
  await screenshot('offline.png');
  checks.push('Existing service-worker cache reloads the actual game with page network offline');
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  run('shell', 'input', 'keyevent', '3');
  await waitFor('document.visibilityState === "hidden"');
  run('shell', 'am', 'start', '-n', 'info.meuse24.dinorun/.LauncherActivity');
  await waitFor('document.visibilityState === "visible"');
  checks.push('Home and app relaunch restore the TWA');
  assert.equal(posts.length, 0, 'Smoke check must not submit live scores');
  await screenshot('launch.png');
  const report = { checkedAt: new Date().toISOString(), serial, model: run('shell', 'getprop', 'ro.product.model'),
    android: run('shell', 'getprop', 'ro.build.version.release'), checks, livePosts: posts.length,
    limitations: ['No gameplay, audio-signal or rotation regression in this smoke check',
      'Offline reload used an already cached website; cold first install still needs network'] };
  fs.writeFileSync(path.join(output, 'device-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch {}
    socket.close();
  }
  run('forward', '--remove', `tcp:${port}`);
}
