"""Replay explicitly reviewed statement requirements; never infer new approvals."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from decimal import Decimal, InvalidOperation
import re
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

def locate_fact(soup, match, cik, helper):
    """Resolve one validated fact by semantics; IDs are optional, ambiguity is fatal.

    This establishes node identity only, never statement membership or accounting
    scope. Callers must still require the reviewed table and display scale.
    """
    contexts, units = {}, {}
    for node in soup.find_all(lambda n: helper.local(n) in ('context', 'unit')
                              and helper.qname(n, n.name)[0] == helper.INSTANCE_NS):
        collection = contexts if helper.local(node) == 'context' else units
        key = node.get('id')
        assert key and key not in collection, 'Missing or duplicate context/unit ID'
        collection[key] = node
    candidates = []
    for node in soup.find_all(lambda n: helper.local(n) == 'nonfraction'
                             and helper.qname(n, n.name)[0] in (
                                 'http://www.xbrl.org/2013/inlineXBRL',
                                 'http://www.xbrl.org/2008/inlineXBRL')):
        if node.get('id') != match['fact_id'] or node.get('contextref') != match['context_id']:
            continue
        namespace, concept = helper.qname(node, node.get('name'))
        if concept != match['tag'] or not namespace or not re.fullmatch(
                r'https?://(?:fasb\.org|xbrl\.us)/us-gaap/[^/]+', namespace):
            continue
        context, unit = contexts.get(node.get('contextref')), units.get(node.get('unitref'))
        if context is None or unit is None:
            continue
        identifier = helper.field(context, 'identifier')
        if not identifier or not identifier.isdigit() or int(identifier) != int(cik):
            continue
        if context.find(lambda n: helper.local(n) in ('explicitmember', 'typedmember')):
            continue
        if (helper.field(context, 'startdate') != match['start'] or
                (helper.field(context, 'enddate') or helper.field(context, 'instant')) != match['end'] or
                helper.share_unit(unit) != match['unit']):
            continue
        if any(helper.qname(node, key) == ('http://www.w3.org/2001/XMLSchema-instance', 'nil')
               and value in ('true', '1') for key, value in node.attrs.items()):
            continue
        try:
            if helper.numeric(node) != Decimal(match['value']):
                continue
        except (ValueError, InvalidOperation):
            continue
        candidates.append(node)
    assert len(candidates) == 1, f'Fact locator requires one exact node; found {len(candidates)}'
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
        facts = []
        for check in comparison['checks']:
            located = [locate_fact(soup, m, cik, helper) for m in check['matches']]
            main = [node for node in located if any(node.find_parent('table') is t for t in accepted_tables)]
            assert main
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
