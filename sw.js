// sw.js — 자체 앱 셸을 사전 캐시하고, 온라인에서는 최신 파일로 갱신한다.
const CACHE_PREFIX = 'wtools-';
const CACHE_NAME = CACHE_PREFIX + 'shell-v3';
const EXTERNAL_CACHE_PREFIX = CACHE_PREFIX + 'external-';
const EXTERNAL_CACHE_NAME = EXTERNAL_CACHE_PREFIX + 'v1';
const EXTERNAL_HOSTS = new Set([
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
]);
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './css/style.css',
  './assets/favicon-512.png',
  './js/core.js',
  './js/main.js',
  './js/tools/archive.js',
  './js/tools/cryptotools.js',
  './js/tools/dataformat.js',
  './js/tools/datetime.js',
  './js/tools/devfmt.js',
  './js/tools/encoding.js',
  './js/tools/hashing.js',
  './js/tools/mathtools.js',
  './js/tools/media.js',
  './js/tools/network.js',
  './js/tools/pki.js',
  './js/tools/stringtools.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) =>
          (key.startsWith(CACHE_PREFIX) && !key.startsWith(EXTERNAL_CACHE_PREFIX) && key !== CACHE_NAME)
          || (key.startsWith(EXTERNAL_CACHE_PREFIX) && key !== EXTERNAL_CACHE_NAME))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (!EXTERNAL_HOSTS.has(url.hostname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(EXTERNAL_CACHE_NAME);
      const cached = await cache.match(request);
      const refresh = fetch(request).then(async (response) => {
        if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
        return response;
      });
      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      return refresh;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const fallback = await caches.match(new URL('./index.html', self.registration.scope));
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
