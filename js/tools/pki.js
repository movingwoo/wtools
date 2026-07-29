// 공개키 / 인증서
import { tool, makeIO, h, kvTable, strToBytes, bytesToHex, hexToBytes, bytesToStr, bytesToB64, b64ToBytes, concatBytes, loadScript, LIB } from '../core.js';

const CAT = '공개키 / 인증서';

/* KEYUTIL.getPEM은 isPublic인 키 객체만 공개키 PEM으로 내보내므로, 개인키 객체에는 쓸 수 없다.
   개인키가 함께 들고 있는 공개 부분(RSA n·e, EC 곡선·공개점)으로 직접 SPKI를 만든다. */
function publicKeyPem(key) {
  return hextopem(new KJUR.asn1.x509.SubjectPublicKeyInfo(key).tohex(), 'PUBLIC KEY').replace(/\r\n/g, '\n').trim();
}

tool({
  id: 'x509-parse', cat: CAT, name: 'X.509 인증서 파싱',
  desc: 'PEM 인증서를 파싱해 주체, 발급자, 유효기간, 확장 등을 표시합니다.',
  keywords: 'x509 certificate ssl tls pem parse',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'PEM 인증서', rows: 12, placeholder: '-----BEGIN CERTIFICATE-----' }],
      outputHTML: true,
      async process(text) {
        if (!text.trim()) return '';
        await loadScript(LIB.jsrsasign);
        const x = new X509();
        x.readCertPEM(text.trim());
        const notBefore = x.getNotBefore(), notAfter = x.getNotAfter();
        const fmt = (t) => {
          const m = t.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z?$/);
          return m ? `20${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]} UTC` : t;
        };
        const rows = [
          ['버전', 'v' + (x.getVersion())],
          ['시리얼 번호', x.getSerialNumberHex()],
          ['주체 (Subject)', x.getSubjectString()],
          ['발급자 (Issuer)', x.getIssuerString()],
          ['유효 시작', fmt(notBefore)],
          ['유효 만료', fmt(notAfter)],
          ['서명 알고리즘', x.getSignatureAlgorithmField()],
          ['공개키 알고리즘', x.getPublicKey().type || '알 수 없음'],
        ];
        try {
          const san = x.getExtSubjectAltName();
          if (san && san.array) rows.push(['주체 대체 이름 (SAN)', san.array.map((a) => Object.values(a).join(':')).join(', ')]);
        } catch { }
        try { rows.push(['키 사용 (Key Usage)', x.getExtKeyUsageString()]); } catch { }
        const box = h('div', null, kvTable(rows));
        // 만료 검사
        const now = new Date();
        const exp = fmt(notAfter);
        const expDate = new Date(exp.replace(' UTC', 'Z').replace(' ', 'T'));
        if (!isNaN(expDate)) {
          const days = Math.round((expDate - now) / 86400000);
          box.append(h('p', { style: { fontWeight: 700, color: days < 0 ? 'var(--danger)' : days < 30 ? '#d97706' : 'var(--ok)' } },
            days < 0 ? `⚠ 만료됨 (${-days}일 전)` : `유효 (만료까지 ${days}일)`));
        }
        return box;
      },
    });
  },
});

tool({
  id: 'asn1-parse', cat: CAT, name: 'ASN.1 Hex 파싱',
  desc: 'ASN.1 DER(Hex 문자열)를 계층 구조로 디코딩합니다.',
  keywords: 'asn1 der parse hex',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'ASN.1 DER (Hex)', rows: 8, placeholder: '3082... 또는 PEM' }],
      outputRows: 16,
      async process(text) {
        if (!text.trim()) return '';
        await loadScript(LIB.jsrsasign);
        let hex = text.trim();
        if (hex.includes('-----BEGIN')) hex = pemtohex(hex);
        else hex = hex.replace(/[\s:]/g, '');
        return ASN1HEX.dump(hex);
      },
    });
  },
});

tool({
  id: 'pem-hex', cat: CAT, name: 'PEM ↔ Hex 변환',
  desc: 'PEM(Base64) 블록과 DER Hex를 상호 변환합니다.',
  keywords: 'pem hex der base64 convert',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력 (PEM 또는 Hex)', rows: 10, placeholder: '-----BEGIN ...----- 또는 3082...' }],
      options: [{ id: 'label', label: 'PEM 헤더', type: 'text', size: 160, value: 'CERTIFICATE' }],
      actions: [{ id: 'toHex', label: 'PEM → Hex' }, { id: 'toPem', label: 'Hex → PEM' }],
      autorun: false, outputRows: 10,
      async process(text, o, action) {
        await loadScript(LIB.jsrsasign);
        if (action === 'toPem') {
          const hex = text.trim().replace(/[\s:]/g, '');
          return hextopem(hex, o.label);
        }
        return pemtohex(text.trim());
      },
    });
  },
});

/* ---------- JWK ↔ PEM ----------
   변환은 WebCrypto의 import/export로 하고, Ed25519(OKP)만 직접 처리한다.
   Ed25519 WebCrypto는 이 프로젝트의 브라우저 기준선보다 한참 최신에야 들어왔는데,
   키 DER은 길이가 고정이라 접두사를 붙였다 떼는 것으로 충분하다 (RFC 8410). */
const ED_SPKI_PREFIX = hexToBytes('302a300506032b6570032100');
const ED_PKCS8_PREFIX = hexToBytes('302e020100300506032b657004220420');

// core.js의 b64ToBytes는 -_ 를 +/ 로 바꿔 주므로 base64url을 그대로 넘겨도 된다.
const bytesToB64url = (bytes) => bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pemWrap = (label, bytes) =>
  `-----BEGIN ${label}-----\n${bytesToB64(bytes).replace(/.{64}/g, '$&\n').replace(/\n$/, '')}\n-----END ${label}-----`;

// PEM → 어떤 알고리즘인지 모르므로 후보를 차례로 시도한다. 첫 성공이 답이다.
const IMPORT_CANDIDATES = [
  { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  { name: 'RSA-PSS', hash: 'SHA-256' },
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  { name: 'ECDSA', namedCurve: 'P-256' },
  { name: 'ECDSA', namedCurve: 'P-384' },
  { name: 'ECDSA', namedCurve: 'P-521' },
];
const USAGES = {
  'RSASSA-PKCS1-v1_5': { spki: ['verify'], pkcs8: ['sign'] },
  'RSA-PSS': { spki: ['verify'], pkcs8: ['sign'] },
  'RSA-OAEP': { spki: ['encrypt'], pkcs8: ['decrypt'] },
  ECDSA: { spki: ['verify'], pkcs8: ['sign'] },
};

// RFC 7638: 필수 항목만 사전순으로 담은 JSON의 SHA-256을 base64url로 적은 값
async function jwkThumbprint(jwk) {
  const required = {
    RSA: ['e', 'kty', 'n'], EC: ['crv', 'kty', 'x', 'y'], OKP: ['crv', 'kty', 'x'], oct: ['k', 'kty'],
  }[jwk.kty];
  if (!required) throw new Error('지문을 계산할 수 없는 키 종류입니다: ' + jwk.kty);
  const canonical = JSON.stringify(Object.fromEntries(required.map((key) => {
    if (jwk[key] == null) throw new Error(`지문 계산에 필요한 "${key}" 항목이 없습니다.`);
    return [key, jwk[key]];
  })));
  return bytesToB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', strToBytes(canonical))));
}

function okpToPem(jwk) {
  if (jwk.crv !== 'Ed25519') throw new Error(`지원하지 않는 OKP 곡선입니다: ${jwk.crv} (Ed25519만 지원)`);
  if (jwk.d) {
    const seed = b64ToBytes(jwk.d);
    if (seed.length !== 32) throw new Error('Ed25519 개인키(d)는 32바이트여야 합니다.');
    return { label: 'PRIVATE KEY', pem: pemWrap('PRIVATE KEY', concatBytes(ED_PKCS8_PREFIX, seed)) };
  }
  const pub = b64ToBytes(jwk.x || '');
  if (pub.length !== 32) throw new Error('Ed25519 공개키(x)는 32바이트여야 합니다.');
  return { label: 'PUBLIC KEY', pem: pemWrap('PUBLIC KEY', concatBytes(ED_SPKI_PREFIX, pub)) };
}
function pemToOkp(der, isPrivate) {
  const prefix = isPrivate ? ED_PKCS8_PREFIX : ED_SPKI_PREFIX;
  if (der.length !== prefix.length + 32 || prefix.some((b, i) => der[i] !== b)) return null;
  const raw = der.slice(prefix.length);
  return isPrivate
    ? { kty: 'OKP', crv: 'Ed25519', d: bytesToB64url(raw), x: null }
    : { kty: 'OKP', crv: 'Ed25519', x: bytesToB64url(raw) };
}

tool({
  id: 'jwk-pem', cat: CAT, name: 'JWK ↔ PEM 변환',
  desc: 'JWK(JSON Web Key)와 PEM(SPKI/PKCS#8)을 서로 변환하고 RFC 7638 지문(kid)을 계산합니다.',
  keywords: 'jwk pem spki pkcs8 jwt jose kid thumbprint rfc7638 rsa ec ed25519 키 변환',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'JWK(JSON) 또는 PEM', rows: 12, placeholder: '{"kty":"EC","crv":"P-256",...} 또는 -----BEGIN PUBLIC KEY-----' }],
      actions: [{ id: 'toPem', label: 'JWK → PEM' }, { id: 'toJwk', label: 'PEM → JWK' }],
      autorun: false, outputHTML: true,
      async process(text, o, action) {
        const trimmed = text.trim();
        if (!trimmed) return '';

        if (action === 'toPem') {
          let jwk;
          try { jwk = JSON.parse(trimmed); } catch { throw new Error('JWK는 올바른 JSON이어야 합니다.'); }
          if (jwk.keys) throw new Error('JWK Set(keys 배열)이 아니라 키 하나를 입력하세요.');
          if (!jwk.kty) throw new Error('JWK에 "kty" 항목이 없습니다.');
          let label, pem;
          if (jwk.kty === 'OKP') ({ label, pem } = okpToPem(jwk));
          else {
            const isPrivate = jwk.d != null;
            const format = isPrivate ? 'pkcs8' : 'spki';
            label = isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY';
            const algorithm = jwk.kty === 'EC'
              ? { name: 'ECDSA', namedCurve: jwk.crv }
              : { name: jwk.alg === 'RSA-OAEP' ? 'RSA-OAEP' : jwk.alg?.startsWith('PS') ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5', hash: `SHA-${jwk.alg?.slice(2) || '256'}` };
            const key = await crypto.subtle.importKey('jwk', jwk, algorithm, true, USAGES[algorithm.name][format]);
            pem = pemWrap(label, new Uint8Array(await crypto.subtle.exportKey(format, key)));
          }
          return h('div', null,
            kvTable([['키 종류', `${jwk.kty}${jwk.crv ? ' / ' + jwk.crv : ''}`], ['PEM 종류', label], ['지문 (kid)', await jwkThumbprint(jwk)]]),
            h('h3', null, 'PEM'), h('pre', { class: 'out-html' }, pem));
        }

        const isPrivate = /-----BEGIN [\w ]*PRIVATE KEY-----/.test(trimmed);
        if (!isPrivate && !/-----BEGIN [\w ]*PUBLIC KEY-----/.test(trimmed))
          throw new Error('PUBLIC KEY 또는 PRIVATE KEY PEM 블록을 찾을 수 없습니다.');
        // WebCrypto는 PKCS#8과 SPKI만 읽는다. 예전 형식은 이유를 밝히고 변환 명령을 알려준다.
        const legacy = trimmed.match(/-----BEGIN (RSA|EC) (?:PUBLIC|PRIVATE) KEY-----/);
        if (legacy)
          throw new Error(`${legacy[1] === 'RSA' ? 'PKCS#1' : 'SEC1'} 형식은 지원하지 않습니다. `
            + `"openssl pkcs8 -topk8 -nocrypt -in key.pem -out pkcs8.pem"으로 PKCS#8로 바꿔 주세요.`);
        const format = isPrivate ? 'pkcs8' : 'spki';
        const der = b64ToBytes(trimmed.replace(/-----[^-]+-----/g, ''));

        const okp = pemToOkp(der, isPrivate);
        let jwk = null;
        if (okp) {
          jwk = okp;
          // PKCS#8에는 공개키가 없다. 시드에서 다시 계산해야 x를 채울 수 있다.
          if (isPrivate) {
            await loadScript(LIB.tweetnacl);
            jwk.x = bytesToB64url(nacl.sign.keyPair.fromSeed(b64ToBytes(jwk.d)).publicKey);
          }
        } else {
          const errors = [];
          for (const algorithm of IMPORT_CANDIDATES) {
            try {
              const key = await crypto.subtle.importKey(format, der, algorithm, true, USAGES[algorithm.name][format]);
              jwk = await crypto.subtle.exportKey('jwk', key);
              break;
            } catch (e) { errors.push(`${algorithm.name}${algorithm.namedCurve ? '/' + algorithm.namedCurve : ''}`); }
          }
          if (!jwk) throw new Error(`키를 해석하지 못했습니다. 시도한 알고리즘: ${errors.join(', ')}`);
        }
        // 알고리즘 후보를 돌려 맞춘 값이라 원본 키에 없던 용도 정보가 섞이면 오해를 부른다.
        delete jwk.key_ops;
        delete jwk.ext;
        jwk.kid = await jwkThumbprint(jwk);
        return h('div', null,
          kvTable([['키 종류', `${jwk.kty}${jwk.crv ? ' / ' + jwk.crv : ''}`], ['PEM 종류', isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY'], ['지문 (kid)', jwk.kid]]),
          h('h3', null, 'JWK'), h('pre', { class: 'out-html' }, JSON.stringify(jwk, null, 2)));
      },
      note: 'PEM에는 알고리즘 정보가 충분하지 않아 RSA와 EC(P-256/384/521), Ed25519를 차례로 시도합니다. "alg" 항목은 원본 JWK에 있을 때만 유지됩니다.',
    });
  },
});

tool({
  id: 'ssh-hostkey', cat: CAT, name: 'SSH 공개키 파싱',
  desc: 'SSH 공개키(authorized_keys 형식)의 타입, 비트, 지문(fingerprint)을 분석합니다.',
  keywords: 'ssh key fingerprint host rsa ed25519',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'SSH 공개키', rows: 4, placeholder: 'ssh-ed25519 AAAAC3Nza... user@host' }],
      outputHTML: true,
      process(text) {
        text = text.trim();
        if (!text) return '';
        const parts = text.split(/\s+/);
        const b64 = parts.find((p) => /^AAAA/.test(p));
        if (!b64) throw new Error('Base64 키 데이터를 찾을 수 없습니다.');
        const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        // SSH wire format: uint32 len + data 반복
        let off = 0;
        const readField = () => {
          const len = (raw[off] << 24) | (raw[off + 1] << 16) | (raw[off + 2] << 8) | raw[off + 3];
          off += 4;
          const d = raw.slice(off, off + len);
          off += len;
          return d;
        };
        const keyType = bytesToStr(readField());
        const fields = [];
        while (off < raw.length) fields.push(readField());
        let bits = '알 수 없음';
        if (keyType === 'ssh-rsa' && fields[1]) {
          let e = fields[1];
          while (e.length && e[0] === 0) e = e.slice(1);
          bits = (e.length * 8) + ' (모듈러스)';
        } else if (keyType === 'ssh-ed25519') bits = '256';
        else if (keyType.includes('ecdsa')) bits = keyType.match(/(\d+)/)?.[1] || '?';
        const md5 = CryptoJS.MD5(CryptoJS.lib.WordArray.create(raw)).toString().match(/.{2}/g).join(':');
        const sha256 = CryptoJS.SHA256(CryptoJS.lib.WordArray.create(raw)).toString(CryptoJS.enc.Base64).replace(/=+$/, '');
        return kvTable([
          ['키 타입', keyType],
          ['비트', bits],
          ['코멘트', parts.slice(2).join(' ') || '(없음)'],
          ['지문 (MD5)', 'MD5:' + md5],
          ['지문 (SHA256)', 'SHA256:' + sha256],
          ['데이터 크기', raw.length + ' bytes'],
        ]);
      },
    });
  },
});

tool({
  id: 'privkey-info', cat: CAT, name: 'RSA/EC 개인키 정보',
  desc: 'PEM 개인키에서 알고리즘, 키 크기, 공개키 등의 정보를 추출합니다.',
  keywords: 'private key rsa ec dsa info modulus',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'PEM 개인키', rows: 12, placeholder: '-----BEGIN PRIVATE KEY-----' }],
      options: [{ id: 'pass', label: '패스프레이즈(암호화된 키)', type: 'password', size: 160 }],
      outputHTML: true,
      async process(text, o) {
        if (!text.trim()) return '';
        await loadScript(LIB.jsrsasign);
        const key = o.pass ? KEYUTIL.getKey(text.trim(), o.pass) : KEYUTIL.getKey(text.trim());
        const rows = [['키 타입', key.type]];
        if (key.type === 'RSA') {
          const bits = key.n.bitLength();
          rows.push(['키 크기', bits + ' bit']);
          rows.push(['공개 지수 (e)', key.e]);
          rows.push(['모듈러스 (n)', key.n.toString(16).slice(0, 64) + '...']);
          rows.push(['공개키 PEM', publicKeyPem(key)]);
        } else if (key.type === 'EC') {
          rows.push(['곡선', key.curveName || '알 수 없음']);
          rows.push(['공개키 (hex)', (key.pubKeyHex || '').slice(0, 66) + '...']);
          rows.push(['공개키 PEM', publicKeyPem(key)]);
        }
        return kvTable(rows);
      },
    });
  },
});
