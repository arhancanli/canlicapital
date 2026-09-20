"""Retain reviewed historical operating/net-loss context for Nika and TECHCOM."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={
 ('0001145604','0001826466-22-000017'):10,
 ('0001145604','0001826466-23-000014'):8,
 ('0001145604','0001826466-24-000041'):11,
 ('0001145604','0001826466-25-000030'):7,
 ('0001145604','0001826466-26-000026'):9,
 ('0001481443','0001683168-20-001264'):35,
 ('0001481443','0001683168-21-001145'):36,
 ('0001481443','0001683168-22-002725'):36,
 ('0001481443','0001683168-23-002076'):36,
 ('0001481443','0001683168-24-002392'):38,
 ('0001481443','0001683168-25-002528'):39,
 ('0001481443','0001683168-26-002393'):40,
}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    ledger_raw=(A/'company-priority-scope-v11-20260920.json').read_bytes()
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
        if source is None or row['tag'] not in ('NetIncomeLoss','OperatingIncomeLoss'):continue
        if format(abs(row['val']),',') not in source['text'] or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        note=('The statement separately reports operating loss, loss before tax and net loss; displayed tax provision is zero. The selected comparative periods have equal operating and net loss, with no intervening non-operating result displayed. The measures remain distinct; this does not approve the separately withheld revenue series.' if item['cik']=='0001145604' else 'The statement places operating loss before a separately displayed other-income/expense block whose debt-forgiveness, interest and total rows are zero in the selected comparative periods. Net loss therefore equals operating loss for these periods. This is not evidence of equivalence outside these dates.')
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=24:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.nika-techcom-loss-context.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v11_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'24 previously pending historical observations,12 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('24 historical observations with retained primary context')
if __name__=='__main__':main()
