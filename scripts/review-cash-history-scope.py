"""Reproduce manually selected historical cash-statement evidence offline."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
# Table indices and annual columns inspected in the retained primary filings.
TABLES = {
    '0000825313-16-000046': (90, [2015, 2014, 2013]),
    '0000825313-17-000008': (93, [2016, 2015, 2014]),
    '0000825313-18-000011': (99, [2017, 2016, 2015]),
    '0001140361-11-007854': (137, [2010, 2009, 2008]),
    '0001140361-12-006703': (126, [2011, 2010, 2009]),
    '0001140361-13-005892': (128, [2012, 2011, 2010]),
    '0001140361-14-006056': (113, [2013, 2012, 2011]),
    '0001140361-15-005663': (115, [2014, 2013, 2012]),
    '0001010412-12-000126': (9, [2011, 2010]),
    '0001548123-13-000117': (9, [2012, 2011]),
    '0001548123-14-000047': (9, [2013, 2012]),
    '0001548123-15-000042': (9, [2014, 2013]),
    '0001548123-16-000510': (9, [2015, 2014]),
    '0001548123-17-000047': (9, [2016, 2015]),
    '0001548123-18-000063': (10, [2017, 2016]),
    '0001548123-19-000054': (8, [2018, 2017]),
    '0001548123-20-000042': (8, [2019, 2018]),
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verified(receipt):
    raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
    return raw


def main():
    base = ROOT / 'artifacts/seo'
    capture_raw = (base / 'company-cash-history-capture-20260920.json').read_bytes()
    comparison_raw = (base / 'company-cash-history-xbrl-legacy-20260920.json').read_bytes()
    capture, comparison = json.loads(capture_raw), json.loads(comparison_raw)
    assert capture['complete'] and comparison['complete']
    assert comparison['capture_sha256'] == sha(capture_raw)
    by_key = {(f['cik'], f['accession']): f for f in comparison['filings']}
    assert len(by_key) == len(capture['filings']) == len(TABLES)
    assert {f['accession'] for f in capture['filings']} == set(TABLES)
    findings = []
    for filing in capture['filings']:
        key = (filing['cik'], filing['accession'])
        checked = by_key[key]
        assert checked['checks'] and all(c['matched'] for c in checked['checks'])
        primary = verified(filing['primary_capture'])
        instance = verified(checked['instance_capture'])
        index, years = TABLES[filing['accession']]
        table = BeautifulSoup(primary, 'html.parser').find_all('table')[index]
        text = ' '.join(table.stripped_strings)
        preceding = ' '.join(' '.join(table.find_all_previous(string=True, limit=30)[::-1]).split())
        expected_entity = 'AllianceBernstein Holding L.P.' if key[0] == '0000825313' else 'ATLANTICA, INC.'
        assert expected_entity in preceding and 'Statements of Cash Flows' in preceding
        assert all(str(year) in text[:320] for year in years)
        rows = [' '.join(tr.stripped_strings) for tr in table.find_all('tr')]
        opening = [r for r in rows if re.search(r'cash.{0,60}beginning', r, re.I)]
        closing = [r for r in rows if re.search(r'cash.{0,60}end of', r, re.I)]
        assert len(opening) == len(closing) == 1
        # Visible zero/dash rows are backed by explicit numeric XML facts;
        # this check alone would not establish that a dash means numeric zero.
        for row in opening + closing:
            assert re.search(r'(?:0|—|-)', row) and not re.search(r'[1-9]', row)
        root = ET.fromstring(instance)
        contexts = {n.get('id'): n for n in root.findall('{http://www.xbrl.org/2003/instance}context')}
        observations = []
        for check in checked['checks']:
            selected = check['selected']
            assert selected['val'] == 0 and selected['tag'] == 'CashAndCashEquivalentsAtCarryingValue'
            inception = selected['end'] == '1996-12-31'
            if inception:
                assert key == ('0001062506', '0001548123-14-000047')
                assert 'From Inception of Development Stage on January 1, 1997' in text
                period = '1997-01-01'
            else:
                assert selected['end'] == f'{min(years)-1}-12-31'
                period = f'{min(years)}-01-01'
            observations.append({
                'selected': selected,
                'numeric_matches': check['matches'],
                'matching_contexts_xml': [ET.tostring(contexts[m['context_id']], encoding='unicode') for m in check['matches']],
                'statement_position': 'inception_column_opening_balance' if inception else 'earliest_annual_column_opening_balance',
                'opening_period_start': period,
                'interpretation': 'The explicit year-end XML instant corresponds to the opening cash row for the following period. This does not establish a separately published annual report for that instant year.',
            })
        findings.append({'cik': key[0], 'accession': key[1], 'primary_capture': filing['primary_capture'],
                         'instance_capture': checked['instance_capture'], 'zero_based_table_index': index,
                         'statement_entity': expected_entity, 'annual_columns': years,
                         'preceding_text': preceding, 'statement_text': text,
                         'opening_row': opening[0], 'closing_row': closing[0], 'observations': observations,
                         'scope_note': ('Holding partnership cash must not be replaced with operating-partnership cash.'
                                        if key[0] == '0000825313' else 'Zero balances coexist with financing and operating cash flows; no inactivity claim follows.'),
                         'disposition': 'SUPPORTED_OPENING_BALANCE_WITH_REPORTING_CONTEXT'})
    assert sum(len(f['observations']) for f in findings) == 18
    report = {'schema': 'canli.cash-history-statement-scope.v1', 'publication_approved': False,
              'capture_sha256': sha(capture_raw), 'comparison_sha256': sha(comparison_raw),
              'code_sha256': sha(Path(__file__).read_bytes()), 'filings': findings,
              'scope': 'Manual table selections and interpretations reproduced from retained bytes. Covers these 18 historical observations only, not other metrics or general publication admission. No data values altered.'}
    output = base / 'company-cash-history-statement-scope-20260920.json'
    assert not output.exists(), 'Preserve previous evidence; use a fresh output path'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'filings': len(findings), 'observations': 18, 'sha256': sha(output.read_bytes())}))


if __name__ == '__main__':
    main()
