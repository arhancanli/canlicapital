"""Seal batch1 primary/XML evidence and replay numerical and scale reviews offline."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from package_company_evidence import pack, verify, file_hash, safe_name

ROOT = Path(__file__).resolve().parents[1]
A = 'artifacts/seo/'
PREFIX = A + 'company-currency-context-'
WHEELS = A + 'corpus-local/equal-history-replay-wheels'
SCOPE = ('One hundred batch1 primary filings, six legacy instances, the additional Valhi2022 primary, '
         'original and corrected numerical reports, and source-bound scale reviews. Six reports replay '
         'from locked offline dependencies. Numerical reproduction does not certify accounting scope. '
         'No full corpus/runtime regeneration, production activation or offsite backup.')


def build(archive):
    files = {}

    def add(name):
        safe_name(name)
        path = ROOT / name
        if path.resolve() != path or not path.is_file():
            raise ValueError('Invalid archive dependency: ' + name)
        files[name] = path

    reports = [
        'company-basic-diluted-capture-batch1-targets-20260920.json',
        'company-basic-diluted-capture-batch1-20260920.json',
        'company-basic-diluted-batch1-summary-20260920.json',
        'company-basic-diluted-batch1-legacy-input-20260920.json',
        'company-basic-diluted-batch1-legacy-capture-20260920.json',
        'company-basic-diluted-batch1-legacy-review-20260920.json',
        'company-basic-diluted-batch1-legacy-review-v2-20260920.json',
        'company-valhi-share-scale-20260920.json',
        'company-valhi-2022-targets-20260920.json',
        'company-valhi-2022-capture-20260920.json',
        'company-valhi-2022-scale-20260920.json',
    ]
    for report in reports:
        add(A + report)
    for stem in ['company-basic-diluted-batch1-review-targets-20260920',
                 'company-basic-diluted-batch1-primary-review-20260920']:
        add(A + 'corpus-local/' + stem + '.json')
        add(A + stem + '.json.gz')
        import gzip
        if gzip.decompress(files[A + stem + '.json.gz'].read_bytes()) != files[A + 'corpus-local/' + stem + '.json'].read_bytes():
            raise ValueError('Full report gzip differs')
    for directory in ['basic-diluted-batch1-filings', 'valhi-2022-filings']:
        for path in sorted((ROOT / A / 'corpus-local' / directory).iterdir()):
            if path.name.endswith(('.response', '.receipt.json')):
                add(str(path.relative_to(ROOT)))
    for script in ['prepare-captured-basic-diluted-review.py', 'review-basic-diluted-filings.py',
                   'review-basic-diluted-legacy.py', 'review-basic-diluted-legacy-v2.py',
                   'review-basic-diluted-batch1-legacy.py', 'review-basic-diluted-batch1-legacy-v2.py',
                   'review-valhi-share-scale.py', 'review-valhi-2022-scale.py',
                   'package_company_evidence.py', 'package_basic_diluted_batch1_evidence.py', 'requirements-editorial.txt']:
        add('scripts/' + script)
    add('scripts/fixtures/editorial/valhi-reviewed-source.json.gz')
    wheels = sorted((ROOT / WHEELS).glob('*.whl'))
    if len(wheels) != 3:
        raise ValueError('Missing locked parser wheels')
    for path in wheels:
        add(str(path.relative_to(ROOT)))
    return pack(files, archive, dict(
        repository_revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        scope=SCOPE))


def replay(archive, expected_hash):
    if file_hash(archive) != expected_hash:
        raise ValueError('Archive hash mismatch')
    with tempfile.TemporaryDirectory(prefix='canli-basic-diluted-batch1-restore-') as temp:
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
        targets = A + 'corpus-local/company-basic-diluted-batch1-review-targets-20260920.json'
        jobs = [
            ('corpus-local/company-basic-diluted-batch1-review-targets-20260920.json', ['prepare-captured-basic-diluted-review.py', A + 'company-basic-diluted-capture-batch1-targets-20260920.json', A + 'company-basic-diluted-capture-batch1-20260920.json']),
            ('corpus-local/company-basic-diluted-batch1-primary-review-20260920.json', ['review-basic-diluted-filings.py', targets]),
            ('company-basic-diluted-batch1-legacy-review-20260920.json', ['review-basic-diluted-batch1-legacy.py']),
            ('company-basic-diluted-batch1-legacy-review-v2-20260920.json', ['review-basic-diluted-batch1-legacy-v2.py']),
            ('company-valhi-share-scale-20260920.json', ['review-valhi-share-scale.py']),
            ('company-valhi-2022-scale-20260920.json', ['review-valhi-2022-scale.py']),
        ]
        outputs = {}
        for report, args in jobs:
            output = Path(temp) / report
            output.parent.mkdir(parents=True, exist_ok=True)
            command = [python, 'scripts/' + args[0], *args[1:], str(output)]
            run(command)
            expected = file_hash(workspace / A / report)
            if file_hash(output) != expected:
                raise ValueError('Report differs: ' + report)
            outputs[report] = expected
            print('Replayed ' + report, flush=True)
        return dict(schema='canli.basic-diluted-batch1-archive.v1', result='PASS',
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
    print(json.dumps(result))
