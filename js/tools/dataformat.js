// 데이터 포맷 변환
import { tool, makeIO, h, kvTable, loadScript, loadModule, vendorUrl, LIB } from '../core.js';

const CAT = '데이터 포맷 변환';

tool({
  id: 'json-query', cat: CAT, name: 'JSONPath / JMESPath 테스터',
  desc: 'JSONPath 또는 JMESPath 표현식으로 JSON 데이터의 원하는 값을 조회합니다.',
  keywords: 'jsonpath jmespath json query path filter 조회 경로',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'json', label: 'JSON 데이터', rows: 10, value: '{\n  "users": [\n    {"name": "김민수", "age": 31},\n    {"name": "이서연", "age": 27}\n  ]\n}' },
        { id: 'query', label: '질의 표현식', rows: 2, value: '$.users[*].name' },
      ],
      options: [{ id: 'engine', label: '문법', type: 'select', values: [['jsonpath', 'JSONPath'], ['jmespath', 'JMESPath']] }],
      outputRows: 10,
      async process(v, o) {
        if (!v.json.trim() || !v.query.trim()) return '';
        const data = JSON.parse(v.json);
        let result;
        if (o.engine === 'jsonpath') {
          await loadScript(LIB.jsonpath);
          result = JSONPath.JSONPath({ path: v.query.trim(), json: data });
        } else {
          await loadScript(LIB.jmespath);
          result = jmespath.search(data, v.query.trim());
        }
        return JSON.stringify(result, null, 2);
      },
      note: 'JMESPath를 선택하면 예: users[*].name 형식으로 입력하세요.',
    });
  },
});

const SAMPLE_MISSING = Symbol('sample-missing');

function requireLocalSampleRefs(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (typeof value.$ref === 'string' && !value.$ref.startsWith('#'))
    throw new Error(`외부 $ref는 네트워크로 가져오지 않습니다: ${value.$ref}`);
  for (const child of Object.values(value)) requireLocalSampleRefs(child, seen);
}

function schemaPointer(root, ref) {
  if (ref === '#') return root;
  if (!ref.startsWith('#/'))
    throw new Error(`외부 $ref는 샘플 생성에서 지원하지 않습니다: ${ref}`);
  let value = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!value || typeof value !== 'object' || !(key in value))
      throw new Error(`$ref 대상을 찾을 수 없습니다: ${ref}`);
    value = value[key];
  }
  return value;
}

function mergeSchemas(left, right) {
  if (left === false || right === false) return false;
  if (left === true || left == null) return right;
  if (right === true || right == null) return left;
  const merged = { ...left, ...right };
  if (left.properties || right.properties) {
    merged.properties = { ...left.properties };
    for (const [key, value] of Object.entries(right.properties || {}))
      merged.properties[key] = key in merged.properties ? mergeSchemas(merged.properties[key], value) : value;
  }
  if (left.required || right.required)
    merged.required = [...new Set([...(left.required || []), ...(right.required || [])])];
  for (const key of ['minimum', 'exclusiveMinimum', 'minLength', 'minItems']) {
    if (key in left && key in right) merged[key] = Math.max(left[key], right[key]);
  }
  for (const key of ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems']) {
    if (key in left && key in right) merged[key] = Math.min(left[key], right[key]);
  }
  return merged;
}

function materializeAllOf(schema, root, refs = new Set()) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  let resolved = schema;
  if (typeof schema.$ref === 'string') {
    if (refs.has(schema.$ref)) return {};
    refs.add(schema.$ref);
    const { $ref, ...siblings } = schema;
    resolved = mergeSchemas(materializeAllOf(schemaPointer(root, $ref), root, refs), siblings);
    refs.delete(schema.$ref);
  }
  if (!resolved?.allOf) return resolved;
  const { allOf, ...base } = resolved;
  return allOf.reduce((merged, child) =>
    mergeSchemas(merged, materializeAllOf(child, root, refs)), base);
}

function firstPatternAlternative(source) {
  let depth = 0, bracket = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '[') bracket = true;
    else if (char === ']') bracket = false;
    else if (!bracket && char === '(') depth++;
    else if (!bracket && char === ')') depth--;
    else if (!bracket && depth === 0 && char === '|') return source.slice(0, i);
  }
  return source;
}

function patternClassExample(content) {
  if (content.startsWith('^')) {
    const expression = new RegExp(`[${content}]`, 'u');
    return ['a', 'A', '0', '_', '-', '가'].find((value) => !expression.test(value)) || 'a';
  }
  if (/^\\d/.test(content) || /0-9/.test(content)) return '0';
  if (/^\\w/.test(content)) return 'a';
  if (/^\\s/.test(content)) return ' ';
  const match = content.match(/\\([nrt])|\\(.)|([^\\])/);
  if (!match) return 'a';
  if (match[1]) return { n: '\n', r: '\r', t: '\t' }[match[1]];
  return match[2] || match[3];
}

function patternExample(pattern, minLength = 0) {
  let source = firstPatternAlternative(pattern.replace(/^\^/, '').replace(/\$$/, ''));
  let output = '';
  for (let i = 0; i < source.length;) {
    let token = '', next = i + 1;
    const char = source[i];
    if (char === '\\') {
      const escaped = source[i + 1];
      if (escaped === 'd') token = '0';
      else if (escaped === 'w') token = 'a';
      else if (escaped === 's') token = ' ';
      else if (escaped === 'n') token = '\n';
      else if (escaped === 'r') token = '\r';
      else if (escaped === 't') token = '\t';
      else token = escaped || '';
      next = i + 2;
    } else if (char === '[') {
      let end = i + 1, escaped = false;
      for (; end < source.length; end++) {
        if (!escaped && source[end] === ']') break;
        escaped = !escaped && source[end] === '\\';
        if (source[end] !== '\\') escaped = false;
      }
      if (end >= source.length) throw new Error(`pattern을 해석할 수 없습니다: ${pattern}`);
      token = patternClassExample(source.slice(i + 1, end));
      next = end + 1;
    } else if (char === '(') {
      let end = i + 1, depth = 1, escaped = false, bracket = false;
      for (; end < source.length && depth; end++) {
        const current = source[end];
        if (escaped) { escaped = false; continue; }
        if (current === '\\') { escaped = true; continue; }
        if (current === '[') bracket = true;
        else if (current === ']') bracket = false;
        else if (!bracket && current === '(') depth++;
        else if (!bracket && current === ')') depth--;
      }
      if (depth) throw new Error(`pattern을 해석할 수 없습니다: ${pattern}`);
      let inner = source.slice(i + 1, end - 1).replace(/^\?:/, '');
      token = patternExample(firstPatternAlternative(inner));
      next = end;
    } else {
      token = char === '.' ? 'a' : char;
    }

    let count = 1;
    if (source[next] === '{') {
      const quantifier = source.slice(next).match(/^\{(\d+)(?:,\d*)?\}/);
      if (quantifier) { count = Number(quantifier[1]); next += quantifier[0].length; }
    } else if (source[next] === '+') { next++; }
    else if (source[next] === '*' || source[next] === '?') { count = 0; next++; }
    output += token.repeat(count);
    i = next;
  }
  let expression;
  try { expression = new RegExp(pattern, 'u'); }
  catch { throw new Error(`올바르지 않은 pattern 정규식입니다: ${pattern}`); }
  const padding = Math.max(0, minLength - output.length);
  for (const candidate of [output, output + 'a'.repeat(padding), 'a'.repeat(Math.max(1, minLength)), '0'.repeat(Math.max(1, minLength))])
    if (candidate.length >= minLength && expression.test(candidate)) return candidate;
  throw new Error(`pattern에 맞는 샘플 문자열을 생성하지 못했습니다: ${pattern}`);
}

function schemaExample(schema, root = schema, state = { refs: new Set(), depth: 0 }) {
  if (schema === false) return SAMPLE_MISSING;
  if (schema === true || schema == null) return null;
  if (typeof schema !== 'object') return null;
  if (state.depth > 32) return SAMPLE_MISSING;
  if (typeof schema.$ref === 'string') {
    if (state.refs.has(schema.$ref)) return SAMPLE_MISSING;
    state.refs.add(schema.$ref);
    const { $ref, ...siblings } = schema;
    const value = schemaExample(mergeSchemas(schemaPointer(root, $ref), siblings), root,
      { refs: state.refs, depth: state.depth + 1 });
    state.refs.delete(schema.$ref);
    return value;
  }
  schema = materializeAllOf(schema, root);
  if (schema === false) return SAMPLE_MISSING;
  if ('example' in schema) return schema.example;
  if ('default' in schema) return schema.default;
  if ('const' in schema) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  const alternatives = schema.oneOf || schema.anyOf;
  if (alternatives?.length) return schemaExample(mergeSchemas({ ...schema, oneOf: undefined, anyOf: undefined }, alternatives[0]), root,
    { refs: state.refs, depth: state.depth + 1 });
  let type = Array.isArray(schema.type) ? schema.type.find((value) => value !== 'null') : schema.type;
  if (!type) {
    if (schema.properties || schema.required) type = 'object';
    else if (schema.prefixItems || schema.items || schema.minItems != null) type = 'array';
    else if (schema.pattern || schema.minLength != null || schema.format) type = 'string';
    else if (schema.minimum != null || schema.maximum != null || schema.multipleOf != null) type = 'number';
  }
  if (type === 'object') {
    const value = {};
    const required = new Set(schema.required || []);
    for (const [key, child] of Object.entries(schema.properties || {})) {
      const sample = schemaExample(child, root, { refs: state.refs, depth: state.depth + 1 });
      if (sample !== SAMPLE_MISSING) value[key] = sample;
      else if (required.has(key)) throw new Error(`필수 속성 "${key}"의 재귀 참조를 샘플로 만들 수 없습니다.`);
    }
    for (const key of required) {
      if (key in value) continue;
      const child = typeof schema.additionalProperties === 'object' ? schema.additionalProperties : true;
      const sample = schemaExample(child, root, { refs: state.refs, depth: state.depth + 1 });
      value[key] = sample === SAMPLE_MISSING ? null : sample;
    }
    return value;
  }
  if (type === 'array') {
    const prefix = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : []);
    const maxItems = Number.isInteger(schema.maxItems) ? schema.maxItems : Infinity;
    const defaultItems = schema.items === false ? 0 : prefix.length ? 0 : 1;
    const target = Math.min(maxItems, Math.max(prefix.length, Number.isInteger(schema.minItems) ? schema.minItems : defaultItems));
    const value = [];
    for (let index = 0; index < target; index++) {
      const child = prefix[index] ?? (Array.isArray(schema.items) ? schema.additionalItems : schema.items) ?? {};
      const sample = schemaExample(child, root, { refs: state.refs, depth: state.depth + 1 });
      if (sample === SAMPLE_MISSING)
        throw new Error(`배열 ${index + 1}번째 항목의 샘플을 생성할 수 없습니다.`);
      value.push(sample);
    }
    return value;
  }
  if (type === 'string') {
    if (schema.pattern) return patternExample(schema.pattern, schema.minLength || 0);
    const value = schema.format === 'date-time' ? new Date().toISOString()
      : schema.format === 'date' ? new Date().toISOString().slice(0, 10) : '';
    return value.padEnd(schema.minLength || 0, 'a').slice(0, schema.maxLength ?? undefined);
  }
  if (type === 'integer' || type === 'number') {
    let value = schema.minimum ?? (schema.exclusiveMinimum != null ? schema.exclusiveMinimum + (type === 'integer' ? 1 : 0.1) : 0);
    if (schema.multipleOf) value = Math.ceil(value / schema.multipleOf) * schema.multipleOf;
    return type === 'integer' ? Math.ceil(value) : value;
  }
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  return null;
}

function schemaDraft(schema) {
  if (typeof schema.$schema !== 'string') return 'draft2020-12';
  const uri = schema.$schema.toLowerCase();
  if (uri.includes('draft-04')) return 'draft-04';
  if (uri.includes('draft-06')) return 'draft-06';
  if (uri.includes('draft-07')) return 'draft-07';
  if (uri.includes('2019-09')) return 'draft2019-09';
  if (uri.includes('2020-12')) return 'draft2020-12';
  throw new Error('지원하지 않는 JSON Schema 버전입니다. Draft 4, 6, 7, 2019-09 또는 2020-12를 사용하세요.');
}

const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$dynamicAnchor', '$dynamicRef', 'unevaluatedItems', 'unevaluatedProperties', 'contentSchema',
]);

function unsupportedSchemaKeywords(value, found = new Set(), seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) found.add(key);
    unsupportedSchemaKeywords(child, found, seen);
  }
  return found;
}

function schemaErrorMessage(error) {
  const p = error?.params || [];
  switch (error?.code) {
    case 'INVALID_TYPE': return `예상 타입은 ${p[0]}이지만 실제 타입은 ${p[1]}입니다.`;
    case 'OBJECT_MISSING_REQUIRED_PROPERTY': return `필수 속성 "${p[0]}"이(가) 없습니다.`;
    case 'OBJECT_ADDITIONAL_PROPERTIES': return `허용되지 않은 속성 "${p[0]}"이(가) 있습니다.`;
    case 'MINIMUM': return `값 ${p[0]}은(는) 최솟값 ${p[1]}보다 작습니다.`;
    case 'MINIMUM_EXCLUSIVE': return `값 ${p[0]}은(는) ${p[1]}보다 커야 합니다.`;
    case 'MAXIMUM': return `값 ${p[0]}은(는) 최댓값 ${p[1]}보다 큽니다.`;
    case 'MAXIMUM_EXCLUSIVE': return `값 ${p[0]}은(는) ${p[1]}보다 작아야 합니다.`;
    case 'MIN_LENGTH': return `문자열 길이는 최소 ${p[1]}자여야 합니다.`;
    case 'MAX_LENGTH': return `문자열 길이는 최대 ${p[1]}자여야 합니다.`;
    case 'ARRAY_LENGTH_SHORT': return `배열 항목은 최소 ${p[1]}개여야 합니다.`;
    case 'ARRAY_LENGTH_LONG': return `배열 항목은 최대 ${p[1]}개여야 합니다.`;
    case 'ARRAY_UNIQUE': return '배열 항목은 서로 달라야 합니다.';
    case 'ENUM_MISMATCH': return '허용된 enum 값과 일치하지 않습니다.';
    case 'CONST': return 'const에 지정된 값과 일치하지 않습니다.';
    case 'PATTERN': return `문자열이 지정된 패턴과 일치하지 않습니다: ${p[0]}`;
    case 'INVALID_FORMAT': return `문자열이 ${p[0]} 형식에 맞지 않습니다.`;
    case 'MULTIPLE_OF': return `값 ${p[0]}은(는) ${p[1]}의 배수가 아닙니다.`;
    case 'ANY_OF_MISSING': return 'anyOf의 어떤 스키마와도 일치하지 않습니다.';
    case 'ONE_OF_MISSING': return 'oneOf의 어떤 스키마와도 일치하지 않습니다.';
    case 'ONE_OF_MULTIPLE': return 'oneOf의 여러 스키마와 동시에 일치합니다.';
    case 'NOT_PASSED': return 'not 스키마와 일치하는 값은 허용되지 않습니다.';
    case 'CONTAINS': return 'contains 스키마와 일치하는 배열 항목이 없습니다.';
    case 'SCHEMA_IS_FALSE': return '허용되지 않은 값입니다.';
    case 'KEYWORD_TYPE_EXPECTED': return `키워드 "${p[0]}"에 올바른 형식의 값이 필요합니다: ${p[1]}`;
    default: return `검증에 실패했습니다 (${error?.keyword || error?.code || '알 수 없는 오류'}).`;
  }
}

tool({
  id: 'json-schema', cat: CAT, name: 'JSON Schema 검증 / 샘플 생성',
  desc: 'JSON Schema로 데이터를 검증하고 스키마 기반 예제 JSON을 생성합니다.',
  keywords: 'json schema validate draft 2020 2019 sample mock 검증 샘플',
  transfer: {
    inputs: [
      { id: 'json', label: '검증할 JSON', accepts: ['json'] },
      { id: 'schema', label: 'JSON Schema', accepts: ['json'] },
    ],
  },
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'json', label: '검증할 JSON', rows: 8, value: '{"name":"홍길동","age":20}' },
        { id: 'schema', label: 'JSON Schema', rows: 12, value: '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "required": ["name", "age"],\n  "properties": {\n    "name": {"type": "string", "example": "홍길동"},\n    "age": {"type": "integer", "minimum": 0}\n  }\n}' },
      ],
      actions: [{ id: 'validate', label: '검증' }, { id: 'sample', label: '샘플 생성' }],
      autorun: false, outputRows: 12,
      async process(v, o, action) {
        if (!v.schema.trim()) throw new Error('JSON Schema를 입력하세요.');
        const schema = JSON.parse(v.schema);
        const unsupported = [...unsupportedSchemaKeywords(schema)];
        if (unsupported.length)
          throw new Error(`현재 검증기가 지원하지 않는 키워드입니다: ${unsupported.join(', ')}`);
        requireLocalSampleRefs(schema);
        await loadScript(LIB.zSchema);
        const validator = ZSchema.ZSchema.create({ version: schemaDraft(schema), safe: true });
        const schemaResult = validator.validateSchema(schema);
        if (!schemaResult.valid) {
          const details = schemaResult.err?.details || [];
          const detail = details[details.length - 1];
          throw new Error(`JSON Schema 오류: ${schemaErrorMessage(detail)}`);
        }
        if (action === 'sample') {
          const sample = schemaExample(schema);
          if (sample === SAMPLE_MISSING) throw new Error('이 스키마에서는 샘플을 생성할 수 없습니다.');
          const sampleResult = validator.validate(sample, schema);
          if (!sampleResult.valid) {
            const detail = sampleResult.err?.details?.[0];
            throw new Error(`스키마에 맞는 샘플을 생성하지 못했습니다: ${schemaErrorMessage(detail)}`);
          }
          return JSON.stringify(sample, null, 2);
        }
        if (!v.json.trim()) throw new Error('검증할 JSON을 입력하세요.');
        const result = validator.validate(JSON.parse(v.json), schema);
        if (result.valid) return '✔ JSON 데이터가 스키마에 맞습니다.';
        return result.err.details.map((e, i) => {
          const path = e.path?.replace(/^#/, '') || '/';
          return `${i + 1}. ${path}: ${schemaErrorMessage(e)}`;
        }).join('\n');
      },
      note: '공식 테스트 벡터로 확인한 JSON Schema Draft 4/6/7과 2019-09/2020-12의 핵심 검증 키워드를 지원합니다. $dynamicRef/$dynamicAnchor, unevaluatedItems/unevaluatedProperties, contentSchema는 지원하지 않아 명시적으로 거부합니다. $schema를 생략하면 2020-12로 처리합니다. 샘플은 로컬 $ref, required, allOf/oneOf, prefixItems/minItems, pattern과 example/default/enum 등을 반영하고 생성 직후 다시 검증하며 외부 $ref를 가져오지 않습니다.',
    });
  },
});

/* ---------- CSV ---------- */
function checkCsvDelimiter(delim) {
  if (typeof delim !== 'string' || delim.length !== 1 || /["\r\n]/.test(delim))
    throw new Error('CSV 구분자는 따옴표나 줄바꿈이 아닌 한 글자여야 합니다.');
}

export function parseCSV(text, delim = ',') {
  checkCsvDelimiter(delim);
  const rows = [];
  let row = [], cell = '', inQ = false, afterQuote = false;
  let line = 1, quoteLine = 0;
  const finishRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
    afterQuote = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQ = false; afterQuote = true; }
      } else if (c === '\r') {
        if (text[i + 1] === '\n') { cell += '\r\n'; i++; }
        else cell += '\r';
        line++;
      } else {
        cell += c;
        if (c === '\n') line++;
      }
    } else if (afterQuote) {
      if (c === delim) { row.push(cell); cell = ''; afterQuote = false; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        finishRow();
        line++;
      } else throw new Error(`CSV 구문 오류: ${line}행의 닫는 따옴표 뒤에는 구분자나 줄바꿈만 올 수 있습니다.`);
    } else if (c === '"') {
      if (cell) throw new Error(`CSV 구문 오류: ${line}행의 따옴표는 셀의 첫 문자에만 사용할 수 있습니다.`);
      inQ = true;
      quoteLine = line;
    } else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      finishRow();
      line++;
    } else cell += c;
  }
  if (inQ) throw new Error(`CSV 구문 오류: ${quoteLine}행에서 시작한 따옴표가 닫히지 않았습니다.`);
  if (cell !== '' || row.length || afterQuote) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
export function toCSV(rows, delim = ',') {
  checkCsvDelimiter(delim);
  const esc = (v) => {
    v = v == null ? '' : String(v);
    return /["\n\r]/.test(v) || v.includes(delim) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return rows.map((r) => r.map(esc).join(delim)).join('\n');
}

/* ---------- XML ↔ JS 객체 ---------- */
function xmlToObj(node) {
  const children = [...node.children];
  const attrs = {};
  for (const a of node.attributes || []) attrs['@' + a.name] = a.value;
  if (!children.length) {
    const text = node.textContent.trim();
    return Object.keys(attrs).length ? { ...attrs, ...(text ? { '#text': text } : {}) } : text;
  }
  const obj = { ...attrs };
  for (const c of children) {
    const v = xmlToObj(c);
    if (c.tagName in obj) {
      if (!Array.isArray(obj[c.tagName])) obj[c.tagName] = [obj[c.tagName]];
      obj[c.tagName].push(v);
    } else obj[c.tagName] = v;
  }
  return obj;
}
function escXml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function objToXml(obj, tag = 'root', indent = '') {
  if (obj === null || typeof obj !== 'object') return `${indent}<${tag}>${escXml(obj ?? '')}</${tag}>`;
  if (Array.isArray(obj)) return obj.map((v) => objToXml(v, tag, indent)).join('\n');
  const attrs = Object.entries(obj).filter(([k]) => k.startsWith('@'))
    .map(([k, v]) => ` ${k.slice(1)}="${escXml(v)}"`).join('');
  const kids = Object.entries(obj).filter(([k]) => !k.startsWith('@') && k !== '#text');
  const text = obj['#text'];
  if (!kids.length) return `${indent}<${tag}${attrs}>${escXml(text ?? '')}</${tag}>`;
  const inner = kids.map(([k, v]) => objToXml(v, k, indent + '  ')).join('\n');
  return `${indent}<${tag}${attrs}>\n${inner}\n${indent}</${tag}>`;
}
export function parseXML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('XML 파싱 오류: ' + err.textContent.split('\n')[0]);
  return { [doc.documentElement.tagName]: xmlToObj(doc.documentElement) };
}

/* ---------- ENV ---------- */
function parseEnvValue(raw, lineNo, errors) {
  const value = raw.trim();
  if (!value) return '';
  const quote = value[0];
  if (quote === "'" || quote === '"') {
    let end = -1, escaped = false;
    for (let i = 1; i < value.length; i++) {
      if (quote === '"' && value[i] === '\\' && !escaped) { escaped = true; continue; }
      if (value[i] === quote && !escaped) { end = i; break; }
      escaped = false;
    }
    if (end < 0) { errors.push(`${lineNo}행: 닫히지 않은 따옴표입니다.`); return ''; }
    const tail = value.slice(end + 1).trim();
    if (tail && !tail.startsWith('#')) errors.push(`${lineNo}행: 따옴표 뒤에 올바르지 않은 문자가 있습니다.`);
    const inner = value.slice(1, end);
    if (quote === "'") return inner;
    return inner.replace(/\\(n|r|t|"|\\)/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }[c]));
  }
  return value.replace(/\s+#.*$/, '').trimEnd();
}

export function parseEnv(text) {
  const result = {}, seen = new Map(), errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const lineNo = index + 1;
    let src = line.trim();
    if (!src || src.startsWith('#')) return;
    if (/^export\s+/.test(src)) src = src.replace(/^export\s+/, '');
    const eq = src.indexOf('=');
    if (eq < 0) { errors.push(`${lineNo}행: KEY=value 형식에서 등호(=)가 없습니다.`); return; }
    const key = src.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`${lineNo}행: 올바르지 않은 변수명 "${key}"입니다.`);
      return;
    }
    if (seen.has(key)) errors.push(`${lineNo}행: "${key}" 키가 중복되었습니다. (처음 선언: ${seen.get(key)}행)`);
    else seen.set(key, lineNo);
    result[key] = parseEnvValue(src.slice(eq + 1), lineNo, errors);
  });
  if (errors.length) throw new Error('ENV 구문 오류:\n' + errors.join('\n'));
  return result;
}

function toEnv(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('ENV로 변환하려면 최상위 데이터가 객체여야 합니다.');
  const quote = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') throw new Error('ENV는 중첩 객체나 배열을 표현할 수 없습니다. 평면 객체를 입력하세요.');
    const str = String(value);
    if (!str) return '';
    if (/^[A-Za-z0-9_./:@%+-]+$/.test(str)) return str;
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
  };
  return Object.entries(data).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`ENV 변수명으로 사용할 수 없는 키입니다: "${key}"`);
    return `${key}=${quote(value)}`;
  }).join('\n');
}

/* ---------- 표 형태(2차원 배열) ↔ 객체 배열 ---------- */
function uniqueHeaders(source, width) {
  const used = new Set();
  return Array.from({ length: width }, (_, i) => {
    const raw = source[i] ?? '';
    const base = raw.trim() ? raw : `열${i + 1}`;
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name);
    return name;
  });
}
function rowsToObjects(rows, hasHeader = true) {
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const source = hasHeader ? rows[0] : [];
  const body = hasHeader ? rows.slice(1) : rows;
  const head = uniqueHeaders(source, width);
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])));
}
function objectsToRows(arr) {
  const keys = [...new Set(arr.flatMap((o) => Object.keys(o)))];
  return [keys, ...arr.map((o) => keys.map((k) => {
    const v = o[k];
    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }))];
}

let tomlMod = null;
async function toml() {
  return (tomlMod ??= await loadModule(vendorUrl('smolToml')));
}

tool({
  id: 'data-convert', cat: CAT, name: 'JSON ↔ YAML ↔ XML ↔ CSV ↔ TOML ↔ ENV',
  desc: '데이터를 JSON, YAML, XML, CSV, TOML, ENV 포맷 간에 상호 변환합니다.',
  keywords: 'convert json yaml xml csv toml env dotenv environment',
  transfer: {
    inputs: [{
      id: 'input', label: '입력', accepts: ['json', 'yaml', 'xml', 'csv', 'toml', 'env'],
      optionsByType: {
        json: { options: { from: 'json' } }, yaml: { options: { from: 'yaml' } },
        xml: { options: { from: 'xml' } }, csv: { options: { from: 'csv' } },
        toml: { options: { from: 'toml' } }, env: { options: { from: 'env' } },
      },
    }],
    outputs: ['json', 'yaml', 'xml', 'csv', 'toml', 'env'].map((type) => ({
      id: `format-${type}`, label: `${type.toUpperCase()} 결과`, type,
    })),
  },
  render(root) {
    const FMT = [['json', 'JSON'], ['yaml', 'YAML'], ['xml', 'XML'], ['csv', 'CSV'], ['toml', 'TOML'], ['env', 'ENV (.env)']];
    const CSV_DELIMS = [[',', '쉼표 (,)'], ['\t', '탭 (TSV)'], [';', '세미콜론 (;)'], ['|', '파이프 (|)']];
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 12, value: '{\n  "name": "WTools",\n  "version": 1,\n  "tags": ["web", "tools"]\n}' }],
      options: [
        { id: 'from', label: '입력 포맷', type: 'select', values: FMT, value: 'json' },
        { id: 'to', label: '출력 포맷', type: 'select', values: FMT, value: 'yaml' },
        { id: 'csvDelim', label: 'CSV 구분자', type: 'select', values: CSV_DELIMS },
        { id: 'csvHeader', label: 'CSV 헤더 포함', type: 'checkbox', value: true },
      ],
      outputRows: 12,
      transferOutput: {
        id: ({ opts }) => `format-${opts.to}`,
        when: ({ result }) => !!String(result).trim(),
      },
      async process(text, o) {
        if (!text.trim()) return '';
        let data;
        switch (o.from) {
          case 'json': data = JSON.parse(text); break;
          case 'yaml': data = jsyaml.load(text); break;
          case 'xml': data = parseXML(text); break;
          case 'csv': data = rowsToObjects(parseCSV(text, o.csvDelim), o.csvHeader); break;
          case 'toml': data = (await toml()).parse(text); break;
          case 'env': data = parseEnv(text); break;
        }
        switch (o.to) {
          case 'json': return JSON.stringify(data, null, 2);
          case 'yaml': return jsyaml.dump(data, { lineWidth: 120 });
          case 'xml': {
            if (Array.isArray(data)) data = { item: data };
            const entries = Object.entries(data);
            const body = entries.length === 1 && typeof entries[0][1] === 'object' && !Array.isArray(entries[0][1])
              ? objToXml(entries[0][1], entries[0][0])
              : objToXml(data, 'root');
            return '<?xml version="1.0" encoding="UTF-8"?>\n' + body;
          }
          case 'csv': {
            if (!Array.isArray(data)) {
              const arr = Object.values(data).find(Array.isArray);
              if (!arr) throw new Error('CSV로 변환하려면 객체 배열 형태의 데이터가 필요합니다.');
              data = arr;
            }
            const rows = objectsToRows(data.map((v) => (typeof v === 'object' && v !== null ? v : { value: v })));
            return toCSV(o.csvHeader ? rows : rows.slice(1), o.csvDelim);
          }
          case 'toml': {
            if (typeof data !== 'object' || data === null || Array.isArray(data))
              throw new Error('TOML의 최상위는 객체(테이블)여야 합니다.');
            return (await toml()).stringify(data);
          }
          case 'env': return toEnv(data);
        }
      },
      note: 'CSV 구분자·헤더 옵션은 입력 또는 출력 포맷이 CSV일 때 적용됩니다. 따옴표는 표준 CSV 방식(셀 전체를 감싸고 내부 따옴표는 ""로 이스케이프)으로 처리합니다. ENV 값은 숫자나 true/false처럼 보여도 문자열로 유지됩니다.',
    });
  },
});

tool({
  id: 'list-convert', cat: CAT, name: '리스트 변환기',
  desc: '리스트의 구분자 변경, 정렬, 중복 제거, 감싸기(quote) 등을 수행합니다.',
  keywords: 'list sort unique dedupe join split',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '리스트 (한 줄에 하나 또는 구분자로 구분)', rows: 8, placeholder: 'banana\napple\ncherry\napple' }],
      options: [
        { id: 'inSep', label: '입력 구분자', type: 'select', values: [['\n', '줄바꿈'], [',', '쉼표'], [';', '세미콜론'], ['\t', '탭'], [' ', '공백']] },
        { id: 'outSep', label: '출력 구분자', type: 'select', values: [['\n', '줄바꿈'], [', ', '쉼표+공백'], [',', '쉼표'], [';', '세미콜론'], ['\t', '탭'], [' ', '공백']] },
        { id: 'sort', label: '정렬', type: 'select', values: [['none', '안 함'], ['asc', '오름차순'], ['desc', '내림차순'], ['num', '숫자 오름차순'], ['len', '길이순'], ['rand', '무작위 섞기'], ['rev', '순서 뒤집기']] },
        { id: 'unique', label: '중복 제거', type: 'checkbox' },
        { id: 'trim', label: '공백 트림', type: 'checkbox', value: true },
        { id: 'skipEmpty', label: '빈 항목 제거', type: 'checkbox', value: true },
        { id: 'quote', label: '감싸기', type: 'select', values: [['', '없음'], ["'", "'따옴표'"], ['"', '"쌍따옴표"'], ['`', '`백틱`']] },
        { id: 'prefix', label: '접두사', type: 'text', size: 80 },
        { id: 'suffix', label: '접미사', type: 'text', size: 80 },
      ],
      process(text, o) {
        let items = text.split(o.inSep === ' ' ? /\s+/ : o.inSep);
        if (o.trim) items = items.map((s) => s.trim());
        if (o.skipEmpty) items = items.filter((s) => s !== '');
        if (o.unique) items = [...new Set(items)];
        switch (o.sort) {
          case 'asc': items.sort((a, b) => a.localeCompare(b, 'ko')); break;
          case 'desc': items.sort((a, b) => b.localeCompare(a, 'ko')); break;
          case 'num': items.sort((a, b) => parseFloat(a) - parseFloat(b)); break;
          case 'len': items.sort((a, b) => a.length - b.length); break;
          case 'rev': items.reverse(); break;
          case 'rand': for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[items[i], items[j]] = [items[j], items[i]]; } break;
        }
        items = items.map((s) => o.prefix + o.quote + s + o.quote + o.suffix);
        return items.join(o.outSep) + (items.length ? `\n\n// ${items.length}개 항목` : '');
      },
    });
  },
});

tool({
  id: 'table-convert', cat: CAT, name: 'To/From 테이블 변환',
  desc: 'CSV/TSV 데이터를 Markdown, HTML, ASCII 표로 변환하거나 Markdown 표를 CSV로 되돌립니다.',
  keywords: 'markdown table html ascii',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: '입력', rows: 8, value: '이름,나이,도시\n김철수,29,서울\n이영희,34,부산' }],
      options: [
        { id: 'from', label: '입력', type: 'select', values: [['csv', 'CSV'], ['tsv', 'TSV'], ['md', 'Markdown 표']] },
        { id: 'to', label: '출력', type: 'select', values: [['md', 'Markdown 표'], ['html', 'HTML 표'], ['ascii', 'ASCII 표'], ['csv', 'CSV'], ['tsv', 'TSV'], ['json', 'JSON']] },
      ],
      outputRows: 10,
      process(text, o) {
        if (!text.trim()) return '';
        let rows;
        if (o.from === 'md') {
          rows = text.trim().split('\n')
            .filter((l) => l.includes('|') && !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
            .map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
        } else {
          rows = parseCSV(text, o.from === 'tsv' ? '\t' : ',');
        }
        if (!rows.length) return '';
        const width = Math.max(...rows.map((r) => r.length));
        rows = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
        switch (o.to) {
          case 'md': {
            const [head, ...body] = rows;
            return '| ' + head.join(' | ') + ' |\n|' + head.map(() => ' --- |').join('') + '\n' +
              body.map((r) => '| ' + r.map((c) => c.replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
          }
          case 'html': {
            const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            const [head, ...body] = rows;
            return '<table>\n  <thead>\n    <tr>' + head.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr>\n  </thead>\n  <tbody>\n' +
              body.map((r) => '    <tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('\n') + '\n  </tbody>\n</table>';
          }
          case 'ascii': {
            const widths = Array.from({ length: width }, (_, i) => Math.max(...rows.map((r) => [...r[i]].length)));
            const line = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
            const fmt = (r) => '|' + r.map((c, i) => ' ' + c + ' '.repeat(widths[i] - [...c].length + 1)).join('|') + '|';
            return [line, fmt(rows[0]), line, ...rows.slice(1).map(fmt), line].join('\n');
          }
          case 'csv': return toCSV(rows);
          case 'tsv': return toCSV(rows, '\t');
          case 'json': return JSON.stringify(rowsToObjects(rows), null, 2);
        }
      },
    });
  },
});

/* ---------- 색상 변환 ---------- */
function hslToRgb(hDeg, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hDeg / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hDeg = 0;
  if (d) {
    if (max === r) hDeg = ((g - b) / d) % 6;
    else if (max === g) hDeg = (b - r) / d + 2;
    else hDeg = (r - g) / d + 4;
    hDeg = Math.round(hDeg * 60);
    if (hDeg < 0) hDeg += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [hDeg, Math.round(s * 100), Math.round(l * 100)];
}
function parseColor(text) {
  text = text.trim().toLowerCase();
  let m;
  if ((m = text.match(/^#?([0-9a-f]{3})$/))) return [...m[1]].map((c) => parseInt(c + c, 16));
  if ((m = text.match(/^#?([0-9a-f]{6})/))) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16));
  if ((m = text.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/))) return [+m[1], +m[2], +m[3]];
  if ((m = text.match(/hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/))) return hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
  if ((m = text.match(/cmyk\(\s*([\d.]+)%?[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/))) {
    const [c, mg, y, k] = [+m[1], +m[2], +m[3], +m[4]].map((v) => v / 100);
    return [(1 - c) * (1 - k), (1 - mg) * (1 - k), (1 - y) * (1 - k)].map((v) => Math.round(v * 255));
  }
  throw new Error('인식할 수 없는 색상 형식입니다. (#hex, rgb(), hsl(), cmyk() 지원)');
}

// 클릭해서 선택할 수 있는 기본 팔레트 (색조 12종 × 명도 5단계 + 무채색)
const PALETTE = (() => {
  const colors = [];
  for (const hue of [0, 30, 60, 120, 160, 190, 220, 250, 280, 310, 340, 20]) {
    for (const [s, l] of [[85, 68], [80, 55], [75, 45], [70, 35], [55, 25]]) {
      const [r, g, b] = hslToRgb(hue, s / 100, l / 100);
      colors.push('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
    }
  }
  for (const v of [255, 224, 192, 160, 128, 96, 64, 32, 0])
    colors.push('#' + v.toString(16).padStart(2, '0').repeat(3));
  return colors;
})();

tool({
  id: 'color-convert', cat: CAT, name: '색상 변환기',
  desc: 'HEX, RGB, HSL, CMYK 형식 간 색상을 변환하고 미리보기를 제공합니다.',
  keywords: 'color hex rgb hsl cmyk',
  render(root) {
    const io = makeIO(root, {
      inputs: [{ id: 'input', label: '색상 (#hex / rgb() / hsl() / cmyk())', rows: 2, value: '#3b82f6' }],
      outputHTML: true,
      process(text) {
        if (!text.trim()) return '';
        const [r, g, b] = parseColor(text);
        const [hDeg, s, l] = rgbToHsl(r, g, b);
        const k = 1 - Math.max(r, g, b) / 255;
        const cmyk = k === 1 ? [0, 0, 0, 100] :
          [(1 - r / 255 - k) / (1 - k), (1 - g / 255 - k) / (1 - k), (1 - b / 255 - k) / (1 - k), k].map((v) => Math.round(v * 100));
        const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
        return h('div', null,
          h('div', { style: { width: '100%', height: '70px', borderRadius: '8px', border: '1px solid var(--border)', background: hex, marginBottom: '12px' } }),
          kvTable([
            ['HEX', hex],
            ['RGB', `rgb(${r}, ${g}, ${b})`],
            ['HSL', `hsl(${hDeg}, ${s}%, ${l}%)`],
            ['CMYK', `cmyk(${cmyk[0]}%, ${cmyk[1]}%, ${cmyk[2]}%, ${cmyk[3]}%)`],
            ['RGB (0-1)', [r, g, b].map((v) => (v / 255).toFixed(3)).join(', ')],
          ]));
      },
      runOnLoad: true,
    });

    // 색상 표: 클릭하면 입력에 반영
    const swatches = h('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))', gap: '4px', margin: '4px 0 10px' },
    }, PALETTE.map((hex) => h('button', {
      type: 'button', title: hex,
      style: { height: '28px', borderRadius: '5px', border: '1px solid var(--border)', background: hex, cursor: 'pointer', padding: '0' },
      onclick: () => { io.inputEls.input.value = hex; io.run(); },
    })));
    io.inputEls.input.after(h('span', { class: 'io-label' }, '색상 표 (클릭하여 선택)'), swatches);
  },
});

tool({
  id: 'data-unit', cat: CAT, name: '데이터 단위 변환기',
  desc: '바이트, KB/KiB, MB/MiB 등 데이터 크기 단위를 변환합니다.',
  keywords: 'byte kb mb gb kib mib size',
  render(root) {
    const UNITS = [['B', 1], ['KB', 1e3], ['MB', 1e6], ['GB', 1e9], ['TB', 1e12], ['PB', 1e15],
      ['KiB', 1024], ['MiB', 1024 ** 2], ['GiB', 1024 ** 3], ['TiB', 1024 ** 4], ['PiB', 1024 ** 5], ['bit', 1 / 8]];
    makeIO(root, {
      inputs: [{ id: 'input', label: '값', rows: 1, value: '1' }],
      options: [{ id: 'unit', label: '단위', type: 'select', values: UNITS.map(([u]) => u), value: 'GiB' }],
      outputHTML: true,
      process(text, o) {
        const v = parseFloat(text.replace(/,/g, ''));
        if (isNaN(v)) throw new Error('숫자를 입력하세요.');
        const base = UNITS.find(([u]) => u === o.unit)[1];
        const bytes = v * base;
        return kvTable(UNITS.map(([u, f]) => [u, (bytes / f).toLocaleString('en-US', { maximumFractionDigits: 8 })]));
      },
      runOnLoad: true,
    });
  },
});

tool({
  id: 'ip-format', cat: CAT, name: 'IP 주소 형식 변환',
  desc: 'IPv4 주소를 10진수, 16진수, 2진수, IPv6 매핑, 6to4 등 다양한 형식으로 변환합니다.',
  keywords: 'ip decimal hex 6to4 mapped',
  render(root) {
    makeIO(root, {
      inputs: [{ id: 'input', label: 'IPv4 주소 (또는 32비트 10진수)', rows: 1, value: '192.168.0.1' }],
      outputHTML: true,
      process(text) {
        text = text.trim();
        if (!text) return '';
        let n;
        if (/^\d+$/.test(text) && !text.includes('.')) {
          n = BigInt(text);
          if (n > 0xffffffffn) throw new Error('32비트 범위를 벗어났습니다.');
          n = Number(n);
        } else {
          const m = text.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
          if (!m) throw new Error('IPv4 주소 형식이 아닙니다.');
          const parts = m.slice(1).map(Number);
          if (parts.some((p) => p > 255)) throw new Error('각 옥텟은 0~255 범위여야 합니다.');
          n = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
        }
        const oct = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
        const hexPairs = oct.map((v) => v.toString(16).padStart(2, '0'));
        return kvTable([
          ['점 표기 (10진)', oct.join('.')],
          ['32비트 10진수', String(n)],
          ['16진수', '0x' + hexPairs.join('').toUpperCase()],
          ['점 표기 (16진)', hexPairs.map((x) => '0x' + x).join('.')],
          ['점 표기 (8진)', oct.map((v) => '0' + v.toString(8)).join('.')],
          ['2진수', oct.map((v) => v.toString(2).padStart(8, '0')).join('.')],
          ['IPv6 매핑 주소', '::ffff:' + oct.join('.')],
          ['IPv6 매핑 (hex)', `::ffff:${hexPairs[0]}${hexPairs[1]}:${hexPairs[2]}${hexPairs[3]}`],
          ['6to4 프리픽스', `2002:${hexPairs[0]}${hexPairs[1]}:${hexPairs[2]}${hexPairs[3]}::/48`],
        ]);
      },
      runOnLoad: true,
    });
  },
});

/* ---------- 색상 대비 (WCAG) ---------- */
tool({
  id: 'color-contrast', cat: CAT, name: '색상 대비 검사기 (WCAG)',
  desc: '글자색과 배경색의 명암 대비율을 계산하고 WCAG 접근성 기준 통과 여부를 확인합니다.',
  keywords: 'contrast wcag accessibility a11y color ratio 접근성 대비',
  render(root) {
    makeIO(root, {
      inputs: [
        { id: 'fg', label: '글자색 (#hex / rgb() / hsl())', rows: 1, value: '#3b82f6' },
        { id: 'bg', label: '배경색', rows: 1, value: '#ffffff' },
      ],
      outputHTML: true, runOnLoad: true,
      process(v) {
        const fg = parseColor(v.fg), bg = parseColor(v.bg);
        const lum = ([r, g, b]) => {
          const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (l1 + 0.05) / (l2 + 0.05);
        const hex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
        const pass = (min) => (ratio >= min ? '✅ 통과' : '❌ 미달') + ` (기준 ${min}:1)`;
        const preview = h('div', { style: { background: hex(bg), color: hex(fg), padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' } },
          h('div', { style: { fontSize: '14px' } }, '일반 텍스트 14px — 다람쥐 헌 쳇바퀴에 타고파'),
          h('div', { style: { fontSize: '24px', fontWeight: '700', marginTop: '6px' } }, '큰 텍스트 24px Bold'));
        return h('div', null, preview, kvTable([
          ['대비율', ratio.toFixed(2) + ' : 1'],
          ['AA — 일반 텍스트', pass(4.5)],
          ['AA — 큰 텍스트 (18pt 또는 14pt bold)', pass(3)],
          ['AAA — 일반 텍스트', pass(7)],
          ['AAA — 큰 텍스트', pass(4.5)],
          ['UI 구성요소 / 그래픽', pass(3)],
        ]));
      },
    });
  },
});
