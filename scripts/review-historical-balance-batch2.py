"""Retain reviewed Gold Rock balance-sheet and Nika asset context."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0000894501', '0001091818-22-000025'): 12, ('0000894501', '0001091818-23-000035'): 31, ('0000894501', '0001091818-24-000027'): 22, ('0000894501', '0001091818-25-000017'): 44, ('0000894501', '0001091818-26-000026'): 22, ('0001145604', '0001826466-22-000017'): 8, ('0001145604', '0001826466-23-000014'): 6, ('0001145604', '0001826466-24-000041'): 9, ('0001145604', '0001826466-25-000030'): 6, ('0001145604', '0001826466-26-000026'): 7}

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
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent','Assets','AssetsCurrent'):continue
        if format(abs(row['val']),',') not in source['text'] or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        if row['tag'] in ('Assets','AssetsCurrent'):
            note='The balance sheet separately labels current assets and total assets with equal selected amounts; displayed assets consist of cash and, where present, receivables or prepaid expenses. Current assets are part of total assets, not an additional amount. Nika historical long-term related-party liabilities are separately visible and are not covered by this asset conclusion. No inference of company-wide classification equivalence.'
        else:
            if item['cik']!='0000894501':raise ValueError('Unreviewed liability issuer')
            note='Gold Rock separately presents current and total liabilities with equal selected amounts, comprising displayed payables, accruals and director compensation. These overlapping totals must not be added or treated as universally interchangeable.'
        labels={'Assets':'total assets','AssetsCurrent':'total current assets','Liabilities':'total liabilities','LiabilitiesCurrent':'total current liabilities'}
        if labels[row['tag']] not in source['text'].lower():raise ValueError('Missing total label')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=30:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.historical-balance-batch2.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v12_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'30 previously pending historical observations,10 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('30 historical observations with retained primary context')
if __name__=='__main__':main()
