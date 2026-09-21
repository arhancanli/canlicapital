"""Preserve Digital Ally denominator precision and signed noncontrolling allocation."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import re
from bs4 import BeautifulSoup
from decimal import Decimal, ROUND_HALF_UP
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
sha = lambda b: hashlib.sha256(b).hexdigest()
clean = lambda n: ' '.join(' '.join(n.stripped_strings).split())

def main():
    cik, accession = '0001342958', '0001493152-26-016236'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001342958-source.json.gz').read_bytes())
    assert sha(source) == '7d66d677efc19dd49d39a5a0020f9258c1f61e3f3bacefece8eb7eb7570ee2dd'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == 'fdafd3b70e0a95fd3780e9c7a656c2f6a459d0d74df63f9771a9c1029e7b3ea6'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {167: {48: 'Net loss ( 7,359,024 ) ( 21,715,725 )', 50: 'Net income attributable to noncontrolling interests 687,516 1,871,578', 52: 'Net loss attributable to common stockholders $ ( 6,671,508 ) $ ( 19,844,147 )', 58: 'Net loss attributable to common stockholders per share – basic $ ( 17.23 ) $ ( 33,488.74 )', 63: 'Net loss attributable to common stockholders per share – diluted $ ( 17.23 ) $ ( 33,488.74 )', 66: 'Basic 387,144 593', 67: 'Diluted 387,144 593'}, 261: {3: 'Numerator for basic and diluted loss per share – Net loss attributable to common stockholders – continuing operations $ ( 5,955,930 ) $ ( 17,898,105 )', 5: 'Numerator for basic and diluted loss per share – Net loss attributable to common stockholders – discontinued operations (net of noncontrolling interests) $ ( 715,578 ) $ ( 1,946,042 )', 7: 'Denominator for basic loss per share – weighted average shares outstanding 387,144 593', 10: 'Denominator for diluted loss per share – adjusted weighted average shares outstanding 387,144 593', 13: 'Basic: $ ( 17.23 ) $ ( 33,488.74 )', 17: 'Diluted: $ ( 17.23 ) $ ( 33,488.74 )'}}
    for index, requirements in expected.items():
        for row, text in requirements.items(): assert clean(tables[index].find_all('tr')[row]) == text
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    prefixes = ['The Company owned a 51% equity interest in its consolidated subsidiary, Nobility Healthcare.', 'On May 6, 2025, the Company, acting pursuant', 'On May 22, 2025, the Company, acting pursuant', 'On January 8, 2026, the Company, acting pursuant', 'Basic loss per share is based upon', 'The 2025 Senior Secured Convertible Notes with an outstanding principal balance']
    disclosures = []
    for prefix in prefixes:
        matches = [t for t in blocks if t.startswith(prefix)]; assert matches, prefix
        disclosures.append(max(matches, key=len))
    locator_path = ROOT / 'scripts/review-share-context-spec-v7.py'
    spec = importlib.util.spec_from_file_location('locator', locator_path)
    locator = importlib.util.module_from_spec(spec); spec.loader.exec_module(locator)
    facts = []
    for check in comparison['checks']:
        found = []
        for match in check['matches']:
            node = locator.locate_fact(soup, match, cik, helper)
            index = next((i for i in expected if node.find_parent('table') is tables[i]), None)
            if index is None: continue
            assert node.get('scale', '0') == '0'
            found.append(dict(table_index=index, selected=check['selected'], fact_xml=str(node), context_xml=str(soup.find(id=node['contextref'])), unit_xml=str(soup.find(id=node['unitref']))))
        assert found
        facts.extend(found)
    support_rows = []
    diagnostics = []
    for year, total, nci, common, continuing, discontinued, denominator, eps in [
        ('2025', -7359024, -687516, -6671508, -5955930, -715578, 387144, '-17.23'),
        ('2024', -21715725, -1871578, -19844147, -17898105, -1946042, 593, '-33488.74'),
    ]:
        for tag, val in [('ProfitLoss',total),('NetIncomeLossAttributableToNoncontrollingInterest',nci),
                         ('NetIncomeLoss',common),('NetIncomeLossFromContinuingOperationsAvailableToCommonShareholdersBasic',continuing),
                         ('NetIncomeLossFromDiscontinuedOperationsAvailableToCommonShareholdersBasic',discontinued)]:
            support_rows.append(dict(start=year+'-01-01',end=year+'-12-31',val=val,unit='USD',tag=tag))
        assert total - nci == common and continuing + discontinued == common
        ratio = Decimal(common) / Decimal(denominator)
        rounded = ratio.quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        assert (rounded == Decimal(eps)) == (year == '2025')
        diagnostics.append(dict(year=year,consolidated_loss=total,noncontrolling_loss=nci,
            common_stockholder_loss=common,continuing=continuing,discontinued_net_of_nci=discontinued,
            reported_shares=denominator,reported_eps=eps,ratio_using_reported_shares=str(ratio),
            ratio_rounded_to_two_decimals=str(rounded),matches_reported_eps=rounded==Decimal(eps),
            scope='Diagnostic arithmetic on reported values only; not corrected EPS or an approved reconstructed denominator.'))
    # The shared comparator intentionally supports shares/per-share units only.
    # Supplemental dollar numerators must share a context already validated for
    # the selected EPS facts and use one namespace-checked USD measure.
    validated_contexts = {}
    for check in comparison['checks']:
        key = (check['selected']['start'], check['selected']['end'])
        validated_contexts.setdefault(key, set()).update(m['context_id'] for m in check['matches'])
    support_facts = []
    for selected in support_rows:
        found = []
        for node in soup.find_all(lambda n: helper.local(n) == 'nonfraction'):
            if helper.qname(node, node.name)[0] not in ('http://www.xbrl.org/2013/inlineXBRL', 'http://www.xbrl.org/2008/inlineXBRL'):
                continue
            namespace, concept = helper.qname(node, node.get('name'))
            if concept != selected['tag'] or not namespace or not re.fullmatch(r'https?://(?:fasb\.org|xbrl\.us)/us-gaap/[^/]+', namespace):
                continue
            if node.get('contextref') not in validated_contexts[(selected['start'], selected['end'])]:
                continue
            index = next((i for i in expected if node.find_parent('table') is tables[i]), None)
            if index is None: continue
            unit = soup.find(id=node.get('unitref'))
            assert unit is not None and helper.qname(unit, unit.name) == (helper.INSTANCE_NS, 'unit')
            measures = [n for n in unit.children if getattr(n, 'name', None)]
            assert len(measures) == 1 and not measures[0].find()
            assert helper.qname(measures[0], measures[0].name) == (helper.INSTANCE_NS, 'measure')
            assert helper.qname(measures[0], measures[0].get_text(strip=True)) == ('http://www.xbrl.org/2003/iso4217', 'USD')
            assert not any(helper.qname(node, k) == ('http://www.w3.org/2001/XMLSchema-instance', 'nil') and v in ('true', '1') for k, v in node.attrs.items())
            assert node.get('scale', '0') == '0' and node.get('decimals') == '0'
            value = helper.numeric(node)
            assert value == Decimal(selected['val'])
            found.append(dict(table_index=index, selected=selected, normalized_value=str(value), fact_xml=str(node),
                              context_xml=str(soup.find(id=node['contextref'])), unit_xml=str(unit)))
        assert len(found) == 1
        support_facts.extend(found)
    for fact in facts:
        if fact['selected']['unit'] == 'shares':
            assert 'decimals="INF"' in fact['fact_xml']
    result = dict(schema='canli.digital-ally-denominator-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()), locator_sha256=sha(locator_path.read_bytes()),
        selected_observations=rows, comparison=comparison, disclosures=disclosures,
        tables=[dict(table_index=i,text=clean(tables[i]),verified_rows=req) for i,req in expected.items()], inline_evidence=facts,
        supporting_inline_evidence=support_facts, diagnostics=diagnostics,
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='Negative inline noncontrolling-interest facts and the explicit loss-allocation disclosure reconcile consolidated to common-stockholder loss, despite the abbreviated visible income label. In 2024, reported common loss divided by the reported 593 shares produces -33463.99 at two decimals, not the reported -33488.74. Share facts declare decimals INF; do not silently infer a fractional denominator or use reverse-split disclosures as proof of an unreported rounding adjustment. The 2025 displayed loss ratio rounds to reported EPS. Both years remain pending in this report.',
        scope='Eight selected 2024/25 observations remain pending; no earlier-year approval, public note, review registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; 2024 denominator precision remains pending')
if __name__ == '__main__': main()
