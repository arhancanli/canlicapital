#!/usr/bin/env python3
"""Freqtrade integration for the Canli Capital validation API.

CLI: python validate_backtest.py <backtest-result.json> --trials N

Reads a freqtrade backtest export (the JSON written by `freqtrade backtesting
--export trades`), which nests results as strategy -> <name> -> trades, each trade
carrying a profit_ratio and a close_date. This script sums each closed trade's
profit_ratio onto its close date and fills any day with no closed trade as zero,
approximating a daily return series, then posts that series and --trials to the
deflated-Sharpe endpoint before the strategy moves to dry-run. The approximation is
stated up front every time this script runs, because summing per-trade profit is not
the same as a true daily mark-to-market equity curve.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional, Sequence


def _import_canli_validate():
    """Load the sibling canli_validate package by file path.

    Deliberately does not touch sys.path: inserting this file's parent directory
    there would make the sibling directories "vectorbt", "backtrader" and
    "freqtrade" resolve as empty namespace packages for a plain `import freqtrade`
    whenever the real package is not installed. This script never needs to import
    freqtrade itself (it only reads freqtrade's exported JSON), but the same rule
    keeps all three integrations consistent.
    """
    module = sys.modules.get("canli_validate")
    if module is not None:
        return module
    init_path = Path(__file__).resolve().parent.parent / "canli_validate" / "__init__.py"
    spec = importlib.util.spec_from_file_location("canli_validate", init_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["canli_validate"] = module
    spec.loader.exec_module(module)
    return module


canli_validate = _import_canli_validate()

DEFAULT_LABEL = "integration-freqtrade"

APPROXIMATION_NOTICE = (
    "Approximation: this return series sums each closed trade's profit_ratio onto its "
    "close date and fills days with no closed trade as zero. It is not a true daily "
    "mark-to-market equity curve: overlapping trades, open positions and compounding "
    "are not modeled. Treat the verdict below with that in mind."
)


def _parse_close_date(value) -> date:
    """Pure helper: parse freqtrade's close_date (ISO string or epoch seconds) to a date."""
    if isinstance(value, (int, float)):
        return datetime.utcfromtimestamp(value).date()
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    if " " in text and "T" not in text:
        text = text.replace(" ", "T", 1)
    return datetime.fromisoformat(text).date()


def extract_trades(backtest_result: dict, strategy_name: Optional[str] = None) -> list:
    """Pure helper: pull the trades list out of a freqtrade backtest export.

    Freqtrade nests results as strategy -> <name> -> trades (older exports use
    "results" for the same list of per-trade records). Raises ValueError with a
    plain message when the export does not look like a freqtrade backtest result.
    """
    strategies = backtest_result.get("strategy") or {}
    if not strategies:
        raise ValueError("No 'strategy' key found; this does not look like a freqtrade backtest export")
    name = strategy_name or next(iter(strategies))
    if name not in strategies:
        raise ValueError(f"Strategy '{name}' not found in export; available: {list(strategies)}")
    strategy = strategies[name]
    trades = strategy.get("trades")
    if trades is None:
        trades = strategy.get("results")
    if trades is None:
        raise ValueError(f"Strategy '{name}' has neither 'trades' nor 'results' in the export")
    return trades


def daily_returns_from_trades(trades: Sequence[dict]) -> list:
    """Pure helper: build an approximate daily return series from closed trades.

    Sums profit_ratio across every trade that closed on the same day, then fills
    every day between the first and last close date with zero when nothing closed.
    Open trades (is_open truthy) and trades missing close_date or profit_ratio are
    skipped. Works on plain dicts, so it needs no freqtrade install to test.
    """
    by_day: dict = {}
    for trade in trades:
        if trade.get("is_open"):
            continue
        close_date = trade.get("close_date")
        profit_ratio = trade.get("profit_ratio")
        if close_date is None or profit_ratio is None:
            continue
        day = _parse_close_date(close_date)
        by_day[day] = by_day.get(day, 0.0) + float(profit_ratio)
    if not by_day:
        return []
    days = sorted(by_day)
    one_day = timedelta(days=1)
    series = []
    current = days[0]
    while current <= days[-1]:
        series.append(by_day.get(current, 0.0))
        current += one_day
    return series


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate a freqtrade backtest export against the Canli deflated-Sharpe endpoint.",
    )
    parser.add_argument("result_path", help="Path to freqtrade's exported backtest-result-*.json")
    parser.add_argument(
        "--trials", type=int, required=True,
        help="Number of strategy/parameter variants tried before this one (effective_independent_trials)",
    )
    parser.add_argument("--strategy", default=None, help="Strategy name inside the export (default: the only/first one)")
    parser.add_argument(
        "--periods-per-year", type=float, default=365.0,
        help="Annualization factor for the approximated daily series (default 365)",
    )
    parser.add_argument("--key", default=None, help="API key; defaults to CANLI_KEY or issues a new one")
    parser.add_argument("--label", default=DEFAULT_LABEL)
    args = parser.parse_args(argv)

    with open(args.result_path, "r", encoding="utf-8") as handle:
        backtest_result = json.load(handle)

    trades = extract_trades(backtest_result, args.strategy)
    returns = daily_returns_from_trades(trades)
    if not returns:
        print("No closed trades with profit_ratio and close_date were found; nothing to validate.")
        return 1

    print(APPROXIMATION_NOTICE)
    envelope = canli_validate.validate_returns(
        returns, args.periods_per_year, args.trials, args.key, args.label,
    )
    canli_validate.print_envelope(envelope)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
