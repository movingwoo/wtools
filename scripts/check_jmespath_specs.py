#!/usr/bin/env python3
"""Validate the pinned JMESPath specification and official compliance suite."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'jmespath-test-lock.json'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
USER_AGENT = 'W-Tools JMESPath standards audit (https://github.com/movingwoo/wtools)'
MAX_REVIEW_AGE = timedelta(days=120)


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  required = {
    'standard', 'standardUrl', 'specSourceUrl', 'latestSpecSourceUrl', 'specSha384',
    'suiteRepository', 'suiteBranch', 'suiteCommit', 'suiteUrl', 'suiteSha384',
    'jepRepository', 'jepBranch', 'jepCommit', 'jepUrl',
    'testFiles', 'totalCases', 'resultCases', 'errorCases', 'benchmarkCases',
    'supportedFunctions', 'reviewed',
  }
  if set(data) != required:
    raise ValueError('JMESPath lock fields differ from the required schema')
  if data['standard'] != 'JMESPath 1.0' or data['standardUrl'] != 'https://jmespath.org/specification.html':
    raise ValueError('JMESPath standard must identify the official 1.0 specification')
  if (not SRI_PATTERN.fullmatch(data['specSha384'])
      or not data['specSourceUrl'].startswith('https://raw.githubusercontent.com/jmespath/jmespath.site/')
      or data['latestSpecSourceUrl'] !=
      'https://raw.githubusercontent.com/jmespath/jmespath.site/master/docs/specification.rst'):
    raise ValueError('JMESPath specification source pin is invalid')
  if (data['suiteRepository'] != 'jmespath/jmespath.test' or data['suiteBranch'] != 'master'
      or not re.fullmatch(r'[0-9a-f]{40}', data['suiteCommit'])
      or data['suiteCommit'] not in data['suiteUrl']
      or not SRI_PATTERN.fullmatch(data['suiteSha384'])):
    raise ValueError('JMESPath suite repository, branch, commit, URL, or hash is invalid')
  if (data['jepRepository'] != 'jmespath/jmespath.jep' or data['jepBranch'] != 'main'
      or not re.fullmatch(r'[0-9a-f]{40}', data['jepCommit'])
      or data['jepUrl'] != f'https://github.com/jmespath/jmespath.jep/commit/{data["jepCommit"]}'):
    raise ValueError('JMESPath JEP repository, branch, commit, or URL is invalid')
  expected_files = [
    'basic.json', 'boolean.json', 'current.json', 'escape.json', 'filters.json',
    'functions.json', 'identifiers.json', 'indices.json', 'literal.json',
    'multiselect.json', 'pipe.json', 'slice.json', 'syntax.json', 'unicode.json',
    'wildcard.json',
  ]
  if (data['testFiles'] != expected_files or data['totalCases'] != 892
      or data['resultCases'] != 742 or data['errorCases'] != 150
      or data['benchmarkCases'] != 16):
    raise ValueError('JMESPath compliance case inventory is invalid')
  if (not isinstance(data['supportedFunctions'], list) or len(data['supportedFunctions']) != 26
      or data['supportedFunctions'] != sorted(set(data['supportedFunctions']))):
    raise ValueError('JMESPath built-in function inventory is invalid')
  try:
    reviewed = date.fromisoformat(data['reviewed'])
  except (TypeError, ValueError):
    raise ValueError('JMESPath review date must use YYYY-MM-DD') from None
  today = date.today()
  if reviewed > today or today - reviewed > MAX_REVIEW_AGE:
    raise ValueError('JMESPath review date is stale')


def request(url: str, token: str = '') -> bytes:
  headers = {'Accept': 'application/vnd.github+json', 'User-Agent': USER_AGENT}
  if token and urllib.parse.urlsplit(url).hostname == 'api.github.com':
    headers['Authorization'] = f'Bearer {token}'
  with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
    return response.read()


def sha384_sri(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def branch_commit(repository: str, branch: str, token: str = '') -> str:
  data = json.loads(request(f'https://api.github.com/repos/{repository}/commits/{branch}', token))
  return data.get('sha', '')


def extract_tests(archive: bytes, destination: Path) -> None:
  with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as bundle:
    members = [member for member in bundle.getmembers()
               if member.isfile() and '/tests/' in member.name and member.name.endswith('.json')]
    for member in members:
      name = Path(member.name).name
      source = bundle.extractfile(member)
      if source is None:
        raise ValueError(f'could not read JMESPath suite member: {member.name}')
      (destination / name).write_bytes(source.read())


def run_pinned_corpus(lock: dict, token: str = '') -> list[str]:
  errors = []
  spec = request(lock['specSourceUrl'], token)
  if sha384_sri(spec) != lock['specSha384']:
    errors.append('official JMESPath specification SHA-384 changed')
    return errors
  archive = request(lock['suiteUrl'], token)
  if sha384_sri(archive) != lock['suiteSha384']:
    errors.append('official JMESPath suite SHA-384 changed')
    return errors
  with tempfile.TemporaryDirectory(prefix='wtools-jmespath-suite-') as temporary:
    tests_path = Path(temporary) / 'tests'
    tests_path.mkdir()
    extract_tests(archive, tests_path)
    try:
      result = subprocess.run(
        ['node', str(ROOT / 'scripts' / 'run_jmespath_suite.mjs'), str(tests_path)],
        cwd=ROOT, text=True, capture_output=True, check=False, timeout=60,
      )
    except subprocess.TimeoutExpired:
      errors.append('JMESPath corpus runner timed out after 60 seconds')
      return errors
    if result.returncode:
      errors.append(result.stderr.strip() or result.stdout.strip() or 'JMESPath corpus runner failed')
  return errors


def check_remote(lock: dict, token: str = '') -> list[str]:
  errors = []
  latest = branch_commit(lock['suiteRepository'], lock['suiteBranch'], token)
  if latest != lock['suiteCommit']:
    errors.append(f'JMESPath suite changed: reviewed {lock["suiteCommit"]}, latest {latest}')
  latest_jep = branch_commit(lock['jepRepository'], lock['jepBranch'], token)
  if latest_jep != lock['jepCommit']:
    errors.append(f'JMESPath JEPs changed: reviewed {lock["jepCommit"]}, latest {latest_jep}')
  latest_spec_hash = sha384_sri(request(lock['latestSpecSourceUrl'], token))
  if latest_spec_hash != lock['specSha384']:
    errors.append('JMESPath 1.0 specification source changed since the reviewed pin')
  errors.extend(run_pinned_corpus(lock, token))
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate the JMESPath 1.0 compliance pin.')
  parser.add_argument('--run-pinned', action='store_true',
                      help='download, verify, and run the pinned official corpus')
  parser.add_argument('--check-latest', action='store_true',
                      help='compare the current specification and suite with the reviewed state')
  args = parser.parse_args()
  try:
    lock = load_lock()
    print(f'JMESPath lock is valid: {lock["totalCases"]} compliance cases.')
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
    errors = check_remote(lock, token) if args.check_latest else (
      run_pinned_corpus(lock, token) if args.run_pinned else []
    )
    if errors:
      print('JMESPath standards review failed:')
      for error in errors:
        print(f'- {error}')
      return 1
    if args.check_latest:
      print('Latest JMESPath specification, suite, JEPs, and pinned cases are current.')
    elif args.run_pinned:
      print('All pinned JMESPath compliance cases passed.')
    return 0
  except (OSError, ValueError, KeyError, json.JSONDecodeError, tarfile.TarError) as error:
    print(f'JMESPath standards audit failed: {error}')
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
