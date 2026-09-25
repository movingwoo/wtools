// 테스트용 이미지·인증서 재료 생성기.
// 바이너리 파일과 개인키를 저장소에 커밋하지 않도록, 필요한 재료를 테스트 실행 중에 만든다.
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { RANDOM_NUMBERS } from '../js/lib/archive/bzip2-random.js';
import { TRANSFORMS, DICTIONARY_BITS } from '../js/lib/archive/brotli-tables.js';

// A small RFC bitstream author for decoder tests. It does not call either first-party
// codec. Node independently validates every normal stream and supplies expected bytes.
export class BrotliBits {
  constructor() { this.bytes = []; this.position = 0; }
  write(width, value) {
    for (let i = 0; i < width; i++, this.position++) {
      const at = this.position >>> 3;
      this.bytes[at] = (this.bytes[at] || 0) | (value & 1) << (this.position & 7);
      value = Math.floor(value / 2);
    }
  }
  align() { this.write((8 - this.position % 8) % 8, 0); }
  raw(bytes) { this.align(); for (const byte of bytes) this.write(8, byte); }
  finish() { return Buffer.from(this.bytes); }
  simple(alphabet, values) {
    this.write(2, 1); this.write(2, values.length - 1);
    for (const value of values) this.write(Math.ceil(Math.log2(alphabet)), value);
  }
}

export function brotliDictionaryStream({ length = 4, index = 0, transform = 0, postfix = 0, direct = 0,
  declaredLength, distanceCode, distanceExtra } = {}) {
  const w = new BrotliBits();
  const copyWidths = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 24];
  let copyCode = 0, copyBase = 2;
  while (copyBase + 2 ** copyWidths[copyCode] <= length) copyBase += 2 ** copyWidths[copyCode++];
  const command = [128, 192, 384][copyCode >>> 3] + (copyCode & 7), terminal = 136;
  const distance = transform * 2 ** DICTIONARY_BITS[length] + index + 1;
  const alphabet = 16 + direct + (48 << postfix);
  let code = 16, extra = 0, extraBits = 0;
  for (; code < alphabet; code++) {
    if (code < 16 + direct) { if (code - 15 === distance) break; continue; }
    const high = (code - 16 - direct) >>> postfix, low = (code - 16 - direct) & ((1 << postfix) - 1);
    extraBits = 1 + (high >>> 1);
    const base = (((2 + (high & 1)) * 2 ** extraBits - 4) << postfix) + low + direct + 1;
    extra = (distance - base) / 2 ** postfix;
    if (Number.isInteger(extra) && extra >= 0 && extra < 2 ** extraBits) break;
  }
  if (code >= alphabet) throw new Error('Unrepresentable test dictionary distance');
  if (distanceCode !== undefined) { code = distanceCode; extra = distanceExtra || 0; extraBits = 0; }
  const entry = TRANSFORMS[transform] || ['', 0, ''];
  const omit = entry[1] >= 12 ? entry[1] - 11 : entry[1] >= 3 ? entry[1] - 2 : 0;
  const size = declaredLength ?? entry[0].length + Math.max(0, length - omit) + entry[2].length + 1;
  w.write(1, 0); // WBITS=16.
  w.write(1, 1); w.write(1, 0); w.write(2, 0); w.write(16, size - 1);
  w.write(3, 0); // One block type in each category.
  w.write(2, postfix); w.write(4, direct >>> postfix);
  w.write(2, 0); w.write(2, 0); // LSB6 context mode, one literal/distance tree.
  w.simple(256, [120]);
  w.simple(704, [command, terminal]);
  w.simple(alphabet, [code]);
  w.write(1, command < terminal ? 0 : 1);
  w.write(copyWidths[copyCode], length - copyBase);
  w.write(extraBits, extra);
  w.write(1, command < terminal ? 1 : 0);
  return w.finish();
}

export function brotliStoredStream(parts, { metadata = null, declaredExtra = 0 } = {}) {
  const w = new BrotliBits();
  w.write(1, 0); // WBITS=16, no dictionary/window allocation is implied.
  if (metadata) {
    w.write(1, 0); w.write(2, 3); w.write(1, 0);
    const count = metadata.length ? Math.ceil(Math.log2(metadata.length + 1) / 8) : 0;
    w.write(2, count); w.write(count * 8, Math.max(0, metadata.length - 1));
    w.raw(metadata);
  }
  for (const part of parts) {
    const size = part.length + declaredExtra;
    const nibbles = size <= 65536 ? 4 : size <= 1048576 ? 5 : 6;
    w.write(1, 0); w.write(2, nibbles - 4); w.write(nibbles * 4, size - 1); w.write(1, 1);
    w.raw(part);
  }
  w.write(1, 1); w.write(1, 1);
  return w.finish();
}

// RFC 7932 section 10 / erratum 6977: a distance block is exhausted before an
// implicit-distance command. Its switch fields belong to the next explicit one.
export function brotliBlockSwitchStream() {
  const w = new BrotliBits();
  w.write(1, 0); w.write(1, 1); w.write(1, 0); w.write(2, 0); w.write(16, 15);
  const twoBlocks = () => {
    w.write(4, 1); // Two block types.
    w.simple(4, [1]); w.simple(26, [0]); w.write(2, 0); // Increment type; count=1.
  };
  twoBlocks(); // Literal types alternate between 'a' and 'b'.
  w.write(1, 0); // One command block type.
  twoBlocks(); // Distance types: last distance, then second-to-last distance.
  w.write(6, 0); // NPOSTFIX=NDIRECT=0.
  w.write(2, 2); w.write(2, 3); // UTF8 and Signed literal modes.
  w.write(4, 1); // Two literal trees.
  w.write(1, 1); w.write(4, 5); // RLEMAX=6.
  w.simple(8, [6, 7]);
  w.write(1, 0); w.write(6, 0); // 64 zeros.
  for (let i = 0; i < 64; i++) w.write(1, 1); // 64 ones.
  w.write(1, 0); // No inverse MTF.
  w.write(4, 1); w.write(1, 0); // Two distance trees, no RLE.
  w.simple(2, [0, 1]);
  w.write(8, 0xf0); w.write(1, 0); // Context map 00001111, no inverse MTF.
  w.simple(256, [97]); w.simple(256, [98]);
  w.simple(704, [162, 2, 130]); // Insert4/copy4, implicit copy4, explicit copy4.
  w.simple(64, [0]); w.simple(64, [1]);
  w.write(1, 0); w.write(6, 0); // First command + three literal block switches.
  w.write(2, 1); // Implicit last distance: no distance block fields here.
  w.write(2, 3); w.write(2, 0); // Explicit distance + switch to second distance tree.
  return w.finish();
}

// WPT compression/resources/decompression-input.js at the pinned WPT commit in
// scripts/compression-spec-lock.json. Materialize the public vector at run time.
export function brotliWptVector() {
  return { plain: Buffer.from('expected output'), packed: Buffer.from('213800046578706563746564206f757470757403', 'hex') };
}

export function brotliCorpus() {
  let seed = 0x62726f74;
  const noise = Buffer.alloc(1024 * 1024 + 1);
  for (let i = 0; i < noise.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    noise[i] = seed & 255;
  }
  const samples = [Buffer.alloc(0), Buffer.from([255]), brotliWptVector().plain,
    Buffer.from('Brotli 한글·NUL\0·이모지 🌏\n'.repeat(120)),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    Buffer.alloc(70000, 97), Buffer.alloc(2 * 1024 * 1024 + 1, 255)];
  for (const size of [3, 4, 5, 65535, 65536, 65537, 1048575, 1048576, 1048577])
    samples.push(noise.subarray(0, size));
  // Explicit long distances, non-zero offsets and mixed raw/compressed blocks.
  samples.push(Buffer.concat([noise.subarray(0, 400000), noise.subarray(0, 350000)]));
  samples.push(Buffer.concat([noise.subarray(0, 1048576), Buffer.alloc(1048576, 0), noise.subarray(0, 77)]));
  // Vary literal/command/distance histograms, overlapping copies and run lengths.
  for (let run = 0; run < 96; run++) {
    const bytes = Buffer.alloc(40 + run * 31), alphabet = 1 + run * 47 % 256;
    for (let i = 0; i < bytes.length; i++) bytes[i] = noise[(run * 253 + i) % noise.length] % alphabet;
    if (run % 3 === 0) for (let i = 21; i < bytes.length; i++) if (i % 5) bytes[i] = bytes[i - 17];
    samples.push(bytes);
  }
  return samples;
}

// Independent liblzma oracle. Binary material is generated at test time.
export function makeLzma(input, options = {}) {
  return execFileSync('python3', ['-c', `
import json, lzma, sys
options = json.loads(sys.argv[1])
filters = [dict(id=lzma.FILTER_LZMA1, **options)] if options else None
sys.stdout.buffer.write(lzma.compress(sys.stdin.buffer.read(), format=lzma.FORMAT_ALONE, filters=filters))
`, JSON.stringify(options)], { input, maxBuffer: 8 * 1024 * 1024 });
}

export function readLzma(input) {
  return execFileSync('python3', ['-c', `
import lzma, sys
decoder = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
output = decoder.decompress(sys.stdin.buffer.read(), max_length=8 * 1024 * 1024)
assert decoder.eof and not decoder.unused_data
sys.stdout.buffer.write(output)
`], { input, maxBuffer: 8 * 1024 * 1024 });
}

export function lzmaCorpus() {
  let seed = 0x6c7a6d61;
  const noise = Buffer.from(Array.from({ length: 1024 * 1024 }, () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return seed & 255;
  }));
  return [
    Buffer.alloc(0), Buffer.from([0]), Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    Buffer.from('LZMA 한글·NUL\0·이모지 🌏\n'.repeat(40)), noise.subarray(0, 4096),
    Buffer.concat([noise.subarray(0, 70000), noise.subarray(0, 70000)]), noise,
  ];
}

// Public-domain vectors from Igor Pavlov's 2015-06-14 LZMA Specification bundle:
// https://www.7-zip.org/a/lzma-specification.7z (examples/). Decode only at run time.
export function lzmaSpecVectors() {
  const a = Buffer.from('XQAAgABHAQAAAAAAAAAmFoW8RfDf/9LoQfXO5ZDhyCDqxje+K9H0wzRvL4PCpnxvPYigWCIfOrp7xt1m/viS5MscxBkKDIsuObi4A81anhA6T2X6QcvyeWXX8Z+rcB1v97Z5zIp9ztv49p7JEp+qv4n+BTaA', 'base64');
  const eos = Buffer.from('XQAAAQD//////////wAmFoW8RfDf/9LoQfXO5ZDhyCDqxje+K9H0wzRvL4PCpnxvPYigWCIfOrp7xt1m/viS5MscxBkKDIsuObi4A81anhA6T2X6QcvyeWXX8Z+rcB1v97Z5zIp9ztv49p7JEp+qv4oI9ZmNf/oYClI=', 'base64');
  const eosSize = Buffer.from(eos);
  eosSize.writeBigUInt64LE(327n, 5);
  const properties = Buffer.from('NwAAAQBHAQAAAAAAAAAmFoYjvFzJQCtrkVvNkEDLmnFbhGjgWquj6QT3o6aOX6oki/wgOKa3KkevB/cUrOi02ZYn4PRHjendBSga37HtGtwLVbK9VWls2fxwQ6cWWJn+lwQRJ1ZexrBOMaDLFyfscjYOmq0A', 'base64');
  const corrupted = Buffer.from('XQAAgABHAQAAAAAAAAAmFoW8RfDf/9LoQfXO5ZDhyCDqxje+K9H0wzRvL4PCpnxvPYigWCIfOrp7xt1m/viS5MscxBkKDIsuObi4A81anhA6T2X6QcvyeWXX8f///x1v97Z5zIp9ztv49p7JEp+qv4n+BTaA', 'base64');
  const eosIncorrectSize = Buffer.from(eosSize);
  eosIncorrectSize.writeBigUInt64LE(328n, 5);
  const incorrectSize = Buffer.from(a);
  incorrectSize.writeBigUInt64LE(290n, 5);
  const plain = Buffer.from([
    'LZMA decoder test example', '=========================', '! LZMA ! Decoder ! TEST !',
    '=========================', '! TEST ! LZMA ! Decoder !', '=========================',
    '---- Test Line 1 -------- ', '=========================', '---- Test Line 2 -------- ',
    '=========================', '=== End of test file ==== ', '=========================', '',
  ].join('\r\n'));
  return { plain, good: [a, eos, eosSize, properties], bad: [corrupted, eosIncorrectSize, incorrectSize] };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/* 8비트 RGBA PNG를 만든다. color(x, y) → [r, g, b, a].
   확대·축소나 팔레트 추출 결과를 예측할 수 있도록 색을 직접 지정한다. */
export function makePng(width, height, color, { text } = {}) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // 필터 없음
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = color(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // 컬러 타입 RGBA
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr)];
  // tEXt 청크는 메타데이터 제거 도구가 지워야 할 대상이다.
  if (text) chunks.push(pngChunk('tEXt', Buffer.from(`Comment\0${text}`, 'latin1')));
  chunks.push(pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

/* EXIF(APP1)를 담은 JPEG을 만든다. EXIF 뷰어는 세그먼트만 읽고 픽셀은 해석하지 않으므로
   이미지 데이터는 최소한의 SOS/EOI로 충분하다.
   IFD0에 제조사·모델·회전, GPS IFD에 위도·경도를 넣는다. */
export function makeJpegWithExif({ make = 'WTools', model = 'TestCam', orientation = 6, lat = [37, 30, 0], lon = [127, 0, 0] } = {}) {
  const strings = [];
  let dataOffset = 8 + 2 + 4 * 12 + 4; // TIFF 헤더 + IFD0(4개 항목) + 다음 IFD 오프셋
  const asciiAt = (s) => {
    const buf = Buffer.from(s + '\0', 'latin1');
    const at = dataOffset;
    strings.push({ at, buf });
    dataOffset += buf.length + (buf.length % 2);
    return at;
  };
  const makeAt = asciiAt(make);
  const modelAt = asciiAt(model);
  const latAt = dataOffset; dataOffset += 24;
  const lonAt = dataOffset; dataOffset += 24;
  const gpsAt = dataOffset; dataOffset += 2 + 4 * 12 + 4;
  const tiff = Buffer.alloc(dataOffset);

  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(0x2a, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 위치

  const entry = (base, i, tag, type, count, value) => {
    const at = base + 2 + i * 12;
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    if (type === 2 && count <= 4) tiff.write(value, at + 8, 'latin1');
    else if (type === 3) tiff.writeUInt16LE(value, at + 8);
    else tiff.writeUInt32LE(value, at + 8);
  };
  tiff.writeUInt16LE(4, 8); // IFD0 항목 수
  entry(8, 0, 0x010f, 2, make.length + 1, makeAt);
  entry(8, 1, 0x0110, 2, model.length + 1, modelAt);
  entry(8, 2, 0x0112, 3, 1, orientation);
  entry(8, 3, 0x8825, 4, 1, gpsAt); // GPS IFD 포인터
  tiff.writeUInt32LE(0, 8 + 2 + 4 * 12); // 다음 IFD 없음

  for (const { at, buf } of strings) buf.copy(tiff, at);
  const rational = (at, values) => values.forEach(([n, d], i) => {
    tiff.writeUInt32LE(n, at + i * 8);
    tiff.writeUInt32LE(d, at + i * 8 + 4);
  });
  rational(latAt, lat.map((v) => [v, 1]));
  rational(lonAt, lon.map((v) => [v, 1]));

  tiff.writeUInt16LE(4, gpsAt); // GPS IFD 항목 수
  entry(gpsAt, 0, 0x0001, 2, 2, 'N');
  entry(gpsAt, 1, 0x0002, 5, 3, latAt);
  entry(gpsAt, 2, 0x0003, 2, 2, 'E');
  entry(gpsAt, 3, 0x0004, 5, 3, lonAt);
  tiff.writeUInt32LE(0, gpsAt + 2 + 4 * 12);

  const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1Len = Buffer.alloc(2);
  app1Len.writeUInt16BE(app1Body.length + 2, 0);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe1]), app1Len, app1Body,
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), // SOS
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

/* ---------- PKI 테스트 재료 ----------
   개인키는 저장소에 커밋하지 않는다. 필요한 키와 자체 서명 인증서를 테스트 실행 중에
   openssl로 새로 만들고, 검증에 쓰는 필드(주체·시리얼·SAN 등)만 고정한다. */
export const PKI = {
  subject: '/C=KR/O=WTools Test/CN=test.wtools.local',
  serialHex: '1234',
  days: 3650,
  passphrase: 'wtools-test-pass',
  san: ['test.wtools.local', 'www.test.wtools.local', '127.0.0.1'],
};

export function makeTestPki({ workflow = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wtools-pki-'));
  const run = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    run('req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'rsa.pem', '-out', 'cert.pem', '-nodes',
      '-days', String(PKI.days), '-sha256', '-set_serial', String(parseInt(PKI.serialHex, 16)),
      '-subj', PKI.subject,
      '-addext', `subjectAltName=DNS:${PKI.san[0]},DNS:${PKI.san[1]},IP:${PKI.san[2]}`,
      '-addext', 'keyUsage=digitalSignature,keyEncipherment');
    run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ec.pem');
    run('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', 'ec384.pem');
    run('ecparam', '-name', 'secp521r1', '-genkey', '-noout', '-out', 'ec521.pem');
    run('pkey', '-in', 'rsa.pem', '-pubout', '-out', 'rsa-public.pem');
    run('pkey', '-in', 'ec.pem', '-pubout', '-out', 'ec-public.pem');
    run('pkey', '-in', 'ec384.pem', '-pubout', '-out', 'ec384-public.pem');
    run('pkey', '-in', 'ec521.pem', '-pubout', '-out', 'ec521-public.pem');
    // ecparam은 SEC1을 내놓는다. WebCrypto가 읽는 PKCS#8 형태도 함께 만들어 둔다.
    run('pkcs8', '-topk8', '-nocrypt', '-in', 'ec.pem', '-out', 'ec-pkcs8.pem');
    run('pkcs8', '-topk8', '-in', 'rsa.pem', '-out', 'rsa-enc.pem', '-v2', 'aes-256-cbc', '-passout', 'pass:' + PKI.passphrase);
    if (workflow) {
      run('dsaparam', '-out', 'dsa-param.pem', '2048');
      run('genpkey', '-paramfile', 'dsa-param.pem', '-out', 'dsa-key.pem');
      run('req', '-x509', '-new', '-key', 'dsa-key.pem', '-out', 'dsa-cert.pem',
        '-days', String(PKI.days), '-sha256', '-subj', '/C=KR/O=WTools Test/CN=WTools DSA Test');
      run('req', '-new', '-key', 'rsa.pem', '-out', 'request.csr', '-sha256', '-subj', PKI.subject,
        '-addext', `subjectAltName=DNS:${PKI.san[0]},DNS:${PKI.san[1]},IP:${PKI.san[2]}`,
        '-addext', 'basicConstraints=critical,CA:FALSE',
        '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment');
      run('req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'root-key.pem', '-out', 'root.pem', '-nodes',
        '-days', String(PKI.days), '-sha256', '-subj', '/C=KR/O=WTools Test/CN=WTools Root CA',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:1',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-addext', 'subjectKeyIdentifier=hash');
      run('req', '-new', '-newkey', 'rsa:2048', '-keyout', 'intermediate-key.pem', '-out', 'intermediate.csr', '-nodes',
        '-sha256', '-subj', '/C=KR/O=WTools Test/CN=WTools Intermediate CA',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-addext', 'subjectKeyIdentifier=hash',
        '-addext', 'authorityInfoAccess=caIssuers;URI:https://status.wtools.test/root.der',
        '-addext', 'crlDistributionPoints=URI:https://status.wtools.test/root.crl');
      run('x509', '-req', '-in', 'intermediate.csr', '-CA', 'root.pem', '-CAkey', 'root-key.pem', '-CAcreateserial',
        '-out', 'intermediate.pem', '-days', String(PKI.days), '-sha256', '-copy_extensions', 'copy');
      mkdirSync(join(dir, 'newcerts'));
      writeFileSync(join(dir, 'index.txt'), '');
      writeFileSync(join(dir, 'leaf-serial'), '1000\n');
      writeFileSync(join(dir, 'crlnumber'), '1000\n');
      writeFileSync(join(dir, 'intermediate-ca.cnf'), `
[ ca ]
default_ca = CA_default

[ CA_default ]
database = index.txt
serial = leaf-serial
crlnumber = crlnumber
new_certs_dir = newcerts
certificate = intermediate.pem
private_key = intermediate-key.pem
default_md = sha256
default_days = ${PKI.days}
default_crl_days = 30
policy = policy_any
x509_extensions = server_cert
copy_extensions = copy
unique_subject = no

[ policy_any ]
countryName = optional
stateOrProvinceName = optional
localityName = optional
organizationName = optional
organizationalUnitName = optional
commonName = supplied
emailAddress = optional

[ server_cert ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
authorityInfoAccess = OCSP;URI:https://status.wtools.test/ocsp,caIssuers;URI:https://status.wtools.test/intermediate.der
crlDistributionPoints = URI:https://status.wtools.test/intermediate.crl
`);
      run('ca', '-batch', '-config', 'intermediate-ca.cnf', '-in', 'request.csr', '-out', 'leaf.pem', '-notext');
      run('x509', '-in', 'intermediate.pem', '-outform', 'DER', '-out', 'intermediate.der');
      run('ca', '-gencrl', '-config', 'intermediate-ca.cnf', '-out', 'clean-crl.pem');
      run('ocsp', '-index', 'index.txt', '-rsigner', 'intermediate.pem', '-rkey', 'intermediate-key.pem',
        '-CA', 'intermediate.pem', '-issuer', 'intermediate.pem', '-cert', 'leaf.pem',
        '-respout', 'ocsp-good.der', '-ndays', '7');
      run('ca', '-batch', '-config', 'intermediate-ca.cnf', '-revoke', 'leaf.pem', '-crl_reason', 'keyCompromise');
      run('ca', '-gencrl', '-config', 'intermediate-ca.cnf', '-out', 'revoked-crl.pem');
      run('ocsp', '-index', 'index.txt', '-rsigner', 'intermediate.pem', '-rkey', 'intermediate-key.pem',
        '-CA', 'intermediate.pem', '-issuer', 'intermediate.pem', '-cert', 'leaf.pem',
        '-respout', 'ocsp-revoked.der', '-ndays', '7');
    }
    const read = (name) => readFileSync(join(dir, name), 'utf8');
    const result = {
      cert: read('cert.pem'), rsaKey: read('rsa.pem'), ecKey: read('ec.pem'),
      rsaPublicKey: read('rsa-public.pem'), ecPublicKey: read('ec-public.pem'),
      ec384Key: read('ec384.pem'), ec384PublicKey: read('ec384-public.pem'),
      ec521Key: read('ec521.pem'), ec521PublicKey: read('ec521-public.pem'),
      ecPkcs8Key: read('ec-pkcs8.pem'), encryptedRsaKey: read('rsa-enc.pem'),
    };
    if (workflow) Object.assign(result, {
      csr: read('request.csr'), leafCert: read('leaf.pem'),
      intermediateCert: read('intermediate.pem'), rootCert: read('root.pem'),
      dsaCert: read('dsa-cert.pem'),
      intermediateDer: readFileSync(join(dir, 'intermediate.der')),
      cleanCrl: read('clean-crl.pem'), revokedCrl: read('revoked-crl.pem'),
      ocspGood: readFileSync(join(dir, 'ocsp-good.der')),
      ocspRevoked: readFileSync(join(dir, 'ocsp-revoked.der')),
    });
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// PEM 블록 하나를 DER 바이트로 되돌린다.
export function pemToDer(pem) {
  return Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
}

// A file-backed stdin avoids pipe EOF stalls during concurrent browser/oracle jobs.
function codecOracle(program, args, input, maxBuffer = 128 * 1024 * 1024) {
  const directory = mkdtempSync(join(tmpdir(), 'wtools-codec-'));
  const path = join(directory, 'input');
  let fd;
  try {
    writeFileSync(path, input); fd = openSync(path, 'r');
    return execFileSync(program, args, { stdio: [fd, 'pipe', 'pipe'], maxBuffer, timeout: 30000 });
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(directory, { recursive: true, force: true });
  }
}

// Independent native liblz4 oracle. Ubuntu's liblz4-1 (Playwright image) or Homebrew
// liblz4 is used only by tests, never by the static application.
export function nativeLz4(input, action = 'compress', options = {}) {
  return codecOracle('python3', ['-c', `
import ctypes as c, ctypes.util, json, sys
from pathlib import Path
path = ctypes.util.find_library('lz4') or next((str(p) for p in [Path('/opt/homebrew/lib/liblz4.dylib'), Path('/usr/local/lib/liblz4.dylib')] if p.exists()), None)
if not path:
    raise RuntimeError('Native LZ4 test oracle is missing (liblz4-1 or Homebrew lz4)')
lib = c.CDLL(path)
class Info(c.Structure):
    _fields_ = [('blockSizeID', c.c_int), ('blockMode', c.c_int), ('contentChecksumFlag', c.c_int),
                ('frameType', c.c_int), ('contentSize', c.c_ulonglong), ('dictID', c.c_uint), ('blockChecksumFlag', c.c_int)]
class Preferences(c.Structure):
    _fields_ = [('frameInfo', Info), ('compressionLevel', c.c_int), ('autoFlush', c.c_uint),
                ('favorDecSpeed', c.c_uint), ('reserved', c.c_uint * 3)]
def function(name, args):
    f = getattr(lib, name); f.argtypes = args; f.restype = c.c_size_t
    return f
is_error = function('LZ4F_isError', [c.c_size_t])
def check(value):
    if is_error(value): raise ValueError('Invalid native LZ4 frame')
    return value
source = sys.stdin.buffer.read(); src = c.create_string_buffer(source)
if sys.argv[1] == 'compress':
    o = json.loads(sys.argv[2]); prefs = Preferences()
    prefs.frameInfo.blockSizeID = o.get('blockSize', 4)
    prefs.frameInfo.blockMode = int(o.get('independent', True))
    prefs.frameInfo.contentChecksumFlag = int(o.get('contentChecksum', True))
    prefs.frameInfo.blockChecksumFlag = int(o.get('blockChecksum', True))
    prefs.frameInfo.contentSize = len(source) if o.get('contentSize', True) else 0
    prefs.compressionLevel = o.get('level', 0)
    bound = function('LZ4F_compressFrameBound', [c.c_size_t, c.POINTER(Preferences)])(len(source), c.byref(prefs))
    dst = c.create_string_buffer(check(bound))
    size = check(function('LZ4F_compressFrame', [c.c_void_p,c.c_size_t,c.c_void_p,c.c_size_t,c.POINTER(Preferences)])(
        dst,len(dst),src,len(source),c.byref(prefs)))
    sys.stdout.buffer.write(dst.raw[:size])
else:
    context = c.c_void_p()
    check(function('LZ4F_createDecompressionContext', [c.POINTER(c.c_void_p), c.c_uint])(c.byref(context),100))
    decode = function('LZ4F_decompress', [c.c_void_p,c.c_void_p,c.POINTER(c.c_size_t),c.c_void_p,c.POINTER(c.c_size_t),c.c_void_p])
    cursor = 0; parts = []; output = 0; hint = 1
    try:
        while cursor < len(source):
            dst = c.create_string_buffer(4*1024*1024)
            available = c.c_size_t(len(source)-cursor); capacity = c.c_size_t(len(dst))
            hint = check(decode(context,dst,c.byref(capacity),c.byref(src,cursor),c.byref(available),None))
            if not available.value and not capacity.value: raise ValueError('Truncated LZ4')
            cursor += available.value; output += capacity.value
            if output > 128*1024*1024: raise ValueError('Oracle output limit')
            parts.append(dst.raw[:capacity.value])
        if hint: raise ValueError('Truncated LZ4')
        sys.stdout.buffer.write(b''.join(parts))
    finally:
        function('LZ4F_freeDecompressionContext', [c.c_void_p])(context)
`, action, JSON.stringify(options)], input);
}

export function makeBzip2(input, level = 9) {
  return codecOracle('python3', ['-c',
    'import bz2,sys;sys.stdout.buffer.write(bz2.compress(sys.stdin.buffer.read(),compresslevel=int(sys.argv[1])))', String(level)],
  input, 16 * 1024 * 1024);
}

export function codecCorpus() {
  let seed = 751;
  const noise = Buffer.alloc(1048577);
  for (let i = 0; i < noise.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; noise[i] = seed & 255; }
  return [Buffer.alloc(0), Buffer.from([0xff]), Buffer.from('한글·NUL\0·🌏\n'.repeat(100)),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    ...[31, 32, 255, 256, 4095, 4096, 65535, 65536, 65537, 100001, 131072, 131073, 900001, 1048577].map((n) => noise.subarray(0, n)),
    Buffer.alloc(1048577, 97), Buffer.from(noise.map((byte) => byte & 15)),
    Buffer.from(noise.map((byte) => (byte & 15) + 128)),
    Buffer.concat([noise.subarray(0, 70000), noise.subarray(0, 70000)])];
}

// No four-byte runs: Python's first RLE stage is an identity, so randomisation
// can be applied before compression. Native bz2 validates the patched stream.
export function randomizedBzip2(length = 600000) {
  const plain = Buffer.from(Array.from({ length }, (_, i) => i % 251));
  const scrambled = Buffer.from(plain);
  let remaining = 0, index = 0;
  for (let i = 0; i < length; i++) {
    if (!remaining) { remaining = RANDOM_NUMBERS[index]; index = (index + 1) & 511; }
    remaining--;
    if (remaining === 1) scrambled[i] ^= 1;
  }
  const packed = execFileSync('python3', ['-c',
    'import bz2,sys;sys.stdout.buffer.write(bz2.compress(sys.stdin.buffer.read(),compresslevel=9))'],
  { input: scrambled, maxBuffer: 4 * 1024 * 1024 });
  let crc = 0xffffffff;
  for (const byte of plain) {
    crc ^= byte << 24;
    for (let i = 0; i < 8; i++) crc = (crc << 1) ^ ((crc & 0x80000000) ? 0x04c11db7 : 0);
  }
  crc = (~crc) >>> 0;
  packed.writeUInt32BE(crc, 10);
  packed[14] |= 0x80;
  let bits = [...packed].map(byte => byte.toString(2).padStart(8, '0')).join('');
  const end = bits.lastIndexOf('000101110111001001000101001110000101000010010000');
  if (end < 0) throw new Error('Missing bzip2 footer');
  bits = bits.slice(0, end + 48) + crc.toString(2).padStart(32, '0') + bits.slice(end + 80);
  const bytes = Buffer.from(Array.from({ length: bits.length / 8 }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const native = execFileSync('python3', ['-c', 'import bz2,sys;sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))'],
    { input: bytes, maxBuffer: 4 * 1024 * 1024 });
  if (!native.equals(plain)) throw new Error('Native randomized bzip2 mismatch');
  return { bytes, plain };
}

// ZSTD_decompress is strict about incomplete/trailing frames. Node's streaming
// convenience wrapper accepts some truncated inputs, so it is not a malformed oracle.
export function nativeZstdDecodeBatch(vectors, maxOutputLength = 65536) {
  return JSON.parse(codecOracle('python3', ['-c', `
import base64, ctypes as c, ctypes.util, json, sys
from pathlib import Path
path = ctypes.util.find_library('zstd') or next((str(p) for p in [Path('/opt/homebrew/lib/libzstd.dylib'),Path('/usr/local/lib/libzstd.dylib')] if p.exists()), None)
if not path: raise RuntimeError('Native Zstandard test oracle is missing (libzstd1 or Homebrew zstd)')
lib = c.CDLL(path); decode = lib.ZSTD_decompress
decode.argtypes = [c.c_void_p,c.c_size_t,c.c_void_p,c.c_size_t]; decode.restype = c.c_size_t
lib.ZSTD_isError.argtypes = [c.c_size_t]; lib.ZSTD_isError.restype = c.c_uint
output = c.create_string_buffer(int(sys.argv[1])); results = []
for encoded in json.load(sys.stdin):
    source = base64.b64decode(encoded); src = c.create_string_buffer(source)
    length = decode(output,len(output),src,len(source))
    results.append(None if lib.ZSTD_isError(length) else base64.b64encode(output.raw[:length]).decode())
json.dump(results,sys.stdout)
`, String(maxOutputLength)], Buffer.from(JSON.stringify(vectors)), 16 * 1024 * 1024).toString());
}
