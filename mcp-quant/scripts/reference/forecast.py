"""Reference values for forecast_accuracy_test, conditional_forecast_test and model_confidence_set, computed
independently of the server.

The Diebold-Mariano test (Diebold and Mariano 1995: the loss differential's mean over the square root of its
long-run variance, from its autocovariances to lag h - 1) with the Harvey, Leybourne and Newbold (1997) small-sample
correction (the statistic scaled by sqrt((T + 1 - 2h + h(h - 1) / T) / T) and compared with Student's t on T - 1
degrees of freedom), as R's forecast::dm.test computes it, written here with numpy and scipy. Regenerate with:

    uv run --with numpy --with scipy python scripts/reference/forecast.py > test/fixtures/forecast.json
"""

import json
import math

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


def giacomini_white(actual, fa, fb, power, tau, instruments):
    """Giacomini and White (2006): Z_t = h_t d_t with h_t = (1, d_{t-tau}), Wald statistic n zbar' Omega^-1 zbar,
    Omega the uncentred Newey-West matrix with tau - 1 Bartlett lags (gwtest's second moment for tau = 1)."""
    la, lb = np.abs(actual - fa) ** power, np.abs(actual - fb) ** power
    d = la - lb
    lag = 0 if instruments == "constant" else tau
    dt = d[lag:]
    Z = dt[:, None] if instruments == "constant" else np.column_stack([dt, d[lag - tau: len(d) - tau] * dt])
    n, q = Z.shape
    omega = Z.T @ Z / n
    for k in range(1, tau):
        g = Z[k:].T @ Z[:-k] / n
        omega += (1 - k / tau) * (g + g.T)
    zbar = Z.mean(axis=0)
    stat = float(n * zbar @ np.linalg.solve(omega, zbar))
    p = float(stats.chi2.sf(stat, q))
    share = None
    if instruments != "constant":
        X = np.column_stack([np.ones(n), d[lag - tau: len(d) - tau]])
        beta = np.linalg.lstsq(X, dt, rcond=None)[0]
        share = float(np.mean(X @ beta > 0))
    better = ((("a" if la.mean() < lb.mean() else "b") if share is None else ("b" if share > 0.5 else "a"))
              if p < 0.05 else "neither at the 5% level")
    return {"mean_loss_a": la.mean(), "mean_loss_b": lb.mean(), "mean_loss_difference": d.mean(), "gw_stat": stat, "df": q,
            "p_value": p, "better": better, "share_a_predicted_worse": share, "horizon": tau, "instruments": instruments,
            "periods": n}


M32 = 0xFFFFFFFF


def mulberry32(seed):
    s = seed & M32

    def rnd():
        nonlocal s
        s = (s + 0x6D2B79F5) & M32
        t = ((s ^ (s >> 15)) * (1 | s)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rnd


def stationary_indices(n, block, rnd):
    p, idx, out = 1 / block, 0, np.empty(n, dtype=np.int64)
    for t in range(n):
        u = rnd()
        idx = math.floor(rnd() * n) if t == 0 or u < p else (idx + 1) % n
        out[t] = idx
    return out


def model_confidence_set(L, names, method, reps, block, seed, confidence):
    """Hansen, Lunde and Nason (2011): eliminate while the stationary-bootstrap test of equal accuracy rejects."""
    T, M = L.shape
    rnd = mulberry32(seed)
    Lb = np.array([L[stationary_indices(T, block, rnd)].mean(axis=0) for _ in range(reps)])
    Lbar = L.mean(axis=0)
    live, pv, order, running, step = list(range(M)), [None] * M, [None] * M, 0.0, 0
    while len(live) > 1:
        S = np.array(live)
        if method == "max":
            dbar = Lbar[S] - Lbar[S].mean()
            dstar = Lb[:, S] - Lb[:, S].mean(axis=1, keepdims=True)
            sd = np.sqrt(((dstar - dbar) ** 2).mean(axis=0))
            tv = dbar / sd
            stat, elim = tv.max(), live[int(np.argmax(tv))]
            boot = ((dstar - dbar) / sd).max(axis=1)
        else:
            dbar = Lbar[S][:, None] - Lbar[S][None, :]
            dstar = Lb[:, S][:, :, None] - Lb[:, S][:, None, :]
            sd = np.sqrt(((dstar - dbar) ** 2).mean(axis=0))
            off = ~np.eye(len(S), dtype=bool)
            t = np.where(off, dbar / np.where(off, sd, 1), -np.inf)
            stat = np.abs(np.where(off, t, 0)).max()
            elim = live[int(np.argmax(t.max(axis=1)))]
            boot = np.abs(np.where(off, (dstar - dbar) / np.where(off, sd, 1), 0)).reshape(reps, -1).max(axis=1)
        p = float((boot >= stat).mean())
        running = max(running, p)
        step += 1
        pv[elim], order[elim] = running, step
        live = [i for i in live if i != elim]
    pv[live[0]], order[live[0]] = 1.0, M
    rows = [[names[i], Lbar[i], pv[i], None if order[i] == M else order[i], pv[i] > 1 - confidence] for i in sorted(range(M), key=lambda i: order[i])]
    return {"columns": ["model", "mean_loss", "mcs_p_value", "eliminated_at_step", "in_set"], "rows": rows,
            "in_set": [names[i] for i in range(M) if pv[i] > 1 - confidence], "method": method, "reps": reps, "block": block,
            "seed": seed, "periods": T, "models": M}


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

# Giacomini-White: the AR(1) forecast against the random walk, one step, lagged-difference instruments.
args = {"actual": actual.tolist(), "forecast_a": model.tolist(), "forecast_b": naive.tolist()}
add("conditional_forecast_test", args, {**giacomini_white(actual, model, naive, 2, 1, "lagged_difference"), "loss": "squared"})
# The near-identical pair, unconditional (a constant instrument), absolute errors.
args = {"actual": actual.tolist(), "forecast_a": model.tolist(), "forecast_b": close.tolist(), "loss": "absolute", "instruments": "constant"}
add("conditional_forecast_test", args, {**giacomini_white(actual, model, close, 1, 1, "constant"), "loss": "absolute"})
# Three steps ahead: instruments lagged three periods, two Newey-West lags.
args = {"actual": actual.tolist(), "forecast_a": model.tolist(), "forecast_b": naive.tolist(), "horizon": 3}
add("conditional_forecast_test", args, {**giacomini_white(actual, model, naive, 2, 3, "lagged_difference"), "loss": "squared"})

# Model confidence set over four forecasts: the AR(1) forecast, a near copy, the random walk and zero.
zero = np.zeros(300)
F = [model, close, naive, zero]
L = np.column_stack([(actual - f) ** 2 for f in F])
names = ["ar1", "ar1_noisy", "random_walk", "zero"]
for method in ("R", "max"):
    args = {"actual": actual.tolist(), "forecasts": [f.tolist() for f in F], "models": names, "method": method, "reps": 400, "seed": 5}
    add("model_confidence_set", args, {**model_confidence_set(L, names, method, 400, round(300 ** (1 / 3)), 5, 0.9), "confidence": 0.9})

print(json.dumps({"generated_by": "scripts/reference/forecast.py", "cases": cases}, default=float))
