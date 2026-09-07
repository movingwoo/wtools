import copy
import re
import unittest
from unittest import mock

import check_compression_specs as compression


class CompressionSpecLockTests(unittest.TestCase):
  def test_pinned_lock_is_valid(self):
    lock = compression.load_lock()
    self.assertEqual(lock['standard']['formats'], compression.FORMATS)
    self.assertEqual(len(lock['wpt']['files']), 29)
    self.assertEqual(lock['rfcs']['1951']['errata'][0]['id'], 7764)
    self.assertEqual(lock['zip']['version'], '6.3.10')
    self.assertEqual(lock['lzma']['supported'], compression.LZMA_FEATURES)

  def test_changed_inventory_is_rejected(self):
    lock = copy.deepcopy(compression.load_lock())
    lock['wpt']['files'].append('../outside.js')
    with self.assertRaisesRegex(ValueError, 'WPT source inventory'):
      compression.validate_lock(lock)

  def test_latest_commit_is_read_from_first_feed_entry(self):
    commit = 'a' * 40
    feed = f'''<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry><link href="https://github.com/whatwg/compression/commit/{commit}" /></entry>
      </feed>'''.encode()
    self.assertEqual(compression.latest_feed_commit(feed), commit)

  def test_wpt_hash_includes_names_and_contents(self):
    first = compression.aggregate_wpt(['a.js', 'b.js'], [b'a', b'b'])
    renamed = compression.aggregate_wpt(['a.js', 'c.js'], [b'a', b'b'])
    changed = compression.aggregate_wpt(['a.js', 'b.js'], [b'a', b'c'])
    self.assertNotEqual(first, renamed)
    self.assertNotEqual(first, changed)

  def test_zip_source_change_is_reported(self):
    lock = compression.load_lock()
    responses = [b'standard', *[b'wpt'] * len(lock['wpt']['files'])]
    rfc_hashes = {}
    for number, entry in lock['rfcs'].items():
      source = f'rfc-{number}'.encode()
      responses.extend([source, b'errata'])
      rfc_hashes[source] = entry['sha384']
    responses.extend([b'changed zip', b'lzma'])

    def source_hash(data):
      if data == b'standard': return lock['standard']['sourceSha384']
      if data in rfc_hashes: return rfc_hashes[data]
      if data == b'lzma': return lock['lzma']['sha384']
      return 'sha384-' + 'A' * 64

    def errata(_, number):
      return lock['rfcs'][number]['errata']

    with mock.patch.object(compression, 'request', side_effect=responses), \
         mock.patch.object(compression, 'sha384_sri', side_effect=source_hash), \
         mock.patch.object(compression, 'extract_formats', return_value=compression.FORMATS), \
         mock.patch.object(compression, 'aggregate_wpt', return_value=lock['wpt']['aggregateSha384']), \
         mock.patch.object(compression, 'parse_errata', side_effect=errata):
      errors = compression.check_pinned(lock)
    self.assertEqual(errors, ['ZIP APPNOTE source SHA-384 changed'])

  def test_lzma_source_and_scope_are_pinned(self):
    for key, value in [('url', 'https://example.com/codec'), ('supported', ['lzma2'])]:
      lock = copy.deepcopy(compression.load_lock())
      lock['lzma'][key] = value
      with self.assertRaisesRegex(ValueError, 'LZMA specification'):
        compression.validate_lock(lock)

  def test_lzma_upstream_inventory_cannot_drop_or_redirect_a_source(self):
    for name in compression.LZMA_UPSTREAM_URLS:
      for change in ['remove', 'url', 'sha384']:
        with self.subTest(name=name, change=change):
          lock = copy.deepcopy(compression.load_lock())
          if change == 'remove': del lock['lzma']['upstream'][name]
          else: lock['lzma']['upstream'][name][change] = 'invalid'
          with self.assertRaisesRegex(ValueError, 'LZMA upstream'):
            compression.validate_lock(lock)

  def test_each_upstream_change_including_empty_content_requires_review(self):
    for name in compression.LZMA_UPSTREAM_URLS:
      for changed in [b'new release, spec URL, or edited security advisory', b'']:
        with self.subTest(name=name, changed=changed):
          lock = copy.deepcopy(compression.load_lock())
          for entry in lock['lzma']['upstream'].values():
            entry['sha384'] = compression.sha384_sri(b'reviewed')
          with mock.patch.object(compression, 'request', side_effect=lambda url:
              changed if url == compression.LZMA_UPSTREAM_URLS[name] else b'reviewed'):
            errors = compression.check_lzma_upstream(lock)
          self.assertEqual(len(errors), 1)
          self.assertIn(f'LZMA upstream {name} changed', errors[0])
          self.assertIn('review format/security applicability', errors[0])

  def test_unchanged_upstream_passes_and_network_failure_is_not_ignored(self):
    lock = copy.deepcopy(compression.load_lock())
    for entry in lock['lzma']['upstream'].values():
      entry['sha384'] = compression.sha384_sri(b'reviewed')
    with mock.patch.object(compression, 'request', return_value=b'reviewed') as request:
      self.assertEqual(compression.check_lzma_upstream(lock), [])
      self.assertEqual(request.call_count, 4)
    with mock.patch.object(compression, 'request', side_effect=OSError('offline')):
      with self.assertRaisesRegex(OSError, 'offline'):
        compression.check_lzma_upstream(lock)

  def test_monthly_browser_filter_selects_lzma_regressions(self):
    workflow = (compression.ROOT / '.github/workflows/maintenance.yml').read_text(encoding='utf-8')
    match = re.search(r"npx playwright test --project=chromium -g '([^']+)'", workflow)
    self.assertIsNotNone(match)
    for title in ['lzma 자체 해제기: 공개 벡터', 'LZMA: 취소·다운로드']:
      self.assertRegex(title, match.group(1))

  def test_errata_ids_and_statuses_are_parsed(self):
    page = b'''<input name="rfc_number" value="1951">
      Errata-ID: <a href="/eid123/">123</a>
      <dt class="col-sm-4">Status:</dt><dd><span>Verified</span>'''
    self.assertEqual(
      compression.parse_errata(page, '1951'), [{'id': 123, 'status': 'Verified'}])

  def test_unrecognized_empty_errata_page_is_rejected(self):
    with self.assertRaisesRegex(ValueError, 'structure'):
      compression.parse_errata(b'<html></html>')

  def test_latest_changes_are_reported(self):
    lock = compression.load_lock()
    with mock.patch.object(compression, 'request', side_effect=[b'standard', b'wpt']), \
         mock.patch.object(compression, 'latest_feed_commit', side_effect=['a' * 40, 'b' * 40]), \
         mock.patch.object(compression, 'check_pinned', return_value=[]), \
         mock.patch.object(compression, 'check_lzma_upstream', return_value=['LZMA upstream changed']) as upstream:
      errors = compression.check_latest(lock)
    upstream.assert_called_once_with(lock)
    self.assertEqual(len(errors), 3)
    self.assertIn('Compression Standard changed', errors[0])
    self.assertIn('Compression WPT changed', errors[1])
    self.assertIn('LZMA upstream changed', errors[2])


if __name__ == '__main__':
  unittest.main()
