import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('retained_inline', Path(__file__).with_name('review-retained-concept-filings.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RetainedInlineTests(unittest.TestCase):
    def fixture(self, fact='', context='', unit='iso4217:USD', entity='1', extra=''):
        return f'''<html xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:u="http://fasb.org/us-gaap/2025" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:nilalias="http://www.w3.org/2001/XMLSchema-instance" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>
        <xbrli:context id="c"><xbrli:entity><xbrli:identifier>{entity}</xbrli:identifier>{context}</xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>
        <xbrli:unit id="usd"><xbrli:measure>{unit}</xbrli:measure></xbrli:unit>
        {extra}<table><tr><td>Operating lease asset</td><td><ix:nonfraction name="u:OperatingLeaseRightOfUseAsset" contextref="c" unitref="usd" {fact}>1,250<ix:exclude>ignored</ix:exclude></ix:nonfraction></td></tr></table></body></html>'''.encode()
    def check(self, raw, value=1250000):
        return module.compare(raw,'0000000001',[{'tag':'OperatingLeaseRightOfUseAsset','end':'2025-12-31','unit':'USD','val':value}])
    def test_scale_namespace_alias_and_excluded_text(self):
        result=self.check(self.fixture('format="ixt:num-dot-decimal" scale="3"'))
        self.assertTrue(result['checks'][0]['matched'])
        self.assertIn('Operating lease asset',result['checks'][0]['matches'][0]['table_row'])
    def test_dimensions_wrong_entity_units_and_nil_are_unresolved(self):
        fact='format="ixt:num-dot-decimal" scale="3"'
        for raw in [self.fixture(fact,context='<xbrldi:explicitMember>segment</xbrldi:explicitMember>'),self.fixture(fact,entity='2'),self.fixture(fact,unit='iso4217:EUR'),self.fixture(fact+' nilalias:nil="true"')]:
            self.assertFalse(self.check(raw)['checks'][0]['matched'])
    def test_unsupported_transform_and_mismatched_value_are_unresolved(self):
        self.assertFalse(self.check(self.fixture('format="ixt:numwordsen" scale="3"'))['checks'][0]['matched'])
        self.assertFalse(self.check(self.fixture('format="ixt:num-dot-decimal" scale="3"'),1250)['checks'][0]['matched'])
    def test_unknown_transform_namespace_and_fake_zero_are_unresolved(self):
        self.assertFalse(self.check(self.fixture('format="evil:fixed-zero"'),0)['checks'][0]['matched'])
        self.assertFalse(self.check(self.fixture('format="ixt:fixed-zero"'),0)['checks'][0]['matched'])

    def test_unbound_or_counterfeit_context_namespace_cannot_match(self):
        raw=self.fixture('format="ixt:num-dot-decimal" scale="3"')
        self.assertFalse(self.check(raw.replace(b'http://www.xbrl.org/2003/instance',b'http://example.invalid/context'))['checks'][0]['matched'])

    def test_sign_period_and_duplicate_context(self):
        raw=self.fixture('format="ixt:num-dot-decimal" scale="3" sign="-"')
        self.assertTrue(self.check(raw,-1250000)['checks'][0]['matched'])
        self.assertFalse(self.check(raw.replace(b'2025-12-31',b'2024-12-31'),-1250000)['checks'][0]['matched'])
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            self.check(self.fixture(extra='<xbrli:context id="c"></xbrli:context>'))

if __name__ == '__main__':
    unittest.main()
