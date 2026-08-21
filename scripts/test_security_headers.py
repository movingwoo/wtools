#!/usr/bin/env python3
"""check_security_headers.py의 정책 파서 단위 테스트."""

from __future__ import annotations

import unittest

from check_security_headers import EXPECTED_PERMISSIONS, EXPECTED_SINGLE, validate_headers


def valid_headers() -> dict[str, list[str]]:
  headers = {name: [value] for name, value in EXPECTED_SINGLE.items()}
  headers['permissions-policy'] = [
    ', '.join(f'{name}={value}' for name, value in EXPECTED_PERMISSIONS.items())
  ]
  return headers


class SecurityHeaderTest(unittest.TestCase):
  def test_valid_headers(self) -> None:
    self.assertEqual(validate_headers(valid_headers()), [])

  def test_missing_and_duplicate_headers(self) -> None:
    headers = valid_headers()
    headers.pop('x-frame-options')
    headers['referrer-policy'].append('no-referrer')
    errors = validate_headers(headers)
    self.assertTrue(any('x-frame-options' in error and '0개' in error for error in errors))
    self.assertTrue(any('referrer-policy' in error and '2개' in error for error in errors))

  def test_camera_cannot_be_disabled(self) -> None:
    headers = valid_headers()
    headers['permissions-policy'] = ['camera=(), geolocation=(), microphone=(), payment=(), usb=()']
    self.assertTrue(any('camera=(self)' in error for error in validate_headers(headers)))

  def test_permissions_policy_rejects_duplicates(self) -> None:
    headers = valid_headers()
    headers['permissions-policy'] = ['camera=(self), camera=()']
    self.assertTrue(any('중복 지시어' in error for error in validate_headers(headers)))


if __name__ == '__main__':
  unittest.main()
