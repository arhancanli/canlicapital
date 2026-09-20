"""Bind six selected share counts to the original statement's scale conflict."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    targets_path = A / 'company-basic-diluted-capture-batch1-targets-20260920.json'
    targets_raw = targets_path.read_bytes()
    targets = json.loads(targets_raw)
    cik, accession = '0001484612', '0001193125-26-051278'
    receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
    receipt = json.loads(receipt_path.read_bytes())
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '7a96861c8a08fae4c7174f1f6b94ad64ceaf7d08a44e8124617083a8ccd720c1'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/outset-medical-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c'
    selected = [dict(row, tag=t['tag']) for t in targets['targets']
                if t['cik'] == cik and t['latest_selected_accession'] == accession and t['tag'].startswith('WeightedAverage')
                for row in t['latest_accession_observations']]
    assert len(selected) == 6 and {r['end'] for r in selected} == {'2023-12-31', '2024-12-31', '2025-12-31'}
    assert all(r['val'] == {'2023-12-31':3305,'2024-12-31':3463,'2025-12-31':15211}[r['end']] and r['unit'] == 'shares' for r in selected)
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('share_comparison', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, selected)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser')
    table = soup.find_all('table')[15]
    preceding = [n.get_text(' ', strip=True) for n in table.find_all_previous('p', limit=2)]
    assert preceding[1] == 'Statements of Operations'
    header = preceding[0]
    assert header == '(in thousands, except per share amounts)'
    facts = []
    for check in comparison['checks']:
        for match in check['matches']:
            node = soup.find(id=match['fact_id'])
            assert node is not None and node.find_parent('table') is table
            assert node.get('scale') is None and helper.numeric(node) == check['selected']['val']
            unit = soup.find(id=node['unitref'])
            assert helper.share_unit(unit) == 'shares'
            facts.append(dict(fact_xml=str(node), unit_xml=str(unit), context_xml=str(soup.find(id=node['contextref']))))
    result = dict(schema='canli.outset-share-scale.v1', publication_approved=False,
        targets_sha256=sha(targets_raw), receipt_sha256=sha(receipt_path.read_bytes()), primary_capture=receipt,
        source_sha256=sha(source), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
        selected_observations=selected, comparison=comparison, inline_evidence=facts,
        zero_based_table_index=15, scale_header=header, primary_table=' '.join(' '.join(table.stripped_strings).split()),
        disposition='SIX_EXACT_SHARE_OBSERVATIONS_REQUIRE_HOLD',
        reason='The original inline facts encode displayed share counts with no scale attribute (effective scale zero) and unit shares. Their primary statement reports weighted-average shares under an in-thousands heading. Numerical reproduction of the tags does not resolve this source-level scale conflict. Withhold the six exact observations rather than silently multiply them.',
        remaining_followup='EPS and earlier periods are not approved by this hold report; inspect other source periods separately.',
        scope='Six observations in one retained filing; exact holds not implemented by this report. EPS and other periods are not withdrawn. Does not depend on completion of the ongoing 100-filing acquisition and does not admit a history or issuer.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Six exact source-level share scale conflicts; no replacement values')

if __name__ == '__main__':
    main()
