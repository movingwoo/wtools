// DOM-independent JavaScript, CSS, and HTML formatter/minifier.
// The scanners keep quoted strings, comments, regular expressions, template literals,
// and raw HTML elements opaque so formatting never rewrites their contents.

const MAX_NESTING = 256;
const MAX_OUTPUT_LENGTH = 16 * 1024 * 1024;
const CONTROL_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const ASI_WORDS = new Set(['return', 'throw', 'yield', 'await', 'break', 'continue']);
const DECLARATION_WORDS = new Set(['const', 'let', 'var', 'class', 'function', 'import', 'export']);
const REGEX_PREFIX_WORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'of', 'return',
  'throw', 'typeof', 'void', 'yield',
]);
const JS_OPERATORS = [
  '>>>=', '===', '!==', '**=', '&&=', '||=', '??=', '<<=', '>>=', '>>>', '...', '=>', '==', '!=',
  '<=', '>=', '++', '--', '&&', '||', '??', '+=', '-=', '*=', '/=', '%=', '&=', '|=',
  '^=', '<<', '>>', '**', '?.',
];

function indentUnit(indentSize) {
  const size = Number(indentSize);
  return ' '.repeat(Number.isInteger(size) && size >= 1 && size <= 8 ? size : 2);
}

function nestingError(language) {
  const error = new RangeError(`${language} nesting exceeds ${MAX_NESTING} levels`);
  error.code = 'FORMAT_NESTING';
  throw error;
}

function outputLimitError(limit) {
  const error = new RangeError(`Formatted output exceeds ${limit} characters`);
  error.code = 'FORMAT_OUTPUT_LIMIT';
  throw error;
}

function createWriter(unit, initialDepth = 0, compact = false, maxLength = MAX_OUTPUT_LENGTH) {
  const chunks = [];
  let line = '';
  let length = 0;
  let depth = initialDepth;
  let newlineCount = 0;
  const addLength = (value) => {
    length += value.length;
    if (length > maxLength) outputLimitError(maxLength);
  };
  const appendLine = (value) => {
    line += value;
    addLength(value);
    newlineCount = 0;
  };
  const ensureIndent = () => {
    if (!compact && !line) appendLine(unit.repeat(depth));
  };
  const trimCanonicalSpace = () => {
    const trimmed = line.replace(/[ \t]+$/, '');
    length -= line.length - trimmed.length;
    line = trimmed;
  };
  const commitLine = () => {
    trimCanonicalSpace();
    chunks.push(line, '\n');
    line = '';
    addLength('\n');
    newlineCount++;
  };
  const commitRawLine = () => {
    chunks.push(line, '\n');
    line = '';
    addLength('\n');
    newlineCount++;
  };
  return {
    get depth() { return depth; },
    set depth(value) { depth = Math.max(initialDepth, value); },
    lineText() { return line; },
    append(value, spaceBefore = false) {
      if (!value) return;
      ensureIndent();
      if (spaceBefore && line && !/\s$/.test(line)) appendLine(' ');
      appendLine(value);
    },
    appendRaw(value, spaceBefore = false) {
      if (!value) return;
      ensureIndent();
      if (spaceBefore && line && !/\s$/.test(line)) appendLine(' ');
      this.appendPreformatted(value);
    },
    appendPreformatted(value) {
      if (!value) return;
      const lines = value.split('\n');
      for (let index = 0; index < lines.length; index++) {
        appendLine(lines[index]);
        if (index < lines.length - 1) commitRawLine();
      }
    },
    space() {
      if (line && !/\s$/.test(line)) appendLine(' ');
    },
    newline(blank = false) {
      if (compact) { this.space(); return; }
      if (line || !chunks.length) commitLine();
      if (blank && newlineCount < 2) commitLine();
    },
    hardNewline() {
      if (line || !chunks.length) commitLine();
    },
    finish() {
      trimCanonicalSpace();
      const output = chunks.join('') + line;
      return output.replace(/^\n+/, '').replace(/[\s]+$/, '');
    },
  };
}

function readQuoted(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') index += 2;
    else if (source[index++] === quote) break;
  }
  return Math.min(index, source.length);
}

function readBlockComment(source, start) {
  const end = source.indexOf('*/', start + 2);
  return end < 0 ? source.length : end + 2;
}

function isLineTerminator(char) {
  return char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029';
}

function readLineComment(source, start) {
  let index = start + 2;
  while (index < source.length && !isLineTerminator(source[index])) index++;
  return index;
}

function readRegex(source, start) {
  let index = start + 1;
  let inClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') { index += 2; continue; }
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) {
      index++;
      while (/[A-Za-z]/.test(source[index] || '')) index++;
      return index;
    } else if (isLineTerminator(char)) return -1;
    index++;
  }
  return -1;
}

function previousNonSpace(source, index) {
  while (index >= 0 && /\s/.test(source[index])) index--;
  return source[index] || '';
}

function readJsBrace(source, start, nesting = 0) {
  if (nesting >= MAX_NESTING) nestingError('JavaScript');
  let depth = 1;
  let index = start + 1;
  while (index < source.length && depth) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "'" || char === '"') index = readQuoted(source, index, char);
    else if (char === '`') index = readTemplate(source, index, nesting + 1);
    else if (char === '/' && next === '/') index = readLineComment(source, index);
    else if (char === '/' && next === '*') index = readBlockComment(source, index);
    else if (char === '/' && '({[,:;=!?&|'.includes(previousNonSpace(source, index - 1))) {
      const regexEnd = readRegex(source, index);
      if (regexEnd >= 0) index = regexEnd;
      else index++;
    } else {
      if (char === '{') {
        depth++;
        if (depth + nesting > MAX_NESTING) nestingError('JavaScript');
      }
      else if (char === '}') depth--;
      index++;
    }
  }
  return index;
}

function readTemplate(source, start, nesting = 0) {
  if (nesting >= MAX_NESTING) nestingError('JavaScript');
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') index += 2;
    else if (char === '`') return index + 1;
    else if (char === '$' && source[index + 1] === '{') index = readJsBrace(source, index + 1, nesting + 1);
    else index++;
  }
  return source.length;
}

function scanTagEnd(source, start) {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "'" || char === '"') index = readQuoted(source, index, char);
    else if (char === '{') index = readJsBrace(source, index);
    else if (char === '>') return index + 1;
    else index++;
  }
  return source.length;
}

function readJsx(source, start) {
  let index = start;
  let depth = 0;
  while (index < source.length) {
    if (source[index] === '{') { index = readJsBrace(source, index); continue; }
    if (source[index] !== '<') { index++; continue; }
    const closing = source[index + 1] === '/';
    const end = scanTagEnd(source, index);
    const raw = source.slice(index, end);
    const fragmentClose = /^<\/\s*>/.test(raw);
    const selfClosing = /\/\s*>$/.test(raw);
    if (closing || fragmentClose) depth--;
    else if (!selfClosing) {
      depth++;
      if (depth > MAX_NESTING) nestingError('JavaScript');
    }
    index = end;
    if (depth <= 0) return index;
  }
  return source.length;
}

function regexAllowed(previous) {
  if (!previous) return true;
  if (previous.type === 'word') return REGEX_PREFIX_WORDS.has(previous.value);
  if (previous.value === ')') return !!previous.controlClose;
  if (previous.value === '}') return !!previous.blockClose;
  return ['(', '[', '{', ',', ';', ':', '=', '!', '?', '&&', '||', '??', '=>'].includes(previous.value);
}

function jsxAllowed(previous, source, index) {
  const next = source[index + 1] || '';
  if (!(next === '>' || /[A-Za-z]/.test(next))) return false;
  if (!previous) return true;
  if (previous.type === 'word') return ['return', 'yield', 'case'].includes(previous.value);
  return ['=', '(', '[', '{', ',', ':', '=>', '?'].includes(previous.value);
}

const JS_ID_START = /[$_\p{ID_Start}]/u;
const JS_ID_PART = /[$\u200C\u200D\p{ID_Continue}]/u;

function unicodeEscapeEnd(source, start) {
  if (source[start] !== '\\' || source[start + 1] !== 'u') return -1;
  if (source[start + 2] === '{') {
    const close = source.indexOf('}', start + 3);
    return close > start + 3 && /^[\da-fA-F]+$/.test(source.slice(start + 3, close)) ? close + 1 : -1;
  }
  return /^[\da-fA-F]{4}/.test(source.slice(start + 2, start + 6)) ? start + 6 : -1;
}

function identifierCharEnd(source, start, first) {
  const escaped = unicodeEscapeEnd(source, start);
  if (escaped >= 0) return escaped;
  const codePoint = source.codePointAt(start);
  if (codePoint == null) return -1;
  const char = String.fromCodePoint(codePoint);
  if (!(first ? JS_ID_START : JS_ID_PART).test(char)) return -1;
  return start + char.length;
}

function readIdentifier(source, start) {
  let index = identifierCharEnd(source, start, true);
  if (index < 0) return -1;
  while (index < source.length) {
    const end = identifierCharEnd(source, index, false);
    if (end < 0) break;
    index = end;
  }
  return index;
}

function followsClassHeader(tokens) {
  let nested = 0;
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    if ([')', ']', '}'].includes(token.value)) nested++;
    else if (['(', '[', '{'].includes(token.value)) {
      if (nested) nested--;
      else return false;
    } else if (!nested) {
      if (token.type === 'word' && token.value === 'class') return true;
      if ([',', ':', ';'].includes(token.value)) return false;
    }
  }
  return false;
}

function lexJavaScript(source) {
  const tokens = [];
  const parens = [];
  const braces = [];
  let index = 0;
  let newlines = 0;
  let spaced = false;
  const push = (type, end) => {
    const value = source.slice(index, end);
    const previous = tokens[tokens.length - 1];
    const token = { type, value, newlines, spaced };
    if (value === '(') parens.push(previous?.type === 'word' ? previous.value : '');
    else if (value === ')') token.controlClose = CONTROL_WORDS.has(parens.pop());
    else if (value === '{') {
      const block = !previous || ['=>', ')', ';', ':'].includes(previous.value)
        || (previous.value === '{' && previous.blockOpen)
        || (previous.value === '}' && previous.blockClose)
        || (previous.type === 'word' && ['else', 'try', 'finally', 'do', 'static'].includes(previous.value))
        || followsClassHeader(tokens);
      token.blockOpen = block;
      braces.push(block);
    } else if (value === '}') token.blockClose = braces.pop() === true;
    tokens.push(token);
    index = end;
    newlines = 0;
    spaced = false;
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (/\s/.test(char)) {
      spaced = true;
      if (isLineTerminator(char) && !(char === '\r' && next === '\n')) newlines++;
      index++;
      continue;
    }
    const previous = tokens[tokens.length - 1];
    if (index === 0 && char === '#' && next === '!') push('hashbang', readLineComment(source, index));
    else if (char === '/' && next === '/') push('line-comment', readLineComment(source, index));
    else if (char === '/' && next === '*') push('block-comment', readBlockComment(source, index));
    else if (char === "'" || char === '"') push('string', readQuoted(source, index, char));
    else if (char === '`') push('template', readTemplate(source, index));
    else if (char === '/' && regexAllowed(previous)) {
      const regexEnd = readRegex(source, index);
      if (regexEnd >= 0) push('regex', regexEnd);
      else {
        const operator = JS_OPERATORS.find((item) => source.startsWith(item, index));
        push('punct', index + (operator?.length || 1));
      }
    } else if (char === '<' && jsxAllowed(previous, source, index)) push('jsx', readJsx(source, index));
    else if (char === '#' && readIdentifier(source, index + 1) >= 0) {
      push('word', readIdentifier(source, index + 1));
    } else if (readIdentifier(source, index) >= 0) {
      push('word', readIdentifier(source, index));
    } else if (/\d/.test(char) || (char === '.' && /\d/.test(next || ''))) {
      const match = source.slice(index).match(/^(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|(?:\d(?:_?\d)*\.(?:\d(?:_?\d)*)?|\.\d(?:_?\d)*|\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)(?:n)?/);
      push('number', index + (match?.[0].length || 1));
    } else {
      const operator = JS_OPERATORS.find((item) => source.startsWith(item, index));
      push('punct', index + (operator?.length || 1));
    }
  }
  return tokens;
}

function valueToken(token) {
  return token && ['word', 'number', 'string', 'template', 'regex', 'jsx'].includes(token.type);
}

function unaryPosition(previous) {
  return !previous || (!valueToken(previous) && ![')', ']', '}', '++', '--'].includes(previous.value));
}

function formatJavaScriptTokens(tokens, options = {}) {
  const writer = createWriter(
    indentUnit(options.indentSize), options.initialDepth || 0, !!options.compact,
    options.maxOutputLength || MAX_OUTPUT_LENGTH,
  );
  const containers = [];
  let forDepth = 0;
  let previous = null;
  const nextCode = (at) => {
    for (let index = at + 1; index < tokens.length; index++)
      if (!tokens[index].type.endsWith('comment')) return tokens[index];
    return null;
  };
  const popContainer = (value) => {
    const opening = value === ')' ? '(' : value === ']' ? '[' : '{';
    const index = containers.map((item) => item.value).lastIndexOf(opening);
    if (index >= 0) {
      const removed = containers.splice(index, containers.length - index);
      forDepth -= removed.filter((item) => item.control === 'for').length;
    }
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const value = token.value;
    const next = nextCode(index);
    const immediateNext = tokens[index + 1];
    if (token.type === 'hashbang') {
      writer.appendRaw(value);
      writer.hardNewline();
      previous = token;
      continue;
    }
    if (token.type === 'line-comment') {
      if (options.removeComments) { previous = previous || null; continue; }
      if (token.newlines) writer.newline(token.newlines > 1);
      writer.appendRaw(value, !!writer.lineText().trim());
      writer.newline();
      previous = token;
      continue;
    }
    if (token.type === 'block-comment') {
      if (options.removeComments) {
        if (/[\n\r\u2028\u2029]/.test(value)) writer.hardNewline();
        continue;
      }
      if (token.newlines) writer.newline(token.newlines > 1);
      writer.appendRaw(value, !!writer.lineText().trim());
      if (next) writer.newline();
      previous = token;
      continue;
    }
    if (token.newlines && previous) {
      const asi = previous.type === 'word' && ASI_WORDS.has(previous.value);
      const declaration = token.type === 'word' && DECLARATION_WORDS.has(value)
        && !['(', '[', '{', ',', ';', '=', ':'].includes(previous.value);
      const valueBoundary = (valueToken(previous) || [')', ']'].includes(previous.value))
        && (valueToken(token) || value === '++' || value === '--');
      if (asi || valueBoundary || previous.value === '++' || previous.value === '--') {
        if (options.compact) writer.hardNewline();
        else writer.newline(token.newlines > 1);
      } else if (declaration) writer.newline(token.newlines > 1);
    }
    if (value === '{') {
      if (containers.length >= MAX_NESTING) nestingError('JavaScript');
      const attach = previous && ['(', '[', '{', '.', '?.'].includes(previous.value);
      writer.append('{', !!previous && !attach);
      containers.push({ value: '{' });
      writer.depth++;
      if (immediateNext?.value !== '}') writer.newline();
    } else if (value === '}') {
      writer.depth--;
      if (previous?.value !== '{' && writer.lineText().trim()) writer.newline();
      popContainer(value);
      writer.append('}');
      if (next && ['else', 'catch', 'finally'].includes(next.value)) writer.space();
      else if (next && ![';', ',', ')', ']', '.', '?.'].includes(next.value)
        && next.type === 'word') writer.newline();
      else if (next && ['=', '=>'].includes(next.value)) writer.space();
    } else if (value === '(') {
      if (containers.length >= MAX_NESTING) nestingError('JavaScript');
      writer.append('(', previous?.type === 'word' && CONTROL_WORDS.has(previous.value));
      const control = previous?.value;
      containers.push({ value: '(', control });
      if (control === 'for') forDepth++;
    } else if (value === ')') {
      writer.append(')');
      popContainer(value);
    } else if (value === '[') {
      if (containers.length >= MAX_NESTING) nestingError('JavaScript');
      const needsSpace = previous && ['=', 'return', '=>'].includes(previous.value);
      writer.append('[', needsSpace);
      containers.push({ value: '[' });
    } else if (value === ']') {
      writer.append(']');
      popContainer(value);
    } else if (value === ';') {
      writer.append(';');
      if (forDepth) writer.space();
      else if (next && next.value !== '}' && next.value !== ')') writer.newline();
    } else if (value === ',') {
      writer.append(',');
      if (containers[containers.length - 1]?.value === '{') writer.newline();
      else writer.space();
    } else if (value === ':') {
      writer.append(':');
      writer.space();
    } else if (value === '.') {
      writer.append('.', token.spaced && previous?.type === 'number');
    } else if (value === '?.') {
      writer.append('?.');
    } else if (value === '...') {
      writer.append('...', previous && valueToken(previous));
    } else if (value === '++' || value === '--') {
      writer.append(value);
    } else if (['!', '~'].includes(value) || (['+', '-'].includes(value) && unaryPosition(previous))) {
      writer.append(value, previous?.type === 'word' && ['return', 'throw', 'case'].includes(previous.value));
    } else if (token.type === 'punct') {
      writer.append(value, !!previous && !['(', '[', '{', '.', '?.'].includes(previous.value));
      if (next && ![')', ']', '}', ';', ',', '.', '?.'].includes(next.value)) writer.space();
    } else {
      const needSpace = !!previous && (valueToken(previous)
        || [')', ']', '}'].includes(previous.value)
        || (previous.type === 'word' && token.type !== 'punct'));
      writer.appendRaw(value, needSpace);
    }
    previous = token;
  }
  return writer.finish();
}

export function formatJavaScript(source, options = {}) {
  return formatJavaScriptTokens(lexJavaScript(String(source)), options);
}

export function minifyJavaScript(source) {
  return formatJavaScriptTokens(lexJavaScript(String(source)), { compact: true, removeComments: true });
}

function lexCss(source) {
  const tokens = [];
  let index = 0;
  let spaced = false;
  let newlines = 0;
  const push = (type, end) => {
    tokens.push({ type, value: source.slice(index, end), spaced, newlines });
    index = end;
    spaced = false;
    newlines = 0;
  };
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      spaced = true;
      if (char === '\n' || (char === '\r' && source[index + 1] !== '\n')) newlines++;
      index++;
    } else if (char === '/' && source[index + 1] === '*') push('comment', readBlockComment(source, index));
    else if (char === "'" || char === '"') push('string', readQuoted(source, index, char));
    else if (/^url\(/i.test(source.slice(index, index + 4))) {
      let end = index + 4;
      while (end < source.length) {
        if (source[end] === '\\') end += 2;
        else if (source[end] === "'" || source[end] === '"') end = readQuoted(source, end, source[end]);
        else if (source[end++] === ')') break;
      }
      push('url', Math.min(end, source.length));
    } else if ('{}:;,()[]>+~'.includes(char)) push('punct', index + 1);
    else {
      let end = index + 1;
      while (end < source.length && !/\s/.test(source[end]) && !'{}:;,()[]>+~\'"'.includes(source[end])) {
        if (source[end] === '/' && source[end + 1] === '*') break;
        if (source[end] === '\\' && end + 1 < source.length) end += 2;
        else end++;
      }
      push('raw', end);
    }
  }
  return tokens;
}

function cssSelectorFlags(tokens) {
  const flags = new Set();
  let groups = 0;
  let candidates = [];
  let customProperty = false;
  for (let index = 0; index < tokens.length; index++) {
    const value = tokens[index].value;
    if (!groups && !candidates.length && tokens[index].type === 'raw')
      customProperty = value.startsWith('--');
    if (value === '(' || value === '[') groups++;
    else if (value === ')' || value === ']') groups = Math.max(0, groups - 1);
    else if (!groups && (value === ':' || value === ',')) candidates.push(index);
    if (!groups && ['{', ';', '}'].includes(value)) {
      if (value === '{' && !customProperty) for (const candidate of candidates) flags.add(candidate);
      candidates = [];
      customProperty = false;
    }
  }
  return flags;
}

function formatCssTokens(tokens, options = {}) {
  const writer = createWriter(
    indentUnit(options.indentSize), options.initialDepth || 0, !!options.compact,
    options.maxOutputLength || MAX_OUTPUT_LENGTH,
  );
  const containers = [];
  const selectorDelimiters = cssSelectorFlags(tokens);
  let previous = null;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const value = token.value;
    const next = tokens[index + 1];
    if (token.type === 'comment') {
      if (options.removeComments) continue;
      if (!options.compact && (token.newlines || writer.lineText().trim())) writer.newline(token.newlines > 1);
      writer.appendRaw(value);
      if (next && !options.compact) writer.newline();
    } else if (value === '{') {
      if (containers.length >= MAX_NESTING) nestingError('CSS');
      writer.append('{', !options.compact && !!writer.lineText().trim());
      containers.push('{');
      writer.depth++;
      if (next?.value !== '}' && !options.compact) writer.newline();
    } else if (value === '}') {
      writer.depth--;
      if (previous?.value !== '{' && writer.lineText().trim() && !options.compact) writer.newline();
      while (containers.length && containers.pop() !== '{') {}
      writer.append('}');
      if (next && next.value !== ';' && next.value !== '}' && !options.compact) writer.newline();
    } else if (value === '(' || value === '[') {
      if (containers.length >= MAX_NESTING) nestingError('CSS');
      writer.append(value, token.spaced);
      containers.push(value);
    } else if (value === ')' || value === ']') {
      writer.append(value, token.spaced);
      const opening = value === ')' ? '(' : '[';
      while (containers.length && containers.pop() !== opening) {}
    } else if (value === ';') {
      if (!(options.compact && next?.value === '}')) writer.append(';');
      const inGroup = containers.some((item) => item === '(' || item === '[');
      if (next?.value !== '}' && !options.compact && !inGroup) writer.newline();
    } else if (value === ':') {
      const selector = selectorDelimiters.has(index);
      writer.append(':', selector && token.spaced);
      const inParens = containers.some((item) => item === '(' || item === '[');
      if (!inParens && !selector && !options.compact) writer.space();
      else if (selector && next?.spaced) writer.space();
    } else if (value === ',') {
      writer.append(',');
      const inParens = containers.some((item) => item === '(' || item === '[');
      if (!options.compact && !inParens && selectorDelimiters.has(index)) writer.newline();
      else if (!options.compact) writer.space();
    } else if (['>', '+', '~'].includes(value)) {
      writer.append(value, token.spaced);
      if (next?.spaced) writer.space();
    } else {
      const compactBoundary = previous && (['raw', 'string'].includes(previous.type)
        || previous.type === 'url'
        || [')', ']'].includes(previous.value));
      const needsSpace = token.spaced && previous && (options.compact
        ? compactBoundary
        : !['(', '[', ':'].includes(previous.value) && ![')', ']', ',', ';'].includes(value));
      writer.appendRaw(value, needsSpace);
    }
    previous = token;
  }
  return writer.finish();
}

export function formatCss(source, options = {}) {
  return formatCssTokens(lexCss(String(source)), options);
}

export function minifyCss(source) {
  return formatCssTokens(lexCss(String(source)), { compact: true, removeComments: true });
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr',
]);
const RAW_ELEMENTS = new Set(['script', 'style', 'pre', 'textarea']);
const INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'del', 'dfn',
  'em', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'q', 'ruby', 's', 'samp',
  'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);
const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'dd', 'details', 'dialog',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'li', 'main', 'menu', 'nav',
  'ol', 'p', 'pre', 'script', 'search', 'section', 'style', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'title', 'tr', 'ul',
]);
const JAVASCRIPT_MIME_TYPES = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0',
  'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4',
  'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript',
  'text/x-javascript',
]);

function htmlAttribute(raw, name) {
  const wanted = name.toLowerCase();
  let index = 1;
  if (raw[index] === '/') index++;
  while (/\s/.test(raw[index] || '')) index++;
  while (/[^\s/>]/.test(raw[index] || '')) index++;
  while (index < raw.length) {
    while (/\s/.test(raw[index] || '')) index++;
    if (!raw[index] || raw[index] === '>' || (raw[index] === '/' && raw[index + 1] === '>')) break;
    const start = index;
    while (/[^\s=/>]/.test(raw[index] || '')) index++;
    const attribute = raw.slice(start, index).toLowerCase();
    while (/\s/.test(raw[index] || '')) index++;
    let value = '';
    if (raw[index] === '=') {
      index++;
      while (/\s/.test(raw[index] || '')) index++;
      const quote = raw[index] === '"' || raw[index] === "'" ? raw[index++] : '';
      const valueStart = index;
      if (quote) {
        while (index < raw.length && raw[index] !== quote) index++;
        value = raw.slice(valueStart, index);
        if (raw[index] === quote) index++;
      } else {
        while (/[^\s>]/.test(raw[index] || '')) index++;
        value = raw.slice(valueStart, index);
      }
    }
    if (attribute === wanted) return value;
    if (index === start) index++;
  }
  return null;
}

function rawContentMode(name, openValue) {
  const type = htmlAttribute(openValue, 'type')?.trim().toLowerCase();
  if (name === 'script') {
    if (htmlAttribute(openValue, 'src') != null) return 'data';
    if (type == null || type === '' || JAVASCRIPT_MIME_TYPES.has(type) || type === 'module') return 'js';
    if (type === 'importmap' || type === 'speculationrules') return 'json';
    return 'data';
  }
  if (name === 'style') return type == null || type === '' || type === 'text/css' ? 'css' : 'data';
  return 'data';
}

function htmlTagInfo(raw) {
  const closing = /^<\s*\//.test(raw);
  const match = raw.match(/^<\s*\/?\s*([A-Za-z][\w:-]*)/);
  const name = match?.[1]?.toLowerCase() || '';
  const declaration = /^<\s*[!?]/.test(raw);
  return {
    name,
    closing,
    declaration,
    selfClosing: /\/\s*>$/.test(raw) || VOID_ELEMENTS.has(name),
  };
}

function findRawClose(source, lower, start, name) {
  let index = lower.indexOf(`</${name}`, start);
  while (index >= 0) {
    const after = lower[index + name.length + 2] || '';
    if (!/[\w:-]/.test(after)) return index;
    index = lower.indexOf(`</${name}`, index + 2);
  }
  return -1;
}

function lexHtml(source) {
  const tokens = [];
  const lower = source.toLowerCase();
  let index = 0;
  let rawName = '';
  let rawOpenValue = '';
  while (index < source.length) {
    if (rawName) {
      const close = findRawClose(source, lower, index, rawName);
      const end = close < 0 ? source.length : close;
      tokens.push({
        type: 'raw-text', value: source.slice(index, end), name: rawName,
        mode: rawContentMode(rawName, rawOpenValue),
      });
      index = end;
      rawName = '';
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4);
      const end = close < 0 ? source.length : close + 3;
      tokens.push({ type: 'comment', value: source.slice(index, end) });
      index = end;
    } else if (source[index] === '<' && /[A-Za-z!?/]/.test(source[index + 1] || '')) {
      const end = scanTagEnd(source, index);
      const value = source.slice(index, end).trim();
      const info = htmlTagInfo(value);
      const type = info.declaration ? 'declaration' : info.closing ? 'close' : 'open';
      tokens.push({ type, value, ...info });
      index = end;
      if (type === 'open' && RAW_ELEMENTS.has(info.name) && !info.selfClosing) {
        rawName = info.name;
        rawOpenValue = value;
      }
    } else {
      let stop = source.indexOf('<', index + 1);
      while (stop >= 0 && !/[A-Za-z!?/]/.test(source[stop + 1] || ''))
        stop = source.indexOf('<', stop + 1);
      if (stop < 0) stop = source.length;
      tokens.push({ type: 'text', value: source.slice(index, stop) });
      index = stop;
    }
  }
  return tokens;
}

function htmlTree(tokens) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  for (const token of tokens) {
    if (token.type === 'open') {
      const node = { ...token, children: [], closed: false };
      stack[stack.length - 1].children.push(node);
      if (!token.selfClosing) {
        if (stack.length > MAX_NESTING) nestingError('HTML');
        stack.push(node);
      }
    } else if (token.type === 'close') {
      let found = -1;
      for (let index = stack.length - 1; index > 0; index--)
        if (stack[index].name === token.name) { found = index; break; }
      if (found >= 0) {
        stack[found].closed = true;
        stack[found].closeValue = token.value;
        stack.length = found;
      } else stack[stack.length - 1].children.push(token);
    } else stack[stack.length - 1].children.push(token);
  }
  return root;
}

function inlineHtml(node) {
  if (node.type === 'text') return node.value;
  if (node.type !== 'open' || !node.closed || RAW_ELEMENTS.has(node.name)) return null;
  let content = '';
  for (const child of node.children) {
    if (child.type === 'comment' || (child.type === 'open' && !INLINE_ELEMENTS.has(child.name))) return null;
    const rendered = child.type === 'open' ? inlineHtml(child)
      : child.type === 'text' ? child.value
        : child.type === 'declaration' ? child.value : null;
    if (rendered == null || rendered.includes('\n')) return null;
    content += rendered;
  }
  return node.value + content + (node.closeValue || `</${node.name}>`);
}

function blockHtmlNode(node) {
  return node?.type === 'open' && BLOCK_ELEMENTS.has(node.name);
}

function renderHtmlChildren(children, writer, options, trimBlockWhitespace = false) {
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (trimBlockWhitespace && child.type === 'text' && !child.value.trim()
      && (!children[index - 1] || blockHtmlNode(children[index - 1]))
      && (!children[index + 1] || blockHtmlNode(children[index + 1]))) continue;
    const block = blockHtmlNode(child) || child.type === 'comment' || child.type === 'declaration';
    if (block && writer.lineText().trim()) writer.newline();
    renderHtmlNode(child, writer, options);
    if (block) writer.newline();
  }
}

function renderHtmlNode(node, writer, options) {
  if (node.type === 'text') {
    writer.appendRaw(node.value);
    return;
  }
  if (node.type === 'comment' || node.type === 'declaration' || node.type === 'close') {
    writer.appendRaw(node.value);
    return;
  }
  const inline = inlineHtml(node);
  if (inline != null) {
    writer.appendRaw(inline);
    return;
  }
  writer.appendRaw(node.value);
  if (node.selfClosing) return;
  const raw = node.children.length === 1 && node.children[0].type === 'raw-text' ? node.children[0].value : null;
  if (raw != null && node.children[0].mode === 'data') {
    writer.appendPreformatted(raw);
    if (node.closed) writer.appendPreformatted(node.closeValue || `</${node.name}>`);
    return;
  }
  if (raw != null && (node.name === 'pre' || node.name === 'textarea')) {
    writer.appendRaw(raw);
    if (node.closed) writer.appendPreformatted(node.closeValue || `</${node.name}>`);
    return;
  }
  writer.newline();
  writer.depth++;
  if (raw != null && raw.trim() && (node.name === 'script' || node.name === 'style')) {
    const mode = node.children[0].mode;
    let formatted = raw;
    if (mode === 'js')
      formatted = formatJavaScript(raw.trim(), { indentSize: options.indentSize, initialDepth: writer.depth });
    else if (mode === 'css')
      formatted = formatCss(raw.trim(), { indentSize: options.indentSize, initialDepth: writer.depth });
    else if (mode === 'json') {
      try { formatted = JSON.stringify(JSON.parse(raw), null, options.indentSize || 2); }
      catch { /* 잘못된 JSON 또는 사용자 데이터 블록은 원문 보존 */ }
      formatted = formatted.split('\n').map((line) => writer.depth ? indentUnit(options.indentSize).repeat(writer.depth) + line : line).join('\n');
    }
    writer.appendPreformatted(formatted);
    writer.newline();
  } else {
    renderHtmlChildren(node.children, writer, options, true);
  }
  writer.depth--;
  if (node.closed) {
    writer.appendRaw(node.closeValue || `</${node.name}>`);
    writer.newline();
  }
}

export function formatHtml(source, options = {}) {
  const writer = createWriter(
    indentUnit(options.indentSize), options.initialDepth || 0, false,
    options.maxOutputLength || MAX_OUTPUT_LENGTH,
  );
  const root = htmlTree(lexHtml(String(source)));
  renderHtmlChildren(root.children, writer, options);
  return writer.finish();
}

export function minifyHtml(source) {
  const tokens = lexHtml(String(source));
  let output = '';
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'text') {
      const previous = tokens[index - 1];
      const next = tokens[index + 1];
      const removable = !token.value.trim()
        && previous && next && BLOCK_ELEMENTS.has(previous.name) && BLOCK_ELEMENTS.has(next.name);
      if (!removable) output += token.value;
    } else if (token.type === 'raw-text') {
      if (token.mode === 'js') output += minifyJavaScript(token.value);
      else if (token.mode === 'css') output += minifyCss(token.value);
      else if (token.mode === 'json') {
        try { output += JSON.stringify(JSON.parse(token.value)); }
        catch { output += token.value; }
      }
      else output += token.value;
    } else output += token.value;
  }
  return output;
}
