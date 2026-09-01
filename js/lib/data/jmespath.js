// JMESPath parser and evaluator. This module is intentionally DOM-independent.

const HAS = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const EXPRESSION_REFERENCE = Symbol('jmespath-expression');

export const JMESPATH_DEFAULT_LIMITS = Object.freeze({
  expressionLength: 64 * 1024,
  tokens: 20_000,
  depth: 256,
  nodes: 20_000,
  visits: 1_000_000,
  intermediateBytes: 16 * 1024 * 1024,
});

export const JMESPATH_DEFAULT_OUTPUT_LIMITS = Object.freeze({
  bytes: 16 * 1024 * 1024,
  depth: 256,
});

export class JmesPathError extends Error {
  constructor(message, index = 0, code = 'syntax') {
    super(message);
    this.name = 'JmesPathError';
    this.code = code;
    this.index = index;
  }
}

function mergedLimits(limits = {}) {
  const result = { ...JMESPATH_DEFAULT_LIMITS, ...limits };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`JMESPath ${name} limit must be a positive safe integer.`);
  }
  return result;
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

function isSpace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isDigit(char) {
  return char >= '0' && char <= '9';
}

function isIdentifierStart(char) {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_';
}

function isIdentifierChar(char) {
  return isIdentifierStart(char) || isDigit(char);
}

class Lexer {
  constructor(source, limits) {
    this.source = source;
    this.limits = limits;
    this.index = 0;
    this.tokens = [];
  }

  error(message, index = this.index) {
    throw new JmesPathError(message, index, 'syntax');
  }

  add(type, value = null, start = this.index) {
    if (this.tokens.length >= this.limits.tokens)
      throw new JmesPathError(`Token count exceeds ${this.limits.tokens}.`, start, 'limit-exceeded');
    this.tokens.push({ type, value, index: start });
  }

  scanJsonString(start) {
    let index = start + 1;
    while (index < this.source.length) {
      const char = this.source[index];
      if (char === '"') {
        const raw = this.source.slice(start, index + 1);
        try { return { value: JSON.parse(raw), end: index + 1 }; }
        catch { this.error('Invalid quoted identifier.', start); }
      }
      if (char === '\\') {
        index++;
        if (index >= this.source.length) break;
        if (this.source[index] === 'u') {
          const digits = this.source.slice(index + 1, index + 5);
          if (!/^[0-9A-Fa-f]{4}$/.test(digits)) this.error('Invalid Unicode escape.', index - 1);
          index += 4;
        } else if (!'"\\/bfnrt'.includes(this.source[index])) {
          this.error('Invalid quoted identifier escape.', index - 1);
        }
      } else if (char < ' ') this.error('Control characters must be escaped.', index);
      index++;
    }
    this.error('Unterminated quoted identifier.', start);
  }

  scanRawString(start) {
    let value = '';
    let index = start + 1;
    while (index < this.source.length) {
      const char = this.source[index];
      if (char === "'") return { value, end: index + 1 };
      if (char === '\\') {
        let end = index;
        while (this.source[end] === '\\') end++;
        const count = end - index;
        if (this.source[end] === "'" && count % 2 === 1) {
          value += '\\'.repeat(count - 1) + "'";
          index = end + 1;
        } else {
          value += '\\'.repeat(count);
          index = end;
        }
      } else {
        value += char;
        index++;
      }
    }
    this.error('Unterminated raw string.', start);
  }

  scanLiteral(start) {
    let raw = '';
    let index = start + 1;
    while (index < this.source.length) {
      const char = this.source[index];
      if (char === '`') {
        if (!raw.trim()) this.error('A literal cannot be empty.', start);
        let value;
        try { value = JSON.parse(raw); }
        catch { this.error('Invalid JSON literal.', start); }
        validateJsonData(value, start, true);
        return { value, end: index + 1 };
      }
      if (char === '\\' && this.source[index + 1] === '`') {
        raw += '`';
        index += 2;
      } else {
        raw += char;
        index++;
      }
    }
    this.error('Unterminated JSON literal.', start);
  }

  tokenize() {
    if (this.source.length > this.limits.expressionLength)
      throw new JmesPathError(`Expression length exceeds ${this.limits.expressionLength}.`, 0, 'limit-exceeded');
    const surrogate = invalidSurrogateIndex(this.source);
    if (surrogate >= 0)
      throw new JmesPathError('Expression contains an unpaired Unicode surrogate.', surrogate, 'syntax');

    while (this.index < this.source.length) {
      const start = this.index;
      const char = this.source[this.index++];
      if (isSpace(char)) continue;
      if (isIdentifierStart(char)) {
        while (isIdentifierChar(this.source[this.index])) this.index++;
        this.add('Identifier', this.source.slice(start, this.index), start);
        continue;
      }
      if (isDigit(char) || (char === '-' && isDigit(this.source[this.index]))) {
        while (isDigit(this.source[this.index])) this.index++;
        this.add('Number', Number(this.source.slice(start, this.index)), start);
        continue;
      }
      if (char === '"') {
        const token = this.scanJsonString(start);
        if (!token.value.length) this.error('A quoted identifier cannot be empty.', start);
        if (invalidSurrogateIndex(token.value) >= 0)
          this.error('A quoted identifier contains an unpaired Unicode surrogate.', start);
        this.index = token.end;
        this.add('QuotedIdentifier', token.value, start);
        continue;
      }
      if (char === "'") {
        const token = this.scanRawString(start);
        this.index = token.end;
        this.add('Literal', token.value, start);
        continue;
      }
      if (char === '`') {
        const token = this.scanLiteral(start);
        this.index = token.end;
        this.add('Literal', token.value, start);
        continue;
      }

      const next = this.source[this.index];
      if (char === '[' && next === ']') {
        this.index++;
        this.add('Flatten', null, start);
      } else if (char === '[' && next === '?') {
        this.index++;
        this.add('Filter', null, start);
      } else if (char === '|' && next === '|') {
        this.index++;
        this.add('Or', null, start);
      } else if (char === '&' && next === '&') {
        this.index++;
        this.add('And', null, start);
      } else if (char === '=' && next === '=') {
        this.index++;
        this.add('Comparator', '==', start);
      } else if (char === '!' && next === '=') {
        this.index++;
        this.add('Comparator', '!=', start);
      } else if ((char === '<' || char === '>') && next === '=') {
        this.index++;
        this.add('Comparator', char + '=', start);
      } else {
        const type = {
          '.': 'Dot', '*': 'Star', '@': 'Current', '&': 'Expref', '!': 'Not',
          '|': 'Pipe', '<': 'Comparator', '>': 'Comparator', '[': 'Lbracket',
          ']': 'Rbracket', '{': 'Lbrace', '}': 'Rbrace', '(': 'Lparen',
          ')': 'Rparen', ',': 'Comma', ':': 'Colon',
        }[char];
        if (!type) this.error(`Unexpected character ${JSON.stringify(char)}.`, start);
        this.add(type, type === 'Comparator' ? char : null, start);
      }
    }
    this.tokens.push({ type: 'EOF', value: null, index: this.source.length });
    return this.tokens;
  }
}

const BINDING_POWER = Object.freeze({
  Pipe: 1,
  Or: 2,
  And: 3,
  Comparator: 5,
  Flatten: 9,
  Star: 20,
  Filter: 21,
  Dot: 40,
  Not: 45,
  Lbrace: 50,
  Lbracket: 55,
  Lparen: 60,
});

const IDENTITY = Object.freeze({ type: 'Identity' });

class Parser {
  constructor(tokens, limits) {
    this.tokens = tokens;
    this.limits = limits;
    this.index = 0;
    this.depth = 0;
    this.nodes = 0;
  }

  peek(offset = 0) {
    return this.tokens[Math.max(0, Math.min(this.index + offset, this.tokens.length - 1))];
  }

  take(type) {
    const token = this.peek();
    if (type && token.type !== type)
      this.error(`Expected ${type}, found ${token.type}.`, token);
    this.index++;
    return token;
  }

  error(message, token = this.peek(), code = 'syntax') {
    throw new JmesPathError(message, token.index, code);
  }

  node(type, fields = {}, token = this.peek(-1)) {
    if (++this.nodes > this.limits.nodes)
      this.error(`Expression node count exceeds ${this.limits.nodes}.`, token, 'limit-exceeded');
    return { type, ...fields };
  }

  withDepth(callback) {
    if (++this.depth > this.limits.depth)
      this.error(`Expression nesting exceeds ${this.limits.depth}.`, this.peek(), 'limit-exceeded');
    try { return callback(); }
    finally { this.depth--; }
  }

  parse() {
    if (this.peek().type === 'EOF') this.error('Expression cannot be empty.');
    const result = this.expression(0);
    if (this.peek().type !== 'EOF')
      this.error(`Unexpected token ${this.peek().type}.`);
    return result;
  }

  expression(rightPower) {
    return this.withDepth(() => {
      const first = this.take();
      let left = this.nud(first);
      while (rightPower < (BINDING_POWER[this.peek().type] || 0)) {
        const operator = this.take();
        left = this.led(operator, left);
      }
      return left;
    });
  }

  nud(token) {
    switch (token.type) {
      case 'Identifier':
        if (this.peek().type === 'Lparen') return this.functionExpression(token);
        return this.node('Field', { name: token.value }, token);
      case 'QuotedIdentifier':
        if (this.peek().type === 'Lparen') this.error('Quoted identifiers cannot name functions.', token);
        return this.node('Field', { name: token.value }, token);
      case 'Current': return IDENTITY;
      case 'Literal': return this.node('Literal', { value: token.value }, token);
      case 'Not': return this.node('Not', { expression: this.expression(BINDING_POWER.Not) }, token);
      case 'Expref': return this.node('Expref', { expression: this.expression(0) }, token);
      case 'Lparen': {
        const expression = this.expression(0);
        this.take('Rparen');
        return this.node('Group', { expression }, token);
      }
      case 'Lbracket': return this.bracketNud(token);
      case 'Lbrace': return this.multiHash(token);
      case 'Star': return this.node('Projection', {
        source: IDENTITY, expression: IDENTITY, kind: 'object', predicate: null,
        stopPower: BINDING_POWER.Star,
      }, token);
      case 'Flatten': return this.node('Projection', {
        source: IDENTITY, expression: IDENTITY, kind: 'flatten', predicate: null,
        stopPower: BINDING_POWER.Flatten,
      }, token);
      case 'Filter': return this.filterProjection(IDENTITY, token);
      default: this.error(`Unexpected token ${token.type}.`, token);
    }
  }

  led(token, left) {
    switch (token.type) {
      case 'Pipe': return this.node('Pipe', { left, right: this.expression(BINDING_POWER.Pipe) }, token);
      case 'Or': return this.node('Or', { left, right: this.expression(BINDING_POWER.Or) }, token);
      case 'And': return this.node('And', { left, right: this.expression(BINDING_POWER.And) }, token);
      case 'Comparator': return this.node('Comparator', {
        operator: token.value, left, right: this.expression(BINDING_POWER.Comparator),
      }, token);
      case 'Dot': return this.dot(left, token);
      case 'Lbracket': return this.bracketLed(left, token);
      case 'Flatten': return this.attach(left, this.node('Projection', {
        source: IDENTITY, expression: IDENTITY, kind: 'flatten', predicate: null,
        stopPower: BINDING_POWER.Flatten,
      }, token), token, BINDING_POWER.Flatten);
      case 'Filter': return this.attach(left, this.filterProjection(IDENTITY, token), token);
      case 'Lparen': this.error('Only unquoted function names can be called.', token);
      case 'Lbrace': this.error('A multi-select hash must follow a dot.', token);
      case 'Star': this.error('A wildcard must follow a dot or open bracket.', token);
      default: this.error(`Unexpected operator ${token.type}.`, token);
    }
  }

  attach(left, operation, token, power = BINDING_POWER[token.type]) {
    if (left.type === 'Projection' && power > left.stopPower) {
      left.expression = this.compose(left.expression, operation, token, power);
      return left;
    }
    if (operation.type === 'Projection') {
      operation.source = left;
      return operation;
    }
    return this.node('Subexpression', { left, right: operation }, token);
  }

  compose(left, right, token, power = Number.MAX_SAFE_INTEGER) {
    if (left === IDENTITY) return right;
    if (left.type === 'Projection' && power > left.stopPower) {
      left.expression = this.compose(left.expression, right, token, power);
      return left;
    }
    return this.node('Subexpression', { left, right }, token);
  }

  dot(left, token) {
    const allowed = new Set(['Identifier', 'QuotedIdentifier', 'Star', 'Lbracket', 'Lbrace']);
    if (!allowed.has(this.peek().type)) this.error('A dot must be followed by a field, wildcard, list, or hash.');
    let right;
    if (this.peek().type === 'Lbracket') {
      const open = this.take();
      right = this.multiList(open);
    } else if (this.peek().type === 'Lbrace') {
      const open = this.take();
      right = this.multiHash(open);
    } else {
      right = this.expression(BINDING_POWER.Dot - 1);
    }
    if (left.type === 'Projection' && BINDING_POWER.Dot > left.stopPower) {
      left.expression = this.compose(left.expression, right, token, BINDING_POWER.Dot);
      return left;
    }
    return this.node('Subexpression', { left, right }, token);
  }

  functionExpression(nameToken) {
    this.take('Lparen');
    const args = [];
    if (this.peek().type !== 'Rparen') {
      while (true) {
        args.push(this.expression(0));
        if (this.peek().type !== 'Comma') break;
        this.take('Comma');
        if (this.peek().type === 'Rparen') this.error('A function argument cannot be empty.');
      }
    }
    this.take('Rparen');
    return this.node('Function', { name: nameToken.value, args }, nameToken);
  }

  bracketNud(token) {
    if (this.peek().type === 'Number' || this.peek().type === 'Colon')
      return this.indexOrSlice(IDENTITY, token);
    if (this.peek().type === 'Star' && this.peek(1).type === 'Rbracket') {
      this.take('Star');
      this.take('Rbracket');
      return this.node('Projection', {
        source: IDENTITY, expression: IDENTITY, kind: 'array', predicate: null,
        stopPower: BINDING_POWER.Star,
      }, token);
    }
    return this.multiList(token);
  }

  bracketLed(left, token) {
    if (this.peek().type === 'Number' || this.peek().type === 'Colon') {
      const operation = this.indexOrSlice(IDENTITY, token);
      return this.attach(left, operation, token);
    }
    if (this.peek().type === 'Star') {
      this.take('Star');
      this.take('Rbracket');
      return this.attach(left, this.node('Projection', {
        source: IDENTITY, expression: IDENTITY, kind: 'array', predicate: null,
        stopPower: BINDING_POWER.Star,
      }, token), token, BINDING_POWER.Lbracket);
    }
    this.error('Only an index, slice, or wildcard may follow an expression inside brackets.', token);
  }

  indexOrSlice(source, token) {
    let start = null;
    if (this.peek().type === 'Number') start = this.take('Number').value;
    if (this.peek().type !== 'Colon') {
      this.take('Rbracket');
      return this.node('Index', { source, index: start }, token);
    }
    this.take('Colon');
    let stop = null;
    let step = null;
    if (this.peek().type === 'Number') stop = this.take('Number').value;
    if (this.peek().type === 'Colon') {
      this.take('Colon');
      if (this.peek().type === 'Number') step = this.take('Number').value;
    }
    this.take('Rbracket');
    if (step === 0) this.error('A slice step cannot be zero.', token, 'invalid-value');
    return this.node('Projection', {
      source, expression: IDENTITY, kind: 'slice', predicate: null,
      slice: { start, stop, step },
      stopPower: BINDING_POWER.Star,
    }, token);
  }

  multiList(token) {
    if (this.peek().type === 'Rbracket') this.error('A multi-select list cannot be empty.', token);
    const expressions = [];
    while (true) {
      expressions.push(this.expression(0));
      if (this.peek().type !== 'Comma') break;
      this.take('Comma');
      if (this.peek().type === 'Rbracket') this.error('A list item cannot be empty.');
    }
    this.take('Rbracket');
    return this.node('MultiList', { expressions }, token);
  }

  multiHash(token) {
    if (this.peek().type === 'Rbrace') this.error('A multi-select hash cannot be empty.', token);
    const entries = [];
    while (true) {
      const key = this.peek();
      if (key.type !== 'Identifier' && key.type !== 'QuotedIdentifier')
        this.error('A hash key must be an identifier.', key);
      this.take();
      this.take('Colon');
      entries.push({ key: key.value, expression: this.expression(0) });
      if (this.peek().type !== 'Comma') break;
      this.take('Comma');
      if (this.peek().type === 'Rbrace') this.error('A hash entry cannot be empty.');
    }
    this.take('Rbrace');
    return this.node('MultiHash', { entries }, token);
  }

  filterProjection(source, token) {
    const predicate = this.expression(0);
    this.take('Rbracket');
    return this.node('Projection', {
      source, expression: IDENTITY, kind: 'filter', predicate,
      stopPower: BINDING_POWER.Filter,
    }, token);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (isObject(value)) return 'object';
  return typeof value;
}

function isFalse(value, evaluator = null) {
  if (isObject(value)) {
    const keys = Object.keys(value);
    evaluator?.spend(keys.length);
    return keys.length === 0;
  }
  return value === null || value === false || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function deepEqual(left, right, evaluator) {
  const stack = [[left, right]];
  while (stack.length) {
    evaluator.spend();
    const [a, b] = stack.pop();
    if (a === b) continue;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      evaluator.spend(a.length);
      for (let index = 0; index < a.length; index++) stack.push([a[index], b[index]]);
      continue;
    }
    if (isObject(a) && isObject(b)) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      evaluator.spend(aKeys.length + bKeys.length);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) {
        if (!HAS(b, key)) return false;
        stack.push([a[key], b[key]]);
      }
      continue;
    }
    return false;
  }
  return true;
}

function compareCodePoints(left, right, evaluator) {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    evaluator.spend();
    const leftPoint = left.codePointAt(leftIndex);
    const rightPoint = right.codePointAt(rightIndex);
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
  return leftIndex === left.length ? (rightIndex === right.length ? 0 : -1) : 1;
}

function safeSet(object, key, value) {
  Object.defineProperty(object, key, {
    value, enumerable: true, configurable: true, writable: true,
  });
}

function normalizeSliceIndex(value, length, step, fallback) {
  if (value === null) return fallback;
  let result = value < 0 ? value + length : value;
  if (step > 0) return Math.max(0, Math.min(length, result));
  return Math.max(-1, Math.min(length - 1, result));
}

function sliceArray(value, slice, evaluator) {
  const step = slice.step === null ? 1 : slice.step;
  const start = normalizeSliceIndex(slice.start, value.length, step, step > 0 ? 0 : value.length - 1);
  const stop = normalizeSliceIndex(slice.stop, value.length, step, step > 0 ? value.length : -1);
  const result = [];
  if (step > 0) {
    for (let index = start; index < stop; index += step) {
      evaluator.spend();
      result.push(value[index]);
    }
  } else {
    for (let index = start; index > stop; index += step) {
      evaluator.spend();
      result.push(value[index]);
    }
  }
  return result;
}

function functionError(name, code, detail) {
  return new JmesPathError(`${name}(): ${detail}`, 0, code);
}

function checkArity(name, args, minimum, maximum = minimum) {
  if (args.length < minimum || args.length > maximum) {
    const expected = minimum === maximum ? String(minimum) : `${minimum}..${maximum}`;
    throw functionError(name, 'invalid-arity', `expected ${expected} arguments, received ${args.length}`);
  }
}

function requireType(name, value, types) {
  const actual = typeOf(value);
  if (!types.includes(actual))
    throw functionError(name, 'invalid-type', `expected ${types.join('|')}, received ${actual}`);
  return value;
}

function requireTypedArray(name, value, allowed, evaluator) {
  requireType(name, value, ['array']);
  if (value.length === 0) return value;
  const first = typeOf(value[0]);
  if (!allowed.includes(first))
    throw functionError(name, 'invalid-type', `expected array[${allowed.join('|')}].`);
  for (const item of value) {
    evaluator.spend();
    if (typeOf(item) !== first)
      throw functionError(name, 'invalid-type', `expected array[${allowed.join('|')}].`);
  }
  return value;
}

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const FUNCTIONS = Object.freeze({
  abs(args) {
    checkArity('abs', args, 1);
    return Math.abs(requireType('abs', args[0], ['number']));
  },
  avg(args, evaluator) {
    checkArity('avg', args, 1);
    const values = requireTypedArray('avg', args[0], ['number'], evaluator);
    if (!values.length) return null;
    let sum = 0;
    for (const value of values) {
      evaluator.spend();
      sum += value;
    }
    return sum / values.length;
  },
  contains(args, evaluator) {
    checkArity('contains', args, 2);
    const subject = requireType('contains', args[0], ['array', 'string']);
    if (typeof subject === 'string') {
      requireType('contains', args[1], ['string']);
      evaluator.spend(Math.max(1, subject.length));
      return subject.includes(args[1]);
    }
    for (const value of subject) {
      evaluator.spend();
      if (deepEqual(value, args[1], evaluator)) return true;
    }
    return false;
  },
  ceil(args) {
    checkArity('ceil', args, 1);
    return Math.ceil(requireType('ceil', args[0], ['number']));
  },
  ends_with(args, evaluator) {
    checkArity('ends_with', args, 2);
    const subject = requireType('ends_with', args[0], ['string']);
    const suffix = requireType('ends_with', args[1], ['string']);
    evaluator.spend(Math.max(1, suffix.length));
    return subject.endsWith(suffix);
  },
  floor(args) {
    checkArity('floor', args, 1);
    return Math.floor(requireType('floor', args[0], ['number']));
  },
  join(args, evaluator) {
    checkArity('join', args, 2);
    const separator = requireType('join', args[0], ['string']);
    const values = requireTypedArray('join', args[1], ['string'], evaluator);
    let bytes = values.length > 1 ? utf8Length(separator, evaluator) * (values.length - 1) : 0;
    for (const value of values) {
      bytes += utf8Length(value, evaluator);
      evaluator.ensureIntermediateBytes(bytes);
    }
    evaluator.ensureIntermediateBytes(bytes);
    return values.join(separator);
  },
  keys(args, evaluator) {
    checkArity('keys', args, 1);
    const keys = Object.keys(requireType('keys', args[0], ['object']));
    evaluator.spend(keys.length);
    return keys;
  },
  length(args, evaluator) {
    checkArity('length', args, 1);
    const value = requireType('length', args[0], ['string', 'array', 'object']);
    if (typeof value === 'string') {
      let length = 0;
      for (const _char of value) {
        evaluator.spend();
        length++;
      }
      return length;
    }
    if (Array.isArray(value)) return value.length;
    const keys = Object.keys(value);
    evaluator.spend(keys.length);
    return keys.length;
  },
  max(args, evaluator) {
    checkArity('max', args, 1);
    const values = requireTypedArray('max', args[0], ['number', 'string'], evaluator);
    if (!values.length) return null;
    let best = values[0];
    for (let index = 1; index < values.length; index++) {
      evaluator.spend();
      const value = values[index];
      if (typeOf(value) === 'string' ? compareCodePoints(value, best, evaluator) > 0 : value > best)
        best = value;
    }
    return best;
  },
  merge(args, evaluator) {
    const result = {};
    for (const value of args) {
      evaluator.spend();
      requireType('merge', value, ['object']);
      for (const [key, child] of Object.entries(value)) {
        evaluator.spend();
        safeSet(result, key, child);
      }
    }
    return result;
  },
  min(args, evaluator) {
    checkArity('min', args, 1);
    const values = requireTypedArray('min', args[0], ['number', 'string'], evaluator);
    if (!values.length) return null;
    let best = values[0];
    for (let index = 1; index < values.length; index++) {
      evaluator.spend();
      const value = values[index];
      if (typeOf(value) === 'string' ? compareCodePoints(value, best, evaluator) < 0 : value < best)
        best = value;
    }
    return best;
  },
  not_null(args, evaluator) {
    checkArity('not_null', args, 1, Number.MAX_SAFE_INTEGER);
    for (const value of args) {
      evaluator.spend();
      if (value !== null) return value;
    }
    return null;
  },
  reverse(args, evaluator) {
    checkArity('reverse', args, 1);
    const value = requireType('reverse', args[0], ['string', 'array']);
    if (typeof value === 'string') {
      const points = Array.from(value);
      evaluator.spend(points.length);
      return points.reverse().join('');
    }
    evaluator.spend(value.length);
    return value.slice().reverse();
  },
  sort(args, evaluator) {
    checkArity('sort', args, 1);
    const values = requireTypedArray('sort', args[0], ['number', 'string'], evaluator);
    return values.slice().sort((left, right) => {
      evaluator.spend();
      return typeof left === 'string' ? compareCodePoints(left, right, evaluator) : left - right;
    });
  },
  starts_with(args, evaluator) {
    checkArity('starts_with', args, 2);
    const subject = requireType('starts_with', args[0], ['string']);
    const prefix = requireType('starts_with', args[1], ['string']);
    evaluator.spend(Math.max(1, prefix.length));
    return subject.startsWith(prefix);
  },
  sum(args, evaluator) {
    checkArity('sum', args, 1);
    const values = requireTypedArray('sum', args[0], ['number'], evaluator);
    let sum = 0;
    for (const value of values) {
      evaluator.spend();
      sum += value;
    }
    return sum;
  },
  to_array(args) {
    checkArity('to_array', args, 1);
    return Array.isArray(args[0]) ? args[0] : [args[0]];
  },
  to_string(args, evaluator) {
    checkArity('to_string', args, 1);
    if (typeof args[0] === 'string') return args[0];
    return serializeJson(args[0], {
      bytes: evaluator.limits.intermediateBytes,
      depth: JMESPATH_DEFAULT_OUTPUT_LIMITS.depth,
    }, false, evaluator);
  },
  to_number(args, evaluator) {
    checkArity('to_number', args, 1);
    if (typeOf(args[0]) === 'number') return args[0];
    if (typeof args[0] !== 'string') return null;
    evaluator.spend(Math.max(1, args[0].length));
    if (!JSON_NUMBER.test(args[0])) return null;
    const value = Number(args[0]);
    return Number.isFinite(value) ? value : null;
  },
  type(args) {
    checkArity('type', args, 1);
    return typeOf(args[0]);
  },
  values(args, evaluator) {
    checkArity('values', args, 1);
    const values = Object.values(requireType('values', args[0], ['object']));
    evaluator.spend(values.length);
    return values;
  },
});

class Evaluator {
  constructor(limits) {
    this.limits = limits;
    this.visits = 0;
  }

  spend(amount = 1) {
    if (amount < 0 || !Number.isSafeInteger(amount))
      throw new TypeError('JMESPath evaluation work must be a non-negative safe integer.');
    if (amount > this.limits.visits - this.visits)
      throw new JmesPathError(`Evaluation count exceeds ${this.limits.visits}.`, 0, 'limit-exceeded');
    this.visits += amount;
  }

  ensureIntermediateBytes(bytes) {
    if (bytes > this.limits.intermediateBytes)
      throw new JmesPathError(`Intermediate output exceeds ${this.limits.intermediateBytes} bytes.`,
        0, 'output-too-large');
  }

  visit(node, value) {
    this.spend();
    switch (node.type) {
      case 'Identity': return value;
      case 'Group': return this.visit(node.expression, value);
      case 'Literal': return node.value;
      case 'Field': return isObject(value) && HAS(value, node.name) ? value[node.name] : null;
      case 'Subexpression': return this.visit(node.right, this.visit(node.left, value));
      case 'Index': {
        const source = this.visit(node.source, value);
        if (!Array.isArray(source)) return null;
        const index = node.index < 0 ? source.length + node.index : node.index;
        return index >= 0 && index < source.length ? source[index] : null;
      }
      case 'Projection': return this.projection(node, value);
      case 'MultiList': {
        if (value === null) return null;
        return node.expressions.map((expression) => this.visit(expression, value));
      }
      case 'MultiHash': {
        if (value === null) return null;
        const result = {};
        for (const entry of node.entries) safeSet(result, entry.key, this.visit(entry.expression, value));
        return result;
      }
      case 'Pipe': return this.visit(node.right, this.visit(node.left, value));
      case 'Or': {
        const left = this.visit(node.left, value);
        return isFalse(left, this) ? this.visit(node.right, value) : left;
      }
      case 'And': {
        const left = this.visit(node.left, value);
        return isFalse(left, this) ? left : this.visit(node.right, value);
      }
      case 'Not': return isFalse(this.visit(node.expression, value), this);
      case 'Comparator': return this.compare(node, value);
      case 'Expref': return { [EXPRESSION_REFERENCE]: node.expression };
      case 'Function': return this.callFunction(node, value);
      default: throw new JmesPathError(`Unknown AST node ${node.type}.`, 0, 'internal');
    }
  }

  projection(node, value) {
    let source = this.visit(node.source, value);
    if (node.kind === 'object') {
      if (!isObject(source)) return null;
      source = Object.values(source);
      this.spend(source.length);
    } else {
      if (!Array.isArray(source)) return null;
      if (node.kind === 'flatten') {
        const flattened = [];
        for (const item of source) {
          if (Array.isArray(item)) {
            for (const child of item) {
              this.spend();
              flattened.push(child);
            }
          } else {
            this.spend();
            flattened.push(item);
          }
        }
        source = flattened;
      } else if (node.kind === 'slice') source = sliceArray(source, node.slice, this);
      else if (node.kind === 'filter')
        source = source.filter((item) => !isFalse(this.visit(node.predicate, item), this));
    }
    const result = [];
    for (const item of source) {
      const projected = this.visit(node.expression, item);
      if (projected !== null) result.push(projected);
    }
    return result;
  }

  compare(node, value) {
    const left = this.visit(node.left, value);
    const right = this.visit(node.right, value);
    if (node.operator === '==') return deepEqual(left, right, this);
    if (node.operator === '!=') return !deepEqual(left, right, this);
    if (typeof left !== 'number' || typeof right !== 'number') return null;
    if (node.operator === '<') return left < right;
    if (node.operator === '<=') return left <= right;
    if (node.operator === '>') return left > right;
    return left >= right;
  }

  expressionReference(name, value) {
    if (!value || !HAS(value, EXPRESSION_REFERENCE))
      throw functionError(name, 'invalid-type', 'expected an expression reference.');
    return value[EXPRESSION_REFERENCE];
  }

  byFunction(name, args, direction) {
    checkArity(name, args, 2);
    const values = requireType(name, args[0], ['array']);
    const expression = this.expressionReference(name, args[1]);
    if (!values.length) return name === 'sort_by' ? [] : null;
    const decorated = values.map((item, index) => ({ item, index, key: this.visit(expression, item) }));
    const keyType = typeOf(decorated[0].key);
    if (!['number', 'string'].includes(keyType))
      throw functionError(name, 'invalid-type', 'expression results must all be numbers or all be strings.');
    for (const item of decorated) {
      this.spend();
      if (typeOf(item.key) !== keyType)
        throw functionError(name, 'invalid-type',
          'expression results must all be numbers or all be strings.');
    }
    const compare = (left, right) => {
      this.spend();
      return keyType === 'string'
        ? compareCodePoints(left.key, right.key, this) : left.key - right.key;
    };
    if (name === 'sort_by') return decorated.sort((left, right) => compare(left, right) || left.index - right.index)
      .map((entry) => entry.item);
    return decorated.reduce((best, item) => direction * compare(item, best) > 0 ? item : best).item;
  }

  callFunction(node, value) {
    const args = node.args.map((arg) => this.visit(arg, value));
    if (node.name === 'map') {
      checkArity('map', args, 2);
      const expression = this.expressionReference('map', args[0]);
      return requireType('map', args[1], ['array']).map((item) => this.visit(expression, item));
    }
    if (node.name === 'max_by') return this.byFunction('max_by', args, 1);
    if (node.name === 'min_by') return this.byFunction('min_by', args, -1);
    if (node.name === 'sort_by') return this.byFunction('sort_by', args, 1);
    const implementation = FUNCTIONS[node.name];
    if (!implementation) throw functionError(node.name, 'unknown-function', 'unknown function.');
    return implementation(args, this);
  }
}

export function compile(expression, options = {}) {
  if (typeof expression !== 'string') throw new TypeError('JMESPath expression must be a string.');
  const limits = mergedLimits(options.limits);
  const tokens = new Lexer(expression, limits).tokenize();
  const ast = new Parser(tokens, limits).parse();
  return Object.freeze({ ast, limits });
}

export function search(value, expression, options = {}) {
  const compiled = typeof expression === 'string' ? compile(expression, options) : expression;
  if (!compiled?.ast || !compiled?.limits)
    throw new TypeError('JMESPath expression must be a string or compiled expression.');
  return new Evaluator(compiled.limits).visit(compiled.ast, value);
}

function utf8Length(value, evaluator = null) {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    evaluator?.spend();
    const point = value.codePointAt(index);
    if (point > 0xffff) index++;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function jsonDataError(message, code = 'invalid-value', index = 0) {
  const error = new JmesPathError(message, index, code);
  error.name = 'JmesPathDataError';
  return error;
}

function validateJsonData(root, index = 0, literal = false) {
  const stack = [{ value: root, depth: 0 }];
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw jsonDataError('JSON number is outside the finite range.', 'invalid-value', index);
      if (Number.isInteger(value) && !Number.isSafeInteger(value))
        throw jsonDataError('JSON integer is outside the JavaScript safe range.', 'invalid-value', index);
    } else if (typeof value === 'string' && invalidSurrogateIndex(value) >= 0) {
      throw jsonDataError('JSON contains an unpaired Unicode surrogate.', 'invalid-value', index);
    }
    if (!value || typeof value !== 'object') continue;
    if (depth >= JMESPATH_DEFAULT_OUTPUT_LIMITS.depth)
      throw jsonDataError(`JSON nesting exceeds ${JMESPATH_DEFAULT_OUTPUT_LIMITS.depth}.`,
        literal ? 'invalid-value' : 'input-too-deep', index);
    if (Array.isArray(value)) {
      for (const child of value) stack.push({ value: child, depth: depth + 1 });
    } else {
      for (const [key, child] of Object.entries(value)) {
        if (invalidSurrogateIndex(key) >= 0)
          throw jsonDataError('A JSON object key contains an unpaired Unicode surrogate.',
            literal ? 'invalid-value' : 'input-unicode', index);
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return root;
}

export function parseJson(text) {
  if (typeof text !== 'string') throw new TypeError('JMESPath JSON input must be a string.');
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('JSON 데이터의 문법이 올바르지 않습니다.'); }
  return validateJsonData(value);
}

export function formatError(error) {
  if (!error?.code) return error?.message || String(error);
  const position = Number.isInteger(error.index) ? ` (${error.index + 1}번째 문자)` : '';
  const functionName = error.message?.match(/^([A-Za-z_][A-Za-z0-9_]*)\(\)/)?.[1];
  const messages = {
    'syntax': `JMESPath 표현식의 문법이 올바르지 않습니다${position}.`,
    'invalid-type': `JMESPath 함수${functionName ? ` "${functionName}"` : ''}의 인수 타입이 올바르지 않습니다.`,
    'invalid-arity': `JMESPath 함수${functionName ? ` "${functionName}"` : ''}의 인수 개수가 올바르지 않습니다.`,
    'unknown-function': `알 수 없는 JMESPath 함수입니다: ${functionName || '이름 없음'}`,
    'invalid-value': 'JMESPath에서 처리할 수 없는 JSON 숫자 또는 값입니다.',
    'limit-exceeded': 'JMESPath 표현식 또는 평가 작업이 허용된 복잡도를 넘었습니다.',
    'input-too-deep': 'JSON 데이터 중첩은 최대 256단계까지 처리할 수 있습니다.',
    'input-unicode': 'JSON 데이터에 짝이 맞지 않는 Unicode 서로게이트가 있습니다.',
    'output-too-large': 'JMESPath 출력은 최대 16 MiB까지 처리할 수 있습니다.',
    'output-too-deep': 'JMESPath 출력 중첩은 최대 256단계까지 처리할 수 있습니다.',
  };
  return messages[error.code] || `JMESPath 처리 오류: ${error.message}`;
}

function writeJsonString(value, append, evaluator) {
  append('"');
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    append(buffer);
    buffer = '';
  };
  for (let index = 0; index < value.length; index++) {
    evaluator?.spend();
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw jsonDataError('The result contains an unpaired Unicode surrogate.', 'invalid-result');
      buffer += value[index] + value[++index];
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw jsonDataError('The result contains an unpaired Unicode surrogate.', 'invalid-result');
    } else if (value[index] === '"') buffer += '\\"';
    else if (value[index] === '\\') buffer += '\\\\';
    else if (code === 0x08) buffer += '\\b';
    else if (code === 0x0c) buffer += '\\f';
    else if (code === 0x0a) buffer += '\\n';
    else if (code === 0x0d) buffer += '\\r';
    else if (code === 0x09) buffer += '\\t';
    else if (code <= 0x1f) buffer += `\\u${code.toString(16).padStart(4, '0')}`;
    else buffer += value[index];
    if (buffer.length >= 8 * 1024) flush();
  }
  flush();
  append('"');
}

function serializeJson(value, maximum, pretty, evaluator = null) {
  for (const [name, limit] of Object.entries(maximum)) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new TypeError(`JMESPath output ${name} limit must be a positive safe integer.`);
  }
  const chunks = [];
  const ancestors = new WeakSet();
  let bytes = 0;
  const append = (text) => {
    bytes += utf8Length(text);
    if (bytes > maximum.bytes)
      throw new JmesPathError(`Output exceeds ${maximum.bytes} bytes.`, 0, 'output-too-large');
    chunks.push(text);
  };
  const write = (item, depth, indent) => {
    evaluator?.spend();
    if (item === null) return append('null');
    if (typeof item === 'string') return writeJsonString(item, append, evaluator);
    if (typeof item === 'number') {
      validateJsonData(item);
      return append(Object.is(item, -0) ? '0' : String(item));
    }
    if (typeof item === 'boolean') return append(String(item));
    if (!item || typeof item !== 'object')
      throw jsonDataError('The result contains a value that JSON cannot represent.', 'invalid-result');
    if (depth >= maximum.depth)
      throw new JmesPathError(`Output nesting exceeds ${maximum.depth}.`, 0, 'output-too-deep');
    if (ancestors.has(item))
      throw new JmesPathError('A cyclic result cannot be serialized.', 0, 'invalid-result');
    ancestors.add(item);
    const array = Array.isArray(item);
    const keys = array ? null : Object.keys(item);
    const length = array ? item.length : keys.length;
    evaluator?.spend(length);
    if (!length) append(array ? '[]' : '{}');
    else {
      append(array ? '[' : '{');
      if (pretty) append('\n');
      for (let index = 0; index < length; index++) {
        const key = array ? null : keys[index];
        const child = array ? item[index] : item[key];
        if (pretty) append(indent + '  ');
        if (!array) {
          writeJsonString(key, append, evaluator);
          append(pretty ? ': ' : ':');
        }
        write(child, depth + 1, pretty ? indent + '  ' : '');
        if (index + 1 < length) append(',');
        if (pretty) append('\n');
      }
      if (pretty) append(indent);
      append(array ? ']' : '}');
    }
    ancestors.delete(item);
  };
  write(value, 0, '');
  return chunks.join('');
}

export function stringifyResult(value, limits = {}) {
  return serializeJson(value, { ...JMESPATH_DEFAULT_OUTPUT_LIMITS, ...limits }, true);
}
