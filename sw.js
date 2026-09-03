// sw.js — 자체 앱 셸을 사전 캐시하고, 온라인에서는 최신 파일로 갱신한다.
importScripts('./js/dependencies.js');
importScripts('./js/sw-integrity.js');

const CACHE_PREFIX = 'wtools-';
// scripts/update_cache_version.py가 앱 셸 내용의 SHA-256 앞 12자리와 일치시킨다.
const CACHE_REVISION = 'a5a512a1e4b8';
const CACHE_NAME = CACHE_PREFIX + 'shell-' + CACHE_REVISION;
const EXTERNAL_CACHE_PREFIX = CACHE_PREFIX + 'external-';
const EXTERNAL_CACHE_NAME = EXTERNAL_CACHE_PREFIX + 'v13';
const dependencies = self.WTOOLS_DEPENDENCIES;
const externalIntegrity = new Map(Object.values(dependencies.cdn)
  .map(({ url, integrity }) => [url, integrity]));
const vendoredIntegrity = new Map(Object.values(dependencies.vendored)
  .map(({ path, integrity }) => [new URL('./' + path, self.registration.scope).href, integrity]));
const {
  responseMatches,
  verifiedCached,
  fetchVerified,
  IntegrityError,
  diagnosticErrorResponse,
  integrityErrorResponse,
} = self.WTOOLS_INTEGRITY;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './css/style.css',
  './assets/favicon-192.png',
  './assets/favicon-512.png',
  './assets/favicon-512-maskable.png',
  './assets/data/emoji.json',
  './assets/data/network-reference.json',
  './assets/data/figlet/Banner.flf',
  './assets/data/figlet/Big.flf',
  './assets/data/figlet/Block.flf',
  './assets/data/figlet/Doom.flf',
  './assets/data/figlet/Ghost.flf',
  './assets/data/figlet/Shadow.flf',
  './assets/data/figlet/Slant.flf',
  './assets/data/figlet/Small.flf',
  './assets/data/figlet/Speed.flf',
  './assets/data/figlet/Standard.flf',
  './assets/vendor/crypto-js-4.2.0.min.js',
  './assets/eff-short-wordlist-1.txt',
  './assets/vendor/brotli-compress-1.3.3.mjs',
  './assets/vendor/brotli-decompress-1.3.3.mjs',
  './assets/vendor/fzstd-0.1.1.mjs',
  './assets/vendor/lz4js-0.2.0.mjs',
  './assets/vendor/openpgp-5.11.3.min.mjs',
  './assets/vendor/seek-bzip-2.0.0.mjs',
  './assets/vendor/zstd-compress-0.0.27.mjs',
  './assets/vendor/zstd-wasm-0.0.27.wasm',
  './js/core.js',
  './js/dependencies.js',
  './js/lib/common/base64.js',
  './js/lib/code/syntax-highlighter.js',
  './js/lib/code/formatter.js',
  './js/lib/code/sql-formatter.js',
  './js/lib/data/yaml.js',
  './js/lib/data/toml.js',
  './js/lib/data/jsonpath.js',
  './js/lib/data/jmespath.js',
  './js/lib/data/json-schema.js',
  './js/lib/crypto/md4.js',
  './js/lib/diff/myers.js',
  './js/lib/media/image-data.js',
  './js/lib/media/gif.js',
  './js/lib/markdown/parser.js',
  './js/lib/network/user-agent.js',
  './js/lib/qr/encoder.js',
  './js/lib/qr/decoder.js',
  './js/lib/text/figlet.js',
  './js/main.js',
  './js/tool-manifest.js',
  './js/sw-integrity.js',
  './js/theme.js',
  './js/tools/archive.js',
  './js/tools/cryptotools.js',
  './js/tools/dataformat.js',
  './js/tools/datetime.js',
  './js/tools/devfmt-format.js',
  './js/tools/devfmt-convert.js',
  './js/tools/devfmt-diff.js',
  './js/tools/devfmt-reference.js',
  './js/tools/encoding.js',
  './js/tools/hashing.js',
  './js/tools/mathtools.js',
  './js/tools/media.js',
  './js/tools/network.js',
  './js/tools/pki.js',
  './js/tools/stringtools.js',
  './js/workers/archive-codec.js',
  './js/workers/code-format.js',
  './js/workers/file-hash.js',
  './js/workers/gif-encode.js',
  './js/workers/jsonpath.js',
  './js/workers/jmespath.js',
  './js/workers/json-schema.js',
  './js/workers/markdown-render.js',
  './js/workers/qr-decode.js',
  './js/workers/text-diff.js',
  './js/workers/toml.js',
  './js/workers/yaml.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (ref) => {
      const request = new Request(new URL(ref, self.registration.scope), { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`앱 셸을 가져오지 못했습니다: ${ref}`);
      const integrity = vendoredIntegrity.get(request.url);
      if (integrity && !await responseMatches(response, integrity)) {
        throw new Error(`제3자 자산 무결성 검증에 실패했습니다: ${ref}`);
      }
      await cache.put(request, response);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldExternalNames = keys.filter((key) =>
      key.startsWith(EXTERNAL_CACHE_PREFIX) && key !== EXTERNAL_CACHE_NAME);
    const external = await caches.open(EXTERNAL_CACHE_NAME);
    for (const [url, integrity] of externalIntegrity) {
      const request = new Request(url);
      if (await verifiedCached(external, request, integrity)) continue;
      for (const name of oldExternalNames) {
        const cached = await verifiedCached(await caches.open(name), request, integrity);
        if (!cached) continue;
        await external.put(request, cached.clone());
        break;
      }
    }
    await Promise.all(keys.filter((key) =>
      (key.startsWith(CACHE_PREFIX) && !key.startsWith(EXTERNAL_CACHE_PREFIX) && key !== CACHE_NAME)
      || oldExternalNames.includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    const integrity = externalIntegrity.get(url.href);
    if (!integrity) return;
    event.respondWith((async () => {
      const cache = await caches.open(EXTERNAL_CACHE_NAME);
      const cached = await verifiedCached(cache, request, integrity);
      const refresh = fetchVerified(cache, request, integrity);
      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      try {
        return await refresh;
      } catch {
        return integrityErrorResponse();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const integrity = vendoredIntegrity.get(url.href);
    if (integrity) {
      const cache = await caches.open(CACHE_NAME);
      try {
        return await fetchVerified(cache, request, integrity);
      } catch (error) {
        if (error instanceof IntegrityError) return integrityErrorResponse();
        const cached = await verifiedCached(cache, request, integrity);
        return cached || integrityErrorResponse();
      }
    }
    try {
      const response = await fetch(request);
      if (request.mode === 'navigate' && response.status === 404) {
        const fallback = await caches.match(new URL('./index.html', self.registration.scope));
        if (fallback) return fallback;
      }
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
      return diagnosticErrorResponse('SWN001', '오프라인 캐시에서 요청한 자산을 찾지 못했습니다.', 503);
    }
  })());
});
