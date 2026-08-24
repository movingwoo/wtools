// 공개키 / 인증서
import { tool, makeIO, h, kvTable, strToBytes, bytesToHex, hexToBytes, bytesToStr, bytesToB64, b64ToBytes, concatBytes, loadScript, LIB, requireFeature, download } from '../core.js';

const CAT = '공개키 / 인증서';

/* KEYUTIL.getPEM은 isPublic인 키 객체만 공개키 PEM으로 내보내므로, 개인키 객체에는 쓸 수 없다.
   개인키가 함께 들고 있는 공개 부분(RSA n·e, EC 곡선·공개점)으로 직접 SPKI를 만든다. */
function publicKeyPem(key) {
  return hextopem(new KJUR.asn1.x509.SubjectPublicKeyInfo(key).tohex(), 'PUBLIC KEY').replace(/\r\n/g, '\n').trim();
}

function parseCertificateTime(value) {
  const match = value.match(/^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/);
  if (!match) return null;
  let year = Number(match[1]);
  if (match[1].length === 2) year += year >= 50 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]),
    match[7] ? Math.round(Number(`0.${match[7]}`) * 1000) : 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCertificateTime(value) {
  const date = parseCertificateTime(value);
  return date ? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC') : value;
}

function keyDetails(key) {
  if (key.type === 'RSA') return { algorithm: 'RSA', detail: `${key.n.bitLength()} bit` };
  if (key.type === 'EC') return { algorithm: 'EC', detail: key.curveName || '알 수 없는 곡선' };
  return { algorithm: key.type || '알 수 없음', detail: '-' };
}

async function publicKeyFingerprint(spkiHex) {
  requireFeature('webcrypto', globalThis.crypto?.subtle);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', hexToBytes(spkiHex)));
  return bytesToHex(digest).match(/.{2}/g).join(':');
}

function csrSanArray(param) {
  return param.extreq?.find((ext) => ext.extname === 'subjectAltName')?.array || [];
}

function normalizeCsrPem(text) {
  return text.trim().replace(/-----BEGIN NEW CERTIFICATE REQUEST-----/, '-----BEGIN CERTIFICATE REQUEST-----')
    .replace(/-----END NEW CERTIFICATE REQUEST-----/, '-----END CERTIFICATE REQUEST-----');
}

function formatGeneralNames(names) {
  return names.map((name) => {
    if (name.dns) return `DNS:${name.dns}`;
    if (name.ip) return `IP:${name.ip}`;
    if (name.rfc822) return `EMAIL:${name.rfc822}`;
    if (name.uri) return `URI:${name.uri}`;
    return JSON.stringify(name);
  }).join(', ') || '(없음)';
}

function validateDnValue(label, value) {
  const trimmed = value.trim();
  if (/[\/\0\r\n]/.test(trimmed)) throw new Error(`${label}에는 슬래시나 줄바꿈을 사용할 수 없습니다.`);
  return trimmed;
}

function parseRequestedSans(text) {
  const result = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const value = raw.trim();
    if (!value) continue;
    const match = value.match(/^(DNS|IP|EMAIL):(.+)$/i);
    const type = match ? match[1].toUpperCase() : 'DNS';
    const name = (match ? match[2] : value).trim();
    if (!name || /[\0\r\n]/.test(name)) throw new Error(`SAN ${index + 1}행의 값을 확인하세요.`);
    if (type === 'DNS') {
      if (!/^(?:\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(name))
        throw new Error(`SAN ${index + 1}행의 DNS 이름이 올바르지 않습니다. 국제화 도메인은 Punycode로 입력하세요.`);
      result.push({ dns: name });
    } else if (type === 'IP') {
      result.push({ ip: name });
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) throw new Error(`SAN ${index + 1}행의 이메일 주소가 올바르지 않습니다.`);
      result.push({ rfc822: name });
    }
  }
  return result;
}

function certificateBlocks(text, { label = '인증서', max = 20, required = true } = {}) {
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  const remainder = text.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim();
  if (remainder) throw new Error(`${label}에는 CERTIFICATE PEM 블록만 입력하세요.`);
  if (required && !blocks.length) throw new Error(`${label} PEM 블록을 하나 이상 입력하세요.`);
  if (blocks.length > max) throw new Error(`${label}는 한 번에 ${max}개까지만 처리할 수 있습니다.`);
  return blocks.map((block) => block.trim());
}

function certificateRecord(pem, label, { trusted = false, fetched = false } = {}) {
  let x509;
  try { x509 = new X509(pem); }
  catch { throw new Error(`${label}을(를) X.509 인증서로 읽지 못했습니다.`); }
  let basicConstraints, keyUsage = '', extKeyUsage, nameConstraints, extensions = [];
  try { basicConstraints = x509.getExtBasicConstraints(); } catch { basicConstraints = undefined; }
  try { keyUsage = x509.getExtKeyUsageString(); } catch { keyUsage = ''; }
  try { extKeyUsage = x509.getExtExtKeyUsage(); } catch { extKeyUsage = undefined; }
  try { nameConstraints = x509.getExtNameConstraints(); } catch { nameConstraints = undefined; }
  try { extensions = x509.getExtParamArray() || []; } catch { extensions = []; }
  let aia = {}, crlUrls = [];
  try { aia = x509.getExtAIAInfo() || {}; } catch { aia = {}; }
  try { crlUrls = x509.getExtCRLDistributionPointsURI() || []; } catch { crlUrls = []; }
  return {
    pem, x509, hex: pemtohex(pem), label, trusted, fetched,
    subject: x509.getSubjectString(), issuer: x509.getIssuerString(),
    subjectCanon: x509.getSubject(true)?.canon || x509.getSubjectString(),
    issuerCanon: x509.getIssuer(true)?.canon || x509.getIssuerString(),
    notBefore: parseCertificateTime(x509.getNotBefore()), notAfter: parseCertificateTime(x509.getNotAfter()),
    basicConstraints, keyUsage, extKeyUsage, nameConstraints, extensions,
    ski: x509.getExtSubjectKeyIdentifier()?.kid?.hex || '',
    aki: x509.getExtAuthorityKeyIdentifier()?.kid?.hex || '',
    sigalg: x509.getSignatureAlgorithmField(),
    aiaIssuerUrls: aia.caissuer || [], ocspUrls: aia.ocsp || [], crlUrls,
  };
}

function verifiesCertificate(child, parent) {
  try { return child.x509.verifySignature(parent.x509.getPublicKey()); } catch { return false; }
}

function chooseCertificateParent(child, records) {
  let candidates = records.filter((parent) => parent !== child && parent.subjectCanon === child.issuerCanon);
  if (candidates.length > 1 && child.aki) {
    const keyed = candidates.filter((parent) => parent.ski && parent.ski === child.aki);
    if (keyed.length) candidates = keyed;
  }
  if (candidates.length > 1) {
    const signed = candidates.filter((parent) => verifiesCertificate(child, parent));
    if (signed.length) candidates = signed;
  }
  if (candidates.length > 1)
    throw new Error(`발급자 후보가 여러 개라 체인을 확정할 수 없습니다: ${child.subject}`);
  return candidates[0] || null;
}

function resolveCertificatePath(chainRecords, anchorRecords, { allowUnused = false } = {}) {
  const byHex = new Map();
  for (const record of [...chainRecords, ...anchorRecords]) {
    const existing = byHex.get(record.hex);
    if (existing) {
      existing.trusted ||= record.trusted;
      continue;
    }
    byHex.set(record.hex, record);
  }
  const records = [...byHex.values()];
  const chain = chainRecords.map((record) => byHex.get(record.hex));
  const parentSet = new Set();
  for (const child of chain) {
    const parent = chooseCertificateParent(child, records);
    if (parent && chain.includes(parent)) parentSet.add(parent);
  }
  let leaves = chain.filter((record) => !record.basicConstraints?.cA);
  if (leaves.length !== 1) leaves = chain.filter((record) => !parentSet.has(record));
  if (leaves.length !== 1)
    throw new Error('서로 연결되지 않거나 분기된 인증서가 있습니다. 하나의 체인에 속한 PEM만 입력하세요.');

  const ordered = [], seen = new Set();
  let current = leaves[0];
  while (current) {
    if (seen.has(current)) throw new Error('인증서 발급자 관계가 순환합니다.');
    seen.add(current);
    ordered.push(current);
    if (current.trusted) break;
    current = chooseCertificateParent(current, records);
  }
  const unused = [...new Set(chain)].filter((record) => !seen.has(record));
  if (!allowUnused && unused.length)
    throw new Error('모든 인증서를 하나의 체인으로 연결하지 못했습니다. 누락되거나 관계없는 PEM을 확인하세요.');
  return { ordered, unused, records };
}

function canonicalHost(value) {
  const raw = value.trim();
  if (!raw) return null;
  if (/\s|[/@?#]/.test(raw)) throw new Error('호스트 이름에는 스킴, 경로, 사용자 정보나 공백을 넣지 마세요.');
  const bracketed = raw.includes(':') && !raw.startsWith('[') ? `[${raw}]` : raw;
  let parsed;
  try { parsed = new URL(`https://${bracketed}/`); }
  catch { throw new Error('검사할 호스트 이름 또는 IP 주소가 올바르지 않습니다.'); }
  if (parsed.port) throw new Error('호스트 이름에는 포트를 넣지 마세요.');
  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (ipv4 && host.split('.').some((part) => Number(part) > 255))
    throw new Error('IPv4 주소의 각 숫자는 0~255 범위여야 합니다.');
  return { value: host, ip: ipv4 || host.includes(':') };
}

function dnsNameMatches(host, pattern) {
  const left = host.toLowerCase().replace(/\.$/, '');
  const right = pattern.toLowerCase().replace(/\.$/, '');
  if (!right.includes('*')) return left === right;
  if (!right.startsWith('*.') || right.slice(2).includes('*') || right.slice(2).startsWith('xn--')) return false;
  const suffix = right.slice(2);
  return left.endsWith(`.${suffix}`) && left.split('.').length === suffix.split('.').length + 1;
}

function certificateCommonName(record) {
  const rdns = record.x509.getSubject()?.array || [];
  for (const rdn of rdns) for (const attr of rdn) if (attr.type === 'CN') return attr.value;
  return '';
}

function checkCertificateHostname(record, input) {
  const host = canonicalHost(input);
  if (!host) return null;
  let names = [];
  try { names = record.x509.getExtSubjectAltName()?.array || []; } catch { names = []; }
  if (host.ip) {
    const candidates = names.filter((name) => name.ip).map((name) => canonicalHost(name.ip)?.value);
    return { valid: candidates.includes(host.value), host: host.value, candidates, legacyCn: false };
  }
  const candidates = names.filter((name) => name.dns).map((name) => name.dns);
  if (candidates.length)
    return { valid: candidates.some((name) => dnsNameMatches(host.value, name)), host: host.value, candidates, legacyCn: false };
  const cn = certificateCommonName(record);
  return { valid: !!cn && dnsNameMatches(host.value, cn), host: host.value, candidates: cn ? [cn] : [], legacyCn: !!cn };
}

function dnsWithinConstraint(name, constraint) {
  const dns = name.toLowerCase().replace(/\.$/, '');
  const base = constraint.toLowerCase().replace(/\.$/, '');
  if (base.startsWith('.')) return dns.endsWith(base) && dns.length > base.length;
  return dns === base || dns.endsWith(`.${base}`);
}

function checkNameConstraints(path, problems) {
  let leafNames = [];
  try { leafNames = path[0].x509.getExtSubjectAltName()?.array?.filter((name) => name.dns).map((name) => name.dns) || []; }
  catch { leafNames = []; }
  if (!leafNames.length) return;
  for (const ca of path.slice(1)) {
    const constraints = ca.nameConstraints;
    if (!constraints) continue;
    const unsupported = [...(constraints.permit || []), ...(constraints.exclude || [])]
      .filter((constraint) => !constraint.dns);
    if (unsupported.length && constraints.critical)
      problems.push(`${ca.subject}의 critical Name Constraints에 현재 판정할 수 없는 이름 형식이 있습니다.`);
    const excluded = (constraints.exclude || []).filter((constraint) => constraint.dns);
    const permitted = (constraints.permit || []).filter((constraint) => constraint.dns);
    for (const name of leafNames) {
      if (excluded.some((constraint) => dnsWithinConstraint(name, constraint.dns)))
        problems.push(`${name}은(는) ${ca.subject}의 제외된 DNS 이름 제약에 해당합니다.`);
      if (permitted.length && !permitted.some((constraint) => dnsWithinConstraint(name, constraint.dns)))
        problems.push(`${name}은(는) ${ca.subject}의 허용된 DNS 이름 제약 밖에 있습니다.`);
    }
  }
}

function crlBlocks(text) {
  if (!text.trim()) return [];
  const blocks = text.match(/-----BEGIN (?:X509 )?CRL-----[\s\S]*?-----END (?:X509 )?CRL-----/g) || [];
  const remainder = text.replace(/-----BEGIN (?:X509 )?CRL-----[\s\S]*?-----END (?:X509 )?CRL-----/g, '').trim();
  if (remainder || !blocks.length) throw new Error('CRL에는 X509 CRL PEM 블록만 입력하세요.');
  if (blocks.length > 20) throw new Error('CRL은 한 번에 20개까지만 검사할 수 있습니다.');
  return blocks.map((pem, index) => {
    try { return { crl: new X509CRL(pem), pem, label: `입력 CRL ${index + 1}` }; }
    catch { throw new Error(`${index + 1}번째 CRL을 읽지 못했습니다.`); }
  });
}

function certificateNetworkEndpoints(path) {
  const rows = [];
  path.forEach((record, index) => {
    for (const url of record.aiaIssuerUrls) rows.push([`${index + 1}번 AIA 발급자`, url]);
    for (const url of record.ocspUrls) rows.push([`${index + 1}번 OCSP`, url]);
    for (const url of record.crlUrls) rows.push([`${index + 1}번 CRL`, url]);
  });
  return rows;
}

function networkUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`인증서의 네트워크 주소가 올바르지 않습니다: ${value}`); }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error(`HTTP(S)가 아닌 인증서 네트워크 주소는 요청하지 않습니다: ${value}`);
  return url.href;
}

async function fetchCertificateResource(url, options, signal) {
  const href = networkUrl(url);
  let response;
  try { response = await fetch(href, { ...options, mode: 'cors', credentials: 'omit', signal }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`요청에 실패했습니다(CORS 또는 연결 상태 확인): ${href}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} 응답을 받았습니다: ${href}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > 4 * 1024 * 1024) throw new Error(`응답이 4 MiB 제한을 넘습니다: ${href}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 4 * 1024 * 1024) throw new Error(`응답이 4 MiB 제한을 넘습니다: ${href}`);
  return { bytes, href };
}

function derCertificateRecord(bytes, label, options) {
  const pem = bytesToStr(bytes).includes('-----BEGIN CERTIFICATE-----')
    ? bytesToStr(bytes).trim() : hextopem(bytesToHex(bytes), 'CERTIFICATE').replace(/\r\n/g, '\n').trim();
  return certificateRecord(pem, label, options);
}

function derCrlRecord(bytes, label) {
  const text = bytesToStr(bytes);
  const value = text.includes('-----BEGIN') ? text.trim() : bytesToHex(bytes);
  try { return { crl: new X509CRL(value), label }; }
  catch { throw new Error(`${label} 응답을 X.509 CRL로 읽지 못했습니다.`); }
}

function crlIssuerCanon(crl) {
  const issuer = crl.getIssuer();
  return issuer?.canon || issuer?.str?.toLowerCase() || crl.getIssuerString?.().toLowerCase() || '';
}

function checkCrlForCertificate(crlRecord, child, parent) {
  const { crl } = crlRecord;
  if (crlIssuerCanon(crl) !== parent.subjectCanon) return null;
  if (parent.keyUsage && !parent.keyUsage.split(',').includes('cRLSign'))
    return { status: '검증 실패', problem: `${parent.subject} 인증서에 CRL 서명용 cRLSign Key Usage가 없습니다.` };
  let signature = false;
  try { signature = crl.verifySignature(parent.x509.getPublicKey()); } catch { signature = false; }
  if (!signature) return { status: '검증 실패', problem: `${crlRecord.label}의 서명이 발급자 인증서와 맞지 않습니다.` };
  const now = new Date(), thisUpdate = parseCertificateTime(crl.getThisUpdate());
  const nextUpdate = parseCertificateTime(crl.getNextUpdate());
  if (!thisUpdate || thisUpdate > now)
    return { status: '검증 실패', problem: `${crlRecord.label}의 thisUpdate가 올바르지 않습니다.` };
  if (nextUpdate && nextUpdate < now)
    return { status: '만료된 CRL', problem: `${crlRecord.label}의 nextUpdate가 지나 최신 폐기 상태를 보장할 수 없습니다.` };
  const revoked = crl.findRevCert(child.pem);
  return revoked
    ? { status: '폐기됨', problem: `${child.subject} 인증서가 ${crlRecord.label}에 폐기된 것으로 기록되어 있습니다.` }
    : { status: '폐기되지 않음', good: true };
}

function sameHexInteger(left, right) {
  return String(left || '').replace(/^0+/, '').toLowerCase() === String(right || '').replace(/^0+/, '').toLowerCase();
}

async function parseAndVerifyOcsp(bytes, child, parent) {
  const responseHex = bytesToHex(bytes);
  let parsed;
  try { parsed = new KJUR.asn1.ocsp.OCSPParser().getOCSPResponse(responseHex); }
  catch { throw new Error('OCSP 응답의 ASN.1 구조를 읽지 못했습니다.'); }
  if (parsed.resstatus !== 0) throw new Error(`OCSP 응답 상태가 성공이 아닙니다(${parsed.resstatus}).`);
  const requestHex = KJUR.asn1.ocsp.OCSPUtil.getRequestHex(parent.pem, child.pem, 'sha1');
  const expected = new KJUR.asn1.ocsp.OCSPParser().getOCSPRequest(requestHex).array[0];
  const single = parsed.array?.find((entry) => sameHexInteger(entry.certid?.sbjsn, expected.sbjsn));
  if (!single || single.certid.alg !== expected.alg || single.certid.issname !== expected.issname || single.certid.isskey !== expected.isskey)
    throw new Error('OCSP 응답의 CertID가 검사한 인증서와 일치하지 않습니다.');

  let basicHex, tbsHex, sigHex;
  try {
    const rootChildren = ASN1HEX.getChildIdx(responseHex, 0);
    const responseBytes = ASN1HEX.getChildIdx(responseHex, rootChildren[1])[0];
    const responseParts = ASN1HEX.getChildIdx(responseHex, responseBytes);
    basicHex = ASN1HEX.getV(responseHex, responseParts[1]);
    const basicParts = ASN1HEX.getChildIdx(basicHex, 0);
    tbsHex = ASN1HEX.getTLV(basicHex, basicParts[0]);
    sigHex = ASN1HEX.getV(basicHex, basicParts[2]).slice(2);
  } catch { throw new Error('OCSP 서명 데이터를 추출하지 못했습니다.'); }

  const responderCandidates = [parent];
  for (const [index, hex] of (parsed.certs || []).entries()) {
    const pem = hextopem(hex, 'CERTIFICATE').replace(/\r\n/g, '\n').trim();
    const record = certificateRecord(pem, `OCSP 응답자 ${index + 1}`);
    if (!responderCandidates.some((candidate) => candidate.hex === record.hex)) responderCandidates.push(record);
  }
  let verified = false;
  for (const responder of responderCandidates) {
    const issuerIsResponder = responder.hex === parent.hex;
    const eku = responder.extKeyUsage?.array || [];
    const now = new Date();
    const periodValid = responder.notBefore && responder.notAfter
      && responder.notBefore <= now && now <= responder.notAfter;
    const delegated = verifiesCertificate(responder, parent)
      && periodValid && (eku.includes('OCSPSigning') || eku.includes('1.3.6.1.5.5.7.3.9'));
    if (!issuerIsResponder && !delegated) continue;
    let identityMatches = true;
    if (parsed.respid?.name) {
      const name = parsed.respid.name.canon || parsed.respid.name.str;
      identityMatches = !name || name === responder.subjectCanon || name === responder.subject;
    } else if (parsed.respid?.key) {
      const keyBits = ASN1HEX.getVbyList(responder.x509.getPublicKeyHex(), 0, [1], '03', true);
      identityMatches = KJUR.crypto.Util.hashHex(keyBits, 'sha1') === parsed.respid.key;
    }
    if (!identityMatches) continue;
    try {
      const signature = new KJUR.crypto.Signature({ alg: parsed.alg });
      signature.init(responder.x509.getPublicKey());
      signature.updateHex(tbsHex);
      verified = signature.verify(sigHex);
    } catch { verified = false; }
    if (verified) break;
  }
  if (!verified) throw new Error('OCSP 응답자 권한 또는 응답 서명을 검증하지 못했습니다.');

  const now = Date.now(), skew = 5 * 60 * 1000;
  const producedAt = parseCertificateTime(parsed.prodat);
  const thisUpdate = parseCertificateTime(single.thisupdate);
  const nextUpdate = parseCertificateTime(single.nextupdate);
  if (!producedAt || producedAt.getTime() > now + skew) throw new Error('OCSP producedAt이 올바르지 않습니다.');
  if (!thisUpdate || thisUpdate.getTime() > now + skew) throw new Error('OCSP thisUpdate가 올바르지 않습니다.');
  if (nextUpdate && nextUpdate.getTime() < now - skew) throw new Error('OCSP nextUpdate가 지나 응답이 만료되었습니다.');
  return single.status?.status || 'unknown';
}

tool({
  id: 'x509-parse', cat: CAT, name: 'X.509 인증서 파싱',
  desc: 'PEM 인증서를 파싱해 주체, 발급자, 유효기간, 확장 등을 표시합니다.',
  keywords: 'x509 certificate ssl tls pem parse',
  transfer: { inputs: [{ id: 'input', label: 'PEM 인증서', accepts: ['pem'] }] },
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
        const rows = [
          ['버전', 'v' + (x.getVersion())],
          ['시리얼 번호', x.getSerialNumberHex()],
          ['주체 (Subject)', x.getSubjectString()],
          ['발급자 (Issuer)', x.getIssuerString()],
          ['유효 시작', formatCertificateTime(notBefore)],
          ['유효 만료', formatCertificateTime(notAfter)],
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
        const expDate = parseCertificateTime(notAfter);
        if (expDate) {
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
  id: 'pkcs10-csr', cat: CAT, name: 'PKCS#10 CSR 생성 / 파싱',
  desc: '개인키로 인증서 서명 요청(CSR)을 만들거나 CSR의 주체, SAN, 공개키와 자체 서명을 검사합니다.',
  keywords: 'pkcs10 csr certificate signing request create parse san 인증서 서명 요청',
  transfer: {
    inputs: [
      { id: 'privateKey', label: '개인키 PEM', accepts: ['pem'] },
      { id: 'csr', label: 'CSR PEM', accepts: ['pem'] },
    ],
    outputs: [{ id: 'csr', label: 'CSR PEM', type: 'pem' }],
  },
  render(root) {
    root.append(h('h3', null, 'CSR 생성'));
    makeIO(root, {
      inputs: [
        { id: 'privateKey', label: '개인키 PEM (RSA 또는 EC)', rows: 10, placeholder: '-----BEGIN PRIVATE KEY-----' },
        { id: 'sans', label: '주체 대체 이름 (한 줄에 하나, DNS:/IP:/EMAIL: 접두사)', rows: 4, value: 'DNS:example.com\nDNS:www.example.com' },
      ],
      options: [
        { id: 'pass', label: '키 패스프레이즈', type: 'password', size: 150 },
        { id: 'country', label: '국가(C)', type: 'text', size: 60, value: 'KR' },
        { id: 'state', label: '시/도(ST)', type: 'text', size: 100 },
        { id: 'locality', label: '도시(L)', type: 'text', size: 100 },
        { id: 'org', label: '조직(O)', type: 'text', size: 130, value: 'W-Tools' },
        { id: 'unit', label: '부서(OU)', type: 'text', size: 110 },
        { id: 'commonName', label: '일반 이름(CN)', type: 'text', size: 160, value: 'example.com' },
      ],
      actions: [{ id: 'create', label: 'CSR 생성' }, { id: 'download', label: 'CSR 다운로드', primary: false }],
      autorun: false,
      outputRows: 12,
      transferOutput: 'csr',
      async process(values, options, action) {
        if (!values.privateKey.trim()) throw new Error('CSR에 서명할 개인키 PEM을 입력하세요.');
        await loadScript(LIB.jsrsasign);
        let key;
        try { key = KEYUTIL.getKey(values.privateKey.trim(), options.pass || undefined); }
        catch { throw new Error('개인키를 읽지 못했습니다. PEM 형식과 패스프레이즈를 확인하세요.'); }
        if (!key.isPrivate) throw new Error('CSR 생성에는 개인키가 필요합니다. 공개키나 인증서를 입력하지 마세요.');
        const details = keyDetails(key);
        if (!['RSA', 'EC'].includes(details.algorithm)) throw new Error('CSR 생성은 RSA와 EC 개인키를 지원합니다.');
        if (details.algorithm === 'RSA' && key.n.bitLength() < 2048)
          throw new Error('새 CSR에는 2048비트 이상의 RSA 키를 사용하세요.');

        const sans = parseRequestedSans(values.sans);
        const fields = [
          ['C', '국가(C)', options.country], ['ST', '시/도(ST)', options.state],
          ['L', '도시(L)', options.locality], ['O', '조직(O)', options.org],
          ['OU', '부서(OU)', options.unit], ['CN', '일반 이름(CN)', options.commonName],
        ].map(([type, label, value]) => [type, validateDnValue(label, value)]).filter(([, value]) => value);
        const country = fields.find(([type]) => type === 'C')?.[1];
        if (country && !/^[A-Za-z]{2}$/.test(country)) throw new Error('국가(C)는 ISO 3166-1 두 글자 코드로 입력하세요.');
        if (!fields.some(([type]) => type === 'CN') && !sans.length)
          throw new Error('일반 이름(CN)이나 SAN을 하나 이상 입력하세요.');
        const subject = fields.map(([type, value]) => `/${type}=${type === 'C' ? value.toUpperCase() : value}`).join('');
        const sigalg = details.algorithm === 'RSA' ? 'SHA256withRSA' : 'SHA256withECDSA';
        let csr;
        try {
          csr = KJUR.asn1.csr.CSRUtil.newCSRPEM({
            subject: { str: subject }, sbjpubkey: key, sbjprvkey: key, sigalg,
            ...(sans.length ? { extreq: [{ extname: 'subjectAltName', array: sans }] } : {}),
          }).replace(/\r\n/g, '\n').trim();
        } catch { throw new Error('CSR을 생성하지 못했습니다. 주체와 SAN 값을 확인하세요.'); }
        if (action === 'download') download('wtools-request.csr', csr + '\n', 'application/pkcs10;charset=utf-8');
        return csr;
      },
      note: '개인키와 패스프레이즈는 브라우저 안에서만 사용됩니다. 국제화 도메인은 Punycode로 입력하고, 발급 기관에 제출하기 전에 아래 파싱 검사로 요청 내용을 다시 확인하세요.',
    });

    root.append(h('h3', null, 'CSR 파싱 및 자체 서명 검사'));
    makeIO(root, {
      inputs: [{ id: 'csr', label: 'CSR PEM', rows: 10, placeholder: '-----BEGIN CERTIFICATE REQUEST-----' }],
      actions: [{ id: 'parse', label: 'CSR 검사' }],
      autorun: false,
      outputHTML: true,
      async process(text) {
        if (!text.trim()) throw new Error('CSR PEM을 입력하세요.');
        await loadScript(LIB.jsrsasign);
        const pem = normalizeCsrPem(text);
        let param;
        try { param = KJUR.asn1.csr.CSRUtil.getParam(pem, true); }
        catch { throw new Error('PKCS#10 CSR을 읽지 못했습니다. PEM 형식을 확인하세요.'); }
        const valid = KJUR.asn1.csr.CSRUtil.verifySignature(param);
        const key = KEYUTIL.getKey(param.sbjpubkey);
        const details = keyDetails(key);
        const fingerprint = await publicKeyFingerprint(pemtohex(param.sbjpubkey));
        const warnings = [];
        if (details.algorithm === 'RSA' && key.n.bitLength() < 2048) warnings.push('RSA 키가 2048비트보다 작습니다.');
        if (/sha1/i.test(param.sigalg || '')) warnings.push('SHA-1 서명 알고리즘이 사용되었습니다.');
        const box = h('div', null, kvTable([
          ['주체 (Subject)', param.subject?.str || '(비어 있음)'],
          ['주체 대체 이름 (SAN)', formatGeneralNames(csrSanArray(param))],
          ['공개키', `${details.algorithm} / ${details.detail}`],
          ['서명 알고리즘', param.sigalg || '알 수 없음'],
          ['공개키 SHA-256', fingerprint],
          ['자체 서명', valid ? '유효' : '유효하지 않음'],
        ]));
        box.append(h('p', {
          style: { fontWeight: 700, color: valid ? 'var(--ok)' : 'var(--danger)' },
        }, valid ? 'CSR 자체 서명이 유효합니다.' : '⚠ CSR 자체 서명이 유효하지 않습니다. 내용이 변조되었을 수 있습니다.'));
        if (warnings.length) box.append(h('p', { class: 'note' }, `주의: ${warnings.join(' ')}`));
        return box;
      },
      note: '자체 서명 검사는 CSR의 공개키와 요청 내용이 서로 맞는지 확인합니다. 인증 기관이 요청을 승인했거나 도메인 소유권을 확인했다는 뜻은 아닙니다.',
    });
  },
});

tool({
  id: 'key-cert-match', cat: CAT, name: '키·CSR·인증서 일치 확인',
  desc: '개인키나 공개키, CSR, X.509 인증서에서 공개키를 추출해 같은 키 쌍인지 비교합니다.',
  keywords: 'private public key csr certificate match spki fingerprint modulus 키 인증서 일치',
  transfer: {
    inputs: [
      { id: 'key', label: '개인키 또는 공개키', accepts: ['pem'] },
      { id: 'csr', label: 'CSR', accepts: ['pem'] },
      { id: 'certificate', label: '인증서', accepts: ['pem'] },
    ],
  },
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'key', label: '개인키 또는 공개키 PEM (선택)', rows: 8, placeholder: '-----BEGIN PRIVATE KEY----- 또는 -----BEGIN PUBLIC KEY-----' },
        { id: 'csr', label: 'CSR PEM (선택)', rows: 7, placeholder: '-----BEGIN CERTIFICATE REQUEST-----' },
        { id: 'certificate', label: 'X.509 인증서 PEM (선택)', rows: 8, placeholder: '-----BEGIN CERTIFICATE-----' },
      ],
      options: [{ id: 'pass', label: '키 패스프레이즈', type: 'password', size: 170 }],
      actions: [{ id: 'compare', label: '공개키 비교' }],
      autorun: false,
      outputHTML: true,
      async process(values, options) {
        const supplied = [values.key, values.csr, values.certificate].filter((value) => value.trim()).length;
        if (supplied < 2) throw new Error('비교할 키, CSR, 인증서 중 두 개 이상을 입력하세요.');
        await loadScript(LIB.jsrsasign);
        const records = [];
        const issues = [];
        if (values.key.trim()) {
          let key;
          try { key = KEYUTIL.getKey(values.key.trim(), options.pass || undefined); }
          catch { throw new Error('개인키 또는 공개키를 읽지 못했습니다. PEM 형식과 패스프레이즈를 확인하세요.'); }
          const details = keyDetails(key);
          records.push({ label: key.isPrivate ? '개인키' : '공개키', details, spki: pemtohex(publicKeyPem(key)) });
        }
        if (values.csr.trim()) {
          const pem = normalizeCsrPem(values.csr);
          let param;
          try { param = KJUR.asn1.csr.CSRUtil.getParam(pem, true); }
          catch { throw new Error('CSR을 읽지 못했습니다. PKCS#10 PEM 형식을 확인하세요.'); }
          if (!KJUR.asn1.csr.CSRUtil.verifySignature(param)) issues.push('CSR 자체 서명이 유효하지 않습니다.');
          const key = KEYUTIL.getKey(param.sbjpubkey);
          records.push({ label: 'CSR', details: keyDetails(key), spki: pemtohex(param.sbjpubkey) });
        }
        if (values.certificate.trim()) {
          let cert;
          try { cert = new X509(values.certificate.trim()); }
          catch { throw new Error('X.509 인증서를 읽지 못했습니다. CERTIFICATE PEM 형식을 확인하세요.'); }
          records.push({ label: '인증서', details: keyDetails(cert.getPublicKey()), spki: cert.getPublicKeyHex() });
        }
        for (const record of records) record.fingerprint = await publicKeyFingerprint(record.spki);
        const matches = records.every((record) => record.spki === records[0].spki);
        const valid = matches && !issues.length;
        return h('div', null,
          h('p', { style: { fontWeight: 700, color: valid ? 'var(--ok)' : 'var(--danger)' } },
            valid ? '모든 입력의 공개키가 일치합니다.' : matches ? '공개키는 일치하지만 입력 검증에 실패했습니다.' : '⚠ 공개키가 일치하지 않습니다.'),
          issues.length ? h('p', { class: 'error' }, issues.join(' ')) : null,
          h('table', { class: 'grid' },
            h('thead', null, h('tr', null,
              ['입력', '공개키', 'SHA-256 지문', '비교'].map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', null, records.map((record) => h('tr', null,
              h('td', { 'data-label': '입력' }, record.label),
              h('td', { 'data-label': '공개키' }, `${record.details.algorithm} / ${record.details.detail}`),
              h('td', { class: 'mono', 'data-label': 'SHA-256 지문' }, record.fingerprint),
              h('td', { 'data-label': '비교' }, record.spki === records[0].spki ? '기준과 일치' : '불일치'))))));
      },
      note: '공개키의 표준 SPKI DER 바이트를 비교하므로 PEM 줄바꿈이나 헤더 차이에 영향을 받지 않습니다. 개인키와 패스프레이즈는 브라우저 밖으로 전송되지 않습니다.',
    });
  },
});

tool({
  id: 'certificate-chain', cat: CAT, name: '인증서 체인 / 신뢰 검증',
  desc: 'X.509 체인을 정렬하고 신뢰 앵커·호스트명·제약·서명·CRL과 선택적 AIA/OCSP 상태를 검사합니다.',
  keywords: 'x509 certificate chain trust verify hostname root intermediate aia ocsp crl revocation 인증서 신뢰 검증',
  externalRequest: {
    service: '인증서에 기록된 AIA·OCSP·CRL HTTP(S) 서버',
    sends: 'AIA·CRL 조회 요청, OCSP 인증서 식별 정보 및 일반적인 접속 정보(IP 등)',
    privacy: '“체인 검증”은 입력한 인증서 내용을 외부 서버로 전송하지 않습니다. 민감한 사설 인증서는 온라인 확인 전에 인증서에 기록된 대상 주소를 확인하세요.',
    cors: true,
    action: '“온라인 AIA·OCSP·CRL 확인” 버튼',
  },
  transfer: {
    inputs: [
      { id: 'chain', label: '인증서 체인 PEM', accepts: ['pem'] },
      { id: 'anchors', label: '신뢰 앵커 PEM', accepts: ['pem'] },
    ],
  },
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'chain', label: '서버·중간 인증서 PEM 묶음 (순서 무관, 최대 20개)', rows: 16, placeholder: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----' },
        { id: 'anchors', label: '직접 신뢰할 루트/앵커 PEM (선택, 최대 200개)', rows: 8, placeholder: '운영체제 저장소 대신 직접 신뢰할 인증서를 입력하세요.' },
        { id: 'hostname', label: 'TLS 호스트 이름 또는 IP (선택)', rows: 2, placeholder: 'www.example.com' },
        { id: 'crls', label: '로컬 X.509 CRL PEM (선택, 최대 20개)', rows: 7, placeholder: '-----BEGIN X509 CRL-----' },
      ],
      actions: [
        { id: 'verify', label: '체인 검증' },
        { id: 'online', label: '온라인 AIA·OCSP·CRL 확인', primary: false },
      ],
      autorun: false,
      cancelable: true,
      outputHTML: true,
      async process(values, _options, action, signal) {
        if (!values.chain.trim()) throw new Error('검증할 인증서 PEM을 입력하세요.');
        await loadScript(LIB.jsrsasign);
        const chainRecords = certificateBlocks(values.chain, { label: '인증서 체인', max: 20 })
          .map((pem, index) => certificateRecord(pem, `체인 ${index + 1}`));
        const anchorRecords = certificateBlocks(values.anchors, { label: '신뢰 앵커', max: 200, required: false })
          .map((pem, index) => certificateRecord(pem, `신뢰 앵커 ${index + 1}`, { trusted: true }));
        if (new Set(chainRecords.map((record) => record.hex)).size !== chainRecords.length)
          throw new Error('같은 인증서가 두 번 이상 입력되었습니다. 체인의 중복 PEM을 제거해 주세요.');
        const localCrls = crlBlocks(values.crls);
        const network = action === 'online';
        const warnings = [], networkLog = [];

        if (network) {
          const attempted = new Set();
          for (let depth = 0; depth < 8; depth++) {
            const partial = resolveCertificatePath(chainRecords, anchorRecords, { allowUnused: true });
            const top = partial.ordered.at(-1);
            if (top.trusted || top.subjectCanon === top.issuerCanon) break;
            const urls = top.aiaIssuerUrls.filter((url) => !attempted.has(url));
            if (!urls.length) break;
            let added = false;
            for (const url of urls) {
              attempted.add(url);
              try {
                const response = await fetchCertificateResource(url, {}, signal);
                const issuer = derCertificateRecord(response.bytes, `AIA ${response.href}`, { fetched: true });
                if (issuer.subjectCanon !== top.issuerCanon || !verifiesCertificate(top, issuer))
                  throw new Error(`AIA 인증서가 ${top.subject}의 발급자와 일치하지 않습니다.`);
                if (!chainRecords.some((record) => record.hex === issuer.hex)) chainRecords.push(issuer);
                networkLog.push(['AIA 중간 인증서', response.href, '가져옴']);
                added = true;
                break;
              } catch (error) {
                if (signal?.aborted) throw error;
                warnings.push(error.message);
                networkLog.push(['AIA 중간 인증서', url, '실패']);
              }
            }
            if (!added) break;
          }
        }

        const { ordered } = resolveCertificatePath(chainRecords, anchorRecords);
        const now = new Date(), problems = [];
        const rows = ordered.map((record, index) => {
          let period = '유효';
          if (!record.notBefore || !record.notAfter) {
            period = '기간 해석 실패';
            problems.push(`${index + 1}번째 인증서의 유효기간을 해석하지 못했습니다.`);
          } else if (now < record.notBefore) {
            period = '아직 유효하지 않음';
            problems.push(`${record.subject} 인증서는 아직 유효하지 않습니다.`);
          } else if (now > record.notAfter) {
            period = '만료됨';
            problems.push(`${record.subject} 인증서가 만료되었습니다.`);
          }

          const parent = ordered[index + 1];
          const selfIssued = record.subjectCanon === record.issuerCanon;
          let signature;
          if (parent) {
            signature = verifiesCertificate(record, parent) ? '상위 서명 유효' : '상위 서명 실패';
            if (signature.endsWith('실패')) problems.push(`${record.subject} 인증서의 서명이 유효하지 않습니다.`);
          } else if (selfIssued) {
            signature = verifiesCertificate(record, record) ? '자체 서명 유효' : '자체 서명 실패';
            if (signature.endsWith('실패')) problems.push(`${record.subject} 최상위 인증서의 자체 서명이 유효하지 않습니다.`);
          } else {
            signature = '상위 인증서 미포함';
            warnings.push('최상위 인증서의 발급자가 없어 제공된 입력 범위까지만 서명을 검증했습니다.');
          }

          let ca = index === 0 ? '말단 인증서' : 'CA=true';
          if (index > 0) {
            if (!record.basicConstraints?.cA) {
              ca = 'CA 제약 실패';
              problems.push(`${record.subject} 인증서에 CA=true 기본 제약이 없습니다.`);
            } else if (record.keyUsage && !record.keyUsage.split(',').includes('keyCertSign')) {
              ca = 'keyCertSign 없음';
              problems.push(`${record.subject} CA 인증서에 keyCertSign 용도가 없습니다.`);
            } else if (record.keyUsage) ca += ' · keyCertSign';
            else ca += ' · Key Usage 없음';
            const subordinateCas = ordered.slice(1, index)
              .filter((candidate) => candidate.subjectCanon !== candidate.issuerCanon).length;
            if (Number.isInteger(record.basicConstraints?.pathLen)
              && subordinateCas > record.basicConstraints.pathLen) {
              ca = 'pathLen 초과';
              problems.push(`${record.subject}의 pathLen=${record.basicConstraints.pathLen} 제약을 넘었습니다.`);
            }
          }
          const understoodCritical = new Set([
            'basicConstraints', 'keyUsage', 'subjectAltName', 'authorityKeyIdentifier',
            'subjectKeyIdentifier', 'extKeyUsage', 'nameConstraints', 'cRLDistributionPoints',
            'authorityInfoAccess',
          ]);
          const unknown = record.extensions.filter((extension) => extension.critical
            && !understoodCritical.has(extension.extname));
          if (unknown.length)
            problems.push(`${record.subject}에 처리할 수 없는 critical 확장이 있습니다: ${unknown.map((extension) => extension.extname || extension.oid).join(', ')}`);
          if (/sha1/i.test(record.sigalg)) warnings.push(`${record.subject} 인증서가 SHA-1 서명을 사용합니다.`);
          return {
            role: index === 0 ? '서버/말단'
              : record.trusted ? '신뢰 앵커'
                : index === ordered.length - 1 && selfIssued ? '루트' : `중간 ${index}`,
            record, period, signature, ca,
          };
        });

        checkNameConstraints(ordered, problems);
        const hostname = checkCertificateHostname(ordered[0], values.hostname);
        if (hostname) {
          if (!hostname.valid)
            problems.push(`호스트 ${hostname.host}이(가) 인증서 이름과 일치하지 않습니다 (${hostname.candidates.join(', ') || '이름 없음'}).`);
          if (hostname.legacyCn)
            warnings.push('SAN이 없어 레거시 Common Name으로 호스트 이름을 비교했습니다. 새 인증서는 SAN을 사용해야 합니다.');
          const eku = ordered[0].extKeyUsage?.array;
          if (eku?.length && !eku.includes('serverAuth') && !eku.includes('anyExtendedKeyUsage') && !eku.includes('2.5.29.37.0'))
            problems.push('말단 인증서의 Extended Key Usage에 serverAuth가 없습니다.');
        }

        const trusted = !!ordered.at(-1).trusted;
        if (anchorRecords.length && !trusted)
          problems.push('인증서 체인이 제공한 신뢰 앵커까지 연결되지 않습니다.');
        else if (!anchorRecords.length)
          warnings.push('신뢰 앵커를 제공하지 않아 공인 또는 사설 루트 신뢰 여부는 판정하지 않았습니다.');

        const revocationRows = [];
        let onlineRevocationComplete = true;
        const usedLocalCrls = new Set();
        for (let index = 0; index < ordered.length - 1; index++) {
          const child = ordered[index], parent = ordered[index + 1];
          const statuses = [];
          for (const crlRecord of localCrls) {
            const result = checkCrlForCertificate(crlRecord, child, parent);
            if (!result) continue;
            usedLocalCrls.add(crlRecord);
            statuses.push(`로컬 CRL: ${result.status}`);
            if (result.problem) problems.push(result.problem);
          }

          if (network) {
            let onlineConfirmed = false, attemptedOnline = false;
            for (const url of child.ocspUrls) {
              attemptedOnline = true;
              try {
                const requestHex = KJUR.asn1.ocsp.OCSPUtil.getRequestHex(parent.pem, child.pem, 'sha1');
                const response = await fetchCertificateResource(url, {
                  method: 'POST', headers: { 'Content-Type': 'application/ocsp-request', Accept: 'application/ocsp-response' },
                  body: hexToBytes(requestHex),
                }, signal);
                const status = await parseAndVerifyOcsp(response.bytes, child, parent);
                networkLog.push(['OCSP', response.href, status]);
                statuses.push(`OCSP: ${status === 'good' ? '폐기되지 않음' : status === 'revoked' ? '폐기됨' : '알 수 없음'}`);
                if (status === 'revoked') {
                  problems.push(`${child.subject} 인증서가 OCSP에서 폐기된 것으로 응답되었습니다.`);
                  onlineConfirmed = true;
                } else if (status === 'good') onlineConfirmed = true;
                else warnings.push(`${child.subject}의 OCSP 상태를 확인할 수 없습니다.`);
                break;
              } catch (error) {
                if (signal?.aborted) throw error;
                warnings.push(`OCSP: ${error.message}`);
                networkLog.push(['OCSP', url, '실패']);
              }
            }
            for (const url of child.crlUrls) {
              attemptedOnline = true;
              try {
                const response = await fetchCertificateResource(url, {}, signal);
                const crlRecord = derCrlRecord(response.bytes, `온라인 CRL ${response.href}`);
                const result = checkCrlForCertificate(crlRecord, child, parent);
                if (!result) throw new Error('CRL 발급자가 인증서의 상위 CA와 일치하지 않습니다.');
                networkLog.push(['CRL', response.href, result.status]);
                statuses.push(`온라인 CRL: ${result.status}`);
                if (result.problem) problems.push(result.problem);
                if (result.good || result.status === '폐기됨') onlineConfirmed = true;
                break;
              } catch (error) {
                if (signal?.aborted) throw error;
                warnings.push(`CRL: ${error.message}`);
                networkLog.push(['CRL', url, '실패']);
              }
            }
            if (!attemptedOnline) statuses.push('온라인 폐기 주소 없음');
            else if (!onlineConfirmed && !statuses.some((status) => status.includes('폐기됨')))
              statuses.push('온라인 폐기 상태 미확인');
            if (!onlineConfirmed) onlineRevocationComplete = false;
          }
          revocationRows.push([child.subject, statuses.join(' · ') || '검사 자료 없음']);
        }
        for (const crlRecord of localCrls) if (!usedLocalCrls.has(crlRecord))
          warnings.push(`${crlRecord.label}의 발급자가 입력 체인과 일치하지 않아 사용하지 않았습니다.`);

        const endpoints = certificateNetworkEndpoints(ordered);
        const uniqueProblems = [...new Set(problems)], uniqueWarnings = [...new Set(warnings)];
        const valid = !uniqueProblems.length;
        return h('div', null,
          h('p', { style: { fontWeight: 700, color: valid ? 'var(--ok)' : 'var(--danger)' } },
            valid ? `인증서 ${ordered.length}개의 기간·제약·서명 검증을 통과했습니다.`
              : `⚠ 인증서 체인에서 문제 ${uniqueProblems.length}개를 발견했습니다.`),
          h('p', { style: { fontWeight: 700, color: trusted ? 'var(--ok)' : '#d97706' } },
            trusted ? '제공한 신뢰 앵커까지 암호학적으로 연결되었습니다.' : '신뢰 앵커 연결은 확인되지 않았습니다.'),
          hostname ? h('p', { style: { color: hostname.valid ? 'var(--ok)' : 'var(--danger)' } },
            hostname.valid ? `호스트 ${hostname.host}이(가) 인증서 이름과 일치합니다.` : `호스트 ${hostname.host} 불일치`) : null,
          network ? h('p', { style: { fontWeight: 700, color: onlineRevocationComplete ? 'var(--ok)' : '#d97706' } },
            onlineRevocationComplete ? '각 말단·중간 인증서의 온라인 폐기 상태를 확인했습니다.'
              : '일부 인증서의 온라인 폐기 상태를 확인하지 못했습니다. 아래 요청 결과를 확인하세요.') : null,
          uniqueProblems.length ? h('ul', { class: 'error' }, uniqueProblems.map((problem) => h('li', null, problem))) : null,
          uniqueWarnings.length ? h('ul', { class: 'note' }, uniqueWarnings.map((warning) => h('li', null, warning))) : null,
          h('div', { class: 'btn-row' }, h('button', {
            class: 'btn small', type: 'button',
            onclick: () => download('certificate-chain.pem', ordered.map((record) => record.pem).join('\n') + '\n', 'application/x-pem-file;charset=utf-8'),
          }, '정렬된 체인 다운로드')),
          h('table', { class: 'grid' },
            h('thead', null, h('tr', null,
              ['순서', '역할', '주체', '발급자', '유효기간', '서명', 'CA 제약'].map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', null, rows.map((row, index) => h('tr', null,
              h('td', { 'data-label': '순서' }, String(index + 1)), h('td', { 'data-label': '역할' }, row.role),
              h('td', { class: 'mono', 'data-label': '주체' }, row.record.subject),
              h('td', { class: 'mono', 'data-label': '발급자' }, row.record.issuer),
              h('td', { 'data-label': '유효기간' }, row.period),
              h('td', { 'data-label': '서명' }, row.signature), h('td', { 'data-label': 'CA 제약' }, row.ca))))),
          revocationRows.length ? h('div', null, h('h4', null, '폐기 상태'), kvTable(revocationRows)) : null,
          endpoints.length ? h('div', null, h('h4', null, '인증서에 기록된 네트워크 대상'), kvTable(endpoints))
            : h('p', { class: 'note' }, '인증서에 AIA·OCSP·CRL 네트워크 주소가 없습니다.'),
          networkLog.length ? h('div', null, h('h4', null, '실행한 네트워크 요청'),
            h('table', { class: 'grid' },
              h('thead', null, h('tr', null, ['종류', '주소', '결과'].map((label) => h('th', { scope: 'col' }, label)))),
              h('tbody', null, networkLog.map((entry) => h('tr', null,
                h('td', { 'data-label': '종류' }, entry[0]), h('td', { class: 'mono', 'data-label': '주소' }, entry[1]),
                h('td', { 'data-label': '결과' }, entry[2])))))) : null);
      },
      note: '로컬 검증은 입력을 전송하지 않습니다. “온라인 AIA·OCSP·CRL 확인”을 누르면 결과에 미리 표시된 인증서 내 HTTP(S) 주소로 인증서 식별 정보와 사용자의 IP가 전달될 수 있습니다. 브라우저 CORS 정책으로 요청이 거부될 수 있습니다. 웹 페이지는 운영체제·브라우저 신뢰 저장소에 접근할 수 없으므로 신뢰 앵커를 직접 입력해야 합니다.',
    });
  },
});

tool({
  id: 'asn1-parse', cat: CAT, name: 'ASN.1 Hex 파싱',
  desc: 'ASN.1 DER(Hex 문자열)를 계층 구조로 디코딩합니다.',
  keywords: 'asn1 der parse hex',
  transfer: { inputs: [{ id: 'input', label: 'ASN.1 DER', accepts: ['asn1', 'hex', 'pem'] }] },
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
  transfer: {
    inputs: [{ id: 'input', label: 'PEM 또는 Hex', accepts: ['pem', 'hex', 'asn1'] }],
    outputs: [
      { id: 'pem', label: 'PEM', type: 'pem' },
      { id: 'hex', label: 'DER Hex', type: 'hex' },
    ],
  },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력 (PEM 또는 Hex)', rows: 10, placeholder: '-----BEGIN ...----- 또는 3082...' }],
      options: [{ id: 'label', label: 'PEM 헤더', type: 'text', size: 160, value: 'CERTIFICATE' }],
      actions: [{ id: 'toHex', label: 'PEM → Hex' }, { id: 'toPem', label: 'Hex → PEM' }],
      autorun: false, outputRows: 10,
      transferOutput: {
        id: ({ actionId }) => actionId === 'toPem' ? 'pem' : 'hex',
        when: ({ result }) => !!String(result).trim(),
      },
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
  transfer: {
    inputs: [{ id: 'input', label: 'JWK 또는 PEM', accepts: ['jwk', 'pem'] }],
    outputs: [
      { id: 'pem', label: 'PEM', type: 'pem' },
      { id: 'jwk', label: 'JWK', type: 'jwk' },
    ],
  },
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'JWK(JSON) 또는 PEM', rows: 12, placeholder: '{"kty":"EC","crv":"P-256",...} 또는 -----BEGIN PUBLIC KEY-----' }],
      actions: [{ id: 'toPem', label: 'JWK → PEM' }, { id: 'toJwk', label: 'PEM → JWK' }],
      autorun: false, outputHTML: true,
      transferOutput: {
        id: ({ actionId }) => actionId === 'toPem' ? 'pem' : 'jwk',
        when: ({ result }) => !!result?.querySelector?.('[data-transfer-key]'),
        value: ({ result }) => result.querySelector('[data-transfer-key]')?.textContent || '',
      },
      async process(text, o, action) {
        const trimmed = text.trim();
        if (!trimmed) return '';
        requireFeature('webcrypto', globalThis.crypto?.subtle);

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
            h('h3', null, 'PEM'), h('pre', { class: 'out-html', 'data-transfer-key': true }, pem));
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
          h('h3', null, 'JWK'), h('pre', { class: 'out-html', 'data-transfer-key': true }, JSON.stringify(jwk, null, 2)));
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
  transfer: { inputs: [{ id: 'input', label: 'PEM 개인키', accepts: ['pem'] }] },
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
