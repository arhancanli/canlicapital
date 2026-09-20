"""Retain latest-period context for the 14 other priority equality pairs."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    closure_raw = (A / 'company-equal-history-numerical-closure-20260920.json').read_bytes()
    closure = json.loads(closure_raw)
    queue_raw = (A / 'company-five-cohort-equal-history-review-20260920.json').read_bytes()
    if sha(queue_raw) != closure['queue_sha256']:
        raise ValueError('Queue binding mismatch')
    filings, targets = [], []
    for item in closure['inputs'][:3]:
        raw = (ROOT / item['path']).read_bytes()
        if sha(raw) != item['sha256']:
            raise ValueError('Comparison binding mismatch')
        filings.extend(json.loads(raw)['filings'])
    for p in sorted(A.glob('company-equal-history-*targets-20260920.json')):
        targets.extend(json.loads(p.read_bytes()).get('filings', []))
    excluded = [set(pair) for pair in [('Liabilities','LiabilitiesCurrent'), ('Revenues','RevenueFromContractWithCustomerExcludingAssessedTax'), ('AccountsPayableCurrent','PropertyPlantAndEquipmentNet'), ('OperatingExpenses','SellingGeneralAndAdministrativeExpense')]]
    cases = []
    for case in json.loads(queue_raw)['cases']:
        tags = set(case['tags'])
        if case['category'] == 'basic_diluted_nonzero_equality' or tags in excluded:
            continue
        evidence = []
        for series in case['observations']:
            latest = max(row['end'] for row in series['observations'])
            rows = [dict(row, tag=series['tag']) for row in series['observations'] if row['end'] == latest]
            if len(rows) != 1:
                raise ValueError('Ambiguous latest period')
            selected = rows[0]
            found = [(filing, check) for filing in filings if filing['cik'] == case['cik'] and filing['accession'] == selected['accn'] for check in filing['checks'] if check['selected'] == selected]
            if len(found) != 1 or not found[0][1]['matched']:
                raise ValueError('Missing selected evidence')
            filing, check = found[0]
            evidence.append({'accession': filing['accession'], 'primary_sha256': filing['primary_sha256'], 'url': filing['url'], 'check': check})
        legacy = []
        if any(e['check']['match_method'] != 'INLINE_PRIMARY' for e in evidence):
            indices = {'0001162283': 9, '0001410708': 6, '0001492448': 31}
            e = evidence[0]
            found = {t['body_path'] for t in targets if t.get('cik') == case['cik'] and t.get('accession') == e['accession'] and 'body_path' in t}
            if len(found) != 1:
                raise ValueError('Ambiguous retained primary')
            path = found.pop();raw = (ROOT / path).read_bytes()
            if sha(raw) != e['primary_sha256']:
                raise ValueError('Primary hash mismatch')
            index = indices[case['cik']]
            table = BeautifulSoup(raw, 'html.parser').find_all('table')[index]
            legacy.append({'primary_path': path, 'zero_based_table_index': index, 'text': ' '.join(' '.join(table.stripped_strings).split())})
        if tags == {'Assets','AssetsCurrent'}:
            interpretation = 'The reviewed balance sheet separately labels current assets and total assets with equal amounts at the selected date. Current assets are included in total assets; do not add the two totals. No all-history classification conclusion follows.'
        elif tags == {'NetIncomeLoss','OperatingIncomeLoss'}:
            interpretation = 'The reviewed statement separately labels operating loss and net loss with equal selected amounts. They remain different accounting measures; this is not proof that all historical or future non-operating items are absent.'
        elif tags == {'AccountsPayableCurrent','LiabilitiesCurrent'}:
            interpretation = 'The December 31, 2018 balance sheet lists accounts payable of222USD as the sole displayed current-liability component and reports total current liabilities of222USD. This does not make accounts payable a universal substitute for current liabilities.'
        elif tags == {'AssetsCurrent','CashAndCashEquivalentsAtCarryingValue'}:
            interpretation = 'The2013 annual-report balance sheet presents584USD cash and total current assets in its July31,2012 comparative column. This is a historical comparative date, not proof of an independently captured2012filing or equivalence at every date.'
        elif tags == {'PaymentsToAcquirePropertyPlantAndEquipment','Revenues'}:
            interpretation = 'The2025statement of operations reports zero revenue while the cash-flow statement reports zero fixed-asset purchases. These are different flows in different statements. Equal zeros do not imply equivalence or establish that the business had no other activity.'
        else:
            raise ValueError('Unreviewed pair')
        cases.append({'cik': case['cik'], 'name': case['name'], 'tags': case['tags'], 'evidence': evidence, 'legacy_tables': legacy, 'interpretation': interpretation})
    if len(cases) != 14:
        raise ValueError('Unexpected scope count')
    result = {'schema': 'canli.remaining-equality-context.v1', 'publication_approved': False, 'closure_sha256': sha(closure_raw), 'code_sha256': sha(Path(__file__).read_bytes()), 'cases': cases,
              'scope': 'Limited latest-selected-period context for14priority pairs, preserving primary rows and three legacy tables. Manual interpretation is recorded, not machine-certified. No full-history admission, automatic deduplication or publication.'}
    with Path(sys.argv[1]).open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print('14 latest pairs / 28 selected observations retained')
if __name__ == '__main__':
    main()
