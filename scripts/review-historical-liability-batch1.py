"""Retain reviewed historical liability context for Birdie, Vemanti and Caro."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001605057', '0001477932-22-001600'): 44, ('0001605057', '0001477932-23-001945'): 54, ('0001605057', '0001477932-24-001509'): 54, ('0001678105', '0001640334-17-001309'): 32, ('0001678105', '0001640334-18-001554'): 33, ('0001678105', '0001640334-19-001506'): 32, ('0001678105', '0001640334-20-002258'): 30, ('0001678105', '0001640334-21-001401'): 30, ('0001678105', '0001640334-22-002242'): 23, ('0001678105', '0001640334-23-001295'): 22, ('0001678105', '0001640334-24-001032'): 22, ('0001678105', '0001640334-25-001202'): 29, ('0001678105', '0001640334-26-001184'): 26, ('0001873213', '0001493152-22-028024'): 51, ('0001873213', '0001493152-23-037773'): 74, ('0001873213', '0001493152-24-039471'): 56, ('0001873213', '0001493152-25-017715'): 49}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    ledger_raw=(A/'company-priority-scope-v12-20260920.json').read_bytes()
    closure_raw=(A/'company-equal-history-numerical-closure-20260920.json').read_bytes()
    filings=[];targets=[]
    for item in json.loads(closure_raw)['inputs'][:3]:
        raw=(ROOT/item['path']).read_bytes()
        if sha(raw)!=item['sha256']:raise ValueError('Comparison binding changed')
        filings.extend(json.loads(raw)['filings'])
    for path in sorted(A.glob('company-equal-history-*targets-20260920.json')):
        targets.extend(json.loads(path.read_bytes()).get('filings',[]))
    sources={}
    for (cik,accn),index in TABLES.items():
        found={t['body_path'] for t in targets if t.get('cik')==cik and t.get('accession')==accn and 'body_path' in t}
        if len(found)!=1:raise ValueError('Ambiguous primary path')
        path=found.pop();raw=(ROOT/path).read_bytes()
        hashes={f['primary_sha256'] for f in filings if f['cik']==cik and f['accession']==accn}
        if hashes!={sha(raw)}:raise ValueError('Primary binding changed')
        table=BeautifulSoup(raw,'html.parser').find_all('table')[index]
        sources[(cik,accn)]={'cik':cik,'accession':accn,'primary_path':path,'primary_sha256':sha(raw),
            'zero_based_table_index':index,'text':' '.join(' '.join(table.stripped_strings).split())}
    reviewed=[]
    for item in json.loads(ledger_raw)['pending']:
        row=item['selected'];source=sources.get((item['cik'],row['accn']))
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent'):continue
        if format(abs(row['val']),',') not in source['text'] or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        note='The reviewed balance sheet separately presents current-liability and total-liability totals with equal amounts at the selected comparative date. Displayed components are within the current section, including related-party balances, accrued expenses or notes where shown. No separate noncurrent liability amount intervenes. These are overlapping totals, not additive or interchangeable concepts; this does not approve other histories or imply no off-balance-sheet obligations.'
        text=source['text'].lower()
        if 'total current liabilities' not in text or 'total liabilities' not in text:raise ValueError('Missing separately labeled totals')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=34:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.historical-liability-batch1.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v12_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'34 previously pending historical observations,17 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('34 historical observations with retained primary context')
if __name__=='__main__':main()
