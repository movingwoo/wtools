// 서비스 워커와 브라우저 테스트가 공유하는 SHA-384 캐시 검증 헬퍼.
(function installIntegrityHelpers(scope) {
  function digestBase64(buffer) {
    return crypto.subtle.digest('SHA-384', buffer).then((digest) =>
      btoa(String.fromCharCode(...new Uint8Array(digest))));
  }

  async function responseMatches(response, integrity) {
    if (!response.ok || response.type === 'opaque') return false;
    const digest = await digestBase64(await response.clone().arrayBuffer());
    return `sha384-${digest}` === integrity;
  }

  async function verifiedCached(cache, request, integrity) {
    const cached = await cache.match(request);
    if (!cached) return null;
    if (await responseMatches(cached, integrity)) return cached;
    await cache.delete(request);
    return null;
  }

  class IntegrityError extends Error {}

  async function fetchVerified(cache, request, integrity, fetcher = fetch) {
    const response = await fetcher(request);
    if (!await responseMatches(response, integrity)) {
      await cache.delete(request);
      throw new IntegrityError('제3자 라이브러리 무결성 검증에 실패했습니다.');
    }
    await cache.put(request, response.clone());
    return response;
  }

  function integrityErrorResponse() {
    return new Response('제3자 라이브러리 무결성 검증에 실패했습니다. 새로고침 후 다시 시도하세요.', {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  scope.WTOOLS_INTEGRITY = Object.freeze({
    responseMatches,
    verifiedCached,
    fetchVerified,
    IntegrityError,
    integrityErrorResponse,
  });
})(globalThis);
