// 해싱
import { tool, makeIO, h, formLabel, kvTable, strToBytes, decodeInput, FMT_IN, loadScript, LIB } from '../core.js';

const CAT = '해싱';

/* ---------- SHA-0 (SHA-1에서 메시지 확장 회전이 빠진 원조 알고리즘) ---------- */
function sha0(bytes) {
  const ml = bytes.length;
  const withPad = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  withPad.set(bytes);
  withPad[ml] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, ml << 3, false);
  dv.setUint32(withPad.length - 8, Math.floor(ml / 0x20000000), false);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; // SHA-1과 달리 rotl 없음
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- MD2 (RFC 1319) — js-md2 라이브러리는 문자열만 받아 바이트 입력 시 오류가 나므로 직접 구현 ---------- */
const MD2_S = [
  41, 46, 67, 201, 162, 216, 124, 1, 61, 54, 84, 161, 236, 240, 6, 19, 98, 167, 5, 243, 192, 199, 115, 140,
  152, 147, 43, 217, 188, 76, 130, 202, 30, 155, 87, 60, 253, 212, 224, 22, 103, 66, 111, 24, 138, 23, 229, 18,
  190, 78, 196, 214, 218, 158, 222, 73, 160, 251, 245, 142, 187, 47, 238, 122, 169, 104, 121, 145, 21, 178, 7, 63,
  148, 194, 16, 137, 11, 34, 95, 33, 128, 127, 93, 154, 90, 144, 50, 39, 53, 62, 204, 231, 191, 247, 151, 3,
  255, 25, 48, 179, 72, 165, 181, 209, 215, 94, 146, 42, 172, 86, 170, 198, 79, 184, 56, 210, 150, 164, 125, 182,
  118, 252, 107, 226, 156, 116, 4, 241, 69, 157, 112, 89, 100, 113, 135, 32, 134, 91, 207, 101, 230, 45, 168, 2,
  27, 96, 37, 173, 174, 176, 185, 246, 28, 70, 97, 105, 52, 64, 126, 15, 85, 71, 163, 35, 221, 81, 175, 58,
  195, 92, 249, 206, 186, 197, 234, 38, 44, 83, 13, 110, 133, 40, 132, 9, 211, 223, 205, 244, 65, 129, 77, 82,
  106, 220, 55, 200, 108, 193, 171, 250, 36, 225, 123, 8, 12, 189, 177, 74, 120, 136, 149, 139, 227, 99, 232, 109,
  233, 203, 213, 254, 59, 0, 29, 57, 242, 239, 183, 14, 102, 88, 208, 228, 166, 119, 114, 248, 235, 117, 75, 10,
  49, 68, 80, 180, 143, 237, 31, 26, 219, 153, 141, 51, 159, 17, 131, 20,
];
function md2(bytes) {
  const pad = 16 - (bytes.length % 16);
  const msg = new Uint8Array(bytes.length + pad + 16);
  msg.set(bytes);
  msg.fill(pad, bytes.length, bytes.length + pad);
  // 체크섬 블록
  const ck = new Uint8Array(16);
  let l = 0;
  for (let i = 0; i < msg.length - 16; i += 16)
    for (let j = 0; j < 16; j++) l = ck[j] ^= MD2_S[msg[i + j] ^ l];
  msg.set(ck, msg.length - 16);
  // 다이제스트
  const x = new Uint8Array(48);
  for (let i = 0; i < msg.length; i += 16) {
    for (let j = 0; j < 16; j++) {
      x[16 + j] = msg[i + j];
      x[32 + j] = x[16 + j] ^ x[j];
    }
    let t = 0;
    for (let round = 0; round < 18; round++) {
      for (let k = 0; k < 48; k++) t = x[k] ^= MD2_S[t];
      t = (t + round) & 255;
    }
  }
  return [...x.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toWordArray(bytes) {
  return CryptoJS.lib.WordArray.create(bytes);
}

async function computeHash(alg, bytes) {
  switch (alg) {
    case 'MD2': return md2(bytes);
    case 'MD4': await loadScript(LIB.md4); return md4(bytes);
    case 'MD5': return CryptoJS.MD5(toWordArray(bytes)).toString();
    case 'SHA0': return sha0(bytes);
    case 'SHA1': return CryptoJS.SHA1(toWordArray(bytes)).toString();
    case 'SHA224': return CryptoJS.SHA224(toWordArray(bytes)).toString();
    case 'SHA256': return CryptoJS.SHA256(toWordArray(bytes)).toString();
    case 'SHA384': return CryptoJS.SHA384(toWordArray(bytes)).toString();
    case 'SHA512': return CryptoJS.SHA512(toWordArray(bytes)).toString();
    case 'SHA3-224': return CryptoJS.SHA3(toWordArray(bytes), { outputLength: 224 }).toString();
    case 'SHA3-256': return CryptoJS.SHA3(toWordArray(bytes), { outputLength: 256 }).toString();
    case 'SHA3-384': return CryptoJS.SHA3(toWordArray(bytes), { outputLength: 384 }).toString();
    case 'SHA3-512': return CryptoJS.SHA3(toWordArray(bytes), { outputLength: 512 }).toString();
    case 'RIPEMD160': return CryptoJS.RIPEMD160(toWordArray(bytes)).toString();
  }
}
const ALL_ALGS = ['MD2', 'MD4', 'MD5', 'SHA0', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512', 'SHA3-224', 'SHA3-256', 'SHA3-384', 'SHA3-512', 'RIPEMD160'];

tool({
  id: 'hash', cat: CAT, name: '해시 생성 (MD/SHA 전체)',
  desc: 'MD2/MD4/MD5, SHA-0/1/2/3, RIPEMD160 해시를 한 번에 계산합니다.',
  keywords: 'hash md5 sha1 sha256 sha512 sha3 digest checksum',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 6, value: 'Hello, World!' }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: FMT_IN },
        { id: 'upper', label: '대문자', type: 'checkbox' },
      ],
      outputHTML: true, runOnLoad: true,
      async process(text, o) {
        const bytes = decodeInput(text, o.ifmt);
        const rows = [];
        for (const alg of ALL_ALGS) {
          try {
            let v = await computeHash(alg, bytes);
            rows.push([alg, o.upper ? v.toUpperCase() : v]);
          } catch (e) {
            rows.push([alg, '(오류: ' + e.message + ')']);
          }
        }
        return kvTable(rows);
      },
    });
  },
});

tool({
  id: 'hmac', cat: CAT, name: 'HMAC 생성',
  desc: '비밀 키를 사용한 HMAC 메시지 인증 코드를 생성합니다.',
  keywords: 'hmac mac key',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'msg', label: '메시지', rows: 5, value: 'Hello, World!' },
        { id: 'key', label: '비밀 키', rows: 2, value: 'secret' },
      ],
      options: [
        { id: 'alg', label: '알고리즘', type: 'select', values: ['SHA256', 'SHA1', 'SHA224', 'SHA384', 'SHA512', 'SHA3-256', 'SHA3-512', 'MD5'], value: 'SHA256' },
        { id: 'ofmt', label: '출력', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64']] },
      ],
      runOnLoad: true,
      process(v, o) {
        const algMap = {
          SHA1: CryptoJS.HmacSHA1, SHA224: CryptoJS.HmacSHA224, SHA256: CryptoJS.HmacSHA256,
          SHA384: CryptoJS.HmacSHA384, SHA512: CryptoJS.HmacSHA512, MD5: CryptoJS.HmacMD5,
          'SHA3-256': (m, k) => CryptoJS.HmacSHA3(m, k, { outputLength: 256 }),
          'SHA3-512': (m, k) => CryptoJS.HmacSHA3(m, k, { outputLength: 512 }),
        };
        const wa = algMap[o.alg](v.msg, v.key);
        return o.ofmt === 'base64' ? CryptoJS.enc.Base64.stringify(wa) : wa.toString();
      },
    });
  },
});

tool({
  id: 'hash-analyze', cat: CAT, name: '해시 분석기',
  desc: '해시 문자열의 형태로 사용된 알고리즘을 추정합니다.',
  keywords: 'hash identify analyze',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '해시 값', rows: 3, placeholder: '5d41402abc4b2a76b9719d911017c592' }],
      outputHTML: true,
      process(text) {
        const s = text.trim();
        if (!s) return '';
        const guesses = [];
        // 접두사 기반
        if (/^\$2[abxy]?\$/.test(s)) guesses.push('bcrypt');
        else if (s.startsWith('$argon2')) guesses.push('Argon2');
        else if (s.startsWith('$1$')) guesses.push('md5crypt (Unix)');
        else if (s.startsWith('$5$')) guesses.push('sha256crypt (Unix)');
        else if (s.startsWith('$6$')) guesses.push('sha512crypt (Unix)');
        else if (s.startsWith('$pbkdf2')) guesses.push('PBKDF2');
        else if (s.startsWith('{SSHA}')) guesses.push('Salted SHA-1 (LDAP)');
        else if (/^[0-9a-f]+$/i.test(s)) {
          const map = {
            32: ['MD5', 'MD4', 'MD2', 'NTLM', 'LM(x2)'],
            40: ['SHA-1', 'SHA-0', 'RIPEMD-160'],
            56: ['SHA-224', 'SHA3-224'],
            64: ['SHA-256', 'SHA3-256', 'BLAKE2s', 'Keccak-256'],
            96: ['SHA-384', 'SHA3-384'],
            128: ['SHA-512', 'SHA3-512', 'BLAKE2b', 'Whirlpool'],
            8: ['CRC32', 'Adler-32'],
            16: ['CRC64', 'MySQL(old)'],
          };
          guesses.push(...(map[s.length] || []));
          if (!map[s.length]) guesses.push(`알 수 없음 (hex ${s.length}자 = ${s.length * 4}비트)`);
        } else if (/^[A-Za-z0-9+/]+=*$/.test(s)) {
          guesses.push(`Base64 인코딩된 값 (디코딩 시 ${Math.floor(s.replace(/=/g, '').length * 3 / 4)}바이트) — 해시 원문일 수 있음`);
        } else guesses.push('알려진 해시 형식과 일치하지 않습니다.');
        return h('div', null,
          kvTable([['길이', s.length + '자'], ['문자 집합', /^[0-9a-f]+$/i.test(s) ? 'Hex' : /^[A-Za-z0-9+/=]+$/.test(s) ? 'Base64' : '기타']]),
          h('h4', null, '추정 알고리즘 (가능성 순)'),
          h('ol', null, guesses.map((g) => h('li', null, g))));
      },
    });
  },
});

tool({
  id: 'checksum-file', cat: CAT, name: '파일 해시 (체크섬)',
  desc: '파일을 선택해 MD5, SHA-1, SHA-256, SHA-512 체크섬을 계산합니다.',
  keywords: 'file checksum verify download',
  render(root) {
    const out = h('div');
    const status = h('div', {
      class: 'io-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
    });
    const file = h('input', { type: 'file', multiple: true });
    const wrap = h('div', { class: 'io', 'aria-busy': 'false' },
      formLabel(file, '파일 선택 (여러 개 가능, 브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }),
      file, status, out);
    file.addEventListener('change', async () => {
      const list = [...file.files];
      if (!list.length) return;
      file.disabled = true;
      wrap.setAttribute('aria-busy', 'true');
      status.className = 'io-status active';
      status.textContent = '처리 중…';
      const frag = h('div');
      try {
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          status.textContent = list.length > 1 ? `처리 중… (${i + 1}/${list.length})` : '처리 중…';
          await new Promise((res) => setTimeout(res)); // 진행 표시가 그려지도록 양보
          const buf = new Uint8Array(await f.arrayBuffer());
          const wa = CryptoJS.lib.WordArray.create(buf);
          frag.append(h('div', { style: { marginBottom: '14px' } }, kvTable([
            ['파일', `${f.name} (${f.size.toLocaleString()} bytes)`],
            ['MD5', CryptoJS.MD5(wa).toString()],
            ['SHA-1', CryptoJS.SHA1(wa).toString()],
            ['SHA-256', CryptoJS.SHA256(wa).toString()],
            ['SHA-512', CryptoJS.SHA512(wa).toString()],
          ])));
        }
        out.innerHTML = '';
        out.append(frag);
        status.textContent = '처리가 완료되었습니다.';
      } catch (e) {
        out.innerHTML = '';
        out.append(h('span', { class: 'error' }, e?.message || String(e)));
        status.className = 'io-status active error';
        status.textContent = '처리 실패: ' + (e?.message || String(e));
      } finally {
        file.disabled = false;
        wrap.setAttribute('aria-busy', 'false');
      }
    });
    root.append(wrap);
  },
});

/* ---------- CRC / Adler 체크섬 (테이블 방식 범용 CRC 엔진) ---------- */
function reflectBits(v, width) {
  let r = 0;
  for (let i = 0; i < width; i++) { r = (r << 1) | (v & 1); v >>>= 1; }
  return r >>> 0;
}
function makeCRC({ width, poly, init, ref, xor }) {
  const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
  const table = new Uint32Array(256);
  if (ref) {
    const rp = reflectBits(poly, width);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ rp : c >>> 1;
      table[i] = c;
    }
    return (bytes) => {
      let c = reflectBits(init, width);
      for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ table[(c ^ bytes[i]) & 0xff];
      return ((c ^ xor) & mask) >>> 0;
    };
  }
  const top = width - 8;
  for (let i = 0; i < 256; i++) {
    let c = i << top;
    for (let k = 0; k < 8; k++) c = c & (1 << (width - 1)) ? (c << 1) ^ poly : c << 1;
    table[i] = c & mask;
  }
  return (bytes) => {
    let c = init;
    for (let i = 0; i < bytes.length; i++) c = ((c << 8) ^ table[((c >>> top) ^ bytes[i]) & 0xff]) & mask;
    return ((c ^ xor) & mask) >>> 0;
  };
}
function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
// [이름, 계산 함수, hex 자릿수]
const CHECKSUMS = [
  ['CRC-32', makeCRC({ width: 32, poly: 0x04c11db7, init: 0xffffffff, ref: true, xor: 0xffffffff }), 8],
  ['CRC-32C (Castagnoli)', makeCRC({ width: 32, poly: 0x1edc6f41, init: 0xffffffff, ref: true, xor: 0xffffffff }), 8],
  ['CRC-16/CCITT-FALSE', makeCRC({ width: 16, poly: 0x1021, init: 0xffff, ref: false, xor: 0 }), 4],
  ['CRC-16/XMODEM', makeCRC({ width: 16, poly: 0x1021, init: 0, ref: false, xor: 0 }), 4],
  ['CRC-16/ARC (IBM)', makeCRC({ width: 16, poly: 0x8005, init: 0, ref: true, xor: 0 }), 4],
  ['CRC-16/MODBUS', makeCRC({ width: 16, poly: 0x8005, init: 0xffff, ref: true, xor: 0 }), 4],
  ['CRC-8', makeCRC({ width: 8, poly: 0x07, init: 0, ref: false, xor: 0 }), 2],
  ['Adler-32', adler32, 8],
];

tool({
  id: 'checksum-crc', cat: CAT, name: '체크섬 계산기 (CRC / Adler)',
  desc: 'CRC-8/16/32, CRC-32C, Adler-32 체크섬을 텍스트 또는 파일로 계산합니다.',
  keywords: 'crc crc32 crc16 crc8 adler checksum modbus xmodem ccitt castagnoli',
  render(root) {
    const table = (bytes) => kvTable(CHECKSUMS.map(([name, fn, w]) => {
      const v = fn(bytes);
      return [name, '0x' + v.toString(16).toUpperCase().padStart(w, '0') + ` (${v})`];
    }));
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 5, value: '123456789' }],
      options: [{ id: 'ifmt', label: '입력 형식', type: 'select', values: FMT_IN }],
      outputHTML: true, runOnLoad: true,
      note: '기본값 "123456789"는 CRC 알고리즘 검증용 표준 입력(check value)입니다.',
      process(text, o) { return table(decodeInput(text, o.ifmt)); },
    });
    // 파일 체크섬
    const fileOut = h('div');
    const file = h('input', { type: 'file' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      fileOut.innerHTML = '계산 중...';
      const bytes = new Uint8Array(await f.arrayBuffer());
      fileOut.innerHTML = '';
      fileOut.append(h('p', { class: 'note' }, `${f.name} (${f.size.toLocaleString()} bytes)`), table(bytes));
    });
    root.append(h('div', { class: 'io' }, formLabel(file, '또는 파일 선택 (브라우저 밖으로 전송되지 않습니다)', { class: 'io-label' }), file, fileOut));
  },
});
