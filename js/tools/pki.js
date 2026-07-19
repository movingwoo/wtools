// 공개키 / 인증서
import { tool, makeIO, h, kvTable, bytesToHex, hexToBytes, bytesToStr, loadScript, LIB } from '../core.js';

const CAT = '공개키 / 인증서';

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
          rows.push(['공개키 PEM', KEYUTIL.getPEM(key)]);
        } else if (key.type === 'EC') {
          rows.push(['곡선', key.curveName || '알 수 없음']);
          rows.push(['공개키 (hex)', (key.pubKeyHex || '').slice(0, 66) + '...']);
          rows.push(['공개키 PEM', KEYUTIL.getPEM(key)]);
        }
        return kvTable(rows);
      },
    });
  },
});
