import copy
import json
import unittest
from unittest import mock

import check_json_schema_specs as json_schema_specs


class JsonSchemaSpecLockTests(unittest.TestCase):
  def test_suite_hash_and_supported_inventory_are_pinned(self):
    lock = json_schema_specs.load_lock()
    self.assertEqual(lock['suiteRepository'], 'json-schema-org/JSON-Schema-Test-Suite')
    self.assertEqual(lock['supportedGroups'], 1086)
    self.assertEqual(lock['supportedCases'], 4164)
    self.assertEqual(lock['drafts']['draft2020-12']['skippedCases'], 333)
    self.assertEqual(lock['skippedReasons']['nested-$id-resource']['groups'], 18)
    self.assertEqual(lock['currentDialect'], '2020-12')
    self.assertEqual(lock['ietfDraft']['revision'], '03')
    self.assertEqual(list(lock['metaSchemas']), json_schema_specs.META_SCHEMA_URLS)
    self.assertEqual(list(lock['drafts']), json_schema_specs.DRAFTS)
    self.assertTrue(json_schema_specs.sha384_sri(b'json-schema').startswith('sha384-'))

  def test_changed_case_inventory_is_rejected(self):
    lock = copy.deepcopy(json_schema_specs.load_lock())
    lock['drafts']['draft7']['cases'] += 1
    with self.assertRaisesRegex(ValueError, 'inventory'):
      json_schema_specs.validate_lock(lock)

  def test_changed_exclusion_inventory_is_rejected(self):
    lock = copy.deepcopy(json_schema_specs.load_lock())
    lock['excludedSchemaFeatures'].append('format')
    with self.assertRaisesRegex(ValueError, 'excluded feature'):
      json_schema_specs.validate_lock(lock)

  @mock.patch.object(json_schema_specs, 'request')
  def test_branch_commit_uses_the_returned_sha(self, request):
    request.return_value = json.dumps({'sha': 'a' * 40}).encode()
    self.assertEqual(json_schema_specs.branch_commit('owner/repo', 'main'), 'a' * 40)

  def test_stale_review_date_is_rejected(self):
    lock = copy.deepcopy(json_schema_specs.load_lock())
    lock['reviewed'] = '2020-01-01'
    with self.assertRaisesRegex(ValueError, 'stale'):
      json_schema_specs.validate_lock(lock)

  def test_changed_meta_schema_and_ietf_revision_are_reported(self):
    lock = copy.deepcopy(json_schema_specs.load_lock())
    lock['metaSchemas'] = {
      url: json_schema_specs.sha384_sri(b'meta') for url in lock['metaSchemas']
    }

    def response(url, _token=''):
      if url == lock['specificationUrl']:
        return b'The current version is <em>2020-12</em>'
      if url == lock['ietfDraft']['apiUrl']:
        return json.dumps({
          'name': lock['ietfDraft']['name'], 'rev': '04',
          'time': '2026-09-01T00:00:00Z', 'rfc': None,
        }).encode()
      if url == next(iter(lock['metaSchemas'])):
        return b'changed'
      return b'meta'

    with mock.patch.object(json_schema_specs, 'branch_commit', return_value=lock['suiteCommit']), \
         mock.patch.object(json_schema_specs, 'run_pinned_corpus', return_value=[]), \
         mock.patch.object(json_schema_specs, 'request', side_effect=response):
      errors = json_schema_specs.check_remote(lock)
    self.assertTrue(any('meta-schema changed' in error for error in errors))
    self.assertTrue(any('IETF draft revision' in error for error in errors))


if __name__ == '__main__':
  unittest.main()
