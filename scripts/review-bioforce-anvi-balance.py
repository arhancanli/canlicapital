"""Retain Bioforce and ANVI historical balance-sheet context."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001310488', '0001091818-19-000088'): 15, ('0001310488', '0001091818-20-000039'): 15, ('0001310488', '0001091818-21-000016'): 13, ('0001310488', '0001091818-22-000014'): 12, ('0001310488', '0001091818-23-000044'): 34, ('0001310488', '0001091818-24-000034'): 26, ('0001310488', '0001091818-25-000036'): 25, ('0001310488', '0001091818-26-000047'): 28, ('0001570132', '0001079973-24-000814'): 24, ('0001570132', '0001079973-25-000921'): 24, ('0001570132', '0001079973-26-000779'): 24, ('0001570132', '0001553350-17-000507'): 14, ('0001570132', '0001553350-19-000666'): 18, ('0001570132', '0001553350-20-000640'): 9, ('0001570132', '0001553350-21-000499'): 29, ('0001570132', '0001553350-22-000530'): 28, ('0001570132', '0001553350-23-000316'): 24, ('0001570132', '0001570132-14-000003'): 2}

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
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent','Assets','AssetsCurrent'):continue
        if (row['val']!=0 and format(abs(row['val']),',') not in source['text']) or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        if row['tag'] in ('Assets','AssetsCurrent'):
            note='The balance sheet separately labels current assets and total assets with equal selected amounts; displayed assets consist of cash and, where present, receivables or prepaid expenses. Current assets are part of total assets, not an additional amount. ANVI comparative statements retain restatement labels and the earlier VETRO entity name; these dates do not establish a constant business perimeter or approval of liability classification. No inference of company-wide classification equivalence.'
        else:
            if item['cik']!='0001310488':raise ValueError('Unreviewed liability issuer')
            note='Bioforce separately presents current and total liabilities with equal selected amounts, comprising displayed payables, accruals and director compensation and related-party amounts where displayed. These overlapping totals must not be added or treated as universally interchangeable.'
        labels={'Assets':'total assets','AssetsCurrent':'total current assets','Liabilities':'total liabilities','LiabilitiesCurrent':'total current liabilities'}
        if labels[row['tag']] not in source['text'].lower():raise ValueError('Missing total label')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=52:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.bioforce-anvi-balance.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v13_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'52 previously pending historical observations,18 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('52 historical observations with retained primary context')
if __name__=='__main__':main()
