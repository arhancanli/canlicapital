"""Retain legacy revenue primary tables and an unresolved disclosure-date conflict."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'artifacts/seo'
CONFIG={
 ('0000066740','0001558370-19-000470'):[170,183,186,187],
 ('0000816956','0000816956-19-000003'):[107,143,147],
 ('0001127475','0001185185-21-001609'):[46,61],
 ('0001127475','0001185185-20-001749'):[49,64],
 ('0001127475','0001185185-19-001663'):[22,40],
 ('0001127475','0001185185-18-002178'):[34,47],
 ('0001551152','0001551152-19-000008'):[161,284,286]}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    prior_raw=(A/'company-historical-revenue-context-20260920.json').read_bytes()
    prior=json.loads(prior_raw);targets=[];filings=[]
    for p in sorted(A.glob('company-equal-history-*targets-20260920.json')):
        targets.extend(json.loads(p.read_bytes()).get('filings',[]))
    closure=json.loads((A/'company-equal-history-numerical-closure-20260920.json').read_bytes())
    for item in closure['inputs'][:3]:
        raw=(ROOT/item['path']).read_bytes()
        if sha(raw)!=item['sha256']:raise ValueError('Comparison changed')
        filings.extend(json.loads(raw)['filings'])
    sources=[]
    for (cik,accn),indices in CONFIG.items():
        paths={t['body_path'] for t in targets if t.get('cik')==cik and t.get('accession')==accn and 'body_path' in t}
        if len(paths)!=1:raise ValueError('Primary path ambiguity')
        path=paths.pop();raw=(ROOT/path).read_bytes();f=next(f for f in filings if f['cik']==cik and f['accession']==accn)
        if sha(raw)!=f['primary_sha256']:raise ValueError('Primary binding mismatch')
        tables=BeautifulSoup(raw,'html.parser').find_all('table');extracts=[]
        for index in indices:
            table=tables[index];previous=[]
            for node in table.previous_siblings:
                text=' '.join(node.get_text(' ',strip=True).split()) if hasattr(node,'get_text') else str(node).strip()
                if text:previous.append(text)
                if sum(map(len,previous))>600:break
            extracts.append({'zero_based_table_index':index,'text':' '.join(' '.join(table.stripped_strings).split()),'preceding_context':list(reversed(previous))})
        sources.append({'cik':cik,'accession':accn,'primary_path':path,'primary_sha256':sha(raw),'url':f['url'],'tables':extracts})
    reviewed=[];pending=[]
    for item in prior['pending']:
        row=item['selected'];source=next(s for s in sources if s['cik']==item['cik'] and s['accession']==row['accn'])
        result={k:item[k] for k in ['cik','name','selected']};result['primary_sha256']=source['primary_sha256'];result['url']=source['url']
        if item['cik']=='0001127475' and row['end']=='2020-08-31' and row['tag']=='RevenueFromContractWithCustomerExcludingAssessedTax':
            result['interpretation']='XBRL selects268,957USD for2020, but the preceding geographic disclosure explicitly describes2019 and its asset row also says2019. The statement of operations supports2020sales268,957USD; that does not resolve the geographic date conflict. Keep this observation scope-pending without silently correcting the source.'
            pending.append(result)
        else:
            result['interpretation']='Reviewed statement/disaggregation tables support the selected period and reported total, preserving the displayed units and comparative columns. Matching totals describe different presentations and must not be added; this is limited to this observation, not blanket tag equivalence.'
            reviewed.append(result)
    if (len(reviewed),len(pending))!=(14,1):raise ValueError('Fixed review scope changed')
    result={'schema':'canli.legacy-revenue-context.v1','publication_approved':False,'prior_context_sha256':sha(prior_raw),
            'baseline_scope_ledger_sha256':prior['baseline_scope_ledger_sha256'],'code_sha256':sha(Path(__file__).read_bytes()),
            'sources':sources,'reviewed':reviewed,'pending':pending,'scope':'Fourteen additional recorded primary-context checks; one geographic disclosure-date contradiction remains open. Original values and reports unchanged; no corpus admission.'}
    with Path(sys.argv[1]).open('x') as stream:stream.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'reviewed':len(reviewed),'pending':len(pending)}))
if __name__=='__main__':main()
