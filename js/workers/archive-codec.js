self.onmessage = async ({ data: { codec, action, bytes, level, maxOutputLength, presentation } }) => {
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
        try { module = await import('../lib/archive/brotli-decode.js'); }
        catch (error) {
          throw new Error('Brotli 해제기를 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.', { cause: error });
        }
        let dictionary;
        try {
          const response = await fetch(new URL('../../assets/data/brotli-dictionary.bin', import.meta.url), {
            integrity: 'sha384-vgm9zVi3hfqZC+cctW9pHKRtXEAzj2paW80JDiNwCQ4tU3DjQE7Axn9q1eAF/oTr',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          dictionary = new Uint8Array(await response.arrayBuffer());
          if (dictionary.length !== 122784) throw new Error('Invalid dictionary length');
        }
        catch (error) {
          throw new Error('Brotli 표준 사전을 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.', { cause: error });
        }
        result = module.decompress(bytes, { dictionary, maxOutputLength });
      } else throw new Error('지원하지 않는 Brotli 작업입니다.');
      if (presentation) {
        self.postMessage({ presentation: {
          ...io.formatCodecOutput(result, presentation.ofmt, 'Brotli'),
          inputLength, outputLength: result.length,
        } });
        return;
      }
    } else if (['zstd', 'bzip2', 'lz4'].includes(codec)) {
      const name = { zstd: 'Zstandard', bzip2: 'Bzip2', lz4: 'LZ4' }[codec];
      let io, module;
      try {
        if (presentation) io = await import('../lib/archive/codec-io.js');
        if (codec === 'zstd') module = action === 'comp'
          ? await import('../lib/archive/zstd-encode.js') : await import('../lib/archive/zstd-decode.js');
        else if (codec === 'bzip2') module = await import('../lib/archive/bzip2.js');
        else module = await import('../lib/archive/lz4.js');
      } catch (error) {
        throw new Error(`${name} 코덱을 불러오지 못했습니다. 연결 상태를 확인하고 다시 실행하세요.`, { cause: error });
      }
      if (presentation) bytes = io.decodeCodecInput(presentation.text, presentation.ifmt, undefined, name);
      if (!(bytes instanceof Uint8Array) || bytes.length > 256 * 1024 * 1024)
        throw new Error(`${name} 입력은 256 MiB 이하의 바이트 배열이어야 합니다.`);
      const inputLength = bytes.length;
      if (action === 'comp' && codec !== 'bzip2') result = module.compress(bytes, { level });
      else if (action === 'decomp') result = module.decompress(bytes, { maxOutputLength });
      else throw new Error(`지원하지 않는 ${name} 작업입니다.`);
      if (presentation) {
        self.postMessage({ presentation: {
          ...io.formatCodecOutput(result, presentation.ofmt, name),
          inputLength, outputLength: result.length,
        } });
        return;
      }
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
