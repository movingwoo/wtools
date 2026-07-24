// sw.js — 자체 앱 셸을 사전 캐시하고, 온라인에서는 최신 파일로 갱신한다.
const CACHE_PREFIX = 'wtools-';
const CACHE_NAME = CACHE_PREFIX + 'shell-v2';
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
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

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
