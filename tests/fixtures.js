// 테스트용 이미지·인증서 재료 생성기.
// 바이너리 파일과 개인키를 저장소에 커밋하지 않도록, 필요한 재료를 테스트 실행 중에 만든다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';

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
