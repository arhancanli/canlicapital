"""Retain remaining small-issuer historical statement context."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
TABLES={('0001162283', '0001206774-12-001216'): 9, ('0001162283', '0001206774-13-000995'): 5, ('0001162283', '0001206774-14-000629'): 5, ('0001162283', '0001206774-16-004539'): 7, ('0001162283', '0001206774-18-000929'): 8, ('0001162283', '0001206774-19-000585'): 9, ('0001409253', '0001477932-13-001791'): 21, ('0001409253', '0001477932-14-001398'): 33, ('0001409253', '0001477932-15-002260'): 43, ('0001409253', '0001477932-16-009764'): 46, ('0001409253', '0001477932-17-001940'): 62, ('0001409253', '0001477932-18-001945'): 59, ('0001410708', '0001372167-12-000044'): 5, ('0001437476', '0001683168-20-003399'): 102, ('0001584618', '0001014897-16-000534'): 8, ('0001584618', '0001014897-17-000084'): 8, ('0001584618', '0001617819-15-000011'): 16}

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
        if source is None or row['tag'] not in ('Liabilities','LiabilitiesCurrent','AccountsPayableCurrent','AssetsCurrent','CashAndCashEquivalentsAtCarryingValue'):continue
        if (row['val']!=0 and format(abs(row['val']),',') not in source['text']) or row['end'][:4] not in source['text']:raise ValueError('Selected comparative missing')
        notes={
         '0001162283':'Accounts payable is the sole displayed current-liability component for the selected date and equals the separately reported current total. This does not make accounts payable universally equivalent to all current obligations; other asset classifications and missing historical years are outside the conclusion.',
         '0001409253':'Current and total liabilities are separately displayed with matching selected amounts, including payables and related-party or other notes. Preserve reclassifications between payables and related-party amounts across comparative filings and separately displayed preferred stock; no uniform presentation across all years is inferred.',
         '0001410708':'Cash is the sole displayed current asset for these selected2010/2011dates and equals total current assets. Zero cash is explicitly displayed for2011. This asset-only conclusion does not approve liability arithmetic or infer no business activity.',
         '0001437476':'Current and total liabilities match for the selected2019comparative date. The statement separately carries substantial fixed and intangible assets; equal liability totals do not imply that all assets are current.',
         '0001584618':'Current and total liabilities are separately displayed with matching selected amounts, including acquisition payable, accrued interest and related-party/other notes as presented. Historical Arrakis naming and differing asset/equity presentations remain preserved; this is limited to the selected liability totals.'}
        note=notes[item['cik']]
        reviewed.append(dict(item,primary_sha256=source['primary_sha256'],primary_path=source['primary_path'],interpretation=note))
    if len(reviewed)!=36:raise ValueError('Fixed historical review scope changed')
    result={'schema':'canli.small-issuer-context.v1','publication_approved':False,
      'baseline_scope_ledger_sha256':sha((A/'company-priority-scope-coverage-20260920.json').read_bytes()),
      'v13_scope_ledger_sha256':sha(ledger_raw),'numerical_closure_sha256':sha(closure_raw),
      'code_sha256':sha(Path(__file__).read_bytes()),'sources':list(sources.values()),'reviewed':reviewed,
      'scope':'36 previously pending historical observations,17 retained primary statements. Recorded manual context review with exact sources and selected comparative periods; not machine-certified interpretation, whole-company admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('36 historical observations with retained primary context')
if __name__=='__main__':main()
