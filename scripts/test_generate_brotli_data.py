"""Normative data corruption must fail the offline compression gate."""
import tempfile
import unittest
from pathlib import Path

import generate_brotli_data as brotli


class BrotliDataTests(unittest.TestCase):
  def test_pinned_local_assets(self):
    brotli.validate_local()

  def test_corruption_and_truncation_are_rejected(self):
    for source, other, is_dictionary in [(brotli.DICTIONARY, brotli.TABLES, True),
                                         (brotli.TABLES, brotli.DICTIONARY, False)]:
      original = source.read_bytes()
      changed = bytearray(original)
      changed[len(changed) // 2] ^= 1
      for payload in [bytes(changed), original[:-1], original + b'\0']:
        with self.subTest(source=source.name, size=len(payload)), tempfile.TemporaryDirectory() as folder:
          path = Path(folder) / source.name
          path.write_bytes(payload)
          with self.assertRaisesRegex(ValueError, 'integrity mismatch'):
            brotli.validate_local(path, other) if is_dictionary else brotli.validate_local(other, path)

  def test_unreviewed_source_is_rejected_before_extraction(self):
    with self.assertRaisesRegex(ValueError, 'source integrity mismatch'):
      brotli.extract(b'changed RFC')

  def test_crc_and_size_are_both_required(self):
    with self.assertRaises(ValueError):
      brotli.checked(b'abc', 3, 0)
    with self.assertRaises(ValueError):
      brotli.checked(b'abc', 2, 0x352441c2)


if __name__ == '__main__':
  unittest.main()
