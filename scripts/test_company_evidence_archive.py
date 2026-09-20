import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('archive', Path(__file__).with_name('package_company_evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EvidenceArchiveTests(unittest.TestCase):
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
