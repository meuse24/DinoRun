// Safe physical-phone preview. No live highscore API or required test assets.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dino.html'), 'utf8').replace('<script>',
  '<script>window.__dinoTest = { highscoreApiUrl: null };</script><script>');
const assets = { 'service-worker.js': 'text/javascript', 'manifest.webmanifest': 'application/manifest+json',
  'icon-192.png': 'image/png', 'icon-512.png': 'image/png', 'icon-180.png': 'image/png',
  'dino-jump-jump.mp3': 'audio/mpeg' };
http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1);
  response.setHeader('Cache-Control', 'no-store');
  if (name === 'dino.html' || name === '') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(source);
  } else if (Object.hasOwn(assets, name) && fs.existsSync(path.join(root, name))) {
    response.writeHead(200, { 'Content-Type': assets[name] });
    fs.createReadStream(path.join(root, name)).pipe(response);
  } else response.writeHead(404).end();
}).listen(8877, '127.0.0.1', () => console.log('Hardware test ready: http://127.0.0.1:8877/dino.html (live scores disabled)'));
