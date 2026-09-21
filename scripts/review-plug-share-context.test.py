import importlib.util
from pathlib import Path
import unittest
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parent

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
review = load('review', 'review-plug-share-context.py')
helper = load('helper', 'review-basic-diluted-filings.py')

class HiddenPairTests(unittest.TestCase):
    def fixture(self, shares=False):
        basic = 'WeightedAverageNumberOfSharesOutstandingBasic' if shares else 'EarningsPerShareBasic'
        diluted = 'WeightedAverageNumberOfDilutedSharesOutstanding' if shares else 'EarningsPerShareDiluted'
        val, unit, sign = ('218882337', 'shares', '') if shares else ('0.39', 'USDshares', ' sign="-"')
        soup = BeautifulSoup(f'<ix:hidden><ix:nonfraction id="hidden" name="us-gaap:{diluted}" contextref="period" unitref="{unit}"{sign}>{val}</ix:nonfraction></ix:hidden><table><tr><td><span style="-sec-ix-hidden:hidden;">$</span><ix:nonfraction id="basic" name="us-gaap:{basic}" contextref="period" unitref="{unit}" scale="0"{sign}>{val}</ix:nonfraction></td></tr></table>', 'html.parser')
        check = dict(selected=dict(tag=diluted, val=218882337 if shares else -0.39), matches=[dict(fact_id='hidden')])
        return soup, check
    def test_linked_eps_and_disclosed_denominator_pair(self):
        for shares in [False, True]:
            soup, check = self.fixture(shares)
            if shares: soup.span.decompose()
            node, peer, links = review.paired_hidden(soup, soup.table, check, helper)
            self.assertEqual(node['id'], 'hidden'); self.assertEqual(peer['id'], 'basic')
            self.assertEqual(bool(links), not shares)
    def test_rejects_changed_context_unit_scale_value_missing_link_or_duplicate(self):
        for mutation in ['context', 'unit', 'scale', 'value', 'link', 'duplicate']:
            soup, check = self.fixture(); peer = soup.find(id='basic')
            if mutation == 'context': peer['contextref'] = 'other'
            if mutation == 'unit': peer['unitref'] = 'other'
            if mutation == 'scale': peer['scale'] = '3'
            if mutation == 'value': peer.string = '0.40'
            if mutation == 'link': soup.span.decompose()
            if mutation == 'duplicate': soup.td.append(BeautifulSoup(str(peer), 'html.parser'))
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                review.paired_hidden(soup, soup.table, check, helper)
if __name__ == '__main__': unittest.main()
