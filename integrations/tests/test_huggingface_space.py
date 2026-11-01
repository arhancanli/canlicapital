"""The Space's checking, against the local stub. Gradio itself is imported only when the Space runs."""
from __future__ import annotations

import os
import tempfile
import unittest
from unittest import mock

from module_loader import load_tool_module
from stub_server import start_stub_server, stop_stub_server

app = load_tool_module("_huggingface_space_under_test", "huggingface_space/app.py")


class ReadReturns(unittest.TestCase):
    def test_last_column_header_and_blanks(self):
        text = "date,returns\n" + "".join(f"2024-01-{i + 1:02d},0.0{i % 9 + 1}\n" for i in range(25)) + "2024-02-01,\n"
        self.assertEqual(len(app.read_returns(text)), 25)

    def test_a_bad_cell_is_named(self):
        with self.assertRaisesRegex(ValueError, "Row 3"):
            app.read_returns("r\n0.1\noops\n" + "0.1\n" * 30)

    def test_too_few(self):
        with self.assertRaisesRegex(ValueError, "too few"):
            app.read_returns("r\n0.1\n0.2\n")


class Check(unittest.TestCase):
    def setUp(self):
        server, thread, self.base = start_stub_server()
        self.addCleanup(stop_stub_server, server, thread)

    def test_the_figure_comes_with_its_limits(self):
        with mock.patch.dict(os.environ, {"CANLI_API_BASE": self.base, "CANLI_KEY": "ck_test"}):
            out = app.check("r\n" + "0.01\n-0.01\n" * 20, 10)
        self.assertIn("across 10 tries", out)
        self.assertIn("never saw the data source", out)

    def test_one_try_is_refused(self):
        with self.assertRaisesRegex(ValueError, "at least 2"):
            app.check("r\n" + "0.01\n" * 30, 1)

    def test_the_page_reports_errors_in_words(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write("r\n0.1\n")
        self.addCleanup(os.unlink, f.name)
        self.assertIn("could not be checked", app.run(f.name, 10))
        self.assertIn("Upload a CSV", app.run(None, 10))


if __name__ == "__main__":
    unittest.main()
