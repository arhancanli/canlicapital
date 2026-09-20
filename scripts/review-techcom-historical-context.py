"""Retain TECHCOM historical balance-sheet and zero-flow context."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001481443', '0001683168-20-001264'): (33, 35, 39), ('0001481443', '0001683168-21-001145'): (34, 36, 40), ('0001481443', '0001683168-22-002725'): (34, 36, 40), ('0001481443', '0001683168-23-002076'): (34, 36, 40), ('0001481443', '0001683168-24-002392'): (36, 38, 42), ('0001481443', '0001683168-25-002528'): (37, 39, 43), ('0001481443', '0001683168-26-002393'): (38, 40, 44)}

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
        tables=BeautifulSoup(raw,'html.parser').find_all('table')
        extracts=[{'zero_based_table_index':i,'text':' '.join(' '.join(tables[i].stripped_strings).split())} for i in index]
        sources[(cik,accn)]={'cik':cik,'accession':accn,'primary_path':path,'primary_sha256':sha(raw),
            'tables':extracts}
    reviewed=[]
    for item in json.loads(ledger_raw)['pending']:
        row=item['selected'];source=sources.get((item['cik'],row['accn']))
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent','Assets','AssetsCurrent','Revenues','PaymentsToAcquirePropertyPlantAndEquipment'):continue
        slot=1 if row['tag']=='Revenues' else 2 if row['tag']=='PaymentsToAcquirePropertyPlantAndEquipment' else 0
        text=source['tables'][slot]['text']
        if (row['val']!=0 and format(abs(row['val']),',') not in text) or row['end'][:4] not in text:raise ValueError('Selected comparative missing')
        if slot:
            if row['val']!=0:raise ValueError('Unexpected nonzero flow')
            label='Revenue' if slot==1 else 'Purchase of fixed assets'
            if label+' $ – $ –' not in text and label+' – –' not in text:raise ValueError('Missing explicitly zero flow row')
            note='Revenue in the operations statement and fixed-asset purchases in the cash-flow statement are explicitly zero for these selected comparative periods. They are distinct flows in separate statements; equality does not imply no activity, no expenses or no noncash transactions.'
        elif row['tag'] in ('Assets','AssetsCurrent'):
            note='Current and total assets are separately labeled with matching selected amounts, comprising cash or prepaid expenses as displayed. Zero assets in some periods do not imply no liabilities, expenses or activity.'
        else:
            note='Current and total liabilities are separately labeled with matching selected comparative amounts, comprising accruals, amounts due to shareholders and convertible note balances where displayed. They are overlapping totals, not additive or universally equivalent concepts. This review does not approve the adjacent2025column.'
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=42:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.techcom-historical-context.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v12_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,'follow_up':'The adjacent2025balance-sheet components23,648+285,204sum308,852USD versus reported current/total308,851USD. This1USDdiscrepancy is retained for review; no rounding explanation assumed and no source values altered. These latest-period rows are outside the42historical observations credited here.',
      'scope':'42 previously pending historical observations,21 tables across7retained filings. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('42 historical observations with retained primary context')
if __name__=='__main__':main()
