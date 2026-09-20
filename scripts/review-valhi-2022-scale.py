"""Bind two selected 2022 share counts to the original statement's scale conflict."""
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
    targets_path = A / 'company-valhi-2022-targets-20260920.json'
    targets_raw = targets_path.read_bytes()
    targets = json.loads(targets_raw)
    cik, accession = '0000059255', '0001558370-25-002409'
    receipt_path = A / 'corpus-local/valhi-2022-filings' / (cik + '-' + accession + '-primary.receipt.json')
    receipt = json.loads(receipt_path.read_bytes())
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == 'c80b47c58940a1990e7864dc14f3cab1d8d58be1a4301abf0d52781cde5082f2'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/valhi-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '5a666016453d51aeb23f9f9129b08137b14135abcbd501441d79b5c477dd1f95'
    selected = [dict(row, tag=t['tag']) for t in targets['targets']
                if t['cik'] == cik and t['latest_selected_accession'] == accession and t['tag'].startswith('WeightedAverage')
                for row in t['latest_accession_observations']]
    assert len(selected) == 2 and {r['end'] for r in selected} == {'2022-12-31'}
    assert all(r['val'] == 28.5 and r['unit'] == 'shares' for r in selected)
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('share_comparison', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, selected)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser')
    table = soup.find_all('table')[251]
    header = table.find_previous('p').get_text(' ', strip=True)
    assert header == '(In millions, except per share data)'
    facts = []
    for check in comparison['checks']:
        for match in check['matches']:
            node = soup.find(id=match['fact_id'])
            assert node is not None and node.find_parent('table') is table
            assert node.get('scale') == '0' and helper.numeric(node) == 28.5
            unit = soup.find(id=node['unitref'])
            assert helper.share_unit(unit) == 'shares'
            facts.append(dict(fact_xml=str(node), unit_xml=str(unit), context_xml=str(soup.find(id=node['contextref']))))
    result = dict(schema='canli.valhi-2022-share-scale.v1', publication_approved=False,
        targets_sha256=sha(targets_raw), receipt_sha256=sha(receipt_path.read_bytes()), primary_capture=receipt,
        source_sha256=sha(source), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
        selected_observations=selected, comparison=comparison, inline_evidence=facts,
        zero_based_table_index=251, scale_header=header, primary_table=' '.join(' '.join(table.stripped_strings).split()),
        disposition='TWO_EXACT_2022_SHARE_OBSERVATIONS_REQUIRE_HOLD',
        reason='The original inline facts encode 28.5 with scale zero and unit shares. Their primary statement reports weighted-average shares under an in-millions heading. Numerical reproduction of the tags does not resolve this source-level scale conflict. Withhold the two exact observations rather than silently multiply them.',
        related_review='company-valhi-share-scale-20260920.json',
        scope='Two 2022 observations in one retained filing; exact holds not implemented by this report. EPS and other periods are not withdrawn. Does not depend on completion of the ongoing 100-filing acquisition and does not admit a history or issuer.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Two 2022 source-level share scale conflicts verified')

if __name__ == '__main__':
    main()
