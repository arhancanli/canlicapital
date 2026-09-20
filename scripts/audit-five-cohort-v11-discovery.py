"""Independently compare complete sitemap URL sets and storage plans across v10/v11."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / 'artifacts/seo'
C = A / 'corpus-local'
def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def inventory(version):
    directory = C / ('company-five-cohort-discovery-' + version)
    raw = (directory / 'discovery.json').read_bytes()
    summary = json.loads(raw)
    urls = []
    shards = []
    for entry in summary['files']:
        body = (directory / entry['storage_path']).read_bytes()
        if len(body) != entry['bytes'] or sha(body) != entry['sha256']:
            raise ValueError('Sitemap binding mismatch')
        tree = ET.fromstring(body)
        if tree.tag.endswith('urlset'):
            found = [node.text for node in tree.findall('{*}url/{*}loc')]
            if len(found) > 50000 or len(body) > 50 * 1024 * 1024:
                raise ValueError('Sitemap limit exceeded')
            urls.extend(found); shards.append(len(found))
    if len(urls) != len(set(urls)) or len(urls) != summary['urls']:
        raise ValueError('Duplicate or missing sitemap URLs')
    return summary, set(urls), sha(raw), shards


def main():
    old, before, old_sha, _ = inventory('v10')
    new, after, new_sha, shards = inventory('v11')
    removed = sorted(before - after)
    if removed or after - before:
        raise ValueError('Unexpected URL changes')
    plan_raw = (C / 'company-five-cohort-storage-plan-v11.json').read_bytes()
    plan = json.loads(plan_raw)
    previous = json.loads((C / 'company-five-cohort-storage-plan-v10.json').read_bytes())
    if (plan['release_hash'], plan['catalog_root'], plan['companies'], plan['histories']) != (new['release_hash'], new['catalog_root'], new['companies'], new['histories']):
        raise ValueError('Release/discovery/plan mismatch')
    if len(plan['files']) != plan['objects'] or sum(entry['bytes'] for entry in plan['files']) != plan['bytes']:
        raise ValueError('Storage totals mismatch')
    if len({entry['key'] for entry in plan['files']}) != plan['objects']:
        raise ValueError('Duplicate storage keys')
    if (new['companies'], new['histories'], new['directory_pages'], len(after)) != (3323, 87347, 67, 90737):
        raise ValueError('Unexpected complete inventory')
    prior_keys = {entry['key']: entry for entry in previous['files']}
    common = [entry for entry in plan['files'] if entry['key'] in prior_keys]
    for entry in common:
        for field in ['sha256', 'bytes', 'content_type', 'cache_control']:
            if entry[field] != prior_keys[entry['key']][field]:
                raise ValueError('Shared immutable object changed')
    result = {'schema': 'canli.five-cohort-v11-discovery-audit.v1', 'publication_approved': False,
              'code_sha256': sha(Path(__file__).read_bytes()), 'previous_discovery_sha256': old_sha,
              'discovery_sha256': new_sha, 'release_hash': plan['release_hash'], 'catalog_root': plan['catalog_root'],
              'download_root': plan['download_root'], 'delivery_manifest_sha256': plan['delivery_manifest_sha256'],
              'storage_plan_sha256': sha(plan_raw), 'companies': new['companies'], 'histories': new['histories'],
              'directory_pages': new['directory_pages'], 'unique_urls': len(after), 'shard_counts': shards, 'removed_urls': removed,
              'storage_objects': plan['objects'], 'storage_bytes': plan['bytes'], 'shared_v10_object_keys': len(common),
              'new_object_keys': plan['objects'] - len(common),
              'scope': 'Local exact sitemap-set and immutable-plan comparison. Shared keys do not prove objects exist remotely. No publication or indexing claim.'}
    with (A / 'company-five-cohort-v11-discovery-audit-20260920.json').open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
if __name__ == '__main__':
    main()
