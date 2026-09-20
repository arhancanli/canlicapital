"""Bind eight older Iovance share observations to four captured scale conflicts."""
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

CASES = [
    ('0001558370-22-001976', '2019-12-31', 124336, 133, '1a61f0ded2c2a650f3aa2a4e7ab3ac590029d135dffbd50d154e421170f2610b'),
    ('0001558370-23-002419', '2020-12-31', 138301, 152, 'c80d8b8eb65d1e641aaf180b7a351faf66627ecace0b2b33350c49409eaf71b4'),
    ('0001558370-24-002036', '2021-12-31', 153406, 163, '344e13cf1ab2a3107983c590b1f97a37520dde81a28b051e1a9485c9cc2fbffe'),
    ('0001558370-25-001834', '2022-12-31', 159259, 171, 'bcd2b5978779274737fc838a332e2fb0f11b3fc98ee134da4b33b32a28a6cc11'),
]

def main():
    targets_raw = (A / 'company-iovance-older-share-targets-20260921.json').read_bytes()
    targets = json.loads(targets_raw)['targets']
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/iovance-reviewed-source.json.gz').read_bytes())
    assert sha(source) == 'bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680'
    assert len(targets) == 8 and all(t['source_sha256'] == sha(source) and t['cik'] == '0001425205' for t in targets)
    source_facts = json.loads(source)['facts']['us-gaap']
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('comparison', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    filings = []
    for accession, end, value, table_index, primary_hash in CASES:
        receipt_path = A / f'corpus-local/iovance-older-share-filings/0001425205-{accession}-primary.receipt.json'
        receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256'] == primary_hash
        rows = [dict(r, tag=t['tag']) for t in targets if t['latest_selected_accession'] == accession for r in t['latest_accession_observations']]
        assert len(rows) == 2 and {r['tag'] for r in rows} == {'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'}
        for row in rows:
            assert row['end'] == end and row['start'] == end[:4] + '-01-01' and row['val'] == value and row['unit'] == 'shares' and row['accn'] == accession
            original = {k:v for k,v in row.items() if k not in ['tag', 'unit']}
            assert original in source_facts[row['tag']]['units']['shares']
        comparison = helper.compare(raw, '0001425205', rows)
        assert all(c['matched'] for c in comparison['checks'])
        soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[table_index]
        headers = [clean(n) for n in table.find_all_previous('p', limit=4)]
        assert '(In thousands, except per share information)' in headers
        assert 'Consolidated Statements of Operations' in headers
        lines = [clean(tr) for tr in table.find_all('tr')]
        line = next(t for t in lines if 'Weighted Average Shares of Common Stock Outstanding, Basic and Diluted' in t)
        assert f'{value:,}' in line
        facts = []
        for check in comparison['checks']:
            for match in check['matches']:
                node = soup.find(id=match['fact_id']); unit = soup.find(id=node['unitref'])
                assert node.get('scale', '0') == '0' and helper.numeric(node) == value and helper.share_unit(unit) == 'shares'
                hidden = check['selected']['tag'] == 'WeightedAverageNumberOfDilutedSharesOutstanding' and end != '2022-12-31'
                if hidden:
                    assert node.find_parent('ix:hidden') is not None
                else:
                    assert node.find_parent('table') is table
                facts.append(dict(selected=check['selected'], hidden=hidden, fact_xml=str(node), unit_xml=str(unit), context_xml=str(soup.find(id=node['contextref']))))
        assert len(facts) == 2
        filings.append(dict(primary_capture=receipt, receipt_sha256=sha(receipt_raw), selected_observations=rows,
                            comparison=comparison, inline_evidence=facts, table_index=table_index,
                            statement_headers=headers, statement_row=line, table_text=clean(table)))
    result = dict(schema='canli.iovance-older-share-scale.v1', publication_approved=False,
                  target_sha256=sha(targets_raw), source_sha256=sha(source),
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()), filings=filings,
                  disposition='EIGHT_EXACT_SHARE_OBSERVATIONS_REQUIRE_HOLD',
                  scope='Eight 2019–2022 observations in four captured filings. Scale-zero shares conflict with in-thousands headings; earlier diluted facts are hidden and mapped to the combined statement row. No replacement scaling or EPS changes.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Eight older Iovance share scale conflicts reproduced')

if __name__ == '__main__':
    main()
