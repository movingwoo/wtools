// 인코딩 / 디코딩 도구 정밀 테스트 — 대표 입력에 대한 기대 출력 검증.
import { createHmac } from 'node:crypto';
import { test, expect, toolCases, openTool, ioSection, fillInputs, setOption, clickAction } from '../helpers.js';
import { makeTestPki } from '../fixtures.js';

const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwtTestSecret = '0123456789abcdef0123456789abcdef';
const signHs256 = (payload, key = jwtTestSecret) => {
  const signingInput = `${jwtPart({ alg: 'HS256', typ: 'JWT' })}.${jwtPart(payload)}`;
  return `${signingInput}.${createHmac('sha256', key).update(signingInput).digest('base64url')}`;
};
const jwtTestNow = Math.floor(Date.now() / 1000);

const cases = [
  // Base64
  { name: 'base64: 표준 인코딩', tool: 'base64', inputs: 'Hello, World!', action: '인코딩', output: 'SGVsbG8sIFdvcmxkIQ==' },
  { name: 'base64: 디코딩', tool: 'base64', inputs: 'SGVsbG8sIFdvcmxkIQ==', action: '디코딩', output: 'Hello, World!' },
  { name: 'base64: URL-safe 알파벳', tool: 'base64', options: { '알파벳': 'url' }, inputs: '>>>?', action: '인코딩', output: 'Pj4-Pw==' },
  { name: 'base64: 패딩 없음', tool: 'base64', options: { '패딩(=)': false }, inputs: 'Hello', action: '인코딩', output: 'SGVsbG8' },
  { name: 'base64: 잘못된 커스텀 알파벳은 에러', tool: 'base64', options: { '알파벳': 'custom' }, inputs: 'a', action: '인코딩', error: '커스텀 알파벳은 서로 다른 64자여야 합니다.' },

  // Base32 (RFC 4648 테스트 벡터)
  { name: 'base32: 표준 인코딩 (RFC 4648)', tool: 'base32', inputs: 'foobar', action: '인코딩', output: 'MZXW6YTBOI======' },
  { name: 'base32: 디코딩', tool: 'base32', inputs: 'MZXW6YTBOI======', action: '디코딩', output: 'foobar' },
  { name: 'base32: Extended Hex 알파벳', tool: 'base32', options: { '알파벳': 'hex' }, inputs: 'foobar', action: '인코딩', output: 'CPNMUOJ1E8======' },

  // URL 인코딩
  { name: 'url-encode: encodeURIComponent', tool: 'url-encode', inputs: '한글 검색', action: '인코딩', output: '%ED%95%9C%EA%B8%80%20%EA%B2%80%EC%83%89' },
  { name: 'url-encode: encodeURI (구조 유지)', tool: 'url-encode', options: { '방식': 'uri' }, inputs: 'https://example.com/a b?q=1', action: '인코딩', output: 'https://example.com/a%20b?q=1' },
  { name: 'url-encode: 디코딩 (+ → 공백)', tool: 'url-encode', inputs: 'a%2Bb+c%20d', action: '디코딩', output: 'a+b c d' },

  // URL 파서
  {
    name: 'url-parser: 구성 요소 분해', tool: 'url-parser',
    inputs: 'https://user:pw@example.com:8080/path/page?a=1&b=2#frag',
    kv: { '프로토콜': 'https:', '호스트명': 'example.com', '포트': '8080', '경로': '/path/page', '해시(fragment)': '#frag', 'origin': 'https://example.com:8080' },
    htmlContains: ['쿼리 파라미터'],
  },

  // HTML 엔티티
  { name: 'html-entities: 특수문자 인코딩', tool: 'html-entities', inputs: '<a href="x">\'&\'</a>', action: '인코딩', output: '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;' },
  { name: 'html-entities: 디코딩 (이름/10진/16진)', tool: 'html-entities', inputs: '&lt;b&gt; &amp; &#65; &#x2764;', action: '디코딩', output: '<b> & A ❤' },
  { name: 'html-entities: 비ASCII 변환', tool: 'html-entities', options: { '비ASCII 문자도 변환': true }, inputs: '한A', action: '인코딩', output: '&#xD55C;A' },

  // Unicode 이스케이프
  { name: 'unicode-escape: \\uXXXX 인코딩', tool: 'unicode-escape', inputs: '한글', action: '인코딩', output: '\\uD55C\\uAE00' },
  { name: 'unicode-escape: ES6 \\u{...} 형식', tool: 'unicode-escape', options: { '형식': 'es6' }, inputs: '😀', action: '인코딩', output: '\\u{1F600}' },
  { name: 'unicode-escape: 디코딩', tool: 'unicode-escape', inputs: '\\u0041\\u{1F600}', action: '디코딩', output: 'A😀' },
  { name: 'unicode-escape: U+XXXX 형식 (전부 변환)', tool: 'unicode-escape', options: { '형식': 'uplus', 'ASCII 포함 전부 변환': true }, inputs: 'A', action: '인코딩', output: 'U+0041' },

  // 모스 부호
  { name: 'morse: 인코딩', tool: 'morse', inputs: 'HELLO WORLD', action: '인코딩', output: '.... . .-.. .-.. --- / .-- --- .-. .-.. -..' },
  { name: 'morse: 디코딩', tool: 'morse', inputs: '... --- ...', action: '디코딩', output: 'SOS' },
  { name: 'morse: 변환 불가 문자는 에러', tool: 'morse', inputs: '안녕', action: '인코딩', error: '모스 부호로 변환할 수 없는 문자: "안"' },

  // 텍스트 ↔ 이진수
  { name: 'text-binary: 텍스트 → 이진수', tool: 'text-binary', inputs: 'Hi', action: '텍스트 → 이진수', output: '01001000 01101001' },
  { name: 'text-binary: 구분자 없음', tool: 'text-binary', options: { '구분자': '' }, inputs: 'Hi', action: '텍스트 → 이진수', output: '0100100001101001' },
  { name: 'text-binary: 이진수 → 텍스트', tool: 'text-binary', inputs: '01001000 01101001', action: '이진수 → 텍스트', output: 'Hi' },
  { name: 'text-binary: 8의 배수가 아니면 에러', tool: 'text-binary', inputs: '0101', action: '이진수 → 텍스트', error: '비트 수가 8의 배수가 아닙니다.' },

  // 진법 변환
  { name: 'base-convert: 10진수 입력', tool: 'base-convert', inputs: '255', kv: { '2진수': '11111111', '8진수': '377', '16진수': 'ff', '32진수': '7v' } },
  { name: 'base-convert: 16진수 입력', tool: 'base-convert', options: { '입력 진법': '16' }, inputs: 'ff', kv: { '10진수': '255' } },
  { name: 'base-convert: 음수', tool: 'base-convert', inputs: '-10', kv: { '2진수': '-1010' } },
  { name: 'base-convert: 잘못된 자릿수 문자는 에러', tool: 'base-convert', inputs: 'zz', htmlError: '10진수에 올 수 없는 문자: "z"' },

  // 로마 숫자
  { name: 'roman: 아라비아 → 로마', tool: 'roman', inputs: '123', output: 'CXXIII' },
  { name: 'roman: 로마 → 아라비아', tool: 'roman', inputs: 'MMXXVI', output: '2026' },
  { name: 'roman: 최댓값 3999', tool: 'roman', inputs: '3999', output: 'MMMCMXCIX' },
  { name: 'roman: 범위 밖은 에러', tool: 'roman', inputs: '4000', error: '1 ~ 3999 범위만 지원합니다.' },

  // JWT — jwt.io에 공개된 HS256 예제 벡터와 경계 조건
  {
    name: 'jwt: 디코딩과 HS256 서명 검증 성공', tool: 'jwt',
    inputs: [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      'your-256-bit-secret',
    ],
    htmlContains: ['John Doe', '서명 검증', '서명이 유효합니다', '클레임 검증', '클레임이 유효합니다', '시크릿이 약합니다'],
  },
  {
    name: 'jwt: 잘못된 키로 검증 실패', tool: 'jwt',
    inputs: [
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      'wrong-secret',
    ],
    htmlContains: ['서명이 올바르지 않습니다'],
  },
  { name: 'jwt: 형식 오류', tool: 'jwt', inputs: 'not-a-jwt', htmlError: 'JWT는 header.payload.signature 3개 부분이어야 합니다.' },
  {
    name: 'jwt: 만료된 exp 클레임', tool: 'jwt',
    inputs: [signHs256({ sub: 'expired', exp: 1 }), jwtTestSecret],
    htmlContains: ['서명이 유효합니다', '클레임 검증에 실패했습니다', '전에 만료되었습니다'],
  },
  {
    name: 'jwt: 미래 nbf와 iat 클레임', tool: 'jwt',
    inputs: [signHs256({ nbf: 4102444800, iat: 4102444800 }), jwtTestSecret],
    htmlContains: ['뒤부터 사용할 수 있습니다', '현재보다', '클레임 검증에 실패했습니다'],
  },
  {
    name: 'jwt: clock skew 범위 안의 만료 허용', tool: 'jwt',
    options: { 'clock skew(초)': '300' },
    inputs: [signHs256({ exp: jwtTestNow - 10 }), jwtTestSecret],
    htmlContains: ['클레임이 유효합니다'],
  },
  {
    name: 'jwt: iss/aud/sub 기대값과 audience 불일치', tool: 'jwt',
    options: { '예상 iss': 'issuer-a', '예상 aud(쉼표 구분)': 'api-b', '예상 sub': 'user-1' },
    inputs: [signHs256({ iss: 'issuer-a', aud: ['api-a'], sub: 'user-1' }), jwtTestSecret],
    htmlContains: ['iss: 기대값과 일치합니다', 'aud: 기대 audience가 없습니다 — api-b', 'sub: 기대값과 일치합니다', '클레임 검증에 실패했습니다'],
  },
  {
    name: 'jwt: alg=none 명시적 경고와 검증 거부', tool: 'jwt',
    inputs: [`${jwtPart({ alg: 'none', typ: 'JWT' })}.${jwtPart({ sub: 'unsigned' })}.`, 'any-key'],
    htmlContains: ['alg=none 토큰은 서명되지 않았으므로 신뢰할 수 없습니다', 'alg=none 서명은 검증하지 않습니다'],
  },
  {
    name: 'jwt: 예상 알고리즘 불일치 경고와 검증 거부', tool: 'jwt',
    options: { '예상 알고리즘': 'RS256' },
    inputs: [signHs256({ sub: 'algorithm-check' }), jwtTestSecret],
    htmlContains: ['알고리즘 불일치: 헤더는 HS256, 기대값은 RS256', '알고리즘 불일치로 서명 검증을 거부했습니다'],
  },
  {
    name: 'jwt: HS256 서명 생성 (표준 벡터)', tool: 'jwt', io: 1,
    inputs: ['{"sub":"1234567890","name":"John Doe","iat":1516239022}', 'your-256-bit-secret'],
    action: 'JWT 생성',
    output: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  },

  // Base58 — 비트코인 표준 벡터
  { name: 'base58: 인코딩', tool: 'base58', inputs: 'Hello World!', action: '인코딩', output: '2NEpo7TZRRrLZSi2U' },
  { name: 'base58: 디코딩', tool: 'base58', inputs: '2NEpo7TZRRrLZSi2U', action: '디코딩', output: 'Hello World!' },
  {
    name: 'base58: 앞쪽 0바이트는 알파벳 첫 글자로', tool: 'base58',
    options: { '입력 형식(인코딩)': 'hex' }, inputs: '0000287fb4cd', action: '인코딩', output: '11233QC4',
  },
  {
    name: 'base58: Base58Check로 비트코인 주소 해독', tool: 'base58',
    options: { 'Base58Check': true, '출력 형식(디코딩)': 'hex' },
    inputs: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', action: '디코딩',
    output: '0062e907b15cbf27d5425399ebf6f0fb50ebb88f18',
  },
  { name: 'base58: 알파벳에 없는 문자는 에러', tool: 'base58', inputs: '0OIl', action: '디코딩', error: 'Base58 알파벳에 없는 문자: "0"' },

  // Base85 — Ascii85 표준 벡터와 ZeroMQ Z85 벡터
  { name: 'base85: Ascii85 인코딩', tool: 'base85', inputs: 'Man ', action: '인코딩', output: '9jqo^' },
  { name: 'base85: Ascii85 부분 그룹 디코딩', tool: 'base85', inputs: 'F*2M7/c', action: '디코딩', output: 'sure.' },
  { name: 'base85: Adobe 구분자', tool: 'base85', options: { '형식': 'adobe' }, inputs: 'Man ', action: '인코딩', output: '<~9jqo^~>' },
  {
    name: 'base85: Z85 벡터', tool: 'base85',
    options: { '형식': 'z85', '입력 형식(인코딩)': 'hex' }, inputs: '864fd26fb559f75b', action: '인코딩', output: 'HelloWorld',
  },
  {
    name: 'base85: Z85는 4바이트 배수만', tool: 'base85', options: { '형식': 'z85' }, inputs: 'abc', action: '인코딩',
    error: 'Z85는 입력이 4바이트의 배수여야 합니다 (현재 3바이트).',
  },

  // Quoted-Printable
  { name: 'quoted-printable: 한글 인코딩', tool: 'quoted-printable', inputs: '안녕', action: '인코딩', output: '=EC=95=88=EB=85=95' },
  { name: 'quoted-printable: 디코딩', tool: 'quoted-printable', inputs: '=EC=95=88=EB=85=95', action: '디코딩', output: '안녕' },
  { name: 'quoted-printable: "="는 =3D로', tool: 'quoted-printable', inputs: 'a=b', action: '인코딩', output: 'a=3Db' },
  {
    name: 'quoted-printable: encoded-word 인코딩', tool: 'quoted-printable',
    options: { '형식': 'word' }, inputs: '한글', action: '인코딩', output: '=?UTF-8?Q?=ED=95=9C=EA=B8=80?=',
  },
  {
    name: 'quoted-printable: encoded-word B 디코딩', tool: 'quoted-printable',
    options: { '형식': 'word' }, inputs: '=?UTF-8?B?7ZWc6riA?=', action: '디코딩', output: '한글',
  },
  {
    name: 'quoted-printable: encoded-word가 없으면 에러', tool: 'quoted-printable',
    options: { '형식': 'word' }, inputs: 'plain text', action: '디코딩',
    error: '=?charset?B|Q?...?= 형식의 encoded-word를 찾을 수 없습니다.',
  },

  // Punycode / IDN
  {
    name: 'punycode: 한글 도메인 → ASCII', tool: 'punycode', inputs: '한글.한국',
    kv: { 'ASCII (Punycode)': 'xn--bj0bj06e.xn--3e0b707e', '유니코드': '한글.한국', '라벨 수': '2' },
  },
  {
    name: 'punycode: xn-- 디코딩', tool: 'punycode', inputs: 'xn--bj0bj06e.xn--3e0b707e',
    kv: { '유니코드': '한글.한국', 'ASCII (Punycode)': 'xn--bj0bj06e.xn--3e0b707e' },
  },
  {
    name: 'punycode: URL이면 호스트만 바꾼다', tool: 'punycode', inputs: 'https://한글.한국:8080/path?q=1',
    kv: { 'ASCII (Punycode)': 'https://xn--bj0bj06e.xn--3e0b707e:8080/path?q=1' },
  },
  {
    name: 'punycode: 독일어 라벨 (RFC 3492 방식)', tool: 'punycode', inputs: 'bücher.example',
    kv: { 'ASCII (Punycode)': 'xn--bcher-kva.example' },
  },

];

toolCases('encoding', cases);

const jwtPki = makeTestPki();
for (const [alg, privateKey, publicKey] of [
  ['PS256', jwtPki.rsaKey, jwtPki.rsaPublicKey],
  ['PS384', jwtPki.rsaKey, jwtPki.rsaPublicKey],
  ['PS512', jwtPki.rsaKey, jwtPki.rsaPublicKey],
  ['ES256', jwtPki.ecKey, jwtPki.ecPublicKey],
  ['ES384', jwtPki.ec384Key, jwtPki.ec384PublicKey],
  ['ES512', jwtPki.ec521Key, jwtPki.ec521PublicKey],
]) {
  test(`jwt: ${alg} 생성·검증 왕복`, async ({ page }) => {
    await openTool(page, 'jwt');
    const create = ioSection(page, 1);
    await setOption(create, '알고리즘', alg);
    await fillInputs(create, ['{"sub":"asymmetric-test"}', privateKey]);
    await clickAction(create, 'JWT 생성');
    await expect(create).toHaveAttribute('aria-busy', 'false');
    const token = await create.locator('textarea.out').inputValue();
    expect(token.split('.')).toHaveLength(3);

    const verify = ioSection(page, 0);
    await setOption(verify, '예상 알고리즘', alg);
    await fillInputs(verify, [token, publicKey]);
    await expect(verify.locator('.out-html').first()).toContainText('서명이 유효합니다');
  });
}
