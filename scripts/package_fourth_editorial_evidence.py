"""Archive the fourth-cohort editorial supplement and replay its core evidence."""
import argparse
import gzip
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from package_company_evidence import file_hash, pack, verify

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'artifacts/seo/'
REPORTS = [
    'company-fourth-selected-quality-v3.json',
    'company-fourth-editorial-targets-20260920.json',
    'company-fourth-filing-capture-20260920.json',
    'company-fourth-inline-comparison-20260920.json',
    'company-fourth-xbrl-comparison-20260920.json',
    'company-fourth-liberty-scope-20260920.json',
    'company-fourth-liberty-disposition-20260920.json',
    'company-fourth-zero-dispositions-20260920.json',
    'company-fourth-equal-pair-review-20260920.json',
]
REPLAYED = [REPORTS[i] for i in [1, 3, 4, 6, 7]]
SCRIPTS = ['package_company_evidence.py', 'package_fourth_editorial_evidence.py',
           'prepare-company-editorial-targets.py', 'compare-company-editorial-filings.py',
           'review-company-editorial-xbrl.py', 'review-liberty-equipment-scope.py',
           'review-fourth-zero-scope.py']
DELIVERY = PREFIX + 'corpus-local/fourth-1000-delivery-v3'
CACHE = PREFIX + 'corpus-local/fourth-editorial-filings'


def build(output):
    files = {}
    def add(relative):
        path = ROOT / relative
        if path.resolve() != path or not path.is_file():
            raise ValueError('Missing or linked archive input')
        files[relative] = path
    for name in REPORTS:
        add(PREFIX + name)
    for name in SCRIPTS:
        add('scripts/' + name)
    add(DELIVERY + '/delivery.json')
    targets = json.loads((ROOT / (PREFIX + REPORTS[1])).read_bytes())
    ciks = {t['cik'] for t in targets['targets']}
    delivery = json.loads((ROOT / DELIVERY / 'delivery.json').read_bytes())
    included = set()
    for item in delivery['files']:
        if item['cik'] not in ciks:
            continue
        for kind in ['selected', 'source']:
            descriptor = item[kind]
            path = DELIVERY + '/' + descriptor['storage_path']
            add(path)
            assert file_hash(files[path]) == descriptor['sha256']
            assert files[path].stat().st_size == descriptor['bytes']
        original = gzip.decompress((ROOT / DELIVERY / item['source']['storage_path']).read_bytes())
        assert hashlib.sha256(original).hexdigest() == item['source_sha256']
        included.add(item['cik'])
    assert included == ciks
    for receipt_path in sorted((ROOT / CACHE).glob('*.receipt.json')):
        receipt = json.loads(receipt_path.read_bytes())
        add(str(receipt_path.relative_to(ROOT)))
        add(receipt['body_path'])
        assert receipt['status'] == 200
        assert file_hash(files[receipt['body_path']]) == receipt['sha256']
        assert files[receipt['body_path']].stat().st_size == receipt['bytes']
        # One reused Liberty receipt points at its original body; offline loader
        # also requires the named cached body to exist before loading that receipt.
        paired = receipt_path.with_name(receipt_path.name.replace('.receipt.json', '.response'))
        add(str(paired.relative_to(ROOT)))
        assert file_hash(paired) == receipt['sha256']
    return pack(files, output, {
        'scope': 'Fourth-cohort editorial supplement: 30 source snapshots, selected records and priority filing evidence. Replays targets, 120 numerical comparisons and four scope exclusions. Does not rebuild the full cohort, repeat the quality audit, confer publication approval or establish offsite retention.',
        'repository_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'python': sys.version, 'beautifulsoup4': importlib.metadata.version('beautifulsoup4'),
        'runtime_note': 'Python and third-party dependencies are recorded, not bundled.',
    })


def replay(archive, expected_sha):
    assert file_hash(archive) == expected_sha, 'Archive checksum changed'
    with tempfile.TemporaryDirectory(prefix='canli-fourth-editorial-restore-') as temp:
        workspace = Path(temp) / 'workspace'
        manifest = verify(archive, workspace)
        expected = {name: file_hash(workspace / PREFIX / name) for name in REPLAYED}
        commands = [
            ['prepare-company-editorial-targets.py', DELIVERY, PREFIX + REPORTS[0], PREFIX + REPORTS[1]],
            ['compare-company-editorial-filings.py', PREFIX + REPORTS[2], PREFIX + REPORTS[1], PREFIX + REPORTS[3]],
            ['review-company-editorial-xbrl.py', PREFIX + REPORTS[2], PREFIX + REPORTS[3], CACHE, PREFIX + REPORTS[4], '--offline'],
            ['review-liberty-equipment-scope.py'], ['review-fourth-zero-scope.py'],
        ]
        for script, *args in commands:
            subprocess.run([sys.executable, 'scripts/' + script, *args], cwd=workspace,
                           check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for name, digest in expected.items():
            assert file_hash(workspace / PREFIX / name) == digest, 'Replay changed ' + name
        return {'schema': 'canli.fourth-editorial-restore.v1', 'archive_sha256': expected_sha,
                'archive_bytes': archive.stat().st_size, 'files': len(manifest['files']),
                'reproduced_report_sha256': expected, 'metadata': manifest['metadata'],
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
            parser.error('replay requires --sha256')
        result = replay(args.archive, args.sha256)
    print(json.dumps(result, indent=2))
