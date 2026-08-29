// DOM-independent SQL:2023 common-subset formatter with dialect-aware lexing.
//
// This is a formatter, not a dialect-specific parser: unknown words are
// preserved and only known SQL keywords are uppercased. Dialect selection is
// still required because PostgreSQL operators, MySQL comments and SQL modes,
// and SQLite quoted identifiers use mutually incompatible lexical rules.

const MAX_NESTING = 256;
const MAX_TOKENS = 500_000;
const MAX_OUTPUT_LENGTH = 16 * 1024 * 1024;
const DIALECTS = new Set(['standard', 'postgresql', 'mysql', 'sqlite']);
const OPERATOR_CHARACTERS = new Set([...'+-*/<>=~!@#%^&|`?:']);

const KEYWORDS = new Set(`
  add all alter and any array as asc asymmetric at authorization begin between bigint binary bit boolean both by
  call cascade case cast char character check close collate column commit constraint create cross cube current
  current_date current_time current_timestamp current_user cursor date day deallocate dec decimal declare default
  delete desc distinct do double drop else end escape except exists explain false fetch filter first float following
  for foreign from full function grant group grouping groups having hour identity in index inner inout insensitive
  insert int integer intersect interval into is join json key last lateral leading left like limit localtime localtimestamp match
  materialized merge minute month natural next no not null numeric of offset on only open or order out outer over
  overlaps partition preceding precision prepare primary procedure qualify range real recursive references release rename replace
  restrict returning revoke right rollback rollup row rows savepoint schema second select sensitive session_user set
  similar smallint some start table tablesample then time timestamp timezone_hour timezone_minute to trailing
  transaction trigger true truncate union unique unknown unbounded unnest update user using values varchar varying view
  when whenever where window with within without year conflict exclude nothing nulls sets ties
`.trim().split(/\s+/));

// SQLite publishes its complete keyword list and intentionally leaves common
// identifiers such as VALUE unreserved. Using that list avoids changing result
// column labels merely because another SQL family reserves the same word.
const SQLITE_KEYWORDS = new Set(`
  abort action add after all alter always analyze and as asc attach autoincrement before begin between by cascade case
  cast check collate column commit conflict constraint create cross current current_date current_time current_timestamp
  database default deferrable deferred delete desc detach distinct do drop each else end escape except exclude exclusive
  exists explain fail filter first following for foreign from full generated glob group groups having if ignore immediate
  in index indexed initially inner insert instead intersect into is isnull join key last left like limit match materialized
  natural no not nothing notnull null nulls of offset on or order others outer over partition plan pragma preceding primary
  query raise range recursive references regexp reindex release rename replace restrict returning right rollback row rows
  savepoint select set table temp temporary then ties to transaction trigger unbounded union unique update using vacuum values
  view virtual when where window with without
`.trim().split(/\s+/));

const PHRASES = [
  ['FULL', 'OUTER', 'JOIN'], ['LEFT', 'OUTER', 'JOIN'], ['RIGHT', 'OUTER', 'JOIN'],
  ['FETCH', 'FIRST'], ['FETCH', 'NEXT'], ['GROUPING', 'SETS'], ['INSERT', 'INTO'],
  ['WITH', 'RECURSIVE'], ['DELETE', 'FROM'], ['FULL', 'JOIN'], ['INNER', 'JOIN'],
  ['LEFT', 'JOIN'], ['RIGHT', 'JOIN'], ['CROSS', 'JOIN'], ['NATURAL', 'JOIN'],
  ['GROUP', 'BY'], ['ORDER', 'BY'], ['PARTITION', 'BY'], ['UNION', 'ALL'],
  ['UNION', 'DISTINCT'], ['PRIMARY', 'KEY'], ['FOREIGN', 'KEY'], ['NOT', 'NULL'],
  ['CURRENT', 'ROW'], ['WITHIN', 'GROUP'], ['ON', 'CONFLICT'], ['DO', 'UPDATE'],
];

const CLAUSES = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET',
  'FETCH FIRST', 'FETCH NEXT', 'RETURNING', 'SET', 'VALUES', 'WINDOW', 'QUALIFY',
]);
const LIST_CLAUSES = new Set([
  'SELECT', 'GROUP BY', 'ORDER BY', 'RETURNING', 'SET', 'WINDOW', 'WITH', 'VALUES',
  'PARTITION BY',
]);
const JOINS = new Set([
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'LEFT OUTER JOIN', 'RIGHT JOIN',
  'RIGHT OUTER JOIN', 'FULL JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'NATURAL JOIN',
]);
const SET_OPERATORS = new Set(['UNION', 'UNION ALL', 'UNION DISTINCT', 'INTERSECT', 'EXCEPT']);
const SPACE_BEFORE_PAREN = new Set([
  'AS', 'CHECK', 'EXISTS', 'FILTER', 'IN', 'OVER', 'REFERENCES', 'UNIQUE',
  'VALUES', 'WITHIN GROUP',
]);

function sqlError(message, code = 'SQL_SYNTAX') {
  const error = new SyntaxError(message);
  error.code = code;
  throw error;
}

function normalizeOptions(options = {}) {
  const dialect = options.dialect || 'standard';
  if (!DIALECTS.has(dialect)) sqlError(`Unsupported SQL dialect: ${dialect}`, 'SQL_DIALECT');
  return {
    dialect,
    mysqlBackslashEscapes: options.mysqlBackslashEscapes !== false,
    mysqlAnsiQuotes: !!options.mysqlAnsiQuotes,
  };
}

function isSpace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
    || char === '\f' || char === '\v';
}

function isDigit(char) {
  return char >= '0' && char <= '9';
}

function isIdentifierStart(char) {
  return !!char && (/[A-Za-z_]/.test(char) || char.charCodeAt(0) >= 0x80);
}

function isIdentifierPart(char) {
  return !!char && (/[A-Za-z0-9_$]/.test(char) || char.charCodeAt(0) >= 0x80);
}

function quotedEnd(source, start, quote, { doubled = true, backslash = false } = {}) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote) {
      if (doubled && source[index + 1] === quote) { index += 2; continue; }
      return index + 1;
    }
    if (backslash && source[index] === '\\') index += 2;
    else index++;
  }
  sqlError(`Unterminated SQL quote at character ${start + 1}`, 'SQL_UNTERMINATED');
}

function blockCommentEnd(source, start, nested) {
  let index = start + 2;
  let depth = 1;
  while (index < source.length) {
    if (nested && source[index] === '/' && source[index + 1] === '*') { depth++; index += 2; }
    else if (source[index] === '*' && source[index + 1] === '/') {
      depth--;
      index += 2;
      if (!depth) return index;
    } else index++;
  }
  sqlError(`Unterminated SQL comment at character ${start + 1}`, 'SQL_UNTERMINATED');
}

function dollarQuoteEnd(source, start) {
  let index = start + 1;
  if (source[index] !== '$') {
    if (!isIdentifierStart(source[index])) return -1;
    index++;
    while (isIdentifierPart(source[index]) && source[index] !== '$') index++;
    if (source[index] !== '$') return -1;
  }
  const delimiter = source.slice(start, index + 1);
  const end = source.indexOf(delimiter, index + 1);
  if (end < 0) sqlError(`Unterminated SQL dollar quote at character ${start + 1}`, 'SQL_UNTERMINATED');
  return end + delimiter.length;
}

function readNumber(source, start) {
  let index = start;
  const radix = source[index] === '0' ? source[index + 1]?.toLowerCase() : '';
  if (radix === 'x' || radix === 'b' || radix === 'o') {
    index += 2;
    const digits = radix === 'x' ? /[0-9A-Fa-f_]/ : radix === 'b' ? /[01_]/ : /[0-7_]/;
    while (digits.test(source[index] || '')) index++;
    return index;
  }
  while (/[0-9_]/.test(source[index] || '')) index++;
  if (source[index] === '.' && isDigit(source[index + 1])) {
    index++;
    while (/[0-9_]/.test(source[index] || '')) index++;
  }
  if (/[eE]/.test(source[index] || '') && (isDigit(source[index + 1])
    || ((source[index + 1] === '+' || source[index + 1] === '-') && isDigit(source[index + 2])))) {
    index++;
    if (source[index] === '+' || source[index] === '-') index++;
    while (/[0-9_]/.test(source[index] || '')) index++;
  }
  return index;
}

function isMysqlDashComment(source, start) {
  const after = source[start + 2];
  return !after || isSpace(after) || after.charCodeAt(0) <= 0x20 || after.charCodeAt(0) === 0x7f;
}

function isDashComment(source, start, dialect) {
  return source[start] === '-' && source[start + 1] === '-'
    && (dialect !== 'mysql' || isMysqlDashComment(source, start));
}

function readOperator(source, start, dialect) {
  if (dialect === 'mysql' && source[start] === '-' && source[start + 1] === '-'
    && !isMysqlDashComment(source, start)) return start + 1;
  let index = start + 1;
  while (OPERATOR_CHARACTERS.has(source[index])) {
    if (isDashComment(source, index, dialect) || source.startsWith('/*', index)
      || (dialect === 'mysql' && source[index] === '#')) break;
    const prefix = source.slice(start, index);
    if (source[index] === ':' && !(source[start] === ':' && index === start + 1)
      || dialect !== 'postgresql' && source[index] === '?'
      || (source[index] === '+' || source[index] === '-') && !/[~!@#%^&|`?]/.test(prefix)) break;
    index++;
  }
  return index;
}

export function tokenizeSql(source, options = {}) {
  source = String(source);
  const settings = normalizeOptions(options);
  const { dialect } = settings;
  const tokens = [];
  let index = 0;
  let hadWhitespace = false;
  let hadNewline = false;
  const keywords = dialect === 'sqlite' ? SQLITE_KEYWORDS : KEYWORDS;
  const add = (type, end) => {
    const raw = source.slice(index, end);
    tokens.push({
      type, raw, value: type === 'word' && keywords.has(raw.toLowerCase()) ? raw.toUpperCase() : raw,
      leadingSpace: hadWhitespace, leadingNewline: hadNewline,
    });
    if (type === 'word' && keywords.has(raw.toLowerCase())) tokens[tokens.length - 1].type = 'keyword';
    if (tokens.length > MAX_TOKENS) sqlError(`SQL token count exceeds ${MAX_TOKENS}`, 'SQL_TOKEN_LIMIT');
    index = end;
    hadWhitespace = false;
    hadNewline = false;
  };

  while (index < source.length) {
    if (isSpace(source[index])) {
      hadWhitespace = true;
      if (source[index] === '\n' || source[index] === '\r') hadNewline = true;
      index++;
      continue;
    }
    const char = source[index];
    const next = source[index + 1];
    if (isDashComment(source, index, dialect)) {
      let end = index + 2;
      while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end++;
      add('line-comment', end);
    } else if (dialect === 'mysql' && char === '#') {
      let end = index + 1;
      while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end++;
      add('line-comment', end);
    } else if (char === '/' && next === '*') {
      add('block-comment', blockCommentEnd(source, index,
        dialect === 'standard' || dialect === 'postgresql'));
    } else if (dialect === 'postgresql' && (char === 'E' || char === 'e') && next === "'") {
      add('string', quotedEnd(source, index + 1, "'", { backslash: true }));
    } else if (char === "'") {
      add('string', quotedEnd(source, index, "'", {
        backslash: dialect === 'mysql' && settings.mysqlBackslashEscapes,
      }));
    } else if (char === '"') {
      const mysqlString = dialect === 'mysql' && !settings.mysqlAnsiQuotes;
      add(mysqlString ? 'string' : 'quoted', quotedEnd(source, index, '"', {
        backslash: mysqlString && settings.mysqlBackslashEscapes,
      }));
    } else if (char === '`' && (dialect === 'mysql' || dialect === 'sqlite')) {
      add('quoted', quotedEnd(source, index, '`'));
    } else if (char === '[' && dialect === 'sqlite') {
      add('quoted', quotedEnd(source, index, ']', { doubled: false }));
    } else if (char === '$' && dialect === 'postgresql') {
      const dollarEnd = dollarQuoteEnd(source, index);
      if (dollarEnd >= 0) { add('string', dollarEnd); continue; }
      if (isDigit(next)) {
        let end = index + 2;
        while (isDigit(source[end])) end++;
        add('parameter', end);
      } else if (isIdentifierStart(next)) {
        let end = index + 2;
        while (isIdentifierPart(source[end])) end++;
        add('parameter', end);
      } else add('operator', index + 1);
    } else if (char === '?' && dialect !== 'postgresql' && isDigit(next)) {
      let end = index + 2;
      while (isDigit(source[end])) end++;
      add('parameter', end);
    } else if (char === '?' && dialect !== 'postgresql') {
      add('parameter', index + 1);
    } else if (dialect === 'mysql' && char === '@' && next === '@') {
      let end = index + 2;
      while (isIdentifierPart(source[end])) end++;
      add('parameter', end);
    } else if (dialect === 'mysql' && char === '@' && ["'", '"', '`'].includes(next)) {
      const quotedString = next === "'" || (next === '"' && !settings.mysqlAnsiQuotes);
      add('parameter', quotedEnd(source, index + 1, next, {
        backslash: quotedString && settings.mysqlBackslashEscapes,
      }));
    } else if ((char === ':' || char === '$'
      || (char === '@' && dialect !== 'postgresql')) && isIdentifierStart(next)) {
      let end = index + 2;
      while (isIdentifierPart(source[end])) end++;
      add('parameter', end);
    } else if (char === '$' && isDigit(next)) {
      let end = index + 2;
      while (isDigit(source[end])) end++;
      add('parameter', end);
    } else if ((char === 'U' || char === 'u') && next === '&'
      && (source[index + 2] === "'" || source[index + 2] === '"')) {
      const quote = source[index + 2];
      add(quote === "'" ? 'string' : 'quoted', quotedEnd(source, index + 2, quote));
    } else if (isDigit(char) || (char === '.' && isDigit(next))) add('number', readNumber(source, index));
    else if (isIdentifierStart(char)) {
      let end = index + 1;
      while (isIdentifierPart(source[end])) end++;
      add('word', end);
    } else if ('(),;.[]'.includes(char)) add('punctuation', index + 1);
    else if (OPERATOR_CHARACTERS.has(char)) add('operator', readOperator(source, index, dialect));
    else add('operator', index + 1);
  }
  return tokens;
}

function combinePhrases(tokens) {
  const output = [];
  for (let index = 0; index < tokens.length;) {
    let matched;
    for (const words of PHRASES) {
      if (words.every((word, offset) => tokens[index + offset]?.type === 'keyword'
        && tokens[index + offset].value === word)) {
        matched = words;
        break;
      }
    }
    if (!matched) { output.push(tokens[index++]); continue; }
    const parts = tokens.slice(index, index + matched.length);
    output.push({
      type: 'keyword', value: matched.join(' '), raw: parts.map((item) => item.raw).join(' '),
      leadingSpace: parts[0].leadingSpace, leadingNewline: parts[0].leadingNewline,
    });
    index += matched.length;
  }
  return output;
}

function analyzeParentheses(tokens) {
  const stack = [];
  const pairs = new Map();
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].value === '(') {
      if (stack.length >= MAX_NESTING) sqlError('SQL nesting exceeds 256 levels', 'FORMAT_NESTING');
      stack.push({ index, logical: false });
    } else if (tokens[index].value === ')') {
      const open = stack.pop();
      if (!open) sqlError(`Unexpected closing parenthesis at token ${index + 1}`);
      pairs.set(open.index, { close: index, logical: open.logical });
    } else if (stack.length && (tokens[index].value === 'AND' || tokens[index].value === 'OR')) {
      stack[stack.length - 1].logical = true;
    }
  }
  if (stack.length) sqlError(`Unclosed parenthesis at token ${stack[stack.length - 1].index + 1}`);
  return pairs;
}

function createWriter(indentSize, maxLength) {
  const unit = ' '.repeat(Number.isInteger(indentSize) && indentSize >= 1 && indentSize <= 8 ? indentSize : 2);
  const lines = [];
  let line = '';
  let depth = 0;
  let length = 0;
  const count = (value) => {
    length += value.length;
    if (length > maxLength) sqlError(`Formatted SQL exceeds ${maxLength} characters`, 'FORMAT_OUTPUT_LIMIT');
  };
  const indent = () => {
    if (!line) { line = unit.repeat(depth); count(line); }
  };
  const commit = () => {
    const trimmed = line.replace(/[ \t]+$/, '');
    length -= line.length - trimmed.length;
    if (lines.length) count('\n');
    lines.push(trimmed);
    line = '';
  };
  return {
    get depth() { return depth; },
    set depth(value) { depth = Math.max(0, value); },
    hasText() { return !!line.trim(); },
    append(value, spaceBefore = false) {
      if (!value) return;
      indent();
      if (spaceBefore && line.trim() && !/[ \t]$/.test(line)) { line += ' '; count(' '); }
      line += value;
      count(value);
    },
    newline(blank = false) {
      if (line.trim()) commit();
      if (blank && lines.length && lines[lines.length - 1] !== '') {
        count('\n');
        lines.push('');
      }
    },
    finish() {
      if (line.trim()) commit();
      while (lines[lines.length - 1] === '') lines.pop();
      return lines.join('\n');
    },
  };
}

function isUnary(tokens, index) {
  if (!['+', '-', '~'].includes(tokens[index].value)) return false;
  const previous = tokens[index - 1];
  return !previous || previous.value === '(' || previous.value === ',' || previous.type === 'operator'
    || ['SELECT', 'WHEN', 'THEN', 'ELSE', 'AND', 'OR', 'BY', 'SET', 'VALUES'].includes(previous.value);
}

function appendToken(writer, tokens, index, value = tokens[index].value) {
  const token = tokens[index];
  const previous = tokens[index - 1];
  if (token.type === 'operator') {
    if (value === '::') writer.append(value);
    else if (previous?.value === '.' || value === '*' && previous?.value === '(') writer.append(value);
    else if (isUnary(tokens, index)) {
      const afterUnary = previous?.type === 'operator' && isUnary(tokens, index - 1);
      writer.append(value, !!previous && !['(', '[', ','].includes(previous.value) && !afterUnary);
    }
    else writer.append(value, true);
    return;
  }
  const prefixedString = token.type === 'string' && previous?.type === 'word'
    && (/^[NnEeXxBb]$/.test(previous.raw) || /^_[A-Za-z0-9]+$/.test(previous.raw));
  const noSpace = !previous || previous.value === '(' || previous.value === '['
    || previous.value === '.' || previous.value === '::' || previous.type === 'operator' && isUnary(tokens, index - 1)
    || value === '.' || value === ']' || value === ')' || prefixedString;
  writer.append(value, !noSpace);
}

function parenthesisKind(tokens, index, pairs, context, statement) {
  const next = tokens[index + 1]?.value;
  const previous = tokens[index - 1]?.value;
  if (next === 'SELECT' || next === 'WITH' || next === 'WITH RECURSIVE') return 'query';
  if (previous === 'OVER') return 'over';
  if (statement === 'CREATE TABLE' && context.kind === 'query' && !context.ddlOpened) return 'ddl';
  if (pairs.get(index)?.logical && ['WHERE', 'HAVING', 'ON', 'QUALIFY'].includes(context.clause)) return 'boolean';
  return 'inline';
}

function shouldSpaceBeforeParen(previous, kind, context) {
  if (!previous) return false;
  if (kind !== 'inline') return true;
  if (SPACE_BEFORE_PAREN.has(previous.value)) return true;
  return context.clause === 'INSERT INTO' && (previous.type === 'word' || previous.type === 'quoted');
}

function startClause(writer, context, clause) {
  writer.newline();
  writer.depth = context.base;
  writer.append(clause);
  writer.newline();
  writer.depth = context.base + 1;
  context.clause = clause;
  context.between = false;
}

export function formatSql(source, options = {}) {
  const settings = normalizeOptions(options);
  const tokens = combinePhrases(tokenizeSql(source, settings));
  if (!tokens.length) return '';
  const pairs = analyzeParentheses(tokens);
  const maxOutputLength = Number.isInteger(options.maxOutputLength) && options.maxOutputLength >= 0
    ? options.maxOutputLength : MAX_OUTPUT_LENGTH;
  const writer = createWriter(Number(options.indentSize ?? options.tabWidth ?? 2),
    maxOutputLength);
  const contexts = [{ kind: 'query', base: 0, clause: null, closeDepth: 0, ddlOpened: false }];
  const cases = [];
  let statement = '';
  let bracketDepth = 0;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const value = token.value;
    let context = contexts[contexts.length - 1];

    if (token.type === 'line-comment') {
      writer.append(token.raw, writer.hasText());
      writer.newline();
      continue;
    }
    if (token.type === 'block-comment') {
      writer.append(token.raw, writer.hasText());
      continue;
    }
    if (token.type === 'string' && tokens[index - 1]?.type === 'string' && token.leadingNewline)
      writer.newline();
    if (value === ';') {
      writer.append(';');
      if (contexts.length === 1) {
        writer.newline(index < tokens.length - 1);
        writer.depth = 0;
        context.clause = null;
        statement = '';
      }
      continue;
    }
    if (value === '[' && token.type === 'punctuation') {
      writer.append('[');
      bracketDepth++;
      continue;
    }
    if (value === ']' && token.type === 'punctuation') {
      writer.append(']');
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (value === '(') {
      const kind = parenthesisKind(tokens, index, pairs, context, statement);
      const previous = tokens[index - 1];
      writer.append('(', shouldSpaceBeforeParen(previous, kind, context));
      if (kind === 'inline') {
        contexts.push({ kind, base: writer.depth, clause: null, closeDepth: writer.depth });
      } else {
        if (kind === 'ddl') context.ddlOpened = true;
        writer.newline();
        const base = writer.depth + 1;
        contexts.push({ kind, base, clause: null, closeDepth: writer.depth, ddlOpened: false });
        writer.depth = base;
      }
      continue;
    }
    if (value === ')') {
      const closing = contexts.pop();
      if (!closing) sqlError(`Unexpected closing parenthesis at token ${index + 1}`);
      if (closing.kind !== 'inline') {
        writer.newline();
        writer.depth = closing.closeDepth;
      }
      writer.append(')');
      context = contexts[contexts.length - 1];
      continue;
    }

    if (value === 'CASE') {
      appendToken(writer, tokens, index);
      cases.push({ depth: writer.depth, contextDepth: contexts.length });
      continue;
    }
    const activeCase = cases[cases.length - 1];
    if (activeCase && activeCase.contextDepth === contexts.length && (value === 'WHEN' || value === 'ELSE')) {
      writer.newline();
      writer.depth = activeCase.depth + 1;
      writer.append(value);
      continue;
    }
    if (activeCase && activeCase.contextDepth === contexts.length && value === 'END') {
      writer.newline();
      writer.depth = activeCase.depth;
      writer.append('END');
      cases.pop();
      continue;
    }

    if (context.kind !== 'inline') {
      if (!statement && contexts.length === 1 && token.type === 'keyword') {
        statement = value === 'CREATE' && tokens[index + 1]?.value === 'TABLE' ? 'CREATE TABLE' : value;
      }
      if (value === 'WITH' || value === 'WITH RECURSIVE') {
        startClause(writer, context, value);
        continue;
      }
      if (value === 'SELECT') {
        writer.newline();
        writer.depth = context.base;
        writer.append('SELECT');
        if (tokens[index + 1]?.value === 'DISTINCT' || tokens[index + 1]?.value === 'ALL') {
          writer.append(tokens[++index].value, true);
        }
        writer.newline();
        writer.depth = context.base + 1;
        context.clause = 'SELECT';
        context.between = false;
        continue;
      }
      if (SET_OPERATORS.has(value)) {
        writer.newline();
        writer.depth = context.base;
        writer.append(value);
        writer.newline();
        context.clause = null;
        continue;
      }
      if (value === 'INSERT INTO') {
        startClause(writer, context, value);
        context.clause = value;
        statement = value;
        continue;
      }
      if (value === 'UPDATE' || value === 'DELETE FROM') {
        writer.newline();
        writer.depth = context.base;
        writer.append(value);
        context.clause = value;
        statement = value;
        continue;
      }
      if (CLAUSES.has(value) && !(context.kind === 'over' && !['ORDER BY', 'PARTITION BY'].includes(value))) {
        startClause(writer, context, value);
        continue;
      }
      if (context.kind === 'over' && value === 'PARTITION BY') {
        startClause(writer, context, value);
        continue;
      }
      if (JOINS.has(value)) {
        writer.newline();
        writer.depth = context.base + 1;
        writer.append(value);
        context.clause = 'JOIN';
        context.between = false;
        continue;
      }
      if (value === 'ON' && context.kind === 'query') {
        appendToken(writer, tokens, index);
        context.clause = 'ON';
        context.between = false;
        continue;
      }
      if (value === 'BETWEEN') {
        appendToken(writer, tokens, index);
        context.between = true;
        continue;
      }
      if (value === 'AND' && context.between) {
        appendToken(writer, tokens, index);
        context.between = false;
        continue;
      }
      if ((value === 'AND' || value === 'OR') && (context.kind === 'boolean'
        || ['WHERE', 'HAVING', 'ON', 'QUALIFY'].includes(context.clause))) {
        writer.newline();
        writer.depth = context.base + (context.kind === 'boolean' ? 0 : 1);
        writer.append(value);
        continue;
      }
    }

    if (value === ',') {
      writer.append(',');
      if (!bracketDepth && (context.kind === 'ddl'
        || (context.kind === 'query' && LIST_CLAUSES.has(context.clause)))) {
        writer.newline();
        writer.depth = context.base + (context.kind === 'query' ? 1 : 0);
      } else writer.append(' ');
      continue;
    }
    appendToken(writer, tokens, index);
  }
  if (contexts.length !== 1) sqlError('Unclosed SQL parenthesis');
  return writer.finish();
}

export function minifySql(source, options = {}) {
  const settings = normalizeOptions(options);
  const tokens = tokenizeSql(source, settings);
  const maxOutputLength = Number.isInteger(options.maxOutputLength) && options.maxOutputLength >= 0
    ? options.maxOutputLength : MAX_OUTPUT_LENGTH;
  let output = '';
  let previous;
  for (const token of tokens) {
    if (previous?.type === 'line-comment') output += '\n';
    else if (previous?.type === 'string' && token.type === 'string' && token.leadingNewline)
      output += '\n';
    else if (token.leadingSpace && output && !output.endsWith('\n')) output += ' ';
    output += token.raw;
    previous = token;
    if (output.length > maxOutputLength)
      sqlError(`Minified SQL exceeds ${maxOutputLength} characters`, 'FORMAT_OUTPUT_LIMIT');
  }
  return output.trim();
}
