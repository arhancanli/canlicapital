"""Retain four-issuer historical liability context with restatement boundaries."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0000932021', '0001493152-20-023967'): 48, ('0000932021', '0001493152-21-025316'): 83, ('0000932021', '0001493152-22-028326'): 76, ('0000932021', '0001493152-23-046428'): 69, ('0000932021', '0001493152-24-038049'): 121, ('0000932021', '0001493152-25-029524'): 102, ('0001393772', '0001096906-24-000701'): 93, ('0001393772', '0001096906-25-000350'): 45, ('0001393772', '0001096906-26-000507'): 82, ('0001393772', '0001199835-12-000236'): 36, ('0001393772', '0001199835-20-000096'): 78, ('0001393772', '0001199835-21-000170'): 73, ('0001393772', '0001199835-22-000183'): 43, ('0001393772', '0001199835-23-000186'): 55, ('0001393772', '0001654954-19-004420'): 38, ('0001420108', '0001214782-12-000044'): 48, ('0001420108', '0001477932-14-002329'): 52, ('0001420108', '0001477932-14-003318'): 25, ('0001420108', '0001477932-15-001981'): 32, ('0001420108', '0001477932-16-009786'): 32, ('0001420108', '0001477932-17-001354'): 32, ('0001430300', '0001477932-21-001405'): 45, ('0001430300', '0001477932-22-002028'): 47, ('0001430300', '0001477932-23-002575'): 46, ('0001430300', '0001477932-24-003836'): 41}

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
        notes={
          '0000932021':'Separate current and total liability rows agree. Components include derivative liabilities and debt discounts; the2024comparative in the2025filing is explicitly restated, so the earlier6,830,211USD must not be substituted for the selected restated1,236,037USD. No uniform restatement across all dates inferred.',
          '0001393772':'Separate current and total liability rows agree, with related-party debt, leases and asset retirement obligations classified in the displayed current section where present. Preserve historical United Mines naming and unaudited comparative labels; this is reported classification, not independent reassessment of maturities.',
          '0001420108':'Separate current and total liability rows agree. Displayed current items include short-term/convertible and related-party notes, payables and stock-issuance liabilities in older Bio-Solutions statements. Historical entity names and dates remain distinct.',
          '0001430300':'Separate current and total liability rows agree, including shareholder balances, legal-settlement reserves or other current liabilities as displayed. Matching totals are overlapping concepts, not additive or universally interchangeable.'}
        note=notes[item['cik']]
        text=source['text'].lower()
        if 'current liabilities' not in text or 'total liabilities' not in text:raise ValueError('Missing current section or total label')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=52:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.four-issuer-liability.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v13_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'52 previously pending historical observations,25 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('52 historical observations with retained primary context')
if __name__=='__main__':main()
