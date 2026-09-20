"""Map twelve retained legacy XML facts to exact annual statement columns."""
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
    cik, accession = '0001470129', '0001013762-12-002250'
    target_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    selected_targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/china-bilingual-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '01950acba447b82b7b44f1f15b43d38d4d36d713a72efbec54a89ccef55fa5ab'
    assert all(t['source_sha256'] == sha(source) for t in selected_targets)
    rows = [dict(r, tag=t['tag']) for t in selected_targets for r in t['latest_accession_observations']]
    assert len(rows) == 12
    receipt_raw = (A / f'corpus-local/basic-diluted-batch1-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(receipt_raw); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '2ea771cd0647a8615beda8fe52a5d8f763ebf3de1c471f551aa1ae83e98b04bb'
    legacy_raw = (A / 'company-basic-diluted-batch1-legacy-review-v2-20260920.json').read_bytes()
    legacy = next(f for f in json.loads(legacy_raw)['filings'] if f['cik'] == cik and f['accession'] == accession)
    capture = legacy['instance_capture']; xml = (ROOT / capture['body_path']).read_bytes()
    assert capture['status'] == 200 and len(xml) == capture['bytes']
    assert sha(xml) == capture['sha256'] == '4adb2617afe20aaf77ff805dc860d7c0567b943cf576ba73cfe567276939fe3c'
    helper_path = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    spec = importlib.util.spec_from_file_location('legacy', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    checks = helper.compare(xml, cik, rows)
    assert checks == legacy['checks'] and all(c['matched'] for c in checks)
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    assert 'China Bilingual Technology & Education Group Inc.' in clean(soup)
    table_rows = {i: [[clean(c) for c in tr.find_all(['td', 'th'], recursive=False)] for tr in tables[i].find_all('tr')] for i in [72, 73]}
    assert table_rows[72][0][2] == 'For The Years Ended August 31,'
    assert table_rows[72][1][2:6:3] == ['2012', '2011']
    assert table_rows[73][1][2] == 'For The Eight Months Ended August 31, 2011'
    assert table_rows[73][1][5] == 'For The Year Ended December 31, 2010'
    labels = {'EarningsPerShareBasic': 'Basic', 'EarningsPerShareDiluted': 'Diluted',
              'WeightedAverageNumberOfSharesOutstandingBasic': 'Basic weighted average outstanding shares of common stock',
              'WeightedAverageNumberOfDilutedSharesOutstanding': 'Diluted weighted average common stock and stock equivalents'}
    periods = {'2010-12-31': ('2010-01-01', 73, 7), '2011-08-31': ('2010-09-01', 72, 7), '2012-08-31': ('2011-09-01', 72, 3)}
    mappings = []
    for row in rows:
        start, table_index, column = periods[row['end']]
        assert row['start'] == start
        cells = next(cells for cells in table_rows[table_index] if cells[0] == labels[row['tag']])
        value = cells[column]
        assert float(value.replace(',', '')) == row['val']
        mappings.append(dict(selected=row, table_index=table_index, row_label=cells[0], cell_index=column, reported_text=value))
    assert next(c for c in table_rows[73] if c[0] == 'Basic')[3] == '0.31'
    assert next(c for c in table_rows[73] if c[0] == labels['WeightedAverageNumberOfSharesOutstandingBasic'])[3] == '30,008,014'
    note = ('These 2010–2012 figures come from China Bilingual Technology & Education Group Inc., the historical issuer in this filing, rather than current VisitIQ operations. The selected annual periods end December 31, 2010 and August 31, 2011 and 2012. The separate eight-month 2011 column is not selected: its EPS is $0.31 rather than the annual $0.45, and its denominator differs. Original XML periods and statement columns are retained without annualizing or relabeling dates. The tables report equal basic and diluted figures, but this review does not establish the cause of equality for these profitable periods; the filing’s generic loss-period policy does not prove that cause.')
    result = dict(schema='canli.legacy-annual-context.v1', publication_approved=False, cik=cik,
                  target_sha256=sha(target_raw), source_sha256=sha(source), primary_capture=receipt,
                  receipt_sha256=sha(receipt_raw), legacy_report_sha256=sha(legacy_raw), instance_capture=capture,
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
                  selected_observations=rows, checks=checks, statement_mappings=mappings,
                  tables=[dict(table_index=i, text=clean(tables[i])) for i in [72, 73]], reader_note=note,
                  disposition='REVIEWED_REPORTED_PRESENTATION_CAUSE_NOT_ESTABLISHED',
                  scope='Twelve exact annual observations. Historical issuer and annual/transition columns mapped; cause of equal dilution measures remains unestablished. No whole-history or publication admission.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Twelve legacy annual observations mapped; presentation-only review')
if __name__ == '__main__':
    main()
