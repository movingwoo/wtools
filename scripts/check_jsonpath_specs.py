#!/usr/bin/env python3
"""Validate the pinned RFC 9535 JSONPath compliance corpus."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import html
import io
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'jsonpath-test-lock.json'
SRI_PATTERN = re.compile(r'^sha384-[A-Za-z0-9+/]{64}$')
USER_AGENT = 'W-Tools JSONPath standards audit (https://github.com/movingwoo/wtools)'
MAX_REVIEW_AGE = timedelta(days=120)
ERRATA_PATTERN = re.compile(
  r'Errata-ID:\s*<a[^>]+/eid(\d+)/[^>]*>\d+</a>.*?Status:.*?'
  r'<span[^>]*class="badge [^"]*"[^>]*>([^<]+)</span>',
  re.DOTALL,
)


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  required = {
    'standard', 'standardUrl', 'suiteRepository', 'suiteBranch', 'suiteCommit',
    'suiteUrl', 'suiteSha384', 'totalCases', 'supportedCases', 'excludedTags',
    'supportedFunctions', 'ianaRegistryUrl', 'ianaFunctions', 'errataUrl', 'errata',
    'reviewed',
  }
  if set(data) != required:
    raise ValueError('JSONPath lock fields differ from the required schema')
  if data['standard'] != 'RFC 9535' or data['standardUrl'] != 'https://www.rfc-editor.org/rfc/rfc9535.html':
    raise ValueError('JSONPath standard must identify RFC 9535')
  if (data['suiteRepository'] != 'jsonpath-standard/jsonpath-compliance-test-suite'
      or data['suiteBranch'] != 'main'
      or not re.fullmatch(r'[0-9a-f]{40}', data['suiteCommit'])
      or data['suiteCommit'] not in data['suiteUrl']):
    raise ValueError('JSONPath suite repository, branch, commit, or URL is invalid')
  if not SRI_PATTERN.fullmatch(data['suiteSha384']):
    raise ValueError('JSONPath suite SHA-384 is invalid')
  if (data['totalCases'] != 703 or data['supportedCases'] != 647
      or data['excludedTags'] != ['match', 'search']
      or data['supportedFunctions'] != ['count', 'length', 'value']):
    raise ValueError('JSONPath supported case and function inventory is invalid')
  try:
    reviewed = date.fromisoformat(data['reviewed'])
  except (TypeError, ValueError):
    raise ValueError('JSONPath review date must use YYYY-MM-DD') from None
  today = date.today()
  if reviewed > today or today - reviewed > MAX_REVIEW_AGE:
    raise ValueError('JSONPath review date is stale')
  if (data['ianaRegistryUrl'] != 'https://www.iana.org/assignments/jsonpath/function-extensions.csv'
      or data['ianaFunctions'] != ['length', 'count', 'match', 'search', 'value']):
    raise ValueError('JSONPath IANA function registry inventory is invalid')
  if data['errataUrl'] != 'https://www.rfc-editor.org/errata_search.php?rfc=9535':
    raise ValueError('JSONPath RFC errata URL is invalid')
  errata = data['errata']
  if (not isinstance(errata, list) or not errata
      or any(not isinstance(item, dict) or set(item) != {'id', 'status'}
             or not isinstance(item['id'], int) or not isinstance(item['status'], str)
             or not item['status'] for item in errata)):
    raise ValueError('JSONPath RFC errata inventory is invalid')
  identifiers = [item['id'] for item in errata]
  if identifiers != sorted(set(identifiers)):
    raise ValueError('JSONPath RFC errata inventory is invalid')


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


def run_pinned_corpus(lock: dict, token: str = '') -> list[str]:
  errors = []
  corpus = request(lock['suiteUrl'], token)
  if sha384_sri(corpus) != lock['suiteSha384']:
    errors.append('official JSONPath compliance corpus SHA-384 changed')
    return errors
  with tempfile.TemporaryDirectory(prefix='wtools-jsonpath-suite-') as temporary:
    corpus_path = Path(temporary) / 'cts.json'
    corpus_path.write_bytes(corpus)
    try:
      result = subprocess.run(
        ['node', str(ROOT / 'scripts' / 'run_jsonpath_suite.mjs'), str(corpus_path)],
        cwd=ROOT, text=True, capture_output=True, check=False, timeout=60,
      )
    except subprocess.TimeoutExpired:
      errors.append('JSONPath corpus runner timed out after 60 seconds')
      return errors
    if result.returncode:
      errors.append(result.stderr.strip() or result.stdout.strip() or 'JSONPath corpus runner failed')
  return errors


def current_iana_functions(data: bytes) -> list[str]:
  rows = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
  if rows.fieldnames != [
      'Function Name', 'Brief Description', 'Parameters', 'Result', 'Change Controller', 'Reference']:
    raise ValueError('IANA JSONPath function registry columns changed')
  return [row['Function Name'] for row in rows]


def current_errata(data: bytes) -> list[dict]:
  source = data.decode('utf-8')
  return [
    {'id': int(identifier), 'status': html.unescape(status).strip()}
    for identifier, status in ERRATA_PATTERN.findall(source)
  ]


def check_remote(lock: dict, token: str = '') -> list[str]:
  errors = []
  latest = branch_commit(lock['suiteRepository'], lock['suiteBranch'], token)
  if latest != lock['suiteCommit']:
    errors.append(f'JSONPath Compliance Test Suite changed: reviewed {lock["suiteCommit"]}, latest {latest}')
  errors.extend(run_pinned_corpus(lock, token))
  functions = current_iana_functions(request(lock['ianaRegistryUrl'], token))
  if functions != lock['ianaFunctions']:
    errors.append(f'IANA JSONPath function registry changed: reviewed {lock["ianaFunctions"]}, latest {functions}')
  errata = current_errata(request(lock['errataUrl'], token))
  if errata != lock['errata']:
    errors.append(f'RFC 9535 errata changed: reviewed {lock["errata"]}, latest {errata}')
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate the RFC 9535 JSONPath compliance pin.')
  parser.add_argument('--run-pinned', action='store_true',
                      help='download, verify, and run the pinned official corpus')
  parser.add_argument('--check-latest', action='store_true',
                      help='compare the suite branch, IANA registry, and RFC errata with the reviewed state')
  args = parser.parse_args()
  try:
    lock = load_lock()
    print(f'JSONPath lock is valid: {lock["supportedCases"]}/{lock["totalCases"]} RFC 9535 cases.')
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
    errors = check_remote(lock, token) if args.check_latest else (
      run_pinned_corpus(lock, token) if args.run_pinned else []
    )
    if errors:
      print('JSONPath standards review failed:')
      for error in errors:
        print(f'- {error}')
      return 1
    if args.check_latest:
      print('Latest JSONPath corpus, IANA function registry, RFC errata, and pinned cases are current.')
    elif args.run_pinned:
      print('All pinned supported JSONPath cases passed.')
    return 0
  except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
    print(f'JSONPath standards audit failed: {error}')
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
