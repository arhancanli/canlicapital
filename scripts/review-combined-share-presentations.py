"""Review exact combined presentations; do not infer the cause of equal measures."""
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
    for cik, accession, fixture, source_hash, primary_hash, table_index, share_scale in [
        ('0000072162', '0001104659-26-025290', 'nli', '28b0b0090a378fdf742b736e25f9789e5ea69cafb90cc6044856d79b60a3f3f2', 'd086270442716e2748292cd769d69456e29830d0fc37695997cf39d9216d6659', 210, '3'),
        ('0000105418', '0000105418-26-000024', 'weis', '541b42abf646b70212a5be69c275c73b3409f259041c76d97babc5aec2a84049', '9f6620f382da720f6da80626146b66a7e05ed581ebda76471dc26e258e17f884', 39, '0'),
    ]:
        receipt_path = A / 'corpus-local/basic-diluted-batch1-filings' / (cik + '-' + accession + '-primary.receipt.json')
        receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes']
        assert sha(raw) == receipt['sha256'] == primary_hash
        source = gzip.decompress((ROOT / f'scripts/fixtures/editorial/{fixture}-reviewed-source.json.gz').read_bytes())
        assert sha(source) == source_hash
        rows = [dict(r, tag=t['tag']) for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession for r in t['latest_accession_observations']]
        assert len(rows) == 12
        assert all(t['source_sha256'] == source_hash for t in targets['targets'] if t['cik'] == cik)
        comparison = helper.compare(raw, cik, rows)
        assert all(c['matched'] for c in comparison['checks'])
        soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table'); table = tables[table_index]
        table_text = clean(table)
        assert 'Basic and diluted' in table_text
        facts = []
        for check in comparison['checks']:
            matches = [soup.find(id=m['fact_id']) for m in check['matches']]
            main = [n for n in matches if n.find_parent('table') is table]
            assert main
            for node in main:
                assert node.get('scale') == (share_scale if check['selected']['unit'] == 'shares' else '0')
                facts.append(dict(selected=check['selected'], fact_xml=str(node)))
        if fixture == 'nli':
            assert '(In thousands, except per share data)' in [clean(p) for p in soup.find_all('p')]
            extra = []
            note = 'For 2023–2025, the filing identifies the issuer as NL Industries and presents combined basic and diluted earnings per share with a shared weighted-average share row. The share figures are presented in thousands and tagged with scale three; these pages retain the encoded counts in shares. Per-share amounts are not scaled by thousands. This presentation supports the reported equality but does not establish why the measures match or that no potentially dilutive securities exist. Basic and diluted measures retain distinct definitions; do not add their denominators.'
        else:
            assert '(amounts in thousands, except shares and per share amounts)' in table_text
            assert '(As restated)' in table_text and 'Weighted-average shares outstanding, basic and diluted' in table_text
            extra = [dict(table_index=i, text=clean(tables[i])) for i in [81, 82]]
            assert 'As Restated' in extra[0]['text'] and '$ 3.94' in extra[0]['text']
            assert 'As Restated' in extra[1]['text'] and '$ 3.75' in extra[1]['text']
            note = 'For fiscal 2023–2025, Weis reports combined basic and diluted earnings per share and weighted-average shares. The 2023 and 2024 EPS figures are explicitly restated in the 2025 filing; they are not the originally reported figures. The fiscal years end on December 30, 2023, December 28, 2024 and December 27, 2025. Shares and per-share amounts are exempt from the statement’s thousands heading. This combined presentation does not establish the reason for equal basic and diluted measures or prove that no potentially dilutive securities exist. Their matching denominators should not be added.'
        decisions.append(dict(cik=cik, source_sha256=source_hash, primary_capture=receipt,
                              receipt_sha256=sha(receipt_raw), selected_observations=rows,
                              comparison=comparison, inline_evidence=facts, table_index=table_index,
                              table_text=table_text, supplemental_tables=extra, reader_note=note,
                              disposition='TWELVE_OBSERVATIONS_REVIEWED_FOR_REPORTED_PRESENTATION'))
    result = dict(schema='canli.combined-share-presentations.v1', publication_approved=False,
                  target_sha256=sha(target_raw), code_sha256=sha(Path(__file__).read_bytes()),
                  helper_sha256=sha(helper_path.read_bytes()), decisions=decisions,
                  scope='Twenty-four exact observations reviewed for combined presentation, units, periods and restatement context. No causal dilution conclusion, whole-history or corpus admission. Earlier periods remain outside review.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('24 observations presentation-reviewed; dilution cause explicitly unresolved')

if __name__ == '__main__':
    main()
