"""Preserve Fuwei hidden diluted EPS without an explicit visible statement link."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
sha = lambda b: hashlib.sha256(b).hexdigest()
clean = lambda n: ' '.join(' '.join(n.stripped_strings).split())

def main():
    cik, accession = '0001381074', '0001410578-22-001067'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001381074-source.json.gz').read_bytes())
    assert sha(source) == '461f36cc6d22580f4ee7d58898461755a8d1baad4071d4307af62cc9ae0a887c'
    assert len(targets) == 2 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2019-12-31', '2020-12-31', '2021-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == 'b6a021ab0d2a6e6247798b172b4b3958dda62fbfeb2f5fb170380cd028296fbc'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {232: {28: 'Net earnings (loss) per share, Basic and diluted \u200b 25 \u200b 27.32 \u200b 4.29 \u200b 6.00 \u200b 3.48'}, 261: {11: 'Basic and diluted earnings (loss) per share 27.32 4.29 6.00 3.48'}}
    for index, requirements in expected.items():
        for row, text in requirements.items(): assert clean(tables[index].find_all('tr')[row]) == text
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    disclosures = ['For the convenience of the readers, the RMB amounts for the year 2021 included in the accompanying consolidated financial statements in our annual report have been translated into U.S. dollars at the rate of US$1.00 = RMB 6.3726 , being the noon buy rate for U.S. dollars in effect on December 31, 2021, in the City of New York for cable transfer in RMB per U.S. dollar as certified for custom purposes by the Federal Reserve Bank. No representation is made that the RMB amounts could have been, or could be, converted into U.S. dollar at that rate or at any other certain rate on December 31, 2021, or at any other date.', 'Basic earnings (loss) per share is computed by dividing net earnings (loss) by the weighted average number of ordinary shares outstanding during the year. Diluted earnings (loss) per share is calculated by dividing net earnings (loss) by the weighted average number of ordinary and dilutive potential ordinary shares outstanding during the year. Diluted potential ordinary shares consist of shares issuable pursuant to the stock option plan.', 'On December 5, 2016, we held an extraordinary general meeting of shareholders pursuant to which a 1-for-4 reverse stock split of our authorized ordinary shares, accompanied by a corresponding decrease in our issued and outstanding ordinary shares and an increase of the par value of each ordinary share from $ 0.129752 to US$ 0.519008 (the “Reverse Stock Split”), was approved by our shareholders of record. All references made to share or per share amounts in the accompanying consolidated financial statements and applicable disclosures have been retroactively adjusted to reflect the 1-for-4 reverse stock split.']
    for disclosure in disclosures: assert disclosure in blocks
    locator_path = ROOT / 'scripts/review-share-context-spec-v7.py'
    spec = importlib.util.spec_from_file_location('locator', locator_path)
    locator = importlib.util.module_from_spec(spec); spec.loader.exec_module(locator)
    facts = []
    for check in comparison['checks']:
        found = []
        for match in check['matches']:
            node = locator.locate_fact(soup, match, cik, helper)
            index = next((i for i in expected if node.find_parent('table') is tables[i]), None)
            if index is None and node.find_parent('ix:hidden') is None:
                continue  # Other visible tables are outside the reviewed statement/note.
            if index is None:
                assert check['selected']['tag'] == 'EarningsPerShareDiluted'
                assert node.find_parent('ix:hidden') is not None and node.get('id')
                links = [n for n in soup.find_all(style=True) if any(
                    key.strip() == '-sec-ix-hidden' and value.strip() == node['id']
                    for key, sep, value in (part.strip().partition(':') for part in n['style'].split(';')) if sep)]
                assert not links, 'A direct hidden link now exists; review required'
            else:
                assert check['selected']['tag'] == 'EarningsPerShareBasic' 
            assert node.get('scale', '0') == '0'
            found.append(dict(table_index=index, selected=check['selected'], fact_xml=str(node), context_xml=str(soup.find(id=node['contextref'])), unit_xml=str(soup.find(id=node['unitref']))))
        assert found
        facts.extend(found)
    result = dict(schema='canli.fuwei-hidden-eps-pending.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()), locator_sha256=sha(locator_path.read_bytes()),
        selected_observations=rows, comparison=comparison, disclosures=disclosures,
        tables=[dict(table_index=i,text=clean(tables[i]),verified_rows=req) for i,req in expected.items()], inline_evidence=facts,
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='All eight selected EPS values match captured inline facts. Four visible basic EPS values appear in both the combined basic/diluted statement row and EPS note. The matching diluted EPS tags are in ix:hidden, including duplicate semantic facts, without an explicit SEC hidden DOM link to either reviewed row. Retain the visible combined presentation and hidden facts separately: exact values alone do not prove a particular hidden-to-visible mapping or why dilution was absent. The 2021 USD column is a convenience translation at RMB6.3726/USD1, not another period; the filing retrospectively reflects its 2016 one-for-four split. No accounting-scope approval or public reader note is registered.',
        scope='Eight selected 2019-2021 RMB and 2021 USD EPS observations remain pending; no earlier-year approval, public note, review registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; hidden diluted EPS mapping remains pending')
if __name__ == '__main__': main()
