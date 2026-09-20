"""Bind Visium's selected XBRL-only amendment to its original annual statement."""
import hashlib,json,sys
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'artifacts/seo'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    inputs={}
    def read(name):
        raw=(A/name).read_bytes();inputs[name]=sha(raw);return json.loads(raw)
    ledger=read('company-priority-scope-v13-20260920.json');capture=read('company-visium-original-capture-20260920.json')
    if not capture['complete'] or len(capture['filings'])!=1:raise ValueError('Incomplete capture')
    filing=capture['filings'][0]
    if (filing['cik'],filing['accession'])!=('0001082733','0001493152-16-007114'):raise ValueError('Wrong original')
    if not any('0001082733' in n and 'NuSTATE' in n for n in filing['index_filers']):raise ValueError('Issuer mismatch')
    for field in ['index_capture','primary_capture']:
        receipt=filing[field];raw=(ROOT/receipt['body_path']).read_bytes()
        if receipt['status']!=200 or len(raw)!=receipt['bytes'] or sha(raw)!=receipt['sha256']:raise ValueError('Capture mismatch')
    table=' '.join(' '.join(BeautifulSoup(raw,'html.parser').find_all('table')[87].stripped_strings).split())
    for text in ['June 30, 2014 2013','Total current assets 65 471','Total assets $ 65 $ 471']:
        if text not in table:raise ValueError('Original table changed')
    path=A/'corpus-local/equal-history-filings/0001082733-0001493152-16-007138-primary.response'
    receipt=json.loads(path.with_name(path.name.replace('.response','.receipt.json')).read_bytes());raw=path.read_bytes()
    if sha(raw)!=receipt['sha256']:raise ValueError('Amendment binding changed')
    text=' '.join(' '.join(BeautifulSoup(raw,'html.parser').stripped_strings).split());start=text.index('Explanatory Note');note=text[start:text.index('EXHIBIT INDEX',start)]
    if 'February 3, 2016' not in note or 'No other changes have been made' not in note or 'XBRL' not in note:raise ValueError('Amendment purpose changed')
    rows=[r for r in ledger['pending'] if r['cik']=='0001082733' and r['selected']['accn']=='0001493152-16-007138']
    if len(rows)!=2:raise ValueError('Selected scope changed')
    for r in rows:
        row=r['selected']
        if (row['end'],row['val'],row['accn'],row['unit'])!=('2013-06-30',471,'0001493152-16-007138','USD'):raise ValueError('Selected row changed')
    result={'schema':'canli.visium-original-context.v1','publication_approved':False,'input_sha256':inputs,'v13_scope_ledger_sha256':inputs['company-priority-scope-v13-20260920.json'],'code_sha256':sha(Path(__file__).read_bytes()),'original_filing':filing,'amendment_primary_sha256':sha(raw),'amendment_explanatory_note':note,'zero_based_table_index':87,'primary_table':table,'reviewed':[dict(r,interpretation='The original2014annual statement separately displays current/total assets471USD in its2013comparative column. The selected amendment explicitly adds only XBRL without other changes. Preserve amendment accession, historical NuState naming and all values; no substitution from a different reporting period.') for r in rows],'scope':'Two selected amendment observations now have retained original-statement context. No blanket entity admission or publication.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('2 Visium amendment observations reviewed')
if __name__=='__main__':main()
