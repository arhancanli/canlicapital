"""Tests for integrations/freqtrade/validate_backtest.py.

Loads the module by file path so the real freqtrade package is never required (this
script only ever reads freqtrade's exported JSON, it never imports freqtrade). Pure
extraction and aggregation helpers are exercised with small fixture dicts; the CLI's
main() is exercised end to end against the local stub server with a temp JSON file,
so no real freqtrade install, network call or API key is used anywhere in this file.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from datetime import date

from module_loader import load_tool_module
from stub_server import start_stub_server, stop_stub_server

freqtrade_module = load_tool_module("_canli_integration_freqtrade", "freqtrade/validate_backtest.py")


def make_trade(close_date, profit_ratio, is_open=False):
    return {"close_date": close_date, "profit_ratio": profit_ratio, "is_open": is_open}


class ExtractTradesTest(unittest.TestCase):
    def test_reads_trades_key_from_named_strategy(self):
        export = {"strategy": {"MyStrategy": {"trades": [make_trade("2024-01-01 10:00:00", 0.01)]}}}
        trades = freqtrade_module.extract_trades(export)
        self.assertEqual(len(trades), 1)
        self.assertEqual(trades[0]["profit_ratio"], 0.01)

    def test_falls_back_to_results_key_for_older_exports(self):
        export = {"strategy": {"MyStrategy": {"results": [make_trade("2024-01-01 10:00:00", 0.02)]}}}
        trades = freqtrade_module.extract_trades(export)
        self.assertEqual(trades[0]["profit_ratio"], 0.02)

    def test_selects_named_strategy_when_multiple_present(self):
        export = {
            "strategy": {
                "StratA": {"trades": [make_trade("2024-01-01", 0.01)]},
                "StratB": {"trades": [make_trade("2024-01-01", 0.99)]},
            }
        }
        trades = freqtrade_module.extract_trades(export, strategy_name="StratB")
        self.assertEqual(trades[0]["profit_ratio"], 0.99)

    def test_raises_a_plain_message_when_not_a_freqtrade_export(self):
        with self.assertRaises(ValueError) as ctx:
            freqtrade_module.extract_trades({"not_strategy": {}})
        self.assertIn("does not look like a freqtrade backtest export", str(ctx.exception))

    def test_raises_when_strategy_has_neither_trades_nor_results(self):
        with self.assertRaises(ValueError):
            freqtrade_module.extract_trades({"strategy": {"MyStrategy": {}}})


class DailyReturnsFromTradesTest(unittest.TestCase):
    def test_sums_same_day_trades(self):
        trades = [
            make_trade("2024-01-01 09:00:00", 0.01),
            make_trade("2024-01-01 15:00:00", 0.02),
        ]
        series = freqtrade_module.daily_returns_from_trades(trades)
        self.assertEqual(series, [0.03])

    def test_fills_gap_days_with_zero(self):
        trades = [
            make_trade("2024-01-01 09:00:00", 0.01),
            make_trade("2024-01-03 09:00:00", -0.02),
        ]
        series = freqtrade_module.daily_returns_from_trades(trades)
        self.assertEqual(series, [0.01, 0.0, -0.02])

    def test_skips_open_trades(self):
        trades = [
            make_trade("2024-01-01 09:00:00", 0.01, is_open=False),
            make_trade(None, None, is_open=True),
        ]
        series = freqtrade_module.daily_returns_from_trades(trades)
        self.assertEqual(series, [0.01])

    def test_skips_trades_missing_close_date_or_profit_ratio(self):
        trades = [{"close_date": None, "profit_ratio": 0.05}, {"close_date": "2024-01-01", "profit_ratio": None}]
        self.assertEqual(freqtrade_module.daily_returns_from_trades(trades), [])

    def test_empty_trades_gives_empty_series(self):
        self.assertEqual(freqtrade_module.daily_returns_from_trades([]), [])

    def test_parses_iso_and_space_separated_dates_the_same(self):
        trades = [make_trade("2024-01-01T09:00:00+00:00", 0.01), make_trade("2024-01-01 09:00:00", 0.02)]
        series = freqtrade_module.daily_returns_from_trades(trades)
        self.assertEqual(series, [0.03])

    def test_parse_close_date_pure_helper(self):
        self.assertEqual(freqtrade_module._parse_close_date("2024-03-05 12:00:00"), date(2024, 3, 5))
        self.assertEqual(freqtrade_module._parse_close_date("2024-03-05T12:00:00Z"), date(2024, 3, 5))


class MainCliEndToEndTest(unittest.TestCase):
    def setUp(self):
        self.server, self.thread, self.base_url = start_stub_server(keys_per_client_per_day=5)
        self._old_base = os.environ.get("CANLI_API_BASE")
        os.environ["CANLI_API_BASE"] = self.base_url
        os.environ.pop("CANLI_KEY", None)

    def tearDown(self):
        stop_stub_server(self.server, self.thread)
        if self._old_base is None:
            os.environ.pop("CANLI_API_BASE", None)
        else:
            os.environ["CANLI_API_BASE"] = self._old_base

    def _write_export(self, trades):
        export = {"strategy": {"MyStrategy": {"trades": trades}}}
        handle = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(export, handle)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_main_posts_approximated_series_and_prints_verdict(self):
        path = self._write_export(
            [
                make_trade("2024-01-01 09:00:00", 0.01),
                make_trade("2024-01-02 09:00:00", -0.005),
                make_trade("2024-01-03 09:00:00", 0.02),
            ]
        )
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exit_code = freqtrade_module.main([path, "--trials", "12"])
        output = buf.getvalue()
        self.assertEqual(exit_code, 0)
        self.assertIn("Approximation:", output)
        self.assertIn("Verdict:", output)
        self.assertIn("Limits:", output)

    def test_main_reports_when_no_closed_trades_found(self):
        path = self._write_export([make_trade(None, None, is_open=True)])
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exit_code = freqtrade_module.main([path, "--trials", "3"])
        self.assertEqual(exit_code, 1)
        self.assertIn("nothing to validate", buf.getvalue())


class LabelDefaultTest(unittest.TestCase):
    def test_default_label(self):
        self.assertEqual(freqtrade_module.DEFAULT_LABEL, "integration-freqtrade")


if __name__ == "__main__":
    unittest.main()
