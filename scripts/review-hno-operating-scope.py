"""Preserve HNO's non-operating-inclusive tagged result without rewriting values."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw): return hashlib.sha256(raw).hexdigest()
CONFIG = [
 ('corpus-local/fourth-editorial-filings/0001342916-0001342916-26-000008-primary.response', '13e87c8eb65089a81afb28ac8916505852fe332a1915af9d9c9b85ff2da50d83', [100]),
 ('corpus-local/equal-history-filings/0001342916-0001985705-25-000033-primary.response', 'bfb1cdb23e09ef7d2e431c96f0c8815be2e8ecd806d6d9495d79e9089f0eb73e', [113,132]),
 ('corpus-local/equal-history-filings/0001342916-0001262463-24-000015-primary.response', '3a1f34e96f409884af8204c564813a508003b7329d6cc0134973d568f4835942', [148]),
]
# Gross profit, operating expenses, separately displayed other result, tagged result.
PERIODS = {'2025-10-31': (65561,6527243,-153814,-6615496),
 '2024-10-31': (553,3317069,-22074,-3338590),
 '2023-10-31': (7115,1910168,-24441,-1927494),
 '2022-10-31': (6758,1078141,74,-1071309)}
def main():
    directory=A/'corpus-local/company-five-cohort-delivery-v11'
    manifest_raw=(directory/'delivery.json').read_bytes()
    entry=next(f for f in json.loads(manifest_raw)['files'] if f['cik']=='0001342916')
    raw=(directory/entry['selected']['storage_path']).read_bytes()
    if sha(raw)!=entry['selected']['sha256']: raise ValueError('Selected binding changed')
    record=json.loads(raw)
    if record['source_sha256']!='04f062ef5e20caad0e3d8bf8913f2790f3550faf496fbcc8e4266d8eb14abe28': raise ValueError('Source changed')
    concept=next(c for c in record['concepts'] if c['tag']=='OperatingIncomeLoss')
    sources=[]
    for name,expected,indices in CONFIG:
        raw=(A/name).read_bytes()
        if sha(raw)!=expected: raise ValueError('Primary changed')
        tables=BeautifulSoup(raw,'html.parser').find_all('table')
        extracts=[{'zero_based_table_index':i,'text':' '.join(tables[i].stripped_strings)} for i in indices]
        sources.append({'primary_path':str((A/name).relative_to(ROOT)), 'primary_sha256':expected, 'tables':extracts})
    checks=[]
    if {r['end'] for r in concept['observations']}!=set(PERIODS): raise ValueError('Period scope changed')
    for row in concept['observations']:
        gross,expenses,other,tagged=PERIODS[row['end']]
        if row['val']!=tagged or gross-expenses+other!=tagged or other==0: raise ValueError('Arithmetic changed')
        source=next(s for s in sources if row['accn'] in s['primary_path'])
        text=source['tables'][0]['text']
        if not all(format(abs(v),',') in text for v in (gross,expenses,other,tagged)): raise ValueError('Displayed figures missing')
        checks.append({'selected':row,'primary_sha256':source['primary_sha256'],'gross_profit':gross,'operating_expenses':expenses,'other_result':other,'derived_gross_less_operating_expenses':gross-expenses,'tagged_result':tagged})
    result={'schema':'canli.hno-operating-scope.v1','publication_approved':False,'cik':record['cik'],
      'source_sha256':record['source_sha256'],'selected_sha256':entry['selected']['sha256'],
      'delivery_manifest_sha256':sha(manifest_raw),'code_sha256':sha(Path(__file__).read_bytes()),
      'sources':sources,'checks':checks,'disposition':'WITHHOLD_OPERATING_INCOME_LOSS',
      'interpretation':'All four selected operating-loss values include the separately presented other income/expense result. The displayed label and XBRL agree numerically but conflict with the site definition excluding non-operating items. Preserve NetIncomeLoss and original values; do not replace reported values with the diagnostic arithmetic. The2023selected value is restated;2022includes interest expense within operating expenses. No uniform historical classification is inferred.',
      'supersedes':'The limited HNO latest-period interpretation in company-remaining-equality-context-20260920.json is insufficient and must not authorize admission. Original report remains preserved.',
      'scope':'Four selected periods and three retained primary filings reviewed. Publication hold required; not yet implemented in selection policy. No new scope-review credit claimed.'}
    with Path(sys.argv[1]).open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
    print('4 selected periods: operating-result publication hold required')
if __name__=='__main__':main()
