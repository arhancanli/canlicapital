"""Seal batch2 captures, numerical comparisons and registered/pending reviews offline."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from package_company_evidence import pack, verify, file_hash, safe_name

ROOT = Path(__file__).resolve().parents[1]
A = 'artifacts/seo/'
WHEELS = A + 'corpus-local/equal-history-replay-wheels'
LEDGER = A + 'company-basic-diluted-batch2-scope-v13-20260921.json.gz'
REGISTRY = 'config/company-basic-diluted-batch2-reviews.json'
PENDING = [
    'company-theriva-filing-discrepancies-20260921.json',
    'company-community-numerator-discrepancy-20260921.json',
    'company-morgan-unit-discrepancy-20260921.json',
]
SCOPE = ('All 100 batch2 primary captures and seven legacy instances; exact numerical '
         'comparison and registered/pending accounting-context reports through scope-v13. '
         'Restores 264 reviewed and 536 pending observations without promoting pending '
         'discrepancies. Replays saved code with hash-locked offline parser dependencies. '
         'Local reproducibility of interpretations, not independent certification, full '
         'corpus/runtime regeneration, hosted backup, production activation or indexing.')



def build(archive, profile_path=None):
    files = {}

    def add(name):
        safe_name(name)
        path = ROOT / name
        if path.resolve() != path or not path.is_file():
            raise ValueError('Invalid archive dependency: ' + name)
        files[name] = path

    ledger, pending, scope = LEDGER, PENDING, SCOPE
    if profile_path is not None:
        add(profile_path)
        profile = json.loads(files[profile_path].read_bytes())
        if profile['schema'] != 'canli.batch2-archive-profile.v1':
            raise ValueError('Invalid archive profile')
        if profile['registry']['path'] != REGISTRY:
            raise ValueError('Unexpected review registry')
        for descriptor in [profile['registry'], profile['ledger'], *profile['pending'], *profile['fixtures']]:
            add(descriptor['path'])
            if file_hash(files[descriptor['path']]) != descriptor['sha256']:
                raise ValueError('Archive profile dependency changed: ' + descriptor['path'])
        ledger = profile['ledger']['path']
        pending = []
        for descriptor in profile['pending']:
            name = descriptor['path']
            if not name.startswith(A) or '/' in name[len(A):]:
                raise ValueError('Pending report must be in artifacts/seo')
            pending.append(name[len(A):])
        scope = profile['scope']
    registry = json.loads((ROOT / REGISTRY).read_bytes())
    scripts = {file_hash(p): str(p.relative_to(ROOT)) for p in (ROOT / 'scripts').glob('*.py')}
    specs = {file_hash(p): str(p.relative_to(ROOT)) for p in (ROOT / 'config').glob('*.json')}
    reports = list(dict.fromkeys([r['report'] for r in registry['reviews']] + pending))
    jobs = []
    for name in reports:
        add(A + name)
        report = json.loads(files[A + name].read_bytes())
        for registration in registry['reviews']:
            if registration['report'] == name and registration['sha256'] != file_hash(files[A + name]):
                raise ValueError('Registered report changed: ' + name)
        script = scripts[report['code_sha256']]
        args = [script]
        if 'spec_sha256' in report:
            spec = specs[report['spec_sha256']]; add(spec); args.append(spec)
            for decision in json.loads((ROOT / spec).read_bytes())['decisions']:
                add(decision['fixture'])
        jobs.append(dict(report=A + name, args=args))
        add(script)

    for descriptor in registry['inputs'].values():
        add(descriptor['path'])
        if file_hash(files[descriptor['path']]) != descriptor['sha256']:
            raise ValueError('Pinned numeric input changed')
    primary = A + 'corpus-local/company-basic-diluted-batch2-primary-review-20260921.json'
    add(primary)
    import gzip
    if gzip.decompress((ROOT / registry['inputs']['primary']['path']).read_bytes()) != files[primary].read_bytes():
        raise ValueError('Primary report compression differs')
    for name in [REGISTRY, ledger, 'scripts/package_batch2_evidence.py',
                 'scripts/package_company_evidence.py', 'scripts/requirements-editorial.txt',
                 'scripts/prepare-captured-basic-diluted-review.py',
                 'scripts/reconcile-basic-diluted-batch.mjs',
                 'scripts/fixtures/editorial/theriva-batch2-source.json.gz',
                 'scripts/fixtures/editorial/batch2-0001084551-source.json.gz',
                 'scripts/fixtures/editorial/batch2-0001162283-source.json.gz',
                 A + 'company-basic-diluted-batch2-summary-20260921.json']:
        add(name)
    for pattern in ['scripts/review-*.py', 'scripts/lib/company-*.mjs',
                    A + 'company-basic-diluted-batch2-scope-*.json.gz',
                    A + 'corpus-local/company-batch2-*-initial-spec-*.json',
                    A + 'corpus-local/company-basic-diluted-batch2-initial-target-draft-*.json']:
        for path in sorted(ROOT.glob(pattern)):
            if path.is_file(): add(str(path.relative_to(ROOT)))
    paths = sorted((ROOT / A / 'corpus-local/basic-diluted-batch2-filings').iterdir())
    assert paths
    for path in paths:
        if path.name.endswith(('.response', '.receipt.json')):
            add(str(path.relative_to(ROOT)))
    inputs = registry['inputs']
    numerical_jobs = [
        dict(report=inputs['capturedTargets']['path'], args=['scripts/prepare-captured-basic-diluted-review.py', inputs['targets']['path'], inputs['capture']['path']]),
        dict(report=primary, args=['scripts/review-basic-diluted-filings.py', inputs['capturedTargets']['path']]),
        dict(report=inputs['legacy']['path'], args=['scripts/review-basic-diluted-legacy-partition.py', primary, inputs['legacyInput']['path'], inputs['legacyCapture']['path']]),
    ]
    jobs = numerical_jobs + jobs
    wheels = sorted((ROOT / WHEELS).glob('*.whl'))
    assert len(wheels) == 3
    for path in wheels:
        add(str(path.relative_to(ROOT)))
    jobs.append(dict(report=ledger, args=['scripts/reconcile-basic-diluted-batch.mjs', REGISTRY], runtime='node'))
    return pack(files, archive, dict(
        repository_revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        jobs=jobs, scope=scope))


def replay(archive, expected_hash):
    if file_hash(archive) != expected_hash:
        raise ValueError('Archive hash mismatch')
    with tempfile.TemporaryDirectory(prefix='canli-batch2-restore-') as temp:
        workspace = Path(temp) / 'workspace'
        manifest = verify(archive, workspace)
        environment = Path(temp) / 'venv'
        subprocess.run([sys.executable, '-m', 'venv', str(environment)], check=True, capture_output=True)
        python = str(environment / 'bin/python')

        def run(args):
            result = subprocess.run(args, cwd=workspace, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stdout[-1000:] + result.stderr[-3000:])

        run([python, '-m', 'pip', 'install', '--no-index', '--require-hashes', '--only-binary=:all:',
             '--find-links', WHEELS, '-r', 'scripts/requirements-editorial.txt'])
        outputs = {}
        for job in manifest['metadata']['jobs']:
            for name in [job['report'], *job['args']]:
                safe_name(name)
                if not (workspace / name).is_file():
                    raise ValueError('Missing replay dependency: ' + name)
            output = Path(temp) / 'replayed' / job['report']
            output.parent.mkdir(parents=True, exist_ok=True)
            runtime = 'node' if job.get('runtime') == 'node' else python
            run([runtime, *job['args'], str(output)])
            expected = file_hash(workspace / job['report'])
            if file_hash(output) != expected:
                raise ValueError('Report differs: ' + job['report'])
            outputs[job['report']] = expected
            print('Replayed ' + job['report'], flush=True)
        return dict(schema='canli.batch2-evidence-archive.v1', result='PASS',
                    archive_sha256=expected_hash, archive_bytes=archive.stat().st_size,
                    files=len(manifest['files']), repository_revision=manifest['metadata']['repository_revision'],
                    reproduced_reports=outputs, offline_dependency_install=True,
                    temporary_restore_removed=True, remote_backup_verified=False,
                    scope=manifest['metadata']['scope'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['build', 'replay'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--sha256')
    parser.add_argument('--profile', help='Repository-relative, hash-pinned archive input profile (build only)')
    args = parser.parse_args()
    if args.receipt.exists():
        raise ValueError('Preserve existing receipt')
    if args.mode == 'build':
        build(args.archive, args.profile)
        expected_hash = file_hash(args.archive)
    else:
        if args.profile:
            raise ValueError('Replay uses the scope and inputs sealed inside the archive')
        if not args.sha256:
            raise ValueError('Replay requires independently retained hash')
        expected_hash = args.sha256
    result = replay(args.archive, expected_hash)
    with args.receipt.open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k:v for k,v in result.items() if k != 'reproduced_reports'}))
