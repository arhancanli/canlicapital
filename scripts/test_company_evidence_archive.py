import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('archive', Path(__file__).with_name('package_company_evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EvidenceArchiveTests(unittest.TestCase):
    def test_batch_profile_rejects_changed_inputs_before_packaging(self):
        import package_batch2_evidence as batch
        import hashlib
        for changed in ['registry', 'ledger', 'pending', 'fixture']:
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as temp:
                root = Path(temp).resolve()
                names = dict(registry=batch.REGISTRY, ledger='artifacts/seo/ledger.json.gz',
                             pending='artifacts/seo/pending.json', fixture='scripts/fixture.json.gz')
                descriptors = {}
                for key, name in names.items():
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b'original')
                    descriptors[key] = dict(path=name, sha256=hashlib.sha256(b'original').hexdigest())
                profile = dict(schema='canli.batch2-archive-profile.v1',
                               registry=descriptors['registry'], ledger=descriptors['ledger'],
                               pending=[descriptors['pending']], fixtures=[descriptors['fixture']], scope='test')
                (root / 'profile.json').write_text(json.dumps(profile))
                (root / names[changed]).write_bytes(b'changed')
                with patch.object(batch, 'ROOT', root), self.assertRaisesRegex(ValueError, 'Archive profile dependency changed'):
                    batch.build(root / 'result.tar', 'profile.json')
                self.assertFalse((root / 'result.tar').exists())

    def test_restore_rejects_untrusted_archive_before_extraction(self):
        from verify_company_evidence_restore import restore_check
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); archive = root / 'evidence.tar'; archive.write_bytes(b'not trusted')
            summary = root / 'summary.json'; summary.write_text(json.dumps({'archive_sha256': '0' * 64}))
            with self.assertRaisesRegex(ValueError, 'independently retained summary'):
                restore_check(archive, summary)


    def test_complete_cohort_requires_exact_original_queue(self):
        queue = ['0000000001', '0000000002']
        valid = {'requested': 2, 'finished_at': '2026-09-20T00:00:00Z', 'stopped': None,
                 'results': [{'cik': queue[0]}, {'cik': queue[1]}]}
        module.complete_cohort(valid, queue)
        for changed in [dict(valid, finished_at=None), dict(valid, stopped='HTTP429'),
                        dict(valid, requested=3), dict(valid, results=[{'cik': queue[0]}] * 2),
                        dict(valid, results=[{'cik': queue[0]}, {'cik': '0000000003'}])]:
            with self.subTest(report=changed), self.assertRaises(ValueError):
                module.complete_cohort(changed, queue)
        with self.assertRaises(ValueError): module.complete_cohort(valid, [queue[0]] * 2)

    def test_roundtrip_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'source'; source.write_bytes(b'original evidence')
            archive = root / 'evidence.tar'
            module.pack({'workspace/source': source}, archive, {})
            module.verify(archive, root / 'restored')
            self.assertEqual((root / 'restored/workspace/source').read_bytes(), source.read_bytes())
            with self.assertRaises(FileExistsError): module.verify(archive, root / 'restored')
            with self.assertRaises(FileExistsError): module.pack({'source': source}, archive, {})

    def test_corrupt_member_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'source'; source.write_bytes(b'unique-original-evidence')
            archive = root / 'evidence.tar'; module.pack({'source': source}, archive, {})
            archive.write_bytes(archive.read_bytes().replace(b'unique-original-evidence', b'changed-original-evidenc'))
            with self.assertRaises(ValueError): module.verify(archive)

    def test_unexpected_link_and_traversal_rejected(self):
        for name, kind in [('extra', tarfile.REGTYPE), ('link', tarfile.SYMTYPE), ('../escape', tarfile.REGTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / 'evidence.tar'
                raw = json.dumps({'schema':'canli.company-evidence-archive.v1','files':[]}).encode()
                with tarfile.open(archive,'w') as target:
                    info=tarfile.TarInfo('manifest.json');info.size=len(raw);target.addfile(info,io.BytesIO(raw))
                    info=tarfile.TarInfo(name);info.type=kind;info.linkname='/tmp/escape';target.addfile(info,io.BytesIO(b''))
                with self.assertRaises(ValueError): module.verify(archive)

if __name__ == '__main__': unittest.main()
