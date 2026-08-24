#!/usr/bin/env python3
"""등록부에 고정한 외부 ESM/WASM을 내려받아 로컬 검토 자산으로 갱신한다."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'js' / 'dependencies.js'
REGISTRY_PATTERN = re.compile(
  r'globalThis\.WTOOLS_DEPENDENCIES = (\{.*?\});\n\nObject\.freeze',
  re.DOTALL,
)
TRANSFORMS = {
  'brotliDecompress': (
    ('from"/npm/base64-js@1.5.1/+esm"', 'from"../../js/lib/common/base64.js"'),
  ),
  'zstdCompress': (
    (
      'new URL("./zstd.wasm",new URL("/npm/@bokuweb/zstd-wasm@0.0.27/'
      'dist/web/index.web.js",import.meta.url).href).href',
      'new URL("./zstd-wasm-0.0.27.wasm",import.meta.url).href',
    ),
  ),
}


def sri(data: bytes) -> str:
  digest = hashlib.sha384(data).digest()
  return 'sha384-' + base64.b64encode(digest).decode('ascii')


def registry() -> dict:
  source = REGISTRY.read_text(encoding='utf-8')
  match = REGISTRY_PATTERN.search(source)
  if not match:
    raise ValueError('js/dependencies.js에서 등록부를 찾지 못했습니다.')
  return json.loads(match.group(1))


def transformed(asset_id: str, data: bytes) -> bytes:
  if asset_id not in TRANSFORMS:
    return data
  text = data.decode('utf-8')
  for before, after in TRANSFORMS[asset_id]:
    if text.count(before) != 1:
      raise ValueError(f'{asset_id}: 예상한 변환 대상을 정확히 한 번 찾지 못했습니다.')
    text = text.replace(before, after)
  return text.encode('utf-8')


def update(check: bool, selected: set[str]) -> None:
  entries = registry()['vendored']
  unknown = selected - set(entries)
  if unknown:
    raise ValueError(f'등록되지 않은 자산입니다: {", ".join(sorted(unknown))}')
  for asset_id, entry in entries.items():
    if selected and asset_id not in selected:
      continue
    request = urllib.request.Request(entry['source'], headers={'User-Agent': 'W-Tools vendor updater'})
    with urllib.request.urlopen(request, timeout=30) as response:
      source = response.read()
    if sri(source) != entry['sourceIntegrity']:
      raise ValueError(f'{asset_id}: 원본 SHA-384가 등록부와 다릅니다.')
    local = transformed(asset_id, source)
    if sri(local) != entry['integrity']:
      raise ValueError(f'{asset_id}: 로컬 변환 결과 SHA-384가 등록부와 다릅니다.')
    path = ROOT / entry['path']
    if check:
      if not path.is_file() or path.read_bytes() != local:
        raise ValueError(f'{asset_id}: 로컬 자산이 고정된 원본과 다릅니다: {entry["path"]}')
      continue
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(local)
    print(f'갱신: {entry["path"]}')


def main() -> int:
  parser = argparse.ArgumentParser(description='외부 ESM/WASM 검토본을 갱신합니다.')
  parser.add_argument('--check', action='store_true', help='다운로드한 원본과 로컬 파일이 같은지만 검사')
  parser.add_argument('--asset', action='append', default=[], help='지정한 등록부 자산만 처리합니다(반복 가능).')
  args = parser.parse_args()
  try:
    update(args.check, set(args.asset))
  except (OSError, ValueError, urllib.error.URLError) as error:
    print(f'제3자 자산 갱신 실패: {error}', file=sys.stderr)
    return 1
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
