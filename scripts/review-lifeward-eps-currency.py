"""Replay six historical ReWalk EPS currency conflicts; never convert values."""
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
def clean(node):
    return ' '.join(' '.join(node.stripped_strings).split())
def main():
    targets_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    targets = json.loads(targets_raw)
    cik, accession = '0001607962', '0001178913-24-000730'
    receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
    receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '2891960fabc5236814430ff3639d55f35c47c8757c68fd4048732d4c3d4a1381'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/lifeward-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012'
    selected = [dict(r, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik
                for r in t['latest_accession_observations'] if r['unit'] == 'ILS/shares']
    assert len(selected) == 6
    assert {r['tag'] for r in selected} == {'EarningsPerShareBasic', 'EarningsPerShareDiluted'}
    assert all(r['accn'] == accession and r['val'] == {'2021-12-31':-.27,'2022-12-31':-.31,'2023-12-31':-.37}[r['end']] for r in selected)
    assert all(t['source_sha256'] == sha(source) for t in targets['targets'] if t['cik'] == cik)
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('comparison', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, selected)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[151]
    headers = [clean(n) for n in table.find_all_previous(['p','div'], limit=7) if not n.find(['p','div','table'])]
    assert 'U.S. dollars in thousands (except share and per share data)' in headers
    assert 'REWALK ROBOTICS LTD. AND SUBSIDIARIES' in headers
    evidence = []
    for check in comparison['checks']:
        for match in check['matches']:
            node = soup.find(id=match['fact_id']); unit = soup.find(id=node['unitref'])
            assert node.find_parent('table') is table and node.get('scale') == '0'
            assert helper.share_unit(unit) == 'ILS/shares'
            evidence.append(dict(selected=check['selected'], fact_xml=str(node), unit_xml=str(unit), context_xml=str(soup.find(id=node['contextref']))))
    assert len(evidence) == 6
    result = dict(schema='canli.lifeward-eps-currency.v1', publication_approved=False,
        targets_sha256=sha(targets_raw), receipt_sha256=sha(receipt_raw), primary_capture=receipt,
        source_sha256=sha(source), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
        selected_observations=selected, comparison=comparison, inline_evidence=evidence,
        zero_based_table_index=151, statement_headers=headers, primary_table=clean(table),
        supporting_note_table=clean(soup.find_all('table')[274]),
        disposition='SIX_EXACT_EPS_OBSERVATIONS_REQUIRE_HOLD',
        reason='Historical ReWalk statement labels EPS in U.S. dollars, while six original inline EPS facts encode ILS per share. The source conflict is retained; no conversion, relabeling or replacement values.',
        scope='Only six exact 2021–2023 ILS/share observations in this capture. USD EPS, share counts and later filings remain outside this hold review; no issuer or publication approval.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Six exact historical EPS currency conflicts; no replacement values')
if __name__ == '__main__':
    main()
