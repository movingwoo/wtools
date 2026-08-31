#!/usr/bin/env python3
"""Unit tests for the live CDN response contract."""

from __future__ import annotations

import unittest

import check_cdn_dependencies as cdn
from vendor_dependencies import sri


class FakeResponse:
  def __init__(self, data: bytes, *, status: int = 200, allow_origin: str = '*') -> None:
    self.data = data
    self.status = status
    self.headers = {'Access-Control-Allow-Origin': allow_origin}

  def __enter__(self):
    return self

  def __exit__(self, *_args) -> None:
    return None

  def read(self) -> bytes:
    return self.data

  def geturl(self) -> str:
    return 'https://cdn.example.test/library.js'


def entry(data: bytes) -> dict:
  return {
    'url': 'https://cdn.example.test/library.js',
    'integrity': sri(data),
  }


class CdnDependencyTest(unittest.TestCase):
  def test_valid_response_matches_integrity_and_cors(self) -> None:
    data = b'globalThis.Library = {};'

    def open_url(request, *, timeout):
      self.assertEqual(request.get_header('Origin'), cdn.PRODUCTION_ORIGIN)
      self.assertEqual(timeout, 12)
      return FakeResponse(data)

    self.assertEqual(
      cdn.verify_asset(entry(data), timeout=12, open_url=open_url),
      'https://cdn.example.test/library.js',
    )

  def test_integrity_mismatch_is_rejected(self) -> None:
    expected = entry(b'expected')
    with self.assertRaisesRegex(ValueError, 'SHA-384'):
      cdn.verify_asset(expected, open_url=lambda *_args, **_kwargs: FakeResponse(b'changed'))

  def test_missing_cors_header_is_rejected(self) -> None:
    data = b'library'
    with self.assertRaisesRegex(ValueError, 'CORS'):
      cdn.verify_asset(
        entry(data),
        open_url=lambda *_args, **_kwargs: FakeResponse(data, allow_origin=''),
      )

  def test_non_success_response_is_rejected(self) -> None:
    data = b'library'
    with self.assertRaisesRegex(ValueError, 'HTTP 503'):
      cdn.verify_asset(
        entry(data),
        open_url=lambda *_args, **_kwargs: FakeResponse(data, status=503),
      )


if __name__ == '__main__':
  unittest.main()
