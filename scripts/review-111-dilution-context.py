"""Verify ordinary-share loss, dilution and currency scope for fourteen observations."""
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
    target_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    targets = json.loads(target_raw)
    cik, accn = '0001738906', '0001104659-26-052002'
    receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accn + '-primary.receipt.json')
    receipt = json.loads(receipt_path.read_bytes())
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '04ce1cf85c5ab5a76683b13913ff545e058143459430c2c3325fcec2953e959d'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/111-reviewed-source.json.gz').read_bytes())
    assert sha(source) == '6340f4e96f080d3e63322ef08a5cc9e213d2aad55c9e738fa433c56259567ea6'
    rows = [dict(row, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accn for row in t['latest_accession_observations']]
    assert len(rows) == 14
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compound', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser')
    tables = soup.find_all('table')
    statement, calculation = tables[217], tables[281]
    assert statement.find_previous('p').get_text(' ', strip=True) == '(Amounts in thousands, except for share and per share data)'
    assert 'ordinary shares-basic and diluted' in clean(calculation)
    assert '168,609,128' in clean(calculation) and '174,026,392' in clean(calculation)
    paragraphs = [clean(p) for p in soup.find_all('p')]
    dilution = [p for p in paragraphs if 'excluded from the calculation of diluted loss per share' in p]
    assert len(dilution) == 1 and '2023, 2024 and 2025' in dilution[0] and 'anti-dilutive' in dilution[0]
    translation = [p for p in paragraphs if 'calculated at the rate of 6.9931' in p]
    assert len(translation) == 1 and 'solely for the convenience' in translation[0]
    ads = [p for p in paragraphs if 'from each ADS representing two Class A ordinary shares to each ADS representing 20 Class A ordinary shares' in p]
    assert ads and 'January 24, 2025' in ads[0]
    for check in comparison['checks']:
        assert any(soup.find(id=m['fact_id']).find_parent('table') in [statement, calculation] for m in check['matches'])
    result = dict(schema='canli.111-dilution-context.v1', publication_approved=False,
        target_sha256=sha(target_raw), source_sha256=sha(source), primary_capture=receipt,
        receipt_sha256=sha(receipt_path.read_bytes()), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
        selected_observations=rows, comparison=comparison,
        primary_tables=[dict(zero_based_table_index=i, text=clean(tables[i])) for i in [217, 281]],
        scale_header=statement.find_previous('p').get_text(' ', strip=True),
        dilution_disclosure=dilution[0], translation_disclosure=translation[0], ads_ratio_disclosure=ads[0],
        disposition='FOURTEEN_OBSERVATIONS_SCOPE_REVIEWED_WITH_ORDINARY_SHARE_CONTEXT',
        conclusion='The annual statement and EPS calculation explicitly combine basic/diluted ordinary-share loss and denominators. Options and restricted share units are excluded because they would be anti-dilutive in the loss years. Share and per-share data are exempt from the thousands heading. The 2025 USD column is a disclosed convenience translation. These are ordinary-share measures, not ADS measures; retain currencies separately and do not apply the ADS ratio or a new conversion.',
        reader_value='Basic EPS describes loss attributable to each weighted-average ordinary share; diluted EPS applies potential-share rules. Their equality in loss periods does not make the definitions interchangeable. The explicit source-linked explanation prevents adding the denominators or mistaking ordinary-share EPS for ADS earnings.',
        scope='Fourteen exact observations in one filing reviewed for the stated equality, unit scale, currency presentation and ordinary-share context. No other periods, full issuer history, corpus admission or performance claim.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('14 observations scope-reviewed; ordinary shares, anti-dilution and convenience translation retained')

if __name__ == '__main__':
    main()
