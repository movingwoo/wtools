import copy
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
    responses.append(b'changed zip')

    def source_hash(data):
      if data == b'standard': return lock['standard']['sourceSha384']
      if data in rfc_hashes: return rfc_hashes[data]
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
         mock.patch.object(compression, 'check_pinned', return_value=[]):
      errors = compression.check_latest(lock)
    self.assertEqual(len(errors), 2)
    self.assertIn('Compression Standard changed', errors[0])
    self.assertIn('Compression WPT changed', errors[1])


if __name__ == '__main__':
  unittest.main()
