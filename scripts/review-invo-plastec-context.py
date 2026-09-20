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

CASES = [{'cik': '0001417926',
  'accession': '0001185185-17-000595',
  'fixture': 'invo',
  'source': '685ad9dc506bdfe829560566a030c772be69de24616cba6e2a255a48eadc071b',
  'primary': '3b8ae21fc87104eb128ec2b99768fcca1d1f12e6ac5893a40055ccbae3764d2f',
  'xml': '9bd79588b17bea2bdbc75939f8c07ddd7554c4b242f0ecf224307c76d290fd01',
  'table': 30,
  'years': ['2014', '2013', '2012', '2011'],
  'header_row': 3,
  'header_columns': [5, 8, 11, 14],
  'value_columns': [7, 11, 15, 19],
  'row_indexes': [29, 31, 33, 35],
  'labels': ['Basic net loss per weighted average shares of common stock',
             'Diluted net loss per weighted average shares of common stock',
             'Basic weighted average number of shares of common stock',
             'Diluted weighted average number of shares of common stock'],
  'scale': 1,
  'count': 14,
  'eps_unit': 'USD/shares',
  'needles': ['The Company’s diluted loss per share is the same as the basic loss per share for '
              'the years ended December 31, 2015, 2014, 2013, 2012, and 2011, as the inclusion of '
              'any potential shares would have had an anti-dilutive effect due to the Company '
              'generating a loss.'],
  'disposition': 'REVIEWED_ALLOCATION_UNIT_AND_DILUTION_CONTEXT',
  'note': 'For INVO Bioscience in 2011–2014, potential shares were excluded from diluted loss per '
          'share because their inclusion would have been anti-dilutive during losses. The reviewed '
          'figures are USD EPS for those four years and full weighted-average share counts for '
          '2011–2013. Both 2014 share counts remain withheld: the main statement reports '
          '112,672,160 while the per-share note reports 112,670,160. EPS is retained as reported, '
          'not recomputed from either disputed denominator. These are the historical filing’s '
          'share and period conventions.'},
 {'cik': '0001433309',
  'accession': '0001144204-16-092975',
  'fixture': 'plastec',
  'source': 'cf4b5a43bd4fd766c3e43344162a2a5fabd8aa1327866bec066af37167006276',
  'primary': 'fa2e1782d675272300e2d7a802cf6d7834f8eb596392a1f2e7c9a9cfcad32ea2',
  'xml': 'fb53ba30ca4f6c92abb1a819cb02882229069b5cf7c6be7076593e3247d000f1',
  'table': 238,
  'years': ['2013', '2014', '2015'],
  'header_row': 1,
  'header_columns': [2, 5, 8],
  'value_columns': [3, 7, 11],
  'row_indexes': [35, 37, 31, 33],
  'labels': ['Basic income per share attributable to Plastec Technologies, Ltd.',
             'Diluted income per share attributable to Plastec Technologies, Ltd.',
             'Weighted average number of ordinary shares',
             'Weighted average number of diluted ordinary shares'],
  'scale': 1,
  'count': 12,
  'eps_unit': 'HKD/shares',
  'needles': ['In connection with the reverse acquisition and recapitalization, all share and per '
              'share amounts have been retroactively restated.'],
  'disposition': 'REPORTED_PRESENTATION_REVIEWED_CAUSE_NOT_ESTABLISHED',
  'note': 'For Plastec Technologies in 2013–2015, these figures are Hong Kong dollars per ordinary '
          'share and full weighted-average ordinary-share counts. The filing says share and '
          'per-share amounts were already retroactively restated for the reverse acquisition and '
          'recapitalization; no second adjustment is applied. The statements report equal basic '
          'and diluted measures, but this review does not establish a specific cause across all '
          'three profitable years. This is a presentation-only review; the generic dilution policy '
          'is not evidence of the absence of potential shares.'}]

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
        all_rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
        rows = [r for r in all_rows if not (cik == '0001417926' and r['end'] == '2014-12-31' and r['unit'] == 'shares')]
        assert len(rows) == case['count']
        receipt_raw = (A / f'corpus-local/basic-diluted-batch1-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
        receipt = json.loads(receipt_raw); raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256'] == case['primary']
        legacy = next(f for f in json.loads(legacy_raw)['filings'] if f['cik'] == cik and f['accession'] == accession)
        capture = legacy['instance_capture']; xml = (ROOT / capture['body_path']).read_bytes()
        assert capture['status'] == 200 and len(xml) == capture['bytes'] and sha(xml) == capture['sha256'] == case['xml']
        checks = helper.compare(xml, cik, all_rows)
        assert checks == legacy['checks'] and all(c['matched'] for c in checks)
        soup = BeautifulSoup(raw, 'html.parser'); table = soup.find_all('table')[case['table']]
        cells = [[clean(c) for c in tr.find_all(['td', 'th'], recursive=False)] for tr in table.find_all('tr')]
        assert [cells[case['header_row']][i] for i in case['header_columns']] == case['years']
        if cik == '0001433309':
            assert [cells[2][i] for i in [2, 5, 8]] == ['HK$', 'HK$', 'HK$']
        mappings = []
        for row in rows:
            assert row['start'] == row['end'][:4] + '-01-01'
            assert row['end'][4:] == '-12-31'
            tag_index = tags.index(row['tag'])
            assert row['unit'] == (case['eps_unit'] if tag_index < 2 else 'shares')
            line = cells[case['row_indexes'][tag_index]]
            assert line[0] == case['labels'][tag_index]
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
                              reader_note=case['note'], disposition=case['disposition']))
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
                  target_sha256=sha(target_raw), legacy_report_sha256=sha(legacy_raw),
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()), decisions=decisions,
                  scope='Twenty-six exact annual observations linked to original XML and statement columns. No whole-history or publication approval.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('26 legacy observations mapped to original statements and dilution context')

if __name__ == '__main__':
    main()
