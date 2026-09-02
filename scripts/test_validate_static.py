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


class PlaywrightCIImageValidationTests(unittest.TestCase):
  def test_repeated_reviewed_image_is_allowed(self):
    image = 'mcr.microsoft.com/playwright:v1.2.3@sha256:reviewed'
    self.assertTrue(validate_static.playwright_ci_images_match([image, image], image))

  def test_missing_or_mismatched_image_is_rejected(self):
    image = 'mcr.microsoft.com/playwright:v1.2.3@sha256:reviewed'
    self.assertFalse(validate_static.playwright_ci_images_match([], image))
    self.assertFalse(validate_static.playwright_ci_images_match(
      [image, 'mcr.microsoft.com/playwright:v1.2.3@sha256:different'], image
    ))

  def test_browser_workflows_are_reviewed(self):
    self.assertEqual(validate_static.unreviewed_browser_workflows(), [])


if __name__ == '__main__':
  unittest.main()
