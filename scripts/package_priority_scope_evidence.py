"""Seal newer priority-scope evidence and replay reports in an isolated workspace."""
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
STEMS = [
    'hno-operating-scope', 'nika-techcom-loss-context',
    'historical-liability-batch1', 'historical-balance-batch2',
    'atlantica-historical-balance', 'techcom-historical-context',
    'bioforce-anvi-balance', 'apple-lithium-liability', 'visium-grn-balance',
    'four-issuer-liability', 'small-issuer-context', 'retained-final-context',
    'visium-original-context', 'techcom-precision',
]
REPLAYS = [('review-' + s + '.py', 'company-' + s + ('-context' if s == 'techcom-precision' else '') + '-20260920.json') for s in STEMS]
SUPPLEMENTS = ['company-' + s + '-20260920.json' for s in STEMS[6:-1]] + ['company-techcom-precision-context-20260920.json']
LEDGER = 'company-priority-scope-v13-batch8-20260920.json'


def build(output):
    files = {}

    def add(name):
        safe_name(name)
        path = ROOT / name
        if path.resolve() != path or not path.is_file():
            raise ValueError('Invalid archive dependency: ' + name)
        if name in files:
            return
        files[name] = path
        if name.endswith('.json'):
            dependencies(json.loads(path.read_bytes()))
        elif name.endswith('.response'):
            paired = name.replace('.response', '.receipt.json')
            if (ROOT / paired).is_file():
                add(paired)

    def dependencies(value):
        if isinstance(value, dict):
            # Include named report inputs in dictionary keys as well as values.
            for key, item in value.items():
                dependencies(key)
                dependencies(item)
        elif isinstance(value, list):
            for item in value:
                dependencies(item)
        elif isinstance(value, str) and len(value) < 240 and '\n' not in value:
            name = A + value if value.startswith(('company-', 'corpus-local/')) else value
            if name.startswith(A) and name.endswith(('.json', '.response', '.json.gz')) and (ROOT / name).is_file():
                add(name)

    for script, report in REPLAYS:
        add('scripts/' + script)
        add(A + report)
    add(A + LEDGER)
    # These reports are read by glob, so preserve the same exact target set.
    for path in sorted((ROOT / A).glob('company-equal-history-*targets-20260920.json')):
        add(str(path.relative_to(ROOT)))
    for name in ['company-priority-scope-coverage-20260920.json',
                 'company-priority-scope-v12-20260920.json',
                 'company-priority-scope-v13-20260920.json',
                 'company-equal-history-numerical-closure-20260920.json',
                 'company-greenstream-original-context-20260920.json']:
        add(A + name)
    # HNO's original review binds one v11 selected record, not the full runtime.
    directory = A + 'corpus-local/company-five-cohort-delivery-v11/'
    name = directory + 'delivery.json'
    add(name)
    manifest = json.loads(files[name].read_bytes())
    entry = next(f for f in manifest['files'] if f['cik'] == '0001342916')
    selected = directory + entry['selected']['storage_path']
    add(selected)
    if file_hash(files[selected]) != entry['selected']['sha256']:
        raise ValueError('HNO selected record changed')
    for name in ['package_priority_scope_evidence.py', 'package_company_evidence.py',
                 'reconcile-priority-scope-v13.mjs', 'requirements-editorial.txt']:
        add('scripts/' + name)
    for pattern in ['scripts/lib/*.mjs', 'scripts/fixtures/editorial/*-reviewed-source.json.gz']:
        for path in sorted(ROOT.glob(pattern)):
            add(str(path.relative_to(ROOT)))
    wheels = sorted((ROOT / WHEELS).glob('*.whl'))
    if len(wheels) != 3:
        raise ValueError('Missing locked wheels')
    for path in wheels:
        add(str(path.relative_to(ROOT)))
    return pack(files, output, {
        'repository_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'scope': 'Fourteen newer context reports and final priority ledger replay from captured inputs and saved code. Manual interpretations are preserved, not independently certified. Includes original Visium capture. Does not regenerate the entire companyfacts corpus, v13 runtime release, all earlier scope reports, production delivery or offsite backup.'})


def replay(archive, expected_hash):
    if file_hash(archive) != expected_hash:
        raise ValueError('Archive digest mismatch')
    with tempfile.TemporaryDirectory(prefix='canli-priority-scope-restore-') as temp:
        workspace = Path(temp) / 'workspace'
        manifest = verify(archive, workspace)
        env = Path(temp) / 'venv'
        subprocess.run([sys.executable, '-m', 'venv', str(env)], check=True, capture_output=True)
        python = str(env / 'bin/python')

        def run(args):
            result = subprocess.run(args, cwd=workspace, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr[-3000:])

        run([python, '-m', 'pip', 'install', '--no-index', '--require-hashes', '--only-binary=:all:', '--find-links', WHEELS, '-r', 'scripts/requirements-editorial.txt'])
        outputs = {}
        for script, report in REPLAYS:
            output = Path(temp) / report
            run([python, 'scripts/' + script, str(output)])
            expected = file_hash(workspace / A / report)
            if file_hash(output) != expected:
                raise ValueError('Report replay differs: ' + report)
            outputs[report] = expected
            print('Replayed ' + report, flush=True)
        output = Path(temp) / LEDGER
        run(['node', 'scripts/reconcile-priority-scope-v13.mjs', str(output), *SUPPLEMENTS])
        expected = file_hash(workspace / A / LEDGER)
        if file_hash(output) != expected:
            raise ValueError('Priority ledger replay differs')
        ledger = json.loads(output.read_bytes())
        counts = [ledger[k] for k in ['original_priority_observations', 'active_reviewed_observations', 'active_observations_needing_scope_review', 'withdrawn_observations']]
        if counts != [610, 600, 0, 10]:
            raise ValueError('Scope partition changed')
        outputs[LEDGER] = expected
        return dict(schema='canli.priority-scope-archive.v1', result='PASS',
                    archive_sha256=expected_hash, archive_bytes=archive.stat().st_size,
                    files=len(manifest['files']), reproduced_reports=outputs,
                    original_observations=610, reviewed=600, pending=0, withdrawn=10,
                    offline_dependency_install=True, temporary_restore_removed=True,
                    remote_backup_verified=False, scope=manifest['metadata']['scope'])


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
            raise ValueError('Replay requires independently retained SHA256')
        expected_hash = args.sha256
    result = replay(args.archive, expected_hash)
    with args.receipt.open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
