// 해싱 도구 정밀 테스트 — NIST/RFC 표준 테스트 벡터 사용.
import { execFileSync } from 'node:child_process';
import { test, expect, toolCases, openTool, uploadFile } from '../helpers.js';

const MD4_RFC_1320_VECTORS = [
  ['', '31d6cfe0d16ae931b73c59d7e0c089c0'],
  ['a', 'bde52cb31de33e46245e05fbdbd6fb24'],
  ['abc', 'a448017aaf21d8525fc10ae87aa6729d'],
  ['message digest', 'd9130a8164549fe818874806e1c7014b'],
  ['abcdefghijklmnopqrstuvwxyz', 'd79e1c308aa5bbcdeea8ed63df412da9'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', '043f8582f241db351ce627e153e7f0e4'],
  ['12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    'e33b4ddc9c38f2199c3e7b164fcc0536'],
];

const MD4_STREAM_SIZES = [0, 1, 55, 56, 63, 64, 65, 2 * 1024 * 1024 + 17];

function opensslMd4Vectors(sizes) {
  const script = `
    const { createHash } = require('node:crypto');
    const sizes = JSON.parse(process.argv[1]);
    const result = {};
    for (const size of sizes) {
      const bytes = Buffer.alloc(size);
      for (let i = 0; i < size; i++) bytes[i] = (i * 31 + size) & 255;
      result[size] = createHash('md4').update(bytes).digest('hex');
    }
    process.stdout.write(JSON.stringify(result));
  `;
  return JSON.parse(execFileSync(process.execPath,
    ['--openssl-legacy-provider', '-e', script, JSON.stringify(sizes)], { encoding: 'utf8' }));
}

test('MD4: RFC 1320 공개 벡터와 일치', async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async (vectors) => {
    const { md4Hex } = await import('/js/lib/crypto/md4.js');
    const encoder = new TextEncoder();
    return vectors.map(([input]) => md4Hex(encoder.encode(input)));
  }, MD4_RFC_1320_VECTORS);
  expect(actual).toEqual(MD4_RFC_1320_VECTORS.map(([, expected]) => expected));
});

test('MD4: 블록 경계와 File.slice 청크 입력을 OpenSSL과 교차 검증', async ({ page }) => {
  test.setTimeout(60_000);
  const expected = opensslMd4Vectors(MD4_STREAM_SIZES);
  await page.goto('/');
  const actual = await page.evaluate(async (sizes) => {
    const { createMd4, md4Hex } = await import('/js/lib/crypto/md4.js');
    const makeBytes = (size) => {
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = (i * 31 + size) & 255;
      return bytes;
    };
    const results = {};
    for (const size of sizes) {
      const bytes = makeBytes(size);
      const streamed = createMd4();
      const chunkSizes = [1, 7, 64, 3, 255, 1024, 65537];
      let offset = 0;
      let chunkIndex = 0;
      while (offset < bytes.length) {
        const end = Math.min(offset + chunkSizes[chunkIndex++ % chunkSizes.length], bytes.length);
        streamed.update(bytes.subarray(offset, end));
        offset = end;
      }

      const file = new File([bytes], `md4-${size}.bin`);
      const fileStreamed = createMd4();
      for (let start = 0; start < file.size; start += 2 * 1024 * 1024) {
        const chunk = await file.slice(start, start + 2 * 1024 * 1024).arrayBuffer();
        fileStreamed.update(new Uint8Array(chunk));
      }
      results[size] = {
        oneShot: md4Hex(bytes),
        streamed: streamed.digestHex(),
        fileStreamed: fileStreamed.digestHex(),
      };
    }
    return results;
  }, MD4_STREAM_SIZES);

  for (const size of MD4_STREAM_SIZES) {
    expect(actual[size]).toEqual({
      oneShot: expected[size],
      streamed: expected[size],
      fileStreamed: expected[size],
    });
  }
});

test('MD4: 바이트 입력과 완료 상태를 명확히 검사', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createMd4, md4Hex } = await import('/js/lib/crypto/md4.js');
    const encoder = new TextEncoder();
    const hash = createMd4().update(encoder.encode('abc'));
    const first = hash.digestHex();
    const second = hash.digestHex();
    let inputError = '';
    let finishedError = '';
    try { createMd4().update('abc'); } catch (error) { inputError = error.message; }
    try { hash.update(new Uint8Array()); } catch (error) { finishedError = error.message; }
    const buffer = encoder.encode('abc').buffer;
    return {
      first,
      second,
      arrayBuffer: md4Hex(buffer),
      dataView: md4Hex(new DataView(buffer)),
      inputError,
      finishedError,
    };
  });
  expect(result).toEqual({
    first: 'a448017aaf21d8525fc10ae87aa6729d',
    second: 'a448017aaf21d8525fc10ae87aa6729d',
    arrayBuffer: 'a448017aaf21d8525fc10ae87aa6729d',
    dataView: 'a448017aaf21d8525fc10ae87aa6729d',
    inputError: 'MD4 입력은 바이트 배열이어야 합니다.',
    finishedError: 'MD4 해시 계산이 이미 완료되었습니다.',
  });
});

test('hash: 약한 레거시 해시의 보안 용도 비권장 안내', async ({ page }) => {
  await openTool(page, 'hash');
  await expect(page.locator('#content .note:not(.large-input-warning)')).toContainText(
    'MD2, MD4, MD5, SHA-0, SHA-1은 현대 보안 용도로 안전하지 않습니다.',
  );
});

const cases = [
  // 해시 생성 — "abc"의 표준 벡터 (RFC 1319/1320, FIPS 180/202)
  {
    name: 'hash: "abc" 표준 벡터 전체', tool: 'hash', inputs: 'abc',
    kv: {
      'MD2': 'da853b0d3f88d99b30283a69e6ded6bb',
      'MD4': 'a448017aaf21d8525fc10ae87aa6729d',
      'MD5': '900150983cd24fb0d6963f7d28e17f72',
      'SHA0': '0164b8a914cd2a5e74c4f7ff082c4d97f1edf880',
      'SHA1': 'a9993e364706816aba3e25717850c26c9cd0d89d',
      'SHA224': '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7',
      'SHA256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      'SHA384': 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
      'SHA512': 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      'SHA3-224': 'e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf',
      'SHA3-256': '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
      'SHA3-384': 'ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25',
      'SHA3-512': 'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
      'Keccak-256': '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45',
      'RIPEMD160': '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc',
    },
  },
  {
    name: 'hash: 대문자 옵션', tool: 'hash', options: { '대문자': true }, inputs: 'abc',
    kv: { 'SHA256': 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD' },
  },
  {
    name: 'hash: Hex 입력 형식 (616263 = "abc")', tool: 'hash',
    options: { '입력 형식': 'hex' }, inputs: '616263',
    kv: { 'SHA256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
  },
  {
    name: 'hash: 잘못된 Hex 입력은 에러', tool: 'hash',
    options: { '입력 형식': 'hex' }, inputs: 'zz',
    htmlError: '올바른 Hex 문자열이 아닙니다.',
  },

  // HMAC — RFC 2202 / RFC 4231 테스트 케이스 2 (key="Jefe")
  {
    name: 'hmac: SHA256 (RFC 4231)', tool: 'hmac',
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  },
  {
    name: 'hmac: SHA1 (RFC 2202)', tool: 'hmac', options: { '알고리즘': 'SHA1' },
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: 'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
  },
  {
    name: 'hmac: SHA512 (RFC 4231)', tool: 'hmac', options: { '알고리즘': 'SHA512' },
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
  },
  {
    name: 'hmac: MD5 (RFC 2202)', tool: 'hmac', options: { '알고리즘': 'MD5' },
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: '750c783e6ab0b503eaa86e310a5db738',
  },
  {
    name: 'hmac: SHA3-256 (FIPS 202, node 교차 검증)', tool: 'hmac', options: { '알고리즘': 'SHA3-256' },
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: 'c7d4072e788877ae3596bbb0da73b887c9171f93095b294ae857fbe2645e1ba5',
  },
  {
    name: 'hmac: SHA3-512 (FIPS 202, node 교차 검증)', tool: 'hmac', options: { '알고리즘': 'SHA3-512' },
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: '5a4bfeab6166427c7a3647b747292b8384537cdb89afb3bf5665e4c5e709350b287baec921fd7ca0ee7a0c31d022a95e1fc92ba9d77df883960275beb4e62024',
  },
  {
    name: 'hmac: Base64 출력', tool: 'hmac', options: { '출력': 'base64' },
    inputs: ['what do ya want for nothing?', 'Jefe'],
    output: 'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=',
  },

  // 해시 분석기
  {
    name: 'hash-analyze: 32자 Hex는 MD5 후보', tool: 'hash-analyze',
    inputs: '5d41402abc4b2a76b9719d911017c592',
    kv: { '길이': '32자', '문자 집합': 'Hex' }, htmlContains: ['MD5'],
  },
  {
    name: 'hash-analyze: bcrypt 접두사 인식', tool: 'hash-analyze',
    inputs: '$2b$12$abcdefghijklmnopqrstuv', htmlContains: ['bcrypt'],
  },

  // CRC / Adler — "123456789" 표준 check value
  {
    name: 'checksum-crc: 표준 check value', tool: 'checksum-crc', inputs: '123456789',
    kv: {
      'CRC-32': /^0xCBF43926 /,
      'CRC-32C (Castagnoli)': /^0xE3069283 /,
      'CRC-16/CCITT-FALSE': /^0x29B1 /,
      'CRC-16/XMODEM': /^0x31C3 /,
      'CRC-16/ARC (IBM)': /^0xBB3D /,
      'CRC-16/MODBUS': /^0x4B37 /,
      'CRC-8': /^0xF4 /,
      'Adler-32': /^0x091E01DE /,
    },
  },

  // BLAKE2/BLAKE3/xxHash — BLAKE2 값은 python hashlib과 교차 검증한 벡터
  {
    name: 'hash-modern: 키 없이 전체 계산', tool: 'hash-modern', inputs: ['Hello, World!', ''],
    kv: {
      'BLAKE2b-512': '7dfdb888af71eae0e6a6b751e8e3413d767ef4fa52a7993daa9ef097f7aa3d949199c113caa37c94f80cf3b22f7d9d6e4f5def4ff927830cffe4857c34be3d89',
      'BLAKE2b-256': '511bc81dde11180838c562c82bb35f3223f46061ebde4a955c27b3f489cf1e03',
      'BLAKE2s-256': 'ec9db904d636ef61f1421b2ba47112a4fa6b8964fd4a0a514834455c21df7812',
      'BLAKE3-256': '288a86a79f20a3d6dccdca7713beaed178798296bdfa7913fa2a62d9727bf8f8',
      'xxHash64': 'c49aacf8080fe47f',
      'xxHash128': '531df2844447dd5077db03842cd75395',
    },
  },
  {
    name: 'hash-modern: 키를 주면 keyed hash', tool: 'hash-modern', inputs: ['Hello, World!', 'secret'],
    kv: {
      'BLAKE2b-256': 'c4681a0a08658e336f7ad8acfb667c30607ab0ffabe617406bc90ca4d4fb5fec',
      'xxHash64': '(키를 지원하지 않는 알고리즘)',
    },
  },
  {
    name: 'hash-modern: BLAKE3 키는 32바이트여야 한다', tool: 'hash-modern', inputs: ['Hello, World!', 'secret'],
    kv: { 'BLAKE3-256': /^\(오류: .*32 bytes\)$/ },
  },
  { name: 'hash-modern: 대문자 옵션', tool: 'hash-modern', options: { '대문자': true }, inputs: ['Hello, World!', ''], kv: { 'xxHash64': 'C49AACF8080FE47F' } },

];

toolCases('hashing', cases);

/* ---------- 파일 입력 경로 ---------- */

test('checksum-file: 파일 해시는 "abc" 표준 벡터와 일치', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)',
    { name: 'abc.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });

  const row = (key) => content.locator('table.kv tr').filter({ has: page.getByText(key, { exact: true }) });
  await expect(row('파일')).toContainText('abc.txt (3 bytes)');
  await expect(row('MD5')).toContainText('900150983cd24fb0d6963f7d28e17f72');
  await expect(row('SHA-1')).toContainText('a9993e364706816aba3e25717850c26c9cd0d89d');
  await expect(row('SHA-256')).toContainText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await expect(row('SHA-512')).toContainText('ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
});

test('checksum-file: 여러 파일을 한 번에 처리', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('') },
  ]);
  await expect(content).toContainText('a.txt (3 bytes)');
  await expect(content).toContainText('b.txt (0 bytes)');
  // 빈 파일의 MD5
  await expect(content).toContainText('d41d8cd98f00b204e9800998ecf8427e');
});

test('checksum-file: 큰 파일 해시를 취소하면 Worker와 진행 상태를 정리한다', async ({ page }) => {
  test.setTimeout(60_000);
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', {
    name: 'large.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(16 * 1024 * 1024, 0x61),
  });
  await expect(content.locator('.io')).toHaveAttribute('aria-busy', 'true');
  await content.getByRole('button', { name: '취소' }).click();
  await expect(content.locator('.io')).toHaveAttribute('aria-busy', 'false');
  await expect(content).toContainText('작업이 취소되었습니다.');
});

test('checksum-file: 직접 입력한 체크섬의 일치와 불일치를 검증', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  const expected = content.getByLabel('기대 체크섬 또는 체크섬 목록 (선택)', { exact: true });
  await expected.fill('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)',
    { name: 'abc.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });

  await expect(content.locator('.checksum-summary')).toHaveText('검증 성공: 체크섬 1개가 모두 일치합니다.');
  await expect(content.locator('.checksum-results tbody tr')).toContainText(['일치abc.txtSHA-256']);

  await expected.fill('aa7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await expect(content.locator('.checksum-summary')).toContainText('불일치 체크섬 1개');
  await expect(content.locator('.checksum-results tbody tr')).toContainText(['불일치abc.txtSHA-256']);
});

test('checksum-file: GNU 목록에서 일치·누락·추가 파일을 일괄 보고', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  await content.getByLabel('기대 체크섬 또는 체크섬 목록 (선택)', { exact: true }).fill([
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  releases/a.txt',
    '900150983cd24fb0d6963f7d28e17f72  releases/a.txt',
    'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e *b.txt',
  ].join('\n'));
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') },
    { name: 'extra.txt', mimeType: 'text/plain', buffer: Buffer.from('extra') },
  ]);

  await expect(content.locator('.checksum-summary'))
    .toHaveText('검증 실패: 불일치 체크섬 0개, 누락 파일 1개, 추가 파일 1개');
  const rows = content.locator('.checksum-results tbody tr');
  await expect(rows.filter({ has: page.getByRole('cell', { name: 'a.txt', exact: true }) })).toHaveCount(2);
  await expect(rows.filter({ has: page.getByRole('cell', { name: 'b.txt', exact: true }) })).toContainText('누락');
  await expect(rows.filter({ has: page.getByRole('cell', { name: 'extra.txt', exact: true }) })).toContainText('추가');
});

test('checksum-file: BSD 형식 체크섬 파일을 가져와 검증', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)',
    { name: 'abc.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await uploadFile(content, '체크섬 파일 가져오기 (선택, 최대 1MB)', {
    name: 'SHA256SUMS.txt', mimeType: 'text/plain',
    buffer: Buffer.from('SHA256 (abc.txt) = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad\n'),
  });

  await expect(content.getByLabel('기대 체크섬 또는 체크섬 목록 (선택)', { exact: true })).toHaveValue(/SHA256 \(abc\.txt\)/);
  await expect(content.locator('.checksum-summary')).toHaveText('검증 성공: 체크섬 1개가 모두 일치합니다.');
});

test('checksum-file: 빈 체크섬 파일을 거부', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  await uploadFile(content, '체크섬 파일 가져오기 (선택, 최대 1MB)', {
    name: 'SHA256SUMS', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0),
  });
  await expect(content.locator('.io-status')).toHaveText('처리 실패: 체크섬 파일이 비어 있습니다.');
  await expect(content.locator('.io')).toHaveAttribute('aria-busy', 'false');
});

test('checksum-file: 잘못된 목록과 여러 파일에 대한 무파일명 체크섬을 거부', async ({ page }) => {
  await openTool(page, 'checksum-file');
  const content = page.locator('#content');
  const expected = content.getByLabel('기대 체크섬 또는 체크섬 목록 (선택)', { exact: true });
  await expected.fill('체크섬 아님');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)',
    { name: 'abc.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await expect(content.locator('.checksum-verification .error')).toHaveText('1행: GNU 또는 BSD 체크섬 형식으로 읽을 수 없습니다.');

  await expected.fill('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await uploadFile(content, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', [
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') },
  ]);
  await expect(content.locator('.checksum-verification .error'))
    .toHaveText('파일명이 없는 체크섬은 검증할 파일을 하나만 선택했을 때 사용할 수 있습니다.');
});

test('checksum-crc: 파일 체크섬도 표준 check value', async ({ page }) => {
  await openTool(page, 'checksum-crc');
  const content = page.locator('#content');
  await uploadFile(content, '또는 파일 선택 (브라우저 밖으로 전송되지 않습니다)',
    { name: 'check.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('123456789') });
  await expect(content).toContainText('check.bin (9 bytes)');
  await expect(content.locator('.io').last()).toContainText('0xCBF43926');
});
