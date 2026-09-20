"""Seal registered filing reviews and exact holds; restore and replay offline."""
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
LEDGER = A + 'company-basic-diluted-registered-scope-v22-20260921.json.gz'
REGISTRY = 'config/company-basic-diluted-batch1-reviews.json'
HOLDS = [
    'company-valhi-share-scale-20260920.json', 'company-valhi-2022-scale-20260920.json',
    'company-siebert-dilution-context-20260920.json', 'company-iovance-share-scale-20260920.json',
    'company-outset-share-scale-20260921.json', 'company-lifeward-eps-currency-20260921.json',
    'company-invo-denominator-conflict-20260921.json', 'company-iovance-older-share-scale-20260921.json',
]
SCOPE = ('All registered batch1 accounting-context reports, exact share/currency holds through v22, '
         'original captures, source fixtures and closed scope ledger. Reports replay from saved code '
         'and hash-locked offline parser wheels. Preserves interpretations, not independent certification. '
         'Does not rebuild the full corpus/runtime or verify offsite backup, production or indexing.')


def build(archive):
    files = {}

    def add(name):
        safe_name(name)
        path = ROOT / name
        if path.resolve() != path or not path.is_file():
            raise ValueError('Invalid archive dependency: ' + name)
        files[name] = path

    registry = json.loads((ROOT / REGISTRY).read_bytes())
    scripts = {file_hash(p): str(p.relative_to(ROOT)) for p in (ROOT / 'scripts').glob('*.py')}
    specs = {file_hash(p): str(p.relative_to(ROOT)) for p in (ROOT / 'config').glob('*.json')}
    reports = list(dict.fromkeys([r['report'] for r in registry['reviews']] + HOLDS))
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
        jobs.append(dict(report=A + name, args=args))
        add(script)

    for name in [REGISTRY, LEDGER, 'scripts/package_scope_review_evidence.py',
                 'scripts/package_company_evidence.py', 'scripts/requirements-editorial.txt',
                 'scripts/reconcile-basic-diluted-scope.mjs']:
        add(name)
    # Explicit repository subtrees; no environment files or arbitrary home paths.
    for pattern in ['scripts/review-*.py', 'scripts/lib/company-*.mjs',
                    'scripts/fixtures/editorial/*', 'artifacts/seo/company-basic-diluted*.json',
                    'artifacts/seo/company-basic-diluted*.json.gz']:
        for path in sorted(ROOT.glob(pattern)):
            if path.is_file():
                add(str(path.relative_to(ROOT)))
    for name in ['company-valhi-2022-targets-20260920.json', 'company-valhi-2022-capture-20260920.json',
                 'company-iovance-older-share-targets-20260921.json', 'company-iovance-older-share-capture-20260921.json']:
        add(A + name)
    for directory in ['basic-diluted-batch1-filings', 'valhi-2022-filings',
                      'phoenix-original-2011', 'iovance-older-share-filings']:
        paths = sorted((ROOT / A / 'corpus-local' / directory).iterdir())
        assert paths, directory
        for path in paths:
            if path.name.endswith(('.response', '.receipt.json')):
                add(str(path.relative_to(ROOT)))
    wheels = sorted((ROOT / WHEELS).glob('*.whl'))
    assert len(wheels) == 3
    for path in wheels:
        add(str(path.relative_to(ROOT)))
    jobs.append(dict(report=LEDGER, args=['scripts/reconcile-basic-diluted-scope.mjs'], runtime='node'))
    return pack(files, archive, dict(
        repository_revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        jobs=jobs, scope=SCOPE))


def replay(archive, expected_hash):
    if file_hash(archive) != expected_hash:
        raise ValueError('Archive hash mismatch')
    with tempfile.TemporaryDirectory(prefix='canli-scope-restore-') as temp:
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
        return dict(schema='canli.scope-review-evidence-archive.v1', result='PASS',
                    archive_sha256=expected_hash, archive_bytes=archive.stat().st_size,
                    files=len(manifest['files']), repository_revision=manifest['metadata']['repository_revision'],
                    reproduced_reports=outputs, offline_dependency_install=True,
                    temporary_restore_removed=True, remote_backup_verified=False, scope=SCOPE)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['build', 'replay'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--sha256')
    args = parser.parse_args()
    if args.receipt.exists():
        raise ValueError('Preserve existing receipt')
    if args.mode == 'build':
        build(args.archive)
        expected_hash = file_hash(args.archive)
    else:
        if not args.sha256:
            raise ValueError('Replay requires independently retained hash')
        expected_hash = args.sha256
    result = replay(args.archive, expected_hash)
    with args.receipt.open('x') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k:v for k,v in result.items() if k != 'reproduced_reports'}))
