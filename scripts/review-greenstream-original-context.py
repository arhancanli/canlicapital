"""Bind the original balance sheet to the retained XBRL-only amendment review."""
import hashlib
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    artifacts = ROOT / 'artifacts/seo'
    inputs = {}
    for name in ['company-greenstream-original-capture-20260920.json', 'company-liability-legacy-context-20260920.json', 'company-liability-presentation-review-20260920.json']:
        raw = (artifacts / name).read_bytes()
        inputs[name] = {'sha256': sha(raw), 'data': json.loads(raw)}
    capture = inputs['company-greenstream-original-capture-20260920.json']['data']
    if not capture['complete'] or len(capture['filings']) != 1:
        raise ValueError('Incomplete original capture')
    filing = capture['filings'][0]
    if (filing['cik'], filing['accession']) != ('0001437476', '0001683168-21-004121'):
        raise ValueError('Wrong original filing')
    for key in ['index_capture', 'primary_capture']:
        receipt = filing[key]
        raw = (ROOT / receipt['body_path']).read_bytes()
        if receipt['status'] != 200 or len(raw) != receipt['bytes'] or sha(raw) != receipt['sha256']:
            raise ValueError('Capture binding mismatch')
    if not any('0001437476' in name and 'Green Stream Holdings' in name for name in filing['index_filers']):
        raise ValueError('Issuer identity mismatch')
    soup = BeautifulSoup(raw, 'html.parser')
    table = ' '.join(' '.join(soup.find_all('table')[74].stripped_strings).split())
    for required in ['April 30, 2021 April 30, 2020', 'Total Current Liabilities 927,297 591,789', 'TOTAL LIABILITIES 927,297 591,789']:
        if required not in table:
            raise ValueError('Reviewed balance-sheet context changed')
    amendment = next(c for c in inputs['company-liability-legacy-context-20260920.json']['data']['cases'] if c['cik'] == '0001437476')
    selected = next(c for c in inputs['company-liability-presentation-review-20260920.json']['data']['cases'] if c['cik'] == '0001437476')
    for item in selected['evidence']:
        row = item['check']['selected']
        if (row['end'], row['val'], row['unit'], row['accn']) != ('2021-04-30', 927297, 'USD', amendment['accession']):
            raise ValueError('Selected amendment observation mismatch')
    output = {'schema': 'canli.greenstream-original-context.v1', 'publication_approved': False,
              'input_sha256': {key: value['sha256'] for key, value in inputs.items()},
              'code_sha256': sha(Path(__file__).read_bytes()),
              'original_filing': filing, 'amendment_accession': amendment['accession'],
              'amendment_explanatory_note': amendment['explanatory_note'],
              'zero_based_table_index': 74, 'primary_table': table,
              'interpretation': 'The original annual-report balance sheet presents total current liabilities and total liabilities separately, each 927,297 USD at April 30, 2021. The retained amendment says it furnishes XBRL only, without other changes. This supplies primary statement context for the two selected amendment observations without changing their accession or values.',
              'scope': 'Limited latest-selected-pair context closure. No all-history review, concept interchangeability, page admission or publication.'}
    with Path(sys.argv[1]).open('x') as stream:
        stream.write(json.dumps(output, indent=2) + '\n')
    print('Original balance-sheet context verified for two amendment observations')

if __name__ == '__main__':
    main()
