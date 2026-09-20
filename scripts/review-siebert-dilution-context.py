"""Retain conflicting statement/note denominators without inventing corrections."""
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
    target_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    targets = json.loads(target_raw)
    cik, accession = '0000065596', '0001213900-26-036500'
    receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
    receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '0070261cdb539be3f6698d0bbcaedc6ae74e85cac8677ffbb3643c434c256748'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/siebert-reviewed-source.json.gz').read_bytes())
    assert sha(source) == 'daeca46d576d2ff5c72e9a029274ce4aed4a696365902d8ba9560911d4b7ee50'
    rows = [dict(r, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession for r in t['latest_accession_observations']]
    assert len(rows) == 8
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compound', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    evidence = []
    for year, context, basic, increment, diluted, ids in [
        (2025, 'c0', 40362780, 314360, 40677140, ['ixv-18909', 'ixv-18911', 'ixv-18913']),
        (2024, 'c5', 39951510, 223170, 40174680, ['ixv-18910', 'ixv-18912', 'ixv-18914']),
    ]:
        nodes = [soup.find(id=i) for i in ids]
        assert all(n.find_parent('table') is tables[142] and n['contextref'] == context for n in nodes)
        assert [int(helper.numeric(n)) for n in nodes] == [basic, increment, diluted]
        assert all(helper.share_unit(soup.find(id=n['unitref'])) == 'shares' for n in nodes)
        assert basic + increment == diluted
        selected = next(r for r in rows if r['tag'] == 'WeightedAverageNumberOfDilutedSharesOutstanding' and r['end'] == f'{year}-12-31')
        assert selected['val'] == basic != diluted
        check = next(c for c in comparison['checks'] if c['selected'] == selected)
        assert all(soup.find(id=m['fact_id']).find_parent('table') is tables[96] for m in check['matches'])
        evidence.append(dict(year=year, selected_diluted=selected, note_basic=basic,
                             note_increment=increment, note_diluted=diluted,
                             note_inline_xml=[str(n) for n in nodes], context_xml=str(soup.find(id=context))))
    result = dict(schema='canli.siebert-dilution-context.v1', publication_approved=False,
                  target_sha256=sha(target_raw), source_sha256=sha(source), primary_capture=receipt,
                  receipt_sha256=sha(receipt_raw), code_sha256=sha(Path(__file__).read_bytes()),
                  helper_sha256=sha(helper_path.read_bytes()), selected_observations=rows,
                  comparison=comparison, conflicts=evidence,
                  tables=[dict(index=i, text=' '.join(tables[i].stripped_strings)) for i in [96, 142]],
                  disposition='TWO_SELECTED_DILUTED_SHARE_OBSERVATIONS_REQUIRE_HOLD',
                  reason='The main statement combines basic/diluted denominators, but Note19 separately adds unvested-share dilution and reports higher diluted totals for the same years. Note totals use an adjustment tag. Preserve both conflicting source presentations and withhold the two selected diluted-share observations; do not substitute note totals or infer that equal rounded EPS means equal denominators.',
                  scope='Two exact selected observations require holds. The other six batch observations are numerically reproduced but not newly scope-approved by this report. No other years, full-history admission, source correction or publication claim.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Two selected diluted denominators conflict with Note19; no replacement values')

if __name__ == '__main__':
    main()
