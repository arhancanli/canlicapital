"""Archive liability-context evidence and reproduce three reports offline."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from package_company_evidence import pack, verify, file_hash

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'artifacts/seo/'
WHEELS = PREFIX + 'corpus-local/equal-history-replay-wheels'
REPLAYS = [
    ('prepare-liability-presentation-review.py', 'company-liability-presentation-review-20260920.json'),
    ('review-liability-legacy-context.py', 'company-liability-legacy-context-20260920.json'),
    ('review-greenstream-original-context.py', 'company-greenstream-original-context-20260920.json'),
]


def build(archive):
    files = {}
    def add(name):
        path = ROOT / name
        if path.resolve() != path or not path.is_file():
            raise ValueError('Invalid archive dependency')
        files[name] = path
    closure = json.loads((ROOT / PREFIX / 'company-equal-history-numerical-closure-20260920.json').read_bytes())
    for name in ['company-equal-history-numerical-closure-20260920.json', 'company-five-cohort-equal-history-review-20260920.json']:
        add(PREFIX + name)
    for item in closure['inputs']:
        add(item['path'])
        if file_hash(files[item['path']]) != item['sha256']:
            raise ValueError('Comparison hash mismatch')
    for pattern in ['company-liability-*.json', 'company-greenstream-original-*.json', 'company-equal-history-*targets-20260920.json']:
        for path in sorted((ROOT / PREFIX).glob(pattern)):
            # Archive receipts are outputs, never recursive inputs.
            if 'archive' not in path.name:
                add(str(path.relative_to(ROOT)))
    legacy = json.loads((ROOT / PREFIX / REPLAYS[1][1]).read_bytes())
    for case in legacy['cases']:
        add(case['primary_path'])
        if file_hash(files[case['primary_path']]) != case['primary_sha256']:
            raise ValueError('Legacy primary hash mismatch')
    capture = json.loads((ROOT / PREFIX / 'company-greenstream-original-capture-20260920.json').read_bytes())
    for filing in capture['filings']:
        for key in ['index_capture', 'primary_capture']:
            receipt = filing[key]
            add(receipt['body_path'])
            add(receipt['body_path'].replace('.response', '.receipt.json'))
            if file_hash(files[receipt['body_path']]) != receipt['sha256']:
                raise ValueError('Original capture hash mismatch')
    for name in [script for script, _ in REPLAYS] + ['package_liability_evidence.py', 'package_company_evidence.py', 'requirements-editorial.txt']:
        add('scripts/' + name)
    wheels = sorted((ROOT / WHEELS).glob('*.whl'))
    if len(wheels) != 3:
        raise ValueError('Missing locked dependency wheels')
    for path in wheels:
        add(str(path.relative_to(ROOT)))
    return pack(files, archive, {'repository_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'scope': 'Replays three liability context reports from retained comparisons and legacy/original primary bytes. Preserves manual scope notes; does not independently rerun interpretation, numerical extraction for inline cases, companyfacts selection, all-history admission or offsite backup.'})


def replay(archive):
    with tempfile.TemporaryDirectory(prefix='canli-liability-restore-') as temp:
        workspace = Path(temp) / 'workspace'
        manifest = verify(archive, workspace)
        env = Path(temp) / 'venv'
        subprocess.run([sys.executable, '-m', 'venv', str(env)], check=True, capture_output=True)
        python = str(env / 'bin/python')
        def run(args):
            result = subprocess.run([python, *args], cwd=workspace, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr[-2000:])
        run(['-m', 'pip', 'install', '--no-index', '--require-hashes', '--only-binary=:all:', '--find-links', WHEELS, '-r', 'scripts/requirements-editorial.txt'])
        outputs = {}
        for script, name in REPLAYS:
            output = Path(temp) / name
            run(['scripts/' + script, str(output)])
            expected = file_hash(workspace / PREFIX / name)
            if file_hash(output) != expected:
                raise ValueError('Replay mismatch: ' + name)
            outputs[name] = expected
        return {'schema': 'canli.liability-evidence-archive.v1', 'result': 'PASS',
                'archive_sha256': file_hash(archive), 'archive_bytes': archive.stat().st_size,
                'files': len(manifest['files']), 'reproduced_reports': outputs,
                'offline_dependency_install': True, 'scope': manifest['metadata']['scope']}


if __name__ == '__main__':
    archive, receipt = map(Path, sys.argv[1:])
    if archive.exists() or receipt.exists():
        raise ValueError('Preserve existing archive and receipt')
    build(archive)
    result = replay(archive)
    with receipt.open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
