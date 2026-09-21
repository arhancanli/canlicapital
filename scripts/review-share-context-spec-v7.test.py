"""Node identity checks for ID-less facts; statement admission stays separate."""
import importlib.util
from pathlib import Path
import unittest
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

runner = load('v7', 'review-share-context-spec-v7.py')
helper = load('numeric', 'review-basic-diluted-filings.py')
FACT = '<ix:nonfraction name="gaap:WeightedAverageNumberOfSharesOutstandingBasic" contextref="c" unitref="u" scale="0">20054000</ix:nonfraction>'
DOC = '''<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
xmlns:x="http://www.xbrl.org/2003/instance" xmlns:gaap="http://fasb.org/us-gaap/2022"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<x:context id="c"><x:entity><x:identifier>1263364</x:identifier></x:entity>
<x:period><x:startDate>2022-01-01</x:startDate><x:endDate>2022-12-31</x:endDate></x:period></x:context>
<x:unit id="u"><x:measure>x:shares</x:measure></x:unit>
<table><tr><td>FACT</td></tr></table></html>'''.replace('FACT', FACT)
ROW = dict(tag='WeightedAverageNumberOfSharesOutstandingBasic', start='2022-01-01', end='2022-12-31', unit='shares', val=20054000)
MATCH = helper.compare(DOC.encode(), '0001263364', [ROW])['checks'][0]['matches'][0]

class LocatorTests(unittest.TestCase):
    def locate(self, raw, match=MATCH):
        return runner.locate_fact(BeautifulSoup(raw, 'html.parser'), match, '0001263364', helper)

    def test_idless_fact_and_id_fact(self):
        node = self.locate(DOC)
        self.assertEqual(node.get('id'), None)
        self.assertIsNotNone(node.find_parent('table'))
        raw = DOC.replace('<ix:nonfraction ', '<ix:nonfraction id="f" ')
        self.assertEqual(self.locate(raw, dict(MATCH, fact_id='f')).get('id'), 'f')

    def test_rejects_corrupted_semantics(self):
        mutations = [
            ('20054000', '20054001'), ('scale="0"', 'scale="3"'),
            ('1263364', '1263365'), ('2022-12-31', '2021-12-31'),
            ('2022-01-01', '2021-01-01'), ('contextref="c"', 'contextref="missing"'),
            ('unitref="u"', 'unitref="missing"'), ('x:shares', 'x:pure'),
            ('http://fasb.org/us-gaap/2022', 'https://example.org/fake'),
            ('http://www.xbrl.org/2013/inlineXBRL', 'https://example.org/inline'),
            ('<ix:nonfraction ', '<ix:nonfraction xsi:nil="true" '),
            ('</x:entity>', '<explicitMember>segment</explicitMember></x:entity>'),
            ('scale="0"', 'scale="0" format="bad:numeric"'),
        ]
        for before, after in mutations:
            with self.subTest(after=after), self.assertRaises(AssertionError):
                self.locate(DOC.replace(before, after))

    def test_ambiguity_and_duplicate_context_fail_closed(self):
        with self.assertRaises(AssertionError):
            self.locate(DOC.replace(FACT, FACT + FACT))
        with self.assertRaises(AssertionError):
            self.locate(DOC.replace('</html>', '<x:context id="c"></x:context></html>'))

    def test_hidden_node_identity_does_not_prove_statement_membership(self):
        node = self.locate(DOC.replace('<table><tr><td>', '<ix:hidden>').replace('</td></tr></table>', '</ix:hidden>'))
        self.assertIsNone(node.find_parent('table'))

if __name__ == '__main__':
    unittest.main()
