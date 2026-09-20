"""Retain reviewed inline context while keeping legacy revenue scope gaps open."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
NOTES = {
 '0000066740': 'Selected values appear in consolidated net sales and total-company or worldwide disaggregation. Some paired tags use different filing accessions; matching amounts do not establish a constant business perimeter or a uniformly restated time series. Do not add the two presentations.',
 '0000816956': 'Net-sales statement totals match total customer-contract sales in surgical-business, timing and geographic breakdowns for the reviewed periods. Derivative-disclosure repetitions of the net-sales line are not additional revenue.',
 '0001127475': 'Statement revenue totals match the total column of United States/Great Britain geographic presentations for the reviewed periods. Geographic components are not additional revenue beyond that total.',
 '0001285785': 'The reviewed values are consolidated or total net sales across statements, geographic/product disclosures and segment reconciliations. Segment columns include intersegment sales, corporate adjustments and eliminations; summing components without those adjustments would change scope.',
 '0001551152': 'The reviewed values are net-revenue totals across the consolidated statement and geographic/product presentations. A total appearing below individual products is not the revenue of the first product listed in the table header.'}
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def main():
    ledger_raw = (A / 'company-priority-scope-coverage-20260920.json').read_bytes()
    closure_raw = (A / 'company-equal-history-numerical-closure-20260920.json').read_bytes()
    closure = json.loads(closure_raw);filings=[]
    for item in closure['inputs'][:3]:
        raw = (ROOT / item['path']).read_bytes()
        if sha(raw) != item['sha256']:
            raise ValueError('Primary comparison changed')
        filings.extend(json.loads(raw)['filings'])
    reviewed, pending = [], []
    for row in json.loads(ledger_raw)['pending']:
        if row['cik'] not in NOTES:
            continue
        selected = row['selected']
        found = [(f,c) for f in filings if f['cik']==row['cik'] and f['accession']==selected['accn'] for c in f['checks'] if c['selected']==selected]
        if len(found)!=1:
            raise ValueError('Missing unique comparison')
        f,c=found[0]
        if c['match_method']!='INLINE_PRIMARY':
            pending.append(dict(row, reason='Numerically closed via supplementary XBRL; primary presentation scope still pending.'));continue
        if not c['matched'] or not any(m.get('table_row') for m in c['matches']):
            raise ValueError('Missing primary table evidence')
        reviewed.append(dict(row, primary_sha256=f['primary_sha256'], url=f['url'], check=c, interpretation=NOTES[row['cik']]))
    if len(reviewed)!=65 or len(pending)!=15:
        raise ValueError('Reviewed fixed scope changed')
    result={'schema':'canli.historical-revenue-context.v1','publication_approved':False,
            'baseline_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
            'code_sha256':sha(Path(__file__).read_bytes()),'reviewed':reviewed,'pending':pending,
            'scope':'Recorded manual presentation review for65previously pending inline observations, retaining all matching rows and headers. Fifteen legacy observations remain scope-pending, not numerically unresolved. No source changes, blanket equivalence, deduplication or publication admission.'}
    with Path(sys.argv[1]).open('x') as stream:stream.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'reviewed':len(reviewed),'pending':len(pending)}))
if __name__=='__main__':main()
