"""Reference values for forecast_accuracy_test, computed independently of the server.

The Diebold-Mariano test (Diebold and Mariano 1995: the loss differential's mean over the square root of its
long-run variance, from its autocovariances to lag h - 1) with the Harvey, Leybourne and Newbold (1997) small-sample
correction (the statistic scaled by sqrt((T + 1 - 2h + h(h - 1) / T) / T) and compared with Student's t on T - 1
degrees of freedom), as R's forecast::dm.test computes it, written here with numpy and scipy. Regenerate with:

    uv run --with numpy --with scipy python scripts/reference/forecast.py > test/fixtures/forecast.json
"""

import json

import numpy as np
from scipy import stats

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


def diebold_mariano(actual, fa, fb, power, h):
    la, lb = np.abs(actual - fa) ** power, np.abs(actual - fb) ** power
    d = la - lb
    n = len(d)
    centred = d - d.mean()
    autocov = [float(np.dot(centred[k:], centred[: n - k]) / n) for k in range(h)]
    dm = d.mean() / np.sqrt((autocov[0] + 2 * sum(autocov[1:])) / n)
    stat = dm * np.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
    p = 2 * stats.t.sf(abs(stat), n - 1)
    better = ("a" if la.mean() < lb.mean() else "b") if p < 0.05 else "neither at the 5% level"
    return {
        "mean_loss_a": la.mean(), "mean_loss_b": lb.mean(), "mean_loss_difference": d.mean(), "dm_stat": stat,
        "dm_stat_uncorrected": dm, "df": n - 1, "p_value": p, "p_value_a_better": stats.t.cdf(stat, n - 1),
        "p_value_b_better": stats.t.sf(stat, n - 1), "better": better, "horizon": h, "periods": n,
        "variance_method": "autocovariance",
    }


rng = np.random.default_rng(20261106)
y = np.zeros(301)
for t in range(1, 301):
    y[t] = 0.6 * y[t - 1] + rng.normal(0, 1)
y = y.round(10)
actual, model, naive = y[1:], (0.6 * y[:-1]).round(10), y[:-1]

# The true AR(1) forecast against the random walk, one step ahead, squared errors.
args = {"actual": actual.tolist(), "forecast_a": model.tolist(), "forecast_b": naive.tolist()}
add("forecast_accuracy_test", args, {**diebold_mariano(actual, model, naive, 2, 1), "loss": "squared"})

# Two near-identical forecasts three steps ahead on absolute errors.
close = (model + rng.normal(0, 0.05, 300)).round(10)
args = {"actual": actual.tolist(), "forecast_a": model.tolist(), "forecast_b": close.tolist(), "loss": "absolute", "horizon": 3}
add("forecast_accuracy_test", args, {**diebold_mariano(actual, model, close, 1, 3), "loss": "absolute"})

print(json.dumps({"generated_by": "scripts/reference/forecast.py", "cases": cases}, default=float))
