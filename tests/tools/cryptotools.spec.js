// 암호화 / 복호화 도구 정밀 테스트.
// 결정적 벡터(raw 키 + 0 IV AES, RFC 4226 HOTP, PBKDF2 고정 솔트)와
// 왕복(암호화→복호화) 검증을 함께 사용한다. bcrypt·jsrsasign·openpgp는
// CDN 지연 로드 경로까지 함께 검증된다.
import { test, expect, toolCases, openTool, ioSection, setOption, fillInputs, clickAction } from '../helpers.js';

// AES-128-CBC, 키 000102..0f, 0 IV, PKCS7 — node crypto로 계산한 기대값
const AES_KEY = '000102030405060708090a0b0c0d0e0f';
const AES_CIPHER_HEX = 'dffe8abce30cbb4057f416ff0ec7be10';
// RFC 4226 부록 D 시크릿 "12345678901234567890"의 Base32
const HOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const cases = [
  // AES — raw 키 + 0 IV는 결정적이므로 OpenSSL(node)과 교차 검증
  {
    name: 'aes: raw 키 암호화 (node 교차 검증)', tool: 'aes',
    options: { '키 유도': 'raw', '암호문 형식': 'hex' },
    inputs: ['Secret message', AES_KEY], action: '암호화', output: AES_CIPHER_HEX,
  },
  {
    name: 'aes: raw 키 복호화', tool: 'aes',
    options: { '키 유도': 'raw', '암호문 형식': 'hex' },
    inputs: [AES_CIPHER_HEX, AES_KEY], action: '복호화', output: 'Secret message',
  },
  {
    name: 'aes: 잘못된 키 복호화는 에러', tool: 'aes',
    options: { '키 유도': 'raw', '암호문 형식': 'hex' },
    inputs: [AES_CIPHER_HEX, 'ffffffffffffffffffffffffffffffff'], action: '복호화',
    output: /^⚠ /,
  },

  // XOR — node 교차 검증
  {
    name: 'xor: 텍스트 → Hex', tool: 'xor',
    options: { '출력 형식': 'hex' }, inputs: ['Hello XOR', 'KEY'],
    output: '032035272a79130a0b',
  },
  {
    name: 'xor: Hex → 텍스트 (복호화)', tool: 'xor',
    options: { '입력 형식': 'hex', '출력 형식': 'text' },
    inputs: ['032035272a79130a0b', 'KEY'], output: 'Hello XOR',
  },
  {
    name: 'xor-brute: 단일 바이트 키 복원', tool: 'xor-brute',
    inputs: '0a272e2e2d6e62152d302e2663',
    htmlContains: ['0x42', 'Hello, World!'],
  },

  // PBKDF2 — 고정 솔트 해시에 대한 검증 (node 교차 검증)
  {
    name: 'password-hash: PBKDF2 검증 성공', tool: 'password-hash',
    inputs: ['correct horse battery staple', '$pbkdf2-sha256$10000$c2FsdHNhbHRzYWx0c2FsdA$594SEcFUiZ2QQwYUOUz8-13TozqnAq5v4peDdplb-mg'],
    action: '검증', output: '✔ 비밀번호가 일치합니다.',
  },
  {
    name: 'password-hash: PBKDF2 잘못된 비밀번호', tool: 'password-hash',
    inputs: ['wrong password', '$pbkdf2-sha256$10000$c2FsdHNhbHRzYWx0c2FsdA$594SEcFUiZ2QQwYUOUz8-13TozqnAq5v4peDdplb-mg'],
    action: '검증', output: '✘ 비밀번호가 일치하지 않습니다.',
  },

  // TOTP / HOTP — RFC 4226 부록 D 벡터 (카운터 기반이라 결정적)
  {
    name: 'otp: HOTP 카운터 0 (RFC 4226)', tool: 'otp',
    options: { '방식': 'hotp', '알고리즘': 'SHA1', '자릿수': '6', '주기/카운터': 0 },
    inputs: HOTP_SECRET, action: '코드 생성', htmlContains: ['755224'],
  },
  {
    name: 'otp: HOTP 카운터 9 (RFC 4226)', tool: 'otp',
    options: { '방식': 'hotp', '알고리즘': 'SHA1', '자릿수': '6', '주기/카운터': 9 },
    inputs: HOTP_SECRET, action: '코드 생성', htmlContains: ['520489'],
  },
  {
    name: 'otp: HOTP 코드 검증 성공', tool: 'otp',
    options: { '방식': 'hotp', '주기/카운터': 1 },
    inputs: [HOTP_SECRET, '287082'], action: '코드 검증', htmlContains: ['코드가 유효합니다'],
  },
  {
    name: 'otp: HOTP 잘못된 코드', tool: 'otp',
    options: { '방식': 'hotp', '주기/카운터': 1 },
    inputs: [HOTP_SECRET, '000000'], action: '코드 검증', htmlContains: ['코드가 올바르지 않습니다'],
  },
  {
    name: 'otp: otpauth URI 생성', tool: 'otp',
    options: { '방식': 'hotp', '주기/카운터': 5 },
    inputs: HOTP_SECRET, action: 'URI / QR 생성',
    htmlContains: ['otpauth://hotp/W-Tools%3Auser%40example.com', 'counter=5', `secret=${HOTP_SECRET}`],
  },

  // 토큰 생성기 — 무작위이므로 형식만 검증
  {
    name: 'token-gen: Hex 토큰 형식', tool: 'token-gen',
    options: { '문자 집합': 'hex', '길이': 32, '개수': 2 }, action: '생성',
    output: /^[0-9a-f]{32}\n[0-9a-f]{32}$/,
  },
  {
    name: 'token-gen: 커스텀 문자 미입력은 에러', tool: 'token-gen',
    options: { '문자 집합': 'custom' }, action: '생성',
    error: '커스텀 문자를 입력하세요.',
  },
];

toolCases('cryptotools', cases);

// 대칭키 암호화 → 복호화 왕복 (OpenSSL 비밀번호 모드, 솔트가 랜덤이라 왕복으로 검증)
for (const toolId of ['aes', 'des', 'tripledes', 'blowfish']) {
  test(`${toolId}: 비밀번호 모드 암호화·복호화 왕복`, async ({ page }) => {
    await openTool(page, toolId);
    const io = ioSection(page);
    const plain = '왕복 테스트 round trip!';
    await fillInputs(io, [plain, 'test-password']);
    await clickAction(io, '암호화');
    const out = io.locator('textarea.out');
    // OpenSSL Salted__ 형식은 base64로 "U2FsdGVk"로 시작한다.
    await expect(out).toHaveValue(/^U2FsdGVk/);
    const cipher = await out.inputValue();
    await fillInputs(io, [cipher]);
    await clickAction(io, '복호화');
    await expect(out).toHaveValue(plain);
  });
}

// PBKDF2 생성 → 검증 왕복
test('password-hash: PBKDF2 생성 후 검증 왕복', async ({ page }) => {
  await openTool(page, 'password-hash');
  const io = ioSection(page);
  await setOption(io, 'PBKDF2 반복 횟수', 10000);
  await fillInputs(io, ['테스트 비밀번호 1!']);
  await clickAction(io, '해시 생성');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/^\$pbkdf2-sha256\$10000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  const encoded = await out.inputValue();
  await fillInputs(io, [null, encoded]);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✔ 비밀번호가 일치합니다.');
});

// bcrypt 생성 → 검증 왕복 (CDN bcrypt 라이브러리 로드 포함)
test('password-hash: bcrypt 생성 후 검증 왕복', async ({ page }) => {
  await openTool(page, 'password-hash');
  const io = ioSection(page);
  await setOption(io, '알고리즘', 'bcrypt');
  await setOption(io, 'bcrypt Cost', 4); // 테스트용 최소 비용
  await fillInputs(io, ['bcrypt 테스트']);
  await clickAction(io, '해시 생성');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/^\$2[aby]\$04\$/);
  const encoded = await out.inputValue();
  await fillInputs(io, [null, encoded]);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✔ 비밀번호가 일치합니다.');
  await fillInputs(io, ['다른 비밀번호']);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✘ 비밀번호가 일치하지 않습니다.');
});

// RSA 키 생성 → 암호화/복호화 → 서명/검증 통합 (jsrsasign CDN 로드 포함)
test('rsa: 키 생성 → 암복호화 → 서명/검증 통합', async ({ page }) => {
  test.setTimeout(90_000); // RSA 키 생성은 수 초가 걸릴 수 있다
  await openTool(page, 'rsa-keygen');
  await page.getByLabel('키 크기').selectOption('1024'); // 테스트용 최소 크기
  await page.getByRole('button', { name: '키 생성' }).click();
  const privTa = page.locator('#content textarea.mono').nth(0);
  const pubTa = page.locator('#content textarea.mono').nth(1);
  await expect(privTa).toHaveValue(/BEGIN PRIVATE KEY/, { timeout: 60_000 });
  await expect(pubTa).toHaveValue(/BEGIN PUBLIC KEY/);
  const priv = await privTa.inputValue();
  const pub = await pubTa.inputValue();

  await openTool(page, 'rsa-crypt');
  const io = ioSection(page);
  const message = 'RSA 왕복 테스트 메시지';
  await fillInputs(io, [message, pub]);
  await clickAction(io, '암호화');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/^[A-Za-z0-9+/=]+$/);
  const cipher = await out.inputValue();

  await fillInputs(io, [cipher, priv]);
  await clickAction(io, '복호화');
  await expect(out).toHaveValue(message);

  await fillInputs(io, [message, priv]);
  await clickAction(io, '서명');
  await expect(out).toHaveValue(/^[A-Za-z0-9+/=]+$/);
  const sig = await out.inputValue();

  await fillInputs(io, [`${message}\n---SIGNATURE---\n${sig}`, pub]);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✔ 서명이 유효합니다.');
});

// PGP 키 생성 → 암호화/복호화 왕복 (openpgp ESM CDN 로드 포함)
test('pgp: 키 생성 → 암복호화 왕복', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'pgp-keygen');
  const genIo = ioSection(page);
  await fillInputs(genIo, ['테스터 <tester@example.com>']);
  await clickAction(genIo, '키 생성');
  const genOut = genIo.locator('textarea.out');
  await expect(genOut).toHaveValue(/END PGP PRIVATE KEY BLOCK/, { timeout: 60_000 });
  const keys = await genOut.inputValue();
  const pub = keys.match(/-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/)[0];
  const priv = keys.match(/-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/)[0];

  await openTool(page, 'pgp-crypt');
  const io = ioSection(page);
  const message = 'PGP 왕복 비밀 메시지';
  await fillInputs(io, [message, pub]);
  await clickAction(io, '암호화');
  const out = io.locator('textarea.out');
  await expect(out).toHaveValue(/BEGIN PGP MESSAGE/, { timeout: 30_000 });
  const armored = await out.inputValue();

  await fillInputs(io, [armored, priv]);
  await clickAction(io, '복호화');
  await expect(out).toHaveValue(message, { timeout: 30_000 });
});
