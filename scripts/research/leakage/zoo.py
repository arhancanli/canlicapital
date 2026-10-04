"""The planted-leak zoo for js/leakage-core.js: ten indicators that look ahead and ten that do not,
written in pandas the way an agent writes them, each run on the full series and on every prefix the
check would ask for. The JavaScript test feeds each one to the check and expects every leak flagged
(with its pattern where the pattern is unambiguous) and no honest indicator flagged.

    python zoo.py <plan.json>   (written by build-zoo.mjs: rows, cuts, seed); prints the zoo as JSON
"""
import json
import math
import sys

import numpy as np
import pandas as pd
import statsmodels
from statsmodels.tsa.filters.hp_filter import hpfilter

plan = json.load(open(sys.argv[1]))
n, cuts, seed = plan["rows"], plan["cuts"], plan["seed"]
rng = np.random.default_rng(seed)

# A drifting random walk with OHLC bars, a benchmark, and a feature with gaps.
ret = 0.0004 + 0.012 * rng.standard_normal(n)
bench = 0.0003 + 0.010 * rng.standard_normal(n)
ret = ret + 0.6 * (bench - 0.0003)
close = pd.Series(100 * np.exp(np.cumsum(ret)))
spread = np.abs(0.006 * rng.standard_normal(n)) + 0.002
df = pd.DataFrame({"close": close, "high": close * (1 + spread), "low": close * (1 - spread), "bench": pd.Series(100 * np.exp(np.cumsum(bench)))})
gappy = close.pct_change().copy()
gappy[rng.random(n) < 0.10] = np.nan
df["gappy"] = gappy
runs = close.pct_change().copy()
i = 5
while i < n:  # runs of one to four missing values, about one row in three missing
    if rng.random() < 0.15:
        k = int(rng.integers(1, 5))
        runs.iloc[i:i + k] = np.nan
        i += k
    i += 1
df["runs"] = runs


def rsi(c, w=14):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / w, adjust=False).mean()
    down = (-d.clip(upper=0)).ewm(alpha=1 / w, adjust=False).mean()
    return 100 - 100 / (1 + up / down)


def residual_full_sample(d):
    r, b = d["close"].pct_change(), d["bench"].pct_change()
    beta = r.cov(b) / b.var()
    return r - beta * b


def rolling_beta(d, w=60):
    r, b = d["close"].pct_change(), d["bench"].pct_change()
    return r.rolling(w).cov(b) / b.rolling(w).var()


def true_range_atr(d, w=14):
    prev = d["close"].shift(1)
    tr = pd.concat([d["high"] - d["low"], (d["high"] - prev).abs(), (d["low"] - prev).abs()], axis=1).max(axis=1)
    return tr.rolling(w).mean()


def macd_hist(c):
    macd = c.ewm(span=12, adjust=True).mean() - c.ewm(span=26, adjust=True).mean()
    return macd - macd.ewm(span=9, adjust=True).mean()


def bollinger_pct_b(c, w=20):
    m, s = c.rolling(w).mean(), c.rolling(w).std()
    return (c - (m - 2 * s)) / (4 * s)


INDICATORS = [
    # name, kind, expected pattern (None: any lookahead pattern), function of the frame
    ("future_return_1", "leak", "future_rows", lambda d: d["close"].shift(-1) / d["close"] - 1),
    ("future_return_5", "leak", "future_rows", lambda d: d["close"].shift(-5) / d["close"] - 1),
    ("centered_sma_21", "leak", "future_rows", lambda d: d["close"].rolling(21, center=True).mean()),
    ("next_10_max", "leak", "future_rows", lambda d: d["close"][::-1].rolling(10, min_periods=1).max()[::-1]),
    ("global_zscore", "leak", "full_sample", lambda d: (d["close"] - d["close"].mean()) / d["close"].std()),
    ("global_minmax", "leak", "full_sample", lambda d: (d["close"] - d["close"].min()) / (d["close"].max() - d["close"].min())),
    ("global_rank_pct", "leak", "full_sample", lambda d: d["close"].rank(pct=True)),
    ("full_sample_residual", "leak", "full_sample", residual_full_sample),
    ("hp_filter_trend", "leak", None, lambda d: pd.Series(hpfilter(d["close"].to_numpy(), lamb=1600)[1])),
    ("mean_imputation", "leak", "sparse", lambda d: d["gappy"].fillna(d["gappy"].mean())),
    ("sma_20", "honest", None, lambda d: d["close"].rolling(20).mean()),
    ("ema_20", "honest", None, lambda d: d["close"].ewm(span=20, adjust=True).mean()),
    ("rsi_14", "honest", None, lambda d: rsi(d["close"])),
    ("macd_hist", "honest", None, lambda d: macd_hist(d["close"])),
    ("bollinger_pct_b", "honest", None, lambda d: bollinger_pct_b(d["close"])),
    ("momentum_12_1", "honest", None, lambda d: d["close"].shift(21) / d["close"].shift(252) - 1),
    ("realized_vol_21", "honest", None, lambda d: d["close"].pct_change().rolling(21).std() * math.sqrt(252)),
    ("atr_14", "honest", None, true_range_atr),
    ("expanding_zscore", "honest", None, lambda d: (d["close"] - d["close"].expanding().mean()) / d["close"].expanding().std()),
    ("rolling_beta_60", "honest", None, rolling_beta),
]
# Also one forward-filled feature: ffill is causal, so it must pass even with gaps.
INDICATORS.append(("ffill_gaps", "honest", None, lambda d: d["runs"].ffill()))
INDICATORS.append(("bfill_gaps", "leak", None, lambda d: d["runs"].bfill()))


def column(values):
    return [None if (v is None or (isinstance(v, float) and math.isnan(v))) else float(v) for v in values]


out = {
    "schema": "canli.leakage-zoo.v1",
    "computed_with": {"pandas": pd.__version__, "numpy": np.__version__, "statsmodels": statsmodels.__version__, "python": sys.version.split()[0]},
    "rows": n, "cuts": cuts, "seed": seed,
    "indicators": [],
}
for name, kind, pattern, fn in INDICATORS:
    full = column(fn(df).to_numpy())
    prefixes = [column(fn(df.iloc[:cut].copy()).to_numpy()) for cut in cuts]
    out["indicators"].append({"name": name, "kind": kind, "expected_pattern": pattern, "full": full, "prefixes": prefixes})
print(json.dumps(out, separators=(",", ":")))
