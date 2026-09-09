function localModuleUrl(value) {
  const url = new URL(value, self.location.href);
  if (url.origin !== self.location.origin)
    throw new Error('검증되지 않은 외부 압축 모듈은 실행할 수 없습니다.');
  return url.href;
}

self.onmessage = async ({ data: { codec, action, bytes, level, maxOutputLength, urls, presentation } }) => {
  try {
    let result;
    if (['gzip', 'zlib', 'raw-deflate'].includes(codec)) {
      const { compress, decompress } = await import('../lib/archive/deflate.js');
      result = action === 'comp'
        ? await compress(bytes, { format: codec, level })
        : await decompress(bytes, { format: codec, maxOutputLength });
    } else if (codec === 'lzma') {
      let module, io;
      try {
        module = await import('../lib/archive/lzma.js');
        if (presentation) io = await import('../lib/archive/lzma-io.js');
      }
      catch (error) {
        throw new Error('LZMA 코덱을 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.', { cause: error });
      }
      if (presentation) {
        bytes = io.decodeLzmaInput(presentation.text, presentation.ifmt);
        maxOutputLength = Math.min(128 * 1024 * 1024, bytes.length * 200);
      }
      if (action === 'comp') result = module.compress(bytes, { level });
      else if (action === 'decomp') result = module.decompress(bytes, { maxOutputLength });
      else throw new Error('지원하지 않는 LZMA 작업입니다.');
      if (presentation) {
        self.postMessage({ presentation: {
          ...io.formatLzmaOutput(result, presentation.ofmt),
          inputLength: bytes.length, outputLength: result.length,
        } });
        return;
      }
    } else if (codec === 'brotli') {
      let io;
      if (presentation) {
        try { io = await import('../lib/archive/codec-io.js'); }
        catch (error) {
          throw new Error('Brotli 입출력 모듈을 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.', { cause: error });
        }
        bytes = io.decodeCodecInput(presentation.text, presentation.ifmt, undefined, 'Brotli');
      }
      if (bytes.length > 256 * 1024 * 1024) throw new Error('Brotli 입력이 안전 한도 256 MiB를 넘습니다.');
      const inputLength = bytes.length;
      if (action === 'comp') {
        let module;
        try { module = await import('../lib/archive/brotli-encode.js'); }
        catch (error) {
          throw new Error('Brotli 압축기를 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.', { cause: error });
        }
        result = module.compress(bytes, { quality: level });
      } else if (action === 'decomp') {
        let module;
        try { module = await import(localModuleUrl(urls.brotliDecompress)); }
        catch (error) {
          throw new Error('Brotli 해제기를 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.', { cause: error });
        }
        const decompress = module.default || module.decompress || module;
        try { result = decompress(bytes); }
        catch (error) {
          throw new Error('올바른 Brotli 데이터가 아니거나 지원하지 않는 형식입니다.', { cause: error });
        }
        // The legacy decoder has no streaming limit API. Reject before transfer
        // or formatting; enforcing the limit during decoding needs its replacement.
        if (result.length > 128 * 1024 * 1024 || result.length > inputLength * 200)
          throw new Error('Brotli 해제 결과가 안전 한도(128 MiB·압축률 200:1)를 넘습니다.');
      } else throw new Error('지원하지 않는 Brotli 작업입니다.');
      if (presentation) {
        self.postMessage({ presentation: {
          ...io.formatCodecOutput(result, presentation.ofmt, 'Brotli'),
          inputLength, outputLength: result.length,
        } });
        return;
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
    const output = result instanceof Uint8Array ? result
      : result instanceof ArrayBuffer ? new Uint8Array(result)
        : ArrayBuffer.isView(result) ? new Uint8Array(result.buffer, result.byteOffset, result.byteLength)
          : Uint8Array.from(result || []);
    self.postMessage({ output }, [output.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
