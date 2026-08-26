import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate_static


class WorkflowYamlValidationTests(unittest.TestCase):
  def test_plain_value_with_mapping_separator_is_rejected(self):
    source = "        run: npx test -g 'markdown-html: 공개'\n"
    self.assertEqual(validate_static.ambiguous_workflow_plain_values(source), [1])

  def test_block_and_fully_quoted_values_are_allowed(self):
    source = '''
        run: |
          npx test -g 'markdown-html: 공개'
        name: "Markdown: 공개 벡터"
'''
    self.assertEqual(validate_static.ambiguous_workflow_plain_values(source), [])


if __name__ == '__main__':
  unittest.main()
