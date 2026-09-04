// 압축 / 아카이브 도구 정밀 테스트.
// 다른 구현(node zlib, python bz2/lzma)이 만든 벡터를 해제해 교차 검증하고,
// 압축 → 해제 왕복과 파일 업로드/다운로드 경로를 확인한다.
import { test, expect, toolCases, openTool, ioSection, runIO, uploadFile, grabDownload } from '../helpers.js';
import {
  brotliDecompressSync, constants, deflateRawSync, deflateSync, gunzipSync, gzipSync,
  inflateRawSync, inflateSync, zstdDecompressSync,
} from 'node:zlib';
import { execFileSync } from 'node:child_process';

const MSG = 'hello wtools compression test\n'.repeat(3); // 90바이트
// 원문 MSG를 다른 구현으로 압축한 벡터: node zlib(gzip/deflate/deflateRaw), python bz2/lzma(FORMAT_ALONE)
const V = {
  gzip: 'H4sIAAAAAAAAA8tIzcnJVygvyc/PKVZIzs8tKEotLs7Mz1MoSS0u4cqgQBYAE7HjZFoAAAA=',
  zlib: 'eJzLSM3JyVcoL8nPzylWSM7PLShKLS7OzM9TKEktLuHKoEAWADtGIsk=',
  raw: 'y0jNyclXKC/Jz88pVkjOzy0oSi0uzszPUyhJLS7hyqBAFgA=',
  bz2: 'QlpoOTFBWSZTWc+dPa0AAA1RgAAQQAAKZ9yAIABQpgAAr/VKGNTGopTTa6VMMsvW0rWhDTbLimEpshx8h+LuSKcKEhnzp7Wg',
  lzma: 'XQAAgAD//////////wA0GUnujekXifvO8YJ1YBGu5fh8G5dj9UBAJ1xbGXBa+ARSWXJ/+RdsAA==',
  brotli: 'G1kA+B2pU5+7cF2GRncn2d7mUuGNLgdB555s4ZyA5PTKoat4Ag==',
  zstd: 'KLUv/SBaLQEA8GhlbGxvIHd0b29scyBjb21wcmVzc2lvbiB0ZXN0CgEAJkjKCQ==',
};
// MSG의 Node raw DEFLATE 스트림. 앞뒤로 포맷별 헤더와 체크섬이 붙는다.
const DEFLATE_HEX = 'cb48cdc9c957282fc9cfcf295648cecf2d284a2d2ececccf5328492d2ee1caa0401600';
const FAST_DEFLATE_HEX = 'cb48cdc9c957282fc9cfcf295648cecf2d284a2d2ececccf5328492d2ee1a2441600';
const B64 = { '입력 형식': 'base64', '출력 형식': 'text' };
const JOINED_GZIP = Buffer.concat([gzipSync('첫째'), gzipSync('둘째')]).toString('base64');

function zip64WithoutRequiredExtra(zip) {
  const bytes = Buffer.from(zip);
  const central = bytes.indexOf(Buffer.from('PK\x01\x02', 'latin1'));
  const eocd = bytes.lastIndexOf(Buffer.from('PK\x05\x06', 'latin1'));
  if (central < 0 || eocd < 0) throw new Error('테스트 ZIP 구조를 찾지 못했습니다.');

  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  const prefix = Buffer.from(bytes.subarray(0, eocd));
  // GHSA-px8p-9vwx-vf98: ZIP64 크기 sentinel이 있지만 0x0001 extra field는 없다.
  prefix.writeUInt32LE(0xffffffff, central + 20);

  const zip64Eocd = Buffer.alloc(56);
  zip64Eocd.writeUInt32LE(0x06064b50, 0);
  zip64Eocd.writeBigUInt64LE(44n, 4);
  zip64Eocd.writeUInt16LE(45, 12);
  zip64Eocd.writeUInt16LE(45, 14);
  zip64Eocd.writeBigUInt64LE(1n, 24);
  zip64Eocd.writeBigUInt64LE(1n, 32);
  zip64Eocd.writeBigUInt64LE(BigInt(directorySize), 40);
  zip64Eocd.writeBigUInt64LE(BigInt(directoryOffset), 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(eocd), 8);
  locator.writeUInt32LE(1, 16);

  const legacyEocd = Buffer.from(bytes.subarray(eocd));
  legacyEocd.writeUInt16LE(0xffff, 8);
  legacyEocd.writeUInt16LE(0xffff, 10);
  legacyEocd.writeUInt32LE(0xffffffff, 12);
  legacyEocd.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([prefix, zip64Eocd, locator, legacyEocd]);
}

function testCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(nameBytes, data, extra = Buffer.alloc(0)) {
  const crc = testCrc32(data);
  const local = Buffer.alloc(30 + nameBytes.length + extra.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(extra.length, 28);
  nameBytes.copy(local, 30);
  extra.copy(local, 30 + nameBytes.length);
  data.copy(local, 30 + nameBytes.length + extra.length);

  const central = Buffer.alloc(46 + nameBytes.length + extra.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(extra.length, 30);
  central.writeUInt32LE(0x81a40000, 38);
  nameBytes.copy(central, 46);
  extra.copy(central, 46 + nameBytes.length);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

function unicodePathExtra(rawName, name) {
  const encoded = Buffer.from(name);
  const extra = Buffer.alloc(9 + encoded.length);
  extra.writeUInt16LE(0x7075, 0);
  extra.writeUInt16LE(5 + encoded.length, 2);
  extra[4] = 1;
  extra.writeUInt32LE(testCrc32(rawName), 5);
  encoded.copy(extra, 9);
  return extra;
}

function pythonDataDescriptorZip() {
  const script = [
    'import sys,zipfile',
    'class Sink:',
    ' def __init__(self): self.parts=[]; self.pos=0',
    ' def write(self,data): self.parts.append(bytes(data)); self.pos+=len(data); return len(data)',
    ' def tell(self): return self.pos',
    ' def flush(self): pass',
    'sink=Sink()',
    'with zipfile.ZipFile(sink,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z: z.writestr("설명.txt","data descriptor 교차 검증")',
    'sys.stdout.buffer.write(b"".join(sink.parts))',
  ].join('\n');
  return execFileSync('python3', ['-c', script]);
}

function withoutDescriptorSignature(zip) {
  const signature = zip.indexOf(Buffer.from('PK\x07\x08', 'latin1'));
  const eocd = zip.lastIndexOf(Buffer.from('PK\x05\x06', 'latin1'));
  if (signature < 0 || eocd < 0) throw new Error('테스트 data descriptor를 찾지 못했습니다.');
  const output = Buffer.concat([zip.subarray(0, signature), zip.subarray(signature + 4)]);
  output.writeUInt32LE(zip.readUInt32LE(eocd + 16) - 4, eocd - 4 + 16);
  return output;
}

const cases = [
  /* ---------- 다른 구현이 만든 벡터 해제 ---------- */
  { name: 'gzip: node zlib 벡터 해제', tool: 'gzip', options: B64, inputs: V.gzip, action: '해제', output: MSG },
  { name: 'gzip: 연결된 Gzip 멤버를 UI·Worker 경로로 해제', tool: 'gzip', options: B64, inputs: JOINED_GZIP, action: '해제', output: '첫째둘째' },
  { name: 'zlib: node zlib 벡터 해제', tool: 'zlib', options: B64, inputs: V.zlib, action: '해제', output: MSG },
  { name: 'raw-deflate: node zlib 벡터 해제', tool: 'raw-deflate', options: B64, inputs: V.raw, action: '해제', output: MSG },
  { name: 'lzma: python lzma(alone) 벡터 해제', tool: 'lzma', options: B64, inputs: V.lzma, action: '해제', output: MSG },
  { name: 'bzip2: python bz2 벡터 해제', tool: 'bzip2', io: 0, options: B64, inputs: V.bz2, action: '해제', output: MSG },

  /* ---------- 압축 결과 (포맷 헤더까지 확인) ---------- */
  {
    name: 'gzip: 압축 결과는 1f8b08 헤더 + deflate 스트림', tool: 'gzip', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축',
    // OS 바이트는 CompressionStream 구현에 따라 다르고, 끝 8바이트는 crc-32와 원본 길이다.
    output: new RegExp('^1f8b08000000000000[0-9a-f]{2}' + DEFLATE_HEX
      + '13b1e3645a000000\\n\\n// 원본 90B → 53B \\(41\\.1% 감소\\)$'),
  },
  {
    name: 'zlib: 레벨 6은 789c 헤더', tool: 'zlib', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축',
    output: '789c' + DEFLATE_HEX + '3b4622c9\n\n// 원본 90B → 41B (54.4% 감소)', // 끝 4바이트는 adler-32
  },
  { name: 'zlib: 레벨 1은 7801 헤더', tool: 'zlib', options: { '출력 형식': 'hex', '압축 레벨': '1' }, inputs: MSG, action: '압축', output: '7801' + FAST_DEFLATE_HEX + '3b4622c9\n\n// 원본 90B → 40B (55.6% 감소)' },
  { name: 'zlib: 레벨 9는 78da 헤더', tool: 'zlib', options: { '출력 형식': 'hex', '압축 레벨': '9' }, inputs: MSG, action: '압축', output: '78da' + FAST_DEFLATE_HEX + '3b4622c9\n\n// 원본 90B → 40B (55.6% 감소)' },
  { name: 'raw-deflate: 압축 결과가 node zlib과 일치', tool: 'raw-deflate', inputs: MSG, action: '압축', output: V.raw + '\n\n// 원본 90B → 35B (61.1% 감소)' },
  {
    // 5d = lc/lp/pb 기본값, 00002000 = 사전 크기, 5a00000000000000 = 원본 90바이트 (리틀엔디언)
    name: 'lzma: 압축 결과는 props·사전 크기·원본 길이 헤더로 시작', tool: 'lzma', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축',
    output: /^5d000020005a00000000000000.*\n\n\/\/ 원본 90B → 55B \(38\.9% 감소\)$/s,
  },
  { name: 'lz4: 압축 결과는 프레임 매직 04224d18로 시작', tool: 'lz4', options: { '출력 형식': 'hex' }, inputs: MSG, action: '압축', output: /^04224d18.*\n\n\/\/ 원본 90B → 56B \(37\.8% 감소\)$/s },

  /* ---------- 입출력 형식 ---------- */
  { name: 'gzip: Hex 입력도 같은 결과', tool: 'gzip', options: { '입력 형식': 'hex', '출력 형식': 'hex' }, inputs: '414243', action: '압축', output: /^1f8b08000000000000[0-9a-f]{2}/ },
  { name: 'zlib: 해제 결과를 Hex로 출력', tool: 'zlib', options: { '입력 형식': 'base64', '출력 형식': 'hex' }, inputs: 'eJxzBAAAQgBC', action: '해제', output: '41' },

  /* ---------- 오류 처리 ---------- */
  { name: 'gzip: 잘못된 데이터 해제는 에러', tool: 'gzip', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: '압축 데이터를 해제하지 못했습니다. 형식과 손상 여부를 확인하세요.' },
  { name: 'zlib: 잘못된 데이터 해제는 에러', tool: 'zlib', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: '압축 데이터를 해제하지 못했습니다. 형식과 손상 여부를 확인하세요.' },
  { name: 'raw-deflate: 잘린 데이터 해제는 에러', tool: 'raw-deflate', options: { '입력 형식': 'base64' }, inputs: 'y0jN', action: '해제', error: '압축 데이터를 해제하지 못했습니다. 형식과 손상 여부를 확인하세요.' },
  { name: 'lz4: 매직 넘버가 아니면 에러', tool: 'lz4', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: 'invalid magic number' },
  { name: 'lzma: 잘린 입력은 에러', tool: 'lzma', options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: '해제 실패: Error: truncated input' },
  { name: 'bzip2: bzip2 데이터가 아니면 에러', tool: 'bzip2', io: 0, options: { '입력 형식': 'base64' }, inputs: 'AAAA', action: '해제', error: 'Not bzip data: bad magic' },

  { name: 'brotli: node zlib 벡터 해제', tool: 'brotli', options: B64, inputs: V.brotli, action: '해제', output: MSG },
  { name: 'brotli: 잘못된 데이터는 에러', tool: 'brotli', options: { '입력 형식': 'hex' }, inputs: '010203', action: '해제', error: 'Invalid size nibble' },
  { name: 'zstd: node zlib 벡터 해제', tool: 'zstd', options: B64, inputs: V.zstd, action: '해제', output: MSG },
  { name: 'zstd: 잘못된 데이터는 에러', tool: 'zstd', options: { '입력 형식': 'hex' }, inputs: '010203', action: '해제', error: 'invalid zstd data' },
];

toolCases('archive', cases);

/* ---------- First-party DEFLATE engine ---------- */

test('deflate 자체 해제기: Node stored/fixed/dynamic 블록을 모두 해제', async ({ page }) => {
  const source = Buffer.from('RFC 1951 dynamic Huffman interoperability — 압축 벡터\n'.repeat(200));
  const vectors = [
    deflateRawSync(source, { level: 0 }),
    deflateRawSync(source, { strategy: constants.Z_FIXED }),
    deflateRawSync(source, { level: 9 }),
  ];
  expect(vectors.map((value) => (value[0] >>> 1) & 3)).toEqual([0, 1, 2]);
  await page.goto('/');
  const outputs = await page.evaluate(async (encoded) => {
    const { inflateRaw } = await import('/js/lib/archive/deflate.js');
    return encoded.map((base64) => {
      const binary = atob(base64);
      const input = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const output = inflateRaw(input);
      let text = '';
      for (let offset = 0; offset < output.length; offset += 0x8000)
        text += String.fromCharCode(...output.subarray(offset, offset + 0x8000));
      return btoa(text);
    });
  }, vectors.map((value) => value.toString('base64')));
  expect(outputs).toEqual(Array(3).fill(source.toString('base64')));
});

test('deflate 자체 압축기: 레벨별 raw/zlib/gzip 출력을 Node 표준 구현이 해제', async ({ page }) => {
  await page.goto('/');
  const packed = await page.evaluate(async (text) => {
    const { deflateRaw, gzip, zlib } = await import('/js/lib/archive/deflate.js');
    const input = new TextEncoder().encode(text);
    const encode = (bytes) => {
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      return btoa(binary);
    };
    return [1, 6, 9].map((level) => ({
      raw: encode(deflateRaw(input, { level })),
      gzip: encode(gzip(input, { level })),
      zlib: encode(zlib(input, { level })),
    }));
  }, MSG.repeat(50));
  for (const formats of packed) {
    expect(inflateRawSync(Buffer.from(formats.raw, 'base64')).toString()).toBe(MSG.repeat(50));
    expect(gunzipSync(Buffer.from(formats.gzip, 'base64')).toString()).toBe(MSG.repeat(50));
    expect(inflateSync(Buffer.from(formats.zlib, 'base64')).toString()).toBe(MSG.repeat(50));
  }
});

test('deflate 대용량 경로: 저장 블록 버퍼를 재사용하고 Worker 왕복 결과를 보존', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (size) => {
    const codec = await import('/js/lib/archive/deflate.js');
    const input = new Uint8Array(size);
    let state = 0x6d2b79f5;
    for (let index = 0; index < input.length; index++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      input[index] = state;
    }
    const packed = codec.deflateRaw(input, { level: 1 });
    const unpacked = codec.inflateRaw(packed, { maxOutputLength: size });
    let equal = unpacked.length === input.length;
    for (let index = 0; equal && index < input.length; index++) equal = unpacked[index] === input[index];
    return {
      equal,
      blockType: (packed[0] >>> 1) & 3,
      expectedSize: size + Math.ceil(size / 0xffff) * 5,
      packedSize: packed.length,
      backingSize: packed.buffer.byteLength,
    };
  }, 8 * 1024 * 1024);

  expect(result.equal).toBe(true);
  expect(result.blockType).toBe(0);
  expect(result.packedSize).toBe(result.expectedSize);
  expect(result.backingSize).toBe(result.packedSize);
});

test('deflate 자체 해제기: gzip 선택 헤더·연결 멤버와 체크섬·출력 상한을 검증', async ({ page }) => {
  const first = gzipSync('첫째');
  const named = Buffer.concat([
    Buffer.from([0x1f, 0x8b, 8, 8, 0, 0, 0, 0, 0, 3]),
    Buffer.from('first.txt\0'),
    first.subarray(10),
  ]);
  const joined = Buffer.concat([named, gzipSync('둘째')]);
  const corruptGzip = Buffer.from(gzipSync('checksum'));
  corruptGzip[corruptGzip.length - 8] ^= 1;
  const corruptZlib = Buffer.from(deflateSync('checksum'));
  corruptZlib[corruptZlib.length - 1] ^= 1;
  const oversized = deflateRawSync(Buffer.alloc(4096, 65));

  await page.goto('/');
  const result = await page.evaluate(async ({ joined, corruptGzip, corruptZlib, oversized }) => {
    const codec = await import('/js/lib/archive/deflate.js');
    const decode = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const message = (fn) => {
      try { fn(); return ''; }
      catch (error) { return error.message; }
    };
    return {
      joined: new TextDecoder().decode(codec.gunzip(decode(joined))),
      gzipError: message(() => codec.gunzip(decode(corruptGzip))),
      zlibError: message(() => codec.unzlib(decode(corruptZlib))),
      limitError: message(() => codec.inflateRaw(decode(oversized), { maxOutputLength: 100 })),
    };
  }, {
    joined: joined.toString('base64'),
    corruptGzip: corruptGzip.toString('base64'),
    corruptZlib: corruptZlib.toString('base64'),
    oversized: oversized.toString('base64'),
  });
  expect(result.joined).toBe('첫째둘째');
  expect(result.gzipError).toContain('CRC-32');
  expect(result.zlibError).toContain('Adler-32');
  expect(result.limitError).toContain('안전 한도 100바이트');
});

test('deflate 자체 해제기: 불완전한 동적 Huffman 트리를 거부', async ({ page }) => {
  // BFINAL=1, BTYPE=dynamic, HLIT=257, HDIST=1, HCLEN=4이고 코드 길이
  // 알파벳에는 기호 0 하나만 1비트로 둔 불완전한 트리다.
  await page.goto('/');
  const message = await page.evaluate(async () => {
    const { inflateRaw } = await import('/js/lib/archive/deflate.js');
    try {
      inflateRaw(new Uint8Array([0x05, 0x00, 0x00, 0x04]));
      return '';
    } catch (error) {
      return error.message;
    }
  });
  expect(message).toBe('DEFLATE 허프만 트리가 불완전합니다.');
});

test('zip 자체 엔진: Python data descriptor와 서명 없는 descriptor를 해제한다', async ({ page }) => {
  const signed = pythonDataDescriptorZip();
  const unsigned = withoutDescriptorSignature(signed);
  const damaged = Buffer.from(signed);
  const descriptor = damaged.indexOf(Buffer.from('PK\x07\x08', 'latin1'));
  damaged[descriptor + 4] ^= 1;
  await page.goto('/');
  const result = await page.evaluate(async ({ signed, unsigned, damaged }) => {
    const { extractZip } = await import('/js/lib/archive/zip.js');
    const decode = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const inspect = (base64) => extractZip(decode(base64)).map((entry) => ({
      name: entry.name,
      text: new TextDecoder().decode(entry.data),
      descriptor: entry.descriptor,
    }));
    let error = '';
    try { extractZip(decode(damaged)); }
    catch (caught) { error = caught.message; }
    return { signed: inspect(signed), unsigned: inspect(unsigned), error };
  }, {
    signed: signed.toString('base64'),
    unsigned: unsigned.toString('base64'),
    damaged: damaged.toString('base64'),
  });
  const expected = [{ name: '설명.txt', text: 'data descriptor 교차 검증', descriptor: true }];
  expect(result.signed).toEqual(expected);
  expect(result.unsigned).toEqual(expected);
  expect(result.error).toContain('데이터 디스크립터');
});

test('zip 자체 엔진: CP437과 Info-ZIP Unicode path 파일명을 해석한다', async ({ page }) => {
  const cp437Name = Buffer.from([0x63, 0x61, 0x66, 0x82, 0x2e, 0x74, 0x78, 0x74]);
  const legacyName = Buffer.from('legacy.txt');
  const fixtures = [
    storedZip(cp437Name, Buffer.from('cp437')),
    storedZip(legacyName, Buffer.from('unicode'), unicodePathExtra(legacyName, '경로/한글.txt')),
  ];
  await page.goto('/');
  const result = await page.evaluate(async (encoded) => {
    const { extractZip } = await import('/js/lib/archive/zip.js');
    return encoded.map((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const [entry] = extractZip(bytes);
      return [entry.name, new TextDecoder().decode(entry.data)];
    });
  }, fixtures.map((fixture) => fixture.toString('base64')));
  expect(result).toEqual([['café.txt', 'cp437'], ['경로/한글.txt', 'unicode']]);
});

test('zip 자체 엔진: 로컬 헤더 불일치와 실제 데이터 CRC 손상을 거부한다', async ({ page }) => {
  await page.goto('/');
  const messages = await page.evaluate(async () => {
    const zip = await import('/js/lib/archive/zip.js');
    const source = zip.createZip([{ name: 'safe.txt', data: new TextEncoder().encode('CRC 검증') }]);
    const mismatch = source.slice();
    new DataView(mismatch.buffer).setUint16(8, 99, true);
    const damaged = source.slice();
    const nameLength = new DataView(damaged.buffer).getUint16(26, true);
    damaged[30 + nameLength] ^= 1;
    const message = (bytes) => {
      try { zip.extractZip(bytes); return ''; }
      catch (error) { return error.message; }
    };
    return { mismatch: message(mismatch), damaged: message(damaged) };
  });
  expect(messages.mismatch).toContain('로컬 헤더와 중앙 디렉터리');
  expect(messages.damaged).toContain('CRC-32');
});

test('zip 자체 엔진: 중복·겹친 항목·심볼릭 링크·암호화 플래그를 거부한다', async ({ page }) => {
  await page.goto('/');
  const messages = await page.evaluate(async () => {
    const zip = await import('/js/lib/archive/zip.js');
    const source = zip.createZip([
      { name: 'a', data: new Uint8Array([1]) },
      { name: 'b', data: new Uint8Array([2]) },
    ]);
    const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const centralRecords = (bytes) => {
      const view = viewOf(bytes);
      const eocd = bytes.length - 22;
      let offset = view.getUint32(eocd + 16, true);
      const records = [];
      for (let index = 0; index < view.getUint16(eocd + 10, true); index++) {
        records.push(offset);
        offset += 46 + view.getUint16(offset + 28, true)
          + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
      }
      return records;
    };
    const message = (bytes) => {
      try { zip.inspectZip(bytes); return ''; }
      catch (error) { return error.message; }
    };
    const [firstCentral, secondCentral] = centralRecords(source);

    const duplicate = source.slice();
    duplicate[secondCentral + 46] = 'a'.charCodeAt(0);

    const overlapping = source.slice();
    const overlappingView = viewOf(overlapping);
    const secondLocal = overlappingView.getUint32(secondCentral + 42, true);
    const firstData = 30 + overlappingView.getUint16(26, true) + overlappingView.getUint16(28, true);
    const overlapSize = secondLocal - firstData + 1;
    overlappingView.setUint32(18, overlapSize, true);
    overlappingView.setUint32(22, overlapSize, true);
    overlappingView.setUint32(firstCentral + 20, overlapSize, true);
    overlappingView.setUint32(firstCentral + 24, overlapSize, true);

    const symlink = source.slice();
    viewOf(symlink).setUint32(firstCentral + 38, 0xa1ff0000, true);

    const encrypted = source.slice();
    viewOf(encrypted).setUint16(6, 0x0801, true);
    viewOf(encrypted).setUint16(firstCentral + 8, 0x0801, true);
    return {
      duplicate: message(duplicate), overlapping: message(overlapping),
      symlink: message(symlink), encrypted: message(encrypted),
    };
  });
  expect(messages.duplicate).toContain('중복된 ZIP 항목');
  expect(messages.overlapping).toContain('서로 겹칩니다');
  expect(messages.symlink).toContain('심볼릭 링크');
  expect(messages.encrypted).toContain('암호화');
});

test('gzip: 자체 Worker를 사용하고 취소 시 Worker를 종료하며 pako를 요청하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__archiveWorkers = [];
    window.__archiveWorkerTerminations = 0;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        window.__archiveWorkers.push(new URL(url, location.href).pathname);
      }
      postMessage(...args) { setTimeout(() => super.postMessage(...args), 200); }
      terminate() {
        window.__archiveWorkerTerminations++;
        return super.terminate();
      }
    };
  });
  const pakoRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/pako@')) pakoRequests.push(request.url());
  });
  await openTool(page, 'gzip');
  const io = ioSection(page);
  await io.locator('textarea.mono:not(.out)').fill('취소할 압축 데이터 '.repeat(20_000));
  await io.getByRole('button', { name: '압축', exact: true }).click();
  await expect(io.getByRole('button', { name: '취소', exact: true })).toBeVisible();
  await io.getByRole('button', { name: '취소', exact: true }).click();
  await expect(io.locator('.io-status')).toHaveText('작업이 취소되었습니다.');
  expect(await page.evaluate(() => window.__archiveWorkers)).toContain('/js/workers/archive-codec.js');
  expect(await page.evaluate(() => window.__archiveWorkerTerminations)).toBeGreaterThan(0);
  expect(pakoRequests).toEqual([]);
});

test('zip: 자체 Worker를 사용하고 취소 시 종료하며 fflate를 요청하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__zipWorkers = [];
    window.__zipWorkerTerminations = 0;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        window.__zipWorkers.push(new URL(url, location.href).pathname);
      }
      postMessage(...args) { setTimeout(() => super.postMessage(...args), 200); }
      terminate() {
        window.__zipWorkerTerminations++;
        return super.terminate();
      }
    };
  });
  const fflateRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/fflate@')) fflateRequests.push(request.url());
  });
  await openTool(page, 'zip');
  const content = page.locator('#content');
  await uploadFile(content, 'ZIP에 추가할 파일 선택', {
    name: 'large.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(1024 * 1024, 0x41),
  });
  await content.getByRole('button', { name: 'ZIP 다운로드' }).click();
  await expect(content.getByRole('button', { name: '취소', exact: true }).first()).toBeVisible();
  await content.getByRole('button', { name: '취소', exact: true }).first().click();
  await expect(content.locator('.io-status').first()).toHaveText('작업이 취소되었습니다.');
  expect(await page.evaluate(() => window.__zipWorkers)).toContain('/js/workers/zip.js');
  expect(await page.evaluate(() => window.__zipWorkerTerminations)).toBeGreaterThan(0);
  expect(fflateRequests).toEqual([]);
});

/* ---------- 공통 Base64 모듈 ---------- */

test('base64 공통 모듈: RFC 4648 벡터와 URL-safe 입력', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const base64 = await import('/js/lib/common/base64.js');
    const vectors = [
      ['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy'],
    ];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    return {
      encoded: vectors.map(([plain]) => base64.bytesToB64(encoder.encode(plain))),
      decoded: vectors.map(([, encoded]) => decoder.decode(base64.b64ToBytes(encoded))),
      lengths: vectors.map(([, encoded]) => base64.byteLength(encoded)),
      urlSafe: [...base64.b64ToBytes('-_8')],
      whitespace: decoder.decode(base64.b64ToBytes(' Zm9v\n')),
      compatibility: decoder.decode(base64.default.toByteArray('Zm9v')),
    };
  });

  expect(result.encoded).toEqual(['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy']);
  expect(result.decoded).toEqual(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']);
  expect(result.lengths).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(result.urlSafe).toEqual([251, 255]);
  expect(result.whitespace).toBe('foo');
  expect(result.compatibility).toBe('foo');
});

test('base64 공통 모듈: 잘못된 입력을 일관된 오류로 거부', async ({ page }) => {
  await page.goto('/');
  const errors = await page.evaluate(async () => {
    const { b64ToBytes } = await import('/js/lib/common/base64.js');
    return ['A', '@@==', 'AAAA=', 'AA=A'].map((value) => {
      try { b64ToBytes(value); return ''; }
      catch (error) { return error.message; }
    });
  });
  expect(errors).toEqual(Array(4).fill('올바른 Base64 문자열이 아닙니다.'));
});

test('base64 공통 모듈: 1 MiB 초과 입력을 청크 변환하여 복원', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { bytesToB64, b64ToBytes } = await import('/js/lib/common/base64.js');
    const input = new Uint8Array(1024 * 1024 + 3);
    for (let i = 0; i < input.length; i++) input[i] = (i * 31 + 7) & 0xff;
    const encoded = bytesToB64(input);
    const output = b64ToBytes(encoded);
    let mismatch = -1;
    for (let i = 0; i < input.length; i++) {
      if (input[i] !== output[i]) { mismatch = i; break; }
    }
    return { encodedLength: encoded.length, outputLength: output.length, mismatch };
  });

  expect(result.encodedLength).toBe(4 * Math.ceil((1024 * 1024 + 3) / 3));
  expect(result.outputLength).toBe(1024 * 1024 + 3);
  expect(result.mismatch).toBe(-1);
});

test('brotli: 빈 입력을 압축하고 다시 빈 바이트로 해제', async ({ page }) => {
  await openTool(page, 'brotli');
  const io = ioSection(page);
  const input = io.locator('textarea.mono:not(.out)');
  const output = io.locator('textarea.out');
  await input.fill('');
  await io.getByRole('button', { name: '압축', exact: true }).click();
  await expect(io).toHaveAttribute('aria-busy', 'false');
  const compressed = (await output.inputValue()).split('\n')[0];
  expect(compressed).not.toBe('');

  await io.getByLabel('입력 형식').selectOption('base64');
  await io.getByLabel('출력 형식').selectOption('text');
  await input.fill(compressed);
  await io.getByRole('button', { name: '해제', exact: true }).click();
  await expect(io).toHaveAttribute('aria-busy', 'false');
  await expect(output).toHaveValue('');
});

/* ---------- 압축 → 해제 왕복 ---------- */

const roundTrips = [
  { tool: 'gzip', name: 'Gzip' },
  { tool: 'zlib', name: 'Zlib' },
  { tool: 'raw-deflate', name: 'Raw Deflate' },
  { tool: 'lzma', name: 'LZMA' },
  { tool: 'lz4', name: 'LZ4' },
  { tool: 'brotli', name: 'Brotli' },
  { tool: 'zstd', name: 'Zstandard' },
];

for (const { tool, name } of roundTrips) {
  test(`${tool}: ${name} 압축 → 해제 왕복 (한글 포함)`, async ({ page }) => {
    await openTool(page, tool);
    const io = ioSection(page);
    const src = '압축 왕복 테스트 — WTools 🎁\n'.repeat(4);
    const packed = await runIO(io, { options: { '출력 형식': 'base64' }, inputs: src, action: '압축' });
    const base64 = packed.split('\n')[0];
    const back = await runIO(io, { options: { '입력 형식': 'base64', '출력 형식': 'text' }, inputs: base64, action: '해제' });
    expect(back).toBe(src);
  });
}

for (const { tool, decompress, magic } of [
  { tool: 'brotli', decompress: brotliDecompressSync },
  { tool: 'zstd', decompress: zstdDecompressSync, magic: '28b52ffd' },
]) {
  test(`${tool}: 브라우저 압축 결과를 Node 표준 구현으로 해제`, async ({ page }) => {
    await openTool(page, tool);
    const io = ioSection(page);
    const options = { '출력 형식': 'base64' };
    if (tool === 'zstd') options['압축 레벨'] = '10';
    const packed = await runIO(io, { options, inputs: MSG, action: '압축' });
    const bytes = Buffer.from(packed.split('\n')[0], 'base64');
    if (magic) expect(bytes.subarray(0, 4).toString('hex')).toBe(magic);
    expect(decompress(bytes).toString()).toBe(MSG);
  });
}

/* ---------- 파일 업로드 / 다운로드 ---------- */

test('gzip: 파일 압축 → 해제 왕복', async ({ page }) => {
  await openTool(page, 'gzip');
  const content = page.locator('#content');
  const fileRow = content.locator('.btn-row').filter({ hasText: '압축 (.gz)' });

  await uploadFile(content, '압축하거나 해제할 파일 선택', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from(MSG) });
  const gz = await grabDownload(page, () => fileRow.getByRole('button', { name: '압축 (.gz)' }).click());
  expect(gz.name).toBe('note.txt.gz');
  expect(gz.bytes.subarray(0, 3).toString('hex')).toBe('1f8b08');
  await expect(content.getByText('note.txt (90 B) → note.txt.gz (53 B) — 41.1% 감소')).toBeVisible();

  await uploadFile(content, '압축하거나 해제할 파일 선택', { name: 'note.txt.gz', mimeType: 'application/gzip', buffer: gz.bytes });
  const back = await grabDownload(page, () => fileRow.getByRole('button', { name: '해제', exact: true }).click());
  expect(back.name).toBe('note.txt');
  expect(back.bytes.toString()).toBe(MSG);
});

for (const { tool, ext, magic } of [
  { tool: 'brotli', ext: '.br' },
  { tool: 'zstd', ext: '.zst', magic: '28b52ffd' },
]) {
  test(`${tool}: 파일 압축 → 해제 왕복`, async ({ page }) => {
    await openTool(page, tool);
    const content = page.locator('#content');
    const fileRow = content.locator('.btn-row').filter({ hasText: `압축 (${ext})` });
    await uploadFile(content, '압축하거나 해제할 파일 선택', {
      name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from(MSG),
    });
    const packed = await grabDownload(page, () => fileRow.getByRole('button', { name: `압축 (${ext})` }).click());
    expect(packed.name).toBe('note.txt' + ext);
    if (magic) expect(packed.bytes.subarray(0, 4).toString('hex')).toBe(magic);

    await uploadFile(content, '압축하거나 해제할 파일 선택', {
      name: packed.name, mimeType: 'application/octet-stream', buffer: packed.bytes,
    });
    const back = await grabDownload(page, () => fileRow.getByRole('button', { name: '해제', exact: true }).click());
    expect(back.name).toBe('note.txt');
    expect(back.bytes.toString()).toBe(MSG);
  });
}

test('zip: 파일 묶기 → 풀기 왕복', async ({ page }) => {
  await openTool(page, 'zip');
  const content = page.locator('#content');
  const first = Buffer.from('첫 번째 파일');
  const second = Buffer.from([1, 2, 3, 4]);

  await uploadFile(content, 'ZIP에 추가할 파일 선택', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: first },
    { name: 'dir/b.bin', mimeType: 'application/octet-stream', buffer: second },
  ]);
  await expect(content.getByText('a.txt (17 B)')).toBeVisible();

  const zip = await grabDownload(page, () => content.getByRole('button', { name: 'ZIP 다운로드' }).click());
  expect(zip.name).toBe('wtools.zip');
  expect(zip.bytes.subarray(0, 4).toString('hex')).toBe('504b0304'); // PK\x03\x04

  await uploadFile(content, '해제할 ZIP 파일 선택', { name: 'wtools.zip', mimeType: 'application/zip', buffer: zip.bytes });
  const table = content.locator('table.grid');
  await expect(table).toContainText('a.txt');
  await expect(table).toContainText('dir/b.bin'); // 경로가 있는 항목도 유지
  await expect(table).toContainText('17 B');

  const saved = await grabDownload(page, () => table.locator('tr').nth(1).getByRole('button', { name: '저장' }).click());
  expect(saved.name).toBe('a.txt');
  expect(saved.bytes.equals(first)).toBe(true);
});

test('tar: 파일 묶기 → 풀기 왕복 (.tar)', async ({ page }) => {
  await openTool(page, 'tar');
  const content = page.locator('#content');
  const first = Buffer.from('tar 첫 파일');

  await uploadFile(content, 'Tar에 추가할 파일 선택', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: first },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('tar 두 번째') },
  ]);
  const tar = await grabDownload(page, () => content.getByRole('button', { name: 'Tar 다운로드' }).click());
  expect(tar.name).toBe('wtools.tar');
  expect(tar.bytes.subarray(257, 262).toString()).toBe('ustar'); // POSIX tar 시그니처
  expect(tar.bytes.length).toBe(3072); // 헤더+데이터 512×2 + 종료 블록 1024

  await uploadFile(content, '해제할 Tar 파일 선택', { name: 'wtools.tar', mimeType: 'application/x-tar', buffer: tar.bytes });
  const table = content.locator('table.grid');
  await expect(table).toContainText('a.txt');
  await expect(table).toContainText('b.txt');

  const saved = await grabDownload(page, () => table.locator('tr').nth(1).getByRole('button', { name: '저장' }).click());
  expect(saved.name).toBe('a.txt');
  expect(saved.bytes.equals(first)).toBe(true);
});

test('tar: gzip 옵션은 .tar.gz로 묶고 풀 때 자동 해제', async ({ page }) => {
  await openTool(page, 'tar');
  const content = page.locator('#content');

  await uploadFile(content, 'Tar에 추가할 파일 선택', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('tar gzip 테스트') });
  await content.getByLabel('gzip 압축 (.tar.gz)').check();
  const tgz = await grabDownload(page, () => content.getByRole('button', { name: 'Tar 다운로드' }).click());
  expect(tgz.name).toBe('wtools.tar.gz');
  expect(tgz.bytes.subarray(0, 2).toString('hex')).toBe('1f8b');

  await uploadFile(content, '해제할 Tar 파일 선택', { name: 'wtools.tar.gz', mimeType: 'application/gzip', buffer: tgz.bytes });
  await expect(content.locator('table.grid')).toContainText('a.txt');
});

test('zip: UTF-8·디렉터리·중복 이름을 Python zipfile과 교차 검증한다', async ({ page }) => {
  await openTool(page, 'zip');
  const content = page.locator('#content');
  await uploadFile(content, 'ZIP에 추가할 파일 선택', [
    { name: '한글.txt', mimeType: 'text/plain', buffer: Buffer.from('내용') },
    { name: '폴더/', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) },
    { name: '같음.txt', mimeType: 'text/plain', buffer: Buffer.from('첫째') },
    { name: '같음.txt', mimeType: 'text/plain', buffer: Buffer.from('둘째') },
  ]);
  const zip = await grabDownload(page, () => content.getByRole('button', { name: 'ZIP 다운로드' }).click());
  const script = [
    'import io,json,sys,zipfile',
    'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
    'print(json.dumps([[i.filename,i.is_dir(),i.file_size] for i in z.infolist()],ensure_ascii=False))',
  ].join(';');
  const entries = JSON.parse(execFileSync('python3', ['-c', script], { input: zip.bytes, encoding: 'utf8' }));
  expect(entries).toContainEqual(['한글.txt', false, Buffer.byteLength('내용')]);
  expect(entries.some(([name, isDir]) => name === '폴더/' && isDir)).toBe(true);
  expect(entries.filter(([name]) => name.startsWith('같음')).map(([name]) => name))
    .toEqual(['같음.txt', '같음 (2).txt']);
});

test('tar: UTF-8 긴 USTAR 경로를 Python tarfile과 교차 검증한다', async ({ page }) => {
  await openTool(page, 'tar');
  const content = page.locator('#content');
  const longName = `${'prefix'.repeat(18)}/${'한글'.repeat(15)}.txt`;
  await uploadFile(content, 'Tar에 추가할 파일 선택', {
    name: longName, mimeType: 'text/plain', buffer: Buffer.from('긴 경로'),
  });
  const tar = await grabDownload(page, () => content.getByRole('button', { name: 'Tar 다운로드' }).click());
  const script = [
    'import io,json,sys,tarfile',
    't=tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read()),mode="r:")',
    'print(json.dumps([[i.name,i.size] for i in t.getmembers()],ensure_ascii=False))',
  ].join(';');
  expect(JSON.parse(execFileSync('python3', ['-c', script], { input: tar.bytes, encoding: 'utf8' })))
    .toEqual([[longName, Buffer.byteLength('긴 경로')]]);
});

test('zip: 경로 순회·CRC 오류·압축 폭탄·손상 ZIP64를 해제 전에 거부한다', async ({ page }) => {
  await openTool(page, 'zip');
  const content = page.locator('#content');
  await uploadFile(content, 'ZIP에 추가할 파일 선택', {
    name: 'safe.txt', mimeType: 'text/plain', buffer: Buffer.from('안전한 내용'),
  });
  const made = await grabDownload(page, () => content.getByRole('button', { name: 'ZIP 다운로드' }).click());
  const central = made.bytes.indexOf(Buffer.from('PK\x01\x02', 'latin1'));
  expect(central).toBeGreaterThan(0);

  const traversal = Buffer.from(made.bytes);
  for (let at = 0; (at = traversal.indexOf(Buffer.from('safe.txt'), at)) >= 0; at += 8)
    Buffer.from('../x.txt').copy(traversal, at);
  await uploadFile(content, '해제할 ZIP 파일 선택', { name: 'traversal.zip', mimeType: 'application/zip', buffer: traversal });
  await expect(content.locator('.error').first()).toContainText(/안전하지 않은|경로/);

  const crc = Buffer.from(made.bytes);
  crc.writeUInt32LE((crc.readUInt32LE(central + 16) ^ 1) >>> 0, central + 16);
  await uploadFile(content, '해제할 ZIP 파일 선택', { name: 'crc.zip', mimeType: 'application/zip', buffer: crc });
  await expect(content.locator('.error').first()).toContainText('CRC-32');

  const bomb = Buffer.from(made.bytes);
  bomb.writeUInt32LE(129 * 1024 * 1024, central + 24);
  await uploadFile(content, '해제할 ZIP 파일 선택', { name: 'bomb.zip', mimeType: 'application/zip', buffer: bomb });
  await expect(content.locator('.error').first()).toContainText(/항목 한도|128\.0 MiB/);

  const malformedZip64 = zip64WithoutRequiredExtra(made.bytes);
  await uploadFile(content, '해제할 ZIP 파일 선택', {
    name: 'missing-zip64-extra.zip', mimeType: 'application/zip', buffer: malformedZip64,
  });
  await expect(content.locator('.error').first()).toContainText('ZIP64 형식');
});

test('bzip2: 파일 해제와 미리보기', async ({ page }) => {
  await openTool(page, 'bzip2');
  const content = page.locator('#content');

  await uploadFile(content, '해제할 Bzip2 파일 선택', { name: 'note.txt.bz2', mimeType: 'application/x-bzip2', buffer: Buffer.from(V.bz2, 'base64') });
  await expect(content.locator('pre.out-html').first()).toHaveText(MSG);
  await expect(content.getByText('note.txt.bz2 → 90 bytes')).toBeVisible();

  const saved = await grabDownload(page, () => content.getByRole('button', { name: '다운로드' }).click());
  expect(saved.name).toBe('note.txt');
  expect(saved.bytes.toString()).toBe(MSG);
});
