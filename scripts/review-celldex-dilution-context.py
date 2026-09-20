"""Verify the loss-period dilution explanation and tagged share scale."""
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
    cik, accession = '0000744218', '0001104659-26-019652'
    receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
    receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == 'ec5aa025633326731a3d8240ce9532d193e53ab35e3066d5326af8cdfb696f59'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/celldex-reviewed-source.json.gz').read_bytes())
    assert sha(source) == 'a253f724b1319f3eeec0fb678b43576159c8fa993fc97e4268adfafa9963e2f2'
    rows = [dict(r, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession for r in t['latest_accession_observations']]
    assert len(rows) == 12 and {r['end'] for r in rows} == {'2023-12-31', '2024-12-31', '2025-12-31'}
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compound', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[310]
    paragraphs = [clean(p) for p in soup.find_all('p')]
    disclosure = [p for p in paragraphs if 'excluding restricted stock that has been issued but is not yet vested' in p and 'their effect is anti-dilutive' in p]
    assert len(disclosure) == 1
    assert '(In thousands, except per share amounts)' in paragraphs
    assert 'Shares used in calculating basic and diluted net loss per share' in clean(table)
    facts = []
    for check in comparison['checks']:
        for match in check['matches']:
            node = soup.find(id=match['fact_id'])
            assert node.find_parent('table') is table
            expected_scale = '3' if check['selected']['unit'] == 'shares' else '0'
            assert node.get('scale') == expected_scale
            facts.append(dict(selected=check['selected'], fact_xml=str(node)))
    result = dict(schema='canli.celldex-dilution-context.v1', publication_approved=False,
                  target_sha256=sha(target_raw), source_sha256=sha(source), primary_capture=receipt,
                  receipt_sha256=sha(receipt_raw), code_sha256=sha(Path(__file__).read_bytes()),
                  helper_sha256=sha(helper_path.read_bytes()), selected_observations=rows,
                  comparison=comparison, inline_evidence=facts, table_index=310, table_text=clean(table),
                  dilution_disclosure=disclosure[0],
                  disposition='TWELVE_OBSERVATIONS_SCOPE_REVIEWED_WITH_LOSS_PERIOD_CONTEXT',
                  conclusion='For the three loss years, the filing explicitly excludes potential dilution because its effect would be anti-dilutive. Basic shares exclude issued unvested restricted stock. Statement denominators are presented in thousands and correctly tagged with scale3; per-share amounts use scale0. Preserve the tagged share counts and distinct basic/diluted definitions without adding denominators or inventing adjustments.',
                  scope='Twelve exact observations only; no whole-history, issuer or corpus admission. Earlier periods remain outside this review.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('12 observations scope-reviewed; loss-period dilution and scale verified')

if __name__ == '__main__':
    main()
