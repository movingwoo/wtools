#!/usr/bin/env python3
"""Validate syntax-sensitive engine baselines and review current releases."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'scripts' / 'syntax-language-lock.json'
USER_AGENT = 'curl/8.0 W-Tools-syntax-audit/1.0 (https://github.com/movingwoo/wtools)'
SUPPORTED_LANGUAGES = {
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'kotlin', 'swift', 'php', 'ruby', 'sql', 'html', 'xml', 'css', 'json', 'yaml',
  'bash', 'shell', 'markdown',
}


def load_lock(path: Path = LOCK_PATH) -> dict:
  data = json.loads(path.read_text(encoding='utf-8'))
  validate_lock(data)
  return data


def validate_lock(data: dict) -> None:
  if set(data) != {'schemaVersion', 'reviewedOn', 'maxReviewAgeDays', 'profiles', 'releaseChecks'}:
    raise ValueError('lock must contain schemaVersion, review metadata, profiles, and releaseChecks')
  if data['schemaVersion'] != 1:
    raise ValueError('unsupported syntax language lock schema')
  try:
    dt.date.fromisoformat(data['reviewedOn'])
  except (TypeError, ValueError) as error:
    raise ValueError('reviewedOn must use YYYY-MM-DD') from error
  if not isinstance(data['maxReviewAgeDays'], int) or data['maxReviewAgeDays'] < 30:
    raise ValueError('maxReviewAgeDays must be an integer of at least 30')
  if set(data['profiles']) != SUPPORTED_LANGUAGES:
    missing = SUPPORTED_LANGUAGES - set(data['profiles'])
    extra = set(data['profiles']) - SUPPORTED_LANGUAGES
    raise ValueError(f'profile mismatch; missing={sorted(missing)}, extra={sorted(extra)}')
  for language, profile in data['profiles'].items():
    if set(profile) != {'version', 'source'}:
      raise ValueError(f'{language} profile must contain exactly version and source')
    if not isinstance(profile['version'], str) or not profile['version']:
      raise ValueError(f'{language}.version must be a non-empty string')
    if not isinstance(profile['source'], str) or not profile['source'].startswith('https://'):
      raise ValueError(f'{language}.source must be an HTTPS URL')
  for check_id, check in data['releaseChecks'].items():
    language = check_id.split(':', 1)[0]
    if language not in SUPPORTED_LANGUAGES:
      raise ValueError(f'unknown release check language: {check_id}')
    if set(check) != {'url', 'pattern', 'expected', 'selection'}:
      raise ValueError(f'{check_id} release check has unexpected fields')
    if not check['url'].startswith('https://'):
      raise ValueError(f'{check_id}.url must be an HTTPS URL')
    if check['selection'] not in {'first', 'max-version'}:
      raise ValueError(f'{check_id}.selection must be first or max-version')
    if not isinstance(check['expected'], str) or not check['expected']:
      raise ValueError(f'{check_id}.expected must be a non-empty string')
    re.compile(check['pattern'], re.IGNORECASE)


def check_age(lock: dict, today: dt.date | None = None) -> list[str]:
  today = today or dt.date.today()
  reviewed = dt.date.fromisoformat(lock['reviewedOn'])
  age = (today - reviewed).days
  if age < 0:
    return [f'reviewedOn is {abs(age)} days in the future']
  if age > lock['maxReviewAgeDays']:
    return [f'language profiles were reviewed {age} days ago; maximum is {lock["maxReviewAgeDays"]}']
  return []


def request_text(url: str) -> str:
  request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'})
  with urllib.request.urlopen(request, timeout=30) as response:
    return response.read().decode('utf-8', errors='replace')


def version_key(value: str) -> tuple[int, ...]:
  return tuple(int(part) for part in value.split('.'))


def extract_version(text: str, check: dict) -> str:
  matches = re.findall(check['pattern'], text, re.IGNORECASE)
  values = [match[0] if isinstance(match, tuple) else match for match in matches]
  values = [value for value in values if value]
  if not values:
    raise ValueError('official source did not match the configured version pattern')
  if check['selection'] == 'max-version':
    return max(values, key=version_key)
  return values[0]


def check_latest(lock: dict, fetch=request_text) -> list[str]:
  errors = []
  for check_id, check in lock['releaseChecks'].items():
    try:
      current = extract_version(fetch(check['url']), check)
      if current != check['expected']:
        errors.append(f'{check_id}: reviewed {check["expected"]}, current {current}')
    except (OSError, ValueError, urllib.error.URLError) as error:
      errors.append(f'{check_id}: latest-version check failed: {error}')
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='Validate syntax-sensitive engine language profiles.')
  parser.add_argument('--check-age', action='store_true', help='fail when the manual review is stale')
  parser.add_argument('--check-latest', action='store_true', help='compare tracked releases with official sources')
  args = parser.parse_args()
  try:
    lock = load_lock()
    errors = []
    if args.check_age:
      errors.extend(check_age(lock))
    if args.check_latest:
      errors.extend(check_latest(lock))
    if errors:
      print('Syntax language profile review required:', file=sys.stderr)
      for error in errors:
        print(f'- {error}', file=sys.stderr)
      return 1
    versions = ', '.join(f'{name} {entry["version"]}' for name, entry in lock['profiles'].items())
    print(f'Syntax language lock is valid ({lock["reviewedOn"]}): {versions}')
    return 0
  except (json.JSONDecodeError, OSError, ValueError) as error:
    print(f'Syntax language audit failed: {error}', file=sys.stderr)
    return 1


if __name__ == '__main__':
  raise SystemExit(main())
