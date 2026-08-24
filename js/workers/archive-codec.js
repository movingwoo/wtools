function localModuleUrl(value) {
  const url = new URL(value, self.location.href);
  if (url.origin !== self.location.origin)
    throw new Error('검증되지 않은 외부 압축 모듈은 실행할 수 없습니다.');
  return url.href;
}

self.onmessage = async ({ data: { codec, action, bytes, level, urls } }) => {
  try {
    let result;
    if (codec === 'brotli') {
      if (action === 'comp') {
        const module = await import(localModuleUrl(urls.brotliCompress));
        result = await module.compress(bytes, { quality: level });
      } else {
        const module = await import(localModuleUrl(urls.brotliDecompress));
        const decompress = module.default || module.decompress || module;
        result = decompress(bytes);
      }
    } else if (codec === 'zstd') {
      if (action === 'comp') {
        const module = await import(localModuleUrl(urls.zstdCompress));
        await module.init();
        result = module.compress(bytes, level);
      } else {
        const module = await import(localModuleUrl(urls.zstdDecompress));
        result = module.decompress(bytes);
      }
    } else if (codec === 'bzip2' && action === 'decomp') {
      const module = await import(localModuleUrl(urls.bzip2Decompress));
      result = (module.default || module).decode(bytes);
    } else throw new Error('지원하지 않는 압축 작업입니다.');
    const output = Uint8Array.from(result || []);
    self.postMessage({ output }, [output.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
