"""Ensure source comparison cannot clear a mismatched accounting context."""
from pathlib import Path
import runpy
import unittest

compare = runpy.run_path(str(Path(__file__).with_name('review-company-editorial-xbrl.py')))['compare']


class ComparisonTest(unittest.TestCase):
    def setUp(self):
        self.row = {'tag': 'Revenues', 'start': '2020-01-01', 'end': '2020-12-31', 'unit': 'USD', 'val': 0}
        self.raw = b'''<x:xbrl xmlns:x="http://www.xbrl.org/2003/instance"
          xmlns:g="http://fasb.org/us-gaap/2020-01-31"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:d="http://xbrl.org/2006/xbrldi">
          <x:context id="ctx"><x:entity><x:identifier scheme="http://www.sec.gov/CIK">123</x:identifier></x:entity>
          <x:period><x:startDate>2020-01-01</x:startDate><x:endDate>2020-12-31</x:endDate></x:period></x:context>
          <x:unit id="USD"><x:measure>iso4217:USD</x:measure></x:unit>
          <g:Revenues contextRef="ctx" unitRef="USD">0</g:Revenues></x:xbrl>'''

    def matches(self, raw):
        return compare(raw, '0000000123', [self.row])[0]['matched']

    def test_explicit_zero_matches(self):
        self.assertTrue(self.matches(self.raw))

    def test_context_and_fact_mismatches_remain_unresolved(self):
        variants = [
            self.raw.replace(b'>123<', b'>456<'),
            self.raw.replace(b'2020-12-31', b'2019-12-31'),
            self.raw.replace(b'iso4217:USD', b'iso4217:EUR'),
            self.raw.replace(b'>0</g:Revenues>', b'>1</g:Revenues>'),
            self.raw.replace(b'contextRef="ctx"', b'contextRef="absent"'),
            self.raw.replace(b'unitRef="USD"', b'unitRef="absent"'),
            self.raw.replace(b'unitRef="USD"', b'unitRef="USD" xsi:nil="true"'),
            self.raw.replace(b'</x:entity>', b'<x:segment><d:explicitMember dimension="d:Axis">d:Member</d:explicitMember></x:segment></x:entity>'),
            self.raw.replace(b'http://fasb.org/us-gaap/', b'https://issuer.invalid/'),
        ]
        for raw in variants:
            with self.subTest(raw=raw):
                self.assertFalse(self.matches(raw))


if __name__ == '__main__':
    unittest.main()
