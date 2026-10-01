"""Independent Python recomputation for a bounded first/later candidate packet.

This imports no JavaScript selection, arithmetic, hash or checking implementation.
It checks selected raw facts; it does not authenticate people or prove complete history.
"""
import argparse
import gzip
import hashlib
import json
import math
from datetime import date
from pathlib import Path


def sha(value):
    return hashlib.sha256(value).hexdigest()


def amount(value):
    return type(value) in (int, float) and math.isfinite(value) and int(value) == value and abs(value) <= 2**53 - 1


def verify(items, records, snapshots):
    cached = {}
    ids = set()
    checked = []
    for item in items:
        assert item['id'] not in ids, 'duplicate candidate ID'
        ids.add(item['id'])
        cik = item['company']['cik']
        assert len(cik) == 10 and cik.isascii() and cik.isdigit() and int(cik) > 0
        if cik not in cached:
            record_bytes = (records / (cik + '.json')).read_bytes()
            assert len(record_bytes) <= 16 * 1024 * 1024
            record = json.loads(record_bytes)
            digest = record['source_sha256']
            assert len(digest) == 64 and all(c in '0123456789abcdef' for c in digest)
            with gzip.open(snapshots / (digest + '.json.gz'), 'rb') as file:
                raw = file.read(64 * 1024 * 1024 + 1)
            assert len(raw) <= 64 * 1024 * 1024 and sha(raw) == digest
            data = json.loads(raw)
            assert int(data['cik']) == int(cik) and data['entityName'] == record['name']
            assert record['source_url'] == 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json'
            cached[cik] = record, sha(record_bytes), data
        record, record_hash, data = cached[cik]
        assert item['source']['snapshot_sha256'] == record['source_sha256']
        assert item['source']['record_sha256'] == record_hash
        assert item['source']['captured_at'] == record['fetched_at']
        assert item['company']['name'] == record['name']
        cutoff = date.fromisoformat(item['as_of'])
        assert cutoff <= date.fromisoformat(record['fetched_at'][:10])
        period = item['period']
        assert period['taxonomy'] == 'us-gaap' and period['unit'] == 'USD' and period['kind'] == 'annual_duration'
        duration = (date.fromisoformat(period['end']) - date.fromisoformat(period['start'])).days + 1
        assert 335 <= duration <= 395
        rows = data['facts']['us-gaap'][period['concept']]['units']['USD']
        unique = {}
        values_per_date = {}
        for row in rows:
            if row.get('start') != period['start'] or row.get('end') != period['end'] or row.get('form') not in ('10-K', '10-K/A') or row.get('fp') != 'FY':
                continue
            filed = date.fromisoformat(row['filed'])
            assert filed >= date.fromisoformat(period['end'])
            if filed > cutoff:
                continue
            assert amount(row['val']) and type(row['fy']) is int and 1900 <= row['fy'] <= 2100
            accession = row['accn']
            pieces = accession.split('-')
            assert list(map(len, pieces)) == [10, 2, 6] and all(p.isascii() and p.isdigit() for p in pieces)
            fact = {'value': int(row['val']), 'filed': row['filed'], 'accn': accession, 'form': row['form'], 'fp': row['fp'], 'fy': row['fy'], 'url': 'https://www.sec.gov/Archives/edgar/data/' + str(int(cik)) + '/' + ''.join(pieces) + '/'}
            assert accession not in unique or unique[accession] == fact, 'conflicting accession'
            unique[accession] = fact
            values_per_date.setdefault(row['filed'], set()).add(row['val'])
        assert all(len(values) == 1 for values in values_per_date.values()), 'same-day ambiguity'
        ordered = sorted(unique.values(), key=lambda x: (x['filed'], x['accn']))
        assert ordered and ordered[0]['filed'] < ordered[-1]['filed']
        first, last = ordered[0], ordered[-1]
        assert item['earliest'] == first and item['later'] == last and first['value'] != last['value']
        difference = last['value'] - first['value']
        assert amount(difference)
        percentage = None if first['value'] == 0 else difference / abs(first['value']) * 100
        expected = {'earliest_value': first['value'], 'later_value': last['value'], 'difference': difference, 'percent_difference': percentage, 'percent_difference_status': 'zero_earliest' if first['value'] == 0 else 'defined'}
        assert item['answer'] == expected
        assert item['eligible_accessions'] == len(unique)
        assert item['human_verified'] is False and item['changed_value_cause'] == 'not_established'
        checked.append({'id': item['id'], 'cik': cik, 'source_sha256': record['source_sha256'], 'earliest_accession': first['accn'], 'later_accession': last['accn'], 'values_and_arithmetic_match': True})
    return {'schema': 'canli.filing-facts-first-later-python-oracle.v1', 'checked': len(checked), 'source_companies': len(cached), 'human_or_expert_reviews': 0, 'model_calls': 0, 'cases': checked, 'limits': ['Independent internal recomputation only; no complete-history, source-authenticity, intraday, expert or formal restatement-cause claim.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('candidates', type=Path)
    parser.add_argument('records', type=Path)
    parser.add_argument('snapshots', type=Path)
    args = parser.parse_args()
    content = args.candidates.read_bytes()
    assert len(content) <= 16 * 1024 * 1024
    items = [json.loads(line) for line in content.splitlines() if line.strip()]
    print(json.dumps(verify(items, args.records, args.snapshots), indent=2))
