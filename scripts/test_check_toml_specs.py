import copy
import json
import re
import unittest
from unittest import mock

import check_toml_specs as toml_specs


class TomlSpecLockTests(unittest.TestCase):
  def test_repository_version_hash_and_case_inventory_are_pinned(self):
    lock = toml_specs.load_lock()
    self.assertEqual(lock['specVersion'], '1.0.0')
    self.assertEqual(lock['latestSpecVersion'], '1.1.0')
    self.assertEqual(lock['specRepository'], 'toml-lang/toml')
    self.assertEqual(lock['suiteRepository'], 'toml-lang/toml-test')
    self.assertEqual(lock['suiteTag'], 'v2.2.0')
    self.assertEqual(lock['caseList'], 'tests/files-toml-1.0.0')
    self.assertEqual(lock['validCases'], 205)
    self.assertEqual(lock['invalidCases'], 474)
    self.assertEqual(len(lock['byteInvalidCases']), 11)
    self.assertEqual(lock['compatibilityVersions'], ['1.6.1', '1.8.0'])
    self.assertTrue(toml_specs.sha384_sri(b'toml').startswith('sha384-'))

  def test_duplicate_or_malformed_case_ids_are_rejected(self):
    lock = copy.deepcopy(toml_specs.load_lock())
    lock['byteInvalidCases'].append(lock['byteInvalidCases'][0])
    with self.assertRaisesRegex(ValueError, 'inventory'):
      toml_specs.validate_lock(lock)

  @mock.patch.object(toml_specs, 'request')
  def test_annotated_tag_resolves_to_commit(self, request):
    request.side_effect = [
      json.dumps({'object': {'type': 'tag', 'sha': 'a' * 40}}).encode(),
      json.dumps({'object': {'type': 'commit', 'sha': 'b' * 40}}).encode(),
    ]
    self.assertEqual(toml_specs.resolve_tag_commit('toml-lang/toml', '1.0.0'), 'b' * 40)

  @mock.patch.object(toml_specs, 'request')
  def test_latest_semantic_tag_is_selected(self, request):
    request.return_value = json.dumps([
      {'name': 'v1.6.0'}, {'name': 'v2.2.0'}, {'name': 'v2.10.0-rc1'}, {'name': 'other'},
    ]).encode()
    self.assertEqual(
      toml_specs.latest_tag('toml-lang/toml-test', re.compile(r'v\d+\.\d+\.\d+')),
      'v2.2.0',
    )


if __name__ == '__main__':
  unittest.main()
