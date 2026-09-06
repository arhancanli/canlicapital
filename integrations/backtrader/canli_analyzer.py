"""Backtrader integration for the Canli Capital validation API.

CanliValidation is a bt.Analyzer that collects the strategy's equity curve bar by bar
in next(), converts it to simple returns in stop(), and posts the series plus a trial
count to the deflated-Sharpe endpoint. backtrader itself is imported lazily at module
load time inside a try/except, so this file imports cleanly even when backtrader is
not installed; only instantiating CanliValidation then requires it.

    import backtrader as bt
    from integrations.backtrader.canli_analyzer import CanliValidation

    cerebro = bt.Cerebro()
    cerebro.addstrategy(MyStrategy)
    cerebro.addanalyzer(CanliValidation, trials=30, periods_per_year=252)
    results = cerebro.run()
    envelope = results[0].analyzers.canlivalidation.rets

    from integrations.canli_validate import print_envelope
    print_envelope(envelope)
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Sequence


def _import_canli_validate():
    """Load the sibling canli_validate package by file path.

    Deliberately does not touch sys.path: inserting this file's parent directory
    there would make the sibling directories "vectorbt", "backtrader" and
    "freqtrade" resolve as empty namespace packages for a plain `import backtrader`
    whenever the real library is not installed, turning a clean ImportError into a
    confusing AttributeError on bt.Analyzer.
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

DEFAULT_LABEL = "integration-backtrader"


def simple_returns(equity_curve: Sequence[float]) -> list:
    """Pure helper: convert a list of equity values into simple period returns.

    Works on a plain list, so it can be tested without backtrader installed. A step
    where the prior equity value is zero is skipped rather than raising, since a
    zero-equity bar cannot produce a meaningful percentage return.
    """
    if len(equity_curve) < 2:
        return []
    returns = []
    for previous, current in zip(equity_curve, equity_curve[1:]):
        if previous == 0:
            continue
        returns.append((current - previous) / previous)
    return returns


try:
    import backtrader as bt

    class CanliValidation(bt.Analyzer):
        """Posts the strategy's realized equity-curve returns to the Canli
        deflated-Sharpe validator when the backtest finishes.

        Add with cerebro.addanalyzer(CanliValidation, trials=30, periods_per_year=252).
        After cerebro.run(), the envelope is on
        results[0].analyzers.canlivalidation.rets (None if there were too few bars).
        """

        params = (
            ("trials", 30),
            ("periods_per_year", 252),
            ("key", None),
            ("label", DEFAULT_LABEL),
            ("base_url", None),
            ("verbose", True),
        )

        def start(self):
            self._equity = []
            self.rets = None

        def next(self):
            self._equity.append(float(self.strategy.broker.getvalue()))

        def stop(self):
            returns = simple_returns(self._equity)
            if not returns:
                if self.p.verbose:
                    print("CanliValidation: not enough bars to build a return series; nothing posted")
                return
            envelope = canli_validate.validate_returns(
                returns,
                self.p.periods_per_year,
                self.p.trials,
                self.p.key,
                self.p.label,
                base_url=self.p.base_url,
            )
            self.rets = envelope
            if self.p.verbose:
                canli_validate.print_envelope(envelope)

except ImportError:

    class CanliValidation:  # type: ignore[no-redef]
        """Placeholder used when backtrader is not installed.

        Install backtrader to use this analyzer: pip install backtrader
        """

        def __init__(self, *args, **kwargs):
            raise ImportError(
                "backtrader is required for CanliValidation. Install it with: pip install backtrader"
            )
