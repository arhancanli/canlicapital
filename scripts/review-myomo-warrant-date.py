"""Preserve differing Myomo pre-funded warrant inclusion-date descriptions."""
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
    cik, accession = '0001369290', '0001193125-26-098531'
    target_raw = (A / 'company-basic-diluted-capture-batch2-targets-20260921.json').read_bytes()
    targets = [t for t in json.loads(target_raw)['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
    source = gzip.decompress((ROOT / 'scripts/fixtures/editorial/batch2-0001369290-source.json.gz').read_bytes())
    assert sha(source) == '9ced30eaa1580175e989ecc2f5d6b3002c3a0519be795c23e9998fc21bee7552'
    assert len(targets) == 4 and all(t['source_sha256'] == sha(source) for t in targets)
    rows = [dict(r, tag=t['tag']) for t in targets for r in t['latest_accession_observations']]
    assert len(rows) == 8 and {r['end'] for r in rows} == {'2024-12-31', '2025-12-31'}
    rr = (A / f'corpus-local/basic-diluted-batch2-filings/{cik}-{accession}-primary.receipt.json').read_bytes()
    receipt = json.loads(rr); raw = (ROOT / receipt['body_path']).read_bytes()
    assert receipt['status'] == 200 and len(raw) == receipt['bytes']
    assert sha(raw) == receipt['sha256'] == '802b335619ea10beb6e0bfb253a8b7f9888330b7fe35744977299f15ff83af97'
    hp = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compare', hp); helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    comparison = helper.compare(raw, cik, rows)
    assert all(c['matched'] for c in comparison['checks'])
    soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table')
    expected = {20: {18: 'Net loss $ ( 15,573,884 ) $ ( 6,183,729 )', 20: 'Weighted average number of common shares outstanding:', 21: 'Basic and diluted 41,855,607 37,758,837', 22: 'Net loss per share available to common stockholders:', 23: 'Basic and diluted $ ( 0.37 ) $ ( 0.16 )'}}
    for index, requirements in expected.items():
        for row, text in requirements.items(): assert clean(tables[index].find_all('tr')[row]) == text
    blocks = [clean(n) for n in soup.find_all(['p','div','td','span']) if n.find(['p','div','td']) is None]
    disclosures = ['Basic loss per common share is computed by dividing net loss attributable to common stockholders by the weighted average number of common shares outstanding during the period. Diluted net loss per common share is computed by dividing net loss attributable to common stockholders by the weighted average number of common shares outstanding, plus potentially dilutive common shares. Restricted stock units, stock options and warrants are excluded from the diluted net loss per share calculation when their impact is antidilutive. The Company reported a net loss for the years ended December 31, 2025 and 2024, respectively, and as a result, all potentially dilutive common shares are considered antidilutive for these periods.', "Due to their nominal exercise price of $ 0.0001 per share, a total of 3,763,258 and 7,061,519 outstanding pre-funded warrants as of December 31, 2025 and 2024, respectively are considered common stock equivalents and are included in weighted average shares outstanding in the accompanying consolidated statements of operations as of the closing dates of the Company's public equity offerings in January 2023 and August 2023, respectively.", "Due to their nominal exercise price of $ 0.0001 per share, a total of 3,763,258 and 7,061,519 outstanding pre-funded warrants as of December 31, 2025, and 2024, respectively are considered common stock equivalents and are included in weighted average shares outstanding in the accompanying consolidated statements of operations as of the closing dates of the Company's public equity offerings in January 2024, August 2023 and January 2023, respectively. A total of 3,298,261 and 1,434,730 pre-funded warrants were exercised during the years ended December 31, 2025 and 2024, respectively. The pre-funded warrants have no maturity date.", 'On January 19, 2024, the Company completed a registered direct equity offering, pursuant to which it sold 1,354,218 shares of common stock and 224,730 pre-funded warrants at $ 3.80 per share, or $ 3.7999 per pre-funded warrant, generating net proceeds after fees and expenses of approximately $ 5.4 million.']
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
            if index is None: continue
            assert node.get('scale', '0') == '0'
            found.append(dict(table_index=index, selected=check['selected'], fact_xml=str(node), context_xml=str(soup.find(id=node['contextref'])), unit_xml=str(soup.find(id=node['unitref']))))
        assert found
        facts.extend(found)
    result = dict(schema='canli.myomo-warrant-date-discrepancy.v1', publication_approved=False,
        cik=cik, source_sha256=sha(source), target_sha256=sha(target_raw), primary_capture=receipt,
        receipt_sha256=sha(rr), code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(hp.read_bytes()), locator_sha256=sha(locator_path.read_bytes()),
        selected_observations=rows, comparison=comparison, disclosures=disclosures,
        tables=[dict(table_index=i,text=clean(tables[i]),verified_rows=req) for i,req in expected.items()], inline_evidence=facts,
        disposition='ACCOUNTING_SCOPE_REVIEW_PENDING',
        finding='Both selected periods match the reported basic/diluted shares and loss EPS. One prefunded-warrant paragraph lists January 2023 and August 2023 offering closings; another lists January 2024, August 2023 and January 2023, while both state the same 2025/2024 outstanding balances (3,763,258/7,061,519). The financing paragraph confirms 224,730 prefunded warrants issued January 19, 2024, for USD3.7999 each with a nominal USD0.0001 exercise price. The broader list may supply an omission, but this captured filing does not show a dated weighted-average rollforward proving the exact inclusion of that issuance. Do not assert that reported EPS is wrong, assign year-end warrant counts to the weighted denominator, or silently choose one list as a complete explanation. Loss-period anti-dilution is separately disclosed; both years remain pending for the inclusion-date context.',
        scope='Eight selected 2024/25 observations remain pending; no earlier-year approval, public note, review registration, policy hold, source replacement or publication approval.')
    with Path(sys.argv[1]).open('x') as h: h.write(json.dumps(result,indent=2)+'\n')
    print('8 numerical matches; pre-funded warrant date attribution remains pending')
if __name__ == '__main__': main()
