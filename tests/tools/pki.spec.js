// 공개키 / 인증서 도구 정밀 테스트.
// 개인키는 커밋하지 않으므로 자체 서명 인증서와 키를 테스트 실행 중에 만들고,
// SSH 공개키는 GitHub가 공개한 호스트 키 벡터를 쓴다 (지문은 node crypto로 교차 검증).
import { createHash } from 'node:crypto';
import { test, expect, toolCases, openTool, ioSection, setOption, fillInputs, clickAction, kvValue } from '../helpers.js';
import { PKI, makeTestPki, pemToDer } from '../fixtures.js';

const pki = makeTestPki();
const CERT_HEX = pemToDer(pki.cert).toString('hex');

// GitHub가 문서로 공개한 SSH 호스트 키 (공개키이므로 벡터로 커밋해도 안전하다).
const SSH_ED25519 = 'AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';
const SSH_RSA = 'AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGL'
  + 'VlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72p'
  + 'cEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA'
  + '179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51Z'
  + 'qExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp'
  + '+S5hpQs+p1vN1/wsjk=';

const fingerprints = (b64) => {
  const raw = Buffer.from(b64, 'base64');
  return {
    md5: 'MD5:' + createHash('md5').update(raw).digest('hex').match(/../g).join(':'),
    sha256: 'SHA256:' + createHash('sha256').update(raw).digest('base64').replace(/=+$/, ''),
    size: raw.length + ' bytes',
  };
};
const ED25519_FP = fingerprints(SSH_ED25519);
const RSA_FP = fingerprints(SSH_RSA);

const cases = [
  /* ---------- x509-parse ---------- */
  {
    name: 'x509-parse: 자체 서명 인증서 필드', tool: 'x509-parse', inputs: pki.cert,
    kv: {
      '버전': 'v3',
      '시리얼 번호': PKI.serialHex,
      '주체 (Subject)': PKI.subject,
      '발급자 (Issuer)': PKI.subject,
      '유효 시작': /^20\d\d-\d\d-\d\d \d\d:\d\d:\d\d UTC$/,
      '유효 만료': /^20\d\d-\d\d-\d\d \d\d:\d\d:\d\d UTC$/,
      '서명 알고리즘': 'SHA256withRSA',
      '공개키 알고리즘': 'RSA',
      '주체 대체 이름 (SAN)': PKI.san.join(', '),
      '키 사용 (Key Usage)': 'digitalSignature,keyEncipherment',
    },
    htmlContains: ['유효 (만료까지 36'],
  },
  { name: 'x509-parse: 인증서가 아니면 에러', tool: 'x509-parse', inputs: '-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----', htmlError: /.+/ },

  /* ---------- asn1-parse ---------- */
  {
    name: 'asn1-parse: 작은 DER 구조', tool: 'asn1-parse', inputs: '30 09 02 01 01 13 04 61 62 63 64',
    output: "SEQUENCE\n  INTEGER 01\n  PrintableString 'abcd'\n",
  },
  {
    name: 'asn1-parse: PEM 인증서를 그대로 받는다', tool: 'asn1-parse', inputs: pki.cert,
    output: /^SEQUENCE\n {2}SEQUENCE\n {4}\[0\]\n {6}INTEGER 02\n {4}INTEGER 1234\n/,
  },
  {
    name: 'asn1-parse: 콜론 구분 Hex도 허용', tool: 'asn1-parse', inputs: CERT_HEX.match(/../g).join(':'),
    output: /ObjectIdentifier SHA256withRSA \(1 2 840 113549 1 1 11\)/,
  },

  /* ---------- pem-hex ---------- */
  { name: 'pem-hex: PEM → Hex는 DER 바이트', tool: 'pem-hex', inputs: pki.cert, action: 'PEM → Hex', output: CERT_HEX },

  /* ---------- ssh-hostkey ---------- */
  {
    name: 'ssh-hostkey: ed25519 지문', tool: 'ssh-hostkey', inputs: `ssh-ed25519 ${SSH_ED25519} git@github.com`,
    kv: {
      '키 타입': 'ssh-ed25519', '비트': '256', '코멘트': 'git@github.com',
      '지문 (MD5)': ED25519_FP.md5,
      // GitHub 문서에 공개된 값
      '지문 (SHA256)': 'SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU',
      '데이터 크기': ED25519_FP.size,
    },
  },
  {
    name: 'ssh-hostkey: RSA 3072비트, 코멘트 없음', tool: 'ssh-hostkey', inputs: `ssh-rsa ${SSH_RSA}`,
    kv: {
      '키 타입': 'ssh-rsa', '비트': '3072 (모듈러스)', '코멘트': '(없음)',
      '지문 (MD5)': RSA_FP.md5,
      '지문 (SHA256)': 'SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s',
      '데이터 크기': RSA_FP.size,
    },
  },
  { name: 'ssh-hostkey: 키 데이터가 없으면 에러', tool: 'ssh-hostkey', inputs: 'ssh-ed25519 not-a-key', htmlError: 'Base64 키 데이터를 찾을 수 없습니다.' },

  /* ---------- privkey-info ---------- */
  {
    name: 'privkey-info: RSA 2048 개인키', tool: 'privkey-info', inputs: pki.rsaKey,
    kv: {
      '키 타입': 'RSA', '키 크기': '2048 bit', '공개 지수 (e)': '65537',
      '모듈러스 (n)': /^[0-9a-f]{64}\.\.\.$/,
      '공개키 PEM': /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/,
    },
  },
  {
    name: 'privkey-info: EC P-256 개인키', tool: 'privkey-info', inputs: pki.ecKey,
    kv: {
      '키 타입': 'EC', '곡선': 'secp256r1',
      '공개키 (hex)': /^04[0-9a-f]{64}\.\.\.$/,
      '공개키 PEM': /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/,
    },
  },
  {
    name: 'privkey-info: 암호화된 키 + 패스프레이즈', tool: 'privkey-info',
    options: { '패스프레이즈(암호화된 키)': PKI.passphrase }, inputs: pki.encryptedRsaKey,
    kv: { '키 타입': 'RSA', '키 크기': '2048 bit' },
  },
  { name: 'privkey-info: 패스프레이즈가 없으면 에러', tool: 'privkey-info', inputs: pki.encryptedRsaKey, htmlError: /.+/ },
  // 인증서·공개키 PEM도 KEYUTIL이 읽어주므로 공개 정보만 표시된다
  {
    name: 'privkey-info: 인증서를 넣으면 공개키 정보', tool: 'privkey-info', inputs: pki.cert,
    kv: { '키 타입': 'RSA', '키 크기': '2048 bit', '공개 지수 (e)': '65537' },
  },
];

toolCases('pki', cases);

/* ---------- pem-hex 왕복 ---------- */

test('pem-hex: PEM → Hex → PEM 왕복', async ({ page }) => {
  await openTool(page, 'pem-hex');
  const io = ioSection(page);
  const out = io.locator('textarea.out');

  await fillInputs(io, pki.cert);
  await clickAction(io, 'PEM → Hex');
  await expect(out).toHaveValue(CERT_HEX);

  await fillInputs(io, await out.inputValue());
  await clickAction(io, 'Hex → PEM');
  await expect(out).toHaveValue(/^-----BEGIN CERTIFICATE-----/);
  expect((await out.inputValue()).replace(/\s/g, '')).toBe(pki.cert.replace(/\s/g, ''));
});

test('pem-hex: PEM 헤더 옵션', async ({ page }) => {
  await openTool(page, 'pem-hex');
  const io = ioSection(page);
  await setOption(io, 'PEM 헤더', 'PUBLIC KEY');
  await fillInputs(io, CERT_HEX);
  await clickAction(io, 'Hex → PEM');
  await expect(io.locator('textarea.out')).toHaveValue(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/);
});

/* ---------- privkey-info: 개인키에서 뽑은 공개키가 인증서의 공개키와 같은지 ---------- */

test('privkey-info: 뽑아낸 공개키 PEM이 X.509 공개키와 같다', async ({ page }) => {
  await openTool(page, 'privkey-info');
  const io = ioSection(page);
  await fillInputs(io, pki.rsaKey);
  await expect.poll(() => kvValue(io, '키 타입')).toBe('RSA');
  const pubPem = await kvValue(io, '공개키 PEM');

  // 같은 공개키를 pem-hex로 DER로 바꾸면 인증서 안의 SPKI 바이트와 일치해야 한다
  await openTool(page, 'pem-hex');
  const pemIo = ioSection(page);
  await fillInputs(pemIo, pubPem);
  await clickAction(pemIo, 'PEM → Hex');
  await expect(pemIo.locator('textarea.out')).toHaveValue(/^[0-9a-f]+$/);
  const spkiHex = await pemIo.locator('textarea.out').inputValue();
  expect(CERT_HEX).toContain(spkiHex);
});

/* ---------- jwk-pem: PEM ↔ JWK 왕복 ----------
   변환이 정확한지는 "돌아온 PEM이 원본과 바이트 단위로 같은가"로 본다. */

const jwkText = (io) => io.locator('.out-html pre').textContent();

for (const [label, pem, kind] of [['EC P-256', 'ecPkcs8Key', 'EC / P-256'], ['RSA 2048', 'rsaKey', 'RSA']]) {
  test(`jwk-pem: ${label} 개인키 PEM → JWK → PEM 왕복`, async ({ page }) => {
    await openTool(page, 'jwk-pem');
    const io = ioSection(page);

    await fillInputs(io, pki[pem]);
    await clickAction(io, 'PEM → JWK');
    await expect.poll(() => kvValue(io, '키 종류')).toBe(kind);
    expect(await kvValue(io, 'PEM 종류')).toBe('PRIVATE KEY');
    expect(await kvValue(io, '지문 (kid)')).toMatch(/^[\w-]{43}$/);

    const jwk = JSON.parse(await jwkText(io));
    expect(jwk.d).toBeTruthy();
    expect(jwk.key_ops).toBeUndefined();

    await fillInputs(io, JSON.stringify(jwk));
    await clickAction(io, 'JWK → PEM');
    await expect.poll(() => kvValue(io, 'PEM 종류')).toBe('PRIVATE KEY');
    expect((await jwkText(io)).replace(/\s/g, '')).toBe(pki[pem].replace(/\s/g, ''));
  });
}

test('jwk-pem: 지문(kid)은 RFC 7638 벡터와 일치한다', async ({ page }) => {
  await openTool(page, 'jwk-pem');
  const io = ioSection(page);
  // RFC 7638 §3.1의 예시 키. 지문은 규격에 값까지 명시되어 있다.
  const rfcJwk = {
    kty: 'RSA',
    n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3okn'
      + 'jhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qM'
      + 'QvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJz'
      + 'KnqDKgw',
    e: 'AQAB', alg: 'RS256', kid: '2011-04-29',
  };
  await fillInputs(io, JSON.stringify(rfcJwk));
  await clickAction(io, 'JWK → PEM');
  await expect.poll(() => kvValue(io, '지문 (kid)')).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
  expect(await jwkText(io)).toMatch(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/);
});

test('jwk-pem: Ed25519 JWK → PEM (RFC 8037 벡터)', async ({ page }) => {
  await openTool(page, 'jwk-pem');
  const io = ioSection(page);
  await fillInputs(io, JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo' }));
  await clickAction(io, 'JWK → PEM');
  await expect.poll(() => kvValue(io, '키 종류')).toBe('OKP / Ed25519');
  expect(await kvValue(io, '지문 (kid)')).toBe('kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k');
  // Ed25519 SPKI는 12바이트 접두사 + 32바이트 공개키로 길이가 고정이다.
  const der = pemToDer(await jwkText(io));
  expect(der.length).toBe(44);
  expect(der.subarray(0, 12).toString('hex')).toBe('302a300506032b6570032100');
});

test('jwk-pem: SEC1 EC 개인키는 변환 방법을 안내한다', async ({ page }) => {
  await openTool(page, 'jwk-pem');
  const io = ioSection(page);
  await fillInputs(io, pki.ecKey); // ecparam이 만든 BEGIN EC PRIVATE KEY
  await clickAction(io, 'PEM → JWK');
  await expect(io.locator('.out-html .error')).toContainText('SEC1 형식은 지원하지 않습니다');
  await expect(io.locator('.out-html .error')).toContainText('openssl pkcs8 -topk8');
});

test('jwk-pem: JWK Set을 넣으면 안내한다', async ({ page }) => {
  await openTool(page, 'jwk-pem');
  const io = ioSection(page);
  await fillInputs(io, '{"keys":[]}');
  await clickAction(io, 'JWK → PEM');
  await expect(io.locator('.out-html .error')).toHaveText('JWK Set(keys 배열)이 아니라 키 하나를 입력하세요.');
});
