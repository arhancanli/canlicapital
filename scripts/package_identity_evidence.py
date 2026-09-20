"""Seal the identity review supplement and replay it from an isolated restore."""
import argparse
import gzip
import hashlib
import importlib.metadata
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from package_company_evidence import file_hash, pack, verify

ROOT = Path(__file__).resolve().parents[1]
REPORTS = [
    'company-identity-exclusions-20260920.json',
    'company-identity-filing-review-20260920.json',
    'company-identity-filing-targets-20260920.json',
    'company-identity-inline-comparison-20260920.json',
    'princeton-revenue-scope-20260920.json',
]
SCRIPTS = [
    'package_company_evidence.py', 'package_identity_evidence.py',
    'capture-company-identity-filings.py',
    'prepare-company-identity-filing-targets.mjs',
    'compare-company-identity-filings.py', 'review-princeton-revenue-scope.py',
    'lib/company-reference.mjs', 'lib/company-extended-concepts.mjs',
    'lib/company-editorial-dispositions.mjs', 'lib/company-editorial-v3.mjs',
    'lib/company-editorial-v4.mjs', 'lib/company-editorial-v5.mjs',
    'lib/company-editorial-v6.mjs',
]


def build(output):
    files = {}

    def add(relative):
        path = ROOT / relative
        if path.resolve() != path or not path.is_file():
            raise ValueError('Missing or linked evidence input')
        files[relative] = path

    for name in REPORTS:
        add('artifacts/seo/' + name)
    for name in SCRIPTS:
        add('scripts/' + name)
    review = json.loads(files['artifacts/seo/' + REPORTS[1]].read_bytes())
    if not review['complete'] or review.get('error'):
        raise ValueError('Incomplete filing capture')
    for filing in review['filings']:
        for key in ('index_capture', 'primary_capture'):
            receipt = filing[key]
            add(receipt['body_path'])
            body = files[receipt['body_path']]
            if receipt['status'] != 200 or body.stat().st_size != receipt['bytes'] or file_hash(body) != receipt['sha256']:
                raise ValueError('Capture binding mismatch')
            receipt_path = str(Path(receipt['body_path']).with_suffix('.receipt.json'))
            add(receipt_path)
            if json.loads(files[receipt_path].read_bytes()) != receipt:
                raise ValueError('Receipt changed')
    audit = json.loads(files['artifacts/seo/' + REPORTS[0]].read_bytes())
    cases = [c for c in audit['cases'] if c['review_state'] == 'IDENTITY_AND_FILING_SCOPE_REVIEW_REQUIRED']
    for case in cases:
        relative = f"artifacts/seo/corpus-local/{case['cohort']}/{case['source_sha256']}.json.gz"
        add(relative)
        if hashlib.sha256(gzip.decompress(files[relative].read_bytes())).hexdigest() != case['source_sha256']:
            raise ValueError('Company-facts source changed')
    return pack(files, output, {
        'scope': 'Identity-review supplement only: ten company-facts sources, 13 filings, diagnostic targets, numerical comparison and Princeton semantic disposition. Does not re-run all 106 original exclusions or replace the v3 archive. Local retention only; no publication approval.',
        'repository_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'python': sys.version, 'beautifulsoup4': importlib.metadata.version('beautifulsoup4'),
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'runtime_note': 'Runtime versions recorded; runtimes and third-party packages are not bundled.',
    })


def replay(archive, expected_sha):
    if file_hash(archive) != expected_sha:
        raise ValueError('Whole archive differs from expected SHA256')
    with tempfile.TemporaryDirectory(prefix='canli-identity-restore-') as temp:
        workspace = Path(temp) / 'workspace'
        manifest = verify(archive, workspace)
        expected = {name: file_hash(workspace / 'artifacts/seo' / name) for name in REPORTS[1:]}
        # Offline only: the network capture script is retained but never invoked.
        for command in [
            ['node', 'scripts/prepare-company-identity-filing-targets.mjs'],
            [sys.executable, 'scripts/compare-company-identity-filings.py'],
            [sys.executable, 'scripts/review-princeton-revenue-scope.py'],
        ]:
            subprocess.run(command, cwd=workspace, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for name, sha in expected.items():
            if file_hash(workspace / 'artifacts/seo' / name) != sha:
                raise ValueError('Restored replay differs: ' + name)
        return {'schema': 'canli.identity-evidence-restore.v1', 'archive_sha256': expected_sha,
                'archive_bytes': archive.stat().st_size, 'files': len(manifest['files']),
                'metadata': manifest['metadata'], 'reproduced_report_sha256': expected,
                'result': 'PASS', 'temporary_restore_removed': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['build', 'replay'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('--sha256')
    args = parser.parse_args()
    if args.mode == 'build':
        build(args.archive)
        result = replay(args.archive, file_hash(args.archive))
    else:
        if not args.sha256:
            parser.error('replay requires independently recorded --sha256')
        result = replay(args.archive, args.sha256)
    print(json.dumps(result, indent=2))
