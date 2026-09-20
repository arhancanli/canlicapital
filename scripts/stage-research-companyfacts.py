#!/usr/bin/env python3
"""Stage a hash-verified existing ALPHAC research collection for the corpus audit.

Requires pandas/parquet support from the research environment. Reads only official
companyfacts captures and their collection lineage; never opens prices or returns.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import tempfile
import zipfile


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def stage(engine_root, output):
    import pandas as pd

    engine_root, output = Path(engine_root).resolve(), Path(output).resolve()
    require(not output.is_relative_to(engine_root), 'Output must not alter the source engine tree')
    base = engine_root / 'artifacts/feasibility/repurchase_issuance_flow'
    receipt_path = base / 'companyfacts_collection_result.json'
    receipt = json.loads(receipt_path.read_text())
    body = {k: v for k, v in receipt.items() if k != 'content_hash'}
    require(receipt['content_hash'] == 'sha256:' + hashlib.sha256(json.dumps(body, sort_keys=True, separators=(',', ':')).encode()).hexdigest(), 'Collection receipt hash mismatch')
    require(receipt['complete'] is True and receipt['collection_error_ciks'] == 0, 'Collection receipt counts/status do not reconcile')
    parts = sorted((base / 'companyfacts_parts').glob('*.parquet'))
    lineage = hashlib.sha256()
    statuses = []
    for path in parts:
        lineage.update(f'{path.name}\0{path.stat().st_size}\0{sha(path)}\n'.encode())
        if path.name.startswith('issuer-status-'):
            frame = pd.read_parquet(path)
            frame['part_number'] = int(path.stem.rsplit('-', 1)[1])
            statuses.append(frame)
    require(len(parts) == receipt['part_files'] and lineage.hexdigest() == receipt['parts_sha256'], 'Part lineage changed')
    manifest = base / 'issuer_schema_sample.parquet'
    require(sha(manifest) == receipt['source_manifest_file_sha256'], 'Issuer manifest changed')
    status = pd.concat(statuses, ignore_index=True).sort_values(['cik', 'part_number']).drop_duplicates('cik', keep='last')
    require(set(status.cik.astype(int)) == set(pd.read_parquet(manifest).cik.astype(int)), 'Issuer identity set changed')
    require(len(status) == receipt['expected_ciks'], 'Collection receipt counts/status do not reconcile')
    fetched = status[status.source_status.eq('fetched')]
    require(len(fetched) == receipt['successful_ciks'], 'Collection receipt counts/status do not reconcile')
    require(int(status.source_status.eq('not_available_404').sum()) == receipt['terminal_unavailable_404_ciks'], 'Collection receipt counts/status do not reconcile')
    raw_dir = engine_root / 'data/raw/repurchase_issuance_flow/companyfacts'
    require({p.name for p in raw_dir.glob('*.json.gz')} == {f'CIK{int(cik):010d}.json.gz' for cik in fetched.cik}, 'Raw capture identity set changed')
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, pending = tempfile.mkstemp(dir=output.parent, suffix='.zip.pending')
    os.close(fd)
    members = []
    try:
        with zipfile.ZipFile(pending, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for row in fetched.sort_values('cik').itertuples():
                cik = f'{int(row.cik):010d}'
                raw = gzip.decompress((raw_dir / f'CIK{cik}.json.gz').read_bytes())
                raw_hash = hashlib.sha256(raw).hexdigest()
                require(raw_hash == row.raw_sha256 and len(raw) == row.raw_bytes, f'Captured bytes changed for {cik}')
                # Entity/schema eligibility belongs to the production selector; even a
                # receipt-bound empty response must remain visible as an exclusion.
                # Stable ZIP metadata makes staging reproducible from identical inputs.
                info = zipfile.ZipInfo(f'CIK{cik}.json', date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, raw, compresslevel=1)
                members.append({'cik': cik, 'sha256': raw_hash, 'bytes': len(raw)})
        os.replace(pending, output)
    finally:
        Path(pending).unlink(missing_ok=True)
    return {
        'schema': 'canli.existing-companyfacts-stage.v1',
        'input_description': 'Selected ALPHAC research sample, not SEC bulk corpus or representative market coverage',
        'collection_receipt_sha256': sha(receipt_path),
        'collection_receipt_content_hash': receipt['content_hash'],
        'parts_sha256': receipt['parts_sha256'], 'parts_verified': len(parts),
        'source_manifest_sha256': sha(manifest), 'selected_issuers': len(status),
        'verified_captures': len(members), 'terminal_404_issuers': int(status.source_status.eq('not_available_404').sum()),
        'archive_sha256': sha(output), 'observed_by': receipt['generated_at'],
        'individual_capture_times': None, 'preparation_script_sha256': sha(Path(__file__)),
        'members': members,
        'claim_boundary': 'Byte and lineage verification only. Exact individual retrieval times are unknown. No publication approval, current freshness, representative coverage or indexing established.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    require(not args.receipt.resolve().is_relative_to(args.engine_root.resolve()), 'Receipt must not alter the source engine tree')
    require(args.receipt.resolve() != args.output.resolve(), 'Receipt must not overwrite the archive')
    result = stage(args.engine_root, args.output)
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    print(f"Verified {result['verified_captures']} captured files, {result['terminal_404_issuers']} documented absences")
