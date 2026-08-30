// YAML 1.2 parser and serializer for W-Tools.
// The implementation is DOM-independent and intentionally accepts only safe, data-oriented tags.

export const YAML_LIMITS = Object.freeze({
  inputLength: 32 * 1024 * 1024,
  outputLength: 64 * 1024 * 1024,
  depth: 100,
  nodes: 500_000,
  aliases: 10_000,
  anchors: 10_000,
  mergeKeys: 1_000,
  scalarLength: 16 * 1024 * 1024,
});

const CORE_TAG_PREFIX = 'tag:yaml.org,2002:';
const KNOWN_TAGS = new Set([
  'str', 'seq', 'map', 'null', 'bool', 'int', 'float', 'timestamp', 'binary',
  'omap', 'pairs', 'set', 'merge',
]);
const MISSING = Symbol('missing');
const OUT_OF_RANGE = Symbol('out-of-range');
const INVALID_YAML_CHARACTER = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x84\x86-\x9f\ud800-\udfff\ufffe\uffff]/u;
const INVALID_UNICODE_SCALAR = /[\ud800-\udfff]/u;

export class YAMLParseError extends Error {
  constructor(message, line = 0, column = 0, code = 'YAML_SYNTAX') {
    const location = line ? ` (${line}행${column ? ` ${column}열` : ''})` : '';
    super(`YAML 구문 오류: ${message}${location}`);
    this.name = 'YAMLParseError';
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

function parseError(message, line, column = 0, code) {
  throw new YAMLParseError(message, line, column, code);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function setKey(object, key, value) {
  Object.defineProperty(object, String(key), {
    value, enumerable: true, configurable: true, writable: true,
  });
}

function countIndent(raw, line) {
  let indent = 0;
  while (raw[indent] === ' ') indent++;
  if (raw[indent] === '\t') parseError('들여쓰기에 탭을 사용할 수 없습니다.', line, indent + 1);
  return indent;
}

function isBlank(raw) {
  return /^\s*(?:#.*)?$/.test(raw);
}

function stripComment(text) {
  let quote = '', escaped = false, square = 0, curly = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quote = '';
      continue;
    }
    if (quote === "'") {
      if (char === "'" && text[index + 1] === "'") index++;
      else if (char === "'") quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') square++;
    else if (char === ']') square--;
    else if (char === '{') curly++;
    else if (char === '}') curly--;
    else if (char === '#' && !square && !curly && (index === 0 || /\s/.test(text[index - 1])))
      return text.slice(0, index).trimEnd();
  }
  return text.trimEnd();
}

function mappingColon(text) {
  let quote = '', escaped = false, square = 0, curly = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quote = '';
      continue;
    }
    if (quote === "'") {
      if (char === "'" && text[index + 1] === "'") index++;
      else if (char === "'") quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[') square++;
    else if (char === ']') square--;
    else if (char === '{') curly++;
    else if (char === '}') curly--;
    else if (char === ':' && !square && !curly && (index + 1 === text.length || /[\s#]/.test(text[index + 1])))
      return index;
  }
  return -1;
}

function parseInteger(raw) {
  let integer;
  try {
    if (/^[+-]?[0-9]+$/.test(raw)) {
      if (raw.replace(/^[+-]/, '').length > 16) return OUT_OF_RANGE;
      integer = BigInt(raw);
    } else if (/^0o[0-7]+$/.test(raw)) {
      if (raw.length - 2 > 18) return OUT_OF_RANGE;
      integer = BigInt(raw);
    } else if (/^0x[0-9a-fA-F]+$/.test(raw)) {
      if (raw.length - 2 > 14) return OUT_OF_RANGE;
      integer = BigInt(raw);
    } else return MISSING;
  } catch {
    return MISSING;
  }
  if (integer < BigInt(Number.MIN_SAFE_INTEGER) || integer > BigInt(Number.MAX_SAFE_INTEGER))
    return OUT_OF_RANGE;
  return Number(integer);
}

function parseFloatValue(raw) {
  if (/^(?:\+?\.inf|\+?\.Inf|\+?\.INF)$/.test(raw)) return Infinity;
  if (/^(?:-\.inf|-\.Inf|-\.INF)$/.test(raw)) return -Infinity;
  if (/^(?:\.nan|\.NaN|\.NAN)$/.test(raw)) return NaN;
  if (!/^[+-]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][+-]?[0-9]+)?$/.test(raw))
    return MISSING;
  const number = Number(raw);
  return Number.isFinite(number) ? number : OUT_OF_RANGE;
}

function parseTimestamp(raw) {
  const match = /^(\d{4})-(\d\d?)-(\d\d?)(?:(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.(\d*))?(?:[ \t]*(Z|([+-])(\d\d?)(?::?(\d\d))?))?)?$/.exec(raw);
  if (!match) return MISSING;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone, sign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText || 0), minute = Number(minuteText || 0), second = Number(secondText || 0);
  const offsetHour = Number(offsetHourText || 0), offsetMinute = Number(offsetMinuteText || 0);
  const monthEnd = new Date(0);
  monthEnd.setUTCFullYear(year, month, 0);
  monthEnd.setUTCHours(0, 0, 0, 0);
  const days = monthEnd.getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59
      || offsetHour > 23 || offsetMinute > 59) return MISSING;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number((fraction + '000').slice(0, 3)));
  if (zone && zone !== 'Z') {
    const offset = (offsetHour * 60 + offsetMinute) * (sign === '-' ? -1 : 1);
    date.setTime(date.getTime() - offset * 60_000);
  }
  return date;
}

function resolveImplicit(raw, line = 0) {
  if (/^(?:~|null|Null|NULL)$/.test(raw)) return null;
  if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(raw)) return raw[0].toLowerCase() === 't';
  const integer = parseInteger(raw);
  if (integer === OUT_OF_RANGE)
    parseError('JavaScript에서 안전하게 표현할 수 없는 정수입니다. 따옴표로 감싸 문자열로 처리하세요.', line, 0, 'YAML_INTEGER_RANGE');
  if (integer !== MISSING) return integer;
  const float = parseFloatValue(raw);
  if (float === OUT_OF_RANGE)
    parseError('JavaScript에서 유한한 값으로 표현할 수 없는 숫자입니다.', line, 0, 'YAML_FLOAT_RANGE');
  if (float !== MISSING) return float;
  return raw;
}

function decodeBase64(raw, line) {
  const compact = raw.replace(/\s/g, '');
  if (!compact || compact.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(compact)
      || /=/.test(compact.slice(0, -2)) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact))
    parseError('!!binary 값이 올바른 Base64가 아닙니다.', line);
  const binary = atob(compact);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizeTag(tag, handles, line) {
  if (!tag || tag === '!') return '';
  let expanded = tag;
  if (tag.startsWith('!!')) expanded = CORE_TAG_PREFIX + tag.slice(2);
  else if (tag.startsWith('!<') && tag.endsWith('>')) expanded = tag.slice(2, -1);
  else if (tag.startsWith('!')) {
    const marker = tag.indexOf('!', 1);
    if (marker >= 0) {
      const handle = tag.slice(0, marker + 1);
      if (!handles.has(handle)) parseError(`선언되지 않은 태그 핀들 ${handle}입니다.`, line);
      expanded = handles.get(handle) + tag.slice(marker + 1);
    }
  }
  if (!expanded.startsWith(CORE_TAG_PREFIX))
    parseError(`안전한 데이터 태그만 지원합니다: ${tag}`, line, 0, 'YAML_UNSAFE_TAG');
  const name = expanded.slice(CORE_TAG_PREFIX.length);
  if (!KNOWN_TAGS.has(name)) parseError(`지원하지 않는 YAML 태그입니다: ${tag}`, line, 0, 'YAML_TAG');
  return name;
}

function applyTag(value, tag, raw, quoted, line) {
  if (!tag) return quoted ? raw : value;
  switch (tag) {
    case 'str': return raw == null ? String(value ?? '') : raw;
    case 'null':
      if (raw == null || /^(?:~|null|Null|NULL)$/.test(raw)) return null;
      parseError('!!null 값의 형식이 올바르지 않습니다.', line);
      break;
    case 'bool': {
      if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(raw)) return raw[0].toLowerCase() === 't';
      parseError('!!bool 값은 true 또는 false여야 합니다.', line);
      break;
    }
    case 'int': {
      const parsed = parseInteger(raw);
      if (parsed === OUT_OF_RANGE)
        parseError('JavaScript에서 안전하게 표현할 수 없는 !!int 값입니다.', line, 0, 'YAML_INTEGER_RANGE');
      if (parsed !== MISSING) return parsed;
      parseError('!!int 값의 정수 형식이 올바르지 않습니다.', line);
      break;
    }
    case 'float': {
      const parsed = parseFloatValue(raw);
      if (parsed === OUT_OF_RANGE)
        parseError('JavaScript에서 유한한 값으로 표현할 수 없는 !!float 값입니다.', line, 0, 'YAML_FLOAT_RANGE');
      if (parsed !== MISSING) return parsed;
      const integer = parseInteger(raw);
      if (integer === OUT_OF_RANGE)
        parseError('JavaScript에서 안전하게 표현할 수 없는 !!float 값입니다.', line, 0, 'YAML_FLOAT_RANGE');
      if (integer !== MISSING) return Number(integer);
      parseError('!!float 값의 숫자 형식이 올바르지 않습니다.', line);
      break;
    }
    case 'timestamp': {
      const parsed = parseTimestamp(raw);
      if (parsed !== MISSING) return parsed;
      parseError('!!timestamp 값의 날짜·시간 형식이 올바르지 않습니다.', line);
      break;
    }
    case 'binary': return decodeBase64(String(raw ?? value), line);
    case 'seq':
      if (Array.isArray(value)) return value;
      parseError('!!seq 태그는 배열에만 사용할 수 있습니다.', line);
      break;
    case 'map':
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      parseError('!!map 태그는 객체에만 사용할 수 있습니다.', line);
      break;
    case 'omap': case 'pairs':
      if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== 'object'
        || Array.isArray(entry) || Object.keys(entry).length !== 1))
        parseError(`!!${tag} 태그는 키 하나를 가진 객체 배열이어야 합니다.`, line);
      return value;
    case 'set':
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.values(value).some((entry) => entry !== null))
        parseError('!!set 태그의 모든 값은 비어 있어야 합니다.', line);
      return value;
    case 'merge': return value;
  }
  return value;
}

class InlineParser {
  constructor(owner, text, line) {
    this.owner = owner;
    this.text = text;
    this.line = line;
    this.pos = 0;
    this.lastNodeMeta = null;
  }

  error(message, offset = 0) {
    parseError(message, this.line, this.pos + offset + 1);
  }

  scalar(value) {
    if (value.length > this.owner.limits.scalarLength)
      parseError(`스칼라는 최대 ${this.owner.limits.scalarLength.toLocaleString()}자까지 허용됩니다.`,
        this.line, this.pos + 1, 'YAML_SCALAR_LIMIT');
    return value;
  }

  skipSpace(comments = false) {
    for (;;) {
      while (/\s/.test(this.text[this.pos] || '')) this.pos++;
      if (!comments || this.text[this.pos] !== '#') return;
      while (this.pos < this.text.length && this.text[this.pos] !== '\n') this.pos++;
    }
  }

  properties() {
    let anchor = '', tag = '';
    for (;;) {
      this.skipSpace();
      const start = this.pos;
      if (this.text[this.pos] === '&') {
        this.pos++;
        const match = /^[^\s,\[\]{}]+/.exec(this.text.slice(this.pos));
        if (!match) this.error('앵커 이름이 비어 있습니다.');
        anchor = match[0];
        this.pos += match[0].length;
      } else if (this.text.startsWith('!<', this.pos)) {
        const end = this.text.indexOf('>', this.pos + 2);
        if (end < 0) this.error('verbatim 태그의 >가 닫히지 않았습니다.');
        tag = this.text.slice(this.pos, end + 1);
        this.pos = end + 1;
      } else if (this.text[this.pos] === '!') {
        const match = /^!+[^\s,\[\]{}]*/.exec(this.text.slice(this.pos));
        tag = match[0];
        this.pos += match[0].length;
      } else {
        this.pos = start;
        break;
      }
      if (this.pos === start) break;
    }
    return { anchor, tag: normalizeTag(tag, this.owner.handles, this.line) };
  }

  parse(stopColon = false, depth = 0) {
    this.owner.node(depth, this.line);
    const { anchor, tag } = this.properties();
    this.skipSpace();
    let value, raw = null, quoted = false;
    const char = this.text[this.pos];
    let placeholder = null;
    if (anchor && (char === '[' || char === '{')) {
      placeholder = char === '[' ? [] : {};
      this.owner.anchor(anchor, placeholder, this.line);
    }
    if (char === '*') {
      if (anchor || tag) this.error('별칭에는 태그나 앵커를 함께 지정할 수 없습니다.');
      this.pos++;
      const match = /^[^\s,\[\]{}]+/.exec(this.text.slice(this.pos));
      if (!match) this.error('별칭 이름이 비어 있습니다.');
      this.pos += match[0].length;
      value = this.owner.alias(match[0], this.line);
    } else if (char === '[') value = this.sequence(depth + 1);
    else if (char === '{') value = this.mapping(depth + 1);
    else if (char === "'") {
      raw = this.singleQuoted();
      quoted = true;
      value = raw;
    } else if (char === '"') {
      raw = this.doubleQuoted();
      quoted = true;
      value = raw;
    } else {
      const next = this.text[this.pos + 1];
      if ((/[-?:]/.test(char || '') && (!next || /[\s,\]}]/.test(next))) || /[@`]/.test(char || ''))
        this.error(`plain 스칼라는 ${JSON.stringify(char)} 문자로 시작할 수 없습니다.`);
      raw = this.plain(stopColon);
      if (!raw && tag !== 'str') value = null;
      else value = resolveImplicit(raw, this.line);
    }
    value = applyTag(value, tag, raw, quoted, this.line);
    if (placeholder) {
      if (Array.isArray(placeholder)) placeholder.push(...value);
      else for (const [key, item] of Object.entries(value)) setKey(placeholder, key, item);
      value = placeholder;
    } else if (anchor) this.owner.anchor(anchor, value, this.line);
    this.lastNodeMeta = { tag, quoted, raw };
    return value;
  }

  plain(stopColon) {
    const start = this.pos;
    let end = this.pos;
    for (; this.pos < this.text.length; this.pos++) {
      const char = this.text[this.pos];
      if (char === ',' || char === ']' || char === '}') break;
      if (stopColon && char === ':') break;
      if (stopColon && char === '\n') this.error('암시적 flow 객체 키는 한 줄로 작성해야 합니다.');
      if (!stopColon && char === ':'
          && (this.pos + 1 === this.text.length || /[\s,\]}]/.test(this.text[this.pos + 1]))) break;
      if (char === '#' && (this.pos === start || /\s/.test(this.text[this.pos - 1]))) break;
      end = this.pos + 1;
    }
    const raw = this.text.slice(start, end).trim();
    if (raw.length > this.owner.limits.scalarLength)
      parseError(`스칼라는 최대 ${this.owner.limits.scalarLength.toLocaleString()}자까지 허용됩니다.`,
        this.line, start + 1, 'YAML_SCALAR_LIMIT');
    return raw;
  }

  singleQuoted() {
    this.pos++;
    let result = '';
    while (this.pos < this.text.length) {
      const char = this.text[this.pos++];
      if (char !== "'") { result += char === '\n' ? ' ' : char; continue; }
      if (this.text[this.pos] === "'") { result += "'"; this.pos++; continue; }
      return this.scalar(result);
    }
    this.error('작은따옴표 문자열이 닫히지 않았습니다.');
  }

  doubleQuoted() {
    this.pos++;
    let result = '';
    const escapes = {
      '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r',
      e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0',
      L: '\u2028', P: '\u2029', '\n': '',
    };
    while (this.pos < this.text.length) {
      const char = this.text[this.pos++];
      if (char === '"') return this.scalar(result);
      if (char === '\n') { result += ' '; continue; }
      if (char !== '\\') { result += char; continue; }
      const escape = this.text[this.pos++];
      if (escape in escapes) { result += escapes[escape]; continue; }
      const widths = { x: 2, u: 4, U: 8 };
      const width = widths[escape];
      if (!width) this.error(`지원하지 않는 이스케이프 \\${escape}입니다.`, -1);
      const hex = this.text.slice(this.pos, this.pos + width);
      if (hex.length !== width || !/^[\da-f]+$/i.test(hex)) this.error('Unicode 이스케이프가 올바르지 않습니다.');
      const point = parseInt(hex, 16);
      if (point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) this.error('Unicode 코드 포인트가 올바르지 않습니다.');
      result += String.fromCodePoint(point);
      this.pos += width;
    }
    this.error('큰따옴표 문자열이 닫히지 않았습니다.');
  }

  sequence(depth) {
    this.pos++;
    const result = [];
    this.skipSpace(true);
    if (this.text[this.pos] === ']') { this.pos++; return result; }
    for (;;) {
      this.skipSpace(true);
      if (this.text[this.pos] === ',') this.error('flow 배열에는 빈 항목을 사용할 수 없습니다.');
      if (this.flowPairAhead()) {
        const mapping = {};
        const key = this.parse(true, depth);
        const keyMeta = this.lastNodeMeta;
        this.skipSpace(true);
        this.pos++;
        this.skipSpace(true);
        const value = this.text[this.pos] === ',' || this.text[this.pos] === '}'
          ? null : this.parse(false, depth);
        this.owner.mapEntry(mapping, String(key), value, this.line, this.owner.isMergeKey(keyMeta));
        result.push(mapping);
      } else result.push(this.parse(false, depth));
      this.skipSpace(true);
      if (this.text[this.pos] === ']') { this.pos++; return result; }
      if (this.text[this.pos] !== ',') this.error('flow 배열 항목 사이에는 쉼표가 필요합니다.');
      this.pos++;
      this.skipSpace(true);
      if (this.text[this.pos] === ']') { this.pos++; return result; }
    }
  }

  flowPairAhead() {
    let quote = '', escaped = false, square = 0, curly = 0;
    for (let index = this.pos; index < this.text.length; index++) {
      const char = this.text[index];
      if (quote === '"') {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quote = '';
      } else if (quote === "'") {
        if (char === "'" && this.text[index + 1] === "'") index++;
        else if (char === "'") quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '[') square++;
      else if (char === '{') curly++;
      else if (char === ']' && !square && !curly || char === ',' && !square && !curly) return false;
      else if (char === ']') square--;
      else if (char === '}') curly--;
      else if (char === ':' && !square && !curly
        && (index + 1 === this.text.length || /[\s,\]}]/.test(this.text[index + 1]))) return true;
    }
    return false;
  }

  mapping(depth) {
    this.pos++;
    const result = {};
    this.skipSpace(true);
    if (this.text[this.pos] === '}') { this.pos++; return result; }
    for (;;) {
      this.skipSpace(true);
      const key = this.parse(true, depth);
      const keyMeta = this.lastNodeMeta;
      this.skipSpace(true);
      if (this.text[this.pos] !== ':') this.error('flow 객체 키 뒤에 :가 필요합니다.');
      this.pos++;
      this.skipSpace(true);
      const value = this.text[this.pos] === ',' || this.text[this.pos] === '}'
        ? null : this.parse(false, depth);
      this.owner.mapEntry(result, String(key), value, this.line, this.owner.isMergeKey(keyMeta));
      this.skipSpace(true);
      if (this.text[this.pos] === '}') { this.pos++; return result; }
      if (this.text[this.pos] !== ',') this.error('flow 객체 항목 사이에는 쉼표가 필요합니다.');
      this.pos++;
      this.skipSpace(true);
      if (this.text[this.pos] === '}') { this.pos++; return result; }
    }
  }
}

class DocumentParser {
  constructor(lines, options, handles) {
    this.lines = lines;
    this.idx = 0;
    this.anchors = new Map();
    this.handles = handles;
    this.limits = { ...YAML_LIMITS, ...(options.limits || {}) };
    this.nodeCount = 0;
    this.aliasCount = 0;
    this.anchorCount = 0;
    this.mergeCount = 0;
    this.mergedKeys = new WeakMap();
    this.json = !!options.json;
  }

  node(depth, line) {
    if (depth > this.limits.depth)
      parseError(`중첩은 최대 ${this.limits.depth}단계까지 허용됩니다.`, line, 0, 'YAML_DEPTH');
    if (++this.nodeCount > this.limits.nodes)
      parseError(`노드는 최대 ${this.limits.nodes.toLocaleString()}개까지 허용됩니다.`, line, 0, 'YAML_NODES');
  }

  anchor(name, value, line) {
    if (++this.anchorCount > this.limits.anchors)
      parseError(`앵커는 최대 ${this.limits.anchors.toLocaleString()}개까지 허용됩니다.`, line, 0, 'YAML_ANCHORS');
    this.anchors.set(name, value);
  }

  alias(name, line) {
    if (++this.aliasCount > this.limits.aliases)
      parseError(`별칭 참조는 최대 ${this.limits.aliases.toLocaleString()}개까지 허용됩니다.`, line, 0, 'YAML_ALIASES');
    if (!this.anchors.has(name)) parseError(`정의되지 않은 별칭 *${name}입니다.`, line);
    return this.anchors.get(name);
  }

  isMergeKey(meta) {
    return meta?.tag === 'merge' || !meta?.tag && !meta?.quoted && meta?.raw === '<<';
  }

  mapEntry(target, key, value, line, merge = false) {
    if (merge) {
      const sources = Array.isArray(value) ? value : [value];
      if (sources.some((source) => !source || typeof source !== 'object' || Array.isArray(source)))
        parseError('merge 키의 값은 객체 또는 객체 배열이어야 합니다.', line);
      for (const source of sources) {
        for (const [sourceKey, sourceValue] of Object.entries(source)) {
          if (++this.mergeCount > this.limits.mergeKeys)
            parseError(`merge로 펼칠 키가 maxTotalMergeKeys(${this.limits.mergeKeys}) 한도를 넘습니다.`, line, 0, 'YAML_MERGE_LIMIT');
          if (!own(target, sourceKey)) {
            setKey(target, sourceKey, sourceValue);
            let merged = this.mergedKeys.get(target);
            if (!merged) { merged = new Set(); this.mergedKeys.set(target, merged); }
            merged.add(sourceKey);
          }
        }
      }
      return;
    }
    const merged = this.mergedKeys.get(target);
    if (own(target, key) && !merged?.has(key) && !this.json)
      parseError(`키 ${JSON.stringify(key)}가 중복되었습니다.`, line);
    setKey(target, key, value);
    merged?.delete(key);
  }

  skipEmpty() {
    while (this.idx < this.lines.length && isBlank(this.lines[this.idx].raw)) this.idx++;
  }

  nextIndent() {
    this.skipEmpty();
    return this.idx < this.lines.length
      ? countIndent(this.lines[this.idx].raw, this.lines[this.idx].number) : -1;
  }

  parse() {
    this.skipEmpty();
    if (this.idx >= this.lines.length) return undefined;
    const indent = countIndent(this.lines[this.idx].raw, this.lines[this.idx].number);
    const value = this.block(indent, 0);
    this.skipEmpty();
    if (this.idx < this.lines.length) {
      const line = this.lines[this.idx];
      parseError('한 문서 안에 최상위 값이 둘 이상 있습니다.', line.number, countIndent(line.raw, line.number) + 1);
    }
    return value;
  }

  block(indent, depth) {
    this.node(depth, this.lines[this.idx]?.number || 0);
    this.skipEmpty();
    const line = this.lines[this.idx];
    if (!line) return null;
    const actual = countIndent(line.raw, line.number);
    if (actual < indent) return MISSING;
    if (actual > indent) parseError('예상하지 않은 들여쓰기입니다.', line.number, actual + 1);
    const content = line.raw.slice(indent);
    if (/^-(?:\s|$)/.test(content)) return this.sequence(indent, depth + 1);
    if (mappingColon(content) >= 0 || /^\?(?:\s|$)/.test(content))
      return this.mapping(indent, depth + 1);
    this.idx++;
    return this.value(content, indent, depth + 1, line.number, true);
  }

  sequence(indent, depth, first = null) {
    const result = [];
    let pending = first;
    for (;;) {
      this.skipEmpty();
      let line, rest;
      if (pending) {
        ({ line, rest } = pending);
        pending = null;
      } else {
        line = this.lines[this.idx];
        if (!line) break;
        const actual = countIndent(line.raw, line.number);
        const content = line.raw.slice(actual);
        if (actual !== indent || !/^-(?:\s|$)/.test(content)) break;
        this.idx++;
        rest = content.slice(1).replace(/^ /, '');
      }
      this.node(depth, line.number);
      const clean = stripComment(rest);
      if (!clean.trim()) {
        const childIndent = this.nextIndent();
        result.push(childIndent > indent ? this.block(childIndent, depth + 1) : null);
        continue;
      }
      if (/^-(?:\s|$)/.test(clean)) {
        result.push(this.sequence(indent + 2, depth + 1, {
          line, rest: clean.slice(1).replace(/^ /, ''),
        }));
        continue;
      }
      if (mappingColon(clean) >= 0 || /^\?(?:\s|$)/.test(clean)) {
        result.push(this.mapping(indent + 2, depth + 1, { line, content: clean }));
        continue;
      }
      result.push(this.value(clean, indent, depth + 1, line.number));
    }
    return result;
  }

  mapping(indent, depth, first = null) {
    const result = {};
    let pending = first;
    for (;;) {
      this.skipEmpty();
      let line, content;
      if (pending) {
        ({ line, content } = pending);
        pending = null;
      } else {
        line = this.lines[this.idx];
        if (!line) break;
        const actual = countIndent(line.raw, line.number);
        if (actual !== indent) break;
        content = line.raw.slice(indent);
        if (/^-(?:\s|$)/.test(content)) break;
        this.idx++;
      }
      this.node(depth, line.number);
      content = stripComment(content);
      if (!content.trim()) continue;
      if (/^\?(?:\s|$)/.test(content)) {
        const keyText = content.slice(1).trim();
        const keyNode = keyText ? this.inlineNode(keyText, line.number, true) : null;
        const key = keyNode ? keyNode.value : this.nested(indent, depth + 1, line.number);
        this.skipEmpty();
        const valueLine = this.lines[this.idx];
        if (!valueLine || countIndent(valueLine.raw, valueLine.number) !== indent
          || !/^:(?:\s|$)/.test(valueLine.raw.slice(indent)))
          parseError('명시적 키 뒤에 : 값이 필요합니다.', line.number);
        this.idx++;
        const rest = stripComment(valueLine.raw.slice(indent + 1).replace(/^ /, ''));
        const value = rest.trim() ? this.value(rest, indent, depth + 1, valueLine.number)
          : this.nested(indent, depth + 1, valueLine.number);
        this.mapEntry(result, this.keyString(key, line.number), value, line.number,
          this.isMergeKey(keyNode?.meta));
        continue;
      }
      const colon = mappingColon(content);
      if (colon < 0) {
        this.idx--;
        break;
      }
      const keyText = content.slice(0, colon).trim();
      if (!keyText) parseError('객체 키가 비어 있습니다.', line.number, indent + 1);
      const keyNode = this.inlineNode(keyText, line.number, true);
      const key = keyNode.value;
      const rest = content.slice(colon + 1).replace(/^ /, '');
      const value = stripComment(rest).trim()
        ? this.value(rest, indent, depth + 1, line.number)
        : this.nested(indent, depth + 1, line.number);
      this.mapEntry(result, this.keyString(key, line.number), value, line.number,
        this.isMergeKey(keyNode.meta));
    }
    return result;
  }

  keyString(key, line) {
    if (key === null) return 'null';
    if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') return String(key);
    try { return JSON.stringify(key); }
    catch { parseError('객체 키를 문자열로 변환할 수 없습니다.', line); }
  }

  nested(parentIndent, depth, line, properties = null) {
    const childIndent = this.nextIndent();
    const next = this.lines[this.idx];
    const indentlessSequence = childIndent === parentIndent && next
      && /^-(?:\s|$)/.test(next.raw.slice(childIndent));
    const hasChild = childIndent > parentIndent || indentlessSequence;
    if (hasChild && properties?.anchor && /^\s*&/.test(next.raw.slice(childIndent)))
      parseError('한 노드에 앵커를 두 번 지정할 수 없습니다.', next.number);
    let placeholder = null;
    if (hasChild && properties?.anchor) {
      const content = next.raw.slice(childIndent);
      placeholder = /^-(?:\s|$)/.test(content) ? [] : {};
      this.anchor(properties.anchor, placeholder, line);
    }
    let value = hasChild ? this.block(childIndent, depth + 1) : null;
    if (properties) {
      value = applyTag(value, properties.tag, null, false, line);
      if (placeholder) {
        if (Array.isArray(placeholder)) placeholder.push(...value);
        else for (const [key, item] of Object.entries(value)) setKey(placeholder, key, item);
        value = placeholder;
      } else if (properties.anchor) this.anchor(properties.anchor, value, line);
    }
    return value;
  }

  value(text, parentIndent, depth, line, standalone = false) {
    const clean = stripComment(text).trim();
    const header = /^((?:(?:&[^\s]+|!<[^>]+>|!+[^\s]+)\s*)*)([|>])([1-9]?)([+-]?)(?:\s*)$/.exec(clean);
    if (header) {
      const props = this.readProperties(header[1], line);
      let value = this.blockScalar(header[2], header[3], header[4], parentIndent, line);
      value = applyTag(value, props.tag, value, true, line);
      if (props.anchor) this.anchor(props.anchor, value, line);
      return value;
    }
    if (/^(?:(?:&[^\s]+|!<[^>]+>|!+[^\s]+)\s*)*[|>]/.test(clean))
      parseError('블록 스칼라 표시자와 들여쓰기·chomping 옵션이 올바르지 않습니다.', line);
    const propsOnly = /^((?:(?:&[^\s]+|!<[^>]+>|!+[^\s]+)\s*)+)$/.test(clean);
    if (propsOnly) return this.nested(standalone ? parentIndent - 1 : parentIndent,
      depth, line, this.readProperties(clean, line));
    if (/^-(?:\s|$)/.test(clean))
      parseError('블록 배열 항목은 객체 값과 같은 줄에서 시작할 수 없습니다.', line);
    const complete = this.completeInline(clean, parentIndent, line);
    if (complete === clean && !/^[\[{'"*!&]/.test(clean)) {
      const continued = this.plainContinuation(clean, parentIndent);
      if (continued !== clean) return resolveImplicit(continued, line);
    }
    return this.inline(complete, line, false, depth);
  }

  plainContinuation(first, parentIndent) {
    let cursor = this.idx, pendingBlanks = 0, found = false, value = first;
    while (cursor < this.lines.length) {
      const line = this.lines[cursor];
      if (!line.raw.trim()) { pendingBlanks++; cursor++; continue; }
      const indent = countIndent(line.raw, line.number);
      if (indent <= parentIndent) break;
      const content = stripComment(line.raw.slice(indent)).trim();
      if (!content) { cursor++; continue; }
      if (mappingColon(content) >= 0)
        parseError('plain 스칼라 안에는 콜론 뒤 공백이 있는 객체 항목을 사용할 수 없습니다.', line.number);
      value += pendingBlanks ? '\n'.repeat(pendingBlanks) : ' ';
      value += content;
      pendingBlanks = 0;
      found = true;
      cursor++;
      if (stripComment(line.raw.slice(indent)) !== line.raw.slice(indent).trimEnd()) break;
    }
    if (found) this.idx = cursor;
    if (value.length > this.limits.scalarLength)
      parseError(`스칼라는 최대 ${this.limits.scalarLength.toLocaleString()}자까지 허용됩니다.`,
        this.lines[Math.max(0, this.idx - 1)]?.number || 0, 0, 'YAML_SCALAR_LIMIT');
    return found ? value : first;
  }

  readProperties(text, line) {
    const parser = new InlineParser(this, text, line);
    const properties = parser.properties();
    parser.skipSpace();
    if (parser.pos !== text.length) parseError('태그 또는 앵커 속성이 올바르지 않습니다.', line);
    return properties;
  }

  completeInline(text, parentIndent, line) {
    const parts = [text];
    let state = this.inlineBalance(text, null, line);
    while (state.open && this.idx < this.lines.length) {
      const next = this.lines[this.idx];
      const indent = countIndent(next.raw, next.number);
      if (!isBlank(next.raw) && indent <= parentIndent)
        parseError('flow 컬렉션 또는 따옴표가 닫히지 않았습니다.', line);
      const part = next.raw.trimStart().startsWith('#') ? next.raw.trimStart()
        : next.raw.slice(Math.min(next.raw.length, parentIndent + 1));
      parts.push(part);
      this.idx++;
      state = this.inlineBalance('\n' + part, state, next.number);
    }
    if (state.open) parseError('flow 컬렉션 또는 따옴표가 닫히지 않았습니다.', line);
    return parts.join('\n');
  }

  inlineBalance(text, previous = null, line = 0) {
    let { quote = '', escaped = false, square = 0, curly = 0 } = previous || {};
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quote === '"') {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quote = '';
      } else if (quote === "'") {
        if (char === "'" && text[index + 1] === "'") index++;
        else if (char === "'") quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '[') square++;
      else if (char === ']') square--;
      else if (char === '{') curly++;
      else if (char === '}') curly--;
      if (square < 0 || curly < 0) parseError('flow 컬렉션의 닫는 괄호가 맞지 않습니다.', line);
    }
    return { quote, escaped, square, curly, open: !!quote || square > 0 || curly > 0 };
  }

  inlineNode(text, line, key = false, depth = 0) {
    const parser = new InlineParser(this, text, line);
    const value = parser.parse(key, depth);
    parser.skipSpace();
    if (parser.pos < text.length) {
      const comment = text[parser.pos] === '#' && (parser.pos === 0 || /\s/.test(text[parser.pos - 1]));
      if (!comment) parseError(`예상하지 않은 문자 ${JSON.stringify(text[parser.pos])}입니다.`, line, parser.pos + 1);
    }
    return { value, meta: parser.lastNodeMeta };
  }

  inline(text, line, key = false, depth = 0) {
    return this.inlineNode(text, line, key, depth).value;
  }

  blockScalar(style, indentIndicator, chomp, parentIndent, line) {
    let contentIndent = indentIndicator ? parentIndent + Number(indentIndicator) : -1;
    if (contentIndent < 0) {
      let leadingBlankIndent = parentIndent;
      for (let cursor = this.idx; cursor < this.lines.length; cursor++) {
        const candidate = this.lines[cursor];
        const indent = countIndent(candidate.raw, candidate.number);
        if (candidate.raw.trim() === '') {
          leadingBlankIndent = Math.max(leadingBlankIndent, indent);
          continue;
        }
        if (indent <= parentIndent) return '';
        contentIndent = indent;
        if (leadingBlankIndent > contentIndent)
          parseError('블록 스칼라의 앞쪽 빈 줄은 첫 내용보다 깊게 들여쓸 수 없습니다.', candidate.number);
        break;
      }
      if (contentIndent < 0) contentIndent = parentIndent + 1;
    }
    const chunks = [];
    const more = [];
    while (this.idx < this.lines.length) {
      const current = this.lines[this.idx];
      const indent = countIndent(current.raw, current.number);
      if (current.raw.trim() && indent < contentIndent) break;
      if (!current.raw.trim() && indent <= parentIndent) {
        chunks.push(''); more.push(false); this.idx++; continue;
      }
      if (current.raw.trim() && indent <= parentIndent) break;
      chunks.push(current.raw.slice(Math.min(contentIndent, current.raw.length)));
      more.push(indent > contentIndent);
      this.idx++;
    }
    let value = '';
    for (let index = 0; index < chunks.length; index++) {
      value += chunks[index];
      if (index + 1 < chunks.length) {
        if (style !== '>') value += '\n';
        else if (chunks[index] && chunks[index + 1] && !more[index] && !more[index + 1]) value += ' ';
        else if (!chunks[index] && chunks[index + 1] && index > 0) value += '';
        else value += '\n';
      } else value += '\n';
    }
    if (value.length > this.limits.scalarLength)
      parseError(`스칼라는 최대 ${this.limits.scalarLength.toLocaleString()}자까지 허용됩니다.`,
        line, 0, 'YAML_SCALAR_LIMIT');
    if (chomp === '-') return value.replace(/\n+$/, '');
    if (chomp === '+') return value;
    return value ? value.replace(/\n+$/, '\n') : '';
  }
}

function streamDocuments(source, options) {
  if (typeof source !== 'string') source = String(source);
  const limits = { ...YAML_LIMITS, ...(options.limits || {}) };
  if (source.length > limits.inputLength)
    parseError(`입력은 최대 ${limits.inputLength.toLocaleString()}자까지 허용됩니다.`, 0, 0, 'YAML_INPUT_LIMIT');
  if (source.includes('\0')) parseError('NUL 문자는 사용할 수 없습니다.');
  const invalidCharacter = INVALID_YAML_CHARACTER.exec(source);
  if (invalidCharacter) {
    const before = source.slice(0, invalidCharacter.index);
    const line = before.split(/\r\n?|\n/).length;
    const column = invalidCharacter.index - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
    parseError(`허용되지 않는 제어 또는 Unicode 문자 U+${invalidCharacter[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}입니다.`,
      line, column, 'YAML_CHARACTER');
  }
  source = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rawLines = source.split('\n');
  if (rawLines.at(-1) === '') rawLines.pop();
  const physical = rawLines.map((raw, index) => ({ raw, number: index + 1 }));
  const documents = [];
  let lines = [], handles = new Map([['!!', CORE_TAG_PREFIX]]), explicit = false;
  let pendingDirectives = false, yamlDirective = false, tagDirectives = new Set();
  const push = () => {
    const hasContent = lines.some((line) => !isBlank(line.raw));
    if (hasContent || explicit)
      documents.push({ lines, handles: new Map(handles), empty: !hasContent });
    lines = [];
    handles = new Map([['!!', CORE_TAG_PREFIX]]);
    explicit = false;
    pendingDirectives = false;
    yamlDirective = false;
    tagDirectives = new Set();
  };
  for (const line of physical) {
    if (/^%/.test(line.raw)) {
      if (explicit || lines.some((entry) => !isBlank(entry.raw)))
        parseError('지시문은 문서 내용보다 앞에 있어야 합니다.', line.number);
      const yaml = /^%YAML[ \t]+(\d+)\.(\d+)(?:[ \t]+#.*)?[ \t]*$/.exec(line.raw);
      if (yaml) {
        if (yamlDirective) parseError('한 문서에 %YAML 지시문을 두 번 지정할 수 없습니다.', line.number);
        if (yaml[1] !== '1' || !['1', '2'].includes(yaml[2])) parseError(`지원하지 않는 YAML 버전 ${yaml[1]}.${yaml[2]}입니다.`, line.number);
        yamlDirective = true;
        pendingDirectives = true;
        continue;
      }
      const tag = /^%TAG[ \t]+(![^\s]*!)[ \t]+(\S+?)(?:[ \t]+#.*)?[ \t]*$/.exec(line.raw);
      if (tag) {
        if (tagDirectives.has(tag[1])) parseError(`%TAG 핸들 ${tag[1]}을 두 번 지정할 수 없습니다.`, line.number);
        tagDirectives.add(tag[1]);
        handles.set(tag[1], tag[2]);
        pendingDirectives = true;
        continue;
      }
      parseError('지원하지 않거나 잘못된 YAML 지시문입니다.', line.number);
    }
    const startMarker = /^---(?:[ \t]+(.*))?$/.exec(line.raw);
    if (startMarker) {
      if (lines.some((entry) => !isBlank(entry.raw)) || explicit) push();
      explicit = true;
      pendingDirectives = false;
      if (startMarker[1] && !startMarker[1].startsWith('#')) {
        const markerContent = stripComment(startMarker[1]).trim();
        if (mappingColon(markerContent) >= 0 && !/^(?:\{|\[)/.test(markerContent))
          parseError('문서 시작 표시자와 같은 줄에서 block 객체를 시작할 수 없습니다.', line.number);
        lines.push({ raw: startMarker[1], number: line.number });
      }
      continue;
    }
    if (pendingDirectives) parseError('지시문 뒤에는 문서 시작 표시자 ---가 필요합니다.', line.number);
    if (/^\.\.\.(?:\s*(?:#.*)?)$/.test(line.raw)) { push(); continue; }
    lines.push(line);
  }
  if (pendingDirectives) parseError('지시문 뒤에는 문서 시작 표시자 ---가 필요합니다.', physical.at(-1)?.number || 0);
  push();
  if (!documents.length && !source.trim()) return [];
  return documents.map((document) => document.empty ? null
    : new DocumentParser(document.lines, options, document.handles).parse());
}

export function load(source, options = {}) {
  const documents = streamDocuments(source, options);
  if (documents.length > 1)
    parseError('load()에는 문서 하나만 입력할 수 있습니다. 다중 문서는 loadAll()을 사용하세요.');
  return documents[0];
}

export function loadAll(source, iteratorOrOptions, maybeOptions) {
  const iterator = typeof iteratorOrOptions === 'function' ? iteratorOrOptions : null;
  const options = iterator ? (maybeOptions || {}) : (iteratorOrOptions || {});
  const documents = streamDocuments(source, options);
  if (iterator) documents.forEach(iterator);
  return documents;
}

function isContainer(value) {
  return value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Uint8Array);
}

function countReferences(value, counts, stack, limits, state, depth = 0) {
  if (!isContainer(value)) return;
  if (depth > limits.depth) throw new Error(`YAML 출력 중첩은 최대 ${limits.depth}단계까지 허용됩니다.`);
  counts.set(value, (counts.get(value) || 0) + 1);
  if (stack.has(value)) return;
  if (++state.nodes > limits.nodes) throw new Error(`YAML 출력 노드는 최대 ${limits.nodes.toLocaleString()}개까지 허용됩니다.`);
  stack.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) countReferences(child, counts, stack, limits, state, depth + 1);
  stack.delete(value);
}

function scalarText(value, key = false) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '.nan';
    if (value === Infinity) return '.inf';
    if (value === -Infinity) return '-.inf';
    if (Object.is(value, -0)) return '-0.0';
    return String(value);
  }
  if (value instanceof Date) return `!!timestamp ${value.toISOString()}`;
  let text = String(value);
  if (INVALID_UNICODE_SCALAR.test(text))
    throw new Error('YAML 출력 문자열에는 단독 UTF-16 surrogate를 사용할 수 없습니다.');
  if (text.includes('\n') && !key) return null;
  let ambiguous;
  try { ambiguous = resolveImplicit(text) !== text; }
  catch (error) {
    if (!['YAML_INTEGER_RANGE', 'YAML_FLOAT_RANGE'].includes(error?.code)) throw error;
    ambiguous = true;
  }
  ambiguous ||= /^(?:y|yes|n|no|on|off)$/i.test(text)
    || /^[-+]?\d[\d_]*:[\d_:.-]+$/.test(text);
  const unsafe = !text || ambiguous || key && text === '<<' || /^[-?:,\[\]{}#&*!|>'"%@`]/.test(text)
    || /[\s:]#/.test(text) || /:\s/.test(text) || /\s$/.test(text) || /^\s/.test(text)
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(text) || INVALID_YAML_CHARACTER.test(text)
    || key && /[{}\[\],]/.test(text);
  if (!unsafe) return text;
  if (!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(text) && !INVALID_YAML_CHARACTER.test(text))
    return `'${text.replace(/'/g, "''")}'`;
  return JSON.stringify(text).replace(/\u0000/g, '\\0').replace(/\u0008/g, '\\b')
    .replace(/\u000c/g, '\\f').replace(/\u0085/g, '\\N')
    .replace(/\u00a0/g, '\\_').replace(/\u2028/g, '\\L').replace(/\u2029/g, '\\P')
    .replace(/[\u007f-\u0084\u0086-\u009f\ufffe\uffff]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

class Dumper {
  constructor(options) {
    this.indent = Math.max(1, Math.min(10, Number(options.indent) || 2));
    this.flowLevel = Number.isInteger(options.flowLevel) ? options.flowLevel : -1;
    this.noRefs = !!options.noRefs;
    this.sortKeys = options.sortKeys || false;
    this.limits = { ...YAML_LIMITS, ...(options.limits || {}) };
    this.counts = new Map();
    this.anchors = new Map();
    this.emitted = new Set();
    this.outputLength = 0;
  }

  prepare(value) {
    countReferences(value, this.counts, new Set(), this.limits, { nodes: 0 });
    let index = 0, aliases = 0;
    for (const [item, count] of this.counts) {
      if (count <= 1) continue;
      if (!this.noRefs && index >= this.limits.anchors)
        throw new Error(`YAML 출력 앵커는 최대 ${this.limits.anchors.toLocaleString()}개까지 허용됩니다.`);
      aliases += count - 1;
      if (!this.noRefs && aliases > this.limits.aliases)
        throw new Error(`YAML 출력 별칭은 최대 ${this.limits.aliases.toLocaleString()}개까지 허용됩니다.`);
      this.anchors.set(item, `ref_${index++}`);
    }
  }

  anchor(value) {
    const name = this.anchors.get(value);
    if (!name) return { alias: '', prefix: '' };
    if (this.emitted.has(value)) return { alias: `*${name}`, prefix: '' };
    this.emitted.add(value);
    return { alias: '', prefix: `&${name}` };
  }

  keys(value) {
    const keys = Object.keys(value).filter((key) => {
      const item = value[key];
      return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol';
    });
    if (this.sortKeys === true) keys.sort();
    else if (typeof this.sortKeys === 'function') keys.sort(this.sortKeys);
    return keys;
  }

  flow(value, depth) {
    if (!isContainer(value)) {
      if (typeof value === 'string' && value.includes('\n')) {
        if (value.length > this.limits.scalarLength)
          throw new Error(`YAML 출력 스칼라는 최대 ${this.limits.scalarLength.toLocaleString()}자까지 허용됩니다.`);
        return JSON.stringify(value);
      }
      return this.scalar(value, depth);
    }
    const anchor = this.anchor(value);
    if (anchor.alias) return anchor.alias;
    let body;
    if (Array.isArray(value)) {
      body = `[${value.map((item) => this.flow(this.arrayValue(item), depth + 1)).join(', ')}]`;
    } else {
      body = `{${this.keys(value).map((key) => `${scalarText(key, true)}: ${this.flow(value[key], depth + 1)}`).join(', ')}}`;
    }
    return anchor.prefix ? `${anchor.prefix} ${body}` : body;
  }

  arrayValue(value) {
    return value === undefined || typeof value === 'function' || typeof value === 'symbol' ? null : value;
  }

  scalar(value, depth) {
    if (typeof value === 'string' && value.length > this.limits.scalarLength)
      throw new Error(`YAML 출력 스칼라는 최대 ${this.limits.scalarLength.toLocaleString()}자까지 허용됩니다.`);
    if (value instanceof Uint8Array) {
      let binary = '';
      for (const byte of value) binary += String.fromCharCode(byte);
      return `!!binary ${btoa(binary)}`;
    }
    const text = scalarText(value);
    if (text !== null) return text;
    const string = String(value);
    const trailing = /\n+$/.exec(string)?.[0].length || 0;
    const indicator = trailing > 1 ? '+' : trailing === 1 ? '' : '-';
    const content = string.replace(/\n+$/, '').split('\n');
    const pad = ' '.repeat((depth + 1) * this.indent);
    return `|${indicator}\n${content.map((line) => pad + line).join('\n')}${trailing ? '\n'.repeat(trailing - 1) : ''}`;
  }

  block(value, depth = 0) {
    if (!isContainer(value)) return this.scalar(value, depth);
    if (this.flowLevel >= 0 && depth >= this.flowLevel) return this.flow(value, depth);
    const anchor = this.anchor(value);
    if (anchor.alias) return anchor.alias;
    const prefix = anchor.prefix ? ' '.repeat(depth * this.indent) + anchor.prefix + '\n' : '';
    if (Array.isArray(value)) {
      if (!value.length) return (anchor.prefix ? anchor.prefix + ' ' : '') + '[]';
      return prefix + value.map((raw) => {
        const item = this.arrayValue(raw);
        const pad = ' '.repeat(depth * this.indent);
        if (!isContainer(item)) return `${pad}- ${this.scalar(item, depth)}`;
        const childAnchor = this.anchors.get(item);
        if (childAnchor && this.emitted.has(item)) return `${pad}- *${childAnchor}`;
        if (Array.isArray(item) || !this.keys(item).length || childAnchor) {
          const child = this.block(item, depth + 1);
          const lines = child.split('\n');
          const childPad = ' '.repeat((depth + 1) * this.indent);
          const first = lines[0].startsWith(childPad) ? lines[0].slice(childPad.length) : lines[0];
          return `${pad}- ${first}` + (lines.length > 1 ? '\n' + lines.slice(1).join('\n') : '');
        }
        return this.compactObject(item, depth, pad);
      }).join('\n');
    }
    const keys = this.keys(value);
    if (!keys.length) return (anchor.prefix ? anchor.prefix + ' ' : '') + '{}';
    const body = keys.map((key) => this.objectEntry(key, value[key], depth)).join('\n');
    return prefix + body;
  }

  compactObject(value, depth, pad) {
    const anchor = this.anchor(value);
    if (anchor.alias) return `${pad}- ${anchor.alias}`;
    const keys = this.keys(value);
    const first = this.objectEntry(keys[0], value[keys[0]], depth + 1).trimStart();
    const rest = keys.slice(1).map((key) => this.objectEntry(key, value[key], depth + 1)).join('\n');
    return `${pad}- ${anchor.prefix ? anchor.prefix + ' ' : ''}${first}${rest ? '\n' + rest : ''}`;
  }

  objectEntry(key, value, depth) {
    const pad = ' '.repeat(depth * this.indent);
    const encodedKey = scalarText(key, true);
    if (!isContainer(value)) {
      const scalar = this.scalar(value, depth);
      if (!scalar.includes('\n')) return `${pad}${encodedKey}: ${scalar}`;
      const [header, ...content] = scalar.split('\n');
      return `${pad}${encodedKey}: ${header}\n${content.join('\n')}`;
    }
    const childAnchor = this.anchors.get(value);
    if (childAnchor && this.emitted.has(value)) return `${pad}${encodedKey}: *${childAnchor}`;
    const child = this.block(value, depth + 1);
    if (!child.includes('\n') && (/^[\[{]/.test(child) || child.startsWith('*') || child.startsWith('&')))
      return `${pad}${encodedKey}: ${child}`;
    return `${pad}${encodedKey}:\n${child}`;
  }

  dump(value) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return '';
    this.prepare(value);
    if (this.noRefs && this.anchors.size) {
      // Repeated values are serialized independently; cycles cannot be represented without aliases.
      const cycle = (item, stack = new Set()) => {
        if (!isContainer(item)) return false;
        if (stack.has(item)) return true;
        stack.add(item);
        const found = (Array.isArray(item) ? item : Object.values(item)).some((child) => cycle(child, stack));
        stack.delete(item);
        return found;
      };
      if (cycle(value)) throw new Error('순환 참조는 noRefs 옵션으로 YAML에 쓸 수 없습니다.');
      this.anchors.clear();
    }
    const output = this.block(value) + '\n';
    if (output.length > this.limits.outputLength)
      throw new Error(`YAML 결과는 최대 ${this.limits.outputLength.toLocaleString()}자까지 허용됩니다.`);
    return output;
  }
}

export function dump(value, options = {}) {
  return new Dumper(options).dump(value);
}
