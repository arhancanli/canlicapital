"""Package completed company evidence and verify every archived byte before restore."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(chunk)
    return h.hexdigest()


def file_hash(path):
    with path.open('rb') as stream:
        return digest(stream)


def safe_name(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or str(path) != name or name == '.':
        raise ValueError('Unsafe archive path')
    return path


def pack(files, output, metadata):
    """Explicit regular-file allowlist; never walks an arbitrary home directory."""
    manifest = {'schema': 'canli.company-evidence-archive.v1', 'metadata': metadata, 'files': []}
    for name, path in sorted(files.items()):
        safe_name(name)
        if name == 'manifest.json' or path.is_symlink() or not path.is_file():
            raise ValueError('Invalid archive input')
        manifest['files'].append({'path': name, 'bytes': path.stat().st_size, 'sha256': file_hash(path)})
    raw = (json.dumps(manifest, indent=2) + '\n').encode()
    with output.open('xb') as stream, tarfile.open(fileobj=stream, mode='w') as archive:
        info = tarfile.TarInfo('manifest.json'); info.size = len(raw)
        archive.addfile(info, io.BytesIO(raw))
        for entry in manifest['files']:
            path = files[entry['path']]
            info = tarfile.TarInfo(entry['path']); info.size = entry['bytes']; info.mode = 0o644
            with path.open('rb') as source:
                archive.addfile(info, source)
    verify(output)
    return manifest


def verify(archive_path, destination=None):
    """Reject extras, links, traversal, truncation and byte/hash mismatches."""
    if destination is not None:
        destination.mkdir(exist_ok=False)
    with tarfile.open(archive_path, 'r:') as archive:
        first = archive.next()
        if first is None or first.name != 'manifest.json' or not first.isfile() or first.size > 16 * 1024 * 1024:
            raise ValueError('Invalid archive manifest')
        manifest = json.load(archive.extractfile(first))
        if manifest.get('schema') != 'canli.company-evidence-archive.v1':
            raise ValueError('Invalid archive schema')
        expected = {}
        for entry in manifest['files']:
            safe_name(entry['path'])
            if entry['path'] in expected or entry['path'] == 'manifest.json':
                raise ValueError('Duplicate manifest path')
            expected[entry['path']] = entry
        seen = set()
        while True:
            member = archive.next()
            if member is None:
                break
            safe_name(member.name)
            if not member.isfile() or member.name in seen or member.name not in expected:
                raise ValueError('Unexpected archive member')
            entry = expected[member.name]
            if member.size != entry['bytes'] or digest(archive.extractfile(member)) != entry['sha256']:
                raise ValueError('Archived bytes differ from manifest')
            seen.add(member.name)
            if destination is not None:
                target = destination / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as out:
                    shutil.copyfileobj(archive.extractfile(member), out)
        if seen != set(expected):
            raise ValueError('Missing archive members')
    return manifest


def build(root, output):
    local = root / 'artifacts/seo/corpus-local'
    summary = json.loads((root / 'artifacts/seo/company-combined-storage-plan-summary.json').read_text())
    plan_path = root / summary['local_plan']
    if file_hash(plan_path) != summary['plan_sha256']:
        raise ValueError('Runtime plan binding changed')
    plan = json.loads(plan_path.read_text())
    files = {}
    def add(path):
        path = path.absolute()
        relative = path.relative_to(root)
        if path.is_symlink() or path.resolve() != path:
            raise ValueError('Symlink in evidence path')
        files['workspace/' + relative.as_posix()] = path
    for entry in plan['files']:
        path = Path(entry['local_path'])
        if path.stat().st_size != entry['bytes'] or file_hash(path) != entry['sha256']:
            raise ValueError('Runtime object binding changed')
        add(path)
    for name in ['fresh-review', 'next-1000']:
        report = json.loads((local / name / 'refresh.json').read_text())
        queue = json.loads((local / name / 'ciks.json').read_text())
        if not report.get('finished_at') or report['stopped'] or len(report['results']) != len(queue):
            raise ValueError('Cannot archive an unfinished cohort as complete')
        for path in sorted((local / name).iterdir()):
            add(path)
    for path in sorted((local / 'editorial-filings').iterdir()):
        add(path)
    for relative in ['company-combined-delivery-extended/delivery.json', 'company-combined-delivery-extended/company-release.json', 'company-combined-catalog-extended/catalog.json']:
        add(local / relative)
    add(plan_path)
    with tempfile.TemporaryDirectory() as temp:
        repository = Path(temp) / 'repository.tar'
        revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
        subprocess.run(['git', '-C', str(root), 'archive', '--format=tar', '-o', str(repository), revision], check=True)
        files['repository.tar'] = repository
        files['packager.py'] = Path(__file__).resolve()
        metadata = {'repository_revision': revision, 'release_hash': plan['release_hash'], 'runtime_plan_sha256': summary['plan_sha256'], 'scope': 'Completed first and second source queues, runtime object closure, editorial captures and repository snapshot. Active third cohort excluded. Local portability only; no remote backup or publication approval.'}
        return pack(files, output, metadata)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['build', 'verify', 'restore'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--destination', type=Path)
    args = parser.parse_args()
    if args.mode == 'restore' and args.destination is None:
        parser.error('restore requires --destination (must not exist)')
    result = build(args.root.resolve(), args.archive) if args.mode == 'build' else verify(args.archive, args.destination if args.mode == 'restore' else None)
    print(json.dumps({'files': len(result['files']), 'source_bytes': sum(f['bytes'] for f in result['files']), 'archive_bytes': args.archive.stat().st_size, 'archive_sha256': file_hash(args.archive), 'metadata': result['metadata']}, indent=2))
