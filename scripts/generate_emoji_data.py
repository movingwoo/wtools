#!/usr/bin/env python3
"""Build and maintain the local emoji search asset from official Unicode data."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets' / 'data' / 'emoji.json'
EMOJI_VERSION = '17.0'
UNICODE_VERSION = '17.0.0'
CLDR_VERSION = '48.2'
CLDR_TAG = 'release-48-2'
DATA_BUDGET = 256 * 1024
SOURCES = {
  'emoji': {
    'url': f'https://www.unicode.org/Public/{UNICODE_VERSION}/emoji/emoji-test.txt',
    'integrity': 'sha384-kgIXu+mtqmvu3keD053zCfu6K5ePowRAIcm47kr6VvWYrtDEudoWdqMHB7DcYpS7',
  },
  'ko': {
    'url': f'https://raw.githubusercontent.com/unicode-org/cldr/{CLDR_TAG}/common/annotations/ko.xml',
    'integrity': 'sha384-TvyLLaC27inmj5Qh8y8VZ4Fu+tf4YhcI65EjtJtB4LjO3R6jv8MwveLhQkkCPBGI',
  },
  'koDerived': {
    'url': f'https://raw.githubusercontent.com/unicode-org/cldr/{CLDR_TAG}/common/annotationsDerived/ko.xml',
    'integrity': 'sha384-DeEgGjCtijxrndfth9Cu/UtZPfG9pb0U0k8PprJeeUuYdagoHN9bqWMdBU7IENuP',
  },
  'en': {
    'url': f'https://raw.githubusercontent.com/unicode-org/cldr/{CLDR_TAG}/common/annotations/en.xml',
    'integrity': 'sha384-YUkZszERNWzeNkdrgDlRTp9Q7wdOjNG09TUd4KngH6GFZ6T82fNbuVOdvj8rPZad',
  },
  'enDerived': {
    'url': f'https://raw.githubusercontent.com/unicode-org/cldr/{CLDR_TAG}/common/annotationsDerived/en.xml',
    'integrity': 'sha384-cGQsJX7wUsp2Mx0ff6t7g4l47mI5G2FY6ZqpbIqpG2arsFFLuc3kfv0EwWUrQrii',
  },
}
LATEST_UCD_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/ReadMe.txt'
LATEST_CLDR_URL = 'https://api.github.com/repos/unicode-org/cldr/releases/latest'
GROUPS = {
  'Smileys & Emotion': 0,
  'People & Body': 1,
  'Animals & Nature': 3,
  'Food & Drink': 4,
  'Travel & Places': 5,
  'Activities': 6,
  'Objects': 7,
  'Symbols': 8,
  'Flags': 9,
}
EXPECTED_GROUP_COUNTS = {0: 171, 1: 388, 3: 160, 4: 131, 5: 219, 6: 85, 7: 266, 8: 224, 9: 270}
USER_AGENT = 'W-Tools emoji data maintenance (https://github.com/movingwoo/wtools)'


def request(url: str) -> urllib.request.Request:
  return urllib.request.Request(url, headers={'User-Agent': USER_AGENT})


def sha384(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def download(source_name: str) -> bytes:
  source = SOURCES[source_name]
  with urllib.request.urlopen(request(source['url']), timeout=60) as response:
    data = response.read()
  actual = sha384(data)
  if actual != source['integrity']:
    raise ValueError(f'{source_name}: source integrity mismatch ({actual})')
  return data


def parse_emoji_rows(data: bytes) -> tuple[str, list[tuple[str, int]]]:
  version = ''
  group = ''
  rows: list[tuple[str, int]] = []
  for line in data.decode('utf-8').splitlines():
    if line.startswith('# Version:'):
      version = line.split(':', 1)[1].strip()
      continue
    if line.startswith('# group:'):
      group = line.split(':', 1)[1].strip()
      continue
    content = line.split('#', 1)[0]
    if ';' not in content:
      continue
    raw_points, status = content.split(';', 1)
    if status.strip() != 'fully-qualified':
      continue
    points = [int(value, 16) for value in raw_points.split()]
    if group == 'Component' or any(0x1F3FB <= value <= 0x1F3FF for value in points):
      continue
    if group not in GROUPS:
      raise ValueError(f'unsupported emoji group: {group}')
    rows.append((''.join(chr(value) for value in points), GROUPS[group]))
  if not version:
    raise ValueError('emoji-test.txt version not found')
  return version, rows


def parse_annotations(sources: list[bytes], locale: str) -> dict[str, dict[str, str]]:
  annotations: dict[str, dict[str, str]] = {}
  for source in sources:
    document = ElementTree.fromstring(source)
    for node in document.findall('.//annotation'):
      emoji = node.attrib.get('cp', '').replace('\ufe0f', '')
      field = 'label' if node.attrib.get('type') == 'tts' else 'terms'
      value = (node.text or '').strip()
      if not emoji or not value:
        continue
      record = annotations.setdefault(emoji, {})
      if field in record and record[field] != value:
        raise ValueError(f'{locale}: conflicting {field} for {emoji}')
      record[field] = value
  return annotations


def search_terms(label: str, *groups: list[str]) -> str:
  seen = {label.strip().lower()}
  terms: list[str] = []
  for value in (term.strip().lower() for group in groups for term in group):
    if value and value not in seen:
      seen.add(value)
      terms.append(value)
  return ' '.join(terms)


def build() -> bytes:
  source_version, emoji_rows = parse_emoji_rows(download('emoji'))
  if source_version != EMOJI_VERSION:
    raise ValueError(f'emoji source version is {source_version}, expected {EMOJI_VERSION}')

  counts = Counter(group for _, group in emoji_rows)
  if dict(counts) != EXPECTED_GROUP_COUNTS:
    raise ValueError(f'unexpected emoji group counts: {dict(counts)}')
  if len({emoji for emoji, _ in emoji_rows}) != len(emoji_rows):
    raise ValueError('duplicate emoji sequences')

  ko = parse_annotations([download('ko'), download('koDerived')], 'ko')
  en = parse_annotations([download('en'), download('enDerived')], 'en')
  rows: list[list[object]] = []
  for emoji, group in emoji_rows:
    key = emoji.replace('\ufe0f', '')
    korean = ko.get(key, {})
    english = en.get(key, {})
    if not all(field in korean and field in english for field in ('label', 'terms')):
      raise ValueError(f'missing Korean or English annotations: {emoji}')
    keywords = search_terms(
      korean['label'],
      korean['terms'].split(' | '),
      [english['label']],
      english['terms'].split(' | '),
    )
    rows.append([emoji, group, korean['label'], keywords])

  payload = {
    'version': 1,
    'source': 'Unicode Emoji/CLDR',
    'unicode': EMOJI_VERSION,
    'cldr': CLDR_VERSION,
    'emoji': rows,
  }
  generated = (json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
  if len(generated) > DATA_BUDGET:
    raise ValueError(f'emoji data is {len(generated)} bytes; budget is {DATA_BUDGET} bytes')
  return generated


def parse_ucd_version(text: str) -> str:
  match = re.search(r'Version (\d+\.\d+)\.\d+ of the Unicode Standard', text)
  if not match:
    raise ValueError('latest Unicode version not found')
  return match.group(1)


def parse_cldr_version(payload: object) -> str:
  if not isinstance(payload, dict):
    raise ValueError('latest CLDR response is not an object')
  match = re.fullmatch(r'release-(\d+(?:-\d+)*)', str(payload.get('tag_name', '')))
  if not match:
    raise ValueError('latest CLDR release tag not found')
  return match.group(1).replace('-', '.')


def latest_versions() -> tuple[str, str]:
  with urllib.request.urlopen(request(LATEST_UCD_URL), timeout=30) as response:
    unicode_version = parse_ucd_version(response.read().decode('utf-8'))
  with urllib.request.urlopen(request(LATEST_CLDR_URL), timeout=30) as response:
    cldr_version = parse_cldr_version(json.load(response))
  return unicode_version, cldr_version


def check_latest() -> int:
  unicode_version, cldr_version = latest_versions()
  mismatches = []
  if unicode_version != EMOJI_VERSION:
    mismatches.append(f'Emoji {EMOJI_VERSION} → {unicode_version}')
  if cldr_version != CLDR_VERSION:
    mismatches.append(f'CLDR {CLDR_VERSION} → {cldr_version}')
  if mismatches:
    print('새 공식 이모지 데이터가 있습니다: ' + ', '.join(mismatches))
    return 1
  print(f'공식 최신 버전 확인 완료: Emoji {EMOJI_VERSION}, CLDR {CLDR_VERSION}')
  return 0


def main() -> int:
  parser = argparse.ArgumentParser(description='로컬 이모지 검색 데이터를 생성·검증합니다.')
  modes = parser.add_mutually_exclusive_group()
  modes.add_argument('--check', action='store_true', help='고정 원본으로 재생성한 결과와 저장 파일을 비교합니다.')
  modes.add_argument('--check-latest', action='store_true', help='공식 최신 Emoji·CLDR 버전과 비교합니다.')
  args = parser.parse_args()

  if args.check_latest:
    return check_latest()

  generated = build()
  if args.check:
    if not OUTPUT.is_file() or OUTPUT.read_bytes() != generated:
      print(f'{OUTPUT.relative_to(ROOT)}가 고정 원본에서 생성한 결과와 다릅니다.')
      return 1
    print(f'{OUTPUT.relative_to(ROOT)} 재현 확인 완료 ({len(generated)} bytes)')
    return 0

  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  OUTPUT.write_bytes(generated)
  print(f'Wrote {OUTPUT.relative_to(ROOT)} ({len(generated)} bytes)')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
