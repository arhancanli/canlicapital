"""Preserve conflicting EPS-note units and the preferred-dividend numerator."""
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
    cik, accession = '0001289340', '0001493152-26-009881'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001289340-source.json.gz').read_bytes())
    assert sha(source) == '9cf3906126204c927b520b637effe94359630212d3072d49ec0ce6959f8d02ae'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '5297e160722de1b92c4421b5eaa32e2cf7b81d1c5a67a38d9e5b7b24c53d1348'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {
        156: {2:'(in thousands, except share and per share amounts) 2025 2024',25:'Net loss $ ( 21,643 ) $ ( 24,045 )',27:'Cumulative dividend on convertible preferred stock ( 1,271 ) ( 1,308 )',28:'Net loss attributable to common stockholders $ ( 22,914 ) $ ( 25,353 )',35:'Basic 90,957,313 85,183,306',36:'Diluted 90,957,313 85,183,306'},
        226: {2:'2025 2024',3:'Net loss $ ( 21,643 ) $ ( 24,045 )',4:'Cumulative dividend on convertible preferred stock ( 1,271 ) ( 1,308 )',5:'Net loss attributable to common stockholders $ ( 22,914 ) $ ( 25,353 )',7:'Weighted average number of common shares and equivalents: 90,957,313 85,183,306',8:'Basic EPS $ ( 0.25 ) $ ( 0.30 )',9:'Diluted EPS $ ( 0.25 ) $ ( 0.30 )'},
    }
    for index, requirements in expected.items():
        for row, text in requirements.items(): assert clean(tables[index].find_all('tr')[row]) == text
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    prefixes = ['Basic earnings (loss) per common share is computed', 'The Company did not include any portion of unearned restricted shares', 'The following is a reconciliation of the numerator (net loss) and the denominator (number of shares) used in the basic and diluted earnings per share calculations (in thousands):']
    disclosures = []
    for prefix in prefixes:
        matches = [t for t in blocks if t.startswith(prefix)]; assert matches, prefix
        disclosures.append(max(matches, key=len))
    facts = []
    for check in comparison['checks']:
        found = []
        for match in check['matches']:
            node = soup.find(id=match['fact_id'])
            index = next((i for i in expected if node.find_parent('table') is tables[i]), None)
            if index is None: continue
            assert node.get('scale', '0') == '0'
            found.append(dict(table_index=index, selected=check['selected'], fact_xml=str(node), context_xml=str(soup.find(id=node['contextref'])), unit_xml=str(soup.find(id=node['unitref']))))
        assert found
        facts.extend(found)
    assert 21643 + 1271 == 22914 and 24045 + 1308 == 25353
    result = dict(schema='canli.stereotaxis-unit-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()),
        selected_observations=rows, comparison=comparison, disclosures=disclosures,
        tables=[dict(table_index=i,text=clean(tables[i]),verified_rows=req) for i,req in expected.items()], inline_evidence=facts,
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='Main statement explicitly excludes shares and per-share amounts from thousands; EPS-note introduction instead says in thousands while repeating full scale-zero share counts and per-share amounts. Both tables distinguish net loss from common-stockholder loss after cumulative preferred dividends. Preserve the heading discrepancy and numerator allocation without silently scaling or correcting facts.',
        scope='Eight selected 2024/25 observations remain pending; no earlier-year approval, public note, review registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; EPS-note unit discrepancy remains pending')
if __name__ == '__main__': main()
