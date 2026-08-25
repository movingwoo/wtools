#!/usr/bin/env python3
"""Validate the curated HTTP status and MIME tables against IANA registries."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'assets' / 'data' / 'network-reference.json'
MAX_REVIEW_AGE_DAYS = 100
USER_AGENT = 'W-Tools IANA reference review (https://github.com/movingwoo/wtools)'
IANA_NS = {'iana': 'http://www.iana.org/assignments'}


def fetch(url: str) -> bytes:
  request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
  with urllib.request.urlopen(request, timeout=30) as response:
    return response.read()


def parse_http_registry(data: bytes) -> dict[int, str]:
  rows = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
  return {
    int(row['Value']): row['Description']
    for row in rows
    if row.get('Value', '').isdigit()
  }


def parse_mime_registry(data: bytes) -> set[str]:
  root = ET.fromstring(data)
  media_types: set[str] = set()
  for registry in root.findall('iana:registry', IANA_NS):
    top_level = registry.attrib.get('id', '').removesuffix('-types')
    if top_level not in {'application', 'audio', 'font', 'image', 'message', 'model', 'multipart', 'text', 'video'}:
      continue
    for record in registry.findall('iana:record', IANA_NS):
      name = record.findtext('iana:name', default='', namespaces=IANA_NS)
      if name:
        media_types.add(f'{top_level}/{name}')
  return media_types


def validate_local(data: dict) -> list[str]:
  errors: list[str] = []
  if data.get('schema') != 1:
    errors.append('schema must be 1')
  try:
    datetime.strptime(data.get('reviewed', ''), '%Y-%m-%d')
  except (TypeError, ValueError):
    errors.append('reviewed must be an ISO date')
  sources = data.get('sources', {})
  if set(sources) != {'http', 'mime'} or not all(
    isinstance(value, str) and value.startswith('https://www.iana.org/')
    for value in sources.values()
  ):
    errors.append('sources must contain IANA http and mime HTTPS URLs')

  statuses = data.get('http', [])
  status_codes = [item.get('code') for item in statuses if isinstance(item, dict)]
  if len(status_codes) != len(statuses) or len(status_codes) != len(set(status_codes)):
    errors.append('HTTP status codes must be unique objects')
  for item in statuses:
    if not isinstance(item.get('code'), int) or not 100 <= item['code'] <= 599:
      errors.append(f'invalid HTTP status code: {item!r}')
    if not item.get('category') or not item.get('name'):
      errors.append(f'HTTP status category and name are required: {item!r}')

  mime_rows = data.get('mime', [])
  mime_types = [item.get('type') for item in mime_rows if isinstance(item, dict)]
  if len(mime_types) != len(mime_rows) or len(mime_types) != len(set(mime_types)):
    errors.append('MIME types must be unique objects')
  extensions: set[str] = set()
  for item in mime_rows:
    media_type = item.get('type', '')
    if not re.fullmatch(r'[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+', media_type):
      errors.append(f'invalid MIME type: {media_type!r}')
    if not isinstance(item.get('iana'), bool):
      errors.append(f'MIME iana flag must be boolean: {media_type}')
    for extension in item.get('extensions', []):
      if not re.fullmatch(r'[a-z0-9]+', extension) or extension in extensions:
        errors.append(f'invalid or duplicate extension: {extension!r}')
      extensions.add(extension)
  return errors


def compare_with_iana(data: dict, http_registry: dict[int, str], mime_registry: set[str]) -> list[str]:
  errors: list[str] = []
  for item in data['http']:
    actual = http_registry.get(item['code'])
    if actual != item['name']:
      errors.append(
        f'HTTP {item["code"]}: local {item["name"]!r}, IANA {actual!r}'
      )
  for item in data['mime']:
    registered = item['type'] in mime_registry
    if registered != item['iana']:
      state = 'registered' if registered else 'not registered'
      errors.append(f'{item["type"]}: IANA now reports {state}')
  return errors


def check(check_latest: bool) -> tuple[dict, list[str]]:
  data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
  errors = validate_local(data)
  if check_latest and not errors:
    reviewed = date.fromisoformat(data['reviewed'])
    age = (date.today() - reviewed).days
    if age < 0 or age > MAX_REVIEW_AGE_DAYS:
      errors.append(
        f'reference review is {age} days old; review at least every {MAX_REVIEW_AGE_DAYS} days'
      )
    http_registry = parse_http_registry(fetch(data['sources']['http']))
    mime_registry = parse_mime_registry(fetch(data['sources']['mime']))
    errors.extend(compare_with_iana(data, http_registry, mime_registry))
  return data, errors


def main() -> int:
  parser = argparse.ArgumentParser(description='HTTP 상태·MIME 참조표를 검증합니다.')
  parser.add_argument('--check-latest', action='store_true', help='IANA 최신 등록부와 검토 주기를 확인합니다.')
  args = parser.parse_args()
  try:
    data, errors = check(args.check_latest)
  except (OSError, ValueError, ET.ParseError, urllib.error.URLError) as error:
    print(f'IANA 참조표 검사 실패: {error}', file=sys.stderr)
    return 1
  if errors:
    print('IANA 참조표 검사 실패:', file=sys.stderr)
    for error in errors:
      print(f'- {error}', file=sys.stderr)
    return 1
  mode = 'IANA 최신 등록부 대조' if args.check_latest else '로컬 구조 검사'
  print('## HTTP 상태·MIME 참조표')
  print()
  print(f'- {mode} 완료 (검토일 {data["reviewed"]})')
  print(f'- 자주 쓰는 HTTP 상태 {len(data["http"])}개, MIME 타입 {len(data["mime"])}개')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
