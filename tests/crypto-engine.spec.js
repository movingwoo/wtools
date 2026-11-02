// Standards, independent oracles, resource limits and misuse tests for the crypto replacement.
import { readFileSync } from 'node:fs';
import { createHash, createHmac, createCipheriv } from 'node:crypto';
import { test, expect, openTool, ioSection, fillInputs, clickAction, setOption } from './helpers.js';

const compatibility = JSON.parse(readFileSync(new URL('./crypto-compat-vectors.json', import.meta.url), 'utf8'));
const pattern = (length, seed = length) => Uint8Array.from({ length }, (_, i) => (i * 29 + seed) & 255);
const hashNames = ['MD5', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512', 'SHA3-224', 'SHA3-256', 'SHA3-384', 'SHA3-512', 'RIPEMD160'];
const sizes = [0, 1, 55, 56, 63, 64, 65, 111, 112, 127, 128, 129, 135, 136, 143, 144, 167, 168, 1024 * 1024 + 1];

test('crypto: streaming hashes and HMAC match Node at padding/key boundaries', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const expected = [];
  for (const name of hashNames) for (const size of sizes) expected.push(createHash(name).update(pattern(size)).digest('hex'));
  const expectedMac = [];
  for (const name of hashNames) for (const size of [0, 1, 63, 64, 65, 127, 128, 129, 145, 257])
    expectedMac.push(createHmac(name, pattern(size)).update(pattern(257)).digest('hex'));
  const result = await page.evaluate(async ({ names, sizes }) => {
    const { createHash, digest, hmac } = await import('/js/lib/crypto/hash.js');
    const { hex } = await import('/js/lib/crypto/bytes.js');
    const pattern = (length) => Uint8Array.from({ length }, (_, i) => (i * 29 + length) & 255);
    const hashes = [], macs = [], nativeMacs = [];
    for (const name of names) for (const size of sizes) {
      const input = pattern(size), before = hex(input.subarray(0, 32));
      const hash = await createHash(name);
      for (let i = 0; i < size; i += 97) hash.update(input.subarray(i, i + 97));
      const actual = hex(hash.digest());
      if (actual !== hex(hash.digest()) || actual !== hex(await digest(name, input))) throw new Error('Streaming/native mismatch');
      if (before !== hex(input.subarray(0, 32))) throw new Error('Input mutated');
      try { hash.update(new Uint8Array()); throw new Error('Update accepted after finish'); }
      catch (error) { if (error.message === 'Update accepted after finish') throw error; }
      hashes.push(actual);
    }
    for (const name of names) for (const size of [0, 1, 63, 64, 65, 127, 128, 129, 145, 257]) {
      const key = pattern(size), before = hex(key);
      macs.push(hex(await hmac(name, pattern(257), key, { native: false })));
      nativeMacs.push(hex(await hmac(name, pattern(257), key)));
      if (hex(key) !== before) throw new Error('Key mutated');
    }
    return { hashes, macs, nativeMacs };
  }, { names: hashNames, sizes });
  expect(result.hashes).toEqual(expected);
  expect(result.macs).toEqual(expectedMac);
  expect(result.nativeMacs).toEqual(expectedMac);
});

test('crypto: 1,560 frozen CryptoJS cipher contracts, legacy key words and CTR wrap', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const fingerprints = await page.evaluate(async ({ sizes, vectors }) => {
    const { cipher } = await import('/js/lib/crypto/cipher.js');
    const { legacyKey } = await import('/js/lib/crypto/legacy.js');
    const { createHash } = await import('/js/lib/crypto/hash.js');
    const { hex } = await import('/js/lib/crypto/bytes.js');
    const pattern = (length, seed = length) => Uint8Array.from({ length }, (_, i) => (i * 29 + seed) & 255);
    const output = [];
    for (const { algorithm, mode, keyLength } of vectors) {
      const raw = pattern(keyLength), key = algorithm === 'AES' ? raw : legacyKey(algorithm, raw);
      const iv = pattern(algorithm === 'AES' ? 16 : 8, 42); iv.fill(255, iv.length - 4);
      const hash = await createHash('SHA256');
      for (const size of sizes) {
        const settings = { algorithm, mode, key, iv: mode === 'ECB' ? new Uint8Array() : iv, legacy: true };
        const encoded = await cipher({ ...settings, data: pattern(size), native: false });
        const native = await cipher({ ...settings, data: pattern(size) });
        if (hex(encoded) !== hex(native)) throw new Error('Native cipher mismatch');
        const decoded = await cipher({ ...settings, data: encoded, decrypt: true, native: false });
        hash.update(encoded).update(decoded);
      }
      output.push(hex(hash.digest()));
    }
    return output;
  }, compatibility);
  expect(fingerprints).toEqual(compatibility.vectors.map(({ sha256 }) => sha256));
});

test('crypto: FIPS 197, DES and published Blowfish block vectors', async ({ page }) => {
  await page.goto('/');
  // FIPS 197 Appendix C; DES classic KAT; Schneier's published Blowfish vectors.
  const vectors = [
    ['AES', '000102030405060708090a0b0c0d0e0f', '00112233445566778899aabbccddeeff', '69c4e0d86a7b0430d8cdb78070b4c55a'],
    ['AES', '000102030405060708090a0b0c0d0e0f1011121314151617', '00112233445566778899aabbccddeeff', 'dda97ca4864cdfe06eaf70a0ec0d7191'],
    ['AES', '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', '00112233445566778899aabbccddeeff', '8ea2b7ca516745bfeafc49904b496089'],
    ['DES', '133457799bbcdff1', '0123456789abcdef', '85e813540f0ab405'],
    ['Blowfish', '0000000000000000', '0000000000000000', '4ef997456198dd78'],
    ['Blowfish', 'ffffffffffffffff', 'ffffffffffffffff', '51866fd5b85ecb8a'],
    ['Blowfish', '3000000000000000', '1000000000000001', '7d856f9a613063f2'],
  ];
  expect(await page.evaluate(async (vectors) => {
    const { createCipher } = await import('/js/lib/crypto/cipher.js');
    const { hex, unhex } = await import('/js/lib/crypto/bytes.js');
    return Promise.all(vectors.map(async ([name, key, plain]) => {
      const engine = await createCipher(name, unhex(key)), block = unhex(plain);
      engine.encrypt(block); const encrypted = hex(block); engine.decrypt(block);
      const result = [encrypted, hex(block)]; engine.destroy(); return result;
    }));
  }, vectors)).toEqual(vectors.map(([, , plain, encrypted]) => [encrypted, plain]));
});

test('crypto: OpenSSL EVP_BytesToKey salt, mode and AES key size interoperate with Node', async ({ page }) => {
  await page.goto('/');
  const cases = [];
  for (const keyLength of [16, 24, 32]) for (const mode of ['CBC', 'CFB', 'CTR', 'OFB', 'ECB']) {
    const salt = pattern(8), password = Buffer.from('비밀번호 🌱'), plain = Buffer.from('OpenSSL compatible 비밀');
    let material = Buffer.alloc(0), previous = Buffer.alloc(0);
    while (material.length < keyLength + 16) {
      previous = createHash('md5').update(previous).update(password).update(salt).digest();
      material = Buffer.concat([material, previous]);
    }
    const cipher = createCipheriv(`aes-${keyLength * 8}-${mode.toLowerCase()}`, material.subarray(0, keyLength), mode === 'ECB' ? null : material.subarray(keyLength, keyLength + 16));
    cases.push({ keyLength, mode, expected: Buffer.concat([Buffer.from('Salted__'), salt, cipher.update(plain), cipher.final()]).toString('hex') });
  }
  expect(await page.evaluate(async (cases) => {
    const { openssl } = await import('/js/lib/crypto/openssl.js');
    const { hex } = await import('/js/lib/crypto/bytes.js');
    const encoder = new TextEncoder(), result = [];
    for (const { keyLength, mode } of cases) {
      const settings = { keyBits: keyLength * 8, mode, password: encoder.encode('비밀번호 🌱'), salt: Uint8Array.from({ length: 8 }, (_, i) => (i * 29 + 8) & 255) };
      const encoded = await openssl({ ...settings, data: encoder.encode('OpenSSL compatible 비밀') });
      const decoded = await openssl({ ...settings, data: encoded, decrypt: true });
      if (new TextDecoder().decode(decoded) !== 'OpenSSL compatible 비밀') throw new Error('OpenSSL decrypt mismatch');
      result.push(hex(encoded));
    }
    return result;
  }, cases)).toEqual(cases.map(({ expected }) => expected));
});

test('crypto: malformed lengths, PKCS7, envelopes and resource limits fail closed', async ({ page }) => {
  await page.goto('/');
  const errors = await page.evaluate(async () => {
    const { cipher, createCipher } = await import('/js/lib/crypto/cipher.js');
    const { openssl } = await import('/js/lib/crypto/openssl.js');
    const { processAes } = await import('/js/lib/crypto/aes-envelope.js');
    const { digest, hmac } = await import('/js/lib/crypto/hash.js');
    const { MAX_CRYPTO_BYTES, MAX_KEY_BYTES } = await import('/js/lib/crypto/bytes.js');
    const errors = [];
    const rejected = async (operation) => { try { await operation(); errors.push('ACCEPTED'); } catch (error) { errors.push(error.message); } };
    for (const algorithm of ['AES', 'DES', 'TripleDES', 'Blowfish']) {
      const blockSize = algorithm === 'AES' ? 16 : 8;
      const key = new Uint8Array(algorithm === 'AES' ? 16 : algorithm === 'TripleDES' ? 24 : 8);
      const engine = await createCipher(algorithm, key);
      for (let n = 0; n <= 255; n++) {
        if (n === 1) continue;
        const block = new Uint8Array(blockSize); block[blockSize - 1] = n;
        engine.encrypt(block);
        await rejected(() => cipher({ algorithm, mode: 'ECB', key, iv: new Uint8Array(), data: block, decrypt: true, native: false }));
      }
      engine.destroy();
      for (let length = 1; length < blockSize; length++) await rejected(() => cipher({ algorithm, key, iv: new Uint8Array(blockSize), data: new Uint8Array(length), decrypt: true }));
    }
    for (let length = 0; length < 16; length++) await rejected(() => openssl({ data: new Uint8Array(length), password: new Uint8Array([1]), decrypt: true }));
    const options = { keyMode: 'raw', keySize: '128', mode: 'CBC', bundle: 'package', ofmt: 'base64' };
    for (const value of ['null', '[]', '{}', '{', '{"v":1,"alg":"AES-CBC","keyBits":128,"kdf":"PBKDF2-SHA256","iterations":10000001}'])
      await rejected(() => processAes({ text: btoa(value), key: '00'.repeat(16), iv: '' }, options, 'dec'));
    await rejected(() => digest('MD5', new Uint8Array(MAX_CRYPTO_BYTES + 1)));
    await rejected(() => hmac('SHA256', new Uint8Array(), new Uint8Array(MAX_KEY_BYTES + 1)));
    await rejected(() => cipher({ key: new Uint8Array(16), iv: new Uint8Array(16), data: new Uint8Array(MAX_CRYPTO_BYTES + 1) }));
    return errors;
  });
  expect(errors.length).toBeGreaterThan(1000);
  expect(errors).not.toContain('ACCEPTED');
  expect(errors.every((message) => /[가-힣]/.test(message))).toBe(true);
});

test('crypto: maximum plaintext retains padding/envelope room and streaming memory stays bounded', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { cipher } = await import('/js/lib/crypto/cipher.js');
    const { openssl } = await import('/js/lib/crypto/openssl.js');
    const { createHash } = await import('/js/lib/crypto/hash.js');
    const { MAX_CRYPTO_BYTES, hex, unhex } = await import('/js/lib/crypto/bytes.js');
    const input = new Uint8Array(MAX_CRYPTO_BYTES), key = new Uint8Array(16), iv = new Uint8Array(16);
    const start = performance.now();
    const encrypted = await cipher({ data: input, key, iv });
    const decrypted = await cipher({ data: encrypted, key, iv, decrypt: true });
    const envelope = await openssl({ data: input, password: new Uint8Array([1]) });
    const restored = await openssl({ data: envelope, password: new Uint8Array([1]), decrypt: true });
    const hash = await createHash('SHA512');
    const chunk = input.subarray(0, 2 * 1024 * 1024);
    for (let i = 0; i < 16; i++) hash.update(chunk);
    const hexDecoded = unhex(hex(input));
    return { encrypted: encrypted.length, decrypted: decrypted.length, envelope: envelope.length, restored: restored.length,
      hexLength: hexDecoded.length, nonzero: decrypted.some((b) => b) || restored.some((b) => b) || hexDecoded.some((b) => b),
      hashBuffer: hash.block.length, hashWords: hash.words.length, elapsed: performance.now() - start };
  });
  expect(result).toMatchObject({ encrypted: 16777232, decrypted: 16777216, envelope: 16777248, restored: 16777216, hexLength: 16777216, nonzero: false, hashBuffer: 128, hashWords: 160 });
  expect(result.elapsed).toBeLessThan(30_000);
});

test('crypto: Worker cancellation, caller buffer ownership and route cleanup', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { runCrypto } = await import('/js/lib/crypto/worker-client.js');
    const controller = new AbortController(), input = new Uint8Array(1024 * 1024);
    const operation = runCrypto('hash-all', { data: input }, controller.signal);
    controller.abort();
    let name;
    try { await operation; } catch (error) { name = error.name; }
    const result = await runCrypto('digest', { name: 'SHA256', data: input });
    return { name, length: input.byteLength, result: result.length };
  });
  expect(result).toEqual({ name: 'AbortError', length: 1024 * 1024, result: 32 });
  await page.evaluate(() => {
    const Original = Worker;
    globalThis.workerBalance = 0;
    globalThis.Worker = class extends Original {
      constructor(...args) { super(...args); globalThis.workerBalance++; }
      terminate() { globalThis.workerBalance--; super.terminate(); }
    };
  });
  await page.evaluate(() => { location.hash = '#/tool/aes'; });
  const io = ioSection(page);
  await fillInputs(io, ['route-exit', 'password', '']);
  await clickAction(io, '암호화');
  await expect.poll(() => page.evaluate(() => globalThis.workerBalance)).toBe(1);
  await page.evaluate(() => { location.hash = '#/'; });
  await expect.poll(() => page.evaluate(() => globalThis.workerBalance)).toBe(0);
});

for (const id of ['des', 'tripledes', 'blowfish']) {
  test(`crypto: ${id} OpenSSL Hex preserves salt and empty plaintext`, async ({ page }) => {
    await openTool(page, id);
    const io = ioSection(page), out = io.locator('textarea.out');
    await setOption(io, '암호문 형식', 'hex');
    await setOption(io, '레거시 새 암호화 허용', true);
    await fillInputs(io, ['', '비밀번호']);
    await clickAction(io, '암호화');
    await expect(out).toHaveValue(/^53616c7465645f5f[0-9a-f]+$/);
    const encrypted = await out.inputValue();
    await fillInputs(io, [encrypted]);
    await clickAction(io, '복호화');
    await expect(io).toHaveAttribute('aria-busy', 'false');
    await expect(out).toHaveValue('');
    await expect(io.locator('.io-status')).not.toContainText('실패');
  });
}

test.describe('crypto: first engine load failure', () => {
  // Deliberately failed module fetch; UI must show Korean guidance and permit retry.
  test.use({ allowConsoleErrors: ['Failed to load resource'] });
  test('AES reports a Korean error and a fresh Worker retries successfully', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright routes do not intercept Worker module imports in these engines.');
    await openTool(page, 'aes');
    const io = ioSection(page);
    await page.route('**/js/lib/crypto/aes-envelope.js', (route) => route.abort());
    await clickAction(io, '암호화');
    await expect(io.locator('textarea.out')).toHaveValue('⚠ 암호 구현을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.');
    await page.unroute('**/js/lib/crypto/aes-envelope.js');
    await clickAction(io, '암호화');
    await expect(io.locator('textarea.out')).toHaveValue(/^[A-Za-z0-9+/=]+$/);
  });
});

test('crypto: large JWT signing Worker ends on route exit', async ({ page }) => {
  await openTool(page, 'jwt');
  await page.evaluate(() => {
    const Original = Worker;
    globalThis.workerBalance = 0;
    globalThis.Worker = class extends Original {
      constructor(...args) { super(...args); globalThis.workerBalance++; }
      terminate() { globalThis.workerBalance--; super.terminate(); }
    };
  });
  // Hold the Worker entry point so route cleanup, not computation speed, decides the result.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/js/workers/crypto.js', async (route) => { await gate; await route.continue().catch(() => {}); });
  try {
    const io = ioSection(page, 1);
    await fillInputs(io, [JSON.stringify({ value: 'x'.repeat(70 * 1024) }), 'secret']);
    await clickAction(io, 'JWT 생성');
    await expect.poll(() => page.evaluate(() => globalThis.workerBalance)).toBe(1);
    await page.evaluate(() => { location.hash = '#/'; });
    await expect.poll(() => page.evaluate(() => globalThis.workerBalance)).toBe(0);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});
