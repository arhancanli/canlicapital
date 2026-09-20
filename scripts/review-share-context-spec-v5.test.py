import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review-share-context-spec-v5.py'))
review = importlib.util.module_from_spec(spec); spec.loader.exec_module(review)

class ExplicitSubsetTests(unittest.TestCase):
    def test_exact_subset_preserves_target_objects(self):
        rows = [dict(tag='EPS', unit='USD/shares', val=1, end='2025-12-31'), dict(tag='Shares', unit='shares', val=4)]
        self.assertIs(review.reviewed_subset(rows, [dict(rows[0])])[0], rows[0])
    def test_rejects_empty_duplicate_and_changed_evidence(self):
        row = dict(tag='EPS', unit='USD/shares', val=1, accn='a', end='2025-12-31')
        for selected in [[], [row, row], [{**row, 'unit':'ILS/shares'}], [{**row, 'val':2}], [{**row, 'accn':'b'}], [{**row, 'filed':'new'}]]:
            with self.subTest(selected=selected), self.assertRaises(AssertionError):
                review.reviewed_subset([row], selected)
    def test_rejects_duplicate_targets(self):
        row = dict(tag='EPS', val=1)
        with self.assertRaises(AssertionError): review.reviewed_subset([row,row], [row])
if __name__ == '__main__': unittest.main()
