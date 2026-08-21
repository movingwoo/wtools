// 암호화 / 복호화 도구 정밀 테스트.
// 결정적 벡터(NIST AES-GCM, AES-CBC, RFC 4226 HOTP, PBKDF2 고정 솔트)와
// 왕복(암호화→복호화) 검증을 함께 사용한다. bcrypt·jsrsasign·openpgp는
// CDN 지연 로드 경로까지 함께 검증된다.
import { test, expect, toolCases, openTool, ioSection, setOption, fillInputs, clickAction, kvValue } from '../helpers.js';

// NIST SP 800-38D AES-128-GCM: 빈 평문, 0 키, 96비트 0 IV → 128비트 인증 태그
const AES_GCM_ZERO_KEY = '00000000000000000000000000000000';
const AES_GCM_ZERO_IV = '000000000000000000000000';
const AES_GCM_EMPTY_TAG = '58e2fccefa7e3061367f1d57a4e7455a';
// AES-128-CBC, 키 000102..0f, 0 IV, PKCS7 — node crypto로 계산한 기대값
const AES_KEY = '000102030405060708090a0b0c0d0e0f';
const AES_CBC_ZERO_IV = '00000000000000000000000000000000';
const AES_CIPHER_HEX = 'dffe8abce30cbb4057f416ff0ec7be10';
// RFC 4226 부록 D 시크릿 "12345678901234567890"의 Base32
const HOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const cases = [
  // AES-GCM — NIST SP 800-38D 공개 벡터. Web Crypto 결과는 ciphertext || tag다.
  {
    name: 'aes: AES-128-GCM NIST 빈 평문 벡터', tool: 'aes',
    options: { '키 크기': '128', '모드': 'GCM', '키 방식': 'raw', '결과 구성': 'raw', '암호문 형식': 'hex' },
    inputs: ['', AES_GCM_ZERO_KEY, AES_GCM_ZERO_IV], action: '암호화', output: AES_GCM_EMPTY_TAG,
  },

  // AES-CBC — 명시적인 0 IV를 사용한 상호 운용용 레거시 벡터
  {
    name: 'aes: raw 키 암호화 (node 교차 검증)', tool: 'aes',
    options: { '키 크기': '128', '모드': 'CBC', '키 방식': 'raw', '결과 구성': 'raw', '암호문 형식': 'hex' },
    inputs: ['Secret message', AES_KEY, AES_CBC_ZERO_IV], action: '암호화', output: AES_CIPHER_HEX,
  },
  {
    name: 'aes: raw 키 복호화', tool: 'aes',
    options: { '키 크기': '128', '모드': 'CBC', '키 방식': 'raw', '결과 구성': 'raw', '암호문 형식': 'hex' },
    inputs: [AES_CIPHER_HEX, AES_KEY, AES_CBC_ZERO_IV], action: '복호화', output: 'Secret message',
  },
  {
    name: 'aes: 키 길이 검증', tool: 'aes',
    options: { '키 크기': '256', '키 방식': 'raw' },
    inputs: ['Secret message', AES_KEY, ''], action: '암호화',
    error: 'AES-256 키는 32바이트여야 합니다. (현재 16바이트)',
  },
  {
    name: 'aes: GCM nonce 길이 검증', tool: 'aes',
    options: { '키 크기': '128', '키 방식': 'raw', '결과 구성': 'raw' },
    inputs: ['Secret message', AES_KEY, AES_CBC_ZERO_IV], action: '암호화',
    error: 'GCM 모드의 IV/nonce는 12바이트여야 합니다. (현재 16바이트)',
  },
  {
    name: 'aes: GCM 192비트 브라우저 호환 오류', tool: 'aes',
    options: { '키 크기': '192', '모드': 'GCM', '키 방식': 'raw', '결과 구성': 'raw' },
    inputs: ['Secret message', '000102030405060708090a0b0c0d0e0f1011121314151617', AES_GCM_ZERO_IV], action: '암호화',
    error: 'AES-GCM 192비트 키는 지원 브라우저 간 호환성이 없습니다. GCM은 128 또는 256비트를 사용하세요.',
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
    options: { '알고리즘': 'pbkdf2' },
    inputs: ['correct horse battery staple', '$pbkdf2-sha256$10000$c2FsdHNhbHRzYWx0c2FsdA$594SEcFUiZ2QQwYUOUz8-13TozqnAq5v4peDdplb-mg'],
    action: '검증', output: '✔ 비밀번호가 일치합니다.',
  },
  {
    name: 'password-hash: PBKDF2 잘못된 비밀번호', tool: 'password-hash',
    options: { '알고리즘': 'pbkdf2' },
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
  {
    name: 'token-gen: 혼동 문자 제외', tool: 'token-gen',
    options: { '문자 집합': 'ascii', '혼동 문자(0/O/1/I/l/|) 제외': true, '길이': 256, '개수': 1 }, action: '생성',
    output: /^[^0O1Il|]{256}$/,
  },
  {
    name: 'token-gen: 문자 종류별 최소 개수 합 검증', tool: 'token-gen',
    options: { '문자 집합': 'ascii', '길이': 4, '대문자 최소': 2, '소문자 최소': 2, '숫자 최소': 1 }, action: '생성',
    error: '문자 종류별 최소 개수 합(5)이 전체 길이(4)보다 큽니다.',
  },
  {
    name: 'token-gen: EFF 단어 패스프레이즈 형식', tool: 'token-gen',
    options: { '생성 방식': 'passphrase', '단어 수': 8, '단어 구분': ' ', '개수': 2 }, action: '생성',
    output: /^[a-z-]+(?: [a-z-]+){7}\n[a-z-]+(?: [a-z-]+){7}$/,
  },

  // 고전 암호 — 교과서 표준 벡터
  { name: 'classic-cipher: ROT13', tool: 'classic-cipher', options: { '방식': 'rot13' }, inputs: ['Hello, World!', ''], action: '암호화', output: 'Uryyb, Jbeyq!' },
  { name: 'classic-cipher: ROT13은 두 번 하면 원문', tool: 'classic-cipher', options: { '방식': 'rot13' }, inputs: ['Uryyb, Jbeyq!', ''], action: '복호화', output: 'Hello, World!' },
  { name: 'classic-cipher: 한글은 그대로 통과', tool: 'classic-cipher', options: { '방식': 'rot13' }, inputs: ['한글 abc 123', ''], action: '암호화', output: '한글 nop 123' },
  { name: 'classic-cipher: ROT47', tool: 'classic-cipher', options: { '방식': 'rot47' }, inputs: ['Hello, World!', ''], action: '암호화', output: 'w6==@[ (@C=5P' },
  {
    name: 'classic-cipher: 카이사르 +3', tool: 'classic-cipher',
    options: { '방식': 'caesar', '카이사르 자리 수': 3 }, inputs: ['ATTACK AT DAWN', ''], action: '암호화', output: 'DWWDFN DW GDZQ',
  },
  {
    name: 'classic-cipher: 카이사르 복호화', tool: 'classic-cipher',
    options: { '방식': 'caesar', '카이사르 자리 수': 3 }, inputs: ['DWWDFN DW GDZQ', ''], action: '복호화', output: 'ATTACK AT DAWN',
  },
  { name: 'classic-cipher: 아트바시', tool: 'classic-cipher', options: { '방식': 'atbash' }, inputs: ['Attack', ''], action: '암호화', output: 'Zggzxp' },
  {
    name: 'classic-cipher: 비제네르 (ATTACKATDAWN/LEMON)', tool: 'classic-cipher',
    options: { '방식': 'vigenere' }, inputs: ['ATTACKATDAWN', 'LEMON'], action: '암호화', output: 'LXFOPVEFRNHR',
  },
  {
    name: 'classic-cipher: 비제네르 복호화', tool: 'classic-cipher',
    options: { '방식': 'vigenere' }, inputs: ['LXFOPVEFRNHR', 'LEMON'], action: '복호화', output: 'ATTACKATDAWN',
  },
  {
    name: 'classic-cipher: 비제네르 키에 영문자가 없으면 에러', tool: 'classic-cipher',
    options: { '방식': 'vigenere' }, inputs: ['abc', '123'], action: '암호화', error: 'Vigenère 키에는 영문자가 하나 이상 있어야 합니다.',
  },
  {
    name: 'classic-cipher: 레일 펜스 3레일', tool: 'classic-cipher',
    options: { '방식': 'rail', '레일 수': 3 }, inputs: ['WEAREDISCOVEREDFLEEATONCE', ''], action: '암호화', output: 'WECRLTEERDSOEEFEAOCAIVDEN',
  },
  {
    name: 'classic-cipher: 레일 펜스 복호화', tool: 'classic-cipher',
    options: { '방식': 'rail', '레일 수': 3 }, inputs: ['WECRLTEERDSOEEFEAOCAIVDEN', ''], action: '복호화', output: 'WEAREDISCOVEREDFLEEATONCE',
  },
  {
    name: 'classic-cipher: 레일 수는 2 이상', tool: 'classic-cipher',
    options: { '방식': 'rail', '레일 수': 1 }, inputs: ['abc', ''], action: '암호화', error: '레일 수는 2 이상의 정수여야 합니다.',
  },
];

toolCases('cryptotools', cases);

test('token-gen: EFF 단어 목록의 출처와 라이선스를 표시', async ({ page }) => {
  await openTool(page, 'token-gen');
  const content = page.locator('#content');
  await expect(content.getByRole('link', { name: 'EFF 짧은 단어 목록 1' }))
    .toHaveAttribute('href', 'https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt');
  await expect(content.getByRole('link', { name: 'CC BY 4.0' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
});

test('token-gen: 대문자·소문자·숫자·기호 최소 개수를 모두 보장', async ({ page }) => {
  await openTool(page, 'token-gen');
  const io = ioSection(page);
  await setOption(io, '문자 집합', 'ascii');
  await setOption(io, '길이', 40);
  await setOption(io, '대문자 최소', 2);
  await setOption(io, '소문자 최소', 3);
  await setOption(io, '숫자 최소', 4);
  await setOption(io, '기호 최소', 5);
  await setOption(io, '개수', 10);
  await clickAction(io, '생성');
  const tokens = (await io.locator('textarea.out').inputValue()).split('\n');
  expect(tokens).toHaveLength(10);
  for (const token of tokens) {
    expect(token).toHaveLength(40);
    expect((token.match(/[A-Z]/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((token.match(/[a-z]/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((token.match(/[0-9]/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((token.match(/[^A-Za-z0-9]/g) || []).length).toBeGreaterThanOrEqual(5);
  }
  await expect(page.locator('.token-entropy')).toContainText('보수적 하한');
});

test('token-gen: 문자 토큰과 패스프레이즈의 엔트로피를 계산해 안내', async ({ page }) => {
  await openTool(page, 'token-gen');
  const io = ioSection(page);
  const info = page.locator('.token-entropy');
  await setOption(io, '문자 집합', 'custom');
  await setOption(io, '커스텀 문자', 'AB');
  await setOption(io, '길이', 10);
  await setOption(io, '개수', 1);
  await clickAction(io, '생성');
  await expect(info).toContainText('추정 엔트로피: 10.0비트');
  await expect(info).toContainText('운영 비밀에는 너무 짧습니다');

  await setOption(io, '생성 방식', 'passphrase');
  await setOption(io, '단어 수', 8);
  await clickAction(io, '생성');
  await expect(info).toContainText('추정 엔트로피: 82.7비트');
  await expect(info).toContainText('고가치 계정의 패스프레이즈나 API 토큰');
});

// AES-GCM 기본값: PBKDF2 salt, IV, 인증 태그를 자체 포함 결과에 보존한다.
for (const format of ['base64', 'hex']) {
  test(`aes: GCM 비밀번호 자체 포함 ${format} 왕복`, async ({ page }) => {
    await openTool(page, 'aes');
    const io = ioSection(page);
    const plain = 'AES-GCM 왕복 테스트 🔐';
    await setOption(io, '암호문 형식', format);
    await fillInputs(io, [plain, 'correct horse battery staple', '']);
    await clickAction(io, '암호화');
    const out = io.locator('textarea.out');
    await expect(io).toHaveAttribute('aria-busy', 'false');
    await expect(out).toHaveValue(format === 'hex' ? /^[0-9a-f]+$/ : /^[A-Za-z0-9+/=]+$/);
    const cipher = await out.inputValue();
    const bytes = Buffer.from(cipher, format);
    const envelope = JSON.parse(bytes.toString('utf8'));
    expect(envelope).toMatchObject({
      v: 1, alg: 'AES-GCM', keyBits: 256, kdf: 'PBKDF2-SHA256', iterations: 600000,
    });
    expect(Buffer.from(envelope.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(envelope.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(envelope.ciphertext, 'base64').length).toBeGreaterThanOrEqual(16);

    await fillInputs(io, [cipher]);
    await clickAction(io, '복호화');
    await expect(out).toHaveValue(plain);
  });
}

for (const [bits, key] of [
  [128, '000102030405060708090a0b0c0d0e0f'],
  [256, '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'],
]) {
  test(`aes: GCM 직접 AES-${bits} 키 왕복`, async ({ page }) => {
    await openTool(page, 'aes');
    const io = ioSection(page);
    const out = io.locator('textarea.out');
    await setOption(io, '키 크기', bits);
    await setOption(io, '키 방식', 'raw');
    await fillInputs(io, [`AES-${bits}`, key, '']);
    await clickAction(io, '암호화');
    await expect(io).toHaveAttribute('aria-busy', 'false');
    await expect(out).toHaveValue(/^[A-Za-z0-9+/=]+$/);
    const cipher = await out.inputValue();
    await fillInputs(io, [cipher]);
    await clickAction(io, '복호화');
    await expect(out).toHaveValue(`AES-${bits}`);
  });
}

test('aes: CBC 직접 AES-192 키 자체 포함 왕복', async ({ page }) => {
  await openTool(page, 'aes');
  const io = ioSection(page);
  const out = io.locator('textarea.out');
  const key = '000102030405060708090a0b0c0d0e0f1011121314151617';
  await setOption(io, '키 크기', 192);
  await setOption(io, '모드', 'CBC');
  await setOption(io, '키 방식', 'raw');
  await fillInputs(io, ['AES-192 CBC', key, '']);
  await clickAction(io, '암호화');
  await expect(out).toHaveValue(/^[A-Za-z0-9+/=]+$/);
  const cipher = await out.inputValue();
  await fillInputs(io, [cipher]);
  await clickAction(io, '복호화');
  await expect(out).toHaveValue('AES-192 CBC');
});

test('aes: GCM 변조 암호문 인증 실패', async ({ page }) => {
  await openTool(page, 'aes');
  const io = ioSection(page);
  const out = io.locator('textarea.out');
  await setOption(io, '키 크기', 128);
  await setOption(io, '키 방식', 'raw');
  await setOption(io, '결과 구성', 'raw');
  await setOption(io, '암호문 형식', 'hex');
  await fillInputs(io, ['변조 감지', AES_KEY, AES_GCM_ZERO_IV]);
  await clickAction(io, '암호화');
  await expect(io).toHaveAttribute('aria-busy', 'false');
  const cipher = await out.inputValue();
  const tampered = cipher.slice(0, -1) + (cipher.endsWith('0') ? '1' : '0');
  await fillInputs(io, [tampered]);
  await clickAction(io, '복호화');
  await expect(out).toHaveValue('⚠ AES-GCM 인증 실패: 키가 다르거나 암호문 또는 인증 태그가 변경되었습니다.');
});

test('aes: OpenSSL 비밀번호 Hex 왕복은 salt를 보존한다', async ({ page }) => {
  await openTool(page, 'aes');
  const io = ioSection(page);
  const out = io.locator('textarea.out');
  await setOption(io, '키 크기', 128);
  await setOption(io, '모드', 'CBC');
  await setOption(io, '키 방식', 'openssl');
  await setOption(io, '암호문 형식', 'hex');
  await fillInputs(io, ['OpenSSL Hex 왕복', 'legacy-password', '']);
  await clickAction(io, '암호화');
  const cipher = await out.inputValue();
  expect(cipher).toMatch(/^53616c7465645f5f[0-9a-f]+$/); // "Salted__" + salt + ciphertext
  await fillInputs(io, [cipher]);
  await clickAction(io, '복호화');
  await expect(out).toHaveValue('OpenSSL Hex 왕복');
});

// DES 계열 레거시 대칭키 왕복 (OpenSSL 비밀번호 모드)
for (const toolId of ['des', 'tripledes', 'blowfish']) {
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
  await setOption(io, '알고리즘', 'pbkdf2'); // 기본값은 Argon2id다
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

/* ---------- ec-sign: 키 생성 → 서명 → 검증 왕복 ----------
   ECDSA 서명은 매번 값이 달라지므로 고정 벡터로 비교할 수 없다. 왕복과 변조 탐지로 본다. */

for (const alg of ['P-256', 'P-384', 'P-521', 'Ed25519']) {
  test(`ec-sign: ${alg} 키 생성 → 서명 → 검증`, async ({ page }) => {
    await openTool(page, 'ec-sign');
    const genIo = ioSection(page, 0);
    await setOption(genIo, '알고리즘', alg);
    await clickAction(genIo, '키 페어 생성');
    await expect.poll(() => kvValue(genIo, '알고리즘')).toBe(alg);
    const privateKey = await kvValue(genIo, '개인키 (PKCS#8 PEM)');
    const publicKey = await kvValue(genIo, '공개키 (SPKI PEM)');
    expect(privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/);
    expect(publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/);

    const io = ioSection(page, 1);
    const out = io.locator('textarea.out');
    await setOption(io, '알고리즘', alg);
    await fillInputs(io, ['message to sign', privateKey, '']);
    await clickAction(io, '서명');
    await expect(out).toHaveValue(/^[A-Za-z0-9+/=]+$/);
    const signature = await out.inputValue();

    await fillInputs(io, ['message to sign', publicKey, signature]);
    await clickAction(io, '검증');
    await expect(out).toHaveValue('✔ 서명이 유효합니다.');

    await fillInputs(io, ['tampered message', publicKey, signature]);
    await clickAction(io, '검증');
    await expect(out).toHaveValue('✘ 서명이 올바르지 않습니다.');
  });
}

test('ec-sign: DER 서명도 같은 키로 검증된다', async ({ page }) => {
  await openTool(page, 'ec-sign');
  const genIo = ioSection(page, 0);
  await clickAction(genIo, '키 페어 생성');
  await expect.poll(() => kvValue(genIo, '알고리즘')).toBe('P-256');
  const privateKey = await kvValue(genIo, '개인키 (PKCS#8 PEM)');
  const publicKey = await kvValue(genIo, '공개키 (SPKI PEM)');

  const io = ioSection(page, 1);
  const out = io.locator('textarea.out');
  await setOption(io, '서명 형식', 'der');
  await setOption(io, '출력 인코딩', 'hex');
  await fillInputs(io, ['hello der', privateKey, '']);
  await clickAction(io, '서명');
  await expect(out).toHaveValue(/^30[0-9a-f]+$/); // DER SEQUENCE
  await fillInputs(io, ['hello der', publicKey, await out.inputValue()]);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✔ 서명이 유효합니다.');
});

test('ec-sign: 길이가 맞지 않는 서명은 에러', async ({ page }) => {
  await openTool(page, 'ec-sign');
  const genIo = ioSection(page, 0);
  await clickAction(genIo, '키 페어 생성');
  await expect.poll(() => kvValue(genIo, '알고리즘')).toBe('P-256');
  const publicKey = await kvValue(genIo, '공개키 (SPKI PEM)');
  const io = ioSection(page, 1);
  await fillInputs(io, ['x', publicKey, 'AAAA']);
  await clickAction(io, '검증');
  await expect(io.locator('textarea.out')).toHaveValue('⚠ P-256 서명은 64바이트여야 합니다 (현재 3바이트).');
});

/* ---------- password-hash: Argon2 ---------- */

test('password-hash: Argon2id 생성 후 검증', async ({ page }) => {
  await openTool(page, 'password-hash');
  const io = ioSection(page);
  const out = io.locator('textarea.out');
  // 테스트에서는 메모리를 작게 잡아 빠르게 끝낸다.
  await setOption(io, 'Argon2 메모리(MiB)', 8);
  await setOption(io, 'Argon2 반복', 2);

  await fillInputs(io, ['correct horse battery staple', '']);
  await clickAction(io, '해시 생성');
  await expect(out).toHaveValue(/^\$argon2id\$v=19\$m=8192,t=2,p=1\$[\w+/]+\$[\w+/]+$/);
  const hash = await out.inputValue();

  await fillInputs(io, ['correct horse battery staple', hash]);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✔ 비밀번호가 일치합니다.');

  await fillInputs(io, ['wrong password', hash]);
  await clickAction(io, '검증');
  await expect(out).toHaveValue('✘ 비밀번호가 일치하지 않습니다.');
});

test('password-hash: Argon2 메모리 범위 검사', async ({ page }) => {
  await openTool(page, 'password-hash');
  const io = ioSection(page);
  await setOption(io, 'Argon2 메모리(MiB)', 9999);
  await fillInputs(io, ['pw', '']);
  await clickAction(io, '해시 생성');
  await expect(io.locator('textarea.out')).toHaveValue('⚠ Argon2 메모리는 1~1024 MiB로 입력하세요.');
});
