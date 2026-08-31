import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parse, stringify, TomlDate } from '../js/lib/data/toml.js';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/run_toml_suite.mjs <toml-test-directory>');

const lock = JSON.parse(await readFile(new URL('./toml-test-lock.json', import.meta.url), 'utf8'));
const byteInvalid = new Set(lock.byteInvalidCases);

function normalizeDate(text, type) {
  if (type === 'date-local') return text;
  const match = /^(.*?:\d\d:\d\d)(?:\.(\d+))?(.*)$/.exec(text);
  if (!match) return text;
  return `${match[1]}.${((match[2] || '') + '000').slice(0, 3)}${match[3]}`
    .replace(' ', 'T').replace(/z$/, 'Z');
}

function compare(actual, expected, location = 'root') {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)
    && typeof expected.type === 'string' && typeof expected.value === 'string') {
    const { type, value } = expected;
    if (type === 'string') return actual === value ? '' : `${location}: string value differs`;
    if (type === 'bool') return actual === (value === 'true') ? '' : `${location}: bool value differs`;
    if (type === 'integer') {
      if (typeof actual !== 'number' && typeof actual !== 'bigint') return `${location}: not an integer`;
      return (typeof actual === 'bigint' ? actual : BigInt(actual)) === BigInt(value)
        ? '' : `${location}: integer value differs`;
    }
    if (type === 'float') {
      const target = value === 'nan' ? Number.NaN
        : ['inf', '+inf'].includes(value) ? Number.POSITIVE_INFINITY
          : value === '-inf' ? Number.NEGATIVE_INFINITY : Number(value);
      const equal = Number.isNaN(target) ? Number.isNaN(actual) : actual === target;
      return equal ? '' : `${location}: float value differs`;
    }
    const dateTypes = {
      datetime: 'offset-date-time',
      'datetime-local': 'local-date-time',
      'date-local': 'local-date',
      'time-local': 'local-time',
    };
    if (!(actual instanceof TomlDate) || actual.tomlType !== dateTypes[type])
      return `${location}: date type differs`;
    return actual.tomlText === normalizeDate(value, type) ? '' : `${location}: date value differs`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length)
      return `${location}: array length differs`;
    for (let index = 0; index < expected.length; index++) {
      const failure = compare(actual[index], expected[index], `${location}[${index}]`);
      if (failure) return failure;
    }
    return '';
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return `${location}: table differs`;
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys))
      return `${location}: table keys differ`;
    for (const key of expectedKeys) {
      const failure = compare(actual[key], expected[key], `${location}.${key}`);
      if (failure) return failure;
    }
    return '';
  }
  return Object.is(actual, expected) ? '' : `${location}: scalar differs`;
}

const validRoot = path.join(root, 'tests', 'valid');
const invalidRoot = path.join(root, 'tests', 'invalid');
const listed = (await readFile(path.join(root, lock.caseList), 'utf8'))
  .split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith('.toml'));
const validFiles = listed.filter((file) => file.startsWith('valid/'))
  .map((file) => path.join(root, 'tests', file)).sort();
const invalidFiles = listed.filter((file) => file.startsWith('invalid/'))
  .map((file) => path.join(root, 'tests', file)).sort();
const failures = [];

if (validFiles.length !== lock.validCases)
  failures.push(`valid inventory differs: expected ${lock.validCases}, received ${validFiles.length}`);
if (invalidFiles.length !== lock.invalidCases)
  failures.push(`invalid inventory differs: expected ${lock.invalidCases}, received ${invalidFiles.length}`);

for (const file of validFiles) {
  const id = path.relative(validRoot, file).replace(/\.toml$/, '');
  const expectedFile = file.replace(/\.toml$/, '.json');
  if (!await access(expectedFile).then(() => true, () => false)) {
    failures.push(`${id}: expected JSON is missing`);
    continue;
  }
  try {
    const expected = JSON.parse(await readFile(expectedFile, 'utf8'));
    const actual = parse(await readFile(file, 'utf8'), { integersAsBigInt: 'asNeeded' });
    const parseFailure = compare(actual, expected);
    if (parseFailure) failures.push(`${id}: parse ${parseFailure}`);
    const restored = parse(stringify(actual), { integersAsBigInt: 'asNeeded' });
    const stringifyFailure = compare(restored, expected);
    if (stringifyFailure) failures.push(`${id}: stringify ${stringifyFailure}`);
  } catch (error) {
    failures.push(`${id}: ${error?.message || error}`);
  }
}

for (const file of invalidFiles) {
  const id = path.relative(invalidRoot, file).replace(/\.toml$/, '');
  if (byteInvalid.has(id)) continue;
  try {
    parse(await readFile(file, 'utf8'), { integersAsBigInt: 'asNeeded' });
    failures.push(`${id}: invalid TOML was accepted`);
  } catch {
    // The parser receives JavaScript strings, so malformed UTF-8 byte tests are handled by the caller.
  }
}

for (const id of byteInvalid) {
  if (!invalidFiles.some((file) => path.relative(invalidRoot, file).replace(/\.toml$/, '') === id))
    failures.push(`${id}: byte-invalid case is missing`);
}

if (failures.length) {
  console.error('Pinned TOML Test Suite cases failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Passed ${validFiles.length}/${validFiles.length} TOML 1.0 valid cases, `
    + `round-tripped their serializers, and rejected ${invalidFiles.length - byteInvalid.size}/${invalidFiles.length} `
    + `string-level invalid cases (${lock.suiteTag}).`);
}
