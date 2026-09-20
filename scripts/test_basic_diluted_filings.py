"""Unit identity must survive aliases and reject counterfeit per-share structures."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('basic_diluted', Path(__file__).with_name('review-basic-diluted-filings.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def document(unit, extra=''):
    return f'''<html xmlns:x="http://www.xbrl.org/2003/instance"
      xmlns:c="http://www.xbrl.org/2003/iso4217" xmlns:g="http://fasb.org/us-gaap/2025"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" {extra}>
      <x:context id="annual"><x:entity><x:identifier>0000000001</x:identifier></x:entity>
      <x:period><x:startDate>2025-01-01</x:startDate><x:endDate>2025-12-31</x:endDate></x:period></x:context>
      <x:unit id="u">{unit}</x:unit>
      <table><tr><td>Basic loss per share</td><td><ix:nonFraction name="g:EarningsPerShareBasic" contextRef="annual" unitRef="u" format="ixt:numdotdecimal" sign="-">1.25</ix:nonFraction></td></tr></table></html>'''.encode()


def ratio(numerator='c:USD', denominator='x:shares'):
    return f'<x:divide><x:unitNumerator><x:measure>{numerator}</x:measure></x:unitNumerator><x:unitDenominator><x:measure>{denominator}</x:measure></x:unitDenominator></x:divide>'


class BasicDilutedTests(unittest.TestCase):
    row = dict(tag='EarningsPerShareBasic', start='2025-01-01', end='2025-12-31', unit='USD/shares', val=-1.25)

    def matches(self, unit, row=None, extra=''):
        return review.compare(document(unit, extra), '0000000001', [row or self.row])['checks'][0]['matched']

    def test_exact_unit_period_and_value(self):
        self.assertTrue(self.matches(ratio()))
        for key, value in [('unit', 'shares'), ('start', '2024-01-01'), ('val', 1.25), ('end', '2024-12-31')]:
            self.assertFalse(self.matches(ratio(), {**self.row, key: value}))

    def test_counterfeit_and_missing_namespaces(self):
        self.assertFalse(self.matches(ratio('fake:USD'), extra='xmlns:fake="https://invalid.example/currency"'))
        self.assertFalse(self.matches(ratio(denominator='fake:shares'), extra='xmlns:fake="https://invalid.example/shares"'))
        self.assertFalse(self.matches(ratio('missing:USD')))

    def test_wrong_or_extra_unit_components(self):
        self.assertFalse(self.matches(ratio(denominator='x:pure')))
        self.assertFalse(self.matches(ratio() + '<x:measure>c:USD</x:measure>'))
        self.assertFalse(self.matches(ratio().replace('<x:measure>c:USD</x:measure>', '<x:measure>c:USD</x:measure><x:measure>c:CAD</x:measure>')))

    def test_shares_and_currency_are_not_interchangeable(self):
        self.assertTrue(self.matches('<x:measure>x:shares</x:measure>', {**self.row, 'unit': 'shares'}))
        self.assertFalse(self.matches('<x:measure>c:USD</x:measure>'))
        self.assertFalse(self.matches(ratio('c:CAD')))
        self.assertTrue(self.matches(ratio('c:CAD'), {**self.row, 'unit': 'CAD/shares'}))


if __name__ == '__main__':
    unittest.main()
