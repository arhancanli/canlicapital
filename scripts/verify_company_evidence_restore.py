"""Restore a sealed company archive in isolation and replay its saved source code."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

from package_company_evidence import evidence_profile, file_hash, safe_name, verify


def restore_check(archive, summary_path):
    summary = json.loads(summary_path.read_text())
    if file_hash(archive) != summary['archive_sha256']:
        raise ValueError('Archive differs from independently retained summary')
    profile = summary['metadata'].get('profile', 'two-cohort')
    config = evidence_profile(profile)
    prefix, suffix, cohorts = config['prefix'], config['suffix'], config['cohorts']
    with tempfile.TemporaryDirectory(prefix='canli-evidence-restore-') as temp:
        restored = Path(temp) / 'restored'
        manifest = verify(archive, restored)
        if manifest['metadata'] != summary['metadata'] or len(manifest['files']) != summary['files']:
            raise ValueError('Archive manifest differs from summary')
        workspace = restored / 'workspace'
        with tarfile.open(restored / 'repository.tar') as repository:
            for member in repository:
                safe_name(member.name.rstrip('/'))
                target = workspace / member.name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                if not member.isfile():
                    raise ValueError('Non-regular repository member')
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as out:
                    shutil.copyfileobj(repository.extractfile(member), out)
        reports = {}
        for name in cohorts:
            output = Path(temp) / (name + '.review.json')
            subprocess.run(['node', 'scripts/review-company-candidates.mjs',
                            'artifacts/seo/corpus-local/' + name, str(output)], cwd=workspace, check=True)
            report = json.loads(output.read_text())
            if not report['complete'] or report['errors'] or any(
                not (row.get('reproduced') or row.get('response_verified')) for row in report['exclusions']
            ):
                raise ValueError('Restored cohort failed source replay')
            reports[name] = {'complete': True, 'companies': len(report['candidates']),
                             'exclusions': len(report['exclusions']), 'errors': 0}
        local = workspace / 'artifacts/seo/corpus-local'
        original_plan = local / config['plan_name']
        if file_hash(original_plan) != summary['metadata']['runtime_plan_sha256']:
            raise ValueError('Restored runtime plan binding differs')
        output = Path(temp) / 'restored-storage-plan.json'
        subprocess.run(['node', 'scripts/prepare-company-storage.mjs', str(local / (prefix + '-catalog-' + suffix)),
                        str(local / (prefix + '-delivery-' + suffix)), str(output)], cwd=workspace,
                       check=True, stdout=subprocess.DEVNULL)
        original = json.loads(original_plan.read_text())
        replayed = json.loads(output.read_text())
        def objects(plan):
            return [(f['key'], f['sha256'], f['bytes']) for f in plan['files']]
        if objects(original) != objects(replayed):
            raise ValueError('Restored runtime object set differs')
        for key in ['release_hash', 'catalog_root', 'download_root', 'companies', 'histories', 'objects', 'bytes']:
            if original[key] != replayed[key]:
                raise ValueError('Restored runtime field differs: ' + key)
        if replayed['release_hash'] != summary['metadata']['release_hash']:
            raise ValueError('Restored release differs from summary')
        receipt = {'schema': 'canli.company-evidence-restore.v1', 'archive_sha256': summary['archive_sha256'],
                   'repository_revision': summary['metadata']['repository_revision'], 'restored_files': summary['files'],
                   'source_replays': reports, 'runtime_objects_replayed': replayed['objects'],
                   'runtime_bytes': replayed['bytes'], 'release_hash': replayed['release_hash'],
                   'objects_exactly_match_original_plan': True, 'remote_backup_verified': False,
                   'verification_code_sha256': file_hash(Path(__file__)),
                   'scope': 'Whole archive SHA checked against separate summary; every member verified; isolated temporary restore; saved repository source replays all named cohorts and runtime objects. No reads of original runtime objects or capture directories. Temporary restore removed after verification; archive remains local.'}
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('summary', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = restore_check(args.archive.resolve(), args.summary.resolve())
    with args.output.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps(result))
