// Local preview for dino.html. The public highscore API is proxied through this
// loopback server so the game can use its normal same-origin API URL on a phone.
// Run with: node dev-server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { HOSTED_ASSETS } = require('./scripts/lib/hosted-assets.cjs');

const root = __dirname;
const port = Number(process.env.DINO_DEV_PORT || 8765);
const upstream = 'https://meuse24.info/apps/dino/highscores.php';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

function sendJson(response, status, error) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify({ v: 1, error }));
}

async function proxyHighscores(request, response, url) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, POST' });
    response.end();
    return;
  }
  let body;
  if (request.method === 'POST') {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 2048) return sendJson(response, 413, 'body_too_large');
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
  }
  try {
    const target = new URL(upstream);
    if (request.method === 'GET') target.search = url.search;
    const remote = await fetch(target, {
      method: request.method,
      body,
      headers: body ? { 'Content-Type': 'text/plain; charset=utf-8' } : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(3500),
    });
    const payload = Buffer.from(await remote.arrayBuffer());
    response.writeHead(remote.status, {
      'Content-Type': remote.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(payload);
  } catch (error) {
    console.error('Highscore proxy:', error.message);
    sendJson(response, 503, 'server');
  }
}

const server = http.createServer((request, response) => {
  let url;
  try {
    url = new URL(request.url, 'http://127.0.0.1');
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (url.pathname === '/highscores.php') {
    void proxyHighscores(request, response, url);
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const name = url.pathname === '/' ? 'dino.html' : url.pathname.slice(1);
  const extension = path.extname(name).toLowerCase();
  const allowedPath = name === path.basename(name) || HOSTED_ASSETS.includes(name);
  if (!types[extension] || !allowedPath || name.startsWith('.')) {
    response.writeHead(404).end();
    return;
  }
  const file = path.join(root, name);
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extension],
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Dino Run preview: http://127.0.0.1:${port}/dino.html`);
});
