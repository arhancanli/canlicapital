"""Map fourteen retained legacy XML facts to exact annual statement columns."""
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
    cik, accession = '0001509646', '0001193125-12-245998'
    target_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    selected_targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/phoenix-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '872b3292fee11a15c36ea6ad00916e22c69389532d2a51bce4f679f0a396f23d'
    assert all(t['source_sha256'] == sha(source) for t in selected_targets)
    rows = [dict(r, tag=t['tag']) for t in selected_targets for r in t['latest_accession_observations']]
    assert len(rows) == 14
    receipt_raw = (A / 'corpus-local/phoenix-original-2011/0001509646-0001193125-12-189597-primary.receipt.json').read_bytes()
    receipt = json.loads(receipt_raw); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '8618fafbf7bcad4cadcadd0a35c37e6e5ed7cb409c15c3ec6d723f371ec72335'
    legacy_raw = (A / 'company-basic-diluted-batch1-legacy-review-v2-20260920.json').read_bytes()
    legacy = next(f for f in json.loads(legacy_raw)['filings'] if f['cik'] == cik and f['accession'] == accession)
    capture = legacy['instance_capture']; xml = (ROOT / capture['body_path']).read_bytes()
    assert capture['status'] == 200 and len(xml) == capture['bytes']
    assert sha(xml) == capture['sha256'] == '4e74826c13ce2687c4e4f8eaf27a205b893d456ef07bce5a532b5cc7e4a64c4b'
    helper_path = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    spec = importlib.util.spec_from_file_location('legacy', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    checks = helper.compare(xml, cik, rows)
    assert checks == legacy['checks'] and all(c['matched'] for c in checks)
    amendment_path = A / f'corpus-local/basic-diluted-batch1-filings/{cik}-{accession}-primary.receipt.json'
    amendment = json.loads(amendment_path.read_bytes())
    amendment_raw = (ROOT / amendment['body_path']).read_bytes()
    assert amendment['status'] == 200 and len(amendment_raw) == amendment['bytes'] and sha(amendment_raw) == amendment['sha256']
    amendment_text = clean(BeautifulSoup(amendment_raw, 'html.parser'))
    assert 'for the sole purpose of furnishing the Interactive Data File as Exhibit 101' in amendment_text
    assert 'No other changes have been made to the Annual Report.' in amendment_text
    assert 'April 27, 2012' in amendment_text
    assert 'American Depositary Shares, each representing eight Class A ordinary shares' in amendment_text
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    cells = [[clean(c) for c in tr.find_all(['td', 'th'], recursive=False)] for tr in tables[399].find_all('tr')]
    assert [cells[2][i] for i in [2,5,8,11]] == ['2009','2010','2011','2011']
    assert [cells[3][i] for i in [2,5,8,11]] == ['RMB','RMB','RMB','US$']
    labels = {'EarningsPerShareBasic': 'Basic net loss per Class A and Class B ordinary shares',
              'EarningsPerShareDiluted': 'Diluted net loss per Class A and Class B ordinary shares',
              'WeightedAverageNumberOfSharesOutstandingBasic': 'Weighted average number of Class A and Class B ordinary shares outstanding—basic and diluted',
              'WeightedAverageNumberOfDilutedSharesOutstanding': 'Weighted average number of Class A and Class B ordinary shares outstanding—basic and diluted'}
    mappings = []
    for row in rows:
        assert row['start'] == row['end'][:4] + '-01-01'
        column = {'2009-12-31':3, '2010-12-31':7, '2011-12-31':11}[row['end']]
        assert row['unit'] in ['shares','CNY/shares','USD/shares']
        if row['unit'] == 'USD/shares':
            assert row['end'] == '2011-12-31'; column = 15
        line = next(c for c in cells if c and c[0] == labels[row['tag']])
        value = line[column]; negative = value.startswith('(')
        if negative: assert line[column+1] == ')'
        number = float(value.replace(',', '').replace('(', '')) * (-1 if negative else 1)
        assert number == row['val']
        mappings.append(dict(selected=row, table_index=399, row_label=line[0], cell_index=column, reported_text=value + (')' if negative else '')))
    paragraphs = [clean(n) for n in soup.find_all('p') if n.find(['p', 'table']) is None]
    needles = ['using the two class method.', 'Dilutive ordinary equivalent shares are excluded in the denominator',
               'For the years ended December 31, 2009 and 2010, options to purchase ordinary shares',
               'US$1.00 = RMB6.2939']
    disclosures = []
    for needle in needles:
        found = [t for t in paragraphs if needle in t]; assert found, needle; disclosures.extend(found)
    assert 'Accretion to convertible redeemable preferred share redemption value' in clean(tables[399])
    assert 'Income allocation to participating preferred shares' in clean(tables[399])
    assert 'Amortization of beneficial conversion feature' in clean(tables[399])
    note = ('These 2009–2011 figures are ordinary-share measures from Phoenix New Media’s original 2011 annual report; the May 2012 amendment only furnished its XBRL file. Company-level net income differs from ordinary-shareholder loss after preferred-share redemption accretion, participating-preferred allocations and beneficial-conversion-feature amortization. The two-class method allocates income according to participation rights; the filing excludes anti-dilutive equivalents in these ordinary-share loss periods. The 2011 USD EPS is a convenience translation at RMB6.2939 per US dollar, not another reporting period. One ADS represented eight Class A ordinary shares in this filing; these figures remain per ordinary share with full share counts, without ADS conversion or currency relabeling.')
    result = dict(schema='canli.legacy-annual-context.v1', publication_approved=False, cik=cik,
                  target_sha256=sha(target_raw), source_sha256=sha(source), primary_capture=receipt,
                  receipt_sha256=sha(receipt_raw), amendment_capture=amendment, amendment_receipt_sha256=sha(amendment_path.read_bytes()),
                  legacy_report_sha256=sha(legacy_raw), instance_capture=capture,
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
                  selected_observations=rows, checks=checks, statement_mappings=mappings,
                  tables=[dict(table_index=i, text=clean(tables[i])) for i in [358,399]], disclosures=disclosures, reader_note=note,
                  disposition='REVIEWED_ALLOCATION_UNIT_AND_DILUTION_CONTEXT',
                  scope='Fourteen exact observations linked from amendment XML to original annual statement dates and currency columns. No whole-history, issuer or publication admission.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Fourteen Phoenix observations mapped to original annual statement')
if __name__ == '__main__':
    main()
