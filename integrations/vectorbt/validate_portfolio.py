"""VectorBT integration for the Canli Capital validation API.

Takes a vectorbt Portfolio, pipes portfolio.returns() and a trial count into the
deflated-Sharpe endpoint, and prints the verdict with its limits. vectorbt itself is
imported lazily inside the functions that need it, so this file imports cleanly even
when vectorbt is not installed. Run this file directly for a demo: it builds a tiny
synthetic portfolio if vectorbt is installed, otherwise it prints the exact snippet
to paste once it is.

    import vectorbt as vbt
    from integrations.vectorbt.validate_portfolio import validate

    portfolio = vbt.Portfolio.from_holding(price, freq="1D")
    envelope = validate(portfolio, trials=30, periods_per_year=365)

    from integrations.canli_validate import print_envelope
    print_envelope(envelope)
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Optional, Sequence


def _import_canli_validate():
    """Load the sibling canli_validate package by file path.

    Deliberately does not touch sys.path: inserting this file's parent directory
    there would make the sibling directories "vectorbt", "backtrader" and
    "freqtrade" resolve as empty namespace packages for a plain `import vectorbt`
    whenever the real library is not installed, turning a clean ImportError in
    _demo() into a confusing AttributeError instead.
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

DEFAULT_LABEL = "integration-vectorbt"
SECONDS_PER_YEAR = 365.25 * 24 * 3600.0


def periods_per_year_from_seconds(seconds_per_period: float) -> float:
    """Pure helper: convert a bar length in seconds to an annualization factor."""
    if not seconds_per_period or seconds_per_period <= 0:
        raise ValueError("seconds_per_period must be a positive number")
    return SECONDS_PER_YEAR / seconds_per_period


def clean_returns(values: Sequence[Optional[float]]) -> list:
    """Pure helper: drop None/NaN from a raw returns sequence and coerce to float.

    Works on a plain list, so it can be tested without pandas or vectorbt installed.
    """
    cleaned = []
    for value in values:
        if value is None:
            continue
        as_float = float(value)
        if as_float != as_float:  # NaN never equals itself; avoids a numpy dependency
            continue
        cleaned.append(as_float)
    return cleaned


def infer_periods_per_year(index: Sequence) -> float:
    """Infer an annualization factor from an ordered sequence of timestamps.

    Accepts anything that supports subtraction between consecutive elements: plain
    datetime.datetime objects, pandas Timestamps from a DatetimeIndex, or raw numeric
    epoch seconds. Uses the median spacing over up to the first 50 bars so a handful
    of gaps (weekends, halts) do not skew the estimate.
    """
    if len(index) < 2:
        raise ValueError("Need at least two timestamps to infer a bar frequency")
    sample = list(index[: min(len(index), 50)])
    deltas = []
    for previous, current in zip(sample, sample[1:]):
        diff = current - previous
        seconds = diff.total_seconds() if hasattr(diff, "total_seconds") else float(diff)
        if seconds > 0:
            deltas.append(seconds)
    if not deltas:
        raise ValueError("Could not infer a positive bar frequency from the index")
    deltas.sort()
    median_seconds = deltas[len(deltas) // 2]
    return periods_per_year_from_seconds(median_seconds)


def validate(
    portfolio,
    trials: int,
    periods_per_year: Optional[float] = None,
    *,
    key: Optional[str] = None,
    label: str = DEFAULT_LABEL,
    base_url: Optional[str] = None,
) -> dict:
    """Validate a vectorbt Portfolio's return series against the deflated-Sharpe endpoint.

    Extracts portfolio.returns(), infers periods_per_year from the return series'
    index when not given, and posts both plus `trials` in return-series mode. Returns
    the API envelope; pass it to canli_validate.print_envelope() to display it.
    """
    returns_series = portfolio.returns()
    raw_values = getattr(returns_series, "values", returns_series)
    returns = clean_returns(list(raw_values))
    if not returns:
        raise ValueError("portfolio.returns() produced no usable observations")
    if periods_per_year is None:
        periods_per_year = infer_periods_per_year(returns_series.index)
    return canli_validate.validate_returns(
        returns, periods_per_year, trials, key, label, base_url=base_url,
    )


def _demo() -> None:
    try:
        import numpy as np
        import pandas as pd
        import vectorbt as vbt
    except ImportError:
        print("vectorbt is not installed. Install it and run this recipe:\n")
        print("  pip install vectorbt")
        print()
        print("  python -c \"")
        print("import vectorbt as vbt")
        print("from integrations.vectorbt.validate_portfolio import validate")
        print("from integrations.canli_validate import print_envelope")
        print("price = vbt.YFData.download('BTC-USD').get('Close')")
        print("portfolio = vbt.Portfolio.from_holding(price, freq='1D')")
        print("envelope = validate(portfolio, trials=30, periods_per_year=365)")
        print("print_envelope(envelope)")
        print('  "')
        return

    rng = np.random.default_rng(7)
    dates = pd.date_range("2024-01-01", periods=500, freq="D")
    price = pd.Series(100 * np.cumprod(1 + rng.normal(0.0004, 0.01, 500)), index=dates)
    portfolio = vbt.Portfolio.from_holding(price, freq="1D")
    envelope = validate(portfolio, trials=20)
    canli_validate.print_envelope(envelope)


if __name__ == "__main__":
    _demo()
