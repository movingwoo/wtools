import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import {
  UNSUPPORTED_KEYWORDS,
  validateJsonSchema,
  validateSchema,
} from '../js/lib/data/json-schema.js';

const testsPath = process.argv[2];
if (!testsPath) throw new Error('Usage: node scripts/run_json_schema_suite.mjs <tests-directory>');

const lock = JSON.parse(await readFile(new URL('./json-schema-test-lock.json', import.meta.url), 'utf8'));
const excludedFiles = new Set(lock.excludedFiles);
const unsupportedKeywords = new Set(UNSUPPORTED_KEYWORDS);
const failures = [];
const actualDrafts = {};
const actualSkippedReasons = {};
let supportedGroups = 0;
let supportedCases = 0;

function schemaSupportReason(schema, draft, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return '';
  for (const keyword of Object.keys(schema)) {
    if (unsupportedKeywords.has(keyword)) return keyword;
  }
  if ('$ref' in schema && (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#')))
    return 'external-or-relative-$ref';
  const idKeyword = draft === 'draft4' ? 'id' : '$id';
  if (depth > 0 && typeof schema[idKeyword] === 'string' && !schema[idKeyword].startsWith('#'))
    return 'nested-$id-resource';

  const maps = ['properties', 'patternProperties'];
  if (draft === 'draft4' || draft === 'draft6' || draft === 'draft7') maps.push('definitions');
  else maps.push('$defs', 'dependentSchemas');
  for (const keyword of maps) {
    const value = schema[keyword];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const child of Object.values(value)) {
      const reason = schemaSupportReason(child, draft, depth + 1);
      if (reason) return reason;
    }
  }

  const direct = ['additionalProperties', 'not'];
  if (draft !== 'draft2020-12') direct.push('additionalItems');
  if (draft !== 'draft4') direct.push('contains', 'propertyNames');
  if (draft === 'draft7' || draft === 'draft2019-09' || draft === 'draft2020-12')
    direct.push('if', 'then', 'else');
  for (const keyword of direct) {
    const reason = schemaSupportReason(schema[keyword], draft, depth + 1);
    if (reason) return reason;
  }

  const items = Array.isArray(schema.items) ? schema.items : [schema.items];
  for (const child of items) {
    const reason = schemaSupportReason(child, draft, depth + 1);
    if (reason) return reason;
  }
  if (draft === 'draft2020-12' && Array.isArray(schema.prefixItems)) {
    for (const child of schema.prefixItems) {
      const reason = schemaSupportReason(child, draft, depth + 1);
      if (reason) return reason;
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[keyword])) continue;
    for (const child of schema[keyword]) {
      const reason = schemaSupportReason(child, draft, depth + 1);
      if (reason) return reason;
    }
  }
  if ((draft === 'draft4' || draft === 'draft6' || draft === 'draft7')
      && schema.dependencies && typeof schema.dependencies === 'object'
      && !Array.isArray(schema.dependencies)) {
    for (const child of Object.values(schema.dependencies)) {
      if (Array.isArray(child)) continue;
      const reason = schemaSupportReason(child, draft, depth + 1);
      if (reason) return reason;
    }
  }
  return '';
}

function recordSkipped(reason, cases) {
  const entry = actualSkippedReasons[reason] ||= { groups: 0, cases: 0 };
  entry.groups++;
  entry.cases += cases;
}

for (const [draft, expected] of Object.entries(lock.drafts)) {
  const draftPath = `${testsPath.replace(/\/$/, '')}/${draft}`;
  const rootFiles = (await readdir(draftPath)).filter((name) => name.endsWith('.json')).sort();
  let groups = 0;
  let cases = 0;
  let totalGroups = 0;
  let totalCases = 0;
  let skippedGroups = 0;
  let skippedCases = 0;
  if (rootFiles.length !== expected.rootFiles)
    failures.push(`${draft}: root file count differs: expected ${expected.rootFiles}, received ${rootFiles.length}`);
  for (const file of rootFiles) {
    const suites = JSON.parse(await readFile(`${draftPath}/${file}`, 'utf8'));
    for (const suite of suites) {
      const suiteCases = suite.tests.length;
      totalGroups++;
      totalCases += suiteCases;
      const reason = excludedFiles.has(file) ? `file:${file}`
        : schemaSupportReason(suite.schema, draft);
      if (reason) {
        skippedGroups++;
        skippedCases += suiteCases;
        recordSkipped(reason, suiteCases);
        continue;
      }
      const schemaResult = validateSchema(suite.schema, { draft });
      if (!schemaResult.valid) {
        failures.push(`${draft}/${file} ${suite.description}: supported schema was rejected (${schemaResult.errors[0]?.code})`);
        continue;
      }
      groups++;
      for (const test of suite.tests) {
        cases++;
        const result = validateJsonSchema(test.data, suite.schema, { schemaResult });
        if (result.valid !== test.valid)
          failures.push(`${draft}/${file} ${suite.description} / ${test.description}: expected ${test.valid}, received ${result.valid}`);
      }
    }
  }
  actualDrafts[draft] = {
    rootFiles: rootFiles.length,
    totalGroups,
    totalCases,
    groups,
    cases,
    skippedGroups,
    skippedCases,
  };
  if (JSON.stringify(actualDrafts[draft]) !== JSON.stringify(expected))
    failures.push(`${draft}: inventory differs: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualDrafts[draft])}`);
  supportedGroups += groups;
  supportedCases += cases;
}

if (supportedGroups !== lock.supportedGroups || supportedCases !== lock.supportedCases)
  failures.push(`total inventory differs: expected ${lock.supportedGroups}/${lock.supportedCases}, received ${supportedGroups}/${supportedCases}`);

const sortedSkippedReasons = Object.fromEntries(Object.entries(actualSkippedReasons)
  .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
if (JSON.stringify(sortedSkippedReasons) !== JSON.stringify(lock.skippedReasons || {}))
  failures.push(`skipped reason inventory differs: expected ${JSON.stringify(lock.skippedReasons || {})}, received ${JSON.stringify(sortedSkippedReasons)}`);

if (failures.length) {
  console.error('Pinned JSON Schema Test Suite cases failed:');
  failures.slice(0, 100).forEach((failure) => console.error(`- ${failure}`));
  if (failures.length > 100) console.error(`- ...and ${failures.length - 100} more failures`);
  process.exitCode = 1;
} else {
  const totalGroups = Object.values(actualDrafts).reduce((sum, item) => sum + item.totalGroups, 0);
  const totalCases = Object.values(actualDrafts).reduce((sum, item) => sum + item.totalCases, 0);
  console.log(`Passed ${supportedCases} supported JSON Schema cases in ${supportedGroups} groups; `
    + `tracked ${totalCases - supportedCases} skipped cases in ${totalGroups - supportedGroups} groups.`);
}
