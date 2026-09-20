"""Review Atlantica historical balance sheets and retain component-total conflicts."""
import hashlib
import json
from pathlib import Path
import sys
import re
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001062506', '0001010412-12-000126'): 6, ('0001062506', '0001062506-26-000010'): 5, ('0001062506', '0001548123-13-000117'): 6, ('0001062506', '0001548123-14-000047'): 6, ('0001062506', '0001548123-15-000042'): 6, ('0001062506', '0001548123-16-000510'): 6, ('0001062506', '0001548123-17-000047'): 6, ('0001062506', '0001548123-18-000063'): 7, ('0001062506', '0001548123-19-000054'): 5, ('0001062506', '0001548123-20-000042'): 5, ('0001062506', '0001548123-21-000030'): 5, ('0001062506', '0001548123-22-000013'): 14, ('0001062506', '0001548123-23-000123'): 5, ('0001062506', '0001548123-24-000018'): 5, ('0001062506', '0001548123-25-000017'): 5}

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
        rows=[' '.join(' '.join(r.stripped_strings).split()) for r in table.find_all('tr')]
        def amounts(prefix):
            matching=[r for r in rows if r.lower().startswith(prefix.lower()) and re.match(r'^[\s$]*[\d(]',r[len(prefix):])]
            if len(matching)!=1:raise ValueError('Ambiguous statement row: '+prefix)
            values=[int(v.replace(',','')) for v in re.findall(r'\d[\d,]*',matching[0][len(prefix):])]
            if len(values)!=2:raise ValueError('Unexpected comparative columns')
            return values
        components=[amounts(label) for label in ['Accounts Payable $','Accounts Payable - Related Parties','Note Payable - Related Parties']]
        interest=next(r for r in rows if r.startswith('Interest Payable'))
        components.append([int(v.replace(',','')) for v in re.findall(r'\d[\d,]*',interest)])
        totals=amounts('Total Liabilities')
        current=amounts('Total Current Liabilities')
        if totals!=current:raise ValueError('Current/total mismatch')
        differences=[sum(c[i] for c in components)-totals[i] for i in range(2)]
        sources[(cik,accn)]={'cik':cik,'accession':accn,'primary_path':path,'primary_sha256':sha(raw),
            'zero_based_table_index':index,'liability_components':components,'liability_totals':totals,'component_minus_total':differences,'text':' '.join(' '.join(table.stripped_strings).split())}
    reviewed=[];pending=[]
    for item in json.loads(ledger_raw)['pending']:
        row=item['selected'];source=sources.get((item['cik'],row['accn']))
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent','Assets','AssetsCurrent'):continue
        if (row['val']!=0 and format(abs(row['val']),',') not in source['text']) or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        if row['tag'] in ('Liabilities','LiabilitiesCurrent') and row['end']=='2023-12-31':
            if source['component_minus_total']!=[0,18000]:raise ValueError('Recorded conflict changed')
            pending.append(dict(item,primary_sha256=source['primary_sha256'],reason='Selected2023comparative total5,253,160USD differs from displayed components totaling5,271,160USD. The related-party note is731,653USD here versus713,653USD in the earlier filing. Preserve both; no source correction or admission.'))
            continue
        if any(source['component_minus_total']) and row['tag'] in ('Liabilities','LiabilitiesCurrent'):raise ValueError('Additional unreviewed conflict')
        note=('Current/total assets are separately displayed and equal at this comparative date, mostly zero with a5,000USDprepaid amount in2013. Zero assets do not imply no liabilities or activity.' if row['tag'] in ('Assets','AssetsCurrent') else 'Current/total liabilities are separately displayed and equal; payable, related-party note and interest components add to the displayed totals in both columns. These are overlapping totals, not additive concepts.')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if (len(reviewed),len(pending))!=(58,2):raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.atlantica-historical-balance.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v12_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,'pending':pending,
      'scope':'58 additional observations reviewed across15retained statements;2liability observations remain unresolved due to component-total contradiction. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('58 reviewed;2 unresolved liability observations')
if __name__=='__main__':main()
