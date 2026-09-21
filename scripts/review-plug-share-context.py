"""Replay explicitly reviewed statement requirements; never infer new approvals."""
from decimal import Decimal
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def clean(node):
    return ' '.join(' '.join(node.stripped_strings).split())

def reviewed_subset(rows, selected):
    """Admit only an explicit, exact subset of captured target observations."""
    assert isinstance(selected, list) and selected, 'Empty reviewed subset'
    encode = lambda row: json.dumps(row, sort_keys=True, separators=(',', ':'))
    available = {encode(row): row for row in rows}
    assert len(available) == len(rows), 'Duplicate target observations'
    keys = [encode(row) for row in selected]
    assert len(set(keys)) == len(keys), 'Duplicate reviewed observations'
    assert all(key in available for key in keys), 'Reviewed observation differs from captured target'
    return [available[key] for key in keys]

def bound_path(value, parent):
    path = Path(value)
    assert not path.is_absolute() and '..' not in path.parts, 'Expected repository-relative path'
    resolved = (ROOT / path).resolve()
    assert resolved.is_relative_to(parent.resolve()), 'Path escaped evidence directory'
    return resolved

def paired_hidden(soup, table, check, helper):
    """Explicit Plug mapping: linked EPS, or disclosed shared loss denominator."""
    tag = check['selected']['tag']
    basic = {'EarningsPerShareDiluted': 'EarningsPerShareBasic',
             'WeightedAverageNumberOfDilutedSharesOutstanding': 'WeightedAverageNumberOfSharesOutstandingBasic'}.get(tag)
    assert basic, 'No reviewed hidden mapping for this concept'
    candidates = []
    for match in check['matches']:
        node = soup.find(id=match['fact_id'])
        if node.find_parent('ix:hidden') is None: continue
        assert node.get('scale', '0') == '0'
        peers = [n for n in table.find_all(attrs={'name': 'us-gaap:' + basic})
                 if n.get('contextref') == node.get('contextref') and n.get('unitref') == node.get('unitref')
                 and n.get('scale', '0') == '0' and helper.numeric(n) == helper.numeric(node) == Decimal(str(check['selected']['val']))]
        if len(peers) != 1: continue
        links = table.find_all(style=lambda value: value and ('-sec-ix-hidden:' + node['id'] + ';') in value.replace(' ', ''))
        if tag == 'EarningsPerShareDiluted':
            links = [n for n in links if n.find_parent('tr') is peers[0].find_parent('tr')]
            if not links: continue
        candidates.append((node, peers[0], links))
    assert candidates, 'Missing exact visible pair for hidden fact'
    return candidates[0]

def main():
    spec_raw = Path(sys.argv[1]).read_bytes(); review_spec = json.loads(spec_raw)
    assert review_spec['schema'] == 'canli.reviewed-share-context-spec.v2'
    target_path = bound_path(review_spec['targets']['path'], A)
    target_raw = target_path.read_bytes()
    assert sha(target_raw) == review_spec['targets']['sha256'], 'Target hash changed'
    capture_directory = bound_path(review_spec['capture_directory'], A / 'corpus-local')
    targets = json.loads(target_raw)
    helper_path = ROOT / 'scripts/review-basic-diluted-filings.py'
    spec = importlib.util.spec_from_file_location('compound', helper_path)
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    assert len(review_spec['decisions']) == 1
    d = review_spec['decisions'][0]
    assert d['cik'] == '0001093691' and d['accession'] == '0001558370-22-003577'
    assert d['primary_sha256'] == '9edcc4d2d66d9cf0c299e5019879db0125262f4b42690bb2d114a6f79d07a874'
    assert d['source_sha256'] == '693a4f1fb6d5474c0cef2ae383a813e4f7c21076e76c0ef2cd96c185c2696a0b'
    assert d['table_index'] == 445 and d['observations'] == 8
    decisions = []
    for decision in review_spec['decisions']:
        cik, accession = decision['cik'], decision['accession']
        assert cik.isdigit() and len(cik) == 10
        assert len(accession) == 20 and accession.replace('-', '').isdigit()
        receipt_path = capture_directory / (cik + '-' + accession + '-primary.receipt.json')
        receipt_raw = receipt_path.read_bytes(); receipt = json.loads(receipt_raw)
        assert sha(receipt_raw) == decision['receipt_sha256'], 'Receipt hash changed'
        raw = bound_path(receipt['body_path'], capture_directory).read_bytes()
        assert receipt['status'] == 200 and len(raw) == receipt['bytes']
        assert sha(raw) == receipt['sha256'] == decision['primary_sha256']
        source = gzip.decompress((ROOT / decision['fixture']).read_bytes())
        assert sha(source) == decision['source_sha256']
        selected = [t for t in targets['targets'] if t['cik'] == cik and t['latest_selected_accession'] == accession]
        assert selected and all(t['source_sha256'] == sha(source) for t in selected)
        rows = [dict(r, tag=t['tag']) for t in selected for r in t['latest_accession_observations']]
        if 'selected_observations' in decision:
            rows = reviewed_subset(rows, decision['selected_observations'])
        assert len(rows) == decision['observations']
        assert sorted({r['end'] for r in rows}) == decision['period_ends']
        comparison = helper.compare(raw, cik, rows)
        assert all(c['matched'] for c in comparison['checks'])
        soup = BeautifulSoup(raw, 'html.parser'); tables = soup.find_all('table'); table = tables[decision['table_index']]
        accepted_indexes = [decision['table_index'], *decision.get('supporting_table_indexes', [])]
        assert len(set(accepted_indexes)) == len(accepted_indexes)
        accepted_tables = [tables[i] for i in accepted_indexes]
        table_text = clean(table)
        assert all(needle in table_text for needle in decision['table_requires'])
        blocks = [clean(n) for n in soup.find_all(['p', 'div', 'td', 'span', 'ix:continuation']) if n.find(['p', 'div', 'td']) is None]
        disclosures = []
        for needle in decision['paragraph_requires']:
            found = [text for text in blocks if needle in text]
            assert found, f'Missing reviewed text: {needle}'
            disclosures.extend(found)
        assert any('Accordingly, basic and diluted loss per share are the same.' in text for text in disclosures)
        assert any('Since the Company is in a net loss position, all common stock equivalents' in text for text in disclosures)
        facts = []
        for check in comparison['checks']:
            main = [soup.find(id=m['fact_id']) for m in check['matches'] if any(soup.find(id=m['fact_id']).find_parent('table') is t for t in accepted_tables)]
            if not main:
                node, peer, links = paired_hidden(soup, table, check, helper)
                facts.append(dict(selected=check['selected'], fact_xml=str(node),
                    visible_peer_xml=str(peer), context_xml=str(soup.find(id=node['contextref'])),
                    unit_xml=str(soup.find(id=node['unitref'])), visible_links=[str(n) for n in links],
                    mapping=('Explicit SEC hidden link in same statement row as visible basic EPS' if links else
                             'Identical unit, period context and value to visible basic denominator, with filing disclosure that basic and diluted loss EPS are the same; no direct hidden DOM link')))
                continue
            for node in main:
                assert node.get('scale', '0') == (decision['share_scale'] if check['selected']['unit'] == 'shares' else '0')
                facts.append(dict(selected=check['selected'], fact_xml=str(node)))
        decisions.append(dict(cik=cik, source_sha256=sha(source), primary_capture=receipt,
                              receipt_sha256=sha(receipt_raw), selected_observations=rows,
                              comparison=comparison, inline_evidence=facts,
                              table_index=decision['table_index'], table_text=table_text,
                              supporting_tables=[dict(table_index=i, text=clean(tables[i])) for i in decision.get('supporting_table_indexes', [])],
                              disclosures=list(dict.fromkeys(disclosures)), reader_note=decision['reader_note'],
                              disposition=decision['disposition']))
    result = dict(schema='canli.reviewed-share-context.v1', publication_approved=False,
                  spec_sha256=sha(spec_raw), target_sha256=sha(target_raw),
                  code_sha256=sha(Path(__file__).read_bytes()), helper_sha256=sha(helper_path.read_bytes()),
                  decisions=decisions,
                  scope='Only exact observations specified by the human-readable reviewed requirements. Checks preserve the manual interpretation, not an independent accounting certification. No earlier-period, whole-history, corpus or publication approval.')
    with Path(sys.argv[2]).open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(filings=len(decisions), observations=sum(len(d['selected_observations']) for d in decisions))))

if __name__ == '__main__':
    main()
