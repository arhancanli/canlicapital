"""Preserve Wright's statement heading/tag discrepancy without approving scope."""
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
    cik, accession = '0001279715', '0001214659-26-003984'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001279715-source.json.gz').read_bytes())
    assert sha(source) == 'ee0c0eb0f85e832cb83bcd5b64ee06137a9cb9db91501e2e9266582607370780'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '8b04695d419eb76223cc8b124e4b17ab25ccce9f2bf6730943c11e1c18f7a56e'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table'); statement = tables[54]
    expected = {1:'2025 2024', 9:'Net loss $ ( 1,024 ) $ ( 920 )', 12:'Basic and diluted weighted average common shares outstanding 20,620,711 20,620,711', 14:'Basic and diluted loss per share $ ( 0.05 ) $ ( 0.04 )'}
    for index, text in expected.items(): assert clean(statement.find_all('tr')[index]) == text
    headings = [p for p in statement.find_all_previous('p', limit=4) if clean(p)]
    assert clean(headings[0]) == '(in thousands, except per share amounts)'
    assert clean(headings[1]) == 'CONSOLIDATED STATEMENTS OF OPERATIONS'
    balance = clean(tables[51])
    assert 'issued 21,628,680 as of December 31, 2025 and 2024; outstanding 20,620,711 as of December 31, 2025 and 2024.' in balance
    assert '1,007,969 shares at December 31, 2025 and 2024' in balance
    facts = []
    for check in comparison['checks']:
        nodes = [soup.find(id=m['fact_id']) for m in check['matches']]
        nodes = [n for n in nodes if n.find_parent('table') is statement]
        assert len(nodes) == 1
        node = nodes[0]; assert node.get('scale', '0') == '0'
        facts.append(dict(selected=check['selected'], fact_xml=str(node), context_xml=str(soup.find(id=node['contextref'])), unit_xml=str(soup.find(id=node['unitref']))))
    losses = statement.find_all('tr')[9].find_all(attrs={'name':'us-gaap:NetIncomeLoss'})
    assert len(losses) == 2
    for node, value, end in zip(losses, [-1024000, -920000], ['2025-12-31','2024-12-31']):
        assert node.get('scale') == '3' and helper.numeric(node) == value
        context = soup.find(id=node['contextref'])
        assert helper.field(context, 'enddate') == end
        unit = soup.find(id=node['unitref'])
        measure = unit.find(lambda n: helper.local(n) == 'measure')
        assert helper.qname(measure, measure.get_text(strip=True)) == ('http://www.xbrl.org/2003/iso4217','USD')
    eps = lambda loss, shares: str((-Decimal(loss) / Decimal(shares)).quantize(Decimal('.01')))
    diagnostics = [dict(year=year, tagged_dollar_loss=loss, full_share_eps=eps(loss,20620711), hypothetical_thousand_share_eps=eps(loss,20620711000)) for year,loss in [(2025,1024000),(2024,920000)]]
    assert [d['full_share_eps'] for d in diagnostics] == ['-0.05','-0.04']
    result = dict(schema='canli.wright-unit-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()),
        selected_observations=rows, comparison=comparison,
        statement=dict(table_index=54,text=clean(statement),verified_rows=expected,heading_xml=[str(n) for n in headings]),
        balance_sheet=dict(table_index=51,text=balance), inline_evidence=facts,
        loss_tag_evidence=[str(n) for n in losses],
        arithmetic=dict(diagnostics=diagnostics, limitation='Diagnostic ratios only, not corrected EPS or authority to override the statement heading. Period-end outstanding shares do not by themselves prove weighted-average scope.'),
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='Statement heading says thousands except per-share amounts, while basic/diluted denominator tags use scale zero and 20,620,711 shares. The balance sheet separately reports that full count outstanding; preserve the conflicting heading rather than multiply or silently repair values.',
        scope='Eight observations remain pending. No review registration, policy hold, source replacement or publication approval; no assertion of a specific dilution cause.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; statement unit discrepancy remains pending')
if __name__ == '__main__': main()
