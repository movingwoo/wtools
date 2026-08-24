#!/usr/bin/env python3
"""Build, verify, and update the local emoji search asset from official Unicode data."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets' / 'data' / 'emoji.json'
LOCK_PATH = ROOT / 'scripts' / 'emoji-data-lock.json'
DATA_BUDGET = 256 * 1024
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
SOURCE_PATHS = {
  'ko': 'common/annotations/ko.xml',
  'koDerived': 'common/annotationsDerived/ko.xml',
  'en': 'common/annotations/en.xml',
  'enDerived': 'common/annotationsDerived/en.xml',
}
SOURCE_NAMES = ('emoji', 'ko', 'koDerived', 'en', 'enDerived')
SRI_PATTERN = re.compile(r'sha384-[A-Za-z0-9+/]{64}')
VERSION_PATTERN = re.compile(r'\d+(?:\.\d+)+')
USER_AGENT = 'W-Tools emoji data maintenance (https://github.com/movingwoo/wtools)'


class MissingAnnotationsError(ValueError):
  """The latest Unicode release is not represented in the latest CLDR data yet."""


def request(url: str) -> urllib.request.Request:
  headers = {'User-Agent': USER_AGENT}
  if urllib.parse.urlparse(url).hostname == 'api.github.com':
    headers['Accept'] = 'application/vnd.github+json'
    headers['X-GitHub-Api-Version'] = '2022-11-28'
    token = os.environ.get('GH_TOKEN')
    if token:
      headers['Authorization'] = f'Bearer {token}'
  return urllib.request.Request(url, headers=headers)


def fetch(url: str, timeout: int = 60) -> bytes:
  with urllib.request.urlopen(request(url), timeout=timeout) as response:
    return response.read()


def sha384(data: bytes) -> str:
  return 'sha384-' + base64.b64encode(hashlib.sha384(data).digest()).decode('ascii')


def validate_lock(payload: object) -> dict[str, object]:
  if not isinstance(payload, dict) or payload.get('schema') != 1:
    raise ValueError('emoji data lock schema is not supported')
  for field in ('emojiVersion', 'unicodeVersion', 'cldrVersion'):
    if not VERSION_PATTERN.fullmatch(str(payload.get(field, ''))):
      raise ValueError(f'emoji data lock has an invalid {field}')
  if not re.fullmatch(r'release-\d+(?:-\d+)*', str(payload.get('cldrTag', ''))):
    raise ValueError('emoji data lock has an invalid cldrTag')
  if not str(payload['unicodeVersion']).startswith(str(payload['emojiVersion']) + '.'):
    raise ValueError('emoji data lock Unicode and Emoji versions do not align')
  expected_cldr = str(payload['cldrTag']).removeprefix('release-').replace('-', '.')
  if payload['cldrVersion'] != expected_cldr:
    raise ValueError('emoji data lock CLDR version and tag do not align')

  counts = payload.get('groupCounts')
  if not isinstance(counts, dict) or set(counts) != {str(value) for value in GROUPS.values()}:
    raise ValueError('emoji data lock has invalid groupCounts')
  if any(not isinstance(value, int) or value <= 0 for value in counts.values()):
    raise ValueError('emoji data lock groupCounts must be positive integers')

  sources = payload.get('sources')
  if not isinstance(sources, dict) or set(sources) != set(SOURCE_NAMES):
    raise ValueError('emoji data lock has invalid sources')
  expected_urls = source_urls(str(payload['unicodeVersion']), str(payload['cldrTag']))
  for name, source in sources.items():
    if not isinstance(source, dict) or set(source) != {'url', 'integrity'}:
      raise ValueError(f'emoji data lock has an invalid {name} source')
    url = str(source['url'])
    if url != expected_urls[name] or not SRI_PATTERN.fullmatch(str(source['integrity'])):
      raise ValueError(f'emoji data lock has an invalid {name} source pin')
  return payload


def load_lock() -> dict[str, object]:
  return validate_lock(json.loads(LOCK_PATH.read_text(encoding='utf-8')))


def lock_bytes(lock: dict[str, object]) -> bytes:
  return (json.dumps(lock, ensure_ascii=False, indent=2) + '\n').encode()


def download_sources(lock: dict[str, object], verify: bool) -> dict[str, bytes]:
  downloaded = {}
  sources = lock['sources']
  for name in SOURCE_NAMES:
    source = sources[name]
    data = fetch(source['url'])
    actual = sha384(data)
    if verify and actual != source['integrity']:
      raise ValueError(f'{name}: source integrity mismatch ({actual})')
    downloaded[name] = data
  return downloaded


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


def build(lock: dict[str, object], sources: dict[str, bytes] | None = None) -> bytes:
  sources = sources or download_sources(lock, verify=True)
  source_version, emoji_rows = parse_emoji_rows(sources['emoji'])
  if source_version != lock['emojiVersion']:
    raise ValueError(f'emoji source version is {source_version}, expected {lock["emojiVersion"]}')

  counts = Counter(group for _, group in emoji_rows)
  expected = {int(group): count for group, count in lock['groupCounts'].items()}
  if dict(counts) != expected:
    raise ValueError(f'unexpected emoji group counts: {dict(counts)}')
  if len({emoji for emoji, _ in emoji_rows}) != len(emoji_rows):
    raise ValueError('duplicate emoji sequences')

  ko = parse_annotations([sources['ko'], sources['koDerived']], 'ko')
  en = parse_annotations([sources['en'], sources['enDerived']], 'en')
  rows: list[list[object]] = []
  for emoji, group in emoji_rows:
    key = emoji.replace('\ufe0f', '')
    korean = ko.get(key, {})
    english = en.get(key, {})
    if not all(field in korean and field in english for field in ('label', 'terms')):
      raise MissingAnnotationsError(f'missing Korean or English annotations: {emoji}')
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
    'unicode': lock['emojiVersion'],
    'cldr': lock['cldrVersion'],
    'emoji': rows,
  }
  generated = (json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
  if len(generated) > DATA_BUDGET:
    raise ValueError(f'emoji data is {len(generated)} bytes; budget is {DATA_BUDGET} bytes')
  return generated


def parse_ucd_version(text: str) -> str:
  match = re.search(r'Version (\d+\.\d+\.\d+) of the Unicode Standard', text)
  if not match:
    raise ValueError('latest Unicode version not found')
  return match.group(1)


def parse_cldr_tag(payload: object) -> str:
  if not isinstance(payload, dict):
    raise ValueError('latest CLDR response is not an object')
  tag = str(payload.get('tag_name', ''))
  if not re.fullmatch(r'release-\d+(?:-\d+)*', tag):
    raise ValueError('latest CLDR release tag not found')
  return tag


def cldr_version(tag: str) -> str:
  return tag.removeprefix('release-').replace('-', '.')


def latest_release_versions() -> tuple[str, str]:
  unicode_version = parse_ucd_version(fetch(LATEST_UCD_URL, timeout=30).decode('utf-8'))
  cldr_tag = parse_cldr_tag(json.loads(fetch(LATEST_CLDR_URL, timeout=30)))
  return unicode_version, cldr_tag


def source_urls(unicode_version: str, cldr_tag: str) -> dict[str, str]:
  urls = {
    'emoji': f'https://www.unicode.org/Public/{unicode_version}/emoji/emoji-test.txt',
  }
  urls.update({
    name: f'https://raw.githubusercontent.com/unicode-org/cldr/{cldr_tag}/{path}'
    for name, path in SOURCE_PATHS.items()
  })
  return urls


def latest_lock() -> tuple[dict[str, object], dict[str, bytes]]:
  unicode_version, cldr_tag = latest_release_versions()
  urls = source_urls(unicode_version, cldr_tag)
  sources = {name: fetch(urls[name]) for name in SOURCE_NAMES}
  emoji_version, rows = parse_emoji_rows(sources['emoji'])
  if not unicode_version.startswith(emoji_version + '.'):
    raise ValueError(f'Unicode {unicode_version} and Emoji {emoji_version} versions do not align')
  counts = Counter(group for _, group in rows)
  lock = {
    'schema': 1,
    'emojiVersion': emoji_version,
    'unicodeVersion': unicode_version,
    'cldrVersion': cldr_version(cldr_tag),
    'cldrTag': cldr_tag,
    'groupCounts': {str(group): counts[group] for group in GROUPS.values()},
    'sources': {
      name: {'url': urls[name], 'integrity': sha384(sources[name])}
      for name in SOURCE_NAMES
    },
  }
  return validate_lock(lock), sources


def ensure_no_removals(current_data: bytes, generated: bytes) -> None:
  current_rows = json.loads(current_data).get('emoji', [])
  generated_rows = json.loads(generated).get('emoji', [])
  current = {row[0] for row in current_rows}
  updated = {row[0] for row in generated_rows}
  removed = current - updated
  if removed:
    examples = ' '.join(sorted(removed)[:5])
    raise ValueError(f'latest data removes {len(removed)} emoji sequences: {examples}')


def update() -> int:
  current_lock = load_lock()
  updated_lock, sources = latest_lock()
  try:
    generated = build(updated_lock, sources)
  except MissingAnnotationsError:
    if updated_lock['unicodeVersion'] != current_lock['unicodeVersion']:
      print(
        f'Unicode {updated_lock["unicodeVersion"]}용 CLDR 주석이 아직 완전하지 않아 '
        '현재 호환 버전을 유지합니다.'
      )
      return 0
    raise
  if OUTPUT.is_file():
    ensure_no_removals(OUTPUT.read_bytes(), generated)

  before = f'Emoji {current_lock["emojiVersion"]}, CLDR {current_lock["cldrVersion"]}'
  after = f'Emoji {updated_lock["emojiVersion"]}, CLDR {updated_lock["cldrVersion"]}'
  LOCK_PATH.write_bytes(lock_bytes(updated_lock))
  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  OUTPUT.write_bytes(generated)
  if lock_bytes(current_lock) == lock_bytes(updated_lock):
    print(f'공식 최신 버전을 이미 사용 중입니다: {after}')
  else:
    print(f'이모지 데이터 갱신: {before} → {after}')
  return 0


def check_latest() -> int:
  lock = load_lock()
  unicode_version, cldr_tag = latest_release_versions()
  mismatches = []
  if unicode_version != lock['unicodeVersion']:
    mismatches.append(f'Unicode {lock["unicodeVersion"]} → {unicode_version}')
  if cldr_tag != lock['cldrTag']:
    mismatches.append(f'CLDR {lock["cldrVersion"]} → {cldr_version(cldr_tag)}')
  if mismatches:
    print('새 공식 이모지 데이터가 있습니다: ' + ', '.join(mismatches))
    return 1
  print(f'공식 최신 버전 확인 완료: Emoji {lock["emojiVersion"]}, CLDR {lock["cldrVersion"]}')
  return 0


def main() -> int:
  parser = argparse.ArgumentParser(description='로컬 이모지 검색 데이터를 생성·검증·갱신합니다.')
  modes = parser.add_mutually_exclusive_group()
  modes.add_argument('--check', action='store_true', help='고정 원본으로 재생성한 결과와 저장 파일을 비교합니다.')
  modes.add_argument('--check-latest', action='store_true', help='공식 최신 Emoji·CLDR 버전과 비교합니다.')
  modes.add_argument('--update', action='store_true', help='공식 최신 안정판으로 lock과 로컬 데이터를 갱신합니다.')
  args = parser.parse_args()

  if args.check_latest:
    return check_latest()
  if args.update:
    return update()

  lock = load_lock()
  generated = build(lock)
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
