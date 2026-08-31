// RFC 9535 JSONPath parser and evaluator. This module is intentionally DOM-independent.

const HAS = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const MISSING = Symbol('jsonpath-missing');

export const JSONPATH_DEFAULT_LIMITS = Object.freeze({
  queryLength: 16 * 1024,
  selectors: 10_000,
  depth: 128,
  visits: 1_000_000,
  results: 100_000,
});

export const JSONPATH_DEFAULT_OUTPUT_LIMITS = Object.freeze({
  bytes: 16 * 1024 * 1024,
  depth: 256,
});

export class JsonPathError extends Error {
  constructor(message, index = 0, code = 'JSONPATH_SYNTAX') {
    super(`JSONPath 오류: ${message} (${index + 1}번째 문자)`);
    this.name = 'JsonPathError';
    this.code = code;
    this.index = index;
  }
}

function mergedLimits(limits = {}) {
  const result = { ...JSONPATH_DEFAULT_LIMITS, ...limits };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`JSONPath ${name} 제한은 1 이상의 안전한 정수여야 합니다.`);
  }
  return result;
}

function isNameFirst(char) {
  if (!char) return false;
  const point = char.codePointAt(0);
  return (point >= 0x41 && point <= 0x5a) || point === 0x5f
    || (point >= 0x61 && point <= 0x7a) || point >= 0x80;
}

function isNameChar(char) {
  if (isNameFirst(char)) return true;
  const point = char?.codePointAt(0);
  return point >= 0x30 && point <= 0x39;
}

function isDigit(char) {
  return char >= '0' && char <= '9';
}

function isJsonPathSpace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function invalidSurrogateIndex(value) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return index;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return index;
  }
  return -1;
}

class Parser {
  constructor(source, limits) {
    this.source = source;
    this.length = source.length;
    this.index = 0;
    this.limits = limits;
    this.selectorCount = 0;
    this.depth = 0;
  }

  error(message, code = 'JSONPATH_SYNTAX', index = this.index) {
    throw new JsonPathError(message, index, code);
  }

  peek(offset = 0) {
    return this.source[this.index + offset];
  }

  skipSpace() {
    while (isJsonPathSpace(this.peek())) this.index++;
  }

  enter() {
    if (++this.depth > this.limits.depth)
      this.error(`표현식 중첩이 ${this.limits.depth}단계를 넘었습니다.`, 'JSONPATH_DEPTH');
  }

  leave() {
    this.depth--;
  }

  bumpSelector() {
    if (++this.selectorCount > this.limits.selectors)
      this.error(`선택자가 ${this.limits.selectors}개를 넘었습니다.`, 'JSONPATH_SELECTORS');
  }

  expression(type, fields = {}, ...children) {
    const expressionDepth = 1 + Math.max(0, ...children.map((child) => child?._depth || 0));
    if (expressionDepth > this.limits.depth)
      this.error(`필터 표현식 중첩이 ${this.limits.depth}단계를 넘었습니다.`, 'JSONPATH_DEPTH');
    return { type, ...fields, _depth: expressionDepth };
  }

  parse() {
    if (this.length > this.limits.queryLength)
      this.error(`질의 길이가 ${this.limits.queryLength}자를 넘었습니다.`, 'JSONPATH_QUERY_LENGTH');
    const surrogate = invalidSurrogateIndex(this.source);
    if (surrogate >= 0)
      this.error('질의에 짝이 맞지 않는 Unicode 서로게이트가 있습니다.', 'JSONPATH_UNICODE', surrogate);
    if (this.peek() !== '$') this.error('질의는 루트 식별자 $로 시작해야 합니다.');
    this.index++;
    const segments = this.parseSegments();
    if (this.index !== this.length) this.error(`예상하지 못한 문자 ${JSON.stringify(this.peek())}입니다.`);
    return { type: 'query', base: 'root', segments, singular: isSingular(segments) };
  }

  parseSegments() {
    const segments = [];
    while (this.index < this.length) {
      const beforeSpace = this.index;
      this.skipSpace();
      if (this.peek() === '.') {
        this.index++;
        const recursive = this.peek() === '.';
        if (recursive) this.index++;
        if (this.peek() === '[') segments.push(this.parseBracket(recursive));
        else if (this.peek() === '*') {
          this.index++;
          this.bumpSelector();
          segments.push({ recursive, selectors: [{ type: 'wildcard' }] });
        } else {
          const name = this.parseName();
          this.bumpSelector();
          segments.push({ recursive, selectors: [{ type: 'name', name }] });
        }
      } else if (this.peek() === '[') segments.push(this.parseBracket(false));
      else {
        this.index = beforeSpace;
        break;
      }
    }
    return segments;
  }

  parseName() {
    const start = this.index;
    let char = String.fromCodePoint(this.source.codePointAt(this.index));
    if (!isNameFirst(char)) this.error('점 뒤에는 속성 이름이나 *가 와야 합니다.');
    this.index += char.length;
    while (this.index < this.length) {
      char = String.fromCodePoint(this.source.codePointAt(this.index));
      if (!isNameChar(char)) break;
      this.index += char.length;
    }
    return this.source.slice(start, this.index);
  }

  parseBracket(recursive) {
    const start = this.index++;
    this.enter();
    try {
      this.skipSpace();
      const selectors = [];
      if (this.index >= this.length)
        this.error('대괄호 선택자가 닫히지 않았습니다.', 'JSONPATH_SYNTAX', start);
      if (this.peek() === ']') this.error('대괄호 선택자는 비워 둘 수 없습니다.', 'JSONPATH_SYNTAX', start);
      while (true) {
        selectors.push(this.parseSelector());
        this.bumpSelector();
        this.skipSpace();
        if (this.peek() === ']') {
          this.index++;
          break;
        }
        if (this.index >= this.length)
          this.error('대괄호 선택자가 닫히지 않았습니다.', 'JSONPATH_SYNTAX', start);
        if (this.peek() !== ',') this.error('선택자 뒤에는 쉼표 또는 ]가 와야 합니다.');
        this.index++;
        this.skipSpace();
        if (this.index >= this.length)
          this.error('대괄호 선택자가 닫히지 않았습니다.', 'JSONPATH_SYNTAX', start);
        if (this.peek() === ']') this.error('마지막 선택자 뒤에는 쉼표를 둘 수 없습니다.');
      }
      return { recursive, selectors };
    } finally {
      this.leave();
    }
  }

  parseSelector() {
    this.skipSpace();
    const char = this.peek();
    if (char === '*' ) {
      this.index++;
      return { type: 'wildcard' };
    }
    if (char === '\'' || char === '"') return { type: 'name', name: this.parseString() };
    if (char === '?') {
      this.index++;
      const expression = this.parseFilterExpression();
      requireLogical(expression, this);
      return { type: 'filter', expression };
    }
    if (char === ':' || char === '-' || isDigit(char)) return this.parseIndexOrSlice();
    this.error('지원하지 않는 대괄호 선택자입니다. 이름은 따옴표로 감싸세요.');
  }

  parseString() {
    const quote = this.peek();
    const start = this.index++;
    let result = '';
    while (this.index < this.length) {
      const char = this.peek();
      if (char === quote) {
        this.index++;
        this.validateStringScalars(result, start);
        return result;
      }
      if (char.codePointAt(0) < 0x20 || char === '\n' || char === '\r')
        this.error('따옴표 문자열에 제어 문자를 직접 넣을 수 없습니다.', 'JSONPATH_SYNTAX', start);
      if (char !== '\\') {
        result += char;
        this.index++;
        continue;
      }
      const escapeIndex = this.index++;
      const escaped = this.peek();
      const simple = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '/': '/', '\\': '\\' };
      if (escaped === quote) {
        result += quote;
        this.index++;
      } else if (HAS(simple, escaped)) {
        result += simple[escaped];
        this.index++;
      } else if (escaped === 'u') {
        const digits = this.source.slice(this.index + 1, this.index + 5);
        if (!/^[0-9A-Fa-f]{4}$/.test(digits))
          this.error('Unicode 이스케이프는 \\u와 16진수 네 자리여야 합니다.', 'JSONPATH_SYNTAX', escapeIndex);
        result += String.fromCharCode(parseInt(digits, 16));
        this.index += 5;
      } else this.error('지원하지 않는 문자열 이스케이프입니다.', 'JSONPATH_SYNTAX', escapeIndex);
    }
    this.error('따옴표 문자열이 닫히지 않았습니다.', 'JSONPATH_SYNTAX', start);
  }

  validateStringScalars(value, start) {
    if (invalidSurrogateIndex(value) >= 0)
      this.error('문자열에 짝이 맞지 않는 Unicode 서로게이트가 있습니다.', 'JSONPATH_UNICODE', start);
  }

  parseInteger() {
    const start = this.index;
    if (this.peek() === '-') this.index++;
    if (!isDigit(this.peek())) this.error('배열 인덱스에는 정수가 필요합니다.', 'JSONPATH_SYNTAX', start);
    if (this.peek() === '0' && isDigit(this.peek(1)))
      this.error('배열 인덱스에 불필요한 앞자리 0을 둘 수 없습니다.', 'JSONPATH_SYNTAX', start);
    if (this.source[start] === '-' && this.peek() === '0')
      this.error('배열 인덱스에는 -0을 사용할 수 없습니다.', 'JSONPATH_SYNTAX', start);
    while (isDigit(this.peek())) this.index++;
    const token = this.source.slice(start, this.index);
    const value = Number(token);
    if (!Number.isSafeInteger(value))
      this.error('배열 인덱스는 JavaScript 안전 정수 범위여야 합니다.', 'JSONPATH_INDEX', start);
    return value;
  }

  parseIndexOrSlice() {
    this.skipSpace();
    let start = null;
    if (this.peek() !== ':') start = this.parseInteger();
    this.skipSpace();
    if (this.peek() !== ':') return { type: 'index', index: start };
    this.index++;
    this.skipSpace();
    let end = null, step = null;
    if (this.peek() !== ':' && this.peek() !== ',' && this.peek() !== ']') end = this.parseInteger();
    this.skipSpace();
    if (this.peek() === ':') {
      this.index++;
      this.skipSpace();
      if (this.peek() !== ',' && this.peek() !== ']') step = this.parseInteger();
      this.skipSpace();
    }
    return { type: 'slice', start, end, step };
  }

  parseFilterExpression() {
    this.skipSpace();
    if (this.peek() === ']' || this.peek() === ',') this.error('? 뒤에 필터 표현식이 필요합니다.');
    return this.parseOr();
  }

  parseOr() {
    let left = this.parseAnd();
    while (true) {
      this.skipSpace();
      if (this.source.slice(this.index, this.index + 2) !== '||') break;
      this.index += 2;
      const right = this.parseAnd();
      requireLogical(left, this);
      requireLogical(right, this);
      left = this.expression('or', { left, right }, left, right);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseComparison();
    while (true) {
      this.skipSpace();
      if (this.source.slice(this.index, this.index + 2) !== '&&') break;
      this.index += 2;
      const right = this.parseComparison();
      requireLogical(left, this);
      requireLogical(right, this);
      left = this.expression('and', { left, right }, left, right);
    }
    return left;
  }

  parseComparison() {
    let left = this.parseUnary();
    this.skipSpace();
    const operators = ['==', '!=', '<=', '>=', '<', '>'];
    const operator = operators.find((item) => this.source.startsWith(item, this.index));
    if (!operator) return left;
    this.index += operator.length;
    if (this.peek() === '=')
      this.error('===와 !==는 지원하지 않습니다. == 또는 !=를 사용하세요.', 'JSONPATH_UNSUPPORTED');
    const right = this.parseUnary();
    requireComparable(left, this);
    requireComparable(right, this);
    return this.expression('compare', { operator, left, right }, left, right);
  }

  parseUnary() {
    this.skipSpace();
    if (this.peek() === '!') {
      if (this.peek(1) === '=') return this.parsePrimary();
      this.index++;
      this.enter();
      try {
        const value = this.parseUnary();
        requireLogical(value, this);
        return this.expression('not', { value }, value);
      } finally {
        this.leave();
      }
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    this.skipSpace();
    const start = this.index;
    const char = this.peek();
    if (char === '(') {
      this.index++;
      this.enter();
      try {
        const value = this.parseOr();
        this.skipSpace();
        if (this.peek() !== ')') this.error('필터 표현식의 )가 필요합니다.', 'JSONPATH_SYNTAX', start);
        this.index++;
        return value;
      } finally {
        this.leave();
      }
    }
    if (char === '@' || char === '$') return this.parseFilterQuery();
    if (char === '\'' || char === '"') return this.expression('literal', { value: this.parseString() });
    if (char === '-' || isDigit(char)) return this.expression('literal', { value: this.parseNumber() });
    const identifier = this.parseIdentifier();
    if (identifier === 'true') return this.expression('literal', { value: true });
    if (identifier === 'false') return this.expression('literal', { value: false });
    if (identifier === 'null') return this.expression('literal', { value: null });
    if (identifier && this.peek() === '(') return this.parseFunction(identifier, start);
    if (identifier) this.error(`알 수 없는 필터 식별자 ${identifier}입니다.`, 'JSONPATH_UNSUPPORTED', start);
    this.error('필터 피연산자가 필요합니다.', 'JSONPATH_SYNTAX', start);
  }

  parseIdentifier() {
    const start = this.index;
    if (!/[A-Za-z_]/.test(this.peek() || '')) return '';
    this.index++;
    while (/[A-Za-z0-9_]/.test(this.peek() || '')) this.index++;
    return this.source.slice(start, this.index);
  }

  parseNumber() {
    const start = this.index;
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) this.error('올바른 JSON 숫자가 필요합니다.', 'JSONPATH_SYNTAX', start);
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.error('필터 숫자는 유한 범위여야 합니다.', 'JSONPATH_NUMBER', start);
    return value;
  }

  parseFunction(name, start) {
    const supported = new Set(['length', 'count', 'value']);
    if (!supported.has(name)) {
      const code = ['match', 'search'].includes(name) ? 'JSONPATH_UNSUPPORTED_REGEX' : 'JSONPATH_UNSUPPORTED';
      this.error(`${name}() 함수는 지원하지 않습니다. length(), count(), value()만 사용할 수 있습니다.`, code, start);
    }
    this.index++;
    this.enter();
    try {
      this.skipSpace();
      const argument = this.parseOr();
      this.skipSpace();
      if (this.peek() !== ')') this.error(`${name}() 함수는 인수 하나만 받습니다.`, 'JSONPATH_FUNCTION', start);
      this.index++;
      if (name === 'count' || name === 'value') {
        if (argument.type !== 'query')
          this.error(`${name}() 함수에는 JSONPath 질의를 전달해야 합니다.`, 'JSONPATH_FUNCTION', start);
      } else requireFunctionValue(argument, this, start);
      return this.expression('function', { name, argument }, argument);
    } finally {
      this.leave();
    }
  }

  parseFilterQuery() {
    const base = this.peek() === '$' ? 'root' : 'current';
    this.index++;
    const segments = this.parseSegments();
    return this.expression('query', { base, segments, singular: isSingular(segments) });
  }
}

function isSingular(segments) {
  return segments.every((segment) => !segment.recursive && segment.selectors.length === 1
    && ['name', 'index'].includes(segment.selectors[0].type));
}

function expressionKind(expression) {
  if (['compare', 'and', 'or', 'not'].includes(expression.type)) return 'logical';
  if (expression.type === 'query') return 'query';
  if (expression.type === 'literal' || expression.type === 'function') return 'value';
  return 'unknown';
}

function requireLogical(expression, parser) {
  const kind = expressionKind(expression);
  if (kind !== 'logical' && kind !== 'query')
    parser.error('필터 조건에는 존재 여부 질의나 비교·논리 표현식이 필요합니다.', 'JSONPATH_FILTER_TYPE');
}

function requireComparable(expression, parser) {
  if (expression.type === 'query' && !expression.singular)
    parser.error('비교식에는 결과가 하나 이하인 단일 경로만 사용할 수 있습니다.', 'JSONPATH_FILTER_TYPE');
  if (!['query', 'literal', 'function'].includes(expression.type))
    parser.error('비교할 수 없는 필터 표현식입니다.', 'JSONPATH_FILTER_TYPE');
}

function requireFunctionValue(expression, parser, start) {
  if (expression.type === 'query' && expression.singular) return;
  if (expression.type === 'literal' || expression.type === 'function') return;
  parser.error('length()에는 값 또는 단일 경로를 전달해야 합니다.', 'JSONPATH_FUNCTION', start);
}

function stateFor(limits) {
  return { limits, visits: 0 };
}

function visit(state, count = 1) {
  state.visits += count;
  if (state.visits > state.limits.visits)
    throw new JsonPathError(`평가 노드가 ${state.limits.visits}개를 넘었습니다.`, 0, 'JSONPATH_VISITS');
}

function checkResults(nodes, state) {
  if (nodes.length > state.limits.results)
    throw new JsonPathError(`결과가 ${state.limits.results}개를 넘었습니다.`, 0, 'JSONPATH_RESULTS');
  return nodes;
}

function* childNodes(node) {
  const value = node.value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) yield { value: value[index] };
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) yield { value: value[key] };
  }
}

function selectIndex(node, index) {
  if (!Array.isArray(node.value)) return null;
  const normalized = index < 0 ? node.value.length + index : index;
  if (normalized < 0 || normalized >= node.value.length) return null;
  return { value: node.value[normalized] };
}

function* normalizedSlice(length, start, end, step) {
  const stride = step ?? 1;
  if (stride === 0) return;
  const lower = stride > 0 ? 0 : -1;
  const upper = stride > 0 ? length : length - 1;
  const normalize = (value, fallback) => {
    if (value == null) return fallback;
    const shifted = value < 0 ? length + value : value;
    return Math.min(upper, Math.max(lower, shifted));
  };
  const from = normalize(start, stride > 0 ? 0 : length - 1);
  const to = normalize(end, stride > 0 ? length : -1);
  if (stride > 0) {
    for (let index = from; index < to; index += stride) yield index;
  } else {
    for (let index = from; index > to; index += stride) yield index;
  }
}

function* descendantsOrSelf(node, state) {
  const stack = [{ type: 'enter', node }], ancestors = new WeakSet();
  while (stack.length) {
    const item = stack.pop();
    if (item.type === 'leave') {
      ancestors.delete(item.value);
      continue;
    }
    if (item.type === 'children') {
      if (item.index >= item.length) continue;
      const key = item.keys ? item.keys[item.index] : item.index;
      item.index++;
      stack.push(item, { type: 'enter', node: { value: item.value[key] } });
      continue;
    }
    const current = item.node;
    const value = current.value;
    visit(state);
    yield current;
    if (!value || typeof value !== 'object') continue;
    if (ancestors.has(value))
      throw new JsonPathError('순환 참조가 있는 값은 조회할 수 없습니다.', 0, 'JSONPATH_CYCLE');
    ancestors.add(value);
    const keys = Array.isArray(value) ? null : Object.keys(value);
    stack.push(
      { type: 'leave', value },
      { type: 'children', value, keys, index: 0, length: keys ? keys.length : value.length },
    );
  }
}

function appendNode(nodes, node, state) {
  if (nodes.length >= state.limits.results)
    throw new JsonPathError(`결과가 ${state.limits.results}개를 넘었습니다.`, 0, 'JSONPATH_RESULTS');
  nodes.push(node);
}

function applySelector(node, selector, root, state, output) {
  visit(state);
  switch (selector.type) {
    case 'name':
      if (node.value && typeof node.value === 'object' && !Array.isArray(node.value)
        && HAS(node.value, selector.name))
        appendNode(output, { value: node.value[selector.name] }, state);
      break;
    case 'wildcard':
      for (const child of childNodes(node)) {
        visit(state);
        appendNode(output, child, state);
      }
      break;
    case 'index': {
      const selected = selectIndex(node, selector.index);
      if (selected) appendNode(output, selected, state);
      break;
    }
    case 'slice':
      if (!Array.isArray(node.value)) break;
      for (const index of normalizedSlice(node.value.length, selector.start, selector.end, selector.step)) {
        visit(state);
        appendNode(output, { value: node.value[index] }, state);
      }
      break;
    case 'filter':
      for (const child of childNodes(node)) {
        visit(state);
        if (evaluateLogical(selector.expression, child, root, state)) appendNode(output, child, state);
      }
      break;
  }
}

function evaluateSegments(initial, segments, root, state) {
  let nodes = initial;
  for (const segment of segments) {
    const next = [];
    for (const node of nodes) {
      const bases = segment.recursive ? descendantsOrSelf(node, state) : [node];
      for (const base of bases) {
        for (const selector of segment.selectors)
          applySelector(base, selector, root, state, next);
      }
    }
    nodes = next;
  }
  return nodes;
}

function queryNodes(query, current, root, state) {
  const initial = query.base === 'root' ? root : current;
  return evaluateSegments([initial], query.segments, root, state);
}

function comparable(expression, current, root, state) {
  if (expression.type === 'literal') return expression.value;
  if (expression.type === 'query') {
    const nodes = queryNodes(expression, current, root, state);
    return nodes.length === 1 ? nodes[0].value : MISSING;
  }
  if (expression.type === 'function') return evaluateFunction(expression, current, root, state);
  return MISSING;
}

function functionArgument(expression, current, root, state) {
  if (expression.type === 'query') {
    const nodes = queryNodes(expression, current, root, state);
    return nodes.length === 1 ? nodes[0].value : MISSING;
  }
  return comparable(expression, current, root, state);
}

function evaluateFunction(expression, current, root, state) {
  if (expression.name === 'count') return queryNodes(expression.argument, current, root, state).length;
  if (expression.name === 'value') {
    const nodes = queryNodes(expression.argument, current, root, state);
    return nodes.length === 1 ? nodes[0].value : MISSING;
  }
  const value = functionArgument(expression.argument, current, root, state);
  if (typeof value === 'string') return Array.from(value).length;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return MISSING;
}

function jsonEqual(left, right, state) {
  if (left === MISSING || right === MISSING) return left === right;
  const stack = [[left, right]], seen = new WeakMap();
  while (stack.length) {
    const [a, b] = stack.pop();
    visit(state);
    if (Object.is(a, b) || (typeof a === 'number' && typeof b === 'number' && a === b)) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b))
      return false;
    let partners = seen.get(a);
    if (partners?.has(b)) continue;
    if (!partners) {
      partners = new WeakSet();
      seen.set(a, partners);
    }
    partners.add(b);
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!HAS(b, key)) return false;
      stack.push([a[key], b[key]]);
    }
  }
  return true;
}

function evaluateComparison(expression, current, root, state) {
  const left = comparable(expression.left, current, root, state);
  const right = comparable(expression.right, current, root, state);
  if (expression.operator === '==') return jsonEqual(left, right, state);
  if (expression.operator === '!=') return !jsonEqual(left, right, state);
  const equal = jsonEqual(left, right, state);
  if (expression.operator === '<=') return equal || comparableOrder(left, right, (a, b) => a < b);
  if (expression.operator === '>=') return equal || comparableOrder(left, right, (a, b) => a > b);
  if (expression.operator === '<') return comparableOrder(left, right, (a, b) => a < b);
  return comparableOrder(left, right, (a, b) => a > b);
}

function comparableOrder(left, right, compare) {
  if (left === MISSING || right === MISSING || typeof left !== typeof right) return false;
  if (typeof left === 'number') return compare(left, right);
  if (typeof left !== 'string') return false;
  const leftPoints = Array.from(left, (char) => char.codePointAt(0));
  const rightPoints = Array.from(right, (char) => char.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index++) {
    if (leftPoints[index] === rightPoints[index]) continue;
    return compare(leftPoints[index], rightPoints[index]);
  }
  return compare(leftPoints.length, rightPoints.length);
}

function evaluateLogical(expression, current, root, state) {
  switch (expression.type) {
    case 'query': return queryNodes(expression, current, root, state).length > 0;
    case 'compare': return evaluateComparison(expression, current, root, state);
    case 'not': return !evaluateLogical(expression.value, current, root, state);
    case 'and': return evaluateLogical(expression.left, current, root, state)
      && evaluateLogical(expression.right, current, root, state);
    case 'or': return evaluateLogical(expression.left, current, root, state)
      || evaluateLogical(expression.right, current, root, state);
    default: return false;
  }
}

export function parseJsonPath(path, { limits } = {}) {
  if (typeof path !== 'string') throw new TypeError('JSONPath 질의는 문자열이어야 합니다.');
  const resolved = mergedLimits(limits);
  return new Parser(path, resolved).parse();
}

export function queryJsonPath(json, path, { limits } = {}) {
  const resolved = mergedLimits(limits);
  const query = typeof path === 'string' ? new Parser(path, resolved).parse() : path;
  if (!query || query.type !== 'query' || query.base !== 'root')
    throw new TypeError('parseJsonPath()가 반환한 루트 질의가 필요합니다.');
  const root = { value: json };
  const state = stateFor(resolved);
  return checkResults(evaluateSegments([root], query.segments, root, state), state)
    .map((node) => node.value);
}

function utf8Length(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const point = value.codePointAt(index);
    if (point > 0xffff) index++;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function jsonDataError(message, code) {
  const error = new Error(`JSON 데이터 오류: ${message}`);
  error.name = 'JsonPathDataError';
  error.code = code;
  return error;
}

function validateJsonPrimitive(value, label = '값') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw jsonDataError(`${label}이 유한한 숫자 범위를 벗어났습니다.`, 'JSONPATH_JSON_NUMBER');
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      throw jsonDataError(`${label}이 JavaScript 안전 정수 범위를 벗어났습니다.`, 'JSONPATH_JSON_NUMBER');
  } else if (typeof value === 'string' && invalidSurrogateIndex(value) >= 0) {
    throw jsonDataError(`${label}에 짝이 맞지 않는 Unicode 서로게이트가 있습니다.`, 'JSONPATH_JSON_UNICODE');
  }
}

export function parseJsonPathJson(text) {
  if (typeof text !== 'string') throw new TypeError('JSON 데이터는 문자열이어야 합니다.');
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('JSON 데이터의 문법이 올바르지 않습니다.');
  }
  const stack = [result];
  while (stack.length) {
    const value = stack.pop();
    validateJsonPrimitive(value);
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) stack.push(value[index]);
    } else {
      for (const key of Object.keys(value)) {
        validateJsonPrimitive(key, '객체 키');
        stack.push(value[key]);
      }
    }
  }
  return result;
}

export function stringifyJsonPathResult(result, options = {}) {
  const limits = { ...JSONPATH_DEFAULT_OUTPUT_LIMITS, ...options };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`JSONPath 출력 ${name} 제한은 1 이상의 안전한 정수여야 합니다.`);
  }
  const chunks = [];
  const ancestors = new WeakSet();
  let bytes = 0;
  const append = (text) => {
    bytes += utf8Length(text);
    if (bytes > limits.bytes)
      throw new JsonPathError(`출력 JSON이 ${limits.bytes}바이트를 넘었습니다.`, 0, 'JSONPATH_OUTPUT_BYTES');
    chunks.push(text);
  };
  const write = (value, depth) => {
    validateJsonPrimitive(value);
    if (value === null) return append('null');
    if (typeof value === 'string') return append(JSON.stringify(value));
    if (typeof value === 'number') return append(Object.is(value, -0) ? '0' : String(value));
    if (typeof value === 'boolean') return append(String(value));
    if (!value || typeof value !== 'object')
      throw jsonDataError('JSON으로 표현할 수 없는 값이 결과에 포함되었습니다.', 'JSONPATH_JSON_TYPE');
    if (depth > limits.depth)
      throw new JsonPathError(`출력 JSON 중첩이 ${limits.depth}단계를 넘었습니다.`, 0, 'JSONPATH_OUTPUT_DEPTH');
    if (ancestors.has(value))
      throw new JsonPathError('순환 참조가 있는 값은 출력할 수 없습니다.', 0, 'JSONPATH_CYCLE');
    ancestors.add(value);
    const array = Array.isArray(value);
    const keys = array ? null : Object.keys(value);
    const length = array ? value.length : keys.length;
    append(array ? '[' : '{');
    if (length) append('\n');
    for (let index = 0; index < length; index++) {
      if (index) append(',\n');
      append('  '.repeat(depth + 1));
      if (!array) {
        validateJsonPrimitive(keys[index], '객체 키');
        append(JSON.stringify(keys[index]));
        append(': ');
      }
      write(array ? value[index] : value[keys[index]], depth + 1);
    }
    if (length) {
      append('\n');
      append('  '.repeat(depth));
    }
    append(array ? ']' : '}');
    ancestors.delete(value);
  };
  write(result, 0);
  return chunks.join('');
}
