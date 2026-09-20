"""Verify two distinct loss/share presentations against captured primary filings."""
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
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compound', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    decisions = []
    for cik, accession, fixture, source_hash, primary_hash, table_index in [
        ('0000793306', '0001437749-26-010712', 'blue-dolphin', '62bd673fa03d384983bd2b9418eca01527fc4af9e2ecb90b946269d9e7f2ae73', '3540b2b778feeca3bd3a4c8d8db207b56917345c579f5d2fc89eff6e705cccad', 155),
        ('0000795800', '0001493152-26-022760', 'nexmetals', '722c25e7b472598d160c9e6ac435f0113c0fff6d40969bba02a2231656f9b0c2', '58ca0b504030432531c0f4688e5bb431aab83bd3f6da3604049fafc1bf496977', 22),
    ]:
        receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
        receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes']
        assert sha(raw) == receipt['sha256'] == primary_hash
        source = gzip.decompress((ROOT / f'scripts/fixtures/editorial/{fixture}-reviewed-source.json.gz').read_bytes())
        assert sha(source) == source_hash
        rows = [dict(r, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession for r in t['latest_accession_observations']]
        assert len(rows) == 8
        assert all(t['source_sha256'] == source_hash for t in targets['targets'] if t['cik'] == cik)
        comparison = helper.compare(raw, cik, rows)
        assert all(c['matched'] for c in comparison['checks'])
        soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[table_index]
        table_text = clean(table)
        paragraphs = [clean(p) for p in soup.find_all('p')]
        facts = []
        for check in comparison['checks']:
            main = [soup.find(id=m['fact_id']) for m in check['matches'] if soup.find(id=m['fact_id']).find_parent('table') is table]
            assert main
            for node in main:
                assert node.get('scale', '0') == '0'
                facts.append(dict(selected=check['selected'], fact_xml=str(node)))
        if fixture == 'blue-dolphin':
            assert '(in thousands, except share and per-share amounts)' in table_text
            disclosure = [p for p in paragraphs if 'We do not currently have issued options, warrants, or similar instruments.' in p]
            assert len(disclosure) == 1 and 'if anti-dilutive' in disclosure[0]
            assert all(r['val'] < 0 for r in rows if r['tag'].startswith('EarningsPerShare'))
            note = 'For 2024–2025, Blue Dolphin reports equal basic and diluted loss per share and share counts. In this filing it states that it does not currently have issued options, warrants or similar instruments and describes excluding convertible shares when anti-dilutive. That disclosure is historical, not a claim about securities outstanding today. Shares and per-share amounts are exempt from the statement’s thousands heading. Basic and diluted measures retain distinct definitions; do not add their matching denominators.'
        else:
            disclosure = [p for p in paragraphs if 'anti-dilutive given the Company’s ongoing net loss position' in p or 'All information respecting outstanding Common Shares' in p or 'twenty (20) pre-consolidated shares for every one (1)' in p]
            assert len(disclosure) == 3
            assert '(Expressed in Canadian dollars)' in paragraphs
            assert 'Basic and diluted loss per share' in table_text
            eps = [r for r in rows if r['tag'].startswith('EarningsPerShare')]
            assert all(r['unit'] == 'CAD/shares' and r['val'] in [5.02, 2.86] for r in eps)
            note = 'For 2024–2025, NexMetals presents positive amounts labelled loss per share in Canadian dollars: 5.02 and 2.86, respectively. These are reported loss magnitudes, not profits; the original signs and units are retained here. Options, restricted share units and warrants are excluded from diluted loss per share because they would be anti-dilutive in the loss position. The filing applies the June 20, 2025 twenty-for-one share consolidation to both current and comparative share and loss-per-share information. No additional share-consolidation adjustment, sign change or currency conversion has been applied.'
        decisions.append(dict(cik=cik, source_sha256=source_hash, primary_capture=receipt,
                              receipt_sha256=sha(receipt_raw), selected_observations=rows,
                              comparison=comparison, inline_evidence=facts, table_index=table_index,
                              table_text=table_text, disclosures=disclosure, reader_note=note,
                              disposition='EIGHT_OBSERVATIONS_REVIEWED_WITH_LOSS_SHARE_CONTEXT'))
    result = dict(schema='canli.loss-share-presentations.v1', publication_approved=False,
                  target_sha256=sha(target_raw), code_sha256=sha(Path(__file__).read_bytes()),
                  helper_sha256=sha(helper_path.read_bytes()), decisions=decisions,
                  scope='Sixteen exact observations only. Original signs, units and split-adjusted presentation preserved. No current securities claim, earlier-period approval, whole-history or corpus admission.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('16 observations reviewed for distinct loss/share conventions')

if __name__ == '__main__':
    main()
