"""Retain Apple iSports and Lithium historical liability context."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001134982', '0001213900-12-004043'): 9, ('0001134982', '0001213900-13-003911'): 11, ('0001134982', '0001213900-14-005195'): 34, ('0001134982', '0001213900-15-007901'): 18, ('0001134982', '0001213900-16-015950'): 19, ('0001134982', '0001213900-17-008611'): 28, ('0001134982', '0001213900-18-009841'): 25, ('0001134982', '0001445866-19-000869'): 14, ('0001134982', '0001477932-20-004803'): 36, ('0001134982', '0001477932-21-006527'): 40, ('0001134982', '0001477932-22-006967'): 38, ('0001134982', '0001477932-24-002287'): 70, ('0001134982', '0001477932-25-002341'): 65, ('0001134982', '0001477932-26-002110'): 67, ('0001415332', '0001165527-12-000289'): 1, ('0001415332', '0001165527-13-000366'): 2, ('0001415332', '0001165527-14-000191'): 2, ('0001415332', '0001165527-15-000111'): 2, ('0001415332', '0001165527-16-000711'): 2, ('0001415332', '0001165527-17-000087'): 20, ('0001415332', '0001165527-18-000055'): 21, ('0001415332', '0001165527-19-000030'): 15, ('0001415332', '0001640334-20-000540'): 45, ('0001415332', '0001640334-21-000592'): 43, ('0001415332', '0001640334-22-000760'): 52, ('0001415332', '0001640334-23-000651'): 50, ('0001415332', '0001640334-25-000094'): 63, ('0001415332', '0001640334-25-000577'): 57, ('0001415332', '0001640334-26-000606'): 53}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    ledger_raw=(A/'company-priority-scope-v13-20260920.json').read_bytes()
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
        if (row['val']!=0 and format(abs(row['val']),',') not in source['text']) or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        if item['cik']=='0001134982':
            note='Current and total liabilities are separately displayed with matching selected amounts. Older Prevention Insurance statements include explicitly zero net long-term convertible debt lines in2015/2016; later statements show expanded related-party loans/payables. Fiscal-date changes and historical entity naming are retained; no uniform business scope or equivalence beyond selected dates is inferred.'
        else:
            note='The balance sheet classifies the displayed liability components as current and reports matching total liabilities. Two older tables have a sole current payable/accrual line followed directly by total liabilities rather than a separately labeled current subtotal. Later current components include an allowance for optioned properties, not an additional amount beyond the total. These are overlapping concepts, not additive values.'
        text=source['text'].lower()
        if 'current liabilities' not in text or 'total liabilities' not in text:raise ValueError('Missing current section or total label')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=60:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.apple-lithium-liability.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v13_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'60 previously pending historical observations,29 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('60 historical observations with retained primary context')
if __name__=='__main__':main()
