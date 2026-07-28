// 인코딩 / 디코딩 도구 정밀 테스트 — 대표 입력에 대한 기대 출력 검증.
import { test, expect, toolCases, openTool, ioSection, fillInputs, setOption, clickAction } from '../helpers.js';

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

  // JWT — jwt.io의 표준 HS256 예제 토큰 사용
  {
    name: 'jwt: 디코딩과 HS256 서명 검증 성공', tool: 'jwt',
    options: { '키(HS 시크릿 또는 RS 공개키 PEM)': 'your-256-bit-secret' },
    inputs: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    htmlContains: ['John Doe', '서명이 유효합니다'],
  },
  {
    name: 'jwt: 잘못된 키로 검증 실패', tool: 'jwt',
    options: { '키(HS 시크릿 또는 RS 공개키 PEM)': 'wrong-secret' },
    inputs: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    htmlContains: ['서명이 올바르지 않습니다'],
  },
  { name: 'jwt: 형식 오류', tool: 'jwt', inputs: 'not-a-jwt', htmlError: 'JWT는 header.payload.signature 3개 부분이어야 합니다.' },
  {
    name: 'jwt: HS256 서명 생성 (표준 벡터)', tool: 'jwt', io: 1,
    inputs: ['{"sub":"1234567890","name":"John Doe","iat":1516239022}', 'your-256-bit-secret'],
    action: 'JWT 생성',
    output: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  },
];

toolCases('encoding', cases);
