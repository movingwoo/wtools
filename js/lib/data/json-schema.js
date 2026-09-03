// JSON Schema Draft 4/6/7/2019-09/2020-12 core validation and sample generation.

export const JSON_SCHEMA_LIMITS = Object.freeze({
  maxDepth: 256,
  maxSchemaNodes: 100_000,
  maxInstanceNodes: 1_000_000,
  maxEvaluations: 1_000_000,
  maxErrors: 1_000,
  maxSampleNodes: 100_000,
  maxSampleStringLength: 1024 * 1024,
  maxSampleOutputBytes: 1024 * 1024,
  maxPatternLength: 16_384,
});

export const UNSUPPORTED_KEYWORDS = Object.freeze([
  '$dynamicAnchor', '$dynamicRef', '$recursiveAnchor', '$recursiveRef',
  '$vocabulary', 'unevaluatedItems', 'unevaluatedProperties', 'contentSchema',
]);

const UNSUPPORTED = new Set(UNSUPPORTED_KEYWORDS);
const TYPES = ['array', 'boolean', 'integer', 'number', 'null', 'object', 'string'];
const TYPE_LIST = TYPES.join(',');
const DRAFTS = new Set(['draft4', 'draft6', 'draft7', 'draft2019-09', 'draft2020-12']);
const DRAFT_URIS = new Map();
for (const [draft, uri] of [
  ['draft4', 'json-schema.org/draft-04/schema'],
  ['draft6', 'json-schema.org/draft-06/schema'],
  ['draft7', 'json-schema.org/draft-07/schema'],
  ['draft2019-09', 'json-schema.org/draft/2019-09/schema'],
  ['draft2020-12', 'json-schema.org/draft/2020-12/schema'],
]) {
  for (const scheme of ['http', 'https']) {
    DRAFT_URIS.set(`${scheme}://${uri}`, draft);
    DRAFT_URIS.set(`${scheme}://${uri}#`, draft);
  }
}
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSchema = (value, draft, allowDraft4Boolean = false) => isObject(value)
  || ((draft !== 'draft4' || allowDraft4Boolean) && typeof value === 'boolean');
const pointerToken = (value) => String(value).replace(/~/g, '~0').replace(/\//g, '~1');
const childPath = (path, value) => `${path}/${pointerToken(value)}`;

export class JsonSchemaError extends Error {
  constructor(code, params = [], keyword = '', path = '#') {
    super(code);
    this.name = 'JsonSchemaError';
    this.code = code;
    this.params = params;
    this.keyword = keyword;
    this.path = path;
  }
}

function detail(code, keyword, path, schemaPath, params = []) {
  return { code, keyword, path: `#${path}`, schemaPath: `#${schemaPath}`, params };
}

export function schemaDraft(schema) {
  if (!isObject(schema) || typeof schema.$schema !== 'string') return 'draft2020-12';
  const draft = DRAFT_URIS.get(schema.$schema);
  if (draft) return draft;
  throw new JsonSchemaError('UNSUPPORTED_DRAFT', [schema.$schema], '$schema');
}

function keywordTypeError(errors, keyword, expected, path) {
  errors.push(detail('KEYWORD_TYPE_EXPECTED', keyword, path, childPath(path, keyword),
    [keyword, expected]));
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validUriReference(value) {
  if (/[\u0000-\u0020\u007f<>"\\^`{|}]/u.test(value)) return false;
  try { decodeURI(value); }
  catch { return false; }
  return true;
}

function uniqueJsonValues(values) {
  const seen = new Set();
  for (const value of values) {
    const key = canonicalJson(value);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function validTypeKeyword(value) {
  if (typeof value === 'string') return TYPES.includes(value);
  return Array.isArray(value) && value.length > 0
    && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string' && TYPES.includes(item));
}

function validStringArray(value, nonEmpty = false) {
  return Array.isArray(value) && (!nonEmpty || value.length > 0)
    && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string');
}

function decodeFragment(ref) {
  try {
    return decodeURIComponent(ref.slice(1));
  } catch {
    throw new JsonSchemaError('INVALID_REF', [ref], '$ref');
  }
}

function resolvePointer(root, fragment, ref) {
  let value = root;
  let path = '';
  if (!fragment) return { schema: root, path };
  if (!fragment.startsWith('/')) return null;
  for (const raw of fragment.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if ((value === null || typeof value !== 'object') || !hasOwn(value, key))
      throw new JsonSchemaError('REF_NOT_FOUND', [ref], '$ref');
    value = value[key];
    path = childPath(path, key);
  }
  return { schema: value, path };
}

function buildSchemaContext(root, draft) {
  return { root, draft, anchors: new Map(), paths: new WeakMap(), references: [] };
}

function indexAnchor(context, name, schema, path, keyword, errors) {
  if (typeof name !== 'string') {
    keywordTypeError(errors, keyword, 'string', path);
    return;
  }
  const anchor = name.startsWith('#') ? name.slice(1) : name;
  const pattern = keyword === '$anchor' && context.draft === 'draft2020-12'
    ? /^[A-Za-z_][-A-Za-z0-9._]*$/
    : /^[A-Za-z][-A-Za-z0-9.:_]*$/;
  if (!anchor || !pattern.test(anchor)) {
    errors.push(detail('INVALID_ANCHOR', keyword, path, childPath(path, keyword), [name]));
    return;
  }
  if (context.anchors.has(anchor)) {
    errors.push(detail('DUPLICATE_ANCHOR', keyword, path, childPath(path, keyword), [anchor]));
    return;
  }
  context.anchors.set(anchor, { schema, path });
}

function resolveReference(context, ref) {
  if (typeof ref !== 'string') throw new JsonSchemaError('KEYWORD_TYPE_EXPECTED', ['$ref', 'string'], '$ref');
  if (!ref.startsWith('#')) throw new JsonSchemaError('EXTERNAL_REF', [ref], '$ref');
  const fragment = decodeFragment(ref);
  const pointer = resolvePointer(context.root, fragment, ref);
  if (pointer) return pointer;
  const target = context.anchors.get(fragment);
  if (!target) throw new JsonSchemaError('REF_NOT_FOUND', [ref], '$ref');
  return target;
}

function walkSchema(schema, path, depth, context, state, errors, allowDraft4Boolean = false) {
  if (errors.length >= JSON_SCHEMA_LIMITS.maxErrors) return;
  if (++state.nodes > JSON_SCHEMA_LIMITS.maxSchemaNodes) {
    errors.push(detail('SCHEMA_NODE_LIMIT', '', path, path,
      [JSON_SCHEMA_LIMITS.maxSchemaNodes]));
    return;
  }
  if (depth > JSON_SCHEMA_LIMITS.maxDepth) {
    errors.push(detail('SCHEMA_DEPTH_LIMIT', '', path, path, [JSON_SCHEMA_LIMITS.maxDepth]));
    return;
  }
  if (!isSchema(schema, context.draft, allowDraft4Boolean)) {
    errors.push(detail('INVALID_SCHEMA', '', path, path, []));
    return;
  }
  if (typeof schema === 'boolean') return;
  context.paths.set(schema, path);

  for (const keyword of Object.keys(schema)) {
    if (UNSUPPORTED.has(keyword))
      errors.push(detail('UNSUPPORTED_KEYWORD', keyword, path, childPath(path, keyword), [keyword]));
  }
  if (hasOwn(schema, '$ref')) {
    if (typeof schema.$ref !== 'string') keywordTypeError(errors, '$ref', 'string', path);
    else context.references.push({ ref: schema.$ref, path: childPath(path, '$ref') });
  }
  if (hasOwn(schema, '$schema') && typeof schema.$schema !== 'string')
    keywordTypeError(errors, '$schema', 'string', path);
  if ((context.draft === 'draft2019-09' || context.draft === 'draft2020-12')
      && hasOwn(schema, '$anchor'))
    indexAnchor(context, schema.$anchor, schema, path, '$anchor', errors);
  const idKeyword = context.draft === 'draft4' ? 'id' : '$id';
  const legacyId = schema[idKeyword];
  if (hasOwn(schema, idKeyword) && typeof legacyId !== 'string')
    keywordTypeError(errors, idKeyword, 'string', path);
  if (typeof legacyId === 'string' && context.draft !== 'draft4'
      && (!validUriReference(legacyId)
        || ((context.draft === 'draft2019-09' || context.draft === 'draft2020-12')
          && /#.+/u.test(legacyId))))
    errors.push(detail('INVALID_ID', idKeyword, path, childPath(path, idKeyword), [legacyId]));
  if (depth > 0 && typeof legacyId === 'string' && !legacyId.startsWith('#'))
    errors.push(detail('UNSUPPORTED_NESTED_ID', idKeyword, path,
      childPath(path, idKeyword), [legacyId]));
  if (typeof legacyId === 'string' && /^#[^/]/.test(legacyId))
    indexAnchor(context, legacyId, schema, path, idKeyword, errors);

  if (hasOwn(schema, 'type') && !validTypeKeyword(schema.type))
    keywordTypeError(errors, 'type', TYPE_LIST, path);
  if (hasOwn(schema, 'enum') && (!Array.isArray(schema.enum)
      || ((context.draft === 'draft4' || context.draft === 'draft6' || context.draft === 'draft7')
        && (schema.enum.length === 0 || !uniqueJsonValues(schema.enum)))))
    keywordTypeError(errors, 'enum', context.draft === 'draft2019-09'
      || context.draft === 'draft2020-12' ? 'array' : 'non-empty array of unique JSON values', path);

  for (const keyword of ['multipleOf']) {
    if (hasOwn(schema, keyword) && (!isFiniteNumber(schema[keyword]) || schema[keyword] <= 0))
      keywordTypeError(errors, keyword, 'number greater than 0', path);
  }
  for (const keyword of ['minimum', 'maximum']) {
    if (hasOwn(schema, keyword) && !isFiniteNumber(schema[keyword]))
      keywordTypeError(errors, keyword, 'number', path);
  }
  for (const keyword of ['exclusiveMinimum', 'exclusiveMaximum']) {
    if (!hasOwn(schema, keyword)) continue;
    const valid = context.draft === 'draft4'
      ? typeof schema[keyword] === 'boolean' : isFiniteNumber(schema[keyword]);
    if (!valid) keywordTypeError(errors, keyword,
      context.draft === 'draft4' ? 'boolean' : 'number', path);
  }
  const nonNegativeKeywords = [
    'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties',
  ];
  if (context.draft === 'draft2019-09' || context.draft === 'draft2020-12')
    nonNegativeKeywords.push('minContains', 'maxContains');
  for (const keyword of nonNegativeKeywords) {
    if (hasOwn(schema, keyword) && !isNonNegativeInteger(schema[keyword]))
      keywordTypeError(errors, keyword, 'non-negative integer', path);
  }
  const stringKeywords = ['pattern', 'format'];
  for (const keyword of ['title', 'description']) {
    if (hasOwn(schema, keyword) && typeof schema[keyword] !== 'string')
      keywordTypeError(errors, keyword, 'string', path);
  }
  if ((context.draft === 'draft7' || context.draft === 'draft2019-09'
      || context.draft === 'draft2020-12') && hasOwn(schema, '$comment')
      && typeof schema.$comment !== 'string')
    keywordTypeError(errors, '$comment', 'string', path);
  if (context.draft === 'draft7' || context.draft === 'draft2019-09'
      || context.draft === 'draft2020-12')
    stringKeywords.push('contentEncoding', 'contentMediaType');
  for (const keyword of stringKeywords) {
    if (hasOwn(schema, keyword) && typeof schema[keyword] !== 'string')
      keywordTypeError(errors, keyword, 'string', path);
  }
  if (typeof schema.pattern === 'string') {
    if (schema.pattern.length > JSON_SCHEMA_LIMITS.maxPatternLength)
      errors.push(detail('PATTERN_LENGTH_LIMIT', 'pattern', path, childPath(path, 'pattern'),
        [JSON_SCHEMA_LIMITS.maxPatternLength]));
    else {
      try { new RegExp(schema.pattern, 'u'); }
      catch { errors.push(detail('INVALID_PATTERN', 'pattern', path, childPath(path, 'pattern'), [schema.pattern])); }
    }
  }
  if (hasOwn(schema, 'uniqueItems') && typeof schema.uniqueItems !== 'boolean')
    keywordTypeError(errors, 'uniqueItems', 'boolean', path);
  if (context.draft !== 'draft4' && context.draft !== 'draft6') {
    for (const keyword of ['readOnly', 'writeOnly']) {
      if (hasOwn(schema, keyword) && typeof schema[keyword] !== 'boolean')
        keywordTypeError(errors, keyword, 'boolean', path);
    }
  }
  if ((context.draft === 'draft2019-09' || context.draft === 'draft2020-12')
      && hasOwn(schema, 'deprecated') && typeof schema.deprecated !== 'boolean')
    keywordTypeError(errors, 'deprecated', 'boolean', path);
  if (context.draft !== 'draft4' && hasOwn(schema, 'examples') && !Array.isArray(schema.examples))
    keywordTypeError(errors, 'examples', 'array', path);
  if (hasOwn(schema, 'required') && !validStringArray(schema.required, context.draft === 'draft4'))
    keywordTypeError(errors, 'required', context.draft === 'draft4'
      ? 'non-empty array of unique strings' : 'array of unique strings', path);

  const schemaMaps = ['properties', 'patternProperties'];
  if (context.draft === 'draft4' || context.draft === 'draft6' || context.draft === 'draft7')
    schemaMaps.push('definitions');
  else schemaMaps.push('$defs');
  if (context.draft === 'draft2019-09' || context.draft === 'draft2020-12')
    schemaMaps.push('dependentSchemas');
  for (const keyword of schemaMaps) {
    if (!hasOwn(schema, keyword)) continue;
    if (!isObject(schema[keyword])) {
      keywordTypeError(errors, keyword, 'object', path);
      continue;
    }
    for (const [key, child] of Object.entries(schema[keyword]))
      walkSchema(child, childPath(childPath(path, keyword), key), depth + 1, context, state, errors);
  }
  if (isObject(schema.patternProperties)) {
    for (const pattern of Object.keys(schema.patternProperties)) {
      if (pattern.length > JSON_SCHEMA_LIMITS.maxPatternLength)
        errors.push(detail('PATTERN_LENGTH_LIMIT', 'patternProperties', path,
          childPath(childPath(path, 'patternProperties'), pattern), [JSON_SCHEMA_LIMITS.maxPatternLength]));
      else {
        try { new RegExp(pattern, 'u'); }
        catch { errors.push(detail('INVALID_PATTERN', 'patternProperties', path,
          childPath(childPath(path, 'patternProperties'), pattern), [pattern])); }
      }
    }
  }

  const directSchemas = ['additionalProperties', 'not'];
  if (context.draft !== 'draft2020-12') directSchemas.push('additionalItems');
  if (context.draft !== 'draft4') directSchemas.push('contains', 'propertyNames');
  if (context.draft === 'draft7' || context.draft === 'draft2019-09'
      || context.draft === 'draft2020-12') directSchemas.push('if', 'then', 'else');
  for (const keyword of directSchemas) {
    if (!hasOwn(schema, keyword)) continue;
    walkSchema(schema[keyword], childPath(path, keyword), depth + 1, context, state, errors,
      context.draft === 'draft4'
        && (keyword === 'additionalProperties' || keyword === 'additionalItems'));
  }
  if (hasOwn(schema, 'items')) {
    if (Array.isArray(schema.items) && context.draft !== 'draft2020-12') {
      schema.items.forEach((child, index) =>
        walkSchema(child, childPath(childPath(path, 'items'), index), depth + 1, context, state, errors));
    } else walkSchema(schema.items, childPath(path, 'items'), depth + 1, context, state, errors);
  }
  if (context.draft === 'draft2020-12' && hasOwn(schema, 'prefixItems')) {
    if (!Array.isArray(schema.prefixItems)) keywordTypeError(errors, 'prefixItems', 'array', path);
    else schema.prefixItems.forEach((child, index) =>
      walkSchema(child, childPath(childPath(path, 'prefixItems'), index), depth + 1, context, state, errors));
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (!hasOwn(schema, keyword)) continue;
    if (!Array.isArray(schema[keyword]) || schema[keyword].length === 0) {
      keywordTypeError(errors, keyword, 'non-empty array', path);
      continue;
    }
    schema[keyword].forEach((child, index) =>
      walkSchema(child, childPath(childPath(path, keyword), index), depth + 1, context, state, errors));
  }

  if ((context.draft === 'draft4' || context.draft === 'draft6' || context.draft === 'draft7')
      && hasOwn(schema, 'dependencies')) {
    if (!isObject(schema.dependencies)) keywordTypeError(errors, 'dependencies', 'object', path);
    else for (const [key, dependency] of Object.entries(schema.dependencies)) {
      const dependencyPath = childPath(childPath(path, 'dependencies'), key);
      if (Array.isArray(dependency)) {
        if (!validStringArray(dependency, context.draft === 'draft4'))
          keywordTypeError(errors, `dependencies/${key}`, context.draft === 'draft4'
            ? 'non-empty array of unique strings' : 'array of unique strings', path);
      } else walkSchema(dependency, dependencyPath, depth + 1, context, state, errors);
    }
  }
  if ((context.draft === 'draft2019-09' || context.draft === 'draft2020-12')
      && hasOwn(schema, 'dependentRequired')) {
    if (!isObject(schema.dependentRequired)) keywordTypeError(errors, 'dependentRequired', 'object', path);
    else for (const [key, dependency] of Object.entries(schema.dependentRequired)) {
      if (!validStringArray(dependency))
        keywordTypeError(errors, `dependentRequired/${key}`, 'array of unique strings', path);
    }
  }
}

export function validateSchema(schema, options = {}) {
  let draft;
  try {
    const declared = isObject(schema) && typeof schema.$schema === 'string'
      ? schemaDraft(schema) : null;
    draft = options.draft || declared || 'draft2020-12';
    if (!DRAFTS.has(draft)) throw new JsonSchemaError('UNSUPPORTED_DRAFT', [draft], '$schema');
    if (declared && declared !== draft)
      throw new JsonSchemaError('DRAFT_MISMATCH', [declared, draft], '$schema');
  }
  catch (error) {
    return { valid: false, errors: [detail(error.code, error.keyword, '', '', error.params)] };
  }
  const context = buildSchemaContext(schema, draft);
  const errors = [];
  if (draft === 'draft4' && typeof schema === 'boolean')
    errors.push(detail('INVALID_SCHEMA', '', '', '', []));
  else walkSchema(schema, '', 0, context, { nodes: 0 }, errors);
  if (!errors.length) {
    for (const reference of context.references) {
      try {
        const target = resolveReference(context, reference.ref);
        if (!isSchema(target.schema, draft))
          errors.push(detail('INVALID_REF_TARGET', '$ref', '', reference.path, [reference.ref]));
      } catch (error) {
        errors.push(detail(error.code || 'INVALID_REF', '$ref', '', reference.path,
          error.params || [reference.ref]));
      }
    }
  }
  return { valid: errors.length === 0, errors, draft, context };
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(value, expected) {
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (expected === 'object') return isObject(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

function equalJson(left, right, depth = 0) {
  if (Object.is(left, right) || (left === 0 && right === 0)) return true;
  if (depth > JSON_SCHEMA_LIMITS.maxDepth || left === null || right === null
      || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) return left.length === right.length
    && left.every((item, index) => equalJson(item, right[index], depth + 1));
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    hasOwn(right, key) && equalJson(left[key], right[key], depth + 1));
}

function canonicalJson(value, depth = 0) {
  if (depth > JSON_SCHEMA_LIMITS.maxDepth)
    throw new JsonSchemaError('INSTANCE_DEPTH_LIMIT', [JSON_SCHEMA_LIMITS.maxDepth]);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`).join(',')}}`;
}

function inspectInstance(root) {
  const stack = [{ value: root, depth: 0 }];
  const seen = new WeakSet();
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (++nodes > JSON_SCHEMA_LIMITS.maxInstanceNodes)
      throw new JsonSchemaError('INSTANCE_NODE_LIMIT', [JSON_SCHEMA_LIMITS.maxInstanceNodes]);
    if (depth > JSON_SCHEMA_LIMITS.maxDepth)
      throw new JsonSchemaError('INSTANCE_DEPTH_LIMIT', [JSON_SCHEMA_LIMITS.maxDepth]);
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) throw new JsonSchemaError('INSTANCE_CYCLE');
    seen.add(value);
    for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
  }
  return nodes;
}

function stringLength(value) {
  let length = 0;
  for (const _character of value) length++;
  return length;
}

const powersOfTen = [1n];
function powerOfTen(exponent) {
  while (powersOfTen.length <= exponent)
    powersOfTen.push(powersOfTen[powersOfTen.length - 1] * 10n);
  return powersOfTen[exponent];
}

function decimalFraction(value) {
  const [coefficient, exponentText = '0'] = Math.abs(value).toString().toLowerCase().split('e');
  const point = coefficient.indexOf('.');
  const fractionDigits = point < 0 ? 0 : coefficient.length - point - 1;
  let numerator = BigInt(coefficient.replace('.', ''));
  let scale = fractionDigits - Number(exponentText);
  if (scale < 0) {
    numerator *= powerOfTen(-scale);
    scale = 0;
  }
  return { numerator, scale };
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const point = value.codePointAt(index);
    if (point > 0xffff) index++;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function isMultipleOf(value, divisor) {
  if (!Number.isFinite(value) || !Number.isFinite(divisor) || divisor <= 0) return false;
  const left = decimalFraction(value);
  const right = decimalFraction(divisor);
  const scale = Math.max(left.scale, right.scale);
  const dividend = left.numerator * powerOfTen(scale - left.scale);
  const divisorInteger = right.numerator * powerOfTen(scale - right.scale);
  return divisorInteger !== 0n && dividend % divisorInteger === 0n;
}

function addError(context, report, code, keyword, instancePath, schemaPath, params = []) {
  if (report && context.errors.length < context.maxErrors)
    context.errors.push(detail(code, keyword, instancePath,
      keyword ? childPath(schemaPath, keyword) : schemaPath, params));
}

function testSchema(schema, value, context, instancePath, schemaPath, depth) {
  const errorCount = context.errors.length;
  const valid = evaluate(schema, value, context, instancePath, schemaPath, depth, false);
  context.errors.length = errorCount;
  return valid;
}

function evaluate(schema, value, context, instancePath, schemaPath, depth, report) {
  if (++context.evaluations > JSON_SCHEMA_LIMITS.maxEvaluations)
    throw new JsonSchemaError('EVALUATION_LIMIT', [JSON_SCHEMA_LIMITS.maxEvaluations]);
  if (depth > JSON_SCHEMA_LIMITS.maxDepth)
    throw new JsonSchemaError('INSTANCE_DEPTH_LIMIT', [JSON_SCHEMA_LIMITS.maxDepth]);
  if (schema === true) return true;
  if (schema === false) {
    addError(context, report, 'SCHEMA_IS_FALSE', '', instancePath, schemaPath);
    return false;
  }

  let valid = true;
  if (typeof schema.$ref === 'string') {
    const target = resolveReference(context.schemaContext, schema.$ref);
    const referenceKey = `${target.path}\u0000${instancePath}`;
    let referenceValid = true;
    if (!context.references.has(referenceKey)) {
      context.references.add(referenceKey);
      referenceValid = evaluate(target.schema, value, context, instancePath, target.path, depth + 1, report);
      context.references.delete(referenceKey);
    }
    if (context.draft === 'draft4' || context.draft === 'draft6' || context.draft === 'draft7')
      return referenceValid;
    valid = referenceValid && valid;
  }

  if (hasOwn(schema, 'type')) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((type) => typeMatches(value, type))) {
      addError(context, report, 'INVALID_TYPE', 'type', instancePath, schemaPath,
        [expected.join(','), jsonType(value)]);
      valid = false;
    }
  }
  if (hasOwn(schema, 'enum') && !schema.enum.some((item) => equalJson(item, value))) {
    addError(context, report, 'ENUM_MISMATCH', 'enum', instancePath, schemaPath);
    valid = false;
  }
  if (context.draft !== 'draft4' && hasOwn(schema, 'const')) {
    if (!equalJson(schema.const, value)) {
      addError(context, report, 'CONST', 'const', instancePath, schemaPath);
      valid = false;
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (hasOwn(schema, 'multipleOf') && !isMultipleOf(value, schema.multipleOf)) {
      addError(context, report, 'MULTIPLE_OF', 'multipleOf', instancePath, schemaPath,
        [value, schema.multipleOf]);
      valid = false;
    }
    const draft4 = context.draft === 'draft4';
    if (hasOwn(schema, 'minimum')) {
      const exclusive = draft4 && schema.exclusiveMinimum === true;
      if ((!exclusive && value < schema.minimum) || (exclusive && value <= schema.minimum)) {
        addError(context, report, exclusive ? 'MINIMUM_EXCLUSIVE' : 'MINIMUM',
          exclusive ? 'exclusiveMinimum' : 'minimum', instancePath, schemaPath,
          [value, schema.minimum]);
        valid = false;
      }
    }
    if (!draft4 && hasOwn(schema, 'exclusiveMinimum') && value <= schema.exclusiveMinimum) {
      addError(context, report, 'MINIMUM_EXCLUSIVE', 'exclusiveMinimum', instancePath, schemaPath,
        [value, schema.exclusiveMinimum]);
      valid = false;
    }
    if (hasOwn(schema, 'maximum')) {
      const exclusive = draft4 && schema.exclusiveMaximum === true;
      if ((!exclusive && value > schema.maximum) || (exclusive && value >= schema.maximum)) {
        addError(context, report, exclusive ? 'MAXIMUM_EXCLUSIVE' : 'MAXIMUM',
          exclusive ? 'exclusiveMaximum' : 'maximum', instancePath, schemaPath,
          [value, schema.maximum]);
        valid = false;
      }
    }
    if (!draft4 && hasOwn(schema, 'exclusiveMaximum') && value >= schema.exclusiveMaximum) {
      addError(context, report, 'MAXIMUM_EXCLUSIVE', 'exclusiveMaximum', instancePath, schemaPath,
        [value, schema.exclusiveMaximum]);
      valid = false;
    }
  }

  if (typeof value === 'string') {
    const length = stringLength(value);
    if (hasOwn(schema, 'minLength') && length < schema.minLength) {
      addError(context, report, 'MIN_LENGTH', 'minLength', instancePath, schemaPath,
        [length, schema.minLength]);
      valid = false;
    }
    if (hasOwn(schema, 'maxLength') && length > schema.maxLength) {
      addError(context, report, 'MAX_LENGTH', 'maxLength', instancePath, schemaPath,
        [length, schema.maxLength]);
      valid = false;
    }
    if (typeof schema.pattern === 'string') {
      let expression = context.patterns.get(schema.pattern);
      if (!expression) {
        expression = new RegExp(schema.pattern, 'u');
        context.patterns.set(schema.pattern, expression);
      }
      expression.lastIndex = 0;
      if (!expression.test(value)) {
        addError(context, report, 'PATTERN', 'pattern', instancePath, schemaPath, [schema.pattern]);
        valid = false;
      }
    }
  }

  if (Array.isArray(value)) {
    if (hasOwn(schema, 'minItems') && value.length < schema.minItems) {
      addError(context, report, 'ARRAY_LENGTH_SHORT', 'minItems', instancePath, schemaPath,
        [value.length, schema.minItems]);
      valid = false;
    }
    if (hasOwn(schema, 'maxItems') && value.length > schema.maxItems) {
      addError(context, report, 'ARRAY_LENGTH_LONG', 'maxItems', instancePath, schemaPath,
        [value.length, schema.maxItems]);
      valid = false;
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      let unique = true;
      for (const item of value) {
        const key = canonicalJson(item);
        if (seen.has(key)) { unique = false; break; }
        seen.add(key);
      }
      if (!unique) {
        addError(context, report, 'ARRAY_UNIQUE', 'uniqueItems', instancePath, schemaPath);
        valid = false;
      }
    }

    if (context.draft === 'draft2020-12') {
      const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
      for (let index = 0; index < Math.min(prefix.length, value.length); index++) {
        if (!evaluate(prefix[index], value[index], context, childPath(instancePath, index),
          childPath(childPath(schemaPath, 'prefixItems'), index), depth + 1, report)) valid = false;
      }
      if (hasOwn(schema, 'items')) {
        for (let index = prefix.length; index < value.length; index++) {
          if (!evaluate(schema.items, value[index], context, childPath(instancePath, index),
            childPath(schemaPath, 'items'), depth + 1, report)) valid = false;
        }
      }
    } else if (Array.isArray(schema.items)) {
      for (let index = 0; index < Math.min(schema.items.length, value.length); index++) {
        if (!evaluate(schema.items[index], value[index], context, childPath(instancePath, index),
          childPath(childPath(schemaPath, 'items'), index), depth + 1, report)) valid = false;
      }
      if (value.length > schema.items.length && hasOwn(schema, 'additionalItems')) {
        for (let index = schema.items.length; index < value.length; index++) {
          if (!evaluate(schema.additionalItems, value[index], context, childPath(instancePath, index),
            childPath(schemaPath, 'additionalItems'), depth + 1, report)) valid = false;
        }
      }
    } else if (hasOwn(schema, 'items')) {
      for (let index = 0; index < value.length; index++) {
        if (!evaluate(schema.items, value[index], context, childPath(instancePath, index),
          childPath(schemaPath, 'items'), depth + 1, report)) valid = false;
      }
    }
    const supportsContains = context.draft !== 'draft4';
    if (supportsContains && hasOwn(schema, 'contains')) {
      let matches = 0;
      for (let index = 0; index < value.length; index++) {
        if (testSchema(schema.contains, value[index], context, childPath(instancePath, index),
          childPath(schemaPath, 'contains'), depth + 1)) matches++;
      }
      const modern = context.draft === 'draft2019-09' || context.draft === 'draft2020-12';
      const minimum = modern && hasOwn(schema, 'minContains') ? schema.minContains : 1;
      const maximum = modern && hasOwn(schema, 'maxContains') ? schema.maxContains : Infinity;
      if (matches < minimum || matches > maximum) {
        addError(context, report, 'CONTAINS', 'contains', instancePath, schemaPath,
          [matches, minimum, maximum]);
        valid = false;
      }
    }
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    if (hasOwn(schema, 'minProperties') && keys.length < schema.minProperties) {
      addError(context, report, 'OBJECT_PROPERTIES_SHORT', 'minProperties', instancePath, schemaPath,
        [keys.length, schema.minProperties]);
      valid = false;
    }
    if (hasOwn(schema, 'maxProperties') && keys.length > schema.maxProperties) {
      addError(context, report, 'OBJECT_PROPERTIES_LONG', 'maxProperties', instancePath, schemaPath,
        [keys.length, schema.maxProperties]);
      valid = false;
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) if (!hasOwn(value, key)) {
        addError(context, report, 'OBJECT_MISSING_REQUIRED_PROPERTY', 'required',
          instancePath, schemaPath, [key]);
        valid = false;
      }
    }
    const dependencyMap = context.draft === 'draft2019-09' || context.draft === 'draft2020-12'
      ? schema.dependentRequired : schema.dependencies;
    if (isObject(dependencyMap)) {
      for (const [key, dependencies] of Object.entries(dependencyMap)) {
        if (!hasOwn(value, key) || !Array.isArray(dependencies)) continue;
        for (const dependency of dependencies) if (!hasOwn(value, dependency)) {
          addError(context, report, 'DEPENDENT_REQUIRED',
            context.draft === 'draft2019-09' || context.draft === 'draft2020-12'
              ? 'dependentRequired' : 'dependencies', instancePath, schemaPath, [key, dependency]);
          valid = false;
        }
      }
    }
    if (isObject(schema.properties)) {
      for (const [key, child] of Object.entries(schema.properties)) if (hasOwn(value, key)) {
        if (!evaluate(child, value[key], context, childPath(instancePath, key),
          childPath(childPath(schemaPath, 'properties'), key), depth + 1, report)) valid = false;
      }
    }
    const matched = new Set(Object.keys(schema.properties || {}).filter((key) => hasOwn(value, key)));
    if (isObject(schema.patternProperties)) {
      for (const [pattern, child] of Object.entries(schema.patternProperties)) {
        let expression = context.patterns.get(pattern);
        if (!expression) { expression = new RegExp(pattern, 'u'); context.patterns.set(pattern, expression); }
        for (const key of keys) {
          expression.lastIndex = 0;
          if (!expression.test(key)) continue;
          matched.add(key);
          if (!evaluate(child, value[key], context, childPath(instancePath, key),
            childPath(childPath(schemaPath, 'patternProperties'), pattern), depth + 1, report)) valid = false;
        }
      }
    }
    if (hasOwn(schema, 'additionalProperties')) {
      for (const key of keys) if (!matched.has(key)) {
        if (!evaluate(schema.additionalProperties, value[key], context, childPath(instancePath, key),
          childPath(schemaPath, 'additionalProperties'), depth + 1, report)) {
          if (schema.additionalProperties === false) {
            if (report && context.errors.length) context.errors.pop();
            addError(context, report, 'OBJECT_ADDITIONAL_PROPERTIES', 'additionalProperties',
              instancePath, schemaPath, [key]);
          }
          valid = false;
        }
      }
    }
    if (context.draft !== 'draft4' && hasOwn(schema, 'propertyNames')) {
      for (const key of keys) if (!evaluate(schema.propertyNames, key, context,
        childPath(instancePath, key), childPath(schemaPath, 'propertyNames'), depth + 1, report)) valid = false;
    }
    const schemaDependencies = context.draft === 'draft2019-09' || context.draft === 'draft2020-12'
      ? schema.dependentSchemas : schema.dependencies;
    if (isObject(schemaDependencies)) {
      for (const [key, dependency] of Object.entries(schemaDependencies)) {
        if (!hasOwn(value, key) || Array.isArray(dependency)) continue;
        if (!evaluate(dependency, value, context, instancePath,
          childPath(childPath(schemaPath,
            context.draft === 'draft2019-09' || context.draft === 'draft2020-12'
              ? 'dependentSchemas' : 'dependencies'), key), depth + 1, report)) valid = false;
      }
    }
  }

  for (const keyword of ['allOf']) if (Array.isArray(schema[keyword])) {
    for (let index = 0; index < schema[keyword].length; index++) {
      if (!evaluate(schema[keyword][index], value, context, instancePath,
        childPath(childPath(schemaPath, keyword), index), depth + 1, report)) valid = false;
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const count = schema.anyOf.reduce((total, child, index) => total + Number(testSchema(child, value,
      context, instancePath, childPath(childPath(schemaPath, 'anyOf'), index), depth + 1)), 0);
    if (!count) {
      addError(context, report, 'ANY_OF_MISSING', 'anyOf', instancePath, schemaPath);
      valid = false;
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const count = schema.oneOf.reduce((total, child, index) => total + Number(testSchema(child, value,
      context, instancePath, childPath(childPath(schemaPath, 'oneOf'), index), depth + 1)), 0);
    if (count !== 1) {
      addError(context, report, count ? 'ONE_OF_MULTIPLE' : 'ONE_OF_MISSING',
        'oneOf', instancePath, schemaPath, [count]);
      valid = false;
    }
  }
  if (hasOwn(schema, 'not') && testSchema(schema.not, value, context, instancePath,
    childPath(schemaPath, 'not'), depth + 1)) {
    addError(context, report, 'NOT_PASSED', 'not', instancePath, schemaPath);
    valid = false;
  }
  if (context.draft !== 'draft4' && context.draft !== 'draft6' && hasOwn(schema, 'if')) {
    const condition = testSchema(schema.if, value, context, instancePath,
      childPath(schemaPath, 'if'), depth + 1);
    const keyword = condition ? 'then' : 'else';
    if (hasOwn(schema, keyword) && !evaluate(schema[keyword], value, context, instancePath,
      childPath(schemaPath, keyword), depth + 1, report)) valid = false;
  }
  return valid;
}

export function validateJsonSchema(value, schema, options = {}) {
  const schemaResult = options.schemaResult || validateSchema(schema, options);
  if (!schemaResult.valid) return { valid: false, errors: schemaResult.errors, schemaInvalid: true };
  try { inspectInstance(value); }
  catch (error) {
    return { valid: false, errors: [detail(error.code, '', '', '', error.params || [])] };
  }
  const context = {
    draft: schemaResult.draft,
    schemaContext: schemaResult.context,
    errors: [],
    maxErrors: Math.min(options.maxErrors || JSON_SCHEMA_LIMITS.maxErrors, JSON_SCHEMA_LIMITS.maxErrors),
    evaluations: 0,
    references: new Set(),
    patterns: new Map(),
  };
  try {
    const valid = evaluate(schema, value, context, '', '', 0, true);
    return { valid, errors: context.errors, evaluations: context.evaluations };
  } catch (error) {
    const code = error?.code || 'VALIDATION_ERROR';
    return { valid: false, errors: [detail(code, error?.keyword || '', '', '', error?.params || [])] };
  }
}

function mergeSchemas(left, right) {
  if (left === false || right === false) return false;
  if (left === true || left == null) return right;
  if (right === true || right == null) return left;
  const merged = { ...left, ...right };
  if (left.properties || right.properties) {
    merged.properties = Object.assign(Object.create(null), left.properties || {});
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

function firstPatternAlternative(source) {
  let depth = 0, bracket = false, escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (character === '[') bracket = true;
    else if (character === ']') bracket = false;
    else if (!bracket && character === '(') depth++;
    else if (!bracket && character === ')') depth--;
    else if (!bracket && depth === 0 && character === '|') return source.slice(0, index);
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

function sampleLimit() {
  throw new JsonSchemaError('SAMPLE_LIMIT', [
    JSON_SCHEMA_LIMITS.maxSampleNodes,
    JSON_SCHEMA_LIMITS.maxSampleOutputBytes,
  ]);
}

function repeatSampleToken(token, count, currentLength = 0) {
  if (!Number.isSafeInteger(count) || count < 0 || (token.length
      && count > Math.floor((JSON_SCHEMA_LIMITS.maxSampleStringLength - currentLength) / token.length)))
    sampleLimit();
  return token.repeat(count);
}

function patternExample(pattern, minLength = 0) {
  if (minLength > JSON_SCHEMA_LIMITS.maxSampleStringLength) sampleLimit();
  const source = firstPatternAlternative(pattern.replace(/^\^/, '').replace(/\$$/, ''));
  let output = '';
  for (let index = 0; index < source.length;) {
    let token = '', next = index + 1;
    const character = source[index];
    if (character === '\\') {
      const escaped = source[index + 1];
      token = escaped === 'd' ? '0' : escaped === 'w' ? 'a' : escaped === 's' ? ' '
        : escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t' : escaped || '';
      next = index + 2;
    } else if (character === '[') {
      let end = index + 1, escaped = false;
      for (; end < source.length; end++) {
        if (!escaped && source[end] === ']') break;
        escaped = !escaped && source[end] === '\\';
        if (source[end] !== '\\') escaped = false;
      }
      if (end >= source.length) throw new JsonSchemaError('SAMPLE_PATTERN', [pattern]);
      token = patternClassExample(source.slice(index + 1, end));
      next = end + 1;
    } else if (character === '(') {
      let end = index + 1, groupDepth = 1, escaped = false, bracket = false;
      for (; end < source.length && groupDepth; end++) {
        const current = source[end];
        if (escaped) { escaped = false; continue; }
        if (current === '\\') { escaped = true; continue; }
        if (current === '[') bracket = true;
        else if (current === ']') bracket = false;
        else if (!bracket && current === '(') groupDepth++;
        else if (!bracket && current === ')') groupDepth--;
      }
      if (groupDepth) throw new JsonSchemaError('SAMPLE_PATTERN', [pattern]);
      token = patternExample(firstPatternAlternative(source.slice(index + 1, end - 1).replace(/^\?:/, '')));
      next = end;
    } else token = character === '.' ? 'a' : character;
    let count = 1;
    if (source[next] === '{') {
      const quantifier = source.slice(next).match(/^\{(\d+)(?:,\d*)?\}/);
      if (quantifier) { count = Number(quantifier[1]); next += quantifier[0].length; }
    } else if (source[next] === '+') next++;
    else if (source[next] === '*' || source[next] === '?') { count = 0; next++; }
    output += repeatSampleToken(token, count, output.length);
    index = next;
  }
  const expression = new RegExp(pattern, 'u');
  const padding = Math.max(0, minLength - stringLength(output));
  const candidateLength = Math.max(1, minLength);
  for (const candidate of [output, output + repeatSampleToken('a', padding, output.length),
    repeatSampleToken('a', candidateLength), repeatSampleToken('0', candidateLength)]) {
    expression.lastIndex = 0;
    if (stringLength(candidate) >= minLength && expression.test(candidate)) return candidate;
  }
  throw new JsonSchemaError('SAMPLE_PATTERN', [pattern]);
}

function materialize(schema, context, refs = new Set()) {
  if (!isObject(schema)) return schema;
  let resolved = schema;
  if (typeof schema.$ref === 'string') {
    if (refs.has(schema.$ref)) return {};
    refs.add(schema.$ref);
    const target = resolveReference(context, schema.$ref).schema;
    const siblings = { ...schema };
    delete siblings.$ref;
    const referenced = materialize(target, context, refs);
    resolved = context.draft === 'draft4' || context.draft === 'draft6' || context.draft === 'draft7'
      ? referenced : mergeSchemas(referenced, siblings);
    refs.delete(schema.$ref);
  }
  if (!Array.isArray(resolved?.allOf)) return resolved;
  const base = { ...resolved };
  delete base.allOf;
  return resolved.allOf.reduce((merged, child) =>
    mergeSchemas(merged, materialize(child, context, refs)), base);
}

function makeSample(schema, context, state) {
  if (++state.budget.nodes > JSON_SCHEMA_LIMITS.maxSampleNodes) sampleLimit();
  if (schema === false) return state.missing;
  if (schema === true) return null;
  if (!isObject(schema) || state.depth > 32) return state.missing;
  schema = materialize(schema, context);
  if (schema === false) return state.missing;
  if (hasOwn(schema, 'example')) return schema.example;
  if (hasOwn(schema, 'default')) return schema.default;
  if (hasOwn(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const alternatives = schema.oneOf || schema.anyOf;
  if (Array.isArray(alternatives) && alternatives.length) {
    const base = { ...schema };
    delete base.oneOf;
    delete base.anyOf;
    return makeSample(mergeSchemas(base, alternatives[0]), context, { ...state, depth: state.depth + 1 });
  }
  let type = Array.isArray(schema.type) ? schema.type.find((value) => value !== 'null') : schema.type;
  if (!type) {
    if (schema.properties || schema.required) type = 'object';
    else if (schema.prefixItems || schema.items || schema.minItems != null) type = 'array';
    else if (schema.pattern || schema.minLength != null || schema.format) type = 'string';
    else if (schema.minimum != null || schema.maximum != null || schema.multipleOf != null) type = 'number';
  }
  if (type === 'object') {
    const value = Object.create(null);
    const required = new Set(schema.required || []);
    for (const [key, child] of Object.entries(schema.properties || {})) {
      const sample = makeSample(child, context, { ...state, depth: state.depth + 1 });
      if (sample !== state.missing) value[key] = sample;
      else if (required.has(key)) throw new JsonSchemaError('SAMPLE_RECURSIVE_PROPERTY', [key]);
    }
    for (const key of required) {
      if (hasOwn(value, key)) continue;
      const child = isObject(schema.additionalProperties) ? schema.additionalProperties : true;
      const sample = makeSample(child, context, { ...state, depth: state.depth + 1 });
      value[key] = sample === state.missing ? null : sample;
    }
    return value;
  }
  if (type === 'array') {
    const prefix = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : []);
    const maximum = Number.isInteger(schema.maxItems) ? schema.maxItems : Infinity;
    const defaultCount = schema.items === false ? 0 : prefix.length ? 0 : 1;
    const target = Math.min(maximum,
      Math.max(prefix.length, Number.isInteger(schema.minItems) ? schema.minItems : defaultCount));
    if (target > JSON_SCHEMA_LIMITS.maxSampleNodes - state.budget.nodes) sampleLimit();
    const value = [];
    for (let index = 0; index < target; index++) {
      const child = prefix[index]
        ?? (Array.isArray(schema.items) ? schema.additionalItems : schema.items) ?? {};
      const sample = makeSample(child, context, { ...state, depth: state.depth + 1 });
      if (sample === state.missing) throw new JsonSchemaError('SAMPLE_ARRAY_ITEM', [index]);
      value.push(sample);
    }
    return value;
  }
  if (type === 'string') {
    if (schema.pattern) return patternExample(schema.pattern, schema.minLength || 0);
    if ((schema.minLength || 0) > JSON_SCHEMA_LIMITS.maxSampleStringLength) sampleLimit();
    const value = schema.format === 'date-time' ? new Date().toISOString()
      : schema.format === 'date' ? new Date().toISOString().slice(0, 10) : '';
    return value.padEnd(schema.minLength || 0, 'a').slice(0, schema.maxLength ?? undefined);
  }
  if (type === 'integer' || type === 'number') {
    const exclusive = context.draft === 'draft4'
      ? (schema.exclusiveMinimum === true ? schema.minimum : null) : schema.exclusiveMinimum;
    let value = schema.minimum ?? (exclusive != null ? exclusive + (type === 'integer' ? 1 : 0.1) : 0);
    if (exclusive != null && value <= exclusive) value = exclusive + (type === 'integer' ? 1 : 0.1);
    if (schema.multipleOf) value = Math.ceil(value / schema.multipleOf) * schema.multipleOf;
    return type === 'integer' ? Math.ceil(value) : value;
  }
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  return null;
}

export function generateSchemaSample(schema, options = {}) {
  const schemaResult = options.schemaResult || validateSchema(schema, options);
  if (!schemaResult.valid) throw new JsonSchemaError('INVALID_SCHEMA');
  const missing = Symbol('missing');
  const value = makeSample(schema, schemaResult.context, { missing, depth: 0, budget: { nodes: 0 } });
  if (value === missing) throw new JsonSchemaError('SAMPLE_MISSING');
  const result = validateJsonSchema(value, schema, { schemaResult });
  if (!result.valid) throw new JsonSchemaError('SAMPLE_INVALID', [result.errors[0]]);
  return value;
}

export function stringifySchemaSample(schema, options = {}) {
  const text = JSON.stringify(generateSchemaSample(schema, options), null, 2);
  if (utf8ByteLength(text) > JSON_SCHEMA_LIMITS.maxSampleOutputBytes) sampleLimit();
  return text;
}
