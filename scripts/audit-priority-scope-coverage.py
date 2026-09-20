"""Count exact observation coverage from retained scope reviews, without admission."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'

def main():
    inputs = {}
    def read(name):
        raw = (A / name).read_bytes()
        inputs[name] = hashlib.sha256(raw).hexdigest()
        return json.loads(raw)
    queue = read('company-five-cohort-equal-history-review-20260920.json')
    cases = [case for case in queue['cases'] if case['category'] != 'basic_diluted_nonzero_equality']
    def key(cik, row):
        return cik + '|' + json.dumps(row, sort_keys=True, separators=(',', ':'))
    rows, support = {}, {}
    for case in cases:
        for series in case['observations']:
            for row in series['observations']:
                item = dict(row, tag=series['tag']); k = key(case['cik'], item)
                if k in rows:
                    raise ValueError('Duplicate queue observation')
                rows[k] = {'cik': case['cik'], 'name': case['name'], 'selected': item}
    def add(cik, row, report):
        k = key(cik, row)
        if k not in rows:
            raise ValueError('Scope observation outside priority queue')
        support.setdefault(k, set()).add(report)
    name = 'company-equal-history-scope-notes-20260920.json'
    for case in read(name)['cases']:
        for check in case['reviewed_observations']:
            add(case['cik'], check['selected'], name)
    name = 'company-revenue-presentation-scope-20260920.json'
    for case in read(name)['cases']:
        for check in case['reviewed_checks']:
            add(case['cik'], check['selected'], name)
    name = 'company-eventiko-history-scope-20260920.json'
    eventiko = read(name)
    event_rows = [row for row in rows.values() if row['cik'] == eventiko['cik']]
    if len(event_rows) != eventiko['reviewed_observations'] or set(row['selected']['end'] for row in event_rows) != set(eventiko['reporting_ends']):
        raise ValueError('EVENTIKO scope changed')
    for row in event_rows:
        add(row['cik'], row['selected'], name)
    liability = read('company-liability-presentation-review-20260920.json')
    name = 'company-liability-presentation-scope-20260920.json'
    scope = read(name)
    if scope['review_sha256'] != inputs['company-liability-presentation-review-20260920.json']:
        raise ValueError('Liability review changed')
    approved = {(c['cik'], c['end']): name for c in scope['reviewed']}
    name = 'company-liability-legacy-context-20260920.json'
    for case in read(name)['cases']:
        if case['disposition'] == 'LIMITED_PRIMARY_SCOPE_REVIEWED':
            approved[(case['cik'], case['end'])] = name
    name = 'company-greenstream-original-context-20260920.json'
    green = read(name)
    if green['amendment_accession'] != '0001683168-21-004126':
        raise ValueError('Green Stream amendment changed')
    approved[('0001437476', '2021-04-30')] = name
    for case in liability['cases']:
        report = approved.get((case['cik'], case['latest_selected_end']))
        if report:
            for evidence in case['evidence']:
                add(case['cik'], evidence['check']['selected'], report)
    name = 'company-remaining-equality-context-20260920.json'
    for case in read(name)['cases']:
        for evidence in case['evidence']:
            add(case['cik'], evidence['check']['selected'], name)
    name = 'company-birdie-expense-scope-20260920.json'
    birdie = read(name)
    periods = {row['end']: row['selected_sga_and_operating_total'] for row in birdie['differences']}
    withdrawn = set()
    for row in rows.values():
        selected = row['selected']
        if row['cik'] == birdie['cik'] and selected['tag'] in ['OperatingExpenses', 'SellingGeneralAndAdministrativeExpense']:
            if periods.get(selected['end']) != selected['val']:
                raise ValueError('Birdie reviewed period changed')
            add(row['cik'], selected, name)
            if selected['tag'] == 'SellingGeneralAndAdministrativeExpense':
                withdrawn.add(key(row['cik'], selected))
    missing = [row for k, row in rows.items() if k not in support]
    if len(rows) != 610 or len(withdrawn) != 3:
        raise ValueError('Priority scope changed')
    result = {'schema': 'canli.priority-scope-coverage.v1', 'publication_approved': False,
              'input_sha256': inputs, 'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'original_priority_observations': len(rows), 'observations_with_retained_scope_review': len(support),
              'withdrawn_v10_observations': len(withdrawn), 'active_reviewed_observations': len(set(support) - withdrawn),
              'active_observations_needing_scope_review': len(missing),
              'reviewed': [dict(rows[k], scope_reports=sorted(reports), withdrawn_in_v10=k in withdrawn) for k, reports in sorted(support.items())],
              'pending': missing,
              'scope': 'Exact deduplicated accounting of recorded manual scope reviews for38priority groups only. Numerical closure, manual interpretations, usefulness and admission remain separate. Does not cover712basic/diluted groups or the full corpus.'}
    with Path(sys.argv[1]).open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if isinstance(v, int) and not isinstance(v, bool)}))
if __name__ == '__main__':
    main()
