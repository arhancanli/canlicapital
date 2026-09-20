"""Seal three filing reviews and standards captures; replay four reports offline."""
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
SCOPE = ('Three primary filings, two original XML instances, two standards captures, '
         'three companyfacts fixtures and four byte-identical report replays. '
         'Interpretations and disclosed limitations retained, not independently certified. '
         'No complete corpus/runtime regeneration, production activation or offsite backup.')


def build(archive):
    files = {}

    def add(name):
        safe_name(name)
        path = ROOT / name
        if path.resolve() != path or not path.is_file():
            raise ValueError('Invalid archive dependency: ' + name)
        files[name] = path

    for suffix in ['targets', 'capture', 'primary', 'legacy', 'review']:
        add(PREFIX + suffix + '-20260920.json')
    add(A + 'company-predecessor-opening-context-20260920.json')
    for directory in ['currency-context-filings', 'currency-context-standards']:
        for path in sorted((ROOT / A / 'corpus-local' / directory).iterdir()):
            if path.name.endswith(('.response', '.receipt.json')):
                add(str(path.relative_to(ROOT)))
    for script in ['compare-company-editorial-filings.py', 'review-company-editorial-xbrl.py',
                   'review-basic-diluted-filings.py', 'review-currency-context.py',
                   'review-predecessor-opening-context.py', 'package_company_evidence.py',
                   'package_currency_context_evidence.py', 'requirements-editorial.txt']:
        add('scripts/' + script)
    for fixture in ['monolithic', '51talk', 'sofi-predecessor']:
        add('scripts/fixtures/editorial/' + fixture + '-reviewed-source.json.gz')
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
    with tempfile.TemporaryDirectory(prefix='canli-currency-restore-') as temp:
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
        jobs = [
            ('company-currency-context-primary-20260920.json', ['compare-company-editorial-filings.py', PREFIX + 'capture-20260920.json', PREFIX + 'targets-20260920.json']),
            ('company-currency-context-legacy-20260920.json', ['review-company-editorial-xbrl.py', PREFIX + 'capture-20260920.json', PREFIX + 'primary-20260920.json', A + 'corpus-local/currency-context-filings']),
            ('company-currency-context-review-20260920.json', ['review-currency-context.py']),
            ('company-predecessor-opening-context-20260920.json', ['review-predecessor-opening-context.py']),
        ]
        outputs = {}
        for report, args in jobs:
            output = Path(temp) / report
            command = [python, 'scripts/' + args[0], *args[1:], str(output)]
            if args[0] == 'review-company-editorial-xbrl.py':
                command.append('--offline')
            run(command)
            expected = file_hash(workspace / A / report)
            if file_hash(output) != expected:
                raise ValueError('Report differs: ' + report)
            outputs[report] = expected
            print('Replayed ' + report, flush=True)
        return dict(schema='canli.currency-context-archive.v1', result='PASS',
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
