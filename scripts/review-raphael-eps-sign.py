"""Preserve Raphael's positive EPS tags alongside parenthesized loss presentation."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
clean = lambda node: ' '.join(' '.join(node.stripped_strings).split())


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main():
    cik, accession = '0001415397', '0001213900-26-037402'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    assert sha(target_raw) == 'a67ad91236326cefaad0c15c6a88bec62cab33b440db3f5d75af1b543f9243d8'
    targets = [t for t in json.loads(target_raw)['targets']
               if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001415397-source.json.gz').read_bytes())
    assert sha(source) == 'ac840aeb9423825264c2d0bfa5ea14b0fe200a23d558f14ed69c66b04a3f4317'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(row, tag=t['tag']) for t in targets for row in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr)
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '369194a4ba71bae5db1737234575a74dc2da9f486144a40ec918401f21e09a6c'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    lp = ROOT / 'scripts/review-share-context-spec-v7.py'
    helper, locator = module('compound', hp), module('locator', lp)
    comparison = helper.compare(raw, cik, rows)
    assert len(comparison['checks']) == 8 and all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser')
    tables = soup.find_all('table')
    expected = {
        119: {0: 'For the year ended December 31,', 1: 'Note 2025 2024',
              10: 'Net loss and comprehensive loss 1,279 1,519',
              12: 'Basic and diluted net loss per share 0.07 0.08',
              14: 'Weighted average number of common shares used in computing basic and diluted net loss per share 19,551,719 18,674,136'},
        139: {0: 'For the Year Ended December 31,', 1: '2025 2024',
              3: 'Net loss applicable to common stockholders $ ( 1,279 ) $ ( 1,519 )',
              6: 'Number of shares of common stock used in computing basic and diluted net loss per share 19,551,719 18,674,136',
              7: 'Net loss of shares of common, basic and diluted $ ( 0.07 ) $ ( 0.08 )'},
    }
    for index, requirements in expected.items():
        for row, text in requirements.items():
            assert clean(tables[index].find_all('tr')[row]) == text
    evidence = []
    for check in comparison['checks']:
        found = []
        for match in check['matches']:
            node = locator.locate_fact(soup, match, cik, helper)
            index = next((i for i in expected if node.find_parent('table') is tables[i]), None)
            if index is None:
                continue
            assert node.get('scale', '0') == '0'
            if match['tag'].startswith('EarningsPerShare'):
                assert not node.get('sign') and helper.numeric(node) > 0
                cell = clean(node.find_parent('td'))
                if index == 139:
                    assert '(' in cell, 'Loss parentheses must surround the positive fact in the note'
                else:
                    assert '(' not in cell, 'Primary statement EPS cell changed'
            found.append(dict(table_index=index, selected=check['selected'],
                              visible_cell=clean(node.find_parent('td')),
                              fact_xml=str(node),
                              context_xml=str(soup.find(id=node['contextref'])),
                              unit_xml=str(soup.find(id=node['unitref']))))
        assert {f['table_index'] for f in found} == set(expected)
        evidence.extend(found)
    result = dict(schema='canli.raphael-eps-sign-discrepancy.v1', publication_approved=False,
                  cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw),
                  primary_capture=receipt, receipt_sha256=sha(rr),
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()),
                  locator_sha256=sha(lp.read_bytes()), selected_observations=rows,
                  comparison=comparison, inline_evidence=evidence,
                  tables=[dict(table_index=i, text=clean(tables[i]), verified_rows=r)
                          for i, r in expected.items()],
                  disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
                  finding='Selected 2024/2025 EPS values are positive 0.08/0.07 in the captured source and in basic/diluted inline facts in both statement table119 and EPS-note table139. The note visibly surrounds those same positive-tagged facts with loss parentheses and presents negative loss numerators. The statement labels the values as net loss but displays no parentheses. Full shares agree in both tables. This preserves a machine-readable sign versus visible loss presentation inconsistency, not an independently corrected EPS series or a profit claim. Numerical matching alone cannot approve this accounting context.',
                  scope='All eight observations stay pending. No review registration, public note, source rewrite, selector hold or publication approval. Resolve the sign discrepancy or explicitly withhold affected observations before production admission.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('8 numerical matches; positive EPS tags versus visible loss presentation remain pending')


if __name__ == '__main__':
    main()
