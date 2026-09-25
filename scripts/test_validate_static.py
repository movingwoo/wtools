import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate_static


class BrotliReleaseValidationTests(unittest.TestCase):
  def setUp(self):
    directory = tempfile.TemporaryDirectory()
    self.addCleanup(directory.cleanup)
    self.root = Path(directory.name).resolve()
    for relative in ('assets/data/brotli-dictionary.bin', 'js/lib/archive/brotli-tables.js',
                     'js/workers/archive-codec.js', 'sw.js'):
      target = self.root / relative
      target.parent.mkdir(parents=True, exist_ok=True)
      target.write_bytes((validate_static.ROOT / relative).read_bytes())
    root = patch.object(validate_static, 'ROOT', self.root)
    root.start()
    self.addCleanup(root.stop)

  def validate(self):
    validation = validate_static.Validation()
    validate_static.validate_brotli_assets(validation)
    return validation

  def test_release_assets_are_valid_and_required_in_precache(self):
    validation = self.validate()
    self.assertEqual(validation.errors, [])
    path = self.root / 'sw.js'
    path.write_text(path.read_text().replace("  './assets/data/brotli-dictionary.bin',\n", ''))
    validate_static.validate_app_shell(validation, set())
    self.assertIn('sw.js APP_SHELL: required local asset is not cached: assets/data/brotli-dictionary.bin',
                  validation.errors)

  def test_corrupt_normative_assets_fail_release_validation(self):
    for relative in ('assets/data/brotli-dictionary.bin', 'js/lib/archive/brotli-tables.js'):
      path = self.root / relative
      original = path.read_bytes()
      with self.subTest(asset=relative):
        path.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
        self.assertTrue(any('integrity mismatch' in error for error in self.validate().errors))
      path.write_bytes(original)

  def test_missing_dictionary_fails_without_crashing(self):
    (self.root / 'assets/data/brotli-dictionary.bin').unlink()
    self.assertTrue(any('missing file' in error for error in self.validate().errors))

  def test_wrong_or_removed_worker_pin_fails_release_validation(self):
    path = self.root / 'js/workers/archive-codec.js'
    original = path.read_text()
    for changed in (original.replace('integrity:', 'removedIntegrity:'),
                    original.replace('sha384-', 'sha256-')):
      with self.subTest(worker=changed):
        path.write_text(changed)
        self.assertTrue(any('matching SHA-384 SRI pin' in error for error in self.validate().errors))


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
