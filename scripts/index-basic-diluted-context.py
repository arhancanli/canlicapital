"""Build an offline review index; extraction never grants accounting approval."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def clean(node):
    return ' '.join(node.stripped_strings)

def main():
    review_raw = (BASE / 'corpus-local/company-basic-diluted-batch1-primary-review-20260920.json').read_bytes()
    review = json.loads(review_raw)
    filings = []
    for filing in review['filings']:
        stem = filing['cik'] + '-' + filing['accession'] + '-primary'
        receipt_raw = (BASE / 'corpus-local/basic-diluted-batch1-filings' / (stem + '.receipt.json')).read_bytes()
        receipt = json.loads(receipt_raw)
        raw = (ROOT / receipt['body_path']).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes']
        assert sha(raw) == receipt['sha256'] == filing['primary_sha256']
        soup = BeautifulSoup(raw, 'html.parser')
        tables = soup.find_all('table')
        table_ids = {id(t): i for i, t in enumerate(tables)}
        facts = {}
        for node in soup.find_all(id=True):
            facts.setdefault(node['id'], []).append(node)
        selected_tables, locations = set(), []
        for check in filing['checks']:
            matches = []
            for match in check['matches']:
                candidates = facts.get(match['fact_id'], [])
                assert len(candidates) == 1, 'Ambiguous or absent matched fact ID'
                node = candidates[0]
                table = node.find_parent('table')
                index = table_ids[id(table)] if table is not None else None
                if index is not None:
                    selected_tables.add(index)
                matches.append(dict(fact_id=match['fact_id'], table_index=index,
                                    reported_text=clean(node), scale=node.get('scale', '0')))
            locations.append(dict(observation=check['selected'], locations=matches,
                                  legacy_context_required=not check['matched']))
        contexts = []
        for index in sorted(selected_tables):
            table = tables[index]
            preceding = []
            for node in table.find_all_previous(['p', 'h1', 'h2', 'h3', 'h4']):
                if node.find_parent('table') is not None:
                    continue
                text = clean(node)
                if text:
                    preceding.append(text)
                if len(preceding) == 5:
                    break
            contexts.append(dict(table_index=index, preceding_blocks=list(reversed(preceding)),
                                 text=clean(table)))
        disclosures, seen = [], set()
        pattern = re.compile(r'anti[\s\-\u2010-\u2015]*diluti|dilutive.{0,100}exclud|no.{0,40}(?:potential|dilutive).{0,40}shares', re.I)
        for node in soup.find_all(['p', 'div', 'td']):
            if node.find(['p', 'div', 'td']) is not None:
                continue
            text = clean(node)
            if text not in seen and pattern.search(text):
                seen.add(text)
                disclosures.append(text)
        filings.append(dict(cik=filing['cik'], accession=filing['accession'], name=filing['name'],
                            url=filing['url'], primary_sha256=sha(raw), receipt_sha256=sha(receipt_raw),
                            observations=locations, matched_tables=contexts,
                            candidate_dilution_disclosures=disclosures,
                            accounting_review_status='NOT_ADJUDICATED_BY_THIS_INDEX'))
        print(f"{len(filings)}/{len(review['filings'])} {filing['cik']}", flush=True)
    assert len(filings) == 100
    assert sum(len(f['observations']) for f in filings) == 1176
    result = dict(schema='canli.basic-diluted-context-index.v1', publication_approved=False,
                  primary_review_sha256=sha(review_raw), code_sha256=sha(Path(__file__).read_bytes()),
                  filings=filings,
                  scope='Navigation aid over all 100 retained primaries, not accounting review. Matched inline facts link to full nearest tables and five preceding non-table blocks. Regex-selected disclosure candidates may be irrelevant or incomplete; their presence or absence does not establish dilution treatment. Legacy instances need separate statement mapping. Existing scope ledger remains authoritative.')
    payload = (json.dumps(result, indent=2) + '\n').encode()
    with Path(sys.argv[1]).open('xb') as handle:
        handle.write(gzip.compress(payload, mtime=0))
    print(json.dumps(dict(filings=len(filings), observations=1176, uncompressed_sha256=sha(payload),
                          filings_with_candidate_disclosures=sum(bool(f['candidate_dilution_disclosures']) for f in filings))))

if __name__ == '__main__':
    main()
