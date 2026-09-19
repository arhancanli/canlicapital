#!/usr/bin/env python3
"""Inventory captured SEC companyfacts ZIPs into SQLite; never publish candidate pages.

Uses the production JS selector, retains source/member hashes, and atomically replaces
an earlier catalog only when the entire requested scan succeeds. No ZIP extraction.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
MAX_MEMBER_BYTES = 64 * 1024 * 1024


def digest(path):
    hashed = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            hashed.update(block)
    return hashed.hexdigest()


def audit(archive, output, captured_at=None, limit=None, *, observed_by=None):
    if bool(captured_at) == bool(observed_by):
        raise ValueError('Provide exactly one actual capture time or observed-by boundary')
    boundary = captured_at or observed_by
    capture = datetime.fromisoformat(boundary.replace('Z', '+00:00'))
    if capture.tzinfo is None or capture.utcoffset().total_seconds() != 0 or capture > datetime.now(timezone.utc):
        raise ValueError('Capture time must be a real, nonfuture UTC timestamp')
    if limit is not None and limit < 1:
        raise ValueError('Limit must be positive')
    archive, output = Path(archive).resolve(), Path(output).resolve()
    if archive == output:
        raise ValueError('Output must not replace source archive')
    output.parent.mkdir(parents=True, exist_ok=True)
    source_digest = digest(archive)
    fd, pending = tempfile.mkstemp(prefix=output.name + '.', suffix='.pending', dir=output.parent)
    os.close(fd)
    worker = None
    connection = None
    try:
        connection = sqlite3.connect(pending)
        connection.executescript('''
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE entities (
            cik TEXT PRIMARY KEY, member TEXT UNIQUE NOT NULL, source_sha256 TEXT NOT NULL,
            status TEXT NOT NULL, reason TEXT, diagnostics_json TEXT NOT NULL, record_json TEXT
          );
          CREATE TABLE histories (
            cik TEXT NOT NULL REFERENCES entities(cik), concept TEXT NOT NULL,
            canonical_path TEXT UNIQUE NOT NULL, observation_count INTEGER NOT NULL,
            reporting_dates INTEGER NOT NULL, first_period TEXT NOT NULL, last_period TEXT NOT NULL,
            units_json TEXT NOT NULL, PRIMARY KEY(cik, concept)
          );
          CREATE INDEX entity_status ON entities(status);
        ''')
        worker = subprocess.Popen(['node', str(ROOT / 'scripts/company-catalog-worker.mjs')],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        with zipfile.ZipFile(archive) as source:
            # Central directory only; payload memory is bounded by one member.
            members = sorted((m for m in source.infolist() if not m.is_dir()), key=lambda m: m.filename)
            if not members:
                raise ValueError('Empty archive')
            names = set()
            for member in members:
                if not re.fullmatch(r'CIK[0-9]{10}\.json', member.filename):
                    raise ValueError(f'Unexpected archive member: {member.filename}')
                if member.filename in names:
                    raise ValueError(f'Duplicate entity in archive: {member.filename}')
                names.add(member.filename)
                if member.file_size > MAX_MEMBER_BYTES or member.flag_bits & 1:
                    raise ValueError(f'Oversized or encrypted source member: {member.filename}')
            requested = members[:limit] if limit else members
            for ordinal, member in enumerate(requested, 1):
                with source.open(member) as stream:
                    raw = stream.read(MAX_MEMBER_BYTES + 1)
                if len(raw) > MAX_MEMBER_BYTES:
                    raise ValueError(f'Oversized source member: {member.filename}')
                cik = member.filename[3:13]
                request = dict(cik=cik, raw=raw.decode('utf-8'), fetchedAt=captured_at, observedBy=observed_by)
                worker.stdin.write(json.dumps(request) + '\n')
                worker.stdin.flush()
                response = worker.stdout.readline()
                if not response:
                    raise RuntimeError('Selection worker failed; catalog not replaced')
                result = json.loads(response)
                record = result.get('record')
                raw_hash = hashlib.sha256(raw).hexdigest()
                if record and record['source_sha256'] != raw_hash:
                    raise ValueError('Source hash does not match original bytes')
                connection.execute('INSERT INTO entities VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (cik, member.filename, raw_hash, result['status'], result.get('reason'),
                     json.dumps(result['diagnostics'], sort_keys=True), json.dumps(record) if record else None))
                if record:
                    for concept in record['concepts']:
                        rows = concept['observations']
                        ends = sorted({r['end'] for r in rows})
                        connection.execute('INSERT INTO histories VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            (cik, concept['tag'], f"/companies/{cik}/{concept['tag']}", len(rows),
                             len(ends), ends[0], ends[-1], json.dumps(sorted({r['unit'] for r in rows}))))
                if ordinal % 250 == 0:
                    print(f'Scanned {ordinal}/{len(requested)} entities', flush=True)
        worker.stdin.close()
        if worker.wait(timeout=30):
            raise RuntimeError('Selection worker exited unsuccessfully')
        # Refuse a receipt for source bytes that changed during the audit.
        if digest(archive) != source_digest:
            raise ValueError('Archive changed during audit')
        eligible = connection.execute("SELECT count(*) FROM entities WHERE status='ELIGIBLE_FOR_REVIEW'").fetchone()[0]
        histories = connection.execute('SELECT count(*) FROM histories').fetchone()[0]
        reasons = dict(connection.execute("SELECT reason,count(*) FROM entities WHERE status='EXCLUDED' GROUP BY reason"))
        summary = {
            'schema': 'canli.company-corpus-audit.v1', 'captured_at': captured_at,
            'observed_by': observed_by,
            'capture_time_basis': 'ACTUAL_CAPTURE' if captured_at else 'COLLECTION_RECEIPT_UPPER_BOUND',
            'audited_at': datetime.now(timezone.utc).isoformat(), 'archive_sha256': source_digest,
            'archive_source_url': None,
            'source_reference_url': 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
            'source_authenticity': 'Caller-supplied capture; hash proves byte identity, not origin',
            'selector_sha256': digest(ROOT / 'scripts/lib/company-reference.mjs'),
            'worker_sha256': digest(ROOT / 'scripts/company-catalog-worker.mjs'),
            'auditor_sha256': digest(Path(__file__)),
            'archive_entities': len(members), 'scanned_entities': len(requested),
            'scope': 'FULL_ARCHIVE' if len(requested) == len(members) else 'LIMITED_SAMPLE',
            'eligible_entities': eligible, 'eligible_histories': histories,
            'candidate_pages_before_editorial_review': eligible + histories,
            'exclusion_reasons': reasons, 'published_pages': 0, 'indexed_pages': None,
            'claim_boundary': 'Source-selection eligibility only. No editorial approval, publication, deployment or indexing established. No extrapolation from samples.',
        }
        for key, value in summary.items():
            connection.execute('INSERT INTO metadata VALUES (?, ?)', (key, json.dumps(value)))
        connection.commit()
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Catalog integrity check failed')
        connection.close()
        connection = None
        os.replace(pending, output)
        return summary
    finally:
        if worker:
            if worker.poll() is None:
                worker.kill()
            worker.wait()
            worker.stdout.close()
            if not worker.stdin.closed:
                worker.stdin.close()
        if connection:
            connection.close()
        Path(pending).unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    boundary = parser.add_mutually_exclusive_group(required=True)
    boundary.add_argument('--captured-at', help='Actual UTC capture timestamp, not audit time')
    boundary.add_argument('--observed-by', help='Collection receipt UTC upper bound; individual capture times stay unknown')
    parser.add_argument('--limit', type=int, help='Optional bounded sample; report never extrapolates')
    args = parser.parse_args()
    print(json.dumps(audit(args.archive, args.output, args.captured_at, args.limit, observed_by=args.observed_by), indent=2))
