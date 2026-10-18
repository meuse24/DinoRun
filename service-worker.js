const CACHE_NAME = 'dino-run-v26';
const CACHE_PREFIX = 'dino-run-';
const GAME_URL = new URL('./dino.html', self.registration.scope).href;
const STATIC_URLS = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './dino-jump-jump.mp3',
  './dino-boom-in-the-dunes.mp3',
].map((path) => new URL(path, self.registration.scope).href);
const MUSIC_URLS = ['./dino-jump-jump.mp3', './dino-boom-in-the-dunes.mp3']
  .map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all([
        cache.addAll([GAME_URL, ...STATIC_URLS.filter((url) => !MUSIC_URLS.includes(url))]),
        // Either optional song may be absent without blocking offline installation.
        ...MUSIC_URLS.map((url) => cache.add(url).catch(() => {})),
      ]),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === new URL(GAME_URL).pathname) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(GAME_URL, response.clone())),
            );
          }
          return response;
        })
        .catch(async () => (await caches.match(GAME_URL)) || Response.error()),
    );
    return;
  }

  if (!STATIC_URLS.includes(url.href)) return;

  event.respondWith(
    caches.match(url.href).then(async (cached) => {
      if (!cached) return fetch(request);
      if (!MUSIC_URLS.includes(url.href) || !request.headers.has('range')) return cached;

      // Audio players often ask for byte ranges, even when the whole song is cached.
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range'));
      if (!match) return cached;
      const blob = await cached.blob();
      const size = blob.size;
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1]
        ? match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
        : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      return new Response(blob.slice(start, end + 1), {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
          'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
        },
      });
    }),
  );
});
