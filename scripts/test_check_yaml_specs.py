import copy
import json
import unittest
from unittest import mock

import check_yaml_specs as yaml_specs


class YamlSpecLockTests(unittest.TestCase):
  def test_repository_version_hash_and_case_inventory_are_pinned(self):
    lock = yaml_specs.load_lock()
    self.assertEqual(lock['specVersion'], '1.2.2')
    self.assertEqual(lock['specRepository'], 'yaml/yaml-spec')
    self.assertEqual(lock['suiteRepository'], 'yaml/yaml-test-suite')
    self.assertEqual(lock['suiteCases'], 402)
    self.assertEqual(lock['comparableValidCases'], 279)
    self.assertEqual(lock['invalidCases'], 94)
    self.assertEqual(len(lock['supportedValidCases']), 140)
    self.assertTrue(yaml_specs.sha384_sri(b'yaml').startswith('sha384-'))

  def test_duplicate_or_malformed_case_ids_are_rejected(self):
    lock = copy.deepcopy(yaml_specs.load_lock())
    lock['supportedValidCases'].append(lock['supportedValidCases'][0])
    with self.assertRaisesRegex(ValueError, 'case inventory'):
      yaml_specs.validate_lock(lock)

  @mock.patch.object(yaml_specs, 'request')
  def test_latest_official_tag_is_selected_by_version_not_api_order(self, request):
    request.return_value = json.dumps([
      {'name': 'data-2021-10-09'}, {'name': 'other'}, {'name': 'data-2022-01-17'},
    ]).encode()
    self.assertEqual(
      yaml_specs.latest_tag('yaml/yaml-test-suite', yaml_specs.re.compile(r'data-\d{4}-\d{2}-\d{2}')),
      'data-2022-01-17',
    )

  @mock.patch.object(yaml_specs, 'request')
  def test_missing_release_tags_are_rejected(self, request):
    request.return_value = b'[{"name":"main"}]'
    with self.assertRaisesRegex(ValueError, 'no release tags'):
      yaml_specs.latest_tag('yaml/yaml-spec', yaml_specs.re.compile(r'\d+\.\d+\.\d+'))


if __name__ == '__main__':
  unittest.main()
