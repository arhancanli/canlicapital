"""Pinned evidence must fail closed before advancing accounting reviews."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / 'scripts/review-share-context-spec-v6.py'
spec = importlib.util.spec_from_file_location('review', RUNNER)
review = importlib.util.module_from_spec(spec); spec.loader.exec_module(review)

class EvidenceBindingTests(unittest.TestCase):
    def test_path_confinement(self):
        parent = ROOT / 'artifacts/seo/corpus-local'
        for path in ['/tmp/evidence', 'artifacts/seo/corpus-local/../outside', 'config/unrelated.json']:
            with self.subTest(path=path), self.assertRaises(AssertionError):
                review.bound_path(path, parent)
    def test_changed_target_or_receipt_cannot_replay(self):
        original = json.loads((ROOT / 'config/company-share-context-batch2-first-20260921.json').read_bytes())
        for field in ['target', 'receipt']:
            data = json.loads(json.dumps(original))
            if field == 'target': data['targets']['sha256'] = '0' * 64
            else: data['decisions'][0]['receipt_sha256'] = '0' * 64
            local = ROOT / 'artifacts/seo/corpus-local'
            local.mkdir(exist_ok=True)
            with self.subTest(field=field), tempfile.TemporaryDirectory(dir=local) as temp:
                data['capture_directory'] = str(Path(temp).relative_to(ROOT))
                decision = data['decisions'][0]
                (Path(temp) / (decision['cik'] + '-' + decision['accession'] + '-primary.receipt.json')).write_text('{}')
                input_path = Path(temp) / 'input.json'; output = Path(temp) / 'output.json'
                input_path.write_text(json.dumps(data))
                result = subprocess.run([__import__('sys').executable, str(RUNNER), str(input_path), str(output)], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('hash changed', result.stderr)
                self.assertFalse(output.exists())
if __name__ == '__main__': unittest.main()
