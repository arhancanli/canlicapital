"""Resolve the predecessor opening date; retain the original USN unit explicitly."""
from datetime import date, timedelta
import gzip
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    report_path = A / 'company-currency-context-review-20260920.json'
    original = json.loads(report_path.read_bytes())
    row = next(f for f in original['filings'] if f['cik'] == '0001818874')
    for receipt in [row['primary_capture'], row['instance_capture']]:
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and sha(raw) == receipt['sha256'] and len(raw) == receipt['bytes']
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/sofi-predecessor-reviewed-source.json.gz').read_bytes())
    assert sha(source) == row['target']['source_sha256'] == 'e2de0cfed1d347a12db62fae8e229db2371c401fae7b357985c4e1932a1d129a'
    assert row['accession'] == '0001104659-21-053909'
    selected = row['checks'][0]['selected']
    assert selected['end'] == '2020-07-09' and selected['unit'] == 'USN' and selected['val'] == 0
    assert row['checks'][0]['matched'] and 'Balance – July 10, 2020 (inception)' in row['primary_table']
    standards = {}
    for name in ['xbrl-dates', 'iso4217-list-one']:
        receipt = json.loads((A / 'corpus-local/currency-context-standards' / (name + '.receipt.json')).read_bytes())
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
        standards[name] = dict(receipt=receipt)
        if name == 'xbrl-dates':
            text = ' '.join(' '.join(BeautifulSoup(raw, 'html.parser').stripped_strings).split())
            assert 'it is interpreted as referring to the end of the stated date' in text
            standards[name]['interpretation'] = 'An XML instant expressed as a date denotes the end of that date, equivalent to the beginning of the next day.'
        else:
            root = ET.fromstring(raw)
            units = [n for n in root.findall('.//CcyNtry') if n.findtext('Ccy') == 'USN']
            assert len(units) == 1
            unit = units[0]
            assert unit.findtext('CcyNm') == 'US Dollar (Next day)' and unit.find('CcyNm').get('IsFund') == 'true'
            standards[name].update(published=root.get('Pblshd'), unit_xml=ET.tostring(unit, encoding='unicode'))
    midnight = str(date.fromisoformat(selected['end']) + timedelta(days=1)) + 'T00:00:00'
    assert midnight == '2020-07-10T00:00:00'
    result = dict(schema='canli.predecessor-opening-context.v1', publication_approved=False,
        original_review_sha256=sha(report_path.read_bytes()), code_sha256=sha(Path(__file__).read_bytes()),
        source_sha256=sha(source), filing_evidence=row, standards=standards,
        equivalent_boundary=midnight,
        disposition='RETAIN_ORIGINAL_ZERO_WITH_PREDECESSOR_DATE_AND_UNIT_CAVEAT',
        conclusion='The July 9 XML instant and July 10 opening balance describe the same boundary. The value belongs to Social Capital Hedosophia Holdings Corp. V. USN is a defined next-day dollar fund code, not an invented currency. Retain the source zero, date and unit separately from USD, with explicit context. The code list does not establish why the issuer used this unit for equity; do not claim the tagging choice is certified.',
        scope='One observation reviewed with a disclosed source-unit limitation. No conversion, source correction, whole-company admission, rebuilt runtime, deployment or indexing claim.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print('Opening-date equivalence verified; original USN retained with explicit limitation')

if __name__ == '__main__':
    main()
