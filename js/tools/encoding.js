// 인코딩 / 디코딩
import { tool, makeIO, h, kvTable, strToBytes, bytesToStr, bytesToHex, hexToBytes, bytesToB64, b64ToBytes, decodeInput, encodeOutput, FMT_IN, loadScript, LIB } from '../core.js';

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
  transfer: {
    inputs: [{ id: 'input', label: '입력', accepts: ['text', 'base64'] }],
    outputs: [
      { id: 'base64', label: 'Base64 결과', type: 'base64' },
      { id: 'decoded-json', label: '디코딩한 JSON', type: 'json', targets: ['json-format', 'data-convert'] },
      { id: 'decoded-text', label: '디코딩한 텍스트', type: 'text' },
    ],
  },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'Hello, World!' }],
      options: [
        { id: 'alpha', label: '알파벳', type: 'select', values: [['std', '표준'], ['url', 'URL-safe (-_)'], ['custom', '커스텀']] },
        { id: 'custom', label: '커스텀 64자', type: 'text', size: 260, placeholder: STD_B64 },
        { id: 'pad', label: '패딩(=)', type: 'checkbox', value: true },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      transferOutput: {
        id: ({ result, actionId }) => {
          if (actionId === 'enc') return 'base64';
          try { JSON.parse(result); return 'decoded-json'; }
          catch { return 'decoded-text'; }
        },
        when: ({ result }) => !!String(result).trim(),
      },
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

/* ---------- Base58 ----------
   Base64/Base32와 달리 비트를 그대로 잘라 쓸 수 없다(58이 2의 거듭제곱이 아니다).
   전체를 하나의 큰 정수로 보고 58로 나누므로 BigInt를 쓰고, 앞쪽 0바이트는
   정수로 만들면 사라지기 때문에 알파벳의 0번 문자로 따로 채워 넣는다. */
const B58_ALPHA = {
  btc: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
  ripple: 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz',
  flickr: '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ',
};

function b58Encode(bytes, alphabet) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return alphabet[0].repeat(zeros) + out;
}
function b58Decode(str, alphabet) {
  const clean = str.trim();
  if (!clean) return new Uint8Array();
  let n = 0n;
  for (const c of clean) {
    const d = alphabet.indexOf(c);
    if (d < 0) throw new Error(`Base58 알파벳에 없는 문자: "${c}"`);
    n = n * 58n + BigInt(d);
  }
  const digits = [];
  while (n > 0n) { digits.unshift(Number(n & 255n)); n >>= 8n; }
  let zeros = 0;
  while (zeros < clean.length && clean[zeros] === alphabet[0]) zeros++;
  return new Uint8Array([...new Array(zeros).fill(0), ...digits]);
}
// Base58Check 체크섬: SHA-256을 두 번 건 값의 앞 4바이트
function sha256d(bytes) {
  const once = CryptoJS.SHA256(CryptoJS.lib.WordArray.create(bytes));
  return hexToBytes(CryptoJS.SHA256(once).toString());
}

tool({
  id: 'base58', cat: CAT, name: 'Base58 인코딩/디코딩',
  desc: 'Base58(비트코인/리플/플리커 알파벳)로 변환하거나 복원합니다. Base58Check 체크섬을 지원합니다.',
  keywords: 'base58 b58 bitcoin btc address wif ripple flickr ipfs check checksum',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'Hello, World!' }],
      options: [
        { id: 'alpha', label: '알파벳', type: 'select', values: [['btc', '비트코인(기본)'], ['ripple', '리플'], ['flickr', '플리커']] },
        { id: 'ifmt', label: '입력 형식(인코딩)', type: 'select', values: FMT_IN },
        { id: 'ofmt', label: '출력 형식(디코딩)', type: 'select', values: [['text', '텍스트'], ['hex', 'Hex'], ['base64', 'Base64']] },
        { id: 'check', label: 'Base58Check', type: 'checkbox' },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        const alphabet = B58_ALPHA[o.alpha];
        if (action === 'dec') {
          let bytes = b58Decode(text, alphabet);
          if (o.check) {
            if (bytes.length < 5) throw new Error('Base58Check 데이터가 체크섬(4바이트)보다 짧습니다.');
            const payload = bytes.slice(0, -4), expected = sha256d(payload).slice(0, 4);
            const actual = bytes.slice(-4);
            if (expected.some((b, i) => b !== actual[i]))
              throw new Error(`체크섬이 일치하지 않습니다 (기대 ${bytesToHex(expected)}, 실제 ${bytesToHex(actual)}).`);
            bytes = payload;
          }
          return encodeOutput(bytes, o.ofmt);
        }
        const bytes = decodeInput(text, o.ifmt);
        if (!o.check) return b58Encode(bytes, alphabet);
        const withSum = new Uint8Array(bytes.length + 4);
        withSum.set(bytes);
        withSum.set(sha256d(bytes).slice(0, 4), bytes.length);
        return b58Encode(withSum, alphabet);
      },
      note: 'Base58Check는 페이로드 뒤에 SHA-256을 두 번 건 값의 앞 4바이트를 붙입니다. 비트코인 주소·WIF 키가 이 형식입니다.',
    });
  },
});

/* ---------- Base85 ---------- */
// Ascii85는 '!'(0x21)부터 85자를 순서대로 쓴다. Z85는 URL·소스코드에 넣기 좋은 별도 배열을 쓴다.
const A85_ALPHA = Array.from({ length: 85 }, (_, i) => String.fromCharCode(33 + i)).join('');
const Z85_ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';

function b85Encode(bytes, alphabet, zeroShortcut) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const rem = Math.min(4, bytes.length - i);
    let n = 0;
    for (let j = 0; j < 4; j++) n = n * 256 + (bytes[i + j] ?? 0);
    if (zeroShortcut && n === 0 && rem === 4) { out += 'z'; continue; }
    const group = [];
    for (let j = 0; j < 5; j++) { group.unshift(alphabet[n % 85]); n = Math.floor(n / 85); }
    out += group.slice(0, rem + 1).join('');
  }
  return out;
}
function b85Decode(str, alphabet, zeroShortcut) {
  const clean = str.replace(/\s/g, '').replace(/^<~/, '').replace(/~>$/, '');
  const bytes = [];
  let group = [];
  const flush = () => {
    const rem = group.length;
    if (rem === 1) throw new Error('Base85 그룹이 1글자만 남아 복원할 수 없습니다.');
    let n = 0;
    for (let j = 0; j < 5; j++) n = n * 85 + (j < rem ? group[j] : 84);
    for (let j = 3; j >= 0; j--) { if (3 - j < rem - 1) bytes.push(Math.floor(n / 256 ** j) % 256); }
    group = [];
  };
  for (const c of clean) {
    if (zeroShortcut && c === 'z' && group.length === 0) { bytes.push(0, 0, 0, 0); continue; }
    const d = alphabet.indexOf(c);
    if (d < 0) throw new Error(`Base85 알파벳에 없는 문자: "${c}"`);
    group.push(d);
    if (group.length === 5) flush();
  }
  if (group.length) flush();
  return new Uint8Array(bytes);
}

tool({
  id: 'base85', cat: CAT, name: 'Base85 인코딩/디코딩',
  desc: 'Ascii85(btoa), Adobe(<~ ~>), Z85 형식으로 변환하거나 복원합니다.',
  keywords: 'base85 b85 ascii85 a85 adobe z85 zeromq btoa git binary patch',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'Hello, World!' }],
      options: [
        { id: 'variant', label: '형식', type: 'select', values: [['ascii85', 'Ascii85 (btoa)'], ['adobe', 'Adobe (<~ ~>)'], ['z85', 'Z85 (ZeroMQ)']] },
        { id: 'ifmt', label: '입력 형식(인코딩)', type: 'select', values: FMT_IN },
        { id: 'ofmt', label: '출력 형식(디코딩)', type: 'select', values: [['text', '텍스트'], ['hex', 'Hex'], ['base64', 'Base64']] },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      process(text, o, action) {
        const z85 = o.variant === 'z85';
        const alphabet = z85 ? Z85_ALPHA : A85_ALPHA;
        // Z85는 4바이트 단위 입력만 정의되어 있고 'z' 축약도 쓰지 않는다.
        if (action === 'dec') return encodeOutput(b85Decode(text, alphabet, !z85), o.ofmt);
        const bytes = decodeInput(text, o.ifmt);
        if (z85 && bytes.length % 4) throw new Error(`Z85는 입력이 4바이트의 배수여야 합니다 (현재 ${bytes.length}바이트).`);
        const body = b85Encode(bytes, alphabet, !z85);
        return o.variant === 'adobe' ? `<~${body}~>` : body;
      },
    });
  },
});

tool({
  id: 'url-encode', cat: CAT, name: 'URL 인코딩/디코딩',
  desc: 'URL 퍼센트 인코딩(%XX)을 적용하거나 해제합니다.',
  keywords: 'percent encodeURIComponent urlencode urldecode query escape',
  transfer: {
    inputs: [{ id: 'input', label: '입력', accepts: ['url', 'text'] }],
    outputs: [{ id: 'url', label: 'URL 결과', type: 'url' }],
  },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', placeholder: 'https://example.com/?q=한글 검색' }],
      options: [{ id: 'mode', label: '방식', type: 'select', values: [['component', '전체 인코딩 (encodeURIComponent)'], ['uri', 'URL 구조 유지 (encodeURI)']] }],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      transferOutput: {
        id: 'url',
        when: ({ result }) => { new URL(String(result)); return true; },
      },
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
  transfer: {
    inputs: [{ id: 'input', label: 'URL', accepts: ['url'] }],
    outputs: [{ id: 'url', label: '원본 URL', type: 'url' }],
  },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'URL', rows: 3, placeholder: 'https://user:pw@example.com:8080/path/page?a=1&b=한글#frag' }],
      outputHTML: true,
      transferOutput: { id: 'url', value: ({ input }) => input },
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

/* ---------- Punycode / IDN (RFC 3492) ----------
   유니코드 도메인을 ASCII로 옮기는 가변 길이 정수 인코딩이다. 기본(ASCII) 문자를 먼저
   적고, 나머지 코드포인트를 "얼마나 건너뛰었는지"의 델타 값으로만 이어 붙인다. */
const PUNY = { base: 36, tmin: 1, tmax: 26, skew: 38, damp: 700, initialBias: 72, initialN: 128, delimiter: '-' };

function punyAdapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / PUNY.damp) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((PUNY.base - PUNY.tmin) * PUNY.tmax) >> 1) {
    delta = Math.floor(delta / (PUNY.base - PUNY.tmin));
    k += PUNY.base;
  }
  return k + Math.floor(((PUNY.base - PUNY.tmin + 1) * delta) / (delta + PUNY.skew));
}
const punyDigitToChar = (d) => String.fromCharCode(d < 26 ? d + 97 : d + 22); // 0~25 → a~z, 26~35 → 0~9
function punyCharToDigit(c) {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 22;
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97;
  throw new Error(`Punycode에 올 수 없는 문자: "${c}"`);
}
function punyThreshold(k, bias) {
  return k <= bias ? PUNY.tmin : k >= bias + PUNY.tmax ? PUNY.tmax : k - bias;
}

function punyEncode(label) {
  const cps = [...label].map((c) => c.codePointAt(0));
  const basic = cps.filter((cp) => cp < 0x80);
  let out = String.fromCodePoint(...basic);
  const basicLength = basic.length;
  let handled = basicLength;
  if (basicLength) out += PUNY.delimiter;
  let n = PUNY.initialN, delta = 0, bias = PUNY.initialBias;
  while (handled < cps.length) {
    let m = Infinity;
    for (const cp of cps) if (cp >= n && cp < m) m = cp;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const cp of cps) {
      if (cp < n) delta++;
      else if (cp === n) {
        let q = delta;
        for (let k = PUNY.base; ; k += PUNY.base) {
          const t = punyThreshold(k, bias);
          if (q < t) break;
          out += punyDigitToChar(t + ((q - t) % (PUNY.base - t)));
          q = Math.floor((q - t) / (PUNY.base - t));
        }
        out += punyDigitToChar(q);
        bias = punyAdapt(delta, handled + 1, handled === basicLength);
        delta = 0;
        handled++;
      }
    }
    delta++;
    n++;
  }
  return out;
}

function punyDecode(encoded) {
  const output = [];
  let n = PUNY.initialN, i = 0, bias = PUNY.initialBias;
  const lastDelim = encoded.lastIndexOf(PUNY.delimiter);
  let pos = 0;
  if (lastDelim > 0) {
    for (const c of encoded.slice(0, lastDelim)) {
      if (c.charCodeAt(0) >= 0x80) throw new Error('Punycode의 기본 문자열에 ASCII가 아닌 문자가 있습니다.');
      output.push(c.charCodeAt(0));
    }
    pos = lastDelim + 1;
  }
  while (pos < encoded.length) {
    const oldi = i;
    let w = 1;
    for (let k = PUNY.base; ; k += PUNY.base) {
      if (pos >= encoded.length) throw new Error('Punycode 문자열이 중간에 끊겼습니다.');
      const digit = punyCharToDigit(encoded[pos++]);
      i += digit * w;
      const t = punyThreshold(k, bias);
      if (digit < t) break;
      w *= PUNY.base - t;
    }
    bias = punyAdapt(i - oldi, output.length + 1, oldi === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff) throw new Error('복원한 코드포인트가 유니코드 범위를 벗어납니다.');
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

// IDN에서 마침표로 인정하는 문자들(전각 마침표, 한중일 마침표 등)까지 라벨 구분자로 본다.
const IDN_DOT = /[.。．｡]/;
const toUnicodeLabel = (label) => (/^xn--/i.test(label) ? punyDecode(label.slice(4).toLowerCase()) : label);

function idnAsciiLabel(label) {
  const normalized = label.normalize('NFC');
  if (/^[\x00-\x20\x7f/:@\[\]\\]+$/.test(normalized) || /[\x00-\x20\x7f/:@\[\]\\]/.test(normalized))
    throw new Error(`IDN에 사용할 수 없는 문자가 있습니다: ${label}`);
  if (normalized.startsWith('-') || normalized.endsWith('-'))
    throw new Error(`도메인 라벨은 하이픈으로 시작하거나 끝날 수 없습니다: ${label}`);
  if (normalized.includes('_')) throw new Error(`IDNA2008 도메인 라벨에는 밑줄을 사용할 수 없습니다: ${label}`);
  if (/^[\x00-\x7f]+$/.test(normalized) && normalized.length > 63)
    throw new Error(`ASCII 라벨이 63자를 넘습니다: ${label}`);
  let ascii;
  try { ascii = new URL(`http://${normalized}.example/`).hostname.slice(0, -'.example'.length); }
  catch { throw new Error(`UTS #46 / IDNA 규칙에 맞지 않는 도메인 라벨입니다: ${label}`); }
  if (!ascii || /[^a-z0-9-]/i.test(ascii))
    throw new Error(`UTS #46 / IDNA 규칙에 맞지 않는 도메인 라벨입니다: ${label}`);
  if (ascii.length > 63) throw new Error(`ASCII 라벨이 63자를 넘습니다: ${ascii}`);
  return ascii.toLowerCase();
}

function idnScripts(label) {
  const scripts = [
    ['라틴', /\p{Script=Latin}/u], ['키릴', /\p{Script=Cyrillic}/u], ['그리스', /\p{Script=Greek}/u],
    ['한글', /\p{Script=Hangul}/u], ['한자', /\p{Script=Han}/u], ['히라가나', /\p{Script=Hiragana}/u],
    ['가타카나', /\p{Script=Katakana}/u], ['아랍', /\p{Script=Arabic}/u], ['데바나가리', /\p{Script=Devanagari}/u],
  ].filter(([, pattern]) => pattern.test(label)).map(([name]) => name);
  const cjk = new Set(['한자', '히라가나', '가타카나']);
  return scripts.length > 1 && !scripts.every((script) => cjk.has(script)) ? scripts : [];
}

tool({
  id: 'punycode', cat: CAT, name: 'Punycode / IDN 변환',
  desc: '한글·유니코드 도메인과 ASCII(xn--) 표기를 상호 변환합니다.',
  keywords: 'punycode idn idna xn-- 국제화 도메인 한글도메인 한국 domain unicode rfc3492',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '도메인 또는 URL', rows: 2, value: '한글.한국' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        const trimmed = text.trim();
        if (!trimmed) return '';
        // URL이면 호스트만 바꾸고 나머지 구조는 그대로 둔다.
        const urlMatch = trimmed.match(/^([a-z][\w+.-]*:\/\/)?([^/?#]+)(.*)$/i);
        const [, scheme = '', authority, rest = ''] = urlMatch;
        const hostMatch = authority.match(/^(?:([^@]*)@)?([^:]+)(:\d+)?$/);
        if (!hostMatch) throw new Error('도메인을 해석할 수 없습니다.');
        const [, userinfo, host, port = ''] = hostMatch;
        const labels = host.split(IDN_DOT).map((label) => label.normalize('NFC'));
        if (labels.some((label) => !label) && labels.length > 1)
          throw new Error('도메인 라벨이 비어 있습니다(마침표가 연속되었는지 확인하세요).');

        const unicode = labels.map(toUnicodeLabel).map((label) => label.normalize('NFC'));
        const ascii = unicode.map(idnAsciiLabel);
        if (ascii.join('.').length > 253) throw new Error('ASCII 도메인 전체 길이는 253자 이하여야 합니다.');
        // xn-- 입력도 같은 유니코드 라벨로 왕복되는지 확인해 비정규 Punycode를 거부한다.
        labels.forEach((label, index) => {
          if (/^xn--/i.test(label) && idnAsciiLabel(unicode[index]) !== label.toLowerCase())
            throw new Error(`정규 IDNA 표기로 왕복되지 않는 Punycode 라벨입니다: ${label}`);
        });
        const rebuild = (parts) => (scheme ? scheme : '') + (userinfo ? userinfo + '@' : '') + parts.join('.') + port + rest;
        const box = h('div', null, kvTable([
          ['ASCII (Punycode)', rebuild(ascii)],
          ['유니코드', rebuild(unicode)],
          ['라벨 수', labels.length],
        ]));
        box.append(h('h3', null, '라벨별 변환'),
          h('table', { class: 'grid' },
            h('tr', null, ['유니코드', 'ASCII', '길이'].map((x) => h('th', null, x))),
            labels.map((label, idx) => h('tr', null,
              h('td', null, unicode[idx]),
              h('td', { class: 'mono' }, ascii[idx]),
              h('td', null, ascii[idx].length + ' / 63')))));
        const mixed = unicode.flatMap((label) => {
          const scripts = idnScripts(label);
          return scripts.length ? [`${label} (${scripts.join(' + ')})`] : [];
        });
        if (mixed.length) box.append(h('p', { class: 'idn-warning', role: 'alert' },
          `혼합 스크립트 라벨은 피싱에 악용될 수 있으므로 철자를 다시 확인하세요: ${mixed.join(', ')}`));
        return box;
      },
      note: '브라우저 URL 표준의 UTS #46 매핑과 IDNA 길이·금지 문자·NFC 정규화를 적용합니다. 혼합 스크립트는 변환하되 피싱 위험을 경고합니다.',
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

/* ---------- Quoted-Printable ---------- */
function qpEncode(bytes, lineLimit) {
  let out = '', lineLen = 0;
  const push = (piece) => {
    // 소프트 줄바꿈('=')까지 합쳐 한 줄이 제한을 넘지 않게 자른다.
    if (lineLimit && lineLen + piece.length > lineLimit - 1) { out += '=\r\n'; lineLen = 0; }
    out += piece;
    lineLen += piece.length;
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0d && bytes[i + 1] === 0x0a) { out += '\r\n'; lineLen = 0; i++; continue; }
    if (b === 0x0a) { out += '\r\n'; lineLen = 0; continue; }
    // 줄 끝의 공백·탭은 전송 중 잘려나갈 수 있어 반드시 =XX로 적는다.
    const atLineEnd = i === bytes.length - 1 || bytes[i + 1] === 0x0a || (bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a);
    if ((b === 32 || b === 9) && !atLineEnd) push(String.fromCharCode(b));
    else if (b >= 33 && b <= 126 && b !== 61) push(String.fromCharCode(b));
    else push('=' + b.toString(16).toUpperCase().padStart(2, '0'));
  }
  return out;
}
function qpDecode(text) {
  const bytes = [];
  const src = text.replace(/=\r?\n/g, ''); // 소프트 줄바꿈 제거
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=') {
      const hex = src.substr(i + 1, 2);
      if (!/^[0-9a-f]{2}$/i.test(hex)) throw new Error(`"=" 뒤에 16진수 2자리가 없습니다: "=${hex}"`);
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      for (const b of strToBytes(src[i])) bytes.push(b);
    }
  }
  return new Uint8Array(bytes);
}
// RFC 2047 encoded-word: 메일 헤더에 비ASCII를 넣는 =?UTF-8?Q?...?= 형식
function encodedWordEncode(text) {
  const body = [...strToBytes(text)].map((b) => {
    if (b === 32) return '_';
    if ((b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122)) return String.fromCharCode(b);
    return '=' + b.toString(16).toUpperCase().padStart(2, '0');
  }).join('');
  return `=?UTF-8?Q?${body}?=`;
}
function encodedWordDecode(text) {
  const pattern = /=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g;
  if (!pattern.test(text)) throw new Error('=?charset?B|Q?...?= 형식의 encoded-word를 찾을 수 없습니다.');
  pattern.lastIndex = 0;
  // 인접한 encoded-word 사이의 공백은 규격상 무시한다.
  return text.replace(/\?=\s+=\?/g, '?==?').replace(pattern, (_, charset, kind, body) => {
    const bytes = kind.toUpperCase() === 'B' ? b64ToBytes(body) : qpDecode(body.replace(/_/g, ' '));
    let decoder;
    try { decoder = new TextDecoder(charset, { fatal: false }); }
    catch { throw new Error(`지원하지 않는 문자셋입니다: ${charset}`); }
    return decoder.decode(bytes);
  });
}

tool({
  id: 'quoted-printable', cat: CAT, name: 'Quoted-Printable 인코딩/디코딩',
  desc: '메일 본문의 Quoted-Printable(=XX)과 헤더의 encoded-word(=?UTF-8?Q?...?=)를 변환합니다.',
  keywords: 'quoted printable qp mime email rfc2045 rfc2047 encoded word header 메일',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 6, placeholder: '한글 메일 제목' }],
      options: [
        { id: 'mode', label: '형식', type: 'select', values: [['body', '본문 (RFC 2045)'], ['word', '헤더 encoded-word (RFC 2047)']] },
        { id: 'wrap', label: '76자 줄바꿈', type: 'checkbox', value: true },
      ],
      actions: [{ id: 'enc', label: '인코딩' }, { id: 'dec', label: '디코딩' }],
      outputRows: 10,
      process(text, o, action) {
        if (o.mode === 'word')
          return action === 'dec' ? encodedWordDecode(text.trim()) : encodedWordEncode(text);
        if (action === 'dec') return bytesToStr(qpDecode(text));
        return qpEncode(strToBytes(text), o.wrap ? 76 : 0);
      },
      note: '인코딩 결과의 줄바꿈은 메일 규격대로 CRLF입니다. encoded-word는 공백을 "_"로 적습니다.',
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
const JWT_ALGS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'];
const HS_MIN_BYTES = { HS256: 32, HS384: 48, HS512: 64 };

function jwtStatus(ok, success, failure) {
  return h('p', {
    class: 'jwt-status ' + (ok ? 'ok' : 'bad'),
  }, ok ? '✔ ' + success : '✘ ' + failure);
}

function jwtSecretBytes(value) {
  return strToBytes(value).length;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function expectedAudience(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function validateJwtClaims(payload, options, now = Date.now() / 1000) {
  const skew = Number(options.skew);
  if (!Number.isFinite(skew) || skew < 0) throw new Error('clock skew는 0 이상의 초 단위 숫자여야 합니다.');
  const checks = [];
  const numericDate = (name) => {
    if (!(name in payload)) return null;
    if (typeof payload[name] !== 'number' || !Number.isFinite(payload[name])) {
      checks.push({ ok: false, text: `${name}: NumericDate 숫자가 아닙니다.` });
      return null;
    }
    return payload[name];
  };
  const exp = numericDate('exp');
  const nbf = numericDate('nbf');
  const iat = numericDate('iat');
  if (exp != null) checks.push({
    ok: now <= exp + skew,
    text: now <= exp + skew ? 'exp: 만료되지 않았습니다.' : `exp: ${Math.ceil(now - exp)}초 전에 만료되었습니다.`,
  });
  if (nbf != null) checks.push({
    ok: now + skew >= nbf,
    text: now + skew >= nbf ? 'nbf: 사용할 수 있는 시각입니다.' : `nbf: ${Math.ceil(nbf - now)}초 뒤부터 사용할 수 있습니다.`,
  });
  if (iat != null) checks.push({
    ok: iat <= now + skew,
    text: iat <= now + skew ? 'iat: 미래 시각이 아닙니다.' : `iat: 현재보다 ${Math.ceil(iat - now)}초 뒤입니다.`,
  });
  for (const [name, expected] of [['iss', options.iss.trim()], ['sub', options.sub.trim()]]) {
    if (!expected) continue;
    checks.push({
      ok: payload[name] === expected,
      text: payload[name] === expected
        ? `${name}: 기대값과 일치합니다.`
        : `${name}: 기대값 “${expected}”과(와) 일치하지 않습니다.`,
    });
  }
  const audiences = expectedAudience(options.aud);
  if (audiences.length) {
    const actual = Array.isArray(payload.aud) ? payload.aud : payload.aud == null ? [] : [payload.aud];
    const missing = audiences.filter((aud) => !actual.includes(aud));
    checks.push({
      ok: !missing.length,
      text: missing.length ? `aud: 기대 audience가 없습니다 — ${missing.join(', ')}` : 'aud: 기대 audience를 모두 포함합니다.',
    });
  }
  return checks;
}

tool({
  id: 'jwt', cat: CAT, name: 'JWT 인코딩/디코딩/검증',
  desc: 'JWT의 서명과 클레임을 분리해 검증하고 HS/RS/PS/ES 알고리즘으로 생성합니다.',
  keywords: 'jwt json web token jsonwebtoken bearer sign verify claims',
  transfer: {
    inputs: [{ id: 'input', label: 'JWT 토큰', accepts: ['jwt'] }],
    outputs: [{ id: 'payload-json', label: 'Payload JSON', type: 'json', targets: ['json-format', 'data-convert', 'json-schema'] }],
  },
  render(root) {
    // 디코딩 / 검증
    root.append(h('h3', null, '디코딩 / 검증'));
    makeIO(root, {
      inputs: [
        { id: 'input', label: 'JWT 토큰', rows: 5, placeholder: 'eyJhbGciOi...' },
        { id: 'key', label: '검증 키 (HS 시크릿 또는 RSA/EC 공개키 PEM, 선택)', rows: 3 },
      ],
      options: [
        { id: 'expectedAlg', label: '예상 알고리즘', type: 'select', values: [['auto', '헤더 값 사용'], ...JWT_ALGS.map((alg) => [alg, alg])] },
        { id: 'skew', label: 'clock skew(초)', type: 'number', value: 0, size: 90 },
        { id: 'iss', label: '예상 iss', type: 'text', size: 140 },
        { id: 'aud', label: '예상 aud(쉼표 구분)', type: 'text', size: 170 },
        { id: 'sub', label: '예상 sub', type: 'text', size: 140 },
      ],
      outputHTML: true,
      transferOutput: {
        id: 'payload-json',
        when: ({ result }) => !!result?.querySelector?.('[data-transfer-payload]'),
        value: ({ result }) => result.querySelector('[data-transfer-payload]')?.textContent || '',
      },
      async process(v, o) {
        const text = v.input.trim();
        if (!text) return '';
        const parts = text.split('.');
        if (parts.length !== 3) throw new Error('JWT는 header.payload.signature 3개 부분이어야 합니다.');
        const header = JSON.parse(b64urlDecode(parts[0]));
        const payload = JSON.parse(b64urlDecode(parts[1]));
        if (!header || typeof header !== 'object' || Array.isArray(header))
          throw new Error('JWT header는 JSON 객체여야 합니다.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
          throw new Error('JWT payload는 JSON 객체여야 합니다.');
        const box = h('div', null,
          h('h4', null, 'Header'), h('pre', { class: 'out-html' }, JSON.stringify(header, null, 2)),
          h('h4', null, 'Payload'), h('pre', { class: 'out-html', 'data-transfer-payload': true }, JSON.stringify(payload, null, 2)));
        const warnings = [];
        const alg = header.alg;
        const expectedAlg = o.expectedAlg === 'auto' ? null : o.expectedAlg;
        if (alg === 'none') warnings.push('alg=none 토큰은 서명되지 않았으므로 신뢰할 수 없습니다.');
        if (!JWT_ALGS.includes(alg) && alg !== 'none') warnings.push(`지원하지 않거나 허용되지 않은 알고리즘입니다: ${alg}`);
        if (expectedAlg && alg !== expectedAlg)
          warnings.push(`알고리즘 불일치: 헤더는 ${alg || '(없음)'}, 기대값은 ${expectedAlg}입니다.`);
        if (HS[alg] && v.key && jwtSecretBytes(v.key) < HS_MIN_BYTES[alg])
          warnings.push(`${alg} 시크릿이 약합니다. 최소 ${HS_MIN_BYTES[alg]}바이트를 권장합니다 (현재 ${jwtSecretBytes(v.key)}바이트).`);
        if (warnings.length) box.prepend(h('div', { class: 'note jwt-warning', role: 'alert' },
          h('strong', null, '보안 경고'), h('ul', null, warnings.map((warning) => h('li', null, warning)))));
        const claims = [];
        for (const c of ['exp', 'iat', 'nbf'])
          if (typeof payload[c] === 'number') claims.push([c, `${payload[c]} → ${new Date(payload[c] * 1000).toLocaleString('ko-KR')}`]);
        if (claims.length) box.append(h('h4', null, '시간 클레임'), kvTable(claims));
        box.append(h('h4', null, '서명 검증'));
        if (!v.key.trim()) box.append(h('p', { class: 'jwt-status neutral' }, '검증 키를 입력하지 않아 서명을 검증하지 않았습니다.'));
        else if (alg === 'none') box.append(jwtStatus(false, '', 'alg=none 서명은 검증하지 않습니다.'));
        else if (expectedAlg && alg !== expectedAlg) box.append(jwtStatus(false, '', '알고리즘 불일치로 서명 검증을 거부했습니다.'));
        else if (!JWT_ALGS.includes(alg)) box.append(jwtStatus(false, '', `지원하지 않는 알고리즘입니다: ${alg}`));
        else {
          try {
            let ok;
            if (HS[alg]) {
              const sig = wordArrayToB64url(CryptoJS[HS[alg]](parts[0] + '.' + parts[1], v.key));
              ok = safeEqual(sig, parts[2]);
            } else {
              await loadScript(LIB.jsrsasign);
              ok = KJUR.jws.JWS.verify(text, v.key, [alg]);
            }
            box.append(jwtStatus(ok, '서명이 유효합니다.', '서명이 올바르지 않습니다.'));
          } catch (e) {
            box.append(h('p', { class: 'error' }, '서명 검증 오류: ' + e.message));
          }
        }
        const claimChecks = validateJwtClaims(payload, o);
        const claimsOk = claimChecks.every((check) => check.ok);
        box.append(h('h4', null, '클레임 검증'));
        if (!claimChecks.length) box.append(h('p', { class: 'jwt-status neutral' }, '검증할 시간 또는 기대 클레임이 없습니다.'));
        else box.append(
          jwtStatus(claimsOk, '클레임이 유효합니다.', '클레임 검증에 실패했습니다.'),
          h('ul', { class: 'jwt-claim-list' }, claimChecks.map((check) =>
            h('li', { class: check.ok ? 'ok' : 'bad' }, (check.ok ? '✔ ' : '✘ ') + check.text))),
        );
        return box;
      },
    });

    // 생성
    root.append(h('h3', { style: { marginTop: '30px' } }, '생성 (서명)'));
    const weakSecretWarning = h('div', { class: 'note jwt-warning hidden', role: 'status' });
    const createIO = makeIO(root, {
      inputs: [
        { id: 'payload', label: 'Payload (JSON)', rows: 5, value: '{\n  "sub": "1234567890",\n  "name": "홍길동",\n  "iat": ' + Math.floor(Date.now() / 1000) + '\n}' },
        { id: 'key', label: '키 (HS 시크릿 또는 RS 개인키 PEM)', rows: 2, placeholder: 'your-256-bit-secret' },
      ],
      options: [{ id: 'alg', label: '알고리즘', type: 'select', values: JWT_ALGS }],
      actions: [{ id: 'sign', label: 'JWT 생성' }],
      autorun: false,
      async process(v, o) {
        const payload = JSON.stringify(JSON.parse(v.payload));
        const header = JSON.stringify({ alg: o.alg, typ: 'JWT' });
        if (HS[o.alg]) {
          if (!v.key) throw new Error('HMAC 시크릿을 입력하세요.');
          const si = b64url(header) + '.' + b64url(payload);
          return si + '.' + wordArrayToB64url(CryptoJS[HS[o.alg]](si, v.key));
        }
        if (!v.key.trim()) throw new Error('RSA 또는 EC 개인키 PEM을 입력하세요.');
        await loadScript(LIB.jsrsasign);
        return KJUR.jws.JWS.sign(o.alg, header, payload, v.key);
      },
    });
    const updateWeakSecret = () => {
      const alg = createIO.optEls.alg.value;
      const bytes = jwtSecretBytes(createIO.inputEls.key.value);
      const weak = HS[alg] && bytes > 0 && bytes < HS_MIN_BYTES[alg];
      weakSecretWarning.classList.toggle('hidden', !weak);
      weakSecretWarning.textContent = weak
        ? `보안 경고: ${alg} 시크릿은 최소 ${HS_MIN_BYTES[alg]}바이트를 권장합니다 (현재 ${bytes}바이트).`
        : '';
    };
    createIO.inputEls.key.addEventListener('input', updateWeakSecret);
    createIO.optEls.alg.addEventListener('change', updateWeakSecret);
    root.append(weakSecretWarning);
  },
});
