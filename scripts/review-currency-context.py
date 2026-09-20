"""Replay three fixed currency observations and preserve their primary context."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def text(node):
    return ' '.join(' '.join(node.stripped_strings).split())


def main():
    inputs = {}

    def read(name):
        raw = (A / name).read_bytes()
        inputs[name] = sha(raw)
        return json.loads(raw)

    targets = read('company-currency-context-targets-20260920.json')
    capture = read('company-currency-context-capture-20260920.json')
    primary = read('company-currency-context-primary-20260920.json')
    legacy = read('company-currency-context-legacy-20260920.json')
    assert capture['complete'] and not capture.get('error')
    assert legacy['complete'] and not legacy.get('access_stop')
    assert capture['input_sha256'] == inputs['company-currency-context-targets-20260920.json']
    assert primary['capture_report_sha256'] == legacy['capture_sha256'] == inputs['company-currency-context-capture-20260920.json']
    assert legacy['comparison_sha256'] == inputs['company-currency-context-primary-20260920.json']
    expected = {'0001280452': '0001437749-14-003761',
                '0001659494': '0001104659-26-047273',
                '0001818874': '0001104659-21-053909'}
    assert len(targets['targets']) == len(capture['filings']) == 3
    assert {f['cik']: f['accession'] for f in capture['filings']} == expected
    helpers = {}
    for name in ['review-company-editorial-xbrl', 'review-basic-diluted-filings']:
        path = ROOT / 'scripts' / (name + '.py')
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        helpers[name] = module
        inputs[str(path.relative_to(ROOT))] = sha(path.read_bytes())

    def verified(receipt):
        path = (ROOT / receipt['body_path']).resolve()
        path.relative_to(A / 'corpus-local')
        raw = path.read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes'] and sha(raw) == receipt['sha256']
        return raw

    results = []
    for target in targets['targets']:
        cik = target['cik']
        accession = expected[cik]
        assert target['latest_selected_accession'] == accession
        filing = next(f for f in capture['filings'] if f['cik'] == cik)
        verified(filing['index_capture'])
        soup = BeautifulSoup(verified(filing['primary_capture']), 'html.parser')
        body_text = text(soup)
        rows = [dict(r, cik=cik, tag=target['tag']) for r in target['latest_accession_observations']]
        assert len(rows) == 1
        result = dict(cik=cik, accession=accession, target=target,
                      index_filers=filing['index_filers'], primary_capture=filing['primary_capture'])
        if cik != '0001659494':
            original = next(f for f in legacy['filings'] if f['cik'] == cik)
            raw = verified(original['instance_capture'])
            checks = helpers['review-company-editorial-xbrl'].compare(raw, cik, rows)
            assert checks == original['checks'] and all(c['matched'] for c in checks)
            root = ET.fromstring(raw)
            ns = {'x': 'http://www.xbrl.org/2003/instance'}
            evidence = []
            for match in checks[0]['matches']:
                unit = root.find("x:unit[@id='" + match['unit_id'] + "']", ns)
                context = root.find("x:context[@id='" + match['context_id'] + "']", ns)
                evidence.append(dict(unit_xml=ET.tostring(unit, encoding='unicode'),
                                     context_xml=ET.tostring(context, encoding='unicode')))
            result.update(instance_capture=original['instance_capture'], checks=checks, xml_evidence=evidence)
        if cik == '0001280452':
            table = text(soup.find_all('table')[142])
            disclosure = 'Our sales outside the United States are transacted in U.S. dollars.'
            assert disclosure in body_text and 'Revenue $ 238,091 $ 213,813 $ 196,519' in table
            result.update(primary_table=table, zero_based_table_index=142,
                          currency_disclosure=disclosure,
                          disposition='SOURCE_UNIT_CONFLICT_REQUIRES_TARGETED_HOLD',
                          reason='The original XBRL labels 2012 revenue as AFN, whereas the primary revenue statement displays dollars and says foreign sales transact in U.S. dollars. Do not relabel or convert this observation.')
        elif cik == '0001659494':
            helper = helpers['review-basic-diluted-filings']
            nodes = soup.find_all(attrs={'name': 'us-gaap:CashAndCashEquivalentsAtCarryingValue'})
            matched = []
            for node in nodes:
                unit = soup.find(id=node.get('unitref'))
                context = soup.find(id=node.get('contextref'))
                if unit is None or context is None:
                    continue
                measures = unit.find_all(lambda n: helper.local(n) == 'measure')
                if len(measures) != 1 or helper.qname(measures[0], measures[0].get_text(strip=True)) != ('http://www.xbrl.org/2003/iso4217', 'SAR'):
                    continue
                assert helper.qname(node, node.name)[0] == 'http://www.xbrl.org/2013/inlineXBRL'
                assert helper.qname(node, node['name'])[0].startswith('http://fasb.org/us-gaap/')
                assert helper.field(context, 'identifier') == cik
                assert helper.field(context, 'instant') == rows[0]['end']
                assert not context.find(lambda n: helper.local(n) in ('explicitmember', 'typedmember'))
                assert helper.numeric(node) == rows[0]['val']
                paragraph = node.find_parent('p')
                assert paragraph is not None
                paragraph_text = text(paragraph)
                assert 'time deposits denominated in SAR' in paragraph_text and '36.9' in paragraph_text
                matched.append(dict(fact_xml=str(node), unit_xml=str(unit), context_xml=str(context), paragraph=paragraph_text))
            assert len(matched) == 1
            result.update(inline_evidence=matched,
                          disposition='NARROWER_CURRENCY_COMPONENT_AND_TIME_DEPOSITS_REQUIRE_TARGETED_HOLD',
                          reason='SAR is expressly supported by the primary disclosure. The value covers SAR-denominated cash, cash equivalents and time deposits, approximately 36.9% of the total. It is not an alternative-currency presentation of consolidated cash and cash equivalents. Preserve the currency; withhold this observation from that total-history series.')
        else:
            table = text(soup.find_all('table')[96])
            assert 'Balance – July 10, 2020 (inception)' in table
            assert 'Total Permanent' in table and 'Equity' in table
            assert 'Social Capital Hedosophia Holdings Corp. V' in ' '.join(filing['index_filers'])
            result.update(primary_table=table, zero_based_table_index=96,
                          disposition='PREDECESSOR_OPENING_BALANCE_UNIT_CONTEXT_REVIEW_PENDING',
                          reason='Original XBRL reproduces zero equity with USN and instant 2020-07-09. The primary presents a zero opening balance at July 10 inception for Social Capital Hedosophia Holdings Corp. V. Date-boundary and unit interpretation remain pending; do not identify this as contemporary SoFi operating equity or infer a unit error merely from rarity.')
        results.append(result)
    output = dict(schema='canli.currency-context-review.v1', publication_approved=False,
                  input_sha256=inputs, code_sha256=sha(Path(__file__).read_bytes()), filings=results,
                  scope='Three fixed source-context reviews. Numerical reproduction is not admission. Two targeted holds required but not yet implemented; predecessor opening-balance interpretation remains pending. No conversions, replacement values, whole-corpus admission or deployment.')
    with Path(sys.argv[1]).open('x') as handle:
        handle.write(json.dumps(output, indent=2) + '\n')
    print('Three observations reproduced; two targeted holds required; one context review pending')


if __name__ == '__main__':
    main()
