import unittest

import check_reference_data as reference


class ReferenceDataTests(unittest.TestCase):
  def test_http_csv_parser_preserves_current_iana_names(self):
    rows = reference.parse_http_registry(
      b'Value,Description,Reference\n418,(Unused),RFC\n422,Unprocessable Content,RFC\n'
    )
    self.assertEqual(rows, {418: '(Unused)', 422: 'Unprocessable Content'})

  def test_mime_xml_parser_uses_top_level_registry(self):
    xml = b'''<?xml version="1.0"?>
      <registry xmlns="http://www.iana.org/assignments">
        <registry id="text"><record><name>javascript</name></record></registry>
      </registry>'''
    self.assertEqual(reference.parse_mime_registry(xml), {'text/javascript'})

  def test_current_local_data_is_well_formed(self):
    data, errors = reference.check(False)
    self.assertEqual(errors, [])
    by_code = {item['code']: item['name'] for item in data['http']}
    self.assertEqual(by_code[418], '(Unused)')
    self.assertEqual(by_code[422], 'Unprocessable Content')


if __name__ == '__main__':
  unittest.main()
