// 수학 / 논리 / 랜덤
import { tool, makeIO, h, kvTable } from '../core.js';

const CAT = '수학 / 논리 / 랜덤';

tool({
  id: 'statistics', cat: CAT, name: '산술 / 통계 계산',
  desc: '숫자 목록의 합, 평균, 중앙값, 표준편차 등을 계산합니다.',
  keywords: 'sum average mean median stddev statistics variance',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '숫자 목록 (공백/쉼표/줄바꿈 구분)', rows: 6, value: '12, 7, 3, 9, 15, 8, 22, 4' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        const nums = text.split(/[\s,;]+/).map(Number).filter((n) => !isNaN(n));
        if (!nums.length) return '숫자를 입력하세요.';
        const n = nums.length;
        const sum = nums.reduce((a, b) => a + b, 0);
        const mean = sum / n;
        const sorted = [...nums].sort((a, b) => a - b);
        const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
        const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
        const sampleVar = n > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
        const freq = {};
        nums.forEach((x) => (freq[x] = (freq[x] || 0) + 1));
        const maxFreq = Math.max(...Object.values(freq));
        const modes = Object.entries(freq).filter(([, f]) => f === maxFreq && maxFreq > 1).map(([v]) => v);
        const fix = (x) => +x.toFixed(6);
        return kvTable([
          ['개수 (count)', n],
          ['합계 (sum)', fix(sum)],
          ['평균 (mean)', fix(mean)],
          ['중앙값 (median)', fix(median)],
          ['최빈값 (mode)', modes.length ? modes.join(', ') : '없음'],
          ['최소 (min)', fix(sorted[0])],
          ['최대 (max)', fix(sorted[n - 1])],
          ['범위 (range)', fix(sorted[n - 1] - sorted[0])],
          ['분산 (모집단)', fix(variance)],
          ['표준편차 (모집단)', fix(Math.sqrt(variance))],
          ['표준편차 (표본)', fix(Math.sqrt(sampleVar))],
          ['곱 (product)', fix(nums.reduce((a, b) => a * b, 1))],
        ]);
      },
    });
  },
});

tool({
  id: 'bitwise', cat: CAT, name: '비트 논리 연산',
  desc: 'AND, OR, XOR, NOT, 시프트, 회전 등 비트 연산을 수행합니다.',
  keywords: 'bitwise and or xor not shift rotate',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'a', label: '값 A', rows: 1, value: '0b10110100' },
        { id: 'b', label: '값 B (NOT/시프트는 A만 사용)', rows: 1, value: '0b01101001' },
      ],
      options: [
        { id: 'op', label: '연산', type: 'select', values: [['and', 'A AND B'], ['or', 'A OR B'], ['xor', 'A XOR B'], ['not', 'NOT A'], ['shl', 'A << B'], ['shr', 'A >> B'], ['rol', 'A 회전(왼쪽) B'], ['ror', 'A 회전(오른쪽) B']] },
        { id: 'bits', label: '비트 폭', type: 'select', values: [['8', '8'], ['16', '16'], ['32', '32'], ['64', '64']], value: '32' },
      ],
      outputHTML: true, runOnLoad: true,
      process(v, o) {
        const parse = (s) => {
          s = s.trim().toLowerCase().replace(/_/g, '');
          if (s.startsWith('0b')) return BigInt('0b' + s.slice(2));
          if (s.startsWith('0x')) return BigInt(s);
          if (s.startsWith('0o')) return BigInt(s);
          return BigInt(s);
        };
        const bits = BigInt(o.bits);
        const mask = (1n << bits) - 1n;
        const a = parse(v.a) & mask;
        const b = (v.b.trim() ? parse(v.b) : 0n) & mask;
        let r;
        switch (o.op) {
          case 'and': r = a & b; break;
          case 'or': r = a | b; break;
          case 'xor': r = a ^ b; break;
          case 'not': r = ~a & mask; break;
          case 'shl': r = (a << b) & mask; break;
          case 'shr': r = a >> b; break;
          case 'rol': { const s = b % bits; r = ((a << s) | (a >> (bits - s))) & mask; break; }
          case 'ror': { const s = b % bits; r = ((a >> s) | (a << (bits - s))) & mask; break; }
        }
        const w = Number(bits);
        return kvTable([
          ['결과 (10진)', r.toString()],
          ['결과 (16진)', '0x' + r.toString(16).toUpperCase().padStart(w / 4, '0')],
          ['결과 (2진)', r.toString(2).padStart(w, '0').replace(/(.{4})(?=.)/g, '$1 ')],
          ['결과 (8진)', '0o' + r.toString(8)],
          ['A (2진)', a.toString(2).padStart(w, '0').replace(/(.{4})(?=.)/g, '$1 ')],
          ['B (2진)', b.toString(2).padStart(w, '0').replace(/(.{4})(?=.)/g, '$1 ')],
        ]);
      },
    });
  },
});

/* ---------- 수식 계산기 (안전한 파서) ---------- */
function evalMath(expr) {
  const tokens = expr.match(/\d+\.?\d*(?:[eE][+-]?\d+)?|[a-zA-Z_]\w*|[+\-*/%^(),]|<<|>>/g);
  if (!tokens) throw new Error('빈 수식입니다.');
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const consts = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
  const funcs = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2,
    exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
    factorial: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  };
  function parseExpr() { return parseAddSub(); }
  function parseAddSub() {
    let v = parseMulDiv();
    while (peek() === '+' || peek() === '-') { const op = next(); const r = parseMulDiv(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function parseMulDiv() {
    let v = parseUnary();
    while (['*', '/', '%'].includes(peek())) { const op = next(); const r = parseUnary(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; }
    return v;
  }
  function parseUnary() {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePow();
  }
  function parsePow() {
    const v = parseAtom();
    if (peek() === '^') { next(); return v ** parseUnary(); }
    return v;
  }
  function parseAtom() {
    const t = next();
    if (t === '(') { const v = parseExpr(); if (next() !== ')') throw new Error('괄호가 맞지 않습니다.'); return v; }
    if (/^\d/.test(t)) return parseFloat(t);
    if (t in consts) return consts[t];
    if (t in funcs) {
      if (next() !== '(') throw new Error(`${t} 뒤에 (가 필요합니다.`);
      const args = [parseExpr()];
      while (peek() === ',') { next(); args.push(parseExpr()); }
      if (next() !== ')') throw new Error('괄호가 맞지 않습니다.');
      return funcs[t](...args);
    }
    throw new Error('알 수 없는 토큰: ' + t);
  }
  const result = parseExpr();
  if (pos < tokens.length) throw new Error('수식 끝에 남은 토큰: ' + tokens[pos]);
  return result;
}

tool({
  id: 'math-eval', cat: CAT, name: '수식 계산기',
  desc: '수학 수식을 계산합니다. sin, cos, sqrt, log, pi 등 함수와 상수를 지원합니다.',
  keywords: 'math calculator evaluate expression formula',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '수식', rows: 3, value: 'sqrt(2) * sin(pi/4) + log(1000)' }],
      outputHTML: true, runOnLoad: true,
      process(text) {
        if (!text.trim()) return '';
        const lines = text.split('\n').filter((l) => l.trim());
        const rows = lines.map((line) => {
          try { return [line, String(evalMath(line))]; }
          catch (e) { return [line, '오류: ' + e.message]; }
        });
        return kvTable(rows);
      },
    });
    root.append(h('div', { class: 'note', style: { marginTop: '10px' } },
      '지원 함수: sin, cos, tan, asin, acos, atan, sqrt, cbrt, abs, ln, log, log2, exp, floor, ceil, round, factorial · 상수: pi, e, tau · 연산자: + - * / % ^'));
  },
});

tool({
  id: 'percentage', cat: CAT, name: '퍼센트 계산기',
  desc: '다양한 퍼센트 계산(비율, 증감률 등)을 수행합니다.',
  keywords: 'percent percentage ratio increase decrease',
  render(root) {
    makeIO(root, {
      inputs: null,
      options: [
        { id: 'type', label: '계산', type: 'select', values: [
          ['pOfN', 'X%의 값 (X% of N)'],
          ['isWhat', 'A는 B의 몇 %'],
          ['change', 'A에서 B로 증감률'],
          ['addP', 'N에 X% 더하기'],
          ['subP', 'N에서 X% 빼기'],
        ] },
        { id: 'x', label: '값 1', type: 'number', value: 25, size: 100 },
        { id: 'y', label: '값 2', type: 'number', value: 200, size: 100 },
      ],
      outputHTML: true, runOnLoad: true,
      process(_, o) {
        const x = parseFloat(o.x), y = parseFloat(o.y);
        if (isNaN(x) || isNaN(y)) throw new Error('숫자를 입력하세요.');
        const fix = (v) => +v.toFixed(6);
        let label, result;
        switch (o.type) {
          case 'pOfN': label = `${x}% of ${y}`; result = fix(x / 100 * y); break;
          case 'isWhat': label = `${x}는 ${y}의`; result = fix(x / y * 100) + ' %'; break;
          case 'change': label = `${x} → ${y} 증감률`; result = (y >= x ? '+' : '') + fix((y - x) / x * 100) + ' %'; break;
          case 'addP': label = `${y}에 ${x}% 더하기`; result = fix(y * (1 + x / 100)); break;
          case 'subP': label = `${y}에서 ${x}% 빼기`; result = fix(y * (1 - x / 100)); break;
        }
        return kvTable([[label, result]]);
      },
    });
  },
});

tool({
  id: 'random-number', cat: CAT, name: '랜덤 숫자 생성기',
  desc: '지정 범위에서 랜덤한 정수 또는 실수를 생성합니다.',
  keywords: 'random number generate dice',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'min', label: '최소', type: 'number', value: 1, size: 90 },
        { id: 'max', label: '최대', type: 'number', value: 100, size: 90 },
        { id: 'count', label: '개수', type: 'number', value: 5, size: 80 },
        { id: 'type', label: '유형', type: 'select', values: [['int', '정수'], ['float', '실수']] },
        { id: 'unique', label: '중복 없이', type: 'checkbox' },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      process(_, o) {
        const min = parseFloat(o.min), max = parseFloat(o.max), count = Math.max(1, +o.count);
        if (min > max) throw new Error('최소가 최대보다 큽니다.');
        const rndFloat = () => min + (max - min) * (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
        if (o.unique && o.type === 'int') {
          const range = Math.floor(max) - Math.ceil(min) + 1;
          if (count > range) throw new Error(`중복 없이 ${count}개를 뽑기엔 범위가 좁습니다 (${range}개).`);
          const pool = Array.from({ length: range }, (_, i) => Math.ceil(min) + i);
          for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rndFloat() % 1 * (i + 1)) % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
          return pool.slice(0, count).join('\n');
        }
        const out = [];
        for (let i = 0; i < count; i++) out.push(o.type === 'int' ? Math.floor(rndFloat() % 1 * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min) : +rndFloat().toFixed(6));
        return out.join('\n');
      },
    });
    io.run();
  },
});

/* ---------- UUID / ULID / NanoID ---------- */
function uuidFromBytes(b) {
  const s = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
function uuidV4() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  return uuidFromBytes(b);
}
function uuidV7() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let t = Date.now(); // 앞 48비트가 밀리초 타임스탬프라 생성 순서대로 정렬된다
  for (let i = 5; i >= 0; i--) { b[i] = t & 0xff; t = Math.floor(t / 256); }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return uuidFromBytes(b);
}
const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid() {
  let t = Date.now(), time = '';
  for (let i = 0; i < 10; i++) { time = CROCKFORD32[t % 32] + time; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16));
  return time + [...r].map((x) => CROCKFORD32[x & 31]).join('');
}
const NANO_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
function nanoid(size) {
  const r = crypto.getRandomValues(new Uint8Array(size));
  return [...r].map((x) => NANO_ALPHABET[x & 63]).join('');
}

tool({
  id: 'uuid-generate', cat: CAT, name: 'UUID / ULID / NanoID 생성기',
  desc: 'UUID v4/v7, ULID, NanoID 등 고유 식별자를 생성합니다.',
  keywords: 'uuid guid ulid nanoid unique id generate random v4 v7',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'type', label: '종류', type: 'select', values: [['v4', 'UUID v4 (랜덤)'], ['v7', 'UUID v7 (시간 정렬)'], ['ulid', 'ULID'], ['nano', 'NanoID'], ['nil', 'NIL UUID']] },
        { id: 'count', label: '개수', type: 'number', value: 5, size: 80 },
        { id: 'len', label: 'NanoID 길이', type: 'number', value: 21, size: 80 },
        { id: 'upper', label: '대문자', type: 'checkbox' },
        { id: 'nodash', label: '하이픈 제거', type: 'checkbox' },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      outputRows: 10,
      note: 'UUID v7과 ULID는 앞부분이 생성 시각이라 DB 인덱스 친화적으로 정렬됩니다.',
      process(_, o) {
        const n = Math.min(1000, Math.max(1, Math.floor(+o.count) || 1));
        const gen = {
          v4: uuidV4, v7: uuidV7, ulid,
          nano: () => nanoid(Math.min(128, Math.max(2, Math.floor(+o.len) || 21))),
          nil: () => '00000000-0000-0000-0000-000000000000',
        }[o.type];
        let out = Array.from({ length: n }, gen);
        if (o.nodash) out = out.map((s) => s.replace(/-/g, ''));
        if (o.upper) out = out.map((s) => s.toUpperCase());
        return out.join('\n');
      },
    });
    io.run();
  },
});

tool({
  id: 'random-port', cat: CAT, name: '랜덤 포트 생성기',
  desc: '사용 가능한 범위(1024~65535)에서 랜덤 포트 번호를 생성합니다.',
  keywords: 'random port tcp udp',
  render(root) {
    const io = makeIO(root, {
      inputs: null,
      options: [
        { id: 'range', label: '범위', type: 'select', values: [['user', '등록 포트 (1024~49151)'], ['dynamic', '동적 포트 (49152~65535)'], ['all', '전체 비특권 (1024~65535)']] },
        { id: 'count', label: '개수', type: 'number', value: 5, size: 80 },
      ],
      actions: [{ id: 'gen', label: '생성' }],
      process(_, o) {
        const ranges = { user: [1024, 49151], dynamic: [49152, 65535], all: [1024, 65535] };
        const [lo, hi] = ranges[o.range];
        const out = [];
        for (let i = 0; i < Math.max(1, +o.count); i++)
          out.push(lo + (crypto.getRandomValues(new Uint32Array(1))[0] % (hi - lo + 1)));
        return out.join('\n');
      },
    });
    io.run();
  },
});
