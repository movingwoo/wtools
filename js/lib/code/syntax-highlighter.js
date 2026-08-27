// DOM-independent syntax tokenization for the languages exposed by syntax-highlight.
// This intentionally returns plain token data so callers never need to trust generated HTML.

export const SUPPORTED_LANGUAGES = Object.freeze([
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'kotlin', 'swift', 'php', 'ruby', 'sql', 'html', 'xml', 'css', 'json', 'yaml',
  'bash', 'shell', 'markdown',
]);

const SUPPORTED = new Set(SUPPORTED_LANGUAGES);
const words = (source) => new Set(source.split(/\s+/).filter(Boolean));

const COMMON_LITERALS = words('true false null undefined NaN Infinity');
const CONFIGS = {
  javascript: {
    keywords: words('as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let meta new of package private protected public return set static super switch target this throw try typeof var void while with yield'),
    literals: COMMON_LITERALS,
    builtins: words('Array BigInt Boolean Date Error Intl JSON Map Math Number Object Promise Proxy Reflect RegExp Set String Symbol URL Uint8Array WeakMap WeakSet console document globalThis navigator window'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"', '`'], regex: true,
  },
  typescript: {
    keywords: words('abstract accessor any as asserts async await boolean break case catch class const constructor continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface intrinsic is keyof let module namespace never new of out override private protected public readonly require return satisfies set static string super switch symbol this throw try type typeof undefined unique unknown using var void while with yield'),
    literals: COMMON_LITERALS,
    builtins: words('Array BigInt Boolean Date Error Intl JSON Map Math Number Object Promise Record RegExp Set String Symbol URL Uint8Array WeakMap WeakSet console document globalThis navigator window'),
    types: words('any bigint boolean never number object string symbol unknown void'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"', '`'], regex: true,
  },
  python: {
    keywords: words('_ and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try type while with yield'),
    literals: words('True False None Ellipsis NotImplemented'),
    builtins: words('abs all any bool bytearray bytes callable chr dict dir enumerate eval filter float format frozenset getattr hasattr hash help hex id input int isinstance issubclass iter len list map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted str sum super tuple type vars zip __name__'),
    lineComments: ['#'], blockComments: [], quotes: ['\'', '"'], triples: ["'''", '"""'], pythonStrings: true,
  },
  java: {
    keywords: words('_ abstract assert boolean break byte case catch char class const continue default do double else enum exports extends final finally float for goto if implements import instanceof int interface long module native new open opens package permits private protected provides public record requires return sealed short static strictfp super switch synchronized this throw throws to transient transitive try uses var void volatile when while with yield'),
    literals: words('true false null'),
    builtins: words('Boolean Byte Character Class Double Exception Float Integer Iterable Long Math Object RuntimeException Short String StringBuilder System Thread Void'),
    types: words('boolean byte char double float int long short void'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], triples: ['"""'],
    compoundKeywords: ['non-sealed'],
  },
  c: {
    keywords: words('alignas alignof auto break case const constexpr continue default do else enum extern for goto if inline register restrict return sizeof static static_assert struct switch thread_local typedef typeof typeof_unqual union volatile while _Alignas _Alignof _Atomic _Generic _Imaginary _Noreturn _Static_assert _Thread_local'),
    literals: words('NULL nullptr true false'),
    builtins: words('calloc exit fclose fopen fprintf free malloc memcpy printf realloc scanf sizeof snprintf stderr stdin stdout strlen'),
    types: words('bool char double float int int16_t int32_t int64_t int8_t long ptrdiff_t short signed size_t uint16_t uint32_t uint64_t uint8_t unsigned void _BitInt _Bool _Complex _Decimal128 _Decimal32 _Decimal64'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], preprocessor: true,
  },
  cpp: {
    keywords: words('alignas alignof and and_eq asm auto bitand bitor break case catch class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if import inline module mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while xor xor_eq'),
    literals: words('true false nullptr NULL'),
    builtins: words('array cerr cin cout endl exception map move optional pair printf shared_ptr string unique_ptr unordered_map vector weak_ptr'),
    types: words('bool char char8_t char16_t char32_t double float int long short signed size_t unsigned void wchar_t'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], preprocessor: true, cppRawStrings: true,
  },
  csharp: {
    keywords: words('abstract add alias allows and args as ascending async await base break by case catch checked class closed const continue decimal default delegate descending do dynamic else enum equals event explicit extension extern field file finally fixed float for foreach from get global goto group if implicit in init int interface internal into is join let lock long managed nameof namespace new nint not notnull nuint object on operator or orderby out override params partial private protected public readonly record ref remove required return safe sbyte scoped sealed select set short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unmanaged unsafe ushort using value var virtual void volatile when where while with yield'),
    literals: words('true false null'),
    builtins: words('Array Boolean Byte Char Console DateTime Decimal Dictionary Double Exception Guid Int16 Int32 Int64 List Math Object String Task'),
    types: words('bool byte char decimal double dynamic float int long object sbyte short string uint ulong ushort void'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], annotations: true, csharpStrings: true,
  },
  go: {
    keywords: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
    literals: words('true false nil iota'),
    builtins: words('append cap clear close complex copy delete imag len make max min new panic print println real recover'),
    types: words('any bool byte comparable complex128 complex64 error float32 float64 int int16 int32 int64 int8 rune string uint uint16 uint32 uint64 uint8 uintptr'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"', '`'],
  },
  rust: {
    keywords: words('_ abstract as async await become box break const continue crate do dyn else enum extern final fn for gen if impl in let loop macro macro_rules match mod move mut override priv pub raw ref return safe self Self static struct super trait try type typeof union unsafe unsized use virtual where while yield'),
    literals: words('true false None Some Ok Err'),
    builtins: words('Box Option Result String ToString Vec assert dbg format panic print println todo unreachable vec'),
    types: words('bool char f32 f64 i128 i16 i32 i64 i8 isize str u128 u16 u32 u64 u8 usize'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], annotations: true, rustLifetime: true,
    rustRawStrings: true,
  },
  kotlin: {
    keywords: words('actual abstract annotation as break by catch class companion const constructor context continue crossinline data delegate do dynamic else enum expect external field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package param private property protected public receiver reified return sealed set setparam suspend tailrec this throw try typealias typeof val value var vararg when where while'),
    literals: words('true false null'),
    builtins: words('Any Array Boolean Byte Char Double Exception Float Int List Long Map Nothing Pair Sequence Set Short String Unit println'),
    types: words('Any Boolean Byte Char Double Float Int Long Nothing Short String Unit'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], triples: ['"""'], annotations: true,
  },
  swift: {
    keywords: words('actor any as associatedtype async await borrowing break case catch class consume consuming continue convenience copy default defer deinit didSet distributed do dynamic else enum extension fallthrough false fileprivate final for func get guard if import indirect infix init inout internal is isolated lazy let mutating nil nonisolated nonmutating open operator optional override package postfix precedencegroup prefix private protocol public repeat required rethrows return self Self set some static struct subscript super switch throws true try typealias unowned var weak where while willSet yield'),
    literals: words('true false nil'),
    builtins: words('Any Array Bool Character Dictionary Double Error Float Int Optional Set String UInt print'),
    types: words('Any Bool Character Double Float Int Never String UInt Void'),
    lineComments: ['//'], blockComments: [['/*', '*/']], quotes: ['\'', '"'], triples: ['"""'], annotations: true,
    swiftRawStrings: true,
  },
  php: {
    keywords: words('__halt_compiler abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum eval exit extends final finally fn for foreach from function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or parent print private protected public readonly require require_once return self static switch throw trait try unset use var while xor yield'),
    literals: words('true false null TRUE FALSE NULL'),
    builtins: words('array_count_values count date echo explode implode in_array json_decode json_encode preg_match print_r sprintf strlen trim var_dump'),
    lineComments: ['//', '#'], blockComments: [['/*', '*/']], quotes: ['\'', '"', '`'], variables: true, php: true, ignoreCase: true,
  },
  ruby: {
    keywords: words('BEGIN END alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield'),
    literals: words('true false nil'),
    builtins: words('Array Hash Integer Kernel String attr_accessor include p print printf puts raise require'),
    lineComments: ['#'], blockComments: [['=begin', '=end']], quotes: ['\'', '"', '`'], variables: true, symbols: true,
  },
  sql: {
    keywords: words('add all alter analyze and any as asc between by case check column constraint create cross current_date current_time current_timestamp database default delete desc distinct drop else end escape except exists explain false fetch for foreign from full grant group having in index inner insert intersect into is join key left like limit natural not null offset on or order outer primary references return returning revoke right schema select set table then true truncate union unique update using values view when where with'),
    literals: words('true false null unknown'),
    builtins: words('avg cast coalesce concat count current_date current_timestamp extract lower max min now round substring sum upper'),
    types: words('bigint binary bit blob boolean char date decimal double float int integer interval json numeric real smallint text time timestamp uuid varchar'),
    lineComments: ['--'], blockComments: [['/*', '*/']], quotes: ['\'', '"', '`'], ignoreCase: true,
  },
  bash: {
    keywords: words('case coproc do done elif else esac fi for function if in select then time until while'),
    literals: words('true false'),
    builtins: words('alias bg bind break builtin cd command continue declare dirs disown echo enable eval exec exit export fc fg getopts hash help history jobs kill let local logout mapfile popd printf pushd pwd read readonly return set shift shopt source suspend test times trap type typeset ulimit umask unalias unset wait'),
    lineComments: ['#'], blockComments: [], quotes: ['\'', '"', '`'], variables: true, shell: true,
  },
};
CONFIGS.shell = CONFIGS.bash;

function addToken(tokens, type, value) {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (last?.type === type) last.value += value;
  else tokens.push({ type, value });
}

function readQuoted(source, start, quote) {
  let i = start + quote.length;
  while (i < source.length) {
    if (source[i] === '\\') { i += 2; continue; }
    if (source.startsWith(quote, i)) return i + quote.length;
    i++;
  }
  return source.length;
}

function findDelimitedStringEnd(source, contentStart, closing) {
  const found = source.indexOf(closing, contentStart);
  return found < 0 ? source.length : found + closing.length;
}

function readPythonString(source, start) {
  const match = source.slice(start).match(/^[rRuUbBfF]{1,3}("""|'''|"|')/);
  if (!match) return 0;
  const quote = match[1];
  const quoteStart = start + match[0].length - quote.length;
  return readQuoted(source, quoteStart, quote);
}

function readCppRawString(source, start) {
  const match = source.slice(start).match(/^(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(/);
  if (!match) return 0;
  return findDelimitedStringEnd(source, start + match[0].length, `)${match[1]}"`);
}

function readHashDelimitedString(source, start, prefix) {
  const pattern = prefix === 'rust' ? /^(?:br|r)(#{0,255})(")/ : /^(#+)("""|")/;
  const match = source.slice(start).match(pattern);
  if (!match) return 0;
  const hashes = match[1];
  const quote = match[2];
  return findDelimitedStringEnd(source, start + match[0].length, quote + hashes);
}

function readCSharpString(source, start) {
  const raw = source.slice(start).match(/^\$*("{3,})/);
  if (raw) return findDelimitedStringEnd(source, start + raw[0].length, raw[1]);

  const verbatim = source.slice(start).match(/^(?:\$@|@\$|@)"/);
  if (verbatim) {
    let i = start + verbatim[0].length;
    while (i < source.length) {
      if (source[i] !== '"') { i++; continue; }
      if (source[i + 1] === '"') { i += 2; continue; }
      return i + 1;
    }
    return source.length;
  }

  if (source.startsWith('$"', start)) return readQuoted(source, start + 1, '"');
  return 0;
}

function linePrefixIsWhitespace(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  return /^\s*$/.test(source.slice(lineStart, index));
}

function readRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
    if (source[i] === '\\') { i += 2; continue; }
    if (source[i] === '[') inClass = true;
    else if (source[i] === ']') inClass = false;
    else if (source[i] === '/' && !inClass) {
      i++;
      while (/[a-z]/i.test(source[i] || '')) i++;
      return i;
    }
    i++;
  }
  return start + 1;
}

function canStartRegex(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (!token.value.trim()) continue;
    if (token.type === 'keyword') return /^(?:case|delete|in|instanceof|new|return|throw|typeof|void|yield)$/.test(token.value);
    return /(?:^|[([{=,:;!&|?+*%~<>-])$/.test(token.value.trim());
  }
  return true;
}

function tokenizeCode(source, config) {
  const tokens = [];
  let relevance = 0;
  let i = 0;
  let expectTitle = false;
  while (i < source.length) {
    if (config.php && (source.startsWith('<?php', i) || source.startsWith('<?=', i) || source.startsWith('?>', i))) {
      const value = source.startsWith('<?php', i) ? '<?php' : source.slice(i, i + (source.startsWith('<?=', i) ? 3 : 2));
      addToken(tokens, 'meta', value); i += value.length; relevance += 3; continue;
    }
    if (config.shell && i === 0 && source.startsWith('#!', i)) {
      const end = source.indexOf('\n', i);
      addToken(tokens, 'meta', source.slice(i, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end; relevance += 4; continue;
    }
    if (config.preprocessor && source[i] === '#' && linePrefixIsWhitespace(source, i)) {
      const end = source.indexOf('\n', i);
      addToken(tokens, 'meta', source.slice(i, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end; relevance += 2; continue;
    }
    let matched = false;
    for (const keyword of config.compoundKeywords || []) {
      if (!source.startsWith(keyword, i)) continue;
      const before = source[i - 1] || '';
      const after = source[i + keyword.length] || '';
      if (/[\w$]/.test(before) || /[\w$]/.test(after)) continue;
      addToken(tokens, 'keyword', keyword); i += keyword.length; relevance++; matched = true; break;
    }
    if (matched) continue;
    for (const [start, endMarker] of config.blockComments || []) {
      if (!source.startsWith(start, i)) continue;
      const end = source.indexOf(endMarker, i + start.length);
      addToken(tokens, 'comment', source.slice(i, end < 0 ? source.length : end + endMarker.length));
      i = end < 0 ? source.length : end + endMarker.length; relevance += 0.2; matched = true; break;
    }
    if (matched) continue;
    for (const marker of config.lineComments || []) {
      if (!source.startsWith(marker, i)) continue;
      const end = source.indexOf('\n', i);
      addToken(tokens, 'comment', source.slice(i, end < 0 ? source.length : end));
      i = end < 0 ? source.length : end; relevance += 0.1; matched = true; break;
    }
    if (matched) continue;
    for (const quote of config.triples || []) {
      if (!source.startsWith(quote, i)) continue;
      const end = readQuoted(source, i, quote);
      addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.3; matched = true; break;
    }
    if (matched) continue;
    if (config.pythonStrings) {
      const end = readPythonString(source, i);
      if (end) { addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.3; continue; }
    }
    if (config.cppRawStrings) {
      const end = readCppRawString(source, i);
      if (end) { addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.3; continue; }
    }
    if (config.rustRawStrings) {
      const end = readHashDelimitedString(source, i, 'rust');
      if (end) { addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.3; continue; }
    }
    if (config.swiftRawStrings) {
      const end = readHashDelimitedString(source, i, 'swift');
      if (end) { addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.3; continue; }
    }
    if (config.csharpStrings) {
      const end = readCSharpString(source, i);
      if (end) { addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.3; continue; }
    }
    if (config.rustLifetime && source[i] === '\'' && /[A-Za-z_]/.test(source[i + 1] || '') && source[i + 2] !== '\'') {
      const match = source.slice(i).match(/^'[A-Za-z_]\w*/);
      addToken(tokens, 'symbol', match[0]); i += match[0].length; relevance += 0.2; continue;
    }
    if ((config.quotes || []).includes(source[i])) {
      const end = readQuoted(source, i, source[i]);
      addToken(tokens, 'string', source.slice(i, end)); i = end; relevance += 0.1; continue;
    }
    if (config.regex && source[i] === '/' && canStartRegex(tokens)) {
      const end = readRegex(source, i);
      if (end > i + 1) {
        addToken(tokens, 'regexp', source.slice(i, end)); i = end; relevance += 0.4; continue;
      }
    }
    if (config.annotations && source[i] === '@') {
      const match = source.slice(i).match(/^@[A-Za-z_]\w*/);
      if (match) { addToken(tokens, 'meta', match[0]); i += match[0].length; relevance += 0.4; continue; }
    }
    if (config.variables && source[i] === '$') {
      const match = source.slice(i).match(/^\$(?:[A-Za-z_]\w*|\d+|[@*#?$!_-]|\{[^}\n]*\})/);
      if (match) { addToken(tokens, 'variable', match[0]); i += match[0].length; relevance += 0.2; continue; }
    }
    if (config.symbols && source[i] === ':' && /[A-Za-z_]/.test(source[i + 1] || '')) {
      const match = source.slice(i).match(/^:[A-Za-z_]\w*[!?=]?/);
      addToken(tokens, 'symbol', match[0]); i += match[0].length; relevance += 0.2; continue;
    }
    if (/\d/.test(source[i]) && (i === 0 || !/[\w$]/.test(source[i - 1]))) {
      const match = source.slice(i).match(/^(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?)(?:[a-zA-Z]+)?/);
      addToken(tokens, 'number', match[0]); i += match[0].length; relevance += 0.1; continue;
    }
    if (/[A-Za-z_$]/.test(source[i])) {
      const match = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
      const value = match[0];
      const lookup = config.ignoreCase ? value.toLowerCase() : value;
      let type = null;
      if (expectTitle) { type = 'title'; expectTitle = false; relevance += 0.4; }
      else if (config.keywords.has(lookup)) {
        type = 'keyword'; relevance++;
        if (/^(?:class|def|enum|fn|func|function|interface|module|namespace|protocol|record|struct|trait|type)$/.test(lookup)) expectTitle = true;
      } else if (config.literals?.has(lookup)) type = 'literal';
      else if (config.types?.has(lookup)) type = 'type';
      else if (config.builtins?.has(lookup)) type = 'built-in';
      addToken(tokens, type, value); i += value.length; continue;
    }
    const operator = source.slice(i).match(/^(?:===|!==|=>|::|\?\?|\?\.|\.\.\.|<<=|>>=|\*\*|&&|\|\||==|!=|<=|>=|\+\+|--|->|:=|<<|>>|[+*/%=&|!<>~^?:-])/);
    if (operator) { addToken(tokens, 'operator', operator[0]); i += operator[0].length; continue; }
    const plain = source.slice(i).match(/^\s+|^[()[\]{},;.]+/);
    if (plain) { addToken(tokens, null, plain[0]); i += plain[0].length; continue; }
    let end = i + 1;
    while (end < source.length && !/[\sA-Za-z_$\d'"`/@#()[\]{},;.+*%=&|!<>~^?:-]/.test(source[end])) end++;
    addToken(tokens, null, source.slice(i, end)); i = end;
  }
  return { tokens, relevance };
}

function tokenizeTag(tag, tokens) {
  if (/^<!DOCTYPE/i.test(tag) || /^<\?/.test(tag) || /^<!\[CDATA\[/.test(tag)) {
    addToken(tokens, 'meta', tag);
    return;
  }
  let i = 0;
  const open = tag.match(/^<\/?/)[0];
  addToken(tokens, 'punctuation', open); i += open.length;
  const name = tag.slice(i).match(/^[\w:.-]+/);
  if (name) { addToken(tokens, 'title', name[0]); i += name[0].length; }
  while (i < tag.length) {
    const space = tag.slice(i).match(/^\s+/);
    if (space) { addToken(tokens, null, space[0]); i += space[0].length; continue; }
    if (tag.startsWith('/>', i) || tag[i] === '>') {
      const value = tag.startsWith('/>', i) ? '/>' : '>';
      addToken(tokens, 'punctuation', value); i += value.length; continue;
    }
    if (tag[i] === '=') { addToken(tokens, 'operator', '='); i++; continue; }
    if (tag[i] === '\'' || tag[i] === '"') {
      const end = readQuoted(tag, i, tag[i]);
      addToken(tokens, 'string', tag.slice(i, end)); i = end; continue;
    }
    const attr = tag.slice(i).match(/^[^\s=/>]+/);
    if (attr) { addToken(tokens, 'attr', attr[0]); i += attr[0].length; continue; }
    addToken(tokens, null, tag[i]); i++;
  }
}

function tokenizeMarkup(source) {
  const tokens = [];
  let i = 0;
  let relevance = 0;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const found = source.indexOf('-->', i + 4);
      const end = found < 0 ? source.length : found + 3;
      addToken(tokens, 'comment', source.slice(i, end)); i = end; relevance += 0.2; continue;
    }
    if (source[i] === '<') {
      let end = i + 1;
      let quote = null;
      while (end < source.length) {
        const char = source[end];
        if (quote) {
          if (char === '\\') end++;
          else if (char === quote) quote = null;
        } else if (char === '\'' || char === '"') quote = char;
        else if (char === '>') { end++; break; }
        end++;
      }
      tokenizeTag(source.slice(i, end), tokens); i = end; relevance += 0.5; continue;
    }
    const nextTag = source.indexOf('<', i);
    const end = nextTag < 0 ? source.length : nextTag;
    const text = source.slice(i, end);
    let last = 0;
    for (const match of text.matchAll(/&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/gi)) {
      addToken(tokens, null, text.slice(last, match.index));
      addToken(tokens, 'symbol', match[0]);
      last = match.index + match[0].length;
    }
    addToken(tokens, null, text.slice(last)); i = end;
  }
  return { tokens, relevance };
}

function tokenizeJson(source) {
  const tokens = [];
  let i = 0;
  let relevance = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      const match = source.slice(i).match(/^\s+/)[0]; addToken(tokens, null, match); i += match.length; continue;
    }
    if (source[i] === '"') {
      const end = readQuoted(source, i, '"');
      const value = source.slice(i, end);
      const next = source.slice(end).match(/^\s*/)[0].length + end;
      addToken(tokens, source[next] === ':' ? 'attr' : 'string', value); i = end; relevance += 0.1; continue;
    }
    const literal = /[tfn]/.test(source[i]) ? source.slice(i).match(/^(?:true|false|null)\b/) : null;
    if (literal) { addToken(tokens, 'literal', literal[0]); i += literal[0].length; relevance += 0.2; continue; }
    const number = /[-\d]/.test(source[i]) ? source.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/) : null;
    if (number) { addToken(tokens, 'number', number[0]); i += number[0].length; relevance += 0.1; continue; }
    if (/[[\]{},:]/.test(source[i])) { addToken(tokens, 'punctuation', source[i]); i++; continue; }
    let end = i + 1;
    while (end < source.length && !/[\s{}@#.'"():;,\dA-Za-z_-]/.test(source[end])) end++;
    addToken(tokens, null, source.slice(i, end)); i = end;
  }
  return { tokens, relevance };
}

function findYamlComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    if (quote) {
      if (line[i] === '\\' && quote === '"') i++;
      else if (line[i] === quote) quote = null;
    } else if (line[i] === '\'' || line[i] === '"') quote = line[i];
    else if (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) return i;
  }
  return -1;
}

function tokenizeYaml(source) {
  const tokens = [];
  let relevance = 0;
  const parts = source.split(/(\r?\n)/);
  for (const part of parts) {
    if (/^\r?\n$/.test(part)) { addToken(tokens, null, part); continue; }
    const commentAt = findYamlComment(part);
    const body = commentAt < 0 ? part : part.slice(0, commentAt);
    const comment = commentAt < 0 ? '' : part.slice(commentAt);
    const marker = body.match(/^(\s*)(---|\.\.\.)(\s*)$/);
    if (marker) {
      addToken(tokens, null, marker[1]); addToken(tokens, 'meta', marker[2]); addToken(tokens, null, marker[3]); relevance++;
    } else {
      const key = body.match(/^(\s*(?:-\s+)?)([^\s][^:]*?)(:\s*)(.*)$/);
      if (key && !/[{}[\]]/.test(key[2])) {
        addToken(tokens, null, key[1]); addToken(tokens, 'attr', key[2]); addToken(tokens, 'punctuation', key[3]);
        const result = tokenizeCode(key[4], {
          keywords: new Set(), literals: words('true false null yes no on off'), builtins: new Set(), types: new Set(),
          lineComments: [], blockComments: [], quotes: ['\'', '"'],
        });
        for (const token of result.tokens) addToken(tokens, token.type, token.value);
        relevance += 0.8;
      } else {
        const bullet = body.match(/^(\s*)([-?])(\s+)/);
        let offset = 0;
        if (bullet) {
          addToken(tokens, null, bullet[1]); addToken(tokens, 'punctuation', bullet[2]); addToken(tokens, null, bullet[3]);
          offset = bullet[0].length; relevance += 0.2;
        }
        const result = tokenizeCode(body.slice(offset), {
          keywords: new Set(), literals: words('true false null yes no on off'), builtins: new Set(), types: new Set(),
          lineComments: [], blockComments: [], quotes: ['\'', '"'],
        });
        for (const token of result.tokens) {
          let type = token.type;
          if (!type && /^(?:[&*!][\w.-]+)$/.test(token.value)) type = 'symbol';
          addToken(tokens, type, token.value);
        }
      }
    }
    addToken(tokens, 'comment', comment);
  }
  return { tokens, relevance };
}

function tokenizeCss(source) {
  const tokens = [];
  let relevance = 0;
  let depth = 0;
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const found = source.indexOf('*/', i + 2);
      const end = found < 0 ? source.length : found + 2;
      addToken(tokens, 'comment', source.slice(i, end)); i = end; continue;
    }
    if (source[i] === '\'' || source[i] === '"') {
      const end = readQuoted(source, i, source[i]);
      addToken(tokens, 'string', source.slice(i, end)); i = end; continue;
    }
    const space = source.slice(i).match(/^\s+/);
    if (space) { addToken(tokens, null, space[0]); i += space[0].length; continue; }
    if (source[i] === '{') { addToken(tokens, 'punctuation', '{'); depth++; i++; continue; }
    if (source[i] === '}') { addToken(tokens, 'punctuation', '}'); depth = Math.max(0, depth - 1); i++; continue; }
    if (source[i] === '@') {
      const match = source.slice(i).match(/^@[\w-]+/);
      if (match) { addToken(tokens, 'keyword', match[0]); i += match[0].length; relevance++; continue; }
    }
    if (depth === 0) {
      const selector = source.slice(i).match(/^(?:[#.]?-?-?[A-Za-z_][\w-]*|::?[\w-]+|\[[^\]\n]+\]|[>+~*])/);
      if (selector) { addToken(tokens, 'selector', selector[0]); i += selector[0].length; relevance += 0.2; continue; }
    }
    if (depth > 0 && /[-A-Za-z_]/.test(source[i])) {
      const match = source.slice(i).match(/^--?[\w-]+|^[A-Za-z_][\w-]*/);
      if (match) {
        const name = match[0];
        const rest = source.slice(i + name.length);
        const type = /^\s*:/.test(rest) ? 'property' : (/^(?:inherit|initial|revert|unset|important)$/.test(name) ? 'literal' : null);
        addToken(tokens, type, name); i += name.length; if (type === 'property') relevance += 0.3; continue;
      }
    }
    if (/\d/.test(source[i]) || (source[i] === '.' && /\d/.test(source[i + 1] || ''))) {
      const number = source.slice(i).match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:%|[a-z]+)?/i)[0];
      addToken(tokens, 'number', number); i += number.length; continue;
    }
    if (source[i] === '#' && /^[\da-f]{3,8}\b/i.test(source.slice(i + 1))) {
      const color = source.slice(i).match(/^#[\da-f]{3,8}\b/i)[0];
      addToken(tokens, 'number', color); i += color.length; continue;
    }
    if ('():;,'.includes(source[i])) { addToken(tokens, 'punctuation', source[i]); i++; continue; }
    let end = i + 1;
    while (end < source.length && !/[\s{}@#.'"():;,\dA-Za-z_-]/.test(source[end])) end++;
    addToken(tokens, null, source.slice(i, end)); i = end;
  }
  return { tokens, relevance };
}

function tokenizeMarkdownInline(text, tokens) {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '`') {
      const ticks = text.slice(i).match(/^`+/)[0];
      const found = text.indexOf(ticks, i + ticks.length);
      const end = found < 0 ? i + ticks.length : found + ticks.length;
      addToken(tokens, 'string', text.slice(i, end)); i = end; continue;
    }
    const link = text.slice(i).match(/^!?\[[^\]\n]*\]\([^\s)]+(?:\s+["'][^"']*["'])?\)/);
    if (link) { addToken(tokens, 'attr', link[0]); i += link[0].length; continue; }
    const marker = text.slice(i).match(/^(?:\*\*|__|~~|[*_])/);
    if (marker) { addToken(tokens, 'keyword', marker[0]); i += marker[0].length; continue; }
    const entity = text.slice(i).match(/^&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/i);
    if (entity) { addToken(tokens, 'symbol', entity[0]); i += entity[0].length; continue; }
    let end = i + 1;
    while (end < text.length && !/[`[\]*_~&!]/.test(text[end])) end++;
    addToken(tokens, null, text.slice(i, end)); i = end;
  }
}

function tokenizeMarkdown(source) {
  const tokens = [];
  let relevance = 0;
  let fence = null;
  for (const part of source.split(/(\r?\n)/)) {
    if (/^\r?\n$/.test(part)) { addToken(tokens, null, part); continue; }
    const fenceMatch = part.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch && (!fence || fence === fenceMatch[1][0])) {
      addToken(tokens, 'meta', part);
      fence = fence ? null : fenceMatch[1][0]; relevance += 2; continue;
    }
    if (fence) { addToken(tokens, 'string', part); continue; }
    const prefix = part.match(/^(\s*)(#{1,6}\s+|>\s*|(?:[-+*]|\d+[.)])\s+)/);
    if (prefix) {
      addToken(tokens, null, prefix[1]); addToken(tokens, 'keyword', prefix[2]);
      tokenizeMarkdownInline(part.slice(prefix[0].length), tokens); relevance += 0.8; continue;
    }
    const rule = part.match(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/);
    if (rule) { addToken(tokens, 'meta', part); relevance += 0.5; continue; }
    tokenizeMarkdownInline(part, tokens);
  }
  return { tokens, relevance };
}

function tokenize(source, language) {
  if (language === 'html' || language === 'xml') return tokenizeMarkup(source);
  if (language === 'json') return tokenizeJson(source);
  if (language === 'yaml') return tokenizeYaml(source);
  if (language === 'css') return tokenizeCss(source);
  if (language === 'markdown') return tokenizeMarkdown(source);
  return tokenizeCode(source, CONFIGS[language]);
}

function matchCount(source, pattern) {
  let count = 0;
  pattern.lastIndex = 0;
  while (pattern.exec(source)) count++;
  pattern.lastIndex = 0;
  return count;
}
const DETECTORS = {
  json(source) {
    if (!/^\s*[{[]/.test(source)) return 0;
    try { JSON.parse(source); return 18; } catch { return 0; }
  },
  html: (s) => (/<!doctype\s+html|<html\b/i.test(s) ? 18 : 0)
    + matchCount(s, /<\/?(?:a|article|body|button|div|footer|form|h[1-6]|head|header|html|img|input|label|li|link|main|meta|nav|ol|p|script|section|span|style|table|title|ul)\b/gi) * 3,
  xml: (s) => (/^\s*<\?xml\b/i.test(s) ? 18 : 0)
    + matchCount(s, /<\/?[A-Za-z_][\w.-]*(?::[\w.-]+)?(?:\s|\/?>)/g) * 1.5,
  css: (s) => matchCount(s, /(?:^|})\s*[^@{}\n]+\{[^{}]*[\w-]+\s*:[^{};]+;/gm) * 8
    + matchCount(s, /(?:^|})\s*(?:[.#][\w-]+|html|body|main|button|input)(?:[:.[\]\w()"'=-]*)\s*\{[^{}]*[\w-]+\s*:/gim) * 7
    + matchCount(s, /@(media|supports|keyframes|font-face|import)\b/g) * 4,
  yaml: (s) => matchCount(s, /^\s*[\w"'][^\n:#]*:\s*(?:[^{}\n]|$)/gm) * 2
    + matchCount(s, /^\s*-\s+[^-\s]/gm) + (/^---\s*$/m.test(s) ? 3 : 0),
  markdown: (s) => matchCount(s, /^#{1,6}\s+\S/gm) * 4 + matchCount(s, /^```\w*\s*$/gm) * 5
    + matchCount(s, /\[[^\]\n]{1,500}\]\([^)\n]{1,1000}\)/g) * 3 + matchCount(s, /^\s*>\s+\S/gm) * 2
    + matchCount(s, /^\s*(?:[-+*]|\d+[.)])\s+\S/gm),
  bash: (s) => (/^#!.*\b(?:ba|z|k)?sh\b/m.test(s) ? 20 : 0) + matchCount(s, /\$\{?[A-Za-z_][\w]*\}?/g) * 2
    + matchCount(s, /\b(?:fi|done|esac|then)\b/g) * 3 + matchCount(s, /^\s*(?:export|source|printf|echo)\b/gm),
  python: (s) => matchCount(s, /^\s*(?:async\s+)?def\s+\w+\s*\([^\n]*\)\s*:/gm) * 9
    + matchCount(s, /^\s*(?:from\s+\S+\s+)?import\s+/gm) * 3 + matchCount(s, /\b(?:elif|None|self|yield)\b/g) * 2,
  typescript: (s) => matchCount(s, /\b(?:interface|implements|namespace|readonly|satisfies|type)\s+[A-Z]\w*/g) * 7
    + matchCount(s, /(?:\)|\w)\s*:\s*(?:string|number|boolean|unknown|[A-Z]\w*(?:<[^>]+>)?)(?=\s*[,)=;{])/g) * 5,
  javascript: (s) => matchCount(s, /\b(?:const|let|var)\s+[A-Za-z_$][\w$]{0,127}\s*=/g) * 3
    + matchCount(s, /(?:\([^\n)]{0,500}\)|[A-Za-z_$][\w$]{0,127})\s*=>/g) * 5
    + matchCount(s, /\b(?:console\.log|document\.|function\s+[A-Za-z_$][\w$]{0,127})/g) * 4,
  cpp: (s) => matchCount(s, /\b(?:std::|cout\s*<<|cin\s*>>|template\s*<|namespace\s+\w+)/g) * 8
    + (/^\s*#include\s*<(?:iostream|vector|string|memory)>/m.test(s) ? 10 : 0),
  csharp: (s) => matchCount(s, /\b(?:using\s+System|Console\.(?:Write|Read)|namespace\s+\w+|async\s+Task)\b/g) * 8
    + matchCount(s, /\b(?:public|private|internal)\s+(?:sealed\s+)?class\b/g) * 4,
  java: (s) => matchCount(s, /\b(?:public\s+static\s+void\s+main|System\.out\.|package\s+[\w.]+|import\s+java\.)/g) * 9
    + matchCount(s, /\bpublic\s+class\s+[A-Z]\w*/g) * 5,
  c: (s) => (/^\s*#include\s*<(?:stdio|stdlib|string|stdint)\.h>/m.test(s) ? 12 : 0)
    + matchCount(s, /\b(?:printf|scanf|malloc|free)\s*\(/g) * 5 + matchCount(s, /\b(?:struct|typedef)\s+\w+/g) * 3,
  go: (s) => (/^\s*package\s+\w+/m.test(s) ? 8 : 0) + matchCount(s, /\bfunc\s+(?:\([^)]*\)\s*)?\w+\s*\(/g) * 7
    + matchCount(s, /\b(?:fmt\.|go\s+\w+|defer\s+\w+)|:=/g) * 4,
  rust: (s) => matchCount(s, /\bfn\s+\w{1,128}\s*\([^\n)]{0,1000}\)(?:\s*->[^\n{]{1,500})?\s*\{/g) * 7
    + matchCount(s, /\b(?:let\s+mut|impl\s+\w{1,128}|pub\s+(?:struct|enum)|use\s+\w{1,128}::)|\b\w{1,128}!/g) * 5,
  kotlin: (s) => matchCount(s, /\bfun\s+\w+\s*\([^)]*\)/g) * 7 + matchCount(s, /\b(?:data\s+class|val\s+\w+|when\s*\()/g) * 4
    + (/^\s*package\s+[\w.]+/m.test(s) ? 3 : 0),
  swift: (s) => matchCount(s, /\bfunc\s+\w+\s*\([^)]*\)(?:\s*->\s*\w+)?/g) * 6
    + matchCount(s, /\b(?:guard\s+let|protocol\s+\w+|extension\s+\w+|import\s+(?:Foundation|SwiftUI|UIKit))\b/g) * 6,
  php: (s) => (/\<\?(?:php|=)/.test(s) ? 18 : 0) + matchCount(s, /\$[A-Za-z_]\w*/g) * 2
    + matchCount(s, /\b(?:echo|namespace|use|function)\b/g),
  ruby: (s) => matchCount(s, /^\s*def\s+\w+[!?=]?/gm) * 7 + matchCount(s, /^\s*(?:class|module)\s+[A-Z]\w*/gm) * 5
    + matchCount(s, /^\s*(?:puts|require|attr_accessor)\b/gm) * 3 + matchCount(s, /^\s*end\s*$/gm) * 2,
  sql: (s) => matchCount(s, /(?:^|[;\n])\s*SELECT\b[\s\S]{0,300}\bFROM\s+[A-Za-z_][\w$.-]{0,127}/gim) * 9
    + matchCount(s, /(?:^|[;\n])\s*(?:INSERT\s+INTO|UPDATE\s+\w{1,128}\s+SET|DELETE\s+FROM|CREATE\s+TABLE)\b/gim) * 7
    + matchCount(s, /\b(?:LEFT\s+JOIN|GROUP\s+BY|ORDER\s+BY)\b/gi) * 4,
};

const AUTO_LANGUAGES = [
  'json', 'html', 'xml', 'css', 'yaml', 'markdown', 'bash', 'python', 'typescript',
  'javascript', 'cpp', 'csharp', 'java', 'c', 'go', 'rust', 'kotlin', 'swift', 'php',
  'ruby', 'sql',
];

export function detectLanguage(source) {
  if (typeof source !== 'string') throw new TypeError('강조할 코드는 문자열이어야 합니다.');
  if (!source.trim()) return { language: null, relevance: 0 };
  const sample = source.length > 40_000 ? source.slice(0, 40_000) : source;
  let best = { language: null, relevance: 0 };
  let second = 0;
  for (const language of AUTO_LANGUAGES) {
    let score = DETECTORS[language](sample);
    if (language === 'xml' && DETECTORS.html(sample) >= 6 && !/^\s*<\?xml\b/i.test(sample)) score = 0;
    if (score > best.relevance) { second = best.relevance; best = { language, relevance: score }; }
    else if (score > second) second = score;
  }
  if (best.relevance < 6 || (best.relevance < 12 && best.relevance - second < 2)) {
    return { language: null, relevance: 0 };
  }
  return best;
}

export function highlight(source, language) {
  if (typeof source !== 'string') throw new TypeError('강조할 코드는 문자열이어야 합니다.');
  if (!SUPPORTED.has(language)) throw new RangeError(`지원하지 않는 구문 강조 언어입니다: ${language}`);
  const result = tokenize(source, language);
  return { language, relevance: result.relevance, tokens: result.tokens };
}

export function highlightAuto(source) {
  const detected = detectLanguage(source);
  if (!detected.language) {
    return { language: null, relevance: 0, tokens: source ? [{ type: null, value: source }] : [] };
  }
  const result = tokenize(source, detected.language);
  return { language: detected.language, relevance: detected.relevance, tokens: result.tokens };
}
