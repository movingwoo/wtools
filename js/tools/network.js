// 네트워크
import { tool, makeIO, h, kvTable, loadScript, LIB, copyBtn } from '../core.js';

const CAT = '네트워크';

/* ---------- IPv4 유틸 ---------- */
function ipToInt(ip) {
  const p = ip.trim().split('.').map(Number);
  if (p.length !== 4 || p.some((x) => isNaN(x) || x < 0 || x > 255)) throw new Error('올바른 IPv4 주소가 아닙니다: ' + ip);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

tool({
  id: 'subnet', cat: CAT, name: 'IPv4 서브넷 계산기',
  desc: 'CIDR 표기로 네트워크 주소, 브로드캐스트, 사용 가능 호스트 범위 등을 계산합니다.',
  keywords: 'subnet cidr netmask network broadcast',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'IP/CIDR', rows: 1, value: '192.168.1.130/26' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        const m = text.trim().match(/^(\d+\.\d+\.\d+\.\d+)(?:\/(\d+))?$/);
        if (!m) throw new Error('형식: 192.168.1.0/24');
        const ip = ipToInt(m[1]);
        const prefix = m[2] === undefined ? 24 : +m[2];
        if (prefix < 0 || prefix > 32) throw new Error('프리픽스는 0~32 범위여야 합니다.');
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        const network = (ip & mask) >>> 0;
        const broadcast = (network | (~mask >>> 0)) >>> 0;
        const hostCount = prefix >= 31 ? (prefix === 31 ? 2 : 1) : broadcast - network - 1;
        const firstHost = prefix >= 31 ? network : network + 1;
        const lastHost = prefix >= 31 ? broadcast : broadcast - 1;
        const wildcard = (~mask) >>> 0;
        const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(intToIp(ip));
        return kvTable([
          ['IP 주소', intToIp(ip)],
          ['CIDR 표기', `${intToIp(network)}/${prefix}`],
          ['넷마스크', intToIp(mask)],
          ['와일드카드 마스크', intToIp(wildcard)],
          ['네트워크 주소', intToIp(network)],
          ['브로드캐스트', intToIp(broadcast)],
          ['첫 호스트', intToIp(firstHost)],
          ['마지막 호스트', intToIp(lastHost)],
          ['사용 가능 호스트 수', hostCount.toLocaleString()],
          ['전체 주소 수', (2 ** (32 - prefix)).toLocaleString()],
          ['넷마스크 (2진)', [...Array(4)].map((_, i) => ((mask >>> (24 - i * 8)) & 255).toString(2).padStart(8, '0')).join('.')],
          ['IP 종류', isPrivate ? '사설(Private)' : '공인(Public 추정)'],
        ]);
      },
    });
  },
});

tool({
  id: 'ipv4-convert', cat: CAT, name: 'IPv4 주소 변환기',
  desc: 'IPv4를 10진수, 2진수, 16진수 등으로 변환합니다.',
  keywords: 'ipv4 decimal binary hex integer',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'IPv4 또는 정수', rows: 1, value: '192.168.0.1' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        text = text.trim();
        if (!text) return '';
        let n;
        if (/^\d+$/.test(text) && !text.includes('.')) { n = Number(BigInt(text) & 0xffffffffn); }
        else n = ipToInt(text);
        const oct = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
        return kvTable([
          ['점 표기', intToIp(n)],
          ['정수 (10진)', n >>> 0],
          ['16진수', '0x' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase()],
          ['2진수', oct.map((v) => v.toString(2).padStart(8, '0')).join('.')],
          ['옥텟', oct.join(', ')],
        ]);
      },
    });
  },
});

tool({
  id: 'ip-range', cat: CAT, name: 'IP 대역 ↔ CIDR 변환',
  desc: '시작-끝 IP 범위를 최소 CIDR 블록들로 변환하거나, CIDR을 주소 목록으로 전개합니다.',
  keywords: 'ip range cidr expand list',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 3, value: '192.168.1.10 - 192.168.1.40' }],
      actions: [{ id: 'toCidr', label: '범위 → CIDR' }, { id: 'expand', label: 'CIDR/범위 → 목록' }],
      outputRows: 14,
      process(text, o, action) {
        text = text.trim();
        if (!text) return '';
        let start, end;
        const rangeM = text.match(/^(\d+\.\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+\.\d+)$/);
        const cidrM = text.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
        if (rangeM) { start = ipToInt(rangeM[1]); end = ipToInt(rangeM[2]); }
        else if (cidrM) {
          const base = ipToInt(cidrM[1]); const p = +cidrM[2];
          const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
          start = (base & mask) >>> 0; end = (start | (~mask >>> 0)) >>> 0;
        } else throw new Error('형식: "IP1 - IP2" 또는 "IP/prefix"');
        if (start > end) throw new Error('시작 IP가 끝 IP보다 큽니다.');
        if (action === 'toCidr') {
          const cidrs = [];
          let cur = start;
          while (cur <= end) {
            let maxSize = 32;
            while (maxSize > 0) {
              const m = (0xffffffff << (32 - (maxSize - 1))) >>> 0;
              // 비트 & 결과는 부호 있는 int32이므로 반드시 >>> 0으로 부호 없는 값으로 변환한다.
              if (((cur & m) >>> 0) !== cur || ((cur | (~m >>> 0)) >>> 0) > end) break;
              maxSize--;
            }
            cidrs.push(`${intToIp(cur)}/${maxSize}`);
            const blockMask = maxSize === 0 ? 0 : (0xffffffff << (32 - maxSize)) >>> 0;
            cur = ((cur | (~blockMask >>> 0)) >>> 0) + 1;
            if (cur > 0xffffffff) break;
          }
          return cidrs.join('\n') + `\n\n// ${cidrs.length}개 블록`;
        }
        const count = end - start + 1;
        if (count > 65536) throw new Error(`주소가 ${count.toLocaleString()}개로 너무 많습니다 (최대 65536).`);
        const list = [];
        for (let i = start; i <= end; i++) list.push(intToIp(i));
        return list.join('\n') + `\n\n// ${count}개 주소`;
      },
    });
  },
});

tool({
  id: 'ipv6-ula', cat: CAT, name: 'IPv6 ULA 생성기',
  desc: 'RFC 4193에 따라 고유 로컬 IPv6 주소(ULA) 프리픽스를 생성합니다.',
  keywords: 'ipv6 ula unique local rfc4193',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [{ id: 'subnet', label: '서브넷 ID', type: 'text', size: 80, value: '0001' }],
      actions: [{ id: 'gen', label: '새로 생성' }],
      outputHTML: true,
      process(_, o) {
        const rnd = crypto.getRandomValues(new Uint8Array(5));
        const globalId = [...rnd].map((b) => b.toString(16).padStart(2, '0')).join('');
        const g = globalId;
        const prefix = `fd${g.slice(0, 2)}:${g.slice(2, 6)}:${g.slice(6, 10)}`;
        const subnet = (o.subnet || '0').replace(/[^0-9a-f]/gi, '').padStart(4, '0').slice(0, 4);
        return kvTable([
          ['Global ID (40bit)', globalId],
          ['/48 프리픽스', `${prefix}::/48`],
          ['서브넷 ID', subnet],
          ['/64 프리픽스', `${prefix}:${subnet}::/64`],
          ['예시 주소', `${prefix}:${subnet}::1`],
        ]);
      },
    });
    io.run();
  },
});

tool({
  id: 'mac-format', cat: CAT, name: 'MAC 주소 포맷/생성',
  desc: 'MAC 주소의 구분자 형식을 변환하거나 랜덤 MAC을 생성합니다.',
  keywords: 'mac address format vendor oui random',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'MAC 주소', rows: 1, value: '00:1A:2B:3C:4D:5E' }],
      options: [{ id: 'fmt', label: '출력 형식', type: 'select', values: [['colon', '00:1A:2B (콜론)'], ['hyphen', '00-1A-2B (하이픈)'], ['dot', '001A.2B3C (Cisco)'], ['none', '001A2B (없음)'], ['upper', '대문자 콜론'], ['lower', '소문자 콜론']] }],
      actions: [{ id: 'fmt', label: '변환' }, { id: 'rand', label: '랜덤 생성' }],
      outputHTML: true,
      process(text, o, action) {
        let hex;
        if (action === 'rand') {
          const b = crypto.getRandomValues(new Uint8Array(6));
          b[0] = (b[0] & 0xfe) | 0x02; // 로컬 관리 + 유니캐스트
          hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
        } else {
          hex = text.replace(/[^0-9a-f]/gi, '').toLowerCase();
          if (hex.length !== 12) throw new Error('MAC 주소는 12자리 16진수여야 합니다.');
        }
        const pairs = hex.match(/.{2}/g);
        const formats = {
          colon: pairs.join(':').toUpperCase(),
          hyphen: pairs.join('-').toUpperCase(),
          dot: hex.match(/.{4}/g).join('.'),
          none: hex.toUpperCase(),
          upper: pairs.join(':').toUpperCase(),
          lower: pairs.join(':'),
        };
        const b0 = parseInt(pairs[0], 16);
        return h('div', null,
          kvTable([['선택 형식', formats[o.fmt]]]),
          h('h4', null, '모든 형식'),
          kvTable(Object.entries(formats).map(([k, v]) => [k, v])),
          h('h4', null, '속성'),
          kvTable([
            ['OUI (제조사 식별)', pairs.slice(0, 3).join(':').toUpperCase()],
            ['I/G 비트', (b0 & 1) ? '멀티캐스트' : '유니캐스트'],
            ['U/L 비트', (b0 & 2) ? '로컬 관리(Locally administered)' : '전역 고유(Universally administered)'],
          ]));
      },
    });
  },
});

tool({
  id: 'user-agent', cat: CAT, name: 'User-Agent 파서',
  desc: 'User-Agent 문자열에서 브라우저, OS, 디바이스 정보를 추출합니다.',
  keywords: 'user agent parse browser os device',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'User-Agent', rows: 3, value: navigator.userAgent }],
      outputHTML: true, runOnLoad: true,
      async process(text) {
        if (!text.trim()) return '';
        await loadScript(LIB.uaparser);
        const r = new UAParser(text.trim()).getResult();
        return kvTable([
          ['브라우저', `${r.browser.name || '?'} ${r.browser.version || ''}`],
          ['엔진', `${r.engine.name || '?'} ${r.engine.version || ''}`],
          ['운영체제', `${r.os.name || '?'} ${r.os.version || ''}`],
          ['디바이스', [r.device.vendor, r.device.model, r.device.type].filter(Boolean).join(' ') || '데스크톱(추정)'],
          ['CPU 아키텍처', r.cpu.architecture || '알 수 없음'],
        ]);
      },
    });
  },
});

tool({
  id: 'dns-lookup', cat: CAT, name: 'DNS over HTTPS 조회',
  desc: 'Cloudflare DoH를 통해 도메인의 DNS 레코드를 조회합니다.',
  keywords: 'dns doh lookup a aaaa mx txt cname',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '도메인', rows: 1, value: 'example.com' }],
      options: [{ id: 'type', label: '레코드 타입', type: 'select', values: ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA', 'CAA', 'SRV', 'PTR'] }],
      actions: [{ id: 'lookup', label: '조회' }],
      outputHTML: true, autorun: false,
      async process(text, o) {
        const domain = text.trim();
        if (!domain) return '';
        const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${o.type}`, {
          headers: { accept: 'application/dns-json' },
        });
        if (!res.ok) throw new Error('DNS 조회 실패: HTTP ' + res.status);
        const data = await res.json();
        const RCODE = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN (도메인 없음)', 5: 'REFUSED' };
        const box = h('div', null, h('p', null, '상태: ' + (RCODE[data.Status] || data.Status)));
        if (!data.Answer || !data.Answer.length) {
          box.append(h('p', { class: 'note' }, '응답 레코드가 없습니다.'));
          return box;
        }
        box.append(h('table', { class: 'grid' },
          h('tr', null, ['이름', 'TTL', '값'].map((x) => h('th', null, x))),
          data.Answer.map((a) => h('tr', null,
            h('td', { class: 'mono' }, a.name), h('td', null, a.TTL),
            h('td', { class: 'mono' }, a.data)))));
        return box;
      },
    });
  },
});

tool({
  id: 'extract', cat: CAT, name: '이메일/URL/IP 추출',
  desc: '텍스트에서 이메일, URL, 도메인, IP 주소를 추출합니다.',
  keywords: 'extract email url domain ip regex',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '텍스트', rows: 8, placeholder: '텍스트에 섞인 이메일과 URL을 추출합니다.\nkim@example.com https://test.co.kr 8.8.8.8' }],
      options: [
        { id: 'type', label: '추출 대상', type: 'select', values: [['email', '이메일'], ['url', 'URL'], ['domain', '도메인'], ['ipv4', 'IPv4'], ['ipv6', 'IPv6']] },
        { id: 'unique', label: '중복 제거', type: 'checkbox', value: true },
        { id: 'sort', label: '정렬', type: 'checkbox' },
      ],
      process(text, o) {
        const patterns = {
          email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
          url: /https?:\/\/[^\s<>"'`]+/g,
          domain: /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g,
          ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
          ipv6: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}\b/g,
        };
        let matches = text.match(patterns[o.type]) || [];
        if (o.unique) matches = [...new Set(matches)];
        if (o.sort) matches.sort();
        return matches.join('\n') + (matches.length ? `\n\n// ${matches.length}개` : '결과 없음');
      },
    });
  },
});

/* ---------- 참조표 ---------- */
const HTTP_CODES = {
  '1xx 정보': [[100, 'Continue'], [101, 'Switching Protocols'], [103, 'Early Hints']],
  '2xx 성공': [[200, 'OK'], [201, 'Created'], [202, 'Accepted'], [204, 'No Content'], [206, 'Partial Content']],
  '3xx 리다이렉트': [[301, 'Moved Permanently'], [302, 'Found'], [303, 'See Other'], [304, 'Not Modified'], [307, 'Temporary Redirect'], [308, 'Permanent Redirect']],
  '4xx 클라이언트 오류': [[400, 'Bad Request'], [401, 'Unauthorized'], [403, 'Forbidden'], [404, 'Not Found'], [405, 'Method Not Allowed'], [409, 'Conflict'], [410, 'Gone'], [418, "I'm a teapot"], [422, 'Unprocessable Entity'], [429, 'Too Many Requests']],
  '5xx 서버 오류': [[500, 'Internal Server Error'], [501, 'Not Implemented'], [502, 'Bad Gateway'], [503, 'Service Unavailable'], [504, 'Gateway Timeout']],
};
tool({
  id: 'http-status', cat: CAT, name: 'HTTP 상태 코드 참조',
  desc: 'HTTP 상태 코드 목록과 의미를 검색합니다.',
  keywords: 'http status code reference 404 500',
  render(root) {
    const box = h('div');
    const s = h('input', { type: 'text', placeholder: '검색 (예: 404, redirect, forbidden)', style: { width: '100%', marginBottom: '12px' } });
    function draw() {
      const q = s.value.trim().toLowerCase();
      box.innerHTML = '';
      for (const [cat, codes] of Object.entries(HTTP_CODES)) {
        const rows = codes.filter(([c, n]) => !q || String(c).includes(q) || n.toLowerCase().includes(q) || cat.toLowerCase().includes(q));
        if (!rows.length) continue;
        box.append(h('h4', null, cat), kvTable(rows.map(([c, n]) => [c, n])));
      }
    }
    s.addEventListener('input', draw);
    root.append(s, box);
    draw();
  },
});

const MIME_TYPES = {
  'text/plain': 'txt', 'text/html': 'html', 'text/css': 'css', 'text/csv': 'csv', 'text/markdown': 'md',
  'application/json': 'json', 'application/xml': 'xml', 'application/javascript': 'js', 'application/pdf': 'pdf',
  'application/zip': 'zip', 'application/gzip': 'gz', 'application/x-tar': 'tar', 'application/octet-stream': 'bin',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/x-icon': 'ico',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'font/woff': 'woff', 'font/woff2': 'woff2', 'font/ttf': 'ttf',
};
tool({
  id: 'mime-types', cat: CAT, name: 'MIME 타입 참조',
  desc: 'MIME 타입과 파일 확장자를 상호 검색합니다.',
  keywords: 'mime type content-type extension',
  render(root) {
    const box = h('div');
    const s = h('input', { type: 'text', placeholder: '검색 (예: json, png, video)', style: { width: '100%', marginBottom: '12px' } });
    function draw() {
      const q = s.value.trim().toLowerCase();
      const rows = Object.entries(MIME_TYPES).filter(([m, e]) => !q || m.includes(q) || e.includes(q));
      box.innerHTML = '';
      box.append(kvTable(rows.map(([m, e]) => ['.' + e, m])));
    }
    s.addEventListener('input', draw);
    root.append(s, box);
    draw();
  },
});

tool({
  id: 'keycode', cat: CAT, name: '키코드 뷰어',
  desc: '키보드 키를 누르면 key, code, keyCode 값을 표시합니다.',
  keywords: 'keycode keyboard event key which',
  render(root) {
    const display = h('div', { class: 'big-time', style: { fontSize: '28px' } }, '아무 키나 누르세요');
    const table = h('div');
    const target = h('input', { type: 'text', placeholder: '여기를 클릭한 뒤 키를 누르세요', style: { width: '100%', marginBottom: '12px', textAlign: 'center' } });
    target.addEventListener('keydown', (e) => {
      e.preventDefault();
      display.textContent = e.key === ' ' ? '(Space)' : e.key;
      table.innerHTML = '';
      table.append(kvTable([
        ['event.key', e.key],
        ['event.code', e.code],
        ['event.keyCode', e.keyCode + ' (deprecated)'],
        ['event.which', e.which],
        ['location', ['일반', '왼쪽', '오른쪽', '숫자패드'][e.location] || e.location],
        ['수정키', [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean).join(' + ') || '없음'],
      ]));
    });
    root.append(target, display, table);
    setTimeout(() => target.focus(), 100);
  },
});

tool({
  id: 'device-info', cat: CAT, name: '기기 정보 뷰어',
  desc: '현재 브라우저·화면·시스템 정보를 표시합니다.',
  keywords: 'device screen browser info viewport',
  render(root) {
    const rows = [
      ['User-Agent', navigator.userAgent],
      ['플랫폼', navigator.platform],
      ['언어', navigator.language + ' / ' + (navigator.languages || []).join(', ')],
      ['화면 해상도', `${screen.width} × ${screen.height}`],
      ['가용 화면', `${screen.availWidth} × ${screen.availHeight}`],
      ['뷰포트', `${window.innerWidth} × ${window.innerHeight}`],
      ['픽셀 비율 (DPR)', window.devicePixelRatio],
      ['색 심도', screen.colorDepth + ' bit'],
      ['CPU 논리 코어', navigator.hardwareConcurrency || '알 수 없음'],
      ['기기 메모리', (navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '알 수 없음')],
      ['터치 지원', navigator.maxTouchPoints > 0 ? `예 (${navigator.maxTouchPoints} 포인트)` : '아니오'],
      ['쿠키 사용', navigator.cookieEnabled ? '가능' : '불가'],
      ['온라인 상태', navigator.onLine ? '온라인' : '오프라인'],
      ['시간대', Intl.DateTimeFormat().resolvedOptions().timeZone],
      ['다크 모드', window.matchMedia('(prefers-color-scheme: dark)').matches ? '예' : '아니오'],
    ];
    root.append(kvTable(rows));
  },
});
