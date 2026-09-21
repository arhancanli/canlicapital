"""Preserve a reported EPS numerator conflict; do not approve or correct facts."""
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
    cik, accession = '0001084551', '0001683168-23-004574'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001084551-source.json.gz').read_bytes())
    assert sha(source) == '5fab08c580085db2f86339da631fa29af4e060f5c5ed620fbf63f167b42874e0'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2021-12-31', '2022-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '4541bcec3d5e1f55c716cdc1336b8168f18314d405f33fb5612149b8b2bd9646'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {32: {3:'2022 2021', 26:'Net Loss $ ( 10,821,237 ) $ ( 10,593,864 )', 29:'Unrealized gain (loss) on investments – ( 37,778,761 )', 31:'Total loss $ ( 10,821,237 ) $ ( 48,372,625 )', 35:'Weighted average shares outstanding, basic and diluted 49,368,370 25,935,749'}, 45: {1:'December 31, 2022 December 31, 2021', 3:'Net loss $ ( 10,821,237 ) $ ( 48,372,625 )', 9:'Basic $ ( 0.22 ) $ ( 1.87 )', 10:'Diluted $ ( 0.22 ) $ ( 1.87 )'}}
    for index, requirements in expected.items():
        trs = tables[index].find_all('tr')
        for row, text in requirements.items(): assert clean(trs[row]) == text
    assert 10593864 + 37778761 == 48372625
    eps = lambda loss: str((Decimal(-loss) / Decimal(25935749)).quantize(Decimal('.01')))
    assert eps(48372625) == '-1.87' and eps(10593864) == '-0.41'
    result = dict(schema='canli.community-numerator-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()),
        selected_observations=rows, comparison=comparison,
        tables=[dict(table_index=i, text=clean(tables[i]), verified_rows=req) for i,req in expected.items()],
        arithmetic=dict(main_net_loss=10593864, other_comprehensive_loss=37778761, eps_note_loss=48372625, shares=25935749, reported_eps=eps(48372625), main_net_loss_per_share=eps(10593864)),
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='The 2021 EPS note labels total loss including other comprehensive loss as net loss; its numerator differs from the main net-loss subtotal. Preserve both. Numerical matches do not resolve accounting scope.',
        scope='Eight observations remain pending. Arithmetic is diagnostic, not a corrected EPS value. No registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; 2021 numerator discrepancy remains pending')
if __name__ == '__main__': main()
