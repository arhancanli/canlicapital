"""Preserve a reported EPS-note unit conflict; do not approve or correct facts."""
import gzip
import hashlib
import importlib.util
import json
from decimal import Decimal
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
sha = lambda b: hashlib.sha256(b).hexdigest()
clean = lambda n: ' '.join(' '.join(n.stripped_strings).split())

def main():
    cik, accession = '0001162283', '0001140361-23-015466'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001162283-source.json.gz').read_bytes())
    assert sha(source) == '1fb33f5447a67decb08b16ac3f5225a8f8d7897a29b88db8cb03e6a9900c07fe'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2021-12-31', '2022-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '762daf6282980ab686913c960f47338e1e643a8b6ce76dd1bd89cac240389892'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {22: {1:'2022 2021', 17:'Net loss $ ( 949,191 ) $ ( 1,571,060 )', 24:'Basic 600,090 600,090', 25:'Diluted 600,090 600,090', 27:'Actual shares outstanding 600,090 600,090'}, 35: {1:'2022 2021', 3:'Net loss attributable to shareholders $ ( 949,191 ) $ ( 1,571,060 )', 4:'Weighted average shares outstanding 600,090 600,090', 6:'Basic net loss attributable per share $ ( 1.58 ) $ ( 2.62 )', 10:'Weighted average share outstanding 600,090 600,090', 12:'Diluted net loss per share $ ( 1.58 ) $ ( 2.62 )'}}
    for index, requirements in expected.items():
        trs = tables[index].find_all('tr')
        for row, text in requirements.items(): assert clean(trs[row]) == text
    blocks = [clean(p) for p in soup.find_all(['p','div']) if p.find(['p','div']) is None]
    needles = ['The computations of basic and diluted net loss per share are as follows (in thousands, except per share data):', 'There were no dilutive shares outstanding during the years.', 'On June 10, 2020, the Company completed a 1 -for-100 reverse stock split']
    disclosures = []
    for needle in needles:
        matches = [text for text in blocks if needle in text]; assert matches, needle
        disclosures.append(min(matches, key=len))
    shares = []
    for index in [22,35]:
        for node in tables[index].find_all(attrs={'name':'us-gaap:WeightedAverageNumberOfSharesOutstandingBasic'}):
            assert node.get('scale','0') == '0' and helper.numeric(node) == 600090
            assert helper.share_unit(soup.find(id=node['unitref'])) == 'shares'
            shares.append(dict(table_index=index, fact_xml=str(node), context_xml=str(soup.find(id=node['contextref']))))
    assert len(shares) == 4
    eps = lambda loss, scale: str((Decimal(-loss * scale) / Decimal(600090 * scale)).quantize(Decimal('.01')))
    assert eps(949191,1) == eps(949191,1000) == '-1.58'
    assert eps(1571060,1) == eps(1571060,1000) == '-2.62'
    result = dict(schema='canli.morgan-unit-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()),
        selected_observations=rows, comparison=comparison,
        tables=[dict(table_index=i, text=clean(tables[i]), verified_rows=req) for i,req in expected.items()],
        disclosures=disclosures, share_tag_evidence=shares,
        arithmetic=dict(full_dollars_full_shares_eps=[eps(949191,1),eps(1571060,1)],
                        both_scaled_by_1000_eps=[eps(949191,1000),eps(1571060,1000)],
                        limitation='Equal EPS ratios do not resolve a common numerator/denominator unit multiplier.'),
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='The EPS-note introduction says in thousands except per-share data, while its full displayed losses and scale-zero share counts repeat the main statement. The capital note reports 600,090 shares after the retrospective one-for-100 split. Preserve the contradictory heading; do not multiply or silently repair values.',
        scope='Eight observations remain pending. Ratio arithmetic cannot settle unit scaling. No registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; EPS-note unit discrepancy remains pending')
if __name__ == '__main__': main()
