#!/usr/bin/env python3
"""Validate User-Agent review metadata and the representative browser corpus."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORPUS_PATH = ROOT / 'tests' / 'fixtures' / 'user-agents.json'
PARSER_PATH = ROOT / 'js' / 'lib' / 'network' / 'user-agent.js'
MAX_REVIEW_AGE_DAYS = 100


def check(check_age: bool) -> tuple[dict, list[str]]:
  corpus = json.loads(CORPUS_PATH.read_text(encoding='utf-8'))
  source = PARSER_PATH.read_text(encoding='utf-8')
  errors: list[str] = []
  if corpus.get('schema') != 1:
    errors.append('corpus schema must be 1')
  reviewed = corpus.get('reviewed', '')
  try:
    reviewed_date = datetime.strptime(reviewed, '%Y-%m-%d').date()
  except (TypeError, ValueError):
    errors.append('corpus reviewed must be an ISO date')
    reviewed_date = date.min
  parser_review = re.search(r"reviewed:\s*'(\d{4}-\d{2}-\d{2})'", source)
  if not parser_review or parser_review.group(1) != reviewed:
    errors.append('parser and corpus review dates must match')
  if check_age:
    age = (date.today() - reviewed_date).days
    if age < 0 or age > MAX_REVIEW_AGE_DAYS:
      errors.append(f'User-Agent review is {age} days old; maximum is {MAX_REVIEW_AGE_DAYS}')
  if not corpus.get('provenance') or not corpus.get('sources'):
    errors.append('corpus provenance and sources are required')
  cases = corpus.get('cases', [])
  names: set[str] = set()
  kinds: set[str] = set()
  for item in cases:
    if not all(isinstance(item.get(key), str) and item[key] for key in ('name', 'kind', 'ua')):
      errors.append(f'invalid corpus item: {item!r}')
      continue
    if item['name'] in names:
      errors.append(f'duplicate corpus name: {item["name"]}')
    names.add(item['name'])
    kinds.add(item['kind'])
    if not isinstance(item.get('expected'), dict) or not item['expected']:
      errors.append(f'expected output is required: {item["name"]}')
  if not {'desktop', 'mobile', 'in-app'} <= kinds:
    errors.append('corpus must cover desktop, mobile, and in-app browsers')
  return corpus, errors


def main() -> int:
  parser = argparse.ArgumentParser(description='User-Agent 규칙 코퍼스와 검토일을 확인합니다.')
  parser.add_argument('--check-age', action='store_true', help='분기별 검토 기한도 확인합니다.')
  args = parser.parse_args()
  try:
    corpus, errors = check(args.check_age)
  except (OSError, ValueError) as error:
    print(f'User-Agent 코퍼스 검사 실패: {error}', file=sys.stderr)
    return 1
  if errors:
    print('User-Agent 코퍼스 검사 실패:', file=sys.stderr)
    for error in errors:
      print(f'- {error}', file=sys.stderr)
    return 1
  print('## User-Agent 규칙 코퍼스')
  print()
  print(f'- 데스크톱·모바일·인앱 대표 UA {len(corpus["cases"])}개 (검토일 {corpus["reviewed"]})')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
