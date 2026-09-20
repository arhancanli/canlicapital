"""Retain Visium and GRN historical balance context while preserving amendment gaps."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001082733', '0001493152-15-004104'): 92, ('0001082733', '0001493152-16-008799'): 64, ('0001082733', '0001493152-16-014027'): 100, ('0001082733', '0001493152-17-011047'): 87, ('0001082733', '0001493152-18-012383'): 98, ('0001082733', '0001493152-19-014676'): 103, ('0001082733', '0001654954-20-010986'): 73, ('0001082733', '0001654954-21-011057'): 64, ('0001082733', '0001654954-22-013289'): 78, ('0001082733', '0001654954-23-012664'): 88, ('0001082733', '0001654954-24-012507'): 97, ('0001082733', '0001654954-25-011506'): 90, ('0001492448', '0001079973-19-000471'): 36, ('0001492448', '0001079973-20-000675'): 31, ('0001492448', '0001185185-12-001649'): 26}

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
    reviewed=[];pending=[]
    for item in json.loads(ledger_raw)['pending']:
        row=item['selected'];source=sources.get((item['cik'],row['accn']))
        if item['cik']=='0001082733' and row['accn']=='0001493152-16-007138':
            pending.append(dict(item,reason='Retained primary is a10-K/Aamendment without a balance-sheet table. Earlier2013filing supports the amount but does not settle context of this selected2014amendment; original2014statement still needed.'));continue
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent','Assets','AssetsCurrent'):continue
        if (row['val']!=0 and format(abs(row['val']),',') not in source['text']) or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        if row['tag'] in ('Assets','AssetsCurrent'):
            note='The balance sheet separately labels current assets and total assets with equal selected amounts; displayed assets consist of cash and, where present, receivables or prepaid expenses. Current assets are part of total assets, not an additional amount. Visium cash/prepaid-license presentations and GRN historical gaps retain their own dates; matching amounts do not approve unrelated liability or revenue claims. No inference of company-wide classification equivalence.'
        else:
            if item['cik']!='0001492448':raise ValueError('Unreviewed liability issuer')
            note='GRN separately presents current and total liabilities with equal selected amounts, comprising displayed payables, accruals and related-party accruals and short-term notes net of the displayed discount where present. These overlapping totals must not be added or treated as universally interchangeable.'
        labels={'Assets':'total assets','AssetsCurrent':'total current assets','Liabilities':'total liabilities','LiabilitiesCurrent':'total current liabilities'}
        if labels[row['tag']] not in source['text'].lower():raise ValueError('Missing total label')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if (len(reviewed),len(pending))!=(40,2):raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.visium-grn-balance.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v13_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,'pending':pending,
      'scope':'40 additional observations reviewed from15primary tables;2selected amendment observations remain pending. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('40 reviewed;2 amendment observations pending')
if __name__=='__main__':main()
