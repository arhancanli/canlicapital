"""Require exact source-linked hidden facts, including final CSS declarations."""
import importlib.util
from pathlib import Path
import unittest
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

fixtures = load('locator_tests', 'review-share-context-spec-v7.test.py')
review = load('idaho', 'review-maxcyte-share-context.py')
helper = fixtures.helper

class MaxCyteLinks(unittest.TestCase):
    def fixture(self, eps=False):
        basic, diluted = 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'
        raw, fact, row = fixtures.DOC, fixtures.FACT, dict(fixtures.ROW)
        if eps:
            basic, diluted = 'EarningsPerShareBasic', 'EarningsPerShareDiluted'
            raw = raw.replace(fixtures.ROW['tag'], basic).replace('20054000', '0.00')
            fact = fact.replace(fixtures.ROW['tag'], basic).replace('20054000', '0.00')
            raw = raw.replace('<x:measure>x:shares</x:measure>', '<x:divide><x:unitNumerator><x:measure>cur:USD</x:measure></x:unitNumerator><x:unitDenominator><x:measure>x:shares</x:measure></x:unitDenominator></x:divide>').replace('<html ', '<html xmlns:cur="http://www.xbrl.org/2003/iso4217" ')
            row.update(tag=basic, val=0, unit='USD/shares')
        hidden = fact.replace(basic, diluted).replace('<ix:nonfraction ', '<ix:nonfraction id="hidden" ')
        raw = raw.replace('</html>', '<ix:hidden>'+hidden+'</ix:hidden></html>').replace('<td>', '<td><div style="-sec-ix-hidden: unrelated; -sec-ix-hidden: hidden">Combined row</div>')
        comparison = helper.compare(raw.encode(), '0001263364', [row, dict(row, tag=diluted)])
        return BeautifulSoup(raw, 'html.parser'), comparison

    def pair(self, soup, comparison):
        return review.paired_hidden(soup, soup.table, comparison['checks'][1], comparison, '0001263364', helper)

    def test_both_concepts_with_final_declaration_without_semicolon(self):
        for eps in [False, True]:
            soup, comparison = self.fixture(eps)
            if not eps: soup.div.decompose()
            node, peer, links = self.pair(soup, comparison)
            self.assertEqual(node['id'], 'hidden')
            self.assertIsNone(peer.get('id'))
            self.assertEqual(len(links), int(eps))

    def test_missing_wrong_row_prefix_and_duplicate_links_rejected(self):
        for mutation in ['missing', 'prefix', 'row', 'duplicate', 'context', 'value', 'scale', 'unit']:
            soup, comparison = self.fixture(True)
            peer = soup.table.find('ix:nonfraction')
            if mutation == 'missing': soup.div.decompose()
            if mutation == 'prefix': soup.div['style'] = '-sec-ix-hidden: hidden-extra'
            if mutation == 'row': soup.table.append(BeautifulSoup('<tr><td>'+str(soup.div)+'</td></tr>', 'html.parser')); soup.div.decompose()
            if mutation == 'duplicate': soup.td.append(BeautifulSoup(str(soup.div), 'html.parser'))
            if mutation == 'context': peer['contextref'] = 'other'
            if mutation == 'value': peer.string = '0.01'
            if mutation == 'scale': peer['scale'] = '3'
            if mutation == 'unit': peer['unitref'] = 'other'
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                self.pair(soup, comparison)

    def test_disclosed_share_pair_rejects_corrupted_peer_and_unexpected_link(self):
        for mutation in ['context', 'unit', 'value', 'scale', 'duplicate', 'unexpected_link']:
            soup, comparison = self.fixture()
            if mutation != 'unexpected_link': soup.div.decompose()
            peer = soup.table.find('ix:nonfraction')
            if mutation == 'context': peer['contextref'] = 'other'
            if mutation == 'unit': peer['unitref'] = 'other'
            if mutation == 'value': peer.string = '20054001'
            if mutation == 'scale': peer['scale'] = '3'
            if mutation == 'duplicate': soup.td.append(BeautifulSoup(str(peer), 'html.parser'))
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                self.pair(soup, comparison)

if __name__ == '__main__':
    unittest.main()
