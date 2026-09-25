import copy
import io
import json
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
    self.assertEqual(lock['rfcs']['7932']['format'], 'brotli')
    self.assertEqual(lock['rfcs']['7932']['errata'], [
      {'id': 5948, 'status': 'Verified'}, {'id': 6977, 'status': 'Reported'},
    ])
    self.assertEqual(lock['zip']['version'], '6.3.10')
    self.assertEqual(lock['lzma']['supported'], compression.LZMA_FEATURES)
    self.assertEqual(set(lock['phase3']), set(compression.PHASE3_SOURCE_URLS))

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
      errata_source = f'errata-{number}'.encode()
      responses.extend([source, errata_source])
      rfc_hashes[source] = entry['sha384']
      if number in compression.ZSTD_RFCS:
        rfc_hashes[errata_source] = entry['errataSha384']
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
         mock.patch.object(compression, 'parse_errata', side_effect=errata), \
         mock.patch.object(compression, 'check_phase3_sources', return_value=['Phase 3 changed']) as phase3:
      errors = compression.check_pinned(lock)
    phase3.assert_called_once_with(lock)
    self.assertEqual(errors, ['ZIP APPNOTE source SHA-384 changed', 'Phase 3 changed'])

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

  def test_monthly_browser_filter_selects_compression_regressions(self):
    workflow = (compression.ROOT / '.github/workflows/maintenance.yml').read_text(encoding='utf-8')
    match = re.search(r"npx playwright test --project=chromium -g '([^']+)'", workflow)
    self.assertIsNotNone(match)
    for title in ['lzma 자체 해제기: 공개 벡터', 'LZMA: 취소·다운로드',
                  'brotli 자체 압축기: 블록 경계', 'Brotli: 오프라인',
                  'zstd 자체 해제기: 공개 벡터', 'Zstd: 사전 ID',
                  'bzip2 자체 해제기: 공개 벡터', 'Bzip2: CRC',
                  'lz4 자체 해제기: 공개 벡터', 'LZ4: 연결 프레임']:
      self.assertRegex(title, match.group(1))

  def test_phase3_inventory_cannot_be_dropped_redirected_or_unpinned(self):
    lock = compression.load_lock()
    changed = copy.deepcopy(lock)
    del changed['phase3']
    with self.assertRaisesRegex(ValueError, 'required schema'):
      compression.validate_lock(changed)
    for name in compression.PHASE3_SOURCE_URLS:
      for change in ['remove', 'url', 'sha384', 'empty']:
        with self.subTest(name=name, change=change):
          changed = copy.deepcopy(lock)
          if change == 'remove': del changed['phase3'][name]
          elif change == 'empty': changed['phase3'][name] = None
          else: changed['phase3'][name][change] = 'invalid'
          with self.assertRaisesRegex(ValueError, 'Phase 3 compression'):
            compression.validate_lock(changed)

  def test_each_phase3_full_document_change_requires_review(self):
    for name in compression.PHASE3_SOURCE_URLS:
      for changed in [b'reviewed document\nNew specification text', b'']:
        with self.subTest(name=name, changed=changed):
          lock = copy.deepcopy(compression.load_lock())
          for entry in lock['phase3'].values():
            entry['sha384'] = compression.sha384_sri(b'reviewed document')
          with mock.patch.object(compression, 'request', side_effect=lambda url:
              changed if url == compression.PHASE3_SOURCE_URLS[name] else b'reviewed document'):
            errors = compression.check_phase3_sources(lock)
          self.assertEqual(len(errors), 1)
          self.assertIn(f'Phase 3 compression {name} source SHA-384 changed', errors[0])
          self.assertIn('review format applicability', errors[0])

  def test_phase3_unchanged_sources_pass_and_network_failure_is_not_ignored(self):
    lock = copy.deepcopy(compression.load_lock())
    for entry in lock['phase3'].values():
      entry['sha384'] = compression.sha384_sri(b'reviewed document')
    with mock.patch.object(compression, 'request', return_value=b'reviewed document') as request:
      self.assertEqual(compression.check_phase3_sources(lock), [])
      self.assertEqual(request.call_args_list, [
        mock.call(source['url']) for source in lock['phase3'].values()
      ])
    with mock.patch.object(compression, 'request', side_effect=OSError('offline')):
      with self.assertRaisesRegex(OSError, 'offline'):
        compression.check_phase3_sources(lock)

  def test_default_validation_does_not_request_network(self):
    with mock.patch.object(compression.sys, 'argv', ['check_compression_specs.py']), \
         mock.patch.object(compression, 'validate_brotli_data'), \
         mock.patch.object(compression, 'request', side_effect=AssertionError('network requested')) as request, \
         mock.patch('builtins.print'):
      self.assertEqual(compression.main(), 0)
    request.assert_not_called()

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
         mock.patch.object(compression, 'check_lzma_upstream', return_value=['LZMA upstream changed']) as upstream, \
         mock.patch.object(compression, 'check_brotli_upstream', return_value=['Brotli upstream changed']) as brotli, \
         mock.patch.object(compression, 'check_phase3_upstream', return_value=['Phase 3 upstream changed']) as phase3:
      errors = compression.check_latest(lock)
    upstream.assert_called_once_with(lock)
    brotli.assert_called_once_with(lock)
    phase3.assert_called_once_with(lock)
    self.assertEqual(len(errors), 5)
    self.assertIn('Compression Standard changed', errors[0])
    self.assertIn('Compression WPT changed', errors[1])
    self.assertIn('LZMA upstream changed', errors[2])
    self.assertIn('Brotli upstream changed', errors[3])
    self.assertIn('Phase 3 upstream changed', errors[4])

  def test_zstd_rfcs_errata_and_upstream_inventory_are_required(self):
    lock = compression.load_lock()
    self.assertEqual(lock['rfcs']['8878']['format'], 'zstd')
    self.assertEqual(lock['rfcs']['9659']['format'], 'zstd-http')
    self.assertEqual([entry['id'] for entry in lock['rfcs']['8878']['errata']],
                     [6441, 6442, 7297, 7567, 8085, 8195, 8668])
    for number in compression.ZSTD_RFCS:
      for field in ['errataSha384', 'errataUrl']:
        changed = copy.deepcopy(lock)
        changed['rfcs'][number][field] = 'invalid'
        with self.assertRaisesRegex(ValueError, f'RFC {number}'):
          compression.validate_lock(changed)
      changed = copy.deepcopy(lock)
      del changed['rfcs'][number]
      with self.assertRaisesRegex(ValueError, 'RFC inventory'):
        compression.validate_lock(changed)
    for name in compression.PHASE3_UPSTREAM_URLS:
      for field in ['remove', 'url', 'sha384']:
        changed = copy.deepcopy(lock)
        if field == 'remove': del changed['phase3Upstream'][name]
        else: changed['phase3Upstream'][name][field] = 'invalid'
        with self.assertRaisesRegex(ValueError, 'Phase 3 upstream'):
          compression.validate_lock(changed)

  def test_edited_zstd_erratum_text_is_detected_with_same_id_and_status(self):
    lock = copy.deepcopy(compression.load_lock())
    sources = {entry['url']: entry['sha384'] for entry in lock['rfcs'].values()}
    sources.update({entry['errataUrl']: entry.get('errataSha384', 'ignored')
                    for entry in lock['rfcs'].values()})
    sources.update({lock['standard']['sourceUrl']: lock['standard']['sourceSha384'],
                    lock['zip']['url']: lock['zip']['sha384'], lock['lzma']['url']: lock['lzma']['sha384']})
    changed_url = lock['rfcs']['8878']['errataUrl']
    with mock.patch.object(compression, 'request', side_effect=lambda url: url.encode()), \
         mock.patch.object(compression, 'sha384_sri', side_effect=lambda raw:
           'sha384-' + 'A' * 64 if raw.decode() == changed_url else sources[raw.decode()]), \
         mock.patch.object(compression, 'parse_errata', side_effect=lambda raw, number: lock['rfcs'][number]['errata']), \
         mock.patch.object(compression, 'extract_formats', return_value=compression.FORMATS), \
         mock.patch.object(compression, 'aggregate_wpt', return_value=lock['wpt']['aggregateSha384']), \
         mock.patch.object(compression, 'check_phase3_sources', return_value=[]):
      self.assertEqual(compression.check_pinned(lock), [
        'RFC 8878 full errata text changed; review corrections before updating the pin'])

  def phase3_sources(self):
    shared = self.brotli_sources()
    return {
      **{key: {'doc_id': f'RFC{number}', 'updated_by': [], 'obsoleted_by': []}
         for key, number in compression.PHASE3_METADATA_RFCS.items()},
      'zstdReleases': copy.deepcopy(shared['releases']), 'lz4Releases': copy.deepcopy(shared['releases']),
      'zstdAdvisories': [], 'lz4Advisories': [],
      'zstdChanges': b'Full Zstd changelog', 'lz4Changes': b'Full LZ4 changelog',
      'bzip2Downloads': b'Release links', 'bzip2Changes': b'Full Bzip2 changelog',
      'bzip2Announcements': b'<title>bzip2-devel</title><a href="2019q1.txt.gz">Text</a>',
    }

  def test_every_phase3_upstream_change_requires_review(self):
    original = self.phase3_sources()
    mailbox = b'From reporter@example.com\nSubject: Reviewed security notice\n\nFull details\n'
    for changed_name in compression.PHASE3_UPSTREAM_URLS:
      values = copy.deepcopy(original)
      changed = values[changed_name]
      if changed_name in compression.PHASE3_METADATA_RFCS: changed['updated_by'].append('RFC9999')
      elif changed_name.endswith('Releases'): changed[0]['body'] += ' Correction to older release'
      elif changed_name.endswith('Advisories'): changed.append({'ghsa_id': 'GHSA-new', 'description': 'New advisory'})
      elif changed_name != 'bzip2Announcements': values[changed_name] += b' New notice'
      lock = copy.deepcopy(compression.load_lock())
      encode = lambda value: value if isinstance(value, bytes) else json.dumps(value).encode()
      with mock.patch.object(compression, 'request', return_value=mailbox):
        for name, value in original.items():
          lock['phase3Upstream'][name]['sha384'] = compression.sha384_sri(
            compression.phase3_snapshot(name, encode(value)))
      responses = {url: encode(values[name]) for name, url in compression.PHASE3_UPSTREAM_URLS.items()}
      def request(url, **kwargs):
        if url in responses: return responses[url]
        return mailbox + (b' Edited old security notice' if changed_name == 'bzip2Announcements' else b'')
      with self.subTest(source=changed_name), mock.patch.object(compression, 'request', side_effect=request):
        errors = compression.check_phase3_upstream(lock)
        self.assertEqual(len(errors), 1)
        self.assertIn(f'Phase 3 upstream {changed_name} changed', errors[0])
        self.assertIn('review RFC/format/security applicability', errors[0])

  def test_phase3_json_snapshots_ignore_counters_but_reject_bad_data(self):
    original = self.brotli_sources()['releases']
    for name in ['zstdReleases', 'lz4Releases']:
      changed = copy.deepcopy(original)
      changed[0]['assets'][0]['download_count'] += 1
      snapshot = lambda value: compression.phase3_snapshot(name, json.dumps(value).encode())
      self.assertEqual(snapshot(original), snapshot(changed))
      changed[0]['body'] += ' Security correction'
      self.assertNotEqual(snapshot(original), snapshot(changed))
    for name, value in [('zstdRfcMetadata', {}), ('zstdHttpRfcMetadata', {'doc_id': 'RFC8878'}),
                        ('zstdReleases', []), ('lz4Releases', [{}]), ('zstdReleases', [{}] * 100),
                        ('zstdAdvisories', {}), ('lz4Advisories', [{}])]:
      with self.subTest(name=name), self.assertRaises(ValueError):
        compression.phase3_snapshot(name, json.dumps(value).encode())
    with mock.patch.object(compression, 'request', side_effect=OSError('offline')):
      with self.assertRaisesRegex(OSError, 'offline'):
        compression.check_phase3_upstream(compression.load_lock())

  def test_bzip2_archive_snapshot_covers_membership_and_edited_old_messages(self):
    index = b'bzip2-devel <a href="2019q1.txt.gz">old</a><a href="2026q3.txt.gz">new</a>'
    mailbox = b'From reporter@example.com\nSubject: Release and security\n\nReviewed body\n'
    with mock.patch.object(compression, 'request', return_value=mailbox) as request:
      original = compression.bzip2_announcements_snapshot(index)
      self.assertEqual([call.args[0] for call in request.call_args_list], [
        'https://sourceware.org/pipermail/bzip2-devel/2019q1.txt',
        'https://sourceware.org/pipermail/bzip2-devel/2026q3.txt'])
      self.assertNotEqual(original, compression.bzip2_announcements_snapshot(
        index.replace(b'<a href="2019q1.txt.gz">old</a>', b'')))
      self.assertNotEqual(original, compression.bzip2_announcements_snapshot(
        index + b'<a href="2026q4.txt.gz">next</a>'))
      self.assertNotEqual(original, compression.bzip2_announcements_snapshot(
        index + b'<a href="2026q4.mbox">New archive format</a>'))
    with mock.patch.object(compression, 'request', side_effect=lambda url, **kwargs:
        mailbox + (b' Corrected old notice' if '2019q1' in url else b'')):
      self.assertNotEqual(original, compression.bzip2_announcements_snapshot(index))

  def test_bzip2_archives_fail_on_bad_index_content_network_and_limits(self):
    index = b'bzip2-devel <a href="2019q1.txt.gz">old</a>'
    invalid = [b'', b'bzip2-devel', index.replace(b'2019q1', b'../2019q1'), index + index,
               index.replace(b'2019q1', b'2019q9'), index.replace(b'2019q1', b'https://outside/2019q1')]
    for raw in invalid:
      with self.assertRaisesRegex(ValueError, 'archive index'):
        compression.bzip2_announcements_snapshot(raw)
    with mock.patch.object(compression, 'MAX_BZIP2_ARCHIVES', 0):
      with self.assertRaisesRegex(ValueError, 'archive index'):
        compression.bzip2_announcements_snapshot(index)
    for content in [b'', b'<html>Temporarily unavailable</html>']:
      with mock.patch.object(compression, 'request', return_value=content):
        with self.assertRaisesRegex(ValueError, 'not a mailbox'):
          compression.bzip2_announcements_snapshot(index)
    with mock.patch.object(compression, 'request', side_effect=OSError('offline')):
      with self.assertRaisesRegex(OSError, 'offline'):
        compression.bzip2_announcements_snapshot(index)
    mailbox = b'From reporter@example.com\nSubject: Security notice\n'
    with mock.patch.object(compression.urllib.request, 'urlopen', side_effect=lambda *a, **kw: io.BytesIO(mailbox)), \
         mock.patch.object(compression, 'MAX_BZIP2_TOTAL_BYTES', len(mailbox) * 2 - 1):
      with self.assertRaisesRegex(ValueError, 'exceeds'):
        compression.bzip2_announcements_snapshot(index + b'<a href="2026q3.txt.gz">new</a>')
    with mock.patch.object(compression.urllib.request, 'urlopen', return_value=io.BytesIO(mailbox)), \
         mock.patch.object(compression, 'MAX_BZIP2_ARCHIVE_BYTES', len(mailbox) - 1):
      with self.assertRaisesRegex(ValueError, 'exceeds'):
        compression.bzip2_announcements_snapshot(index)

  def test_monthly_audit_invokes_latest_and_default_stays_offline(self):
    workflow = (compression.ROOT / '.github/workflows/maintenance.yml').read_text()
    self.assertIn('python3 scripts/check_compression_specs.py --check-latest', workflow)
    with mock.patch.object(compression.sys, 'argv', ['check_compression_specs.py', '--check-latest']), \
         mock.patch.object(compression, 'validate_brotli_data'), \
         mock.patch.object(compression, 'check_latest', return_value=['Phase 3 upstream changed']) as latest, \
         mock.patch('builtins.print'):
      self.assertEqual(compression.main(), 1)
      latest.assert_called_once()

  def brotli_sources(self):
    return {
      'rfcMetadata': {'doc_id': 'RFC7932', 'updated_by': ['RFC9841'], 'obsoleted_by': []},
      'releases': [{'id': 1, 'tag_name': 'v1.2.0', 'name': 'v1.2.0', 'prerelease': False,
                    'published_at': '2025-10-27', 'updated_at': '2025-10-27',
                    'body': 'Reviewed security notes', 'assets': [{'download_count': 1}]}],
      'advisories': [],
    }

  def test_brotli_release_edits_are_detected_but_download_counters_are_ignored(self):
    original = self.brotli_sources()['releases']
    changed = copy.deepcopy(original)
    changed[0]['assets'][0]['download_count'] += 1
    snapshot = lambda value: compression.brotli_snapshot('releases', json.dumps(value).encode())
    self.assertEqual(snapshot(original), snapshot(changed))
    changed[0]['body'] += ' Edited security applicability'
    self.assertNotEqual(snapshot(original), snapshot(changed))

  def test_brotli_each_upstream_change_requires_review(self):
    original = self.brotli_sources()
    for name in compression.BROTLI_UPSTREAM_URLS:
      changed = copy.deepcopy(original)
      if name == 'rfcMetadata': changed[name]['updated_by'].append('RFC9999')
      elif name == 'releases': changed[name][0]['body'] += ' New security correction'
      else: changed[name].append({'ghsa_id': 'GHSA-test', 'description': 'New advisory'})
      lock = copy.deepcopy(compression.load_lock())
      for key, value in original.items():
        lock['brotli']['upstream'][key]['sha384'] = compression.sha384_sri(
          compression.brotli_snapshot(key, json.dumps(value).encode()))
      responses = {url: json.dumps(changed[key]).encode() for key, url in compression.BROTLI_UPSTREAM_URLS.items()}
      with mock.patch.object(compression, 'request', side_effect=lambda url: responses[url]):
        errors = compression.check_brotli_upstream(lock)
      self.assertEqual(len(errors), 1)
      self.assertIn(f'Brotli upstream {name} changed', errors[0])

  def test_brotli_bad_responses_and_pagination_do_not_silently_pass(self):
    for name, value in [('rfcMetadata', {}), ('releases', []), ('releases', [{}]),
                        ('releases', [{}] * 100), ('advisories', {}), ('advisories', [{}])]:
      with self.subTest(name=name, value=value), self.assertRaises(ValueError):
        compression.brotli_snapshot(name, json.dumps(value).encode())
    with mock.patch.object(compression, 'request', side_effect=OSError('offline')):
      with self.assertRaisesRegex(OSError, 'offline'):
        compression.check_brotli_upstream(compression.load_lock())

  def test_brotli_sources_and_shared_rfc_scope_cannot_be_dropped(self):
    lock = compression.load_lock()
    self.assertEqual(lock['rfcs']['9841']['format'], 'shared-brotli')
    self.assertEqual(lock['brotli']['supported'], ['rfc7932'])
    for name in compression.BROTLI_UPSTREAM_URLS:
      changed = copy.deepcopy(lock)
      del changed['brotli']['upstream'][name]
      with self.assertRaisesRegex(ValueError, 'Brotli upstream'):
        compression.validate_lock(changed)


if __name__ == '__main__':
  unittest.main()
