#!/usr/bin/env python3
"""앱 셸 내용으로 서비스 워커 캐시 revision을 계산하고 갱신한다."""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SW_PATH = ROOT / 'sw.js'
REVISION_PATTERN = re.compile(r"const CACHE_REVISION = '([0-9a-f]+|pending)';")
SHELL_PATTERN = re.compile(r'const APP_SHELL = \[(.*?)\];', re.DOTALL)


def expected_revision(source: str) -> str:
  match = SHELL_PATTERN.search(source)
  if not match:
    raise ValueError('sw.js에서 APP_SHELL을 찾지 못했습니다.')
  digest = hashlib.sha256()
  for ref in re.findall(r"'([^']+)'", match.group(1)):
    if ref == './':
      continue
    relative = ref.removeprefix('./')
    path = ROOT / relative
    if not path.is_file():
      raise ValueError(f'앱 셸 파일이 없습니다: {relative}')
    data = path.read_bytes()
    if path == SW_PATH:
      data = REVISION_PATTERN.sub("const CACHE_REVISION = '<revision>';", data.decode()).encode()
    digest.update(relative.encode())
    digest.update(b'\0')
    digest.update(data)
    digest.update(b'\0')
  return digest.hexdigest()[:12]


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument('--check', action='store_true', help='갱신하지 않고 일치 여부만 검사합니다.')
  args = parser.parse_args()
  source = SW_PATH.read_text(encoding='utf-8')
  current_match = REVISION_PATTERN.search(source)
  if not current_match:
    raise SystemExit('sw.js에서 CACHE_REVISION을 찾지 못했습니다.')
  expected = expected_revision(source)
  current = current_match.group(1)
  if current == expected:
    print(f'서비스 워커 캐시 revision 확인 완료: {expected}')
    return 0
  if args.check:
    print(f'서비스 워커 캐시 revision 불일치: 현재 {current}, 예상 {expected}')
    print('python3 scripts/update_cache_version.py를 실행하세요.')
    return 1
  SW_PATH.write_text(REVISION_PATTERN.sub(f"const CACHE_REVISION = '{expected}';", source), encoding='utf-8')
  print(f'서비스 워커 캐시 revision 갱신: {current} → {expected}')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
