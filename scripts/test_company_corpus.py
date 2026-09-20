import gzip
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('corpus', ROOT / 'scripts/audit-company-corpus.py')
corpus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(corpus)


class CorpusTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.archive = self.directory / 'pilot.zip'
        self.catalog = self.directory / 'catalog.sqlite'
        self.record = json.loads((ROOT / 'public/company-data/0000320193.json').read_text())
        self.raw = gzip.decompress((ROOT / ('public' + self.record['source_snapshot'])).read_bytes())
        self.captured = self.record['fetched_at']

    def tearDown(self):
        self.temp.cleanup()

    def write(self, members):
        with zipfile.ZipFile(self.archive, 'w') as z:
            for name, content in members:
                z.writestr(name, content)

    def test_real_snapshot_reproduces_and_insufficient_entity_is_excluded(self):
        self.write([('CIK0000320193.json', self.raw), ('CIK0000000001.json', json.dumps(dict(cik=1, entityName='No coverage', facts={})))])
        result = corpus.audit(self.archive, self.catalog, self.captured)
        self.assertEqual(result['scanned_entities'], 2)
        self.assertEqual(result['eligible_entities'], 1)
        self.assertEqual(result['eligible_histories'], len(self.record['concepts']))
        self.assertEqual(result['exclusion_reasons'], {'INSUFFICIENT_COVERAGE': 1})
        self.assertIsNone(result['indexed_pages'])
        self.assertEqual(result['published_pages'], 0)
        with sqlite3.connect(self.catalog) as db:
            record = json.loads(db.execute('SELECT record_json FROM entities WHERE cik=?', (self.record['cik'],)).fetchone()[0])
        self.assertEqual(record['concepts'], self.record['concepts'])
        self.assertEqual(record['source_sha256'], self.record['source_sha256'])

    def test_observed_by_boundary_does_not_invent_individual_capture_times(self):
        self.write([('CIK0000320193.json', self.raw)])
        result = corpus.audit(self.archive, self.catalog, observed_by=self.captured)
        self.assertIsNone(result['captured_at'])
        self.assertEqual(result['capture_time_basis'], 'COLLECTION_RECEIPT_UPPER_BOUND')
        with sqlite3.connect(self.catalog) as db:
            record = json.loads(db.execute('SELECT record_json FROM entities').fetchone()[0])
        self.assertIsNone(record['fetched_at'])
        self.assertEqual(record['observed_no_later_than'], self.captured)
        self.assertEqual(record['concepts'], self.record['concepts'])
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            corpus.audit(self.archive, self.catalog, self.captured, observed_by=self.captured)

    def test_limited_scan_is_explicit_and_never_extrapolated(self):
        self.write([('CIK0000320193.json', self.raw), ('CIK0000000001.json', '{}')])
        result = corpus.audit(self.archive, self.catalog, self.captured, limit=1)
        self.assertEqual(result['scope'], 'LIMITED_SAMPLE')
        self.assertEqual(result['archive_entities'], 2)
        self.assertEqual(result['scanned_entities'], 1)
        self.assertEqual(result['candidate_pages_before_editorial_review'], 0)

    def test_bad_members_do_not_replace_previous_catalog(self):
        self.catalog.write_bytes(b'previous verified catalog')
        for members in [[('../CIK0000320193.json', self.raw)], [('CIK0000320193.json', self.raw)] * 2, []]:
            with self.subTest(members=len(members)):
                self.write(members)
                with self.assertRaises(ValueError):
                    corpus.audit(self.archive, self.catalog, self.captured)
                self.assertEqual(self.catalog.read_bytes(), b'previous verified catalog')
                self.assertEqual(list(self.directory.glob('*.pending')), [])

    def test_identity_mismatch_and_broken_json_are_accounted_for(self):
        self.write([('CIK0000000001.json', self.raw), ('CIK0000000002.json', '{broken')])
        result = corpus.audit(self.archive, self.catalog, self.captured)
        self.assertEqual(result['eligible_entities'], 0)
        self.assertEqual(result['exclusion_reasons'], {'INVALID_ENTITY': 1, 'INVALID_JSON': 1})

    def test_oversize_and_future_capture_fail_closed(self):
        self.write([('CIK0000320193.json', self.raw)])
        old = corpus.MAX_MEMBER_BYTES
        try:
            corpus.MAX_MEMBER_BYTES = 10
            with self.assertRaisesRegex(ValueError, 'Oversized'):
                corpus.audit(self.archive, self.catalog, self.captured)
        finally:
            corpus.MAX_MEMBER_BYTES = old
        with self.assertRaisesRegex(ValueError, 'nonfuture'):
            corpus.audit(self.archive, self.catalog, '2999-01-01T00:00:00Z')
        self.assertFalse(self.catalog.exists())


if __name__ == '__main__':
    unittest.main()
