"""Reproduce the source basis for excluding a capitalization threshold history."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
cache = ROOT / 'artifacts/seo/corpus-local/fourth-editorial-filings'
initial_path = ROOT / 'artifacts/seo/company-fourth-liberty-scope-20260920.json'
initial = json.loads(initial_path.read_bytes())
receipts = {'primary': initial['primary_capture'], 'instance': initial['instance_capture']}
for kind in ['pre', 'lab', 'cal']:
    receipts[kind] = json.loads((cache / f'liberty-2021-{kind}.xml.receipt.json').read_bytes())
raw = {}
for key, receipt in receipts.items():
    data = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(data) == receipt['bytes']
    assert hashlib.sha256(data).hexdigest() == receipt['sha256']
    raw[key] = data
text = ' '.join(BeautifulSoup(raw['primary'], 'html.parser').get_text(' ', strip=True).split())
passage = 'We capitalize all purchased equipment over $500 with a useful life of more than one year.'
assert text.count(passage) == 1
x = '{http://www.w3.org/1999/xlink}'
roles = []
for link in ET.fromstring(raw['pre']):
    refs = {n.get(x + 'label') for n in link if n.get(x + 'href', '').endswith('#us-gaap_PaymentsToAcquirePropertyPlantAndEquipment')}
    if refs:
        roles.append(link.get(x + 'role'))
assert roles == ['http://libertystaruranium.com/role/SummaryOfSignificantAccountingPoliciesDetailsNarrative']
for link in ET.fromstring(raw['cal']):
    assert not any(n.get(x + 'href', '').endswith('#us-gaap_PaymentsToAcquirePropertyPlantAndEquipment') for n in link)
facts = [n for n in ET.fromstring(raw['instance']) if n.tag.endswith('}PaymentsToAcquirePropertyPlantAndEquipment')]
assert len(facts) == 1 and facts[0].text == '500'
report = {
    'schema': 'canli.editorial-scope-disposition.v1', 'publication_approved': False,
    'cik': '0001172178', 'tag': 'PaymentsToAcquirePropertyPlantAndEquipment',
    'source_sha256': '4915970839453514b4b5e641234178fd6f2c03d99ec5b6bdb74b786956db6290',
    'filing_receipts': receipts, 'primary_policy_passage': passage,
    'presentation_roles': roles, 'calculation_relationships': 0,
    'disposition': 'EXCLUDE_CONCEPT_CAPITALIZATION_THRESHOLD_NOT_ANNUAL_SPENDING',
    'reason': 'The USD500 fact appears only in the accounting-policy narrative presentation role. The primary note identifies USD500 as the capitalization threshold. Omit this generic spending history from this exact source snapshot; do not claim every historical filing was reviewed.',
    'prior_hold_sha256': hashlib.sha256(initial_path.read_bytes()).hexdigest(),
    'code_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
(ROOT / 'artifacts/seo/company-fourth-liberty-disposition-20260920.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['disposition'])
