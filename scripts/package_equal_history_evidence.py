"""Archive and independently replay the 610-observation numerical closure."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from package_company_evidence import file_hash, pack, verify

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'artifacts/seo/'
PRIMARY = [
    ('company-equal-history-retained-targets-20260920.json', 'company-equal-history-retained-review-qname-20260920.json'),
    ('company-equal-history-incremental-targets-20260920.json', 'company-equal-history-incremental-review-20260920.json'),
    ('company-equal-history-final-primary-targets-20260920.json', 'company-equal-history-final-primary-review-20260920.json'),
]
XML = [
    ('company-equal-history-xbrl-input-20260920', 'company-equal-history-xbrl-recheck-20260920.json'),
    ('company-equal-history-final-xbrl-input-20260920', 'company-equal-history-final-xbrl-recheck-20260920.json'),
]
HELPER = 'scripts/review-company-editorial-xbrl.py'
WHEELS = PREFIX + 'corpus-local/equal-history-replay-wheels'


def build(output, prior_helper):
    files = {}
    def add(name):
        path = ROOT / name
        assert path.resolve() == path and path.is_file()
        files[name] = path
    def dependencies(value):
        if isinstance(value, list):
            for item in value:
                dependencies(item)
        elif isinstance(value, dict):
            if 'receipt_path' in value:
                name = value['receipt_path']
                add(name)
                receipt = json.loads(files[name].read_bytes())
                body = receipt.get('body_path', name.replace('.receipt.json', '.response'))
                add(body)
                assert file_hash(files[body]) == receipt['sha256']
                assert files[body].stat().st_size == receipt['bytes']
            if 'body_path' in value:
                add(value['body_path'])
                # Offline instance loaders require both members of their cache pair.
                paired = value['body_path'].replace('.response', '.receipt.json')
                if (ROOT / paired).is_file():
                    add(paired)
            for item in value.values():
                dependencies(item)
    reports = sorted((ROOT / PREFIX).glob('company-equal-history-*.json'))
    reports += sorted((ROOT / PREFIX).glob('company-eventiko-history-*.json'))
    reports.append(ROOT / PREFIX / 'company-five-cohort-equal-history-review-20260920.json')
    for path in reports:
        add(str(path.relative_to(ROOT)))
        dependencies(json.loads(path.read_bytes()))
    for name in ['package_equal_history_evidence.py', 'package_company_evidence.py',
                 'review-retained-concept-filings.py', 'review-company-editorial-xbrl.py',
                 'requirements-editorial.txt']:
        add('scripts/' + name)
    for path in sorted((ROOT / WHEELS).glob('*.whl')):
        add(str(path.relative_to(ROOT)))
    assert len(list((ROOT / WHEELS).glob('*.whl'))) == 3
    prior_hash = file_hash(prior_helper)
    for _, name in PRIMARY:
        report = json.loads((ROOT / PREFIX / name).read_bytes())
        assert report['xbrl_helper_sha256'] == prior_hash
    files['replay-sources/prior-xbrl.py'] = prior_helper
    files['replay-sources/current-xbrl.py'] = ROOT / HELPER
    return pack(files, output, {
        'repository_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'python': sys.version, 'prior_helper_sha256': prior_hash,
        'scope': 'Primary/XBRL numerical comparison closure for 610 selected observations. Includes failed reports and parser versions, primary/index/instance bytes, locked Python wheels. Does not regenerate the source companyfacts queue, rerun manual scope interpretation, confer admission or establish offsite backup.'})


def replay(archive, expected_hash):
    assert file_hash(archive) == expected_hash
    with tempfile.TemporaryDirectory(prefix='canli-equality-restore-') as temp:
        workspace = Path(temp) / 'workspace'
        manifest = verify(archive, workspace)
        env = Path(temp) / 'venv'
        subprocess.run([sys.executable, '-m', 'venv', str(env)], check=True, capture_output=True)
        python = str(env / 'bin/python')
        def run(args):
            result = subprocess.run([python, *args], cwd=workspace, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr[-2000:])
        run(['-m', 'pip', 'install', '--no-index', '--require-hashes', '--only-binary=:all:',
             '--find-links', WHEELS, '-r', 'scripts/requirements-editorial.txt'])
        expected = {name: file_hash(workspace / PREFIX / name) for _, name in PRIMARY + XML}
        # The primary reports predate these supplementary instances. Keep them
        # outside the primary scanner's workspace until its historical replay ends.
        xml_cache = workspace / PREFIX / 'corpus-local/equal-history-xbrl'
        held_xml = Path(temp) / 'supplementary-instances'
        shutil.move(xml_cache, held_xml)
        shutil.copyfile(workspace / 'replay-sources/prior-xbrl.py', workspace / HELPER)
        for target, output in PRIMARY:
            run(['scripts/review-retained-concept-filings.py', PREFIX + target, PREFIX + output])
        shutil.copyfile(workspace / 'replay-sources/current-xbrl.py', workspace / HELPER)
        shutil.move(held_xml, xml_cache)
        for stem, output in XML:
            run([HELPER, PREFIX + stem + '-capture.json', PREFIX + stem + '-comparison.json',
                 PREFIX + 'corpus-local/equal-history-xbrl', PREFIX + output, '--offline'])
        for name, digest in expected.items():
            assert file_hash(workspace / PREFIX / name) == digest, 'Replay changed ' + name
        actual = {}
        for _, name in PRIMARY + XML:
            report = json.loads((workspace / PREFIX / name).read_bytes())
            for filing in report['filings']:
                for check in filing['checks']:
                    key = filing['cik'] + '|' + json.dumps(check['selected'], sort_keys=True, separators=(',', ':'))
                    actual[key] = actual.get(key, False) or check['matched']
        queue = json.loads((workspace / PREFIX / 'company-five-cohort-equal-history-review-20260920.json').read_bytes())
        wanted = {}
        for case in queue['cases']:
            if case['category'] == 'basic_diluted_nonzero_equality':
                continue
            for concept in case['observations']:
                for row in concept['observations']:
                    key = case['cik'] + '|' + json.dumps({'tag': concept['tag'], **row}, sort_keys=True, separators=(',', ':'))
                    wanted[key] = True
        assert actual == wanted and len(actual) == 610
        return {'schema': 'canli.equal-history-archive-restore.v1', 'result': 'PASS',
                'archive_sha256': expected_hash, 'archive_bytes': archive.stat().st_size,
                'files': len(manifest['files']), 'reproduced_reports': expected,
                'unique_observations': len(actual), 'matched_observations': sum(actual.values()),
                'offline_dependency_install': True, 'temporary_restore_removed': True,
                'scope': manifest['metadata']['scope']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['build', 'replay'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--prior-helper', type=Path)
    parser.add_argument('--sha256')
    args = parser.parse_args()
    assert not args.report.exists()
    if args.mode == 'build':
        assert args.prior_helper
        build(args.archive, args.prior_helper)
        expected = file_hash(args.archive)
    else:
        assert args.sha256
        expected = args.sha256
    result = replay(args.archive, expected)
    with args.report.open('x') as handle:
        json.dump(result, handle, indent=2)
        handle.write('\n')
    print(json.dumps(result))
