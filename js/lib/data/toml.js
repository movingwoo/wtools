// TOML 1.0 parser and serializer. This module is intentionally DOM-independent.

const HAS = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const BARE_KEY = /^[A-Za-z0-9_-]+$/;
export const TOML_DEFAULT_LIMITS = Object.freeze({
  inputLength: 4 * 1024 * 1024,
  scalarLength: 4 * 1024 * 1024,
  depth: 256,
  nodes: 200_000,
});
const INTEGER_MIN = -(1n << 63n);
const INTEGER_MAX = (1n << 63n) - 1n;

export class TomlError extends Error {
  constructor(message, line = 0, column = 0, code = 'TOML_SYNTAX') {
    const location = line ? ` (${line}행 ${column}열)` : '';
    super(`TOML 구문 오류: ${message}${location}`);
    this.name = 'TomlError';
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

export class TomlDate extends Date {
  constructor(milliseconds, text, kind) {
    let parsed;
    if (arguments.length === 1) {
      if (typeof milliseconds === 'string') {
        parsed = parseTomlDateToken(milliseconds);
        if (!parsed) throw new TypeError('유효한 TOML 날짜·시간 문자열이 필요합니다.');
      } else {
        const date = requireDate(milliseconds instanceof Date ? milliseconds : new Date(milliseconds));
        parsed = { timestamp: date.getTime(), text: date.toISOString(), kind: 'offset-date-time' };
      }
    } else {
      parsed = parseTomlDateToken(text);
      if (!parsed || parsed.text !== text || parsed.kind !== kind || parsed.timestamp !== milliseconds)
        throw new TypeError('TOML 날짜·시간 메타데이터가 유효하지 않습니다.');
    }
    super(parsed.timestamp);
    Object.defineProperties(this, {
      tomlText: { value: parsed.text },
      tomlType: { value: parsed.kind },
    });
  }

  toISOString() { return this.tomlText; }
  toJSON() { return this.tomlText; }
  isDateTime() { return this.tomlType === 'offset-date-time' || this.tomlType === 'local-date-time'; }
  isLocal() { return this.tomlType !== 'offset-date-time'; }
  isDate() { return this.tomlType === 'local-date'; }
  isTime() { return this.tomlType === 'local-time'; }
  isValid() { return !Number.isNaN(this.getTime()) && !!parseTomlDateToken(this.tomlText); }

  static wrapAsOffsetDateTime(value, offset = 'Z') {
    const date = requireDate(value);
    if (offset === 'Z') return new TomlDate(date);
    if (!/^[+-]\d{2}:\d{2}$/.test(offset)
      || +offset.slice(1, 3) > 23 || +offset.slice(4, 6) > 59)
      throw new TypeError('유효한 TOML 시간대 오프셋이 필요합니다.');
    const minutes = (+offset.slice(1, 3) * 60 + +offset.slice(4, 6)) * (offset[0] === '+' ? 1 : -1);
    const shifted = new Date(date.getTime() + minutes * 60_000);
    return new TomlDate(date.getTime(), shifted.toISOString().slice(0, -1) + offset, 'offset-date-time');
  }

  static wrapAsLocalDateTime(value) {
    const date = requireDate(value);
    const text = date.toISOString().slice(0, -1);
    return new TomlDate(date.getTime(), text, 'local-date-time');
  }

  static wrapAsLocalDate(value) {
    const date = requireDate(value);
    const text = date.toISOString().slice(0, 10);
    const parsed = parseTomlDateToken(text);
    return new TomlDate(parsed.timestamp, parsed.text, parsed.kind);
  }

  static wrapAsLocalTime(value) {
    const date = requireDate(value);
    const text = date.toISOString().slice(11, -1);
    const parsed = parseTomlDateToken(text);
    return new TomlDate(parsed.timestamp, parsed.text, parsed.kind);
  }
}

function requireDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new TypeError('유효한 Date 값이 필요합니다.');
  return value;
}

function utcMilliseconds(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const date = new Date(0);
  date.setUTCFullYear(+year, +month - 1, +day);
  date.setUTCHours(+hour, +minute, +second, +millisecond);
  return date.getTime();
}

function parseTomlDateToken(token, fail = null) {
  const reject = (message) => {
    if (fail) fail(message, 'TOML_DATE');
    return null;
  };
  const validate = (year, month, day, hour, minute, second, offset) => {
    const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][+month - 1] || 0;
    if (+month < 1 || +month > 12 || +day < 1 || +day > days)
      return reject('유효하지 않은 날짜입니다.');
    if (hour === undefined) return true;
    if (+hour > 23 || +minute > 59 || +second > 60)
      return reject('유효하지 않은 시간입니다.');
    if (offset && !/^[Zz]$/.test(offset)
      && (+offset.slice(1, 3) > 23 || +offset.slice(4, 6) > 59))
      return reject('유효하지 않은 시간대 오프셋입니다.');
    return true;
  };
  const dateTime = /^(\d{4})-(\d{2})-(\d{2})([Tt ])(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})?$/.exec(token);
  if (dateTime) {
    const [, year, month, day, , hour, minute, second, fraction = '', offset = ''] = dateTime;
    if (!validate(year, month, day, hour, minute, second, offset)) return null;
    const millis = (fraction + '000').slice(0, 3);
    const normalizedOffset = offset === 'z' ? 'Z' : offset;
    const text = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}${normalizedOffset}`;
    let timestamp = utcMilliseconds(year, month, day, hour, minute, Math.min(+second, 59), millis);
    if (offset && !/^[Zz]$/.test(offset)) {
      const direction = offset[0] === '+' ? 1 : -1;
      timestamp -= direction * (+offset.slice(1, 3) * 60 + +offset.slice(4, 6)) * 60_000;
    }
    if (+second === 60) timestamp += 1_000;
    return { timestamp, text, kind: offset ? 'offset-date-time' : 'local-date-time' };
  }
  const localDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (localDate) {
    const [, year, month, day] = localDate;
    if (!validate(year, month, day)) return null;
    return { timestamp: utcMilliseconds(year, month, day), text: token, kind: 'local-date' };
  }
  const localTime = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(token);
  if (localTime) {
    const [, hour, minute, second, fraction = ''] = localTime;
    if (!validate('0000', '01', '01', hour, minute, second, '')) return null;
    const millis = (fraction + '000').slice(0, 3);
    return {
      timestamp: utcMilliseconds(0, 1, 1, hour, minute, Math.min(+second, 59), millis)
        + (+second === 60 ? 1_000 : 0),
      text: `${hour}:${minute}:${second}.${millis}`,
      kind: 'local-time',
    };
  }
  return null;
}

function ownSet(object, key, value) {
  Object.defineProperty(object, key, {
    value, writable: true, configurable: true, enumerable: true,
  });
}

function normalizeLimits(options = {}) {
  const supplied = options.limits || {};
  const limits = { ...TOML_DEFAULT_LIMITS };
  for (const key of Object.keys(limits)) {
    const value = key === 'depth' ? supplied[key] ?? options.maxDepth : supplied[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`TOML ${key} 제한은 1 이상의 정수여야 합니다.`);
    limits[key] = value;
  }
  return limits;
}

function validateSource(source) {
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    if (code === 13 && source.charCodeAt(index + 1) !== 10)
      throw new TomlError('단독 CR 줄바꿈은 허용되지 않습니다.');
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127)
      throw new TomlError('허용되지 않는 제어 문자가 있습니다.');
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff)
        throw new TomlError('잘못된 Unicode surrogate가 있습니다.');
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TomlError('잘못된 Unicode surrogate가 있습니다.');
    }
  }
}

class Parser {
  constructor(source, options) {
    this.source = source.startsWith('\ufeff') ? source.slice(1) : source;
    this.index = 0;
    this.limits = normalizeLimits(options);
    this.integerMode = options.integersAsBigInt ?? false;
    if (![false, true, 'asNeeded'].includes(this.integerMode))
      throw new TypeError('integersAsBigInt는 true, false 또는 "asNeeded"여야 합니다.');
    this.depth = 0;
    this.nodes = 0;
    this.meta = new WeakMap();
    this.arrayMeta = new WeakSet();
    this.root = this.makeTable('explicit', 0);
    this.current = this.root;
  }

  makeTable(kind, pathDepth = 0) {
    this.countNode();
    const table = {};
    this.meta.set(table, { kind, sealed: false, pathDepth });
    return table;
  }

  countNode() {
    if (++this.nodes > this.limits.nodes)
      this.fail(`노드 수가 제한(${this.limits.nodes.toLocaleString('ko-KR')}개)을 넘었습니다.`, 'TOML_NODE_LIMIT');
  }

  withDepth(callback) {
    if (++this.depth > this.limits.depth)
      this.fail(`중첩 깊이가 제한(${this.limits.depth}단계)을 넘었습니다.`, 'TOML_DEPTH');
    try { return callback(); } finally { this.depth--; }
  }

  checkDepth(depth) {
    if (depth > this.limits.depth)
      this.fail(`중첩 깊이가 제한(${this.limits.depth}단계)을 넘었습니다.`, 'TOML_DEPTH');
  }

  fail(message, code = 'TOML_SYNTAX', at = this.index) {
    let line = 1, column = 1;
    for (let i = 0; i < at; i++) {
      if (this.source[i] === '\n') { line++; column = 1; } else column++;
    }
    throw new TomlError(message, line, column, code);
  }

  skipSpaces() {
    while (this.source[this.index] === ' ' || this.source[this.index] === '\t') this.index++;
  }

  skipComment() {
    if (this.source[this.index] !== '#') return false;
    while (this.index < this.source.length && this.source[this.index] !== '\n') this.index++;
    return true;
  }

  skipDocumentTrivia() {
    while (this.index < this.source.length) {
      this.skipSpaces();
      this.skipComment();
      if (this.source[this.index] !== '\n') break;
      this.index++;
    }
  }

  finishStatement() {
    this.skipSpaces();
    this.skipComment();
    if (this.index === this.source.length) return;
    if (this.source[this.index] !== '\n')
      this.fail('값 뒤에는 주석, 줄바꿈 또는 파일 끝만 올 수 있습니다.');
    this.index++;
  }

  parse() {
    this.skipDocumentTrivia();
    while (this.index < this.source.length) {
      if (this.source[this.index] === '[') this.parseHeader();
      else this.parseAssignment(this.current);
      this.finishStatement();
      this.skipDocumentTrivia();
    }
    return this.root;
  }

  parseHeader() {
    this.index++;
    const array = this.source[this.index] === '[';
    if (array) this.index++;
    this.skipSpaces();
    const path = this.parseKeyPath(']', 0);
    this.skipSpaces();
    if (this.source[this.index] !== ']') this.fail('테이블 헤더의 닫는 ]가 필요합니다.');
    this.index++;
    if (array) {
      if (this.source[this.index] !== ']') this.fail('테이블 배열 헤더의 두 번째 ]가 필요합니다.');
      this.index++;
    }
    this.current = array ? this.openArrayTable(path) : this.openTable(path);
  }

  parseAssignment(table) {
    const path = this.parseKeyPath('=', this.meta.get(table)?.pathDepth || 0, true);
    this.skipSpaces();
    if (this.source[this.index] !== '=') this.fail('키 뒤에 =가 필요합니다.');
    this.index++;
    this.skipSpaces();
    const value = this.parseValue();
    this.assign(table, path, value, false);
  }

  parseKeyPath(terminator, baseDepth, valueLeaf = false) {
    const path = [];
    while (true) {
      this.skipSpaces();
      path.push(this.parseKeySegment());
      this.checkDepth(baseDepth + path.length - (valueLeaf ? 1 : 0));
      this.skipSpaces();
      if (this.source[this.index] !== '.') break;
      this.index++;
      this.skipSpaces();
      if (this.source[this.index] === terminator || this.source[this.index] === '.' || this.index >= this.source.length)
        this.fail('점 뒤에 키가 필요합니다.');
    }
    if (this.source[this.index] !== terminator)
      this.fail(`키 뒤에 ${terminator}가 필요합니다.`);
    return path;
  }

  parseKeySegment() {
    const char = this.source[this.index];
    if (char === '"' || char === "'") {
      if (this.source.startsWith(char.repeat(3), this.index))
        this.fail('키에는 다중 행 문자열을 사용할 수 없습니다.');
      return this.parseString();
    }
    const start = this.index;
    while (/[A-Za-z0-9_-]/.test(this.source[this.index] || '')) this.index++;
    if (this.index === start) this.fail('빈 키는 따옴표로 감싸야 합니다.');
    return this.source.slice(start, this.index);
  }

  parseValue() {
    if (this.index >= this.source.length || this.source[this.index] === '\n' || this.source[this.index] === '#')
      this.fail('=뒤에 값이 필요합니다.');
    const char = this.source[this.index];
    let value;
    if (char === '"' || char === "'") value = this.parseString();
    else if (char === '[') value = this.withDepth(() => this.parseArray());
    else if (char === '{') value = this.withDepth(() => this.parseInlineTable());
    else value = this.parseBareValue();
    this.countNode();
    return value;
  }

  parseString() {
    const quote = this.source[this.index];
    const basic = quote === '"';
    const multiline = this.source.startsWith(quote.repeat(3), this.index);
    this.index += multiline ? 3 : 1;
    if (multiline && this.source[this.index] === '\n') this.index++;
    let result = '';
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === quote) {
        let count = 1;
        while (this.source[this.index + count] === quote) count++;
        if (!multiline || count >= 3) {
          if (multiline && count > 5) this.fail('다중 행 문자열의 끝에 따옴표가 너무 많습니다.');
          this.index += multiline ? 3 : 1;
          if (multiline) {
            result += quote.repeat(count - 3);
            this.index += count - 3;
          }
          this.checkScalarLength(result);
          return result;
        }
        result += quote.repeat(count);
        this.index += count;
        continue;
      }
      if (char === '\n' && !multiline) this.fail('단일 행 문자열에 줄바꿈을 넣을 수 없습니다.');
      if (basic && char === '\\') {
        if (multiline) {
          let next = this.index + 1;
          while (this.source[next] === ' ' || this.source[next] === '\t') next++;
          if (this.source[next] === '\n') {
            this.index = next + 1;
            while ([' ', '\t', '\n'].includes(this.source[this.index])) this.index++;
            continue;
          }
        }
        result += this.parseEscape();
      } else {
        result += char;
        this.index++;
      }
      this.checkScalarLength(result);
    }
    this.fail('문자열을 닫는 따옴표가 필요합니다.');
  }

  parseEscape() {
    this.index++;
    const char = this.source[this.index++];
    const escapes = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
    if (HAS(escapes, char)) return escapes[char];
    if (char !== 'u' && char !== 'U') this.fail(`알 수 없는 이스케이프 \\${char || ''}입니다.`, 'TOML_ESCAPE', this.index - 2);
    const length = char === 'u' ? 4 : 8;
    const hex = this.source.slice(this.index, this.index + length);
    if (!new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(hex))
      this.fail(`Unicode 이스케이프에 16진수 ${length}자리가 필요합니다.`, 'TOML_ESCAPE');
    this.index += length;
    const codePoint = Number.parseInt(hex, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff))
      this.fail('유효하지 않은 Unicode scalar 값입니다.', 'TOML_ESCAPE', this.index - length);
    return String.fromCodePoint(codePoint);
  }

  checkScalarLength(value) {
    if (value.length > this.limits.scalarLength)
      this.fail(`문자열 길이가 제한(${this.limits.scalarLength.toLocaleString('ko-KR')}자)을 넘었습니다.`, 'TOML_SCALAR_LIMIT');
  }

  skipArrayTrivia() {
    while (true) {
      this.skipSpaces();
      this.skipComment();
      if (this.source[this.index] !== '\n') return;
      this.index++;
    }
  }

  parseArray() {
    this.index++;
    const result = [];
    this.skipArrayTrivia();
    if (this.source[this.index] === ']') { this.index++; return result; }
    while (true) {
      result.push(this.parseValue());
      this.skipArrayTrivia();
      if (this.source[this.index] === ']') { this.index++; return result; }
      if (this.source[this.index] !== ',') this.fail('배열 값 사이에 쉼표(,)가 필요합니다.');
      this.index++;
      this.skipArrayTrivia();
      if (this.source[this.index] === ']') { this.index++; return result; }
    }
  }

  parseInlineTable() {
    this.index++;
    const table = this.makeTable('inline', this.depth);
    this.skipSpaces();
    if (this.source[this.index] === '}') { this.index++; this.sealInline(table); return table; }
    while (true) {
      if (this.source[this.index] === '\n') this.fail('인라인 테이블은 한 줄에 작성해야 합니다.');
      const path = this.parseKeyPath('=', this.meta.get(table).pathDepth, true);
      this.skipSpaces();
      this.index++;
      this.skipSpaces();
      const value = this.parseValue();
      this.assign(table, path, value, true);
      this.skipSpaces();
      if (this.source[this.index] === '}') { this.index++; this.sealInline(table); return table; }
      if (this.source[this.index] !== ',') this.fail('인라인 테이블 값 사이에 쉼표(,)가 필요합니다.');
      this.index++;
      this.skipSpaces();
      if (this.source[this.index] === '}') this.fail('TOML 1.0 인라인 테이블은 후행 쉼표를 허용하지 않습니다.');
    }
  }

  sealInline(table) {
    const visit = (value) => {
      if (!value || typeof value !== 'object' || value instanceof Date) return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const meta = this.meta.get(value);
      if (meta) { meta.kind = 'inline'; meta.sealed = true; }
      Object.values(value).forEach(visit);
    };
    visit(table);
  }

  parseBareValue() {
    const start = this.index;
    while (this.index < this.source.length && ![',', ']', '}', '#', '\n'].includes(this.source[this.index]))
      this.index++;
    const token = this.source.slice(start, this.index).trimEnd();
    if (!token) this.fail('=뒤에 값이 필요합니다.', 'TOML_SYNTAX', start);
    if (token === 'true') return true;
    if (token === 'false') return false;
    const date = this.parseDate(token);
    if (date) return date;
    if (/^[+-]?(?:inf|nan)$/.test(token)) {
      if (token.endsWith('nan')) return Number.NaN;
      return token[0] === '-' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    }
    const integer = this.parseInteger(token);
    if (integer !== null) return integer;
    if (this.isFloat(token)) return Number(token.replaceAll('_', ''));
    this.fail(`알 수 없는 값 "${token.slice(0, 80)}"입니다.`, 'TOML_VALUE', start);
  }

  parseInteger(token) {
    let radix = 10, digits = token, sign = 1n;
    if (/^[+-]/.test(digits)) {
      if (digits[0] === '-') sign = -1n;
      digits = digits.slice(1);
    }
    if (/^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(digits)) { radix = 16; digits = digits.slice(2); }
    else if (/^0o[0-7](?:_?[0-7])*$/.test(digits)) { radix = 8; digits = digits.slice(2); }
    else if (/^0b[01](?:_?[01])*$/.test(digits)) { radix = 2; digits = digits.slice(2); }
    else if (!/^(?:0|[1-9](?:_?[0-9])*)$/.test(digits)) return null;
    if (radix !== 10 && /^[+-]/.test(token)) return null;
    const clean = digits.replaceAll('_', '');
    let value = radix === 10 ? BigInt(clean) : BigInt(`${radix === 16 ? '0x' : radix === 8 ? '0o' : '0b'}${clean}`);
    value *= sign;
    if (value < INTEGER_MIN || value > INTEGER_MAX)
      this.fail('64비트 부호 있는 정수 범위를 벗어났습니다.', 'TOML_INTEGER_RANGE');
    if (this.integerMode === true || (this.integerMode === 'asNeeded'
      && (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)))) return value;
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      this.fail('정수를 손실 없이 표현할 수 없습니다. integersAsBigInt 옵션을 사용하세요.', 'TOML_INTEGER_PRECISION');
    return number;
  }

  isFloat(token) {
    const digits = '[0-9](?:_?[0-9])*';
    const whole = '(?:0|[1-9](?:_?[0-9])*)';
    const exponent = `[eE][+-]?${digits}`;
    return new RegExp(`^[+-]?(?:${whole}\\.${digits}(?:${exponent})?|${whole}${exponent})$`).test(token);
  }

  parseDate(token) {
    const parsed = parseTomlDateToken(token, (message, code) => this.fail(message, code));
    return parsed ? new TomlDate(parsed.timestamp, parsed.text, parsed.kind) : null;
  }

  resolveParent(path, dotted) {
    let table = this.root;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!HAS(table, key)) {
        const child = this.makeTable(dotted ? 'dotted' : 'implicit', i + 1);
        ownSet(table, key, child);
        table = child;
        continue;
      }
      const value = table[key];
      if (this.arrayMeta.has(value)) {
        if (!value.length) this.fail(`"${key}" 테이블 배열이 비어 있습니다.`);
        table = value[value.length - 1];
      } else if (this.isTable(value)) {
        if (this.meta.get(value)?.sealed) this.fail(`인라인 테이블 "${key}"을 확장할 수 없습니다.`);
        table = value;
      } else {
        this.fail(`"${key}"는 테이블이 아니어서 하위 키를 추가할 수 없습니다.`);
      }
    }
    return table;
  }

  openTable(path) {
    const parent = this.resolveParent(path, false);
    const key = path[path.length - 1];
    if (!HAS(parent, key)) {
      const table = this.makeTable('explicit', path.length);
      ownSet(parent, key, table);
      return table;
    }
    const table = parent[key];
    if (!this.isTable(table) || this.meta.get(table)?.sealed)
      this.fail(`테이블 "${path.join('.')}"을 정의할 수 없습니다.`);
    const meta = this.meta.get(table);
    if (meta.kind !== 'implicit') this.fail(`테이블 "${path.join('.')}"이 중복 정의되었습니다.`, 'TOML_DUPLICATE');
    meta.kind = 'explicit';
    return table;
  }

  openArrayTable(path) {
    const parent = this.resolveParent(path, false);
    const key = path[path.length - 1];
    let array;
    if (!HAS(parent, key)) {
      array = [];
      this.arrayMeta.add(array);
      ownSet(parent, key, array);
    } else {
      array = parent[key];
      if (!this.arrayMeta.has(array))
        this.fail(`"${path.join('.')}"는 테이블 배열이 아닙니다.`);
    }
    const table = this.makeTable('array', path.length);
    array.push(table);
    return table;
  }

  assign(start, path, value, inline) {
    let table = start;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!HAS(table, key)) {
        const pathDepth = (this.meta.get(table)?.pathDepth || 0) + 1;
        const child = this.makeTable(inline ? 'inline' : 'dotted', pathDepth);
        ownSet(table, key, child);
        table = child;
        continue;
      }
      const child = table[key];
      if (this.arrayMeta.has(child)) {
        this.fail(`테이블 배열 "${key}"을 dotted key로 확장할 수 없습니다.`);
      } else if (this.isTable(child)) {
        const meta = this.meta.get(child);
        if (meta?.sealed || meta?.kind === 'explicit' || meta?.kind === 'array')
          this.fail(`이미 정의된 테이블 "${key}"을 dotted key로 확장할 수 없습니다.`);
        table = child;
      } else {
        this.fail(`"${key}"는 확장할 수 없는 값입니다.`);
      }
    }
    const key = path[path.length - 1];
    if (HAS(table, key)) this.fail(`키 "${key}"가 중복 정의되었습니다.`, 'TOML_DUPLICATE');
    ownSet(table, key, value);
  }

  isTable(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
  }
}

export function parse(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('parse의 입력은 문자열여야 합니다.');
  const limits = normalizeLimits(options);
  if (source.length > limits.inputLength)
    throw new TomlError(`입력 길이가 제한(${limits.inputLength.toLocaleString('ko-KR')}자)을 넘었습니다.`, 0, 0, 'TOML_INPUT_LIMIT');
  validateSource(source);
  const normalized = source.replaceAll('\r\n', '\n');
  return new Parser(normalized, { ...options, limits }).parse();
}

function tableLike(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function escapeString(value) {
  let result = '"';
  for (const char of value) {
    const code = char.codePointAt(0);
    if (char === '"') result += '\\"';
    else if (char === '\\') result += '\\\\';
    else if (char === '\b') result += '\\b';
    else if (char === '\t') result += '\\t';
    else if (char === '\n') result += '\\n';
    else if (char === '\f') result += '\\f';
    else if (char === '\r') result += '\\r';
    else if (code < 32 || code === 127) result += `\\u${code.toString(16).padStart(4, '0').toUpperCase()}`;
    else if (code >= 0xd800 && code <= 0xdfff) throw new TypeError('문자열에 잘못된 Unicode surrogate가 있습니다.');
    else result += char;
  }
  return result + '"';
}

function formatKey(key) {
  return BARE_KEY.test(key) ? key : escapeString(key);
}

function formatNumber(value, numbersAsFloat) {
  if (Number.isNaN(value)) return 'nan';
  if (value === Number.POSITIVE_INFINITY) return 'inf';
  if (value === Number.NEGATIVE_INFINITY) return '-inf';
  if (Object.is(value, -0)) return numbersAsFloat ? '-0.0' : '-0.0';
  if (!Number.isFinite(value)) throw new TypeError('표현할 수 없는 숫자입니다.');
  if (Number.isInteger(value)) {
    if (numbersAsFloat || !Number.isSafeInteger(value)) {
      const integer = String(value);
      return /[eE]/.test(integer) ? integer.replace(/([eE])/, '.0$1') : `${integer}.0`;
    }
    return String(value);
  }
  let result = String(value);
  if (!/[.eE]/.test(result)) result += '.0';
  return result;
}

function formatTomlDate(value) {
  let timestamp;
  try { timestamp = value.getTime(); } catch { timestamp = Number.NaN; }
  const parsed = parseTomlDateToken(value.tomlText);
  if (!parsed || parsed.text !== value.tomlText || parsed.kind !== value.tomlType
    || parsed.timestamp !== timestamp)
    throw new TypeError('유효하지 않은 TomlDate는 TOML로 변환할 수 없습니다.');
  return parsed.text;
}

function Serializer(options) {
  this.maxDepth = options.maxDepth ?? TOML_DEFAULT_LIMITS.depth;
  this.numbersAsFloat = options.numbersAsFloat ?? false;
  this.maxNodes = options.maxNodes ?? TOML_DEFAULT_LIMITS.nodes;
  if (!Number.isSafeInteger(this.maxDepth) || this.maxDepth < 1
    || !Number.isSafeInteger(this.maxNodes) || this.maxNodes < 1)
    throw new TypeError('TOML 출력 제한은 1 이상의 정수여야 합니다.');
  this.seen = new Set();
  this.nodes = 0;
}

Serializer.prototype.count = function count() {
  if (++this.nodes > this.maxNodes) throw new TypeError(`TOML 출력 노드가 ${this.maxNodes}개를 넘었습니다.`);
};

Serializer.prototype.value = function value(input, depth, inline = false) {
  this.count();
  if (depth > this.maxDepth) throw new TypeError(`TOML 출력 중첩이 ${this.maxDepth}단계를 넘었습니다.`);
  if (typeof input === 'string') return escapeString(input);
  if (typeof input === 'boolean') return String(input);
  if (typeof input === 'number') return formatNumber(input, this.numbersAsFloat);
  if (typeof input === 'bigint') {
    if (input < INTEGER_MIN || input > INTEGER_MAX) throw new TypeError('TOML 정수가 64비트 범위를 벗어났습니다.');
    return String(input);
  }
  if (input instanceof TomlDate) return formatTomlDate(input);
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new TypeError('유효하지 않은 Date는 TOML로 변환할 수 없습니다.');
    return input.toISOString();
  }
  if (Array.isArray(input)) {
    this.enter(input);
    try {
      return `[ ${Array.from(input, (item) => this.valueRequired(item, depth + 1, true)).join(', ')} ]`;
    }
    finally { this.leave(input); }
  }
  if (tableLike(input) && inline) return this.inlineTable(input, depth + 1);
  throw new TypeError(`TOML이 지원하지 않는 값 형식입니다: ${input === null ? 'null' : typeof input}`);
};

Serializer.prototype.valueRequired = function valueRequired(input, depth, inline) {
  if (input === null || input === undefined)
    throw new TypeError('TOML 배열에 null 또는 undefined를 넣을 수 없습니다.');
  return this.value(input, depth, inline);
};

Serializer.prototype.enter = function enter(value) {
  if (this.seen.has(value)) throw new TypeError('순환 참조는 TOML로 변환할 수 없습니다.');
  this.seen.add(value);
};

Serializer.prototype.leave = function leave(value) { this.seen.delete(value); };

Serializer.prototype.inlineTable = function inlineTable(table, depth) {
  this.enter(table);
  try {
    const entries = Object.entries(table)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${formatKey(key)} = ${this.valueRequired(value, depth + 1, true)}`);
    return `{ ${entries.join(', ')} }`;
  } finally { this.leave(table); }
};

Serializer.prototype.arrayOfTables = function arrayOfTables(value) {
  if (!value.length) return false;
  for (let index = 0; index < value.length; index++) {
    if (!HAS(value, index) || !tableLike(value[index])) return false;
  }
  return true;
};

Serializer.prototype.table = function table(value, path, depth, emitHeader) {
  if (depth > this.maxDepth) throw new TypeError(`TOML 출력 중첩이 ${this.maxDepth}단계를 넘었습니다.`);
  this.count();
  this.enter(value);
  try {
    const scalar = [];
    const children = [];
    for (const [key, child] of Object.entries(value)) {
      if (child === null || child === undefined) continue;
      const childPath = [...path, key];
      if (tableLike(child)) children.push({ kind: 'table', value: child, path: childPath });
      else if (Array.isArray(child) && this.arrayOfTables(child)) {
        this.count();
        children.push({ kind: 'array-table', value: child, path: childPath });
      }
      else scalar.push(`${formatKey(key)} = ${this.valueRequired(child, depth + 1, false)}`);
    }
    const sections = [];
    if (emitHeader || scalar.length) sections.push(`${emitHeader ? `[${path.map(formatKey).join('.')}]${scalar.length ? '\n' : ''}` : ''}${scalar.join('\n')}`);
    for (const child of children) {
      if (child.kind === 'table') sections.push(this.table(child.value, child.path, depth + 1, true));
      else {
        for (const item of child.value) {
          const body = this.table(item, child.path, depth + 1, false);
          const header = `[[${child.path.map(formatKey).join('.')}]]`;
          sections.push(body ? `${header}\n${body}` : header);
        }
      }
    }
    return sections.filter(Boolean).join('\n\n');
  } finally { this.leave(value); }
};

export function stringify(value, options = {}) {
  if (!tableLike(value)) throw new TypeError('stringify는 최상위 객체(테이블)만 받습니다.');
  const output = new Serializer(options).table(value, [], 0, false);
  return output ? output + '\n' : '';
}

export default { parse, stringify, TomlDate, TomlError, TOML_DEFAULT_LIMITS };
