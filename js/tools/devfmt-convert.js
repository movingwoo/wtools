// 코드 포맷팅 / 개발 유틸리티 — 변환기
import { tool, makeIO } from '../core.js';
import { parseCSV, toCSV } from './dataformat.js';

const CAT = '코드 포맷팅 / 개발 유틸리티';

function shellTokens(text) {
  const out = [];
  let token = '', quote = '', escaped = false;
  for (const c of text.trim()) {
    if (escaped) { token += c; escaped = false; continue; }
    if (c === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (c === quote) quote = ''; else token += c; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (/\s/.test(c)) { if (token) { out.push(token); token = ''; } }
    else token += c;
  }
  if (quote) throw new Error('닫히지 않은 따옴표가 있습니다.');
  if (escaped) token += '\\';
  if (token) out.push(token);
  return out;
}

function curlToFetch(text) {
  const args = shellTokens(text.replace(/\\\r?\n/g, ' '));
  if (args.shift() !== 'curl') throw new Error('curl 명령으로 시작해야 합니다.');
  let url = '', method = '', body = '', user = '';
  const headers = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['-X', '--request'].includes(a)) method = args[++i] || '';
    else if (['-H', '--header'].includes(a)) {
      const line = args[++i] || '', p = line.indexOf(':');
      if (p < 1) throw new Error('헤더는 "이름: 값" 형식이어야 합니다.');
      headers[line.slice(0, p).trim()] = line.slice(p + 1).trim();
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(a)) body = args[++i] ?? '';
    else if (['-u', '--user'].includes(a)) user = args[++i] || '';
    else if (a === '-I' || a === '--head') method = 'HEAD';
    else if (a === '-L' || a === '--location' || a === '-s' || a === '--silent') continue;
    else if (!a.startsWith('-')) url = a;
    else throw new Error(`아직 지원하지 않는 cURL 옵션입니다: ${a}`);
  }
  if (!url) throw new Error('요청 URL을 찾을 수 없습니다.');
  if (user) headers.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(user)));
  if (!method) method = body ? 'POST' : 'GET';
  const options = { method };
  if (Object.keys(headers).length) options.headers = headers;
  if (body) options.body = body;
  return `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});\n` +
    'if (!response.ok) throw new Error(`HTTP ${response.status}`);\n' +
    'const data = await response.json();';
}

function fetchToCurl(text) {
  const m = text.match(/fetch\s*\(\s*(["'`])([^"'`]+)\1\s*(?:,\s*({[\s\S]*}))?\s*\)/);
  if (!m) throw new Error('fetch(URL, 옵션) 호출을 찾을 수 없습니다. 문자열 URL과 JSON 형태의 옵션을 사용하세요.');
  let opts = {};
  if (m[3]) {
    let raw = m[3].replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"');
    try { opts = JSON.parse(raw); } catch { throw new Error('fetch 옵션은 문자열 키/값으로 된 JSON 형태만 변환할 수 있습니다.'); }
  }
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const parts = ['curl'];
  if (opts.method && opts.method.toUpperCase() !== 'GET') parts.push('-X', opts.method.toUpperCase());
  for (const [k, v] of Object.entries(opts.headers || {})) parts.push('-H', q(`${k}: ${v}`));
  if (opts.body != null) parts.push('--data-raw', q(opts.body));
  parts.push(q(m[2]));
  return parts.join(' ');
}

tool({
  id: 'curl-fetch', cat: CAT, name: 'cURL ↔ fetch 변환기',
  desc: 'cURL 명령과 브라우저 JavaScript fetch 코드를 서로 변환합니다.',
  keywords: 'curl fetch api http request convert 변환 요청',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'cURL 또는 fetch 코드', rows: 10, value: "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' --data-raw '{\"name\":\"홍길동\"}'" }],
      actions: [{ id: 'toFetch', label: 'cURL → fetch' }, { id: 'toCurl', label: 'fetch → cURL' }],
      autorun: false, outputRows: 12,
      process(text, o, action) {
        if (!text.trim()) return '';
        return action === 'toCurl' ? fetchToCurl(text) : curlToFetch(text);
      },
      note: '안전하게 코드를 생성만 하며 실제 네트워크 요청은 보내지 않습니다. 기본 옵션, 헤더, 본문, Basic 인증을 지원합니다.',
    });
  },
});

/* ---------- SQL INSERT ↔ JSON/CSV ---------- */
function sqlIdentifier(text) {
  const part = '(?:[A-Za-z_][A-Za-z0-9_$]*|`[^`]+`|"[^"]+"|\\[[^\\]]+\\])';
  if (!new RegExp(`^${part}(?:\\.${part})*$`).test(text.trim())) throw new Error(`올바르지 않은 테이블명입니다: ${text}`);
  return text.trim();
}
function unquoteSqlIdentifier(text) {
  return text.trim().replace(/^([`"\[])(.*)[`"\]]$/, '$2');
}
function parseSqlLiteral(token) {
  const value = token.trim();
  if (/^null$/i.test(value)) return null;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    if (/^[+-]?\d+$/.test(value) && !Number.isSafeInteger(Number(value))) return value;
    return Number(value);
  }
  if (value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  throw new Error(`지원하지 않는 SQL 값입니다: ${value || '(빈 값)'}`);
}
function parseValueTuples(text) {
  const rows = [];
  let i = 0;
  const skip = () => { while (/\s/.test(text[i] || '')) i++; };
  while (i < text.length) {
    skip();
    if (text[i] === ';') { i++; skip(); break; }
    if (text[i] !== '(') throw new Error('VALUES 뒤에는 괄호로 묶인 값 목록이 필요합니다.');
    i++;
    const row = [];
    let token = '', quoted = false, closed = false;
    while (i < text.length) {
      const c = text[i];
      if (quoted) {
        token += c;
        if (c === "'" && text[i + 1] === "'") { token += text[++i]; }
        else if (c === '\\' && i + 1 < text.length) token += text[++i];
        else if (c === "'") quoted = false;
      } else if (c === "'") { quoted = true; token += c; }
      else if (c === ',') { row.push(parseSqlLiteral(token)); token = ''; }
      else if (c === ')') { row.push(parseSqlLiteral(token)); token = ''; closed = true; i++; break; }
      else token += c;
      i++;
    }
    if (quoted) throw new Error('닫히지 않은 SQL 문자열이 있습니다.');
    if (!closed) throw new Error('닫히지 않은 VALUES 괄호가 있습니다.');
    rows.push(row);
    skip();
    if (text[i] === ',') { i++; continue; }
    if (text[i] === ';') { i++; skip(); break; }
    if (i < text.length) throw new Error('VALUES 뒤의 ON CONFLICT, RETURNING, 서브쿼리 등은 지원하지 않습니다.');
  }
  if (text.slice(i).trim()) throw new Error('한 번에 하나의 INSERT 문만 변환할 수 있습니다.');
  if (!rows.length) throw new Error('VALUES 행을 찾을 수 없습니다.');
  return rows;
}
function parseSqlInsert(text) {
  const m = text.trim().match(/^INSERT\s+INTO\s+(.+?)\s*\(([^()]*)\)\s*VALUES\s*/i);
  if (!m) throw new Error('INSERT INTO 테이블 (컬럼...) VALUES (...) 형식만 지원합니다.');
  const table = sqlIdentifier(m[1]);
  const rawColumns = m[2].split(',').map((x) => x.trim());
  if (rawColumns.some((x) => !/^(?:[A-Za-z_][A-Za-z0-9_$]*|`[^`]+`|"[^"]+"|\[[^\]]+\])$/.test(x)))
    throw new Error('컬럼 목록에 올바르지 않은 식별자가 있습니다.');
  const columns = rawColumns.map(unquoteSqlIdentifier);
  if (!columns.length || columns.some((x) => !x)) throw new Error('컬럼 목록이 비어 있습니다.');
  if (new Set(columns).size !== columns.length) throw new Error('중복된 컬럼명이 있습니다.');
  const rows = parseValueTuples(text.trim().slice(m[0].length));
  rows.forEach((row, i) => {
    if (row.length !== columns.length) throw new Error(`${i + 1}번째 행의 값 개수(${row.length})가 컬럼 개수(${columns.length})와 다릅니다.`);
  });
  return { table, columns, records: rows.map((row) => Object.fromEntries(columns.map((key, i) => [key, row[i]]))) };
}
function recordsFromJson(text) {
  const data = JSON.parse(text);
  const records = Array.isArray(data) ? data : [data];
  if (!records.length || records.some((x) => !x || typeof x !== 'object' || Array.isArray(x)))
    throw new Error('JSON은 객체 또는 객체 배열이어야 합니다.');
  return records;
}
function recordsFromCsv(text) {
  const [columns, ...rows] = parseCSV(text);
  if (!columns?.length || !rows.length) throw new Error('헤더와 데이터 행이 있는 CSV를 입력하세요.');
  if (new Set(columns).size !== columns.length) throw new Error('CSV 헤더에 중복된 컬럼명이 있습니다.');
  return rows.map((row) => Object.fromEntries(columns.map((key, i) => [key, row[i] ?? ''])));
}
function recordsToSql(records, table, dialect) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/.test(table))
    throw new Error('출력 테이블명은 users 또는 public.users 같은 형식으로 입력하세요.');
  const columns = [...new Set(records.flatMap(Object.keys))];
  if (!columns.length) throw new Error('변환할 컬럼이 없습니다.');
  const qid = (name) => {
    if (!name) throw new Error('빈 컬럼명은 사용할 수 없습니다.');
    if (dialect === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
    return '"' + name.replace(/"/g, '""') + '"';
  };
  const literal = (value) => {
    if (value == null) return 'NULL';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('NaN과 Infinity는 SQL 값으로 변환할 수 없습니다.');
      return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'object') value = JSON.stringify(value);
    return "'" + String(value).replace(/'/g, "''") + "'";
  };
  const tableSql = table.split('.').map(qid).join('.');
  const values = records.map((record) => '  (' + columns.map((key) => literal(record[key])).join(', ') + ')').join(',\n');
  return `INSERT INTO ${tableSql} (${columns.map(qid).join(', ')}) VALUES\n${values};`;
}

tool({
  id: 'sql-insert-convert', cat: CAT, name: 'SQL INSERT ↔ JSON/CSV 변환기',
  desc: '다중 행 SQL INSERT의 VALUES 데이터를 JSON·CSV와 상호 변환합니다.',
  keywords: 'sql insert json csv values convert mysql postgresql sqlite 변환',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'SQL INSERT, JSON 또는 CSV', rows: 12, value: "INSERT INTO users (id, name, active) VALUES\n  (1, '홍길동', TRUE),\n  (2, '김서연', FALSE);" }],
      options: [
        { id: 'table', label: '출력 테이블명', type: 'text', value: 'users', size: 140 },
        { id: 'dialect', label: 'SQL 방언', type: 'select', values: [['postgres', 'PostgreSQL'], ['mysql', 'MySQL'], ['sqlite', 'SQLite']] },
      ],
      actions: [
        { id: 'sqlJson', label: 'SQL → JSON' }, { id: 'sqlCsv', label: 'SQL → CSV' },
        { id: 'jsonSql', label: 'JSON → SQL' }, { id: 'csvSql', label: 'CSV → SQL' },
      ],
      autorun: false, outputRows: 14,
      process(text, o, action) {
        if (!text.trim()) return '';
        if (action === 'sqlJson') return JSON.stringify(parseSqlInsert(text).records, null, 2);
        if (action === 'sqlCsv') {
          const { columns, records } = parseSqlInsert(text);
          return toCSV([columns, ...records.map((record) => columns.map((key) => record[key] ?? ''))]);
        }
        const records = action === 'jsonSql' ? recordsFromJson(text) : recordsFromCsv(text);
        return recordsToSql(records, o.table.trim(), o.dialect);
      },
      note: 'INSERT INTO table (columns...) VALUES (...) 형식만 지원합니다. SQL 함수, 서브쿼리, ON CONFLICT, RETURNING 절은 지원하지 않습니다. CSV 값은 문자열로 변환됩니다.',
    });
  },
});

/* ---------- docker run ↔ compose ---------- */
function tokenize(cmd) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}
function dockerRunToCompose(cmd) {
  const tokens = tokenize(cmd.replace(/\\\s*\n/g, ' ').trim());
  if (tokens[0] === 'docker') tokens.shift();
  if (tokens[0] === 'run') tokens.shift();
  const svc = { };
  const take = () => tokens.shift();
  let image = null, command = [];
  const multi = { '-p': 'ports', '--publish': 'ports', '-v': 'volumes', '--volume': 'volumes', '-e': 'environment', '--env': 'environment', '--label': 'labels', '--add-host': 'extra_hosts', '--dns': 'dns', '--cap-add': 'cap_add', '--device': 'devices' };
  const single = { '--name': 'container_name', '--restart': 'restart', '--network': 'network_mode', '--net': 'network_mode', '--hostname': 'hostname', '-h': 'hostname', '--user': 'user', '-u': 'user', '-w': 'working_dir', '--workdir': 'working_dir', '--entrypoint': 'entrypoint', '--memory': 'mem_limit', '-m': 'mem_limit', '--env-file': 'env_file' };
  while (tokens.length) {
    const t = take();
    if (image) { command.push(t); continue; }
    if (t === '-d' || t === '--detach' || t === '--rm' || t === '-it' || t === '-i' || t === '-t' || t === '--init') {
      if (t === '-it' || t === '-i') svc.stdin_open = true;
      if (t === '-it' || t === '-t') svc.tty = true;
      continue;
    }
    if (t === '--privileged') { svc.privileged = true; continue; }
    let key, val;
    if (t.includes('=') && t.startsWith('--')) [key, val] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    else key = t;
    if (multi[key]) { (svc[multi[key]] ??= []).push(val ?? take()); continue; }
    if (single[key]) { svc[single[key]] = val ?? take(); continue; }
    if (t.startsWith('-')) { val ?? (tokens[0] && !tokens[0].startsWith('-') && take()); continue; } // 알 수 없는 옵션은 건너뜀
    image = t;
  }
  if (!image) throw new Error('이미지 이름을 찾지 못했습니다.');
  svc.image = image;
  if (command.length) svc.command = command.join(' ');
  const name = (svc.container_name || image.split('/').pop().split(':')[0]).replace(/[^a-zA-Z0-9_-]/g, '');
  const ordered = { image: svc.image };
  for (const k of ['container_name', 'command', 'entrypoint', 'ports', 'volumes', 'environment', 'env_file', 'restart', 'network_mode', 'hostname', 'user', 'working_dir', 'labels', 'extra_hosts', 'dns', 'cap_add', 'devices', 'mem_limit', 'privileged', 'stdin_open', 'tty'])
    if (svc[k] !== undefined) ordered[k] = svc[k];
  return jsyaml.dump({ services: { [name]: ordered } }, { lineWidth: 120 });
}
function composeToDockerRun(yml) {
  const doc = jsyaml.load(yml);
  const services = doc.services || doc;
  const out = [];
  for (const [name, s] of Object.entries(services)) {
    const parts = ['docker run -d'];
    parts.push('--name ' + (s.container_name || name));
    const q = (v) => /[\s"'$]/.test(String(v)) ? `'${v}'` : v;
    for (const p of s.ports || []) parts.push('-p ' + q(p));
    for (const v of s.volumes || []) parts.push('-v ' + q(v));
    const env = s.environment || [];
    const envList = Array.isArray(env) ? env : Object.entries(env).map(([k, v]) => `${k}=${v}`);
    for (const e of envList) parts.push('-e ' + q(e));
    if (s.restart) parts.push('--restart ' + s.restart);
    if (s.network_mode) parts.push('--network ' + s.network_mode);
    if (s.hostname) parts.push('--hostname ' + s.hostname);
    if (s.user) parts.push('--user ' + s.user);
    if (s.working_dir) parts.push('-w ' + s.working_dir);
    if (s.entrypoint) parts.push('--entrypoint ' + q(s.entrypoint));
    if (s.privileged) parts.push('--privileged');
    parts.push(s.image || '<image>');
    if (s.command) parts.push(Array.isArray(s.command) ? s.command.join(' ') : s.command);
    out.push(parts.join(' \\\n  '));
  }
  return out.join('\n\n');
}

tool({
  id: 'docker-convert', cat: CAT, name: 'docker run ↔ docker-compose 변환',
  desc: 'docker run 명령을 docker-compose.yml로, 또는 그 반대로 변환합니다.',
  keywords: 'docker compose container',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 8, value: 'docker run -d --name web -p 8080:80 -v ./html:/usr/share/nginx/html -e TZ=Asia/Seoul --restart unless-stopped nginx:alpine' }],
      actions: [{ id: 'toCompose', label: 'run → compose' }, { id: 'toRun', label: 'compose → run' }],
      outputRows: 12,
      process(text, o, action) {
        if (!text.trim()) return '';
        return action === 'toRun' ? composeToDockerRun(text) : dockerRunToCompose(text);
      },
    });
  },
});
