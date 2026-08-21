#!/usr/bin/env python3
"""운영 HTML 응답의 필수 보안 헤더를 의존성 없이 검사한다."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request


DEFAULT_URL = 'https://wtools.movingwoo.com/'
EXPECTED_SINGLE = {
  'content-security-policy': "frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
}
EXPECTED_PERMISSIONS = {
  'camera': '(self)',
  'geolocation': '()',
  'microphone': '()',
  'payment': '()',
  'usb': '()',
}


def normalized(value: str) -> str:
  return ' '.join(value.strip().split())


def parse_permissions(value: str) -> dict[str, str]:
  policies: dict[str, str] = {}
  for item in value.split(','):
    name, separator, allowlist = item.strip().partition('=')
    if not separator or not name or name in policies:
      raise ValueError('Permissions-Policy 형식이나 중복 지시어가 올바르지 않습니다.')
    policies[name] = normalized(allowlist)
  return policies


def validate_headers(headers: dict[str, list[str]]) -> list[str]:
  errors: list[str] = []
  for name, expected in EXPECTED_SINGLE.items():
    values = headers.get(name, [])
    if len(values) != 1:
      errors.append(f'{name}: 헤더가 정확히 한 번 있어야 합니다 (현재 {len(values)}개).')
    elif normalized(values[0]).lower() != expected.lower():
      errors.append(f'{name}: {expected!r}이어야 합니다 (현재 {values[0]!r}).')

  values = headers.get('permissions-policy', [])
  if len(values) != 1:
    errors.append(f'permissions-policy: 헤더가 정확히 한 번 있어야 합니다 (현재 {len(values)}개).')
  else:
    try:
      actual = parse_permissions(values[0])
    except ValueError as error:
      errors.append(f'permissions-policy: {error}')
    else:
      if actual != EXPECTED_PERMISSIONS:
        expected = ', '.join(f'{name}={value}' for name, value in EXPECTED_PERMISSIONS.items())
        errors.append(f'permissions-policy: {expected!r}이어야 합니다 (현재 {values[0]!r}).')
  return errors


def fetch_headers(url: str, timeout: float) -> tuple[str, dict[str, list[str]]]:
  request = urllib.request.Request(url, headers={
    'Accept': 'text/html',
    'User-Agent': 'W-Tools security-header-check/1.0',
  })
  with urllib.request.urlopen(request, timeout=timeout) as response:
    content_type = response.headers.get_content_type()
    if response.status != 200:
      raise ValueError(f'HTTP {response.status} 응답을 받았습니다.')
    if content_type != 'text/html':
      raise ValueError(f'HTML 대신 {content_type} 응답을 받았습니다.')
    names = {*EXPECTED_SINGLE, 'permissions-policy'}
    headers = {name: response.headers.get_all(name, []) for name in names}
    return response.geturl(), headers


def main() -> int:
  parser = argparse.ArgumentParser(description='W-Tools 운영 보안 응답 헤더를 검사합니다.')
  parser.add_argument('--url', default=DEFAULT_URL, help=f'검사 URL (기본값: {DEFAULT_URL})')
  parser.add_argument('--timeout', type=float, default=15, help='HTTP 제한 시간(초)')
  args = parser.parse_args()
  try:
    final_url, headers = fetch_headers(args.url, args.timeout)
    errors = validate_headers(headers)
  except (OSError, ValueError, urllib.error.URLError) as error:
    print(f'운영 보안 헤더 검사 실패: {error}', file=sys.stderr)
    return 1
  if errors:
    print(f'운영 보안 헤더 검사 실패: {final_url}', file=sys.stderr)
    for error in errors:
      print(f'- {error}', file=sys.stderr)
    return 1
  print(f'운영 보안 헤더 확인 완료: {final_url}')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
