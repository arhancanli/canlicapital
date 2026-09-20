"""Retain exact Theriva statement/narrative discrepancies without changing facts."""
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
sha = lambda raw: hashlib.sha256(raw).hexdigest()
clean = lambda node: ' '.join(' '.join(node.stripped_strings).split())


def main():
    cik, accession = '0000894158', '0001104659-26-026767'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/theriva-batch2-source.json.gz').read_bytes())
    assert sha(source) == '0de75e0c14bf762eac1125a82293caea25684675d03e66311f5d17f900dbb0a7'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(o, tag=t['tag']) for t in targets for o in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    receipt_raw = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(receipt_raw)
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == 'e23bec0fd4ec8a53f1d8f3e62167b8ecbcbb1c71653d6a5a9235a40cad7ef0d1'
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('comparison', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser')
    table = soup.find_all('table')[232]
    headings = [clean(p) for p in table.find_all_previous('p', limit=6)]
    assert '(In thousands, except share and per share amounts)' in headings
    cells = [[clean(c) for c in tr.find_all(['td', 'th'], recursive=False)] for tr in table.find_all('tr')]
    assert cells[3][2] == '2025' and cells[3][4] == '2024'
    for index, label, value in [(19, 'Net loss', '( 23,739 )'), (21, 'Less deemed dividend from warrant inducement', '( 1,510 )'), (23, 'Net Loss Attributable to Common Stockholders', '( 25,249 )')]:
        assert cells[index][0] == label and cells[index][3] == value
    assert cells[27][3] == '12,140,697' and cells[27][6] == '1,348,126'
    blocks = [clean(n) for n in soup.find_all(['p', 'div', 'td', 'span']) if n.find(['p', 'div', 'td']) is None]
    needles = [
        'Net loss attributable to common stockholders for the years ended December 31, 2025 and 2024 was $ 23.7 million and $ 25.7 million',
        'On October 26, 2024, we effected a one for twenty-five reverse stock split',
        'The Reverse Stock Split went effective on August 26, 2024',
        'All affected share amounts and exercise/conversion prices in the consolidated financial statements and footnotes below have been adjusted retroactively',
        'because their effect is anti-dilutive',
    ]
    disclosures = []
    for needle in needles:
        found = [text for text in blocks if needle in text]
        assert found, needle
        disclosures.append({'required_text': needle, 'paragraph': found[0]})
    statement_eps = (Decimal('-25249000') / Decimal('12140697')).quantize(Decimal('.01'))
    before_dividend_eps = (Decimal('-23739000') / Decimal('12140697')).quantize(Decimal('.01'))
    assert statement_eps == Decimal('-2.08') and before_dividend_eps == Decimal('-1.96')
    result = dict(schema='canli.theriva-filing-discrepancies.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw),
        receipt_sha256=sha(receipt_raw), primary_capture=receipt,
        code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
        selected_observations=rows, comparison=comparison,
        statement=dict(table_index=232, headings=headings, text=clean(table)), disclosures=disclosures,
        arithmetic_check=dict(statement_common_loss_usd=-25249000, net_loss_before_deemed_dividend_usd=-23739000,
            deemed_dividend_usd=1510000, weighted_shares=12140697,
            statement_common_loss_per_share=str(statement_eps), before_deemed_dividend_per_share=str(before_dividend_eps)),
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        findings=['Eight selected facts match the main statement. The per-share narrative labels 2025 common-stockholder loss as $23.7 million, while the statement distinguishes $23.739 million net loss from $25.249 million loss attributable to common stockholders after a $1.510 million deemed dividend.',
                  'One passage dates the one-for-25 reverse split October 26, 2024; the corporate history and stock note use August 26, 2024. Dates remain conflicting; no silent correction.',
                  'The filing states retroactive share adjustment and excludes options/warrants as anti-dilutive. Numerical matching alone does not resolve the narrative discrepancies.'],
        scope='Exactly eight batch2 observations from one filing. Pending accounting-context decision; not a new policy hold or approved history. No source replacement, restatement, publication, or indexing claim.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Eight numeric matches; numerator and split-date narrative discrepancies retained as pending')


if __name__ == '__main__':
    main()
