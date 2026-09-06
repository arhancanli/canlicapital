"""Tests for integrations/vectorbt/validate_portfolio.py.

Loads the module by file path so the real vectorbt package is never required. Pure
extraction helpers are exercised with plain lists and datetimes; the full validate()
path is exercised against a fake Portfolio (a tiny stand-in with a returns() method)
posted to the local stub server, so no real vectorbt install or network call is
needed anywhere in this file.
"""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta

from module_loader import load_tool_module
from stub_server import start_stub_server, stop_stub_server

vectorbt_module = load_tool_module("_canli_integration_vectorbt", "vectorbt/validate_portfolio.py")


class FakeReturnsSeries:
    """Stands in for a pandas Series returned by portfolio.returns()."""

    def __init__(self, values, index):
        self.values = values
        self.index = index


class FakePortfolio:
    """Stands in for a vectorbt Portfolio: only .returns() is ever called."""

    def __init__(self, series):
        self._series = series

    def returns(self):
        return self._series


class CleanReturnsTest(unittest.TestCase):
    def test_drops_none_and_nan_keeps_order(self):
        result = vectorbt_module.clean_returns([0.01, None, float("nan"), -0.02, 0.0])
        self.assertEqual(result, [0.01, -0.02, 0.0])

    def test_coerces_to_float(self):
        result = vectorbt_module.clean_returns([1, -1, 0])
        self.assertEqual(result, [1.0, -1.0, 0.0])
        self.assertTrue(all(isinstance(v, float) for v in result))


class PeriodsPerYearTest(unittest.TestCase):
    def test_daily_seconds_gives_about_365_25(self):
        ppy = vectorbt_module.periods_per_year_from_seconds(86400)
        self.assertAlmostEqual(ppy, 365.25, places=2)

    def test_rejects_non_positive_seconds(self):
        with self.assertRaises(ValueError):
            vectorbt_module.periods_per_year_from_seconds(0)
        with self.assertRaises(ValueError):
            vectorbt_module.periods_per_year_from_seconds(-10)

    def test_infer_from_daily_datetime_index(self):
        index = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(10)]
        ppy = vectorbt_module.infer_periods_per_year(index)
        self.assertAlmostEqual(ppy, 365.25, places=1)

    def test_infer_from_hourly_datetime_index(self):
        index = [datetime(2024, 1, 1) + timedelta(hours=i) for i in range(48)]
        ppy = vectorbt_module.infer_periods_per_year(index)
        self.assertAlmostEqual(ppy, 365.25 * 24, places=0)

    def test_infer_requires_at_least_two_timestamps(self):
        with self.assertRaises(ValueError):
            vectorbt_module.infer_periods_per_year([datetime(2024, 1, 1)])


class ValidateEndToEndTest(unittest.TestCase):
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

    def test_validate_infers_periods_per_year_and_posts_returns(self):
        values = [0.001, -0.002, 0.003, 0.0015, -0.001, 0.002]
        index = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(len(values))]
        portfolio = FakePortfolio(FakeReturnsSeries(values, index))

        envelope = vectorbt_module.validate(portfolio, trials=15)

        self.assertEqual(envelope["data"]["input_mode"], "return_series")
        self.assertEqual(envelope["data"]["derived_inputs"]["observations"], len(values))
        self.assertEqual(envelope["data"]["derived_inputs"]["effective_independent_trials"], 15)
        self.assertIn("plain_reading", envelope["data"])

    def test_validate_accepts_explicit_periods_per_year(self):
        values = [0.001, -0.002, 0.003]
        index = [datetime(2024, 1, 1) + timedelta(days=i) for i in range(len(values))]
        portfolio = FakePortfolio(FakeReturnsSeries(values, index))

        envelope = vectorbt_module.validate(portfolio, trials=8, periods_per_year=52)

        self.assertEqual(envelope["data"]["derived_inputs"]["periods_per_year"], 52)

    def test_validate_rejects_empty_returns(self):
        portfolio = FakePortfolio(FakeReturnsSeries([None, float("nan")], [datetime(2024, 1, 1), datetime(2024, 1, 2)]))
        with self.assertRaises(ValueError):
            vectorbt_module.validate(portfolio, trials=5)


class LabelDefaultTest(unittest.TestCase):
    def test_default_label(self):
        self.assertEqual(vectorbt_module.DEFAULT_LABEL, "integration-vectorbt")


if __name__ == "__main__":
    unittest.main()
