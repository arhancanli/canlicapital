"""Tests for the shared integrations/canli_validate client.

All requests go to a local stub server (stub_server.py); nothing here reaches the
real canlicapital.com API and no real API key is used.
"""
from __future__ import annotations

import contextlib
import io
import os
import unittest

from module_loader import load_tool_module
from stub_server import LIMITS_TEXT, start_stub_server, stop_stub_server

# Loaded by file path rather than via sys.path.insert + `import canli_validate`, so
# this test file never mutates the process-wide sys.path. unittest discover imports
# every test module up front, in the same process, before any test runs; a
# sys.path.insert here would otherwise leak into every other test file's import of
# vectorbt/backtrader/freqtrade and revive the empty-namespace-package bug those
# modules are written to avoid (see test_backtrader_extraction.py).
canli_validate = load_tool_module("_canli_validate_client_under_test", "canli_validate/__init__.py")


class CanliValidateClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._old_base = os.environ.get("CANLI_API_BASE")
        cls._old_key = os.environ.get("CANLI_KEY")
        os.environ.pop("CANLI_KEY", None)

    @classmethod
    def tearDownClass(cls):
        if cls._old_base is None:
            os.environ.pop("CANLI_API_BASE", None)
        else:
            os.environ["CANLI_API_BASE"] = cls._old_base
        if cls._old_key is not None:
            os.environ["CANLI_KEY"] = cls._old_key

    def setUp(self):
        self.server, self.thread, self.base_url = start_stub_server(keys_per_client_per_day=1)
        os.environ["CANLI_API_BASE"] = self.base_url

    def tearDown(self):
        stop_stub_server(self.server, self.thread)

    def test_issue_key_success(self):
        envelope = canli_validate.issue_key("test-label")
        self.assertEqual(envelope["schema"], "canli.api.v1")
        self.assertTrue(envelope["data"]["key"].startswith("ck_live_"))
        self.assertEqual(envelope["data"]["label"], "test-label")

    def test_issue_key_exhausted_returns_429_with_message(self):
        canli_validate.issue_key("first")
        with self.assertRaises(canli_validate.CanliApiError) as ctx:
            canli_validate.issue_key("second")
        err = ctx.exception
        self.assertEqual(err.status, 429)
        self.assertEqual(err.code, "issuance_exhausted")
        self.assertIn("keys per client", str(err))
        self.assertIn("keys per client", err.envelope["error"]["message"])

    def test_validate_returns_requires_a_key_or_issues_one(self):
        returns = [0.001, -0.002, 0.003, 0.0015, -0.001, 0.002]
        envelope = canli_validate.validate_returns(returns, 252, 10, key=None, label="auto-issue")
        self.assertEqual(envelope["data"]["input_mode"], "return_series")
        self.assertIn("plain_reading", envelope["data"])
        self.assertIn("receipt", envelope)
        self.assertTrue(envelope["receipt"]["url"])

    def test_validate_returns_with_explicit_key(self):
        key_envelope = canli_validate.issue_key("explicit")
        key = key_envelope["data"]["key"]
        returns = [0.001, -0.002, 0.003]
        envelope = canli_validate.validate_returns(returns, 252, 5, key, "explicit")
        self.assertEqual(envelope["data"]["derived_inputs"]["effective_independent_trials"], 5)

    def test_validate_returns_rejects_unauthorized_when_key_missing_from_stub_call(self):
        # Bypass the auto-issue path by calling the low-level _post directly with no key,
        # exercising the stub's 401 branch the same way a stripped Authorization header would.
        with self.assertRaises(canli_validate.CanliApiError) as ctx:
            canli_validate._post(
                "/api/v1/validate/deflated-sharpe",
                {"returns": [0.01, 0.02], "periods_per_year": 252, "effective_independent_trials": 5},
                key=None,
                base_url=self.base_url,
            )
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(ctx.exception.code, "unauthorized")

    def test_print_envelope_prints_verdict_every_limit_and_receipt(self):
        envelope = {
            "schema": "canli.api.v1",
            "limits": list(LIMITS_TEXT),
            "data": {"plain_reading": "The probability this Sharpe is above zero is 60.0 percent."},
            "receipt": {"url": "http://127.0.0.1/api/v1/receipts/abc123"},
        }
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            canli_validate.print_envelope(envelope)
        output = buf.getvalue()

        self.assertIn("60.0 percent", output)
        for sentence in LIMITS_TEXT:
            self.assertIn(sentence, output)
        self.assertIn("http://127.0.0.1/api/v1/receipts/abc123", output)

    def test_print_envelope_prints_badge_embed_when_present(self):
        envelope = {
            "limits": list(LIMITS_TEXT),
            "data": {"plain_reading": "verdict text", "badge_markdown": "[![Canli verdict](badge.svg)](receipt)"},
            "receipt": {"url": "http://127.0.0.1/api/v1/receipts/xyz"},
        }
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            canli_validate.print_envelope(envelope)
        self.assertIn("[![Canli verdict](badge.svg)](receipt)", buf.getvalue())

    def test_print_envelope_never_prints_only_the_bare_number(self):
        envelope = {
            "limits": list(LIMITS_TEXT),
            "data": {"plain_reading": "The deflated Sharpe is 0.55."},
        }
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            canli_validate.print_envelope(envelope)
        lines = [line for line in buf.getvalue().splitlines() if line.strip()]
        # every non-blank line carries words, never just a bare numeric token
        for line in lines:
            self.assertFalse(line.strip().replace(".", "", 1).replace("-", "", 1).isdigit())
        self.assertGreater(len(lines), 1)  # verdict plus limits, not just one line

    def test_print_envelope_surfaces_error_message_and_limits(self):
        envelope = {
            "limits": list(LIMITS_TEXT),
            "error": {"code": "issuance_exhausted", "message": "At most 5 keys per client per UTC day"},
            "data": {},
        }
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            canli_validate.print_envelope(envelope)
        output = buf.getvalue()
        self.assertIn("issuance_exhausted", output)
        self.assertIn("At most 5 keys per client per UTC day", output)
        for sentence in LIMITS_TEXT:
            self.assertIn(sentence, output)

    def test_default_label_is_generic_for_bare_client(self):
        self.assertEqual(canli_validate.DEFAULT_LABEL, "integration-client")


if __name__ == "__main__":
    unittest.main()
