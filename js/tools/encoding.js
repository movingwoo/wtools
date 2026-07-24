// 인코딩 / 디코딩
import { tool, makeIO, h, kvTable, strToBytes, bytesToStr, bytesToB64, b64ToBytes, loadScript, LIB } from '../core.js';

const CAT = '인코딩 / 디코딩';
const STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Encode(bytes, alphabet = STD_B64, pad = '=') {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const rem = bytes.length - i;
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63];
    out += rem > 1 ? alphabet[(n >> 6) & 63] : pad;
    out += rem > 2 ? alphabet[n & 63] : pad;
  }
  return pad ? out : out.replace(new RegExp(`\\${pad}+$`), '');
}
function b64Decode(str, alphabet = STD_B64, pad = '=') {
  const map = {};
  [...alphabet].forEach((c, i) => (map[c] = i));
  const clean = [...str.replace(/\s/g, '')].filter((c) => c !== pad).join('');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    let n = 0;
    for (const c of chunk) {
      if (!(c in map)) throw new Error(`알파벳에 없는 문자: "${c}"`);
      n = (n << 6) | map[c];
    }
    n <<= 6 * (4 - chunk.length);
    if (chunk.length >= 2) bytes.push((n >> 16) & 255);
    if (chunk.length >= 3) bytes.push((n >> 8) & 255);
    if (chunk.length === 4) bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}

tool({
  id: 'base64', cat: CAT, name: 'Base64 인코딩/디코딩',
  desc: '텍스트를 Base64로 변환하거나 복원합니다. 커스텀 알파벳과 URL-safe를 지원합니다.',
  keywords: 'b64 encode decode',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'Hello, World!' }],
      options: [
        { id: 'alpha', label: '알파벳', type: 'select', values: [['std', '표준'], ['url', 'URL-safe (-_)'], ['custom', '커스텀']] },
        { id: 'custom', label: '커스텀 64자', type: 'text', size: 260, placeholder: STD_B64 },
        { id: 'pad', label: '패딩(=)', type: 'checkbox', value: true },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        let alpha = STD_B64;
        if (o.alpha === 'url') alpha = STD_B64.slice(0, 62) + '-_';
        if (o.alpha === 'custom') {
          alpha = o.custom;
          if (new Set(alpha).size !== 64) throw new Error('커스텀 알파벳은 서로 다른 64자여야 합니다.');
        }
        const pad = o.pad ? '=' : '';
        return action === 'dec'
          ? bytesToStr(b64Decode(text, alpha, '='))
          : b64Encode(strToBytes(text), alpha, pad);
      },
    });
  },
});

const STD_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const HEX_B32 = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

function b32Encode(bytes, alphabet = STD_B32, pad = '=') {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  if (pad) while (out.length % 8) out += pad;
  return out;
}
function b32Decode(str, alphabet = STD_B32, pad = '=') {
  const map = {};
  [...alphabet].forEach((c, i) => (map[c] = i));
  const clean = [...str.toUpperCase().replace(/\s/g, '')].filter((c) => c !== pad).join('');
  let bits = 0, value = 0;
  const bytes = [];
  for (const c of clean) {
    if (!(c in map)) throw new Error(`알파벳에 없는 문자: "${c}"`);
    value = (value << 5) | map[c];
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

tool({
  id: 'base32', cat: CAT, name: 'Base32 인코딩/디코딩',
  desc: '텍스트를 Base32(RFC 4648)로 변환하거나 복원합니다. 표준·Extended Hex·커스텀 알파벳을 지원합니다.',
  keywords: 'b32 encode decode otp secret rfc4648',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'Hello, World!' }],
      options: [
        { id: 'alpha', label: '알파벳', type: 'select', values: [['std', '표준'], ['hex', 'Extended Hex (0-9A-V)'], ['custom', '커스텀']] },
        { id: 'custom', label: '커스텀 32자', type: 'text', size: 260, placeholder: STD_B32 },
        { id: 'pad', label: '패딩(=)', type: 'checkbox', value: true },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        let alpha = STD_B32;
        if (o.alpha === 'hex') alpha = HEX_B32;
        if (o.alpha === 'custom') {
          alpha = o.custom.toUpperCase();
          if (new Set(alpha).size !== 32) throw new Error('커스텀 알파벳은 서로 다른 32자여야 합니다.');
        }
        const pad = o.pad ? '=' : '';
        return action === 'dec'
          ? bytesToStr(b32Decode(text, alpha, '='))
          : b32Encode(strToBytes(text), alpha, pad);
      },
    });
  },
});

tool({
  id: 'url-encode', cat: CAT, name: 'URL 인코딩/디코딩',
  desc: 'URL 퍼센트 인코딩(%XX)을 적용하거나 해제합니다.',
  keywords: 'percent encodeURIComponent urlencode urldecode query escape',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'https://example.com/?q=한글 검색' }],
      options: [{ id: 'mode', label: '방식', type: 'select', values: [['component', '전체 인코딩 (encodeURIComponent)'], ['uri', 'URL 구조 유지 (encodeURI)']] }],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        if (action === 'dec') return decodeURIComponent(text.replace(/\+/g, '%20'));
        return o.mode === 'uri' ? encodeURI(text) : encodeURIComponent(text);
      },
    });
  },
});

tool({
  id: 'url-parser', cat: CAT, name: 'URL 파서',
  desc: 'URL을 프로토콜, 호스트, 경로, 쿼리 파라미터 등으로 분해합니다.',
  keywords: 'uri url parse query string qs parameter params',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'URL', rows: 3, placeholder: 'https://user:pw@example.com:8080/path/page?a=1&b=한글#frag' }],
      outputHTML: true,
      process(text) {
        if (!text.trim()) return '';
        const u = new URL(text.trim());
        const rows = [
          ['프로토콜', u.protocol], ['호스트', u.host], ['호스트명', u.hostname],
          ['포트', u.port || '(기본값)'], ['경로', u.pathname], ['쿼리 문자열', u.search || '(없음)'],
          ['해시(fragment)', u.hash || '(없음)'], ['사용자', u.username || '(없음)'], ['비밀번호', u.password || '(없음)'],
          ['origin', u.origin],
        ];
        const params = [...u.searchParams.entries()];
        const box = h('div', null, kvTable(rows));
        if (params.length) {
          box.append(h('h3', null, '쿼리 파라미터'),
            h('table', { class: 'grid' },
              h('tr', null, h('th', null, '키'), h('th', null, '값')),
              params.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, v)))));
        }
        return box;
      },
    });
  },
});

const NAMED_ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ', '&copy;': '©', '&reg;': '®', '&trade;': '™', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–', '&laquo;': '«', '&raquo;': '»', '&times;': '×', '&divide;': '÷', '&deg;': '°', '&plusmn;': '±', '&euro;': '€', '&pound;': '£', '&yen;': '¥', '&cent;': '¢' };

tool({
  id: 'html-entities', cat: CAT, name: 'HTML 엔티티 인코딩/디코딩',
  desc: 'HTML 특수문자를 엔티티(&amp;lt; 등)로 변환하거나 복원합니다.',
  keywords: 'escape unescape',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: '<div class="a">한글 & English</div>' }],
      options: [{ id: 'all', label: '비ASCII 문자도 변환', type: 'checkbox' }],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        if (action === 'dec') {
          return text
            .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
            .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
            .replace(/&[a-z]+;/gi, (m) => NAMED_ENT[m.toLowerCase()] ?? m);
        }
        let out = text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        if (o.all) out = out.replace(/[\u{80}-\u{10ffff}]/gu, (c) => `&#x${c.codePointAt(0).toString(16).toUpperCase()};`);
        return out;
      },
    });
  },
});

tool({
  id: 'unicode-escape', cat: CAT, name: 'Unicode 이스케이프',
  desc: '텍스트를 \\uXXXX 등 유니코드 이스케이프로 변환하거나 복원합니다.',
  keywords: 'escape codepoint',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: '한글 텍스트 → \\uD55C\\uAE00' }],
      options: [
        { id: 'style', label: '형식', type: 'select', values: [['ju', '\\uXXXX'], ['es6', '\\u{X...}'], ['html', '&#xX;'], ['uplus', 'U+XXXX'], ['css', '\\XXXX (CSS)']] },
        { id: 'all', label: 'ASCII 포함 전부 변환', type: 'checkbox' },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        if (action === 'dec') {
          return text
            .replace(/\\u\{([0-9a-f]+)\}/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
            .replace(/\\u([0-9a-f]{4})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)))
            .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
            .replace(/U\+([0-9A-Fa-f]{4,6})/g, (_, x) => String.fromCodePoint(parseInt(x, 16)))
            .replace(/\\x([0-9a-f]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
        }
        const conv = (cp) => {
          const hex = cp.toString(16).toUpperCase();
          switch (o.style) {
            case 'es6': return `\\u{${hex}}`;
            case 'html': return `&#x${hex};`;
            case 'uplus': return `U+${hex.padStart(4, '0')}`;
            case 'css': return `\\${hex.padStart(4, '0')} `;
            default:
              if (cp > 0xffff) { // 서로게이트 쌍
                const s = String.fromCodePoint(cp);
                return `\\u${s.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\u${s.charCodeAt(1).toString(16).toUpperCase().padStart(4, '0')}`;
              }
              return `\\u${hex.padStart(4, '0')}`;
          }
        };
        let out = '';
        for (const ch of text) {
          const cp = ch.codePointAt(0);
          out += (o.all || cp > 0x7f) ? conv(cp) : ch;
        }
        return out;
      },
    });
  },
});

const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
  '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
  '$': '...-..-', '@': '.--.-.',
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

tool({
  id: 'morse', cat: CAT, name: '모스 부호 인코딩/디코딩',
  desc: '텍스트 ↔ 모스 부호를 변환합니다. 단어 구분은 / 를 사용합니다.',
  keywords: 'morse code',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'SOS 또는 ... --- ...' }],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        if (action === 'dec') {
          return text.trim().split(/\s*\/\s*|\s{2,}(?=[.-])/).map((word) =>
            word.trim().split(/\s+/).map((code) => MORSE_REV[code] ?? '?').join('')
          ).join(' ');
        }
        return text.toUpperCase().split(/\s+/).filter(Boolean).map((word) =>
          [...word].map((c) => {
            if (!(c in MORSE)) throw new Error(`모스 부호로 변환할 수 없는 문자: "${c}"`);
            return MORSE[c];
          }).join(' ')
        ).join(' / ');
      },
    });
  },
});

tool({
  id: 'text-binary', cat: CAT, name: '텍스트 ↔ 이진수 변환',
  desc: '텍스트를 바이트 단위 2진수(UTF-8)로 변환하거나 복원합니다.',
  keywords: 'binary ascii bits',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'Hi 또는 01001000 01101001' }],
      options: [{ id: 'sep', label: '구분자', type: 'select', values: [[' ', '공백'], ['', '없음'], ['\n', '줄바꿈']] }],
      actions: [{ id: 'enc', label: '텍스트 → 이진수' }, { id: 'dec', label: '이진수 → 텍스트' }],
      process(text, o, action) {
        if (action === 'dec') {
          const clean = text.replace(/[^01]/g, '');
          if (clean.length % 8) throw new Error('비트 수가 8의 배수가 아닙니다.');
          const bytes = new Uint8Array(clean.length / 8);
          for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 8, 8), 2);
          return bytesToStr(bytes);
        }
        return [...strToBytes(text)].map((b) => b.toString(2).padStart(8, '0')).join(o.sep);
      },
    });
  },
});

function parseBig(s, base) {
  s = s.trim().toLowerCase().replace(/[\s_,]/g, '');
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); }
  s = s.replace(/^0[xbo]/, '');
  if (!s) throw new Error('숫자를 입력하세요.');
  const B = BigInt(base);
  let acc = 0n;
  for (const c of s) {
    const d = parseInt(c, 36);
    if (isNaN(d) || d >= base) throw new Error(`${base}진수에 올 수 없는 문자: "${c}"`);
    acc = acc * B + BigInt(d);
  }
  return neg ? -acc : acc;
}
function toBase(n, base) {
  const neg = n < 0n;
  if (neg) n = -n;
  if (n === 0n) return '0';
  const B = BigInt(base);
  let out = '';
  while (n > 0n) { out = (n % B).toString(Number(base) <= 36 ? Number(base) : 36) + out; n /= B; }
  return (neg ? '-' : '') + out;
}

tool({
  id: 'base-convert', cat: CAT, name: '진법 변환',
  desc: '정수를 2진수, 8진수, 10진수, 16진수 등 임의 진법(2~36)으로 변환합니다.',
  keywords: 'radix binary octal hex decimal',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '숫자', rows: 2, placeholder: '255 / 0xFF / 1111_1111' }],
      options: [
        { id: 'from', label: '입력 진법', type: 'select', values: [['10', '10진수'], ['2', '2진수'], ['8', '8진수'], ['16', '16진수'], ...Array.from({ length: 35 }, (_, i) => [String(i + 2), i + 2 + '진수']).filter(([v]) => !['2', '8', '10', '16'].includes(v))], value: '10' },
        { id: 'to', label: '추가 출력 진법', type: 'number', value: 32, size: 70 },
      ],
      outputHTML: true,
      process(text, o) {
        if (!text.trim()) return '';
        const n = parseBig(text, +o.from);
        const rows = [['2진수', toBase(n, 2)], ['8진수', toBase(n, 8)], ['10진수', toBase(n, 10)], ['16진수', toBase(n, 16)]];
        const extra = +o.to;
        if (extra >= 2 && extra <= 36 && ![2, 8, 10, 16].includes(extra)) rows.push([extra + '진수', toBase(n, extra)]);
        return kvTable(rows);
      },
    });
  },
});

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
tool({
  id: 'roman', cat: CAT, name: '로마 숫자 변환',
  desc: '아라비아 숫자(1~3999) ↔ 로마 숫자를 변환합니다.',
  keywords: 'roman numeral',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 2, placeholder: '123 또는 CXXIII' }],
      process(text) {
        text = text.trim().toUpperCase();
        if (!text) return '';
        if (/^\d+$/.test(text)) {
          let n = +text;
          if (n < 1 || n > 3999) throw new Error('1 ~ 3999 범위만 지원합니다.');
          let out = '';
          for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
          return out;
        }
        if (!/^[IVXLCDM]+$/.test(text)) throw new Error('숫자 또는 로마 숫자(IVXLCDM)를 입력하세요.');
        const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let sum = 0;
        for (let i = 0; i < text.length; i++)
          sum += val[text[i]] < (val[text[i + 1]] ?? 0) ? -val[text[i]] : val[text[i]];
        return String(sum);
      },
    });
  },
});

/* ---------- JWT ---------- */
function b64url(str) { return bytesToB64(strToBytes(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(s) { return bytesToStr(b64ToBytes(s)); }
function wordArrayToB64url(wa) {
  return CryptoJS.enc.Base64.stringify(wa).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const HS = { HS256: 'HmacSHA256', HS384: 'HmacSHA384', HS512: 'HmacSHA512' };

tool({
  id: 'jwt', cat: CAT, name: 'JWT 인코딩/디코딩/검증',
  desc: 'JWT를 디코딩하고, HS256/384/512·RS256으로 서명을 생성하거나 검증합니다.',
  keywords: 'jwt json web token jsonwebtoken bearer sign verify claims',
  render(root) {
    // 디코딩 / 검증
    root.append(h('h3', null, '디코딩 / 검증'));
    makeIO(root, {
      inputs: [{ id: 'input', label: 'JWT 토큰', rows: 5, placeholder: 'eyJhbGciOi...' }],
      options: [{ id: 'key', label: '키(HS 시크릿 또는 RS 공개키 PEM)', type: 'text', size: 320, placeholder: '검증 시에만 입력' }],
      outputHTML: true,
      async process(text, o) {
        text = text.trim();
        if (!text) return '';
        const parts = text.split('.');
        if (parts.length !== 3) throw new Error('JWT는 header.payload.signature 3개 부분이어야 합니다.');
        const header = JSON.parse(b64urlDecode(parts[0]));
        const payload = JSON.parse(b64urlDecode(parts[1]));
        const box = h('div', null,
          h('h4', null, 'Header'), h('pre', { class: 'out-html' }, JSON.stringify(header, null, 2)),
          h('h4', null, 'Payload'), h('pre', { class: 'out-html' }, JSON.stringify(payload, null, 2)));
        const claims = [];
        for (const c of ['exp', 'iat', 'nbf'])
          if (payload[c]) claims.push([c, `${payload[c]} → ${new Date(payload[c] * 1000).toLocaleString('ko-KR')}${c === 'exp' && payload[c] * 1000 < Date.now() ? ' (만료됨!)' : ''}`]);
        if (claims.length) box.append(h('h4', null, '시간 클레임'), kvTable(claims));
        if (o.key.trim()) {
          let ok = false;
          const alg = header.alg;
          try {
            if (HS[alg]) {
              const sig = wordArrayToB64url(CryptoJS[HS[alg]](parts[0] + '.' + parts[1], o.key));
              ok = sig === parts[2];
            } else if (/^[RE]S\d+$/.test(alg)) {
              await loadScript(LIB.jsrsasign);
              ok = KJUR.jws.JWS.verify(text, o.key, [alg]);
            } else throw new Error('지원하지 않는 알고리즘: ' + alg);
            box.append(h('p', { style: { fontWeight: '700', color: ok ? 'var(--ok)' : 'var(--danger)' } },
              ok ? '✔ 서명이 유효합니다.' : '✘ 서명이 올바르지 않습니다.'));
          } catch (e) {
            box.append(h('p', { class: 'error' }, '검증 오류: ' + e.message));
          }
        }
        return box;
      },
    });

    // 생성
    root.append(h('h3', { style: { marginTop: '30px' } }, '생성 (서명)'));
    makeIO(root, {
      inputs: [
        { id: 'payload', label: 'Payload (JSON)', rows: 5, value: '{\n  "sub": "1234567890",\n  "name": "홍길동",\n  "iat": ' + Math.floor(Date.now() / 1000) + '\n}' },
        { id: 'key', label: '키 (HS 시크릿 또는 RS 개인키 PEM)', rows: 2, placeholder: 'your-256-bit-secret' },
      ],
      options: [{ id: 'alg', label: '알고리즘', type: 'select', values: ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'] }],
      actions: [{ id: 'sign', label: 'JWT 생성' }],
      autorun: false,
      async process(v, o) {
        const payload = JSON.stringify(JSON.parse(v.payload));
        const header = JSON.stringify({ alg: o.alg, typ: 'JWT' });
        if (HS[o.alg]) {
          const si = b64url(header) + '.' + b64url(payload);
          return si + '.' + wordArrayToB64url(CryptoJS[HS[o.alg]](si, v.key));
        }
        await loadScript(LIB.jsrsasign);
        return KJUR.jws.JWS.sign(o.alg, header, payload, v.key);
      },
    });
  },
});
