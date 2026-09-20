"""Retain reviewed legacy balance-sheet tables and an XBRL-only amendment note."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
TABLES = {'0001409253': 59, '0001420108': 32, '0001492448': 31, '0001584618': 8}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def build():
    artifacts = ROOT / 'artifacts/seo'
    review_raw = (artifacts / 'company-liability-presentation-review-20260920.json').read_bytes()
    review = json.loads(review_raw)
    targets, inputs = [], []
    for path in sorted(artifacts.glob('company-equal-history-*targets-20260920.json')):
        raw = path.read_bytes()
        inputs.append({'path': str(path.relative_to(ROOT)), 'sha256': sha(raw)})
        targets.extend(json.loads(raw).get('filings', []))
    cases = []
    for case in review['cases']:
        if case['primary_rows_available']:
            continue
        evidence = case['evidence'][0]
        observation = evidence['check']['selected']
        paths = {target['body_path'] for target in targets
                 if target.get('cik') == case['cik'] and target.get('accession') == observation['accn']
                 and 'body_path' in target}
        if len(paths) != 1:
            raise ValueError('Missing or ambiguous primary path')
        path = ROOT / paths.pop()
        path.resolve().relative_to((artifacts / 'corpus-local').resolve())
        raw = path.read_bytes()
        if sha(raw) != evidence['primary_sha256']:
            raise ValueError('Primary binding mismatch')
        soup = BeautifulSoup(raw, 'html.parser')
        result = {'cik': case['cik'], 'accession': observation['accn'],
                  'primary_path': str(path.relative_to(ROOT)), 'primary_sha256': sha(raw),
                  'primary_url': evidence['url'], 'end': observation['end'], 'value': observation['val']}
        if case['cik'] in TABLES:
            index = TABLES[case['cik']]
            text = ' '.join(' '.join(soup.find_all('table')[index].stripped_strings).split())
            if not all(term in text.lower() for term in ['total current liabilities', 'total liabilities', f"{observation['val']:,}"]):
                raise ValueError('Reviewed table changed')
            result.update(zero_based_table_index=index, primary_table=text,
                          disposition='LIMITED_PRIMARY_SCOPE_REVIEWED',
                          interpretation='At the selected reporting date, the balance sheet presents separate current-liability and total-liability rows with the same amount. These are overlapping totals, not amounts to add together. This does not establish all-history equivalence or absence of other commitments.')
        elif case['cik'] == '0001437476':
            text = ' '.join(' '.join(soup.stripped_strings).split())
            start, end = text.index('EXPLANATORY NOTE'), text.index('PART IV')
            note = text[start:end].strip()
            if 'solely to furnish the Interactive Data files' not in note:
                raise ValueError('Amendment scope changed')
            result.update(explanatory_note=note, disposition='ORIGINAL_STATEMENT_CONTEXT_PENDING',
                          interpretation='This amendment furnishes XBRL exhibits only. Numerical matches remain valid evidence for those exhibits; the amendment primary document does not supply the original balance-sheet context. Locate and bind the original annual report before closing statement review.')
        else:
            raise ValueError('Unreviewed legacy case')
        cases.append(result)
    return {'schema': 'canli.liability-legacy-context.v1', 'publication_approved': False,
            'review_sha256': sha(review_raw), 'code_sha256': sha(Path(__file__).read_bytes()),
            'target_inputs': inputs, 'cases': cases,
            'scope': 'Offline primary-context supplement for five previously XML-only latest selected pairs. Four limited table reviews, one amendment-context gap. Original reports unchanged; not all-history admission or publication.'}


if __name__ == '__main__':
    report = build()
    with Path(sys.argv[1]).open('x') as stream:
        stream.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'cases': len(report['cases']), 'reviewed_tables': sum(c['disposition'] == 'LIMITED_PRIMARY_SCOPE_REVIEWED' for c in report['cases'])}))
