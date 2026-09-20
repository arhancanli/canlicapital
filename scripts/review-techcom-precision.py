"""Record a limited precision diagnostic; this is not a Calculations 1.1 validator."""
import hashlib
import json
import sys
import subprocess
from decimal import Decimal
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
PRIMARY = '1d8ae4966547ef5f16d01c54d6c9656c45c59c9bfb4e5fe90c3cab5215f00bc5'
SOURCE = 'a4aaec36525a4107ae73b7a04898c305f4fd1f347a78da73322f9276cb861fa3'
SPEC = 'https://www.xbrl.org/Specification/calculation-1.1/REC-2023-02-22+corrected-errata-2024-02-14/calculation-1.1-REC-2023-02-22+corrected-errata-2024-02-14.html'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    ledger_raw = (A / 'company-priority-scope-v13-20260920.json').read_bytes()
    ledger = json.loads(ledger_raw)
    stem = A / 'corpus-local/fifth-editorial-filings/0001481443-0001683168-26-002393-primary'
    raw = stem.with_suffix('.response').read_bytes()
    receipt = json.loads(stem.with_suffix('.receipt.json').read_bytes())
    if sha(raw) != PRIMARY or receipt['sha256'] != PRIMARY or receipt['status'] != 200 or receipt['bytes'] != len(raw):
        raise ValueError('Primary capture changed')
    soup = BeautifulSoup(raw, 'html.parser')
    table = soup.find_all('table')[38]
    context = soup.find('xbrli:context', id='AsOf2025-12-31')
    if ' '.join(context.stripped_strings) != '0001481443 2025-12-31' or context.find(['xbrli:segment', 'xbrli:scenario']):
        raise ValueError('Unexpected context')
    if soup.find('xbrli:unit', id='USD').get_text(strip=True) != 'iso4217:USD':
        raise ValueError('Unexpected unit')
    expected = {
        'Fact000077': ('us-gaap:AccountsPayableAndOtherAccruedLiabilitiesCurrent', 23648),
        'Fact000080': ('TCRI:DueToShareholders', 285204),
        'Fact000083': ('us-gaap:LiabilitiesCurrent', 308851),
        'Fact000086': ('us-gaap:Liabilities', 308851),
        'Fact000120': ('us-gaap:StockholdersEquity', -307913),
        'Fact000123': ('us-gaap:LiabilitiesAndStockholdersEquity', 939),
    }
    facts = []
    for ident, (name, value) in expected.items():
        matches = table.find_all('ix:nonfraction', id=ident)
        if len(matches) != 1:
            raise ValueError('Missing/duplicate reviewed fact')
        fact = matches[0]
        attributes = dict(fact.attrs)
        required = dict(name=name, contextref='AsOf2025-12-31', id=ident, format='ixt:numdotdecimal', decimals='0', unitref='USD')
        if value < 0:
            required['sign'] = '-'
        if attributes != required or int(fact.get_text().replace(',', '')) != abs(value):
            raise ValueError('Fact value/precision changed')
        facts.append(dict(attributes=attributes, value=value))
    half = Decimal('0.5')
    component_sum = sum(Decimal(expected[k][1]) for k in ['Fact000077', 'Fact000080'])
    total = Decimal(expected['Fact000083'][1])
    summed_interval = [component_sum - 2 * half, component_sum + 2 * half]
    total_interval = [total - half, total + half]
    overlap = [max(summed_interval[0], total_interval[0]), min(summed_interval[1], total_interval[1])]
    if overlap != [Decimal('308851'), Decimal('308851.5')]:
        raise ValueError('Unexpected precision diagnostic')
    rows = [r for r in ledger['pending'] if r['cik'] == '0001481443' and r['selected']['end'] == '2025-12-31' and r['selected']['tag'] in ['Liabilities', 'LiabilitiesCurrent']]
    if len(rows) != 2:
        raise ValueError('Review scope changed')
    notes = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {FILING_NOTES} from './scripts/lib/company-filing-notes.mjs'; console.log(JSON.stringify(FILING_NOTES.filter(n=>n.cik==='0001481443')))"], cwd=ROOT))
    if len(notes) != 1 or notes[0]['source_sha256'] != SOURCE:
        raise ValueError('Missing source-bound public explanation')
    for r in rows:
        row = r['selected']
        if (row['end'], row['val'], row['unit'], row['accn']) != ('2025-12-31', 308851, 'USD', '0001683168-26-002393'):
            raise ValueError('Selected row changed')
        if not any(all(o.get(k) == row.get(k) for k in ['tag', 'end', 'val', 'unit', 'accn']) for o in notes[0]['observations']):
            raise ValueError('Public explanation scope mismatch')
    interpretation = ('Retain both explicitly reported totals with a visible discrepancy note. Current liabilities are included in total liabilities, not additive. Components exceed the reported total by 1 USD; finite precision permits round-to-nearest compatibility but does not establish its cause. No corrected values, full calculation validation or company-wide admission.')
    result = dict(schema='canli.techcom-precision-context.v1', publication_approved=False,
        code_sha256=sha(Path(__file__).read_bytes()), v13_scope_ledger_sha256=sha(ledger_raw),
        primary_capture=receipt, company_source_sha256=SOURCE, zero_based_table_index=38,
        table=' '.join(table.stripped_strings), context=str(context), facts=facts,
        specification=SPEC, sections=['5.2', '5.2.3', '5.2.4', '5.7'],
        diagnostic=dict(displayed_component_sum=int(component_sum), reported_total=int(total),
            difference_usd=int(component_sum-total),
            round_to_nearest_component_interval=list(map(str, summed_interval)),
            round_to_nearest_total_interval=list(map(str, total_interval)),
            round_to_nearest_overlap=list(map(str, overlap)),
            positive_truncation_component_interval='[308852,308854)',
            positive_truncation_total_interval='[308851,308852)', truncation_overlap=False,
            adjacent_balance_difference='308851 + (-307913) = 938 versus reported 939'),
        public_note=notes[0], public_note_module_sha256=sha((ROOT/'scripts/lib/company-filing-notes.mjs').read_bytes()),
        reviewed=[dict(r, interpretation=interpretation) for r in rows],
        scope='Manual scope disposition for two reported observations with disclosure. Conditional precision arithmetic only: no taxonomy relationships, report-wide duplicates or issuer rounding method certified. Broader corpus admission remains open.')
    with Path(sys.argv[1]).open('x') as f:
        f.write(json.dumps(result, indent=2)+'\n')
    print('2 observations reviewed with a source-bound discrepancy note')

if __name__ == '__main__':
    main()
