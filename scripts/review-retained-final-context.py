"""Review remaining HNO net-loss and Green Stream comparative liability context."""
import hashlib,json,sys
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'artifacts/seo'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    inputs={}
    def read(name):
        raw=(A/name).read_bytes();inputs[name]=sha(raw);return json.loads(raw)
    ledger=read('company-priority-scope-v13-20260920.json')
    hno=read('company-hno-operating-scope-20260920.json')
    green=read('company-greenstream-original-context-20260920.json')
    for name,digest in green['input_sha256'].items():
        if sha((A/name).read_bytes())!=digest:raise ValueError('Original context input changed')
    for source in hno['sources']:
        raw=(ROOT/source['primary_path']).read_bytes()
        if sha(raw)!=source['primary_sha256']:raise ValueError('HNO primary changed')
        tables=BeautifulSoup(raw,'html.parser').find_all('table')
        for saved in source['tables']:
            if ' '.join(tables[saved['zero_based_table_index']].stripped_strings)!=saved['text']:raise ValueError('HNO table changed')
    capture=green['original_filing']['primary_capture'];raw=(ROOT/capture['body_path']).read_bytes()
    if sha(raw)!=capture['sha256'] or len(raw)!=capture['bytes']:raise ValueError('Green primary changed')
    text=' '.join(' '.join(BeautifulSoup(raw,'html.parser').find_all('table')[74].stripped_strings).split())
    if text!=green['primary_table'] or 'Total Current Liabilities 927,297 591,789' not in text or 'TOTAL LIABILITIES 927,297 591,789' not in text:raise ValueError('Green comparative changed')
    reviewed=[]
    for item in ledger['pending']:
        row=item['selected']
        if item['cik']=='0001342916' and row['tag']=='NetIncomeLoss':
            found=[c for c in hno['checks'] if c['selected']=={k:v for k,v in row.items() if k!='tag'}]
            if len(found)!=1:raise ValueError('HNO selected period changed')
            reviewed.append(dict(item,primary_sha256=found[0]['primary_sha256'],interpretation='The retained statement explicitly reports this net loss after other income/expenses. The2023selected value is restated. The separate operating-loss series remains withheld; net loss is not rewritten or used to reinstate operating loss.'))
        if item['cik']=='0001437476' and row['accn']==green['amendment_accession']:
            if (row['end'],row['val'],row['accn'],row['unit'])!=('2020-04-30',591789,green['amendment_accession'],'USD'):raise ValueError('Green selected comparative changed')
            reviewed.append(dict(item,primary_sha256=capture['sha256'],original_accession=green['original_filing']['accession'],interpretation='Original annual-report balance sheet separately reports both liability totals591,789USD in its2020comparative column. The retained amendment explicitly furnishes XBRL only without other changes. Selected amendment accession remains intact; no claim of an independently captured2020original.'))
    if len(reviewed)!=5:raise ValueError('Fixed review scope changed')
    result={'schema':'canli.retained-final-context.v1','publication_approved':False,'input_sha256':inputs,'v13_scope_ledger_sha256':inputs['company-priority-scope-v13-20260920.json'],'code_sha256':sha(Path(__file__).read_bytes()),'reviewed':reviewed,'scope':'Five remaining observations reviewed using reverified retained primary context. Manual interpretations recorded, not independent certification; no whole-corpus admission.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('5 remaining observations reviewed')
if __name__=='__main__':main()
