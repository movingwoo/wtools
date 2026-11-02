// Test-only oracle capture. Pass the removed, SRI-verified CryptoJS 4.2.0 file.
// No runtime dependency or network download. Do not regenerate to bless a failure.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const source = readFileSync(process.argv[2]);
const integrity = createHash('sha384').update(source).digest('base64');
if (integrity !== 'mgWScxWVKP8F7PBbpNp7i/aSb17kN0LcifBpahAplF3Mn0GR4/u1oMpWIm2rD8yY') throw new Error('CryptoJS oracle integrity mismatch');
const context = vm.createContext({});
vm.runInContext(source.toString(), context);
const c = context.CryptoJS;
const pattern = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 29 + seed) & 255);
const word = (data) => c.enc.Hex.parse(Buffer.from(data).toString('hex'));
const sizes = [0, 1, 7, 8, 15, 16, 17, 31, 32, 33, 65, 257];
const vectors = [];
for (const [algorithm, keyLengths] of Object.entries({ AES: [16, 24, 32], DES: [1, 7, 8, 9, 24], TripleDES: [5, 8, 13, 16, 21, 24, 33], Blowfish: [1, 3, 4, 5, 7, 16, 17, 56, 57, 71, 73] })) {
  for (const mode of ['CBC', 'CFB', 'CTR', 'OFB', 'ECB']) for (const keyLength of keyLengths) {
    const key = word(pattern(keyLength, keyLength));
    const block = algorithm === 'AES' ? 16 : 8;
    const iv = pattern(block, 42);
    iv.fill(255, block - 4); // Include the CryptoJS 32-bit counter wrap.
    const fingerprint = createHash('sha256');
    for (const size of sizes) {
      const plain = pattern(size, size);
      const encoded = c[algorithm].encrypt(word(plain), key, { mode: c.mode[mode], padding: ['CBC', 'ECB'].includes(mode) ? c.pad.Pkcs7 : c.pad.NoPadding, iv: word(iv) });
      fingerprint.update(Buffer.from(encoded.ciphertext.toString(), 'hex'));
      fingerprint.update(plain);
    }
    vectors.push({ algorithm, mode, keyLength, sha256: fingerprint.digest('hex') });
  }
}
writeFileSync(new URL('../tests/crypto-compat-vectors.json', import.meta.url), JSON.stringify({ oracle: 'CryptoJS 4.2.0', integrity: 'sha384-' + integrity, sizes, vectors }, null, 2) + '\n');
console.log(`Captured ${vectors.length * sizes.length} deterministic cipher contracts.`);
