// 암호화 / 복호화
import { tool, makeIO, h, kvTable, strToBytes, bytesToStr, bytesToHex, hexToBytes, bytesToB64, b64ToBytes, decodeInput, loadScript, LIB, copyBtn } from '../core.js';

const CAT = '암호화 / 복호화';

/* ---------- 대칭키 (CryptoJS) ---------- */
function symTool({ id, name, algo, keySizes, desc, keywords }) {
  tool({
    id, cat: CAT, name, desc, keywords,
    render(root) {
      makeIO(root, {
        inputs: [
          { id: 'text', label: '입력 (암호화: 평문 / 복호화: Base64 또는 Hex)', rows: 5, value: 'Secret message 비밀 메시지' },
          { id: 'key', label: '키 / 비밀번호', rows: 2, value: 'my-secret-password' },
        ],
        options: [
          keySizes ? { id: 'keySize', label: '키 크기', type: 'select', values: keySizes } : null,
          { id: 'mode', label: '모드', type: 'select', values: ['CBC', 'CFB', 'CTR', 'OFB', 'ECB'] },
          { id: 'kdf', label: '키 유도', type: 'select', values: [['passphrase', '비밀번호(OpenSSL)'], ['raw', '키 직접(Hex/UTF-8)']] },
          { id: 'ofmt', label: '암호문 형식', type: 'select', values: [['base64', 'Base64'], ['hex', 'Hex']] },
        ].filter(Boolean),
        actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }],
        autorun: false,
        process(v, o, action) {
          const cfg = { mode: CryptoJS.mode[o.mode], padding: o.mode === 'CTR' || o.mode === 'CFB' || o.mode === 'OFB' ? CryptoJS.pad.NoPadding : CryptoJS.pad.Pkcs7 };
          let keyParam;
          if (o.kdf === 'raw') {
            keyParam = /^[0-9a-f]+$/i.test(v.key.trim()) && v.key.trim().length % 2 === 0
              ? CryptoJS.enc.Hex.parse(v.key.trim())
              : CryptoJS.enc.Utf8.parse(v.key);
            if (o.mode !== 'ECB') {
              const ivLen = algo === 'DES' || algo === 'TripleDES' || algo === 'Blowfish' ? 8 : 16;
              cfg.iv = CryptoJS.lib.WordArray.create(new Uint8Array(ivLen)); // 0 IV (raw 모드)
            }
          } else {
            keyParam = v.key; // 비밀번호 → OpenSSL EVP_BytesToKey
          }
          if (action === 'dec') {
            const cipherText = o.ofmt === 'hex'
              ? CryptoJS.enc.Hex.parse(v.text.trim()).toString(CryptoJS.enc.Base64)
              : v.text.trim();
            const dec = CryptoJS[algo].decrypt(cipherText, keyParam, cfg);
            const str = dec.toString(CryptoJS.enc.Utf8);
            if (!str) throw new Error('복호화 실패 (키/모드/형식을 확인하세요).');
            return str;
          }
          const enc = CryptoJS[algo].encrypt(v.text, keyParam, cfg);
          return o.ofmt === 'hex' ? enc.ciphertext.toString() : enc.toString();
        },
        note: 'CBC/비밀번호 모드는 OpenSSL 호환(Salted__) 형식을 사용합니다. 키 직접 입력 시 IV는 0으로 고정됩니다.',
      });
    },
  });
}

symTool({ id: 'aes', name: 'AES 암호화/복호화', algo: 'AES', keySizes: [['auto', '자동'], ['128', '128'], ['192', '192'], ['256', '256']], desc: 'AES 대칭키 암호화. CBC/CTR 등 다양한 모드를 지원합니다.', keywords: 'aes rijndael symmetric encrypt' });
symTool({ id: 'des', name: 'DES 암호화/복호화', algo: 'DES', desc: 'DES 대칭키 암호화 (레거시, 보안 취약).', keywords: 'des symmetric' });
symTool({ id: 'tripledes', name: 'Triple DES 암호화/복호화', algo: 'TripleDES', desc: '3DES 대칭키 암호화.', keywords: '3des triple des' });
symTool({ id: 'blowfish', name: 'Blowfish 암호화/복호화', algo: 'Blowfish', desc: 'Blowfish 대칭키 암호화.', keywords: 'blowfish symmetric' });

/* ---------- XOR ---------- */
function xorBytes(data, key) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}
tool({
  id: 'xor', cat: CAT, name: 'XOR 암호화',
  desc: '반복 키 XOR 암호화/복호화를 수행합니다.',
  keywords: 'xor cipher',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '입력', rows: 5, value: 'Hello XOR' },
        { id: 'key', label: '키', rows: 2, value: 'KEY' },
      ],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['text', '텍스트'], ['hex', 'Hex'], ['base64', 'Base64']] },
        { id: 'kfmt', label: '키 형식', type: 'select', values: [['text', '텍스트'], ['hex', 'Hex']] },
        { id: 'ofmt', label: '출력 형식', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64'], ['text', '텍스트']] },
      ],
      process(v, o) {
        const data = decodeInput(v.text, o.ifmt);
        const key = o.kfmt === 'hex' ? hexToBytes(v.key) : strToBytes(v.key);
        if (!key.length) throw new Error('키를 입력하세요.');
        const res = xorBytes(data, key);
        return o.ofmt === 'hex' ? bytesToHex(res) : o.ofmt === 'base64' ? bytesToB64(res) : bytesToStr(res);
      },
    });
  },
});

tool({
  id: 'xor-brute', cat: CAT, name: 'XOR 브루트포스',
  desc: '단일 바이트 XOR로 암호화된 데이터를 모든 키(0~255)로 시도합니다.',
  keywords: 'xor brute force crack single byte',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '암호문 (Hex 또는 Base64)', rows: 4, placeholder: '48 65 6c 6c 6f ...' }],
      options: [
        { id: 'ifmt', label: '입력 형식', type: 'select', values: [['hex', 'Hex'], ['base64', 'Base64']] },
        { id: 'filter', label: '출력 필터', type: 'select', values: [['printable', '인쇄 가능 문자만'], ['all', '전체 표시']] },
      ],
      outputHTML: true,
      process(text, o) {
        if (!text.trim()) return '';
        const data = o.ifmt === 'hex' ? hexToBytes(text) : b64ToBytes(text);
        const results = [];
        for (let k = 0; k < 256; k++) {
          const dec = data.map((b) => b ^ k);
          const printable = dec.filter((b) => b >= 32 && b < 127).length / dec.length;
          if (o.filter === 'printable' && printable < 0.9) continue;
          const str = bytesToStr(new Uint8Array(dec));
          results.push([k, printable, str]);
        }
        results.sort((a, b) => b[1] - a[1]);
        return h('table', { class: 'grid' },
          h('tr', null, ['키 (10진/hex)', '인쇄가능%', '복호 결과'].map((x) => h('th', null, x))),
          results.slice(0, 60).map(([k, p, str]) => h('tr', null,
            h('td', null, `${k} / 0x${k.toString(16).padStart(2, '0')}`),
            h('td', null, (p * 100).toFixed(0) + '%'),
            h('td', { class: 'mono' }, str))));
      },
    });
  },
});

/* ---------- RSA / PGP (jsrsasign / openpgp) ---------- */
tool({
  id: 'rsa-keygen', cat: CAT, name: 'RSA 키페어 생성',
  desc: 'RSA 개인키/공개키 페어를 PEM 형식으로 생성합니다.',
  keywords: 'rsa key pair generate pem',
  render(root) {
    let priv = '', pub = '';
    const privTa = h('textarea', { class: 'mono', rows: 10, readonly: true });
    const pubTa = h('textarea', { class: 'mono', rows: 8, readonly: true });
    const sizeSel = h('select', null, [2048, 3072, 4096, 1024].map((s) => h('option', { value: s }, s + ' bit')));
    const status = h('span', { style: { marginLeft: '10px', color: 'var(--muted)' } });
    const btn = h('button', { class: 'btn primary', type: 'button' }, '키 생성');
    btn.addEventListener('click', async () => {
      status.textContent = '생성 중... (몇 초 소요될 수 있습니다)';
      btn.disabled = true;
      try {
        await loadScript(LIB.jsrsasign);
        await new Promise((r) => setTimeout(r, 30));
        const kp = KEYUTIL.generateKeypair('RSA', +sizeSel.value);
        priv = KEYUTIL.getPEM(kp.prvKeyObj, 'PKCS8PRV');
        pub = KEYUTIL.getPEM(kp.pubKeyObj);
        privTa.value = priv;
        pubTa.value = pub;
        status.textContent = '완료!';
      } catch (e) {
        status.textContent = '오류: ' + e.message;
      }
      btn.disabled = false;
    });
    root.append(
      h('div', { class: 'opt-row' }, h('span', { class: 'opt-item' }, h('label', null, '키 크기'), sizeSel), btn, status),
      h('div', { class: 'io', style: { marginTop: '12px' } },
        h('div', { class: 'out-head' }, h('label', { class: 'io-label' }, '개인키 (PKCS#8 PEM)'), copyBtn(() => privTa.value)), privTa,
        h('div', { class: 'out-head' }, h('label', { class: 'io-label' }, '공개키 (SPKI PEM)'), copyBtn(() => pubTa.value)), pubTa));
  },
});

tool({
  id: 'rsa-crypt', cat: CAT, name: 'RSA 암호화/복호화·서명/검증',
  desc: 'RSA 공개키로 암호화, 개인키로 복호화하거나 서명/검증합니다.',
  keywords: 'rsa encrypt decrypt sign verify',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '입력', rows: 4, value: 'RSA 테스트 메시지' },
        { id: 'key', label: '키 (PEM: 암호화·검증=공개키 / 복호화·서명=개인키)', rows: 8, placeholder: '-----BEGIN PUBLIC KEY-----' },
      ],
      options: [{ id: 'hash', label: '서명 해시', type: 'select', values: ['SHA256', 'SHA1', 'SHA384', 'SHA512'] }],
      actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }, { id: 'sign', label: '서명' }, { id: 'verify', label: '검증' }],
      autorun: false, outputRows: 6,
      async process(v, o, action) {
        await loadScript(LIB.jsrsasign);
        const key = v.key.trim();
        if (!key) throw new Error('PEM 키를 입력하세요.');
        if (action === 'enc') {
          const pub = KEYUTIL.getKey(key);
          return hextob64(KJUR.crypto.Cipher.encrypt(v.text, pub, 'RSA'));
        }
        if (action === 'dec') {
          const prv = KEYUTIL.getKey(key);
          return KJUR.crypto.Cipher.decrypt(b64tohex(v.text.trim()), prv, 'RSA');
        }
        if (action === 'sign') {
          const sig = new KJUR.crypto.Signature({ alg: o.hash + 'withRSA' });
          sig.init(key);
          sig.updateString(v.text);
          return hextob64(sig.sign());
        }
        if (action === 'verify') {
          // 입력: "메시지\n---SIGNATURE---\n<base64서명>" 또는 서명만 별도
          const parts = v.text.split(/\n-{3,}SIG(?:NATURE)?-{3,}\n/i);
          if (parts.length !== 2) throw new Error('검증하려면 입력을 "원문\\n---SIGNATURE---\\nBase64서명" 형식으로 넣으세요.');
          const sig = new KJUR.crypto.Signature({ alg: o.hash + 'withRSA' });
          sig.init(key);
          sig.updateString(parts[0]);
          return sig.verify(b64tohex(parts[1].trim())) ? '✔ 서명이 유효합니다.' : '✘ 서명이 올바르지 않습니다.';
        }
      },
      note: '검증 시 입력 형식: 원문 다음 줄에 "---SIGNATURE---", 그 다음 줄에 Base64 서명.',
    });
  },
});

/* ---------- PGP (OpenPGP.js) ---------- */
let openpgpLoaded = null;
async function pgp() {
  if (!openpgpLoaded) {
    openpgpLoaded = import('https://cdn.jsdelivr.net/npm/openpgp@5.11.1/dist/openpgp.min.mjs');
  }
  return openpgpLoaded;
}

tool({
  id: 'pgp-keygen', cat: CAT, name: 'PGP 키 생성',
  desc: '이름·이메일로 PGP 키페어를 생성합니다.',
  keywords: 'pgp gpg key generate',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '이름 <이메일>', rows: 1, value: '홍길동 <hong@example.com>' }],
      options: [
        { id: 'type', label: '알고리즘', type: 'select', values: [['ecc', 'ECC (Curve25519)'], ['rsa', 'RSA 4096']] },
        { id: 'pass', label: '패스프레이즈(선택)', type: 'password', size: 140 },
      ],
      actions: [{ id: 'gen', label: '키 생성' }],
      autorun: false, outputRows: 14,
      async process(text, o) {
        const m = text.match(/^(.*?)\s*<([^>]+)>/);
        const openpgp = await pgp();
        const { privateKey, publicKey } = await openpgp.generateKey({
          type: o.type === 'rsa' ? 'rsa' : 'ecc',
          curve: 'curve25519', rsaBits: 4096,
          userIDs: [{ name: (m ? m[1] : text).trim(), email: m ? m[2] : '' }],
          passphrase: o.pass || undefined,
        });
        return publicKey + '\n' + privateKey;
      },
    });
  },
});

tool({
  id: 'pgp-crypt', cat: CAT, name: 'PGP 암호화/복호화',
  desc: '공개키로 메시지를 암호화하거나 개인키로 복호화합니다.',
  keywords: 'pgp gpg encrypt decrypt',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'text', label: '메시지 / 암호문', rows: 6, value: '비밀 메시지' },
        { id: 'key', label: '키 (암호화=공개키 / 복호화=개인키)', rows: 8, placeholder: '-----BEGIN PGP PUBLIC KEY BLOCK-----' },
      ],
      options: [{ id: 'pass', label: '개인키 패스프레이즈', type: 'password', size: 140 }],
      actions: [{ id: 'enc', label: '암호화' }, { id: 'dec', label: '복호화' }],
      autorun: false, outputRows: 10,
      async process(v, o, action) {
        const openpgp = await pgp();
        if (action === 'enc') {
          const publicKey = await openpgp.readKey({ armoredKey: v.key });
          return openpgp.encrypt({ message: await openpgp.createMessage({ text: v.text }), encryptionKeys: publicKey });
        }
        let privateKey = await openpgp.readPrivateKey({ armoredKey: v.key });
        if (!privateKey.isDecrypted()) privateKey = await openpgp.decryptKey({ privateKey, passphrase: o.pass });
        const message = await openpgp.readMessage({ armoredMessage: v.text });
        const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
        return data;
      },
    });
  },
});

tool({
  id: 'token-gen', cat: CAT, name: '토큰 / 시크릿 생성기',
  desc: '암호학적으로 안전한 랜덤 토큰을 생성합니다.',
  keywords: 'token secret random password generate api key',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'len', label: '길이', type: 'number', value: 32, size: 80 },
        { id: 'charset', label: '문자 집합', type: 'select', values: [['alnum', '영문+숫자'], ['hex', 'Hex'], ['base64', 'Base64URL'], ['alpha', '영문만'], ['num', '숫자만'], ['ascii', '전체 ASCII 기호 포함'], ['custom', '커스텀']] },
        { id: 'custom', label: '커스텀 문자', type: 'text', size: 180, placeholder: 'ABCdef123!@#' },
        { id: 'count', label: '개수', type: 'number', value: 5, size: 70 },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      outputRows: 8,
      process(_, o) {
        const len = Math.max(1, Math.min(4096, +o.len));
        const sets = {
          alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
          alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
          num: '0123456789',
          hex: '0123456789abcdef',
          base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
          ascii: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?',
          custom: o.custom,
        };
        const chars = sets[o.charset];
        if (!chars) throw new Error('커스텀 문자를 입력하세요.');
        const out = [];
        for (let n = 0; n < Math.max(1, +o.count); n++) {
          const rnd = crypto.getRandomValues(new Uint32Array(len));
          let s = '';
          for (let i = 0; i < len; i++) s += chars[rnd[i] % chars.length];
          out.push(s);
        }
        return out.join('\n');
      },
    });
    io.run();
  },
});
