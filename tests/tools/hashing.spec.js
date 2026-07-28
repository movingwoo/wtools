// 해싱 도구 정밀 테스트 — NIST/RFC 표준 테스트 벡터 사용.
// MD4는 CDN 라이브러리를 로드하므로 외부 스크립트 지연 로드 경로도 함께 검증된다.
import { toolCase } from '../helpers.js';

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
];

for (const c of cases) toolCase(c);
