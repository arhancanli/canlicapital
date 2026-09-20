"""Preserve vested-share EPS allocation and its distinction from FFO shares."""
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
    cik, accession = '0000761648', '0000950170-23-005812'
    receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
    receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == 'a89f10d3141d04033a984d2faa460b752b00ba58803a51c2386c905c9d67186e'
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/cedar-reviewed-source.json.gz').read_bytes())
    assert sha(source) == 'dbcce42a16a42a13e297263e7e6f4477ce22ddf0a881b5df29c7b785e0ed456f'
    rows = [dict(r, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2020-12-31', '2021-12-31'}
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compound', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[44]
    paragraphs = [clean(n) for n in soup.find_all(['p', 'div']) if n.find(['p', 'div']) is None]
    needles = ['Unvested restricted shares that are participating securities are not allocated net losses',
               'no restricted stock units would have been issuable',
               'award had no impact in calculating diluted EPS',
               'used to compute FFO and Operating FFO applicable to diluted common shares includes OP Units']
    disclosures = []
    for needle in needles:
        found = [p for p in paragraphs if needle in p]
        assert len(found) == 1
        disclosures.append(found[0])
    text = clean(table)
    assert 'Net income (loss) attributable to vested common shares' in text
    assert '55,968,000' in text and '12,062,000' in text
    assert 'Weighted average number of vested common shares outstanding, basic and diluted' in text
    facts = []
    for check in comparison['checks']:
        matches = [soup.find(id=m['fact_id']) for m in check['matches']]
        main = [n for n in matches if n.find_parent('table') is table]
        assert main
        for node in main:
            assert node.get('scale', '0') == '0'
            facts.append(dict(selected=check['selected'], fact_xml=str(node)))
    result = dict(schema='canli.cedar-participating-shares.v1', publication_approved=False,
                  target_sha256=sha(target_raw), source_sha256=sha(source), primary_capture=receipt,
                  receipt_sha256=sha(receipt_raw), code_sha256=sha(Path(__file__).read_bytes()),
                  helper_sha256=sha(helper_path.read_bytes()), selected_observations=rows,
                  comparison=comparison, inline_evidence=facts, table_index=44, table_text=text,
                  disclosures=disclosures, disposition='EIGHT_OBSERVATIONS_REVIEWED_WITH_VESTED_SHARE_CONTEXT',
                  reader_note='For the selected 2020–2021 figures, Cedar’s EPS reconciliation uses income or loss allocated to vested common shares after participating-share adjustments. The EPS numerator therefore differs from total income or loss attributable to common shareholders. The filing reports no issuable units under the specified performance award at the measurement dates and excludes operating-partnership units and their related numerator amounts because including them would have no dilutive effect. Its FFO diluted share count includes items excluded from EPS; these denominators are not interchangeable. The reported basic and diluted EPS values and vested-share counts are retained without substituting FFO shares.',
                  scope='Eight selected 2020/2021 observations only. The same table also presents 2022, which is not part of these selected observations. Later filings and the whole issuer history are not approved by this report.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Eight observations reviewed for vested-share allocation and FFO distinction')

if __name__ == '__main__':
    main()
