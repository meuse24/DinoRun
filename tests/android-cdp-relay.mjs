// Optional CDP bridge for phones where attaching to existing Chrome tabs hangs.
// Only targets created by this connection are attached; existing tabs are left alone.
// Uses Playwright's bundled ws dependency, without adding a runtime dependency.
import http from 'node:http';
import { createRequire } from 'node:module';
import { playwrightUrl } from './helpers/playwright.mjs';
const require = createRequire(playwrightUrl());
const bundle = require('playwright-core/lib/utilsBundle');
const WebSocketServer = bundle.wsServer, WebSocket = bundle.ws;
const port = Number(process.env.DINO_CDP_RELAY_PORT || 9224);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid relay port');
const upstreamUrl = process.env.DINO_CDP_UPSTREAM || 'http://127.0.0.1:9223';
const version = await fetch(new URL('/json/version', upstreamUrl), { signal: AbortSignal.timeout(10000) });
if (!version.ok) throw new Error('Cannot read upstream CDP version: ' + version.status);
const upstream = (await version.json()).webSocketDebuggerUrl;
const server = http.createServer((req, res) => {
  if (req.url === '/json/version' || req.url === '/json/version/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser` }));
  } else res.writeHead(404).end();
});
const wss = new WebSocketServer({ server });
wss.on('connection', client => {
  const remote = new WebSocket(upstream);
  const creates = new Set(), pending = new Map();
  let internalId = -1;
  const queue = [];
  const forward = raw => {
    const message = JSON.parse(raw.toString());
    // Disable root auto-attach, which otherwise initializes every existing tab.
    // Page-session auto-attach remains intact for our own child frames.
    if (!message.sessionId && message.method === 'Target.setAutoAttach')
      message.params = { ...message.params, filter: [{ exclude: true }] };
    if (message.method === 'Target.createTarget') creates.add(message.id);
    remote.send(JSON.stringify(message));
  };
  client.on('message', raw => {
    if (remote.readyState === WebSocket.OPEN) forward(raw);
    else queue.push(raw);
  });
  remote.on('open', () => { for (const raw of queue) forward(raw); queue.length = 0; });
  remote.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (creates.has(message.id) && message.result?.targetId) {
      creates.delete(message.id);
      const id = internalId--;
      pending.set(id, message);
      remote.send(JSON.stringify({ id, method: 'Target.attachToTarget',
        params: { targetId: message.result.targetId, flatten: true } }));
      return;
    }
    if (creates.has(message.id)) creates.delete(message.id);
    if (pending.has(message.id)) {
      const response = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) { delete response.result; response.error = message.error; }
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(response));
      return;
    }
    if (client.readyState === WebSocket.OPEN) client.send(raw.toString());
  });
  client.on('close', () => remote.close());
  client.on('error', () => remote.close());
  remote.on('close', () => client.close());
  remote.on('error', () => client.close());
});
server.listen(port, '127.0.0.1', () => console.log(`Scoped phone CDP relay ready on ${port}`));
