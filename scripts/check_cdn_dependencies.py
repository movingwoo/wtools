#!/usr/bin/env python3
"""Verify that every registered CDN asset is live and still matches its SRI pin."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from collections.abc import Callable

from vendor_dependencies import registry, sri


PRODUCTION_ORIGIN = 'https://wtools.movingwoo.com'
USER_AGENT = 'W-Tools live CDN check/1.0'


def fetch_asset(entry: dict, timeout: float,
                open_url: Callable = urllib.request.urlopen) -> tuple[bytes, str, str]:
  request = urllib.request.Request(entry['url'], headers={
    'Accept': '*/*',
    'Origin': PRODUCTION_ORIGIN,
    'User-Agent': USER_AGENT,
  })
  with open_url(request, timeout=timeout) as response:
    if response.status != 200:
      raise ValueError(f'HTTP {response.status} 응답을 받았습니다.')
    data = response.read()
    allow_origin = response.headers.get('Access-Control-Allow-Origin', '').strip()
    return data, allow_origin, response.geturl()


def verify_asset(entry: dict, timeout: float = 30,
                 open_url: Callable = urllib.request.urlopen) -> str:
  data, allow_origin, final_url = fetch_asset(entry, timeout, open_url)
  if sri(data) != entry['integrity']:
    raise ValueError('응답 SHA-384가 등록부와 다릅니다.')
  if allow_origin not in {'*', PRODUCTION_ORIGIN}:
    actual = allow_origin or '없음'
    raise ValueError(f'CORS Access-Control-Allow-Origin이 올바르지 않습니다: {actual}')
  return final_url


def check_all(timeout: float = 30, open_url: Callable = urllib.request.urlopen) -> list[str]:
  errors: list[str] = []
  for asset_id, entry in registry()['cdn'].items():
    label = f'{asset_id} ({entry["package"]}@{entry["version"]})'
    try:
      final_url = verify_asset(entry, timeout, open_url)
    except (OSError, ValueError, urllib.error.URLError) as error:
      errors.append(f'{label}: {error}')
    else:
      print(f'CDN 확인 완료: {label} - {final_url}')
  return errors


def main() -> int:
  parser = argparse.ArgumentParser(description='등록된 CDN 자산의 응답·CORS·SHA-384를 검사합니다.')
  parser.add_argument('--timeout', type=float, default=30, help='자산별 HTTP 제한 시간(초)')
  args = parser.parse_args()
  try:
    errors = check_all(args.timeout)
  except (KeyError, OSError, ValueError) as error:
    print(f'CDN 의존성 검사 실패: {error}', file=sys.stderr)
    return 1
  if errors:
    print('CDN 의존성 검사 실패:', file=sys.stderr)
    for error in errors:
      print(f'- {error}', file=sys.stderr)
    return 1
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
