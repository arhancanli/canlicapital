"""Preserve unresolved pre-funded warrant issuance dates in the loss denominator."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
sha = lambda b: hashlib.sha256(b).hexdigest()
clean = lambda n: ' '.join(' '.join(n.stripped_strings).split())

def main():
    cik, accession = '0001339005', '0001140361-26-012375'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001339005-source.json.gz').read_bytes())
    assert sha(source) == '0a977ccfe663d6aad6cf08dbc6fa26d0ec381f134bae0515d39173985a9d6dcf'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '843bae9080c2511675efce3fca1ff1bef352c09d941f0ab3dfbf5fe5c4a8b837'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {16: {22: 'Net loss $ ( 18,627,887 ) ( 18,816,628 )', 24: 'Net loss attributable to common stockholders, basic and diluted $ ( 18,627,887 ) ( 18,816,628 )', 26: 'Net loss per share attributable to common stockholders, basic and diluted $ ( 0.47 ) ( 0.85 )', 27: 'Weighted-average common shares and pre-funded warrants outstanding- basic and diluted 39,549,218 22,267,695'}, 49: {1: '2025 2024', 3: 'Net loss attributable to common stockholders, basic and diluted $ ( 18,627,887 ) ( 18,816,628 )', 5: 'Weighted-average common shares and pre-funded warrants outstanding- basic and diluted 39,549,218 22,267,695', 6: 'Net loss per share attributable to common stockholders, basic and diluted $ ( 0.47 ) ( 0.85 )'}, 50: {6: 'Warrants to purchase common stock, in connection with August 2025 financing 13,409,168 —', 7: 'November 2025 convertible notes and PIK interest, if converted 16,558,917 —', 8: 'Warrants to purchase common stock, in connection with November 2025 financing 49,135,689 —', 10: 'Total potential shares 89,192,922 9,294,927'}}
    for index, requirements in expected.items():
        for row, text in requirements.items(): assert clean(tables[index].find_all('tr')[row]) == text
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    prefixes = ['Basic net loss per share attributable to common stockholders is calculated', 'On August 25, 2025, the Company entered into a securities purchase agreement', 'The pre-funded warrants, common warrants and underwriter warrants were exercisable immediately', 'As of December 31, 2025, 6,750,000 pre-funded warrants', 'In November 2025, the Company issued (i) senior secured convertible notes', 'Since the shares underlying the November 2025 pre-funded warrants', 'The following potentially dilutive securities have been excluded']
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
    result = dict(schema='canli.femasys-warrant-date-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()), locator_sha256=sha(locator_path.read_bytes()),
        selected_observations=rows, comparison=comparison, disclosures=disclosures,
        tables=[dict(table_index=i,text=clean(tables[i]),verified_rows=req) for i,req in expected.items()], inline_evidence=facts,
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='The EPS note refers to November 2025 pre-funded warrants at USD0.0001 and includes them in basic/diluted shares from issuance. The financing note describes August 25 pre-funded warrants at USD0.0001, with 6,750,000 remaining at year-end; its November financing describes convertible notes and three warrant series priced USD0.81/0.92/1.10. Preserve the inconsistent date/instrument attribution. Exact reported denominators and EPS match, but this filing alone does not resolve when the pre-funded warrants entered the weighted denominator. Do not silently substitute August for November or reconstruct an approved denominator.',
        scope='Eight selected 2024/25 observations remain pending; no earlier-year approval, public note, review registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; pre-funded warrant date attribution remains pending')
if __name__ == '__main__': main()
