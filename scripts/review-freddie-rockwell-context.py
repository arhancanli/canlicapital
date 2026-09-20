"""Replay exact legacy annual statement mappings and reviewed dilution disclosures."""
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

CASES = [
    dict(cik='0001026214', accession='0001026214-12-000039', fixture='freddie-2011',
         source='67fd5b3cf55c379343fd9ffb7271dc8d90538e78bcc7f7e0d592939e3a19939b',
         primary='476d28ead987ed5cc6c880625bde97abfec0fff8e4c540dc612e27f0deffbf14',
         xml='0da4357b240945a17c3b3f233e389db24faddd2081e1ef7eeb6d699aae15361b',
         table=414, years=['2011', '2010', '2009'], header_columns=[2, 5, 8], value_columns=[3, 7, 11],
         row_indexes=[81, 82, 84, 85], scale=1000,
         needles=['This warrant is included in basic loss per share, because it is unconditionally exercisable by the holder at a cost of $0.00001 per share.',
                  'antidilutive potential common shares excluded from the computation of dilutive potential common shares were 3,383,185, 5,290,347, and 7,541,077'],
         note='For Freddie Mac in 2009–2011, the numerator is loss attributable to common stockholders after preferred dividends and noncontrolling interests. Treasury warrant shares were already included in basic and diluted weighted-average shares because the warrant was unconditionally exercisable for a nominal $0.00001 per share; they must not be added again as dilution. The filing separately excludes anti-dilutive potential common shares. Statement share counts are in thousands, whereas these source observations use full shares. This context applies to the historical 2011 filing, not the newer preferred-stock arrangements.'),
    dict(cik='0001041024', accession='0001558370-18-002142', fixture='rockwell-2017',
         source='88e8b83e4e95fda016bcc9a5dced4522c975c40fff65ebdbda5ac42b28ba4fb6',
         primary='ccdf45ccfaf487fcea8c90d95f77ec9a89df6162f1df7a0e19c7c638aae495e5',
         xml='ff4e164a0b2ad0b0051570ee1c9097bc6f26bc918c5d7eb2b2c3dc177d33335f',
         table=45, years=['2017', '2016', '2015'], header_columns=[2, 4, 6], value_columns=[3, 6, 9],
         row_indexes=[13, 14, 16, 17], scale=1,
         needles=['For 2017, 2016 and 2015, the dilutive effect of stock options, unvested restricted share grants and common share purchase warrants have not been included in the average shares outstanding for the calculation of diluted loss per share as the effect would be anti-dilutive as a result of our net loss in these periods.'],
         note='For Rockwell Medical in 2015–2017, stock options, unvested restricted share grants and common-share purchase warrants were excluded from diluted loss per share because their effect would have been anti-dilutive during losses. Basic and diluted weighted-average counts therefore match in the filing. These are full share counts and USD per-share amounts from the historical 2017 report; no later split adjustment is applied to this source version.'),
]

def main():
    target_raw = (A / 'company-basic-diluted-capture-batch1-targets-20260920.json').read_bytes()
    legacy_raw = (A / 'company-basic-diluted-batch1-legacy-review-v2-20260920.json').read_bytes()
    helper_path = ROOT / 'scripts/review-basic-diluted-legacy-v2.py'
    spec = importlib.util.spec_from_file_location('legacy', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    tags = ['EarningsPerShareBasic', 'EarningsPerShareDiluted',
            'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding']
    decisions = []
    for case in CASES:
        cik, accession = case['cik'], case['accession']
        source = gzip.decompress((ROOT / f"scripts/fixtures/editorial/{case['fixture']}-reviewed-source.json.gz").read_bytes())
        assert sha(source) == case['source']
        targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
        assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
        rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
        assert len(rows) == 12
        receipt_raw = (A / f'corpus-local/basic-diluted-batch1-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
        receipt = json.loads(receipt_raw); raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256'] == case['primary']
        legacy = next(f for f in json.loads(legacy_raw)['filings'] if f['cik'] == cik and f['accession'] == accession)
        capture = legacy['instance_capture']; xml = (ROOT / capture['body_path']).read_bytes()
        assert capture['status'] == 200 and len(xml) == capture['bytes'] and sha(xml) == capture['sha256'] == case['xml']
        checks = helper.compare(xml, cik, rows)
        assert checks == legacy['checks'] and all(c['matched'] for c in checks)
        soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[case['table']]
        cells = [[clean(c) for c in tr.find_all(['td', 'th'], recursive=False)] for tr in table.find_all('tr')]
        assert [cells[2][i] for i in case['header_columns']] == case['years']
        if case['scale'] == 1000:
            assert cells[83][0] == 'Weighted average common shares outstanding (in thousands):'
            assert cells[76][0] == 'Preferred stock dividends'
        mappings = []
        for row in rows:
            assert row['start'] == row['end'][:4] + '-01-01'
            assert row['end'][4:] == '-12-31'
            tag_index = tags.index(row['tag'])
            assert row['unit'] == ('USD/shares' if tag_index < 2 else 'shares')
            line = cells[case['row_indexes'][tag_index]]
            assert line[0] == ('Basic' if tag_index % 2 == 0 else 'Diluted')
            column = case['value_columns'][case['years'].index(row['end'][:4])]
            value = line[column]
            if value.startswith('(') and not value.endswith(')'):
                assert line[column + 1] == ')'; value += ')'
            negative = value.startswith('(')
            number = float(value.replace(',', '').strip('()')) * (-1 if negative else 1)
            scale = case['scale'] if tag_index >= 2 else 1
            assert number * scale == row['val']
            mappings.append(dict(selected=row, table_index=case['table'], row_index=case['row_indexes'][tag_index],
                                 row_label=line[0], cell_index=column, reported_text=value, multiplier=scale))
        blocks = [clean(n) for n in soup.find_all(['p', 'div', 'td', 'span']) if n.find(['p', 'div', 'td']) is None]
        disclosures = []
        for needle in case['needles']:
            found = [t for t in blocks if needle in t]; assert found, needle; disclosures.extend(found)
        decisions.append(dict(cik=cik, source_sha256=sha(source), primary_capture=receipt,
                              receipt_sha256=sha(receipt_raw), instance_capture=capture,
                              selected_observations=rows, checks=checks, statement_mappings=mappings,
                              table_index=case['table'], table_text=clean(table), disclosures=list(dict.fromkeys(disclosures)),
                              reader_note=case['note'], disposition='REVIEWED_ALLOCATION_UNIT_AND_DILUTION_CONTEXT'))
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
                  target_sha256=sha(target_raw), legacy_report_sha256=sha(legacy_raw),
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()), decisions=decisions,
                  scope='Twenty-four exact annual observations linked to original XML and statement columns. No whole-history or publication approval.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('24 legacy observations mapped to original statements and dilution context')

if __name__ == '__main__':
    main()
