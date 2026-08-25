// DOM-independent renderer for the CommonMark/GFM syntax contract used by markdown-html.

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center',
  'col', 'colgroup', 'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main',
  'menu', 'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param',
  'search', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title',
  'tr', 'track', 'ul',
]);
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const ENTITY = /^(?:#[0-9]{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{0,31});/i;
const PUNCTUATION = /[\p{P}\p{S}]/u;
const INLINE_OPEN_TAG = /^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>/;
const INLINE_CLOSE_TAG = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>/;
export const MARKDOWN_LIMITS = Object.freeze({
  inputLength: 4 * 1024 * 1024,
  outputLength: 32 * 1024 * 1024,
  structures: 100_000,
  nesting: 64,
});

export class MarkdownParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MarkdownParseError';
    this.code = code;
  }
}

function positiveIntegerOption(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function reserveStructure(state, count = 1) {
  state.structures += count;
  if (state.structures > state.maxStructures) {
    throw new MarkdownParseError('MAX_STRUCTURES', 'Markdown structure limit exceeded');
  }
}

function checkOutputLength(output, state) {
  if (output.length > state.maxOutputLength) {
    throw new MarkdownParseError('MAX_OUTPUT', 'Markdown output limit exceeded');
  }
}

function escapeHtml(value, preserveEntities = true) {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '&') {
      const match = preserveEntities && value.slice(i + 1).match(ENTITY);
      if (match) {
        result += '&' + match[0];
        i += match[0].length;
      } else result += '&amp;';
    } else if (char === '<') result += '&lt;';
    else if (char === '>') result += '&gt;';
    else if (char === '"') result += '&quot;';
    else if (char === "'") result += '&#39;';
    else result += char;
  }
  return result;
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function unescapePunctuation(value) {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}

function normalizeReference(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function expandLeadingTabs(line) {
  let index = 0;
  let column = 0;
  let indent = '';
  while (index < line.length && (line[index] === ' ' || line[index] === '\t')) {
    if (line[index] === ' ') {
      indent += ' ';
      column++;
    } else {
      const width = 4 - column % 4;
      indent += ' '.repeat(width);
      column += width;
    }
    index++;
  }
  return indent + line.slice(index);
}

function isWhitespace(char) {
  return char == null || /\s/.test(char);
}

function isPunctuation(char) {
  return char != null && PUNCTUATION.test(char);
}

function textToken(tokens, value, state) {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (last?.type === 'text') last.value += value;
  else {
    reserveStructure(state);
    tokens.push({ type: 'text', value });
  }
}

function htmlToken(tokens, value, state) {
  if (value) {
    reserveStructure(state);
    tokens.push({ type: 'html', value });
  }
}

function delimiterToken(tokens, source, index, char, length, state) {
  const before = source[index - 1];
  const after = source[index + length];
  const leftFlanking = !isWhitespace(after)
    && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
  const rightFlanking = !isWhitespace(before)
    && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));
  let canOpen = leftFlanking;
  let canClose = rightFlanking;
  if (char === '_') {
    canOpen = leftFlanking && (!rightFlanking || isPunctuation(before));
    canClose = rightFlanking && (!leftFlanking || isPunctuation(after));
  }
  reserveStructure(state);
  tokens.push({
    type: 'delimiter', char, length, originalLength: length, canOpen, canClose,
    prefix: '', suffix: '',
  });
}

function resolveDelimiters(tokens) {
  const openers = { '*': [], '_': [], '~': [] };
  const invalidateAfter = (index) => {
    for (const stack of Object.values(openers)) {
      while (stack.length && stack[stack.length - 1] > index) stack.pop();
    }
  };

  for (let index = 0; index < tokens.length; index++) {
    const closer = tokens[index];
    if (closer.type !== 'delimiter') continue;
    const stack = openers[closer.char];
    if (closer.canClose) {
      while (closer.length >= 1) {
        let stackIndex = stack.length - 1;
        let opener;
        while (stackIndex >= 0) {
          const candidate = tokens[stack[stackIndex]];
          if (!candidate.canOpen || candidate.length < 1) {
            stack.splice(stackIndex, 1);
            stackIndex--;
            continue;
          }
          const multipleOfThree = closer.char !== '~'
            && (candidate.canClose || closer.canOpen)
            && (candidate.originalLength + closer.originalLength) % 3 === 0
            && (candidate.originalLength % 3 !== 0 || closer.originalLength % 3 !== 0);
          const matchingStrikethrough = closer.char !== '~'
            || candidate.originalLength === closer.originalLength;
          if (!multipleOfThree && matchingStrikethrough) {
            opener = candidate;
            break;
          }
          stackIndex--;
        }
        if (!opener) break;
        const openerIndex = stack[stackIndex];
        const use = opener.length >= 2 && closer.length >= 2 ? 2 : 1;
        const tag = closer.char === '~' ? 'del' : use === 2 ? 'strong' : 'em';
        opener.length -= use;
        closer.length -= use;
        opener.suffix = `<${tag}>` + opener.suffix;
        closer.prefix += `</${tag}>`;
        invalidateAfter(openerIndex);
        if (!opener.length) stack.splice(stackIndex, 1);
      }
    }
    if (closer.canOpen && closer.length) stack.push(index);
  }
}

function renderInlineTokens(tokens) {
  resolveDelimiters(tokens);
  return tokens.map((token) => {
    if (token.type === 'html') return token.value;
    if (token.type === 'text') return escapeHtml(token.value);
    return token.prefix + escapeHtml(token.char.repeat(token.length), false) + token.suffix;
  }).join('');
}

function findClosingBracket(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
      continue;
    }
    if (source[i] === '[') {
      depth++;
      if (depth > 1) return -1;
    }
    else if (source[i] === ']') {
      if (!depth) return i;
      depth--;
    }
  }
  return -1;
}

function findClosingParenthesis(source, start) {
  let depth = 0;
  let angle = false;
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (angle) {
      if (char === '>') angle = false;
      continue;
    }
    if (char === '<' && depth === 0) angle = true;
    else if ((char === '"' || char === "'") && depth === 0) quote = char;
    else if (char === '(') depth++;
    else if (char === ')') {
      if (!depth) return i;
      if (i === source.length - 1 && depth === 1) return i;
      depth--;
    }
  }
  return -1;
}

function parseLinkTarget(raw) {
  const value = raw.trim();
  if (!value) return { href: '', title: null };
  let href = '';
  let rest = '';
  if (value[0] === '<') {
    const close = value.indexOf('>');
    if (close < 0 || /[\n<>]/.test(value.slice(1, close))) return null;
    href = value.slice(1, close);
    rest = value.slice(close + 1).trim();
  } else {
    let depth = 0;
    let end = value.length;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\\') {
        i++;
        continue;
      }
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth--;
      else if (/\s/.test(value[i]) && depth === 0) {
        end = i;
        break;
      }
      if (depth < 0) return null;
    }
    if (depth > 1) return null;
    href = value.slice(0, end);
    rest = value.slice(end).trim();
  }
  let title = null;
  if (rest) {
    const first = rest[0];
    const last = rest[rest.length - 1];
    if (!((first === '"' && last === '"') || (first === "'" && last === "'")
      || (first === '(' && last === ')'))) return null;
    title = rest.slice(1, -1);
    const closing = first === '(' ? ')' : first;
    for (let i = 0; i < title.length; i++) {
      if (title[i] === '\\') i++;
      else if (title[i] === closing) return null;
    }
  }
  return { href: unescapePunctuation(href), title: title == null ? null : unescapePunctuation(title) };
}

function encodeHref(value) {
  try {
    return encodeURI(value).replace(/%25([0-9a-f]{2})/gi, '%$1');
  } catch {
    return value;
  }
}

function parseLink(source, index, state, depth) {
  const image = source[index] === '!';
  const open = image ? index + 1 : index;
  if (source[open] !== '[') return null;
  const close = findClosingBracket(source, open + 1);
  if (close < 0) return null;
  const label = source.slice(open + 1, close);
  let target = null;
  let end = close + 1;
  if (source[end] === '(') {
    const targetEnd = findClosingParenthesis(source, end + 1);
    if (targetEnd >= 0) target = parseLinkTarget(source.slice(end + 1, targetEnd));
    if (target) end = targetEnd + 1;
    else {
      target = state.references.get(normalizeReference(label));
      if (!target) return null;
      end = close + 1;
    }
  } else {
    let reference = label;
    if (source[end] === '[') {
      const refEnd = findClosingBracket(source, end + 1);
      if (refEnd < 0) return null;
      reference = source.slice(end + 1, refEnd) || label;
      end = refEnd + 1;
    }
    target = state.references.get(normalizeReference(reference));
    if (!target) return null;
  }
  const title = target.title == null ? '' : ` title="${escapeAttribute(target.title)}"`;
  for (const match of label.matchAll(/`+/g)) {
    const marker = match[0];
    if (!label.slice(match.index + marker.length).includes(marker)
      && source.slice(close + 1).includes(marker)) return null;
  }
  if (image) {
    const alt = escapeAttribute(unescapePunctuation(label.replace(/\n/g, ' ')));
    return { html: `<img src="${escapeAttribute(encodeHref(target.href))}" alt="${alt}"${title}>`, end };
  }
  const content = renderInline(label, state, depth + 1, false);
  return { html: `<a href="${escapeAttribute(encodeHref(target.href))}"${title}>${content}</a>`, end };
}

function inlineHtml(source) {
  const patterns = [
    /^<!---?>/,
    /^<!--[\s\S]*?-->/,
    /^<\?[\s\S]*?\?>/,
    /^<!\[CDATA\[[\s\S]*?\]\]>/i,
    /^<![A-Z][^>]*>/,
    INLINE_OPEN_TAG,
    INLINE_CLOSE_TAG,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function trimAutolink(value) {
  let result = value.replace(/&[A-Za-z][A-Za-z0-9]*;$/, '').replace(/[?!.,:;*_~"']+$/, '');
  let opens = 0;
  let closes = 0;
  for (const char of result) {
    if (char === '(') opens++;
    else if (char === ')') closes++;
  }
  let end = result.length;
  let excess = closes - opens;
  while (excess > 0 && result[end - 1] === ')') {
    end--;
    excess--;
  }
  result = end === result.length ? result : result.slice(0, end);
  return result.replace(/[?!.,:;*_~"']+$/, '');
}

function renderInline(source, state, depth = 0, allowAutolinks = true) {
  if (depth > state.maxNesting) {
    throw new MarkdownParseError('MAX_NESTING', 'Markdown nesting limit exceeded');
  }
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === '\\' && source[i + 1] === '\n') {
      htmlToken(tokens, '<br>', state);
      i += 2;
      continue;
    }
    if (char === '\\' && ESCAPABLE.test(source[i + 1] || '')) {
      htmlToken(tokens, escapeHtml(source[i + 1], false), state);
      i += 2;
      continue;
    }
    if (char === '`') {
      let run = 1;
      while (source[i + run] === '`') run++;
      const marker = '`'.repeat(run);
      let close = -1;
      for (let cursor = i + run; cursor < source.length;) {
        if (source[cursor] !== '`') {
          cursor++;
          continue;
        }
        let closeRun = 1;
        while (source[cursor + closeRun] === '`') closeRun++;
        if (closeRun === run) {
          close = cursor;
          break;
        }
        cursor += closeRun;
      }
      if (close >= 0) {
        let code = source.slice(i + run, close).replace(/\n/g, ' ');
        if (/^ .* $/.test(code) && /[^ ]/.test(code)) code = code.slice(1, -1);
        htmlToken(tokens, `<code>${escapeHtml(code, false)}</code>`, state);
        i = close + run;
        continue;
      }
      textToken(tokens, marker, state);
      i += run;
      continue;
    }
    if ((char === '!' && source[i + 1] === '[') || char === '[') {
      const link = parseLink(source, i, state, depth);
      if (link) {
        htmlToken(tokens, link.html, state);
        i = link.end;
        continue;
      }
    }
    if (char === '<') {
      const rest = source.slice(i);
      const uri = rest.match(/^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^ <>]*)>/);
      const email = rest.match(/^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)>/);
      if (uri && allowAutolinks) {
        const shown = escapeHtml(uri[1]);
        htmlToken(tokens, `<a href="${escapeAttribute(encodeHref(uri[1]))}">${shown}</a>`, state);
        i += uri[0].length;
        continue;
      }
      if (email && allowAutolinks) {
        const shown = escapeHtml(email[1]);
        htmlToken(tokens, `<a href="mailto:${escapeAttribute(email[1])}">${shown}</a>`, state);
        i += email[0].length;
        continue;
      }
      const raw = inlineHtml(rest);
      if (raw) {
        htmlToken(tokens, raw, state);
        i += raw.length;
        continue;
      }
    }
    if (char === '*' || char === '_' || char === '~') {
      let run = 1;
      while (source[i + run] === char) run++;
      if (char === '~' && run > 2) {
        textToken(tokens, char.repeat(run), state);
        i += run;
        continue;
      }
      delimiterToken(tokens, source, i, char, run, state);
      i += run;
      continue;
    }
    if (char === '\n') {
      const previous = tokens[tokens.length - 1];
      if (previous?.type === 'text' && / {2,}$/.test(previous.value)) {
        previous.value = previous.value.replace(/ +$/, '');
        htmlToken(tokens, '<br>', state);
      } else textToken(tokens, '\n', state);
      i++;
      continue;
    }
    const boundary = i === 0 || !/[\p{L}\p{N}]/u.test(source[i - 1]);
    if (boundary && allowAutolinks) {
      const urlMatch = source.slice(i).match(/^(?:(?:https?|ftp):\/\/|www\.)[^\s<]+/i);
      if (urlMatch) {
        const shown = trimAutolink(urlMatch[0]);
        const href = /^www\./i.test(shown) ? 'http://' + shown : shown;
        const attribute = escapeAttribute(encodeHref(href));
        htmlToken(tokens, `<a href="${attribute}">${escapeHtml(shown)}</a>`, state);
        i += shown.length;
        continue;
      }
      const emailMatch = source.slice(i).match(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]+/);
      if (emailMatch && !/[-_]/.test(source[i + emailMatch[0].length] || '')) {
        const shown = emailMatch[0];
        htmlToken(tokens, `<a href="mailto:${escapeAttribute(shown)}">${escapeHtml(shown)}</a>`, state);
        i += shown.length;
        continue;
      }
    }
    textToken(tokens, char, state);
    i++;
  }
  return renderInlineTokens(tokens);
}

function referenceDefinition(lines, start) {
  let header;
  let headerEnd = start;
  for (; headerEnd < Math.min(lines.length, start + 3); headerEnd++) {
    const joined = lines.slice(start, headerEnd + 1).join('\n');
    const match = joined.match(/^ {0,3}\[((?:\\[\s\S]|[^\]]){1,999})\]:[ \t]*(.*)$/s);
    if (!match) continue;
    if (!normalizeReference(match[1]) || /(^|[^\\])\[/.test(match[1])) return null;
    header = match;
    break;
  }
  if (!header) return null;

  let cursor = headerEnd;
  let value = header[2];
  if (!value) {
    if (++cursor >= lines.length || !lines[cursor].trim()) return null;
    value = lines[cursor].trim();
  }
  let href;
  let rest;
  if (value.startsWith('<')) {
    let close = -1;
    for (let i = 1; i < value.length; i++) {
      if (value[i] === '\\') i++;
      else if (value[i] === '>') {
        close = i;
        break;
      } else if (value[i] === '<') return null;
    }
    if (close < 0) return null;
    href = value.slice(1, close);
    const tail = value.slice(close + 1);
    if (tail && !/^\s/.test(tail)) return null;
    rest = tail.trim();
  } else {
    const match = value.match(/^([^\s<>]+)(.*)$/s);
    if (!match) return null;
    href = match[1];
    rest = match[2].trim();
  }

  const hrefEnd = cursor;
  let titleOnNextLine = false;
  if (!rest && cursor + 1 < lines.length && /^[ \t]*(?:["'(])/.test(lines[cursor + 1])) {
    titleOnNextLine = true;
    rest = lines[++cursor].trimStart();
  }
  let title = null;
  if (rest) {
    const opening = rest[0];
    const closing = opening === '(' ? ')' : opening;
    if (!['"', "'", '('].includes(opening)) return null;
    let titleText = rest.slice(1);
    let close = -1;
    while (true) {
      for (let i = 0; i < titleText.length; i++) {
        if (titleText[i] === '\\') i++;
        else if (titleText[i] === closing) {
          close = i;
          break;
        }
      }
      if (close >= 0 || cursor + 1 >= lines.length || !lines[cursor + 1].trim()) break;
      titleText += '\n' + lines[++cursor];
    }
    if (close < 0 || titleText.slice(close + 1).trim()) {
      if (!titleOnNextLine) return null;
      cursor = hrefEnd;
    } else title = titleText.slice(0, close);
  }
  return {
    end: cursor + 1,
    label: header[1],
    href: unescapePunctuation(href),
    title: title == null ? null : unescapePunctuation(title),
  };
}

function collectReferences(lines, references) {
  let paragraphOpen = false;
  let fence = null;
  for (let i = 0; i < lines.length;) {
    const openingFence = fenceStart(lines[i]);
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(lines[i])) {
        fence = null;
      }
      i++;
      continue;
    }
    if (openingFence) {
      fence = openingFence;
      paragraphOpen = false;
      i++;
      continue;
    }
    if (!lines[i].trim()) {
      paragraphOpen = false;
      i++;
      continue;
    }
    if (/^(?: {4}|\t)/.test(lines[i])) {
      paragraphOpen = false;
      i++;
      continue;
    }
    if (!paragraphOpen) {
      const definition = referenceDefinition(lines, i);
      if (definition) {
        const key = normalizeReference(definition.label);
        if (!references.has(key)) references.set(key, definition);
        lines.fill('', i, definition.end);
        i = definition.end;
        continue;
      }
    }
    paragraphOpen = !startsBlock(lines, i, true);
    i++;
  }
}

function fenceStart(line) {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!match || (match[2][0] === '`' && match[3].includes('`'))) return null;
  return { indent: match[1].length, char: match[2][0], length: match[2].length, info: match[3].trim() };
}

function listMarker(line) {
  const match = line.match(/^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|[ \t]*)$/);
  if (!match) return null;
  const marker = match[2];
  const ordered = /^\d/.test(marker);
  const spacing = match[3] || ' ';
  let column = match[1].length + marker.length;
  let expanded = 0;
  for (const char of spacing) {
    const width = char === '\t' ? 4 - column % 4 : 1;
    column += width;
    expanded += width;
  }
  const padding = expanded > 4 ? 1 : expanded;
  const extra = expanded > 4 ? ' '.repeat(expanded - 1) : '';
  return {
    indent: match[1].length,
    marker,
    ordered,
    start: ordered ? Number.parseInt(marker, 10) : null,
    contentIndent: match[1].length + marker.length + padding,
    content: extra + (match[4] || ''),
  };
}

function thematicBreak(line) {
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line);
}

function blockTag(line) {
  const match = line.match(/^ {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|\/?>|$)/);
  return match ? match[1].toLocaleLowerCase() : null;
}

function htmlBlockKind(line) {
  const value = line.replace(/^ {0,3}/, '');
  const special = value.match(/^<(script|pre|style|textarea)(?:\s|>|$)/i);
  if (special) return { until: new RegExp(`</${special[1]}\\s*>`, 'i') };
  if (/^<!--/.test(value)) return { until: /-->/ };
  if (/^<\?/.test(value)) return { until: /\?>/ };
  if (/^<!\[CDATA\[/i.test(value)) return { until: /\]\]>/ };
  if (/^<![A-Z]/.test(value)) return { until: />/ };
  const tag = blockTag(line);
  if (tag && BLOCK_TAGS.has(tag)) return { blank: true };
  const trimmed = value.trimEnd();
  const completeTag = trimmed.match(INLINE_OPEN_TAG) || trimmed.match(INLINE_CLOSE_TAG);
  if (completeTag?.[0].length === trimmed.length) return { blank: true, interruptParagraph: false };
  return null;
}

function readHtmlBlock(lines, index, kind) {
  let end = index + 1;
  if (kind.until) {
    while (end <= lines.length && !kind.until.test(lines[end - 1])) end++;
  } else if (kind.blank) {
    while (end < lines.length && lines[end].trim()) end++;
  }
  const contentEnd = end;
  while (end < lines.length && !lines[end].trim()) end++;
  let raw = lines.slice(index, contentEnd).join('\n');
  if (contentEnd < lines.length) raw += '\n';
  return { html: raw, end };
}

function splitTableRow(line) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
  const cells = [];
  let cell = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && value[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (char === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function tableDelimiter(line) {
  const cells = splitTableRow(line);
  if (!line.includes('|') || !cells.length || cells.some((cell) => !/^:?-+:?$/.test(cell))) return null;
  return cells.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center'
    : cell.startsWith(':') ? 'left' : cell.endsWith(':') ? 'right' : null);
}

function startsBlock(lines, index, paragraph = false) {
  const line = lines[index] || '';
  if (!line.trim()) return true;
  if (fenceStart(line) || thematicBreak(line) || /^ {0,3}>/.test(line)) return true;
  if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)) return true;
  const htmlKind = htmlBlockKind(line);
  if (htmlKind && (!paragraph || htmlKind.interruptParagraph !== false)) return true;
  const list = listMarker(line);
  if (list && (!paragraph || (list.content && (!list.ordered || list.start === 1)))) return true;
  return !paragraph && /^ {0,3}\[[^\]]+\]:/.test(line);
}

function parseList(lines, index, state, depth) {
  const first = listMarker(lines[index]);
  const sameKind = (marker) => marker
    && marker.ordered === first.ordered
    && (marker.ordered
      ? marker.marker.at(-1) === first.marker.at(-1)
      : marker.marker === first.marker);
  const sameLevel = (marker, previous) => sameKind(marker) && marker.indent < previous.contentIndent;
  const items = [];
  let cursor = index;
  let loose = false;
  let previous = first;
  while (cursor < lines.length) {
    const marker = listMarker(lines[cursor]);
    if (thematicBreak(lines[cursor]) || !sameLevel(marker, previous)) break;
    const itemLines = [marker.content];
    let activeFence = fenceStart(marker.content);
    cursor++;
    while (cursor < lines.length) {
      const line = lines[cursor];
      const sibling = listMarker(line);
      if (sibling && sibling.indent < marker.contentIndent) break;
      if (!line.trim()) {
        const blankStart = cursor;
        let next = blankStart;
        while (next < lines.length && !lines[next].trim()) next++;
        if (itemLines.length === 1 && !itemLines[0].trim() && !activeFence) {
          if (sameLevel(listMarker(lines[next] || ''), marker)) loose = true;
          cursor = next;
          break;
        }
        const afterBlank = listMarker(lines[next] || '');
        const continued = next < lines.length
          && (activeFence || lines[next].match(/^ */)[0].length >= marker.contentIndent
            || sameLevel(afterBlank, marker));
        cursor = next;
        if (!continued) break;
        itemLines.push(...Array(next - blankStart).fill(''));
        if (!activeFence) {
          const nestedList = itemLines.slice(1).some((itemLine) => listMarker(itemLine));
          const nextIndent = lines[next].match(/^ */)[0].length;
          if (sameLevel(afterBlank, marker) || !nestedList || nextIndent <= marker.contentIndent) loose = true;
        }
        continue;
      }
      const leading = line.match(/^ */)[0].length;
      if (thematicBreak(line) && leading < marker.contentIndent) break;
      let content;
      if (leading >= marker.contentIndent) content = line.slice(marker.contentIndent);
      else if (startsBlock(lines, cursor)) break;
      else content = line;
      itemLines.push(content);
      if (activeFence) {
        const close = new RegExp(`^ {0,3}${activeFence.char === '`' ? '`' : '~'}{${activeFence.length},}[ \\t]*$`);
        if (close.test(content)) activeFence = null;
      } else activeFence = fenceStart(content);
      cursor++;
    }
    while (itemLines.length && !itemLines[itemLines.length - 1].trim()) itemLines.pop();
    items.push(itemLines);
    if (items.length > state.maxStructures) {
      throw new MarkdownParseError('MAX_STRUCTURES', 'Markdown structure limit exceeded');
    }
    previous = marker;
    const sibling = listMarker(lines[cursor] || '');
    if (!sameLevel(sibling, marker)) break;
  }
  const tag = first.ordered ? 'ol' : 'ul';
  const start = first.ordered && first.start !== 1 ? ` start="${first.start}"` : '';
  let html = `<${tag}${start}>\n`;
  for (const item of items) {
    html += '<li>' + renderBlocks(item, state, depth + 1, {
      tightParagraphs: !loose, taskItem: true,
    }) + '</li>\n';
    checkOutputLength(html, state);
  }
  html += `</${tag}>\n`;
  return { html, end: cursor };
}

function renderTable(lines, index, alignments, state, depth) {
  const headers = splitTableRow(lines[index]);
  const width = alignments.length;
  let html = '<table>\n<thead>\n<tr>\n';
  for (let i = 0; i < width; i++) {
    const align = alignments[i] ? ` align="${alignments[i]}"` : '';
    html += `<th${align}>${renderInline(headers[i] || '', state, depth)}</th>\n`;
  }
  html += '</tr>\n</thead>\n';
  let cursor = index + 2;
  const rows = [];
  while (cursor < lines.length && lines[cursor].trim() && !startsBlock(lines, cursor)) {
    rows.push(splitTableRow(lines[cursor]));
    if (rows.length > state.maxStructures) {
      throw new MarkdownParseError('MAX_STRUCTURES', 'Markdown structure limit exceeded');
    }
    cursor++;
  }
  if (rows.length) {
    html += '<tbody>';
    for (const row of rows) {
      reserveStructure(state);
      html += '<tr>\n';
      for (let i = 0; i < width; i++) {
        const align = alignments[i] ? ` align="${alignments[i]}"` : '';
        html += `<td${align}>${renderInline(row[i] || '', state, depth)}</td>\n`;
      }
      html += '</tr>\n';
      checkOutputLength(html, state);
    }
    html += '</tbody>';
  }
  html += '</table>\n';
  return { html, end: cursor };
}

function paragraphHtml(source, state, depth, options, firstBlock) {
  let prefix = '';
  if (options.taskItem && firstBlock) {
    const task = source.match(/^\[([ xX])\][ \t]+/);
    if (task) {
      prefix = `<input${task[1].toLocaleLowerCase() === 'x' ? ' checked=""' : ''} disabled="" type="checkbox"> `;
      source = source.slice(task[0].length);
    }
  }
  const content = prefix + renderInline(source, state, depth);
  return options.tightParagraphs ? content : `<p>${content}</p>\n`;
}

function renderBlocks(inputLines, state, depth = 0, options = {}) {
  if (depth > state.maxNesting) {
    throw new MarkdownParseError('MAX_NESTING', 'Markdown nesting limit exceeded');
  }
  const lines = inputLines.slice();
  collectReferences(lines, state.references);
  let html = '';
  let index = 0;
  let blockCount = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }
    reserveStructure(state);
    checkOutputLength(html, state);
    const fence = fenceStart(line);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
      const body = [];
      index++;
      while (index < lines.length && !close.test(lines[index])) {
        body.push(lines[index].replace(new RegExp(`^ {${fence.indent}}`), ''));
        index++;
      }
      const closed = index < lines.length;
      if (closed) index++;
      else if (body.at(-1) === '') body.pop();
      const language = fence.info.split(/\s+/)[0];
      const attr = language ? ` class="language-${escapeAttribute(unescapePunctuation(language))}"` : '';
      const code = escapeHtml(body.join('\n') + '\n', false);
      html += `<pre><code${attr}>${code}</code></pre>\n`;
      blockCount++;
      continue;
    }
    const atx = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/);
    if (atx) {
      let content = (atx[2] || '').trim();
      content = /^#+$/.test(content) ? '' : content.replace(/[ \t]+#+[ \t]*$/, '');
      html += `<h${atx[1].length}>${renderInline(content, state, depth)}</h${atx[1].length}>\n`;
      index++;
      blockCount++;
      continue;
    }
    if (thematicBreak(line)) {
      html += '<hr>\n';
      index++;
      blockCount++;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const quote = [];
      let lazyContinuation = false;
      let lazySetext = false;
      while (index < lines.length) {
        const match = lines[index].match(/^ {0,3}>[ \t]?(.*)$/);
        if (match) {
          quote.push(match[1]);
          lazyContinuation = Boolean(match[1].trim());
          index++;
        } else if (lazyContinuation && lines[index].trim() && !startsBlock(lines, index, true)) {
          if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[index])) lazySetext = true;
          quote.push(lines[index]);
          index++;
        } else break;
      }
      html += '<blockquote>\n' + renderBlocks(quote, state, depth + 1, {
        disableSetext: lazySetext,
      }) + '</blockquote>\n';
      blockCount++;
      continue;
    }
    if (listMarker(line)) {
      const list = parseList(lines, index, state, depth);
      html += list.html;
      index = list.end;
      blockCount++;
      continue;
    }
    const htmlKind = htmlBlockKind(line);
    if (htmlKind) {
      const raw = readHtmlBlock(lines, index, htmlKind);
      html += raw.html;
      index = raw.end;
      blockCount++;
      continue;
    }
    const alignments = index + 1 < lines.length ? tableDelimiter(lines[index + 1]) : null;
    if (alignments && splitTableRow(line).length === alignments.length) {
      const table = renderTable(lines, index, alignments, state, depth);
      html += table.html;
      index = table.end;
      blockCount++;
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      const body = [];
      while (index < lines.length && (/^(?: {4}|\t)/.test(lines[index]) || !lines[index].trim())) {
        body.push(lines[index].trim()
          ? lines[index].replace(/^(?: {4}|\t)/, '')
          : lines[index].startsWith('    ') ? lines[index].slice(4) : '');
        index++;
      }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      html += `<pre><code>${escapeHtml(body.join('\n') + '\n', false)}</code></pre>\n`;
      blockCount++;
      continue;
    }
    if (!options.disableSetext && index + 1 < lines.length && line.trim()
      && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[index + 1])) {
      const level = lines[index + 1].trim()[0] === '=' ? 1 : 2;
      html += `<h${level}>${renderInline(line, state, depth)}</h${level}>\n`;
      index += 2;
      blockCount++;
      continue;
    }
    const paragraph = [line.replace(/^ {1,3}(?=\S)/, '')];
    let setextLevel = null;
    index++;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index, true)) {
      const table = index + 1 < lines.length ? tableDelimiter(lines[index + 1]) : null;
      if (table && splitTableRow(lines[index]).length === table.length) break;
      if (!options.disableSetext && index + 1 < lines.length
        && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[index + 1])) {
        paragraph.push(lines[index].trimStart());
        setextLevel = lines[index + 1].trim()[0] === '=' ? 1 : 2;
        index += 2;
        break;
      }
      paragraph.push(lines[index].trimStart());
      index++;
    }
    const paragraphSource = paragraph.join('\n');
    html += setextLevel
      ? `<h${setextLevel}>${renderInline(paragraphSource.trimEnd(), state, depth)}</h${setextLevel}>\n`
      : paragraphHtml(paragraphSource, state, depth, options, blockCount === 0);
    blockCount++;
  }
  checkOutputLength(html, state);
  return html;
}

export function parseMarkdown(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('Markdown source must be a string');
  const maxInputLength = positiveIntegerOption(
    options.maxInputLength ?? MARKDOWN_LIMITS.inputLength, 'maxInputLength', 64 * 1024 * 1024);
  const maxOutputLength = positiveIntegerOption(
    options.maxOutputLength ?? MARKDOWN_LIMITS.outputLength, 'maxOutputLength', 256 * 1024 * 1024);
  const maxStructures = positiveIntegerOption(
    options.maxStructures ?? MARKDOWN_LIMITS.structures, 'maxStructures', 1_000_000);
  const maxNesting = positiveIntegerOption(
    options.maxNesting ?? MARKDOWN_LIMITS.nesting, 'maxNesting', 256);
  if (source.length > maxInputLength) {
    throw new MarkdownParseError('MAX_INPUT', 'Markdown input limit exceeded');
  }
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD');
  if (!normalized) return '';
  const lines = normalized.split('\n').map(expandLeadingTabs);
  const references = new Map();
  if (lines.some((line) => /^ {0,3}>/.test(line))) {
    const quoted = lines.map((line) => {
      let value = line;
      while (/^ {0,3}>/.test(value)) value = value.replace(/^ {0,3}>[ \t]?/, '');
      return value;
    });
    collectReferences(quoted, references);
  }
  return renderBlocks(lines, {
    references, maxNesting, maxOutputLength, maxStructures, structures: 0,
  });
}
