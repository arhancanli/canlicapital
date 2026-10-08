"""Reference values for the sleeves toolset and the eight newer strategy recipes.

Every recipe is re-implemented here with numpy and pandas, with its own copy of the costed,
drift-aware engine. The sleeve catalog (ids, recipes, parameters, warm-ups) is read from the
server as data; every number is recomputed here.

- White's Reality Check comes from the arch package (its unstudentized "upper" p-value), fed the
  same stationary-bootstrap draws (mulberry32 ported below); the re-studentized SPA and StepM are an
  independent numpy implementation on those draws.
- Minimum variance is solved exactly by enumerating active sets.
- Clusters come from scipy's average linkage; CSCV/PBO, effective trials and regimes from numpy.

Regenerate with:

    uv run --with numpy --with pandas --with scipy --with arch python scripts/reference/sleeves.py > test/fixtures/sleeves.json
"""

import itertools
import json
import math
import subprocess

import numpy as np
import pandas as pd
from arch.bootstrap import SPA
from scipy import stats
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


CATALOG = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", "import('./src/sleeves.mjs').then(m => console.log(JSON.stringify(m.SLEEVES)))"]))
BY_ID = {s["id"]: s for s in CATALOG}
assert len(CATALOG) == 399


# ---------------------------------------------------------------------------------------------
# Engine and summary statistics
# ---------------------------------------------------------------------------------------------
def engine(P, W, cost_bps=5, ppy=252, rf=0.0):
    P = np.asarray(P, float)
    T, N = P.shape
    rfp = (1 + rf) ** (1 / ppy) - 1
    w = np.zeros(N)
    net, gross, tos = [], [], []
    for t in range(T - 1):
        to = 0.0
        if W[t] is not None:
            tgt = np.asarray(W[t], float)
            to = np.abs(tgt - w).sum()
            w = tgt.copy()
        r = P[t + 1] / P[t] - 1
        g = w @ r + (1 - w.sum()) * rfp
        net.append(g - cost_bps / 1e4 * to)
        gross.append(g)
        tos.append(to)
        w = w * (1 + r) / (1 + g) if 1 + g > 0 else np.zeros(N)
    return np.array(net), np.array(gross), np.array(tos), w


def summary(net, ppy=252):
    eq = np.cumprod(1 + net)
    dd = (eq / np.maximum.accumulate(np.r_[1.0, eq])[1:] - 1).min()
    sd = net.std(ddof=1)
    return {"total_return": eq[-1] - 1, "cagr": eq[-1] ** (ppy / len(net)) - 1, "volatility": sd * math.sqrt(ppy), "sharpe": net.mean() / sd * math.sqrt(ppy) if sd > 0 else None, "max_drawdown": min(dd, 0.0)}


def jsround(x):
    return math.floor(x + 0.5)


def count_of(f, n):
    return max(1, jsround(f * n))


def scheduled(T, N, start, k, fn):
    out = []
    for t in range(T):
        if t < start:
            out.append([0.0] * N if t == 0 else None)
        elif (t - start) % k:
            out.append(None)
        else:
            out.append(list(fn(t)))
    return out


def rets_of(P):
    R = np.zeros_like(P)
    R[1:] = P[1:] / P[:-1] - 1
    return R


def pick(scores, n, ascending=False):
    idx = sorted(range(len(scores)), key=lambda i: (scores[i] if ascending else -scores[i], i))
    return idx[:n]


# ---------------------------------------------------------------------------------------------
# Recipes: each returns the target list for the engine
# ---------------------------------------------------------------------------------------------
def sma(p, n):
    return pd.Series(p).rolling(n).mean().to_numpy()


def roll_std(p, n):
    r = pd.Series(p).pct_change()
    return r.rolling(n).std(ddof=1).to_numpy()


def vol_scale(sd, s, vt, cap, ppy):
    if not vt or s == 0:
        return s
    if np.isnan(sd) or sd == 0:
        return 0.0
    return s * min(cap, vt / (sd * math.sqrt(ppy)))


def r_ma(p, fast, slow, long_only=True, **_):
    f, s = sma(p, fast), sma(p, slow)
    return [[0.0] if t < slow - 1 else [1.0 if f[t] > s[t] else (0.0 if long_only else -1.0)] for t in range(len(p))]


def r_tsmom(p, lookback, vol_target=None, long_only=True, vol_lookback=63, ppy=252, **_):
    sd = roll_std(p, vol_lookback)
    out = []
    for t in range(len(p)):
        if t < lookback:
            out.append([0.0]); continue
        s = float(np.sign(p[t] / p[t - lookback] - 1))
        if long_only:
            s = max(0.0, s)
        out.append([vol_scale(sd[t], s, vol_target, 2, ppy)])
    return out


def r_ensemble(p, lookbacks, vol_target=None, long_only=True, ppy=252, **_):
    sd, lmax = roll_std(p, 63), max(lookbacks)
    out = []
    for t in range(len(p)):
        if t < lmax:
            out.append([0.0]); continue
        s = 0.0
        for L in lookbacks:
            g = float(np.sign(p[t] / p[t - L] - 1))
            s += max(0.0, g) if long_only else g
        out.append([vol_scale(sd[t], s / len(lookbacks), vol_target, 2, ppy)])
    return out


def r_breakout(p, entry, exit, long_only=True, **_):
    pos, out = 0, []
    for t in range(len(p)):
        x = p[t]
        if t >= entry:
            if x > p[t - entry:t].max():
                pos = 1
            elif x < p[t - entry:t].min() and not long_only:
                pos = -1
        if t >= exit:
            if pos == 1 and x < p[t - exit:t].min():
                pos = 0
            elif pos == -1 and x > p[t - exit:t].max():
                pos = 0
        out.append([float(pos)])
    return out


def r_macd(p, fast, slow, signal, long_only=True, **_):
    s = pd.Series(p)
    macd = s.ewm(span=fast, adjust=False).mean() - s.ewm(span=slow, adjust=False).mean()
    sig = macd.ewm(span=signal, adjust=False).mean()
    warm = slow + signal - 2
    return [[0.0] if t < warm else [1.0 if macd[t] > sig[t] else (0.0 if long_only else -1.0)] for t in range(len(p))]


def r_zscore(p, window, entry_z=2, exit_z=0.5, long_only=True, **_):
    s = pd.Series(p)
    sd = s.rolling(window).std(ddof=1)
    zs = ((s - s.rolling(window).mean()) / sd).where(sd != 0, 0.0).to_numpy()
    pos, out = 0, []
    for t in range(len(p)):
        if t < window - 1:
            out.append([0.0]); continue
        z = zs[t]
        if pos == 1 and z >= -exit_z:
            pos = 0
        elif pos == -1 and z <= exit_z:
            pos = 0
        if pos == 0:
            if z < -entry_z:
                pos = 1
            elif z > entry_z and not long_only:
                pos = -1
        out.append([float(pos)])
    return out


def wilder_rsi(x, n):
    d = np.diff(x)
    g, l = np.maximum(d, 0), np.maximum(-d, 0)
    out = [None] * len(x)
    if len(x) <= n:
        return out
    ag, al = g[:n].mean(), l[:n].mean()
    out[n] = 100 * ag / (ag + al) if ag + al else 50
    for i in range(n, len(d)):
        ag = (ag * (n - 1) + g[i]) / n
        al = (al * (n - 1) + l[i]) / n
        out[i + 1] = 100 * ag / (ag + al) if ag + al else 50
    return out


def r_rsi(p, period, lower, exit_level, **_):
    pos, out = 0, []
    for v in wilder_rsi(p, period):
        if v is not None:
            if pos == 0 and v < lower:
                pos = 1
            elif pos == 1 and v > exit_level:
                pos = 0
        out.append([float(pos)])
    return out


def r_voltarget(p, target, lookback, rebalance_every, ppy=252, **_):
    sd = roll_std(p, lookback)
    out = []
    for t in range(len(p)):
        if t < lookback:
            out.append([0.0])
        elif (t - lookback) % rebalance_every:
            out.append(None)
        else:
            out.append([min(2, target / (sd[t] * math.sqrt(ppy))) if sd[t] > 0 else 0.0])
    return out


def r_xsmom(P, lookback, skip, top_fraction, rebalance_every, long_only=True, **_):
    T, N = P.shape
    top = min(count_of(top_fraction, N), N // 2 or 1)

    def fn(t):
        sc = P[t - skip] / P[t - lookback] - 1
        order = sorted(range(N), key=lambda i: (-sc[i], i))
        w = np.zeros(N)
        w[order[:top]] = (1 if long_only else 0.5) / top
        if not long_only:
            w[order[-top:]] = -0.5 / top
        return w
    return scheduled(T, N, lookback, rebalance_every, fn)


def r_dual(P, lookback, rebalance_every, **_):
    T, N = P.shape

    def fn(t):
        ret = P[t] / P[t - lookback] - 1
        best = 0
        for i in range(1, N):
            if ret[i] > ret[best]:
                best = i
        w = np.zeros(N)
        if ret[best] > 0:
            w[best] = 1
        return w
    return scheduled(T, N, lookback, rebalance_every, fn)


def r_riskparity(P, lookback, rebalance_every, target_volatility=None, ppy=252, **_):
    T, N = P.shape
    R = rets_of(P)

    def fn(t):
        win = R[t - lookback + 1:t + 1]
        sd = win.std(axis=0, ddof=1)
        iv = np.where(sd > 0, 1 / np.where(sd > 0, sd, 1), 0)
        w = iv / iv.sum()
        if target_volatility:
            v = w @ np.cov(win, rowvar=False, ddof=1) @ w
            w = w * min(2, target_volatility / math.sqrt(v * ppy))
        return w
    return scheduled(T, N, lookback, rebalance_every, fn)


def r_equal(P, rebalance_every, **_):
    T, N = P.shape
    return scheduled(T, N, 0, rebalance_every, lambda t: np.ones(N) / N)


def min_var_exact(C):
    """Long-only, fully invested minimum variance by enumerating supports: the best feasible
    support solution of the equality-constrained problem is the global optimum."""
    N = len(C)
    best, bestv = None, math.inf
    for k in range(1, N + 1):
        for S in itertools.combinations(range(N), k):
            S = list(S)
            x = np.linalg.solve(C[np.ix_(S, S)], np.ones(k))
            w = x / x.sum()
            if (w < -1e-14).any():
                continue
            full = np.zeros(N)
            full[S] = w
            v = full @ C @ full
            if v < bestv - 1e-18:
                best, bestv = full, v
    return np.maximum(best, 0)


def r_minvar(P, lookback, rebalance_every, **_):
    T, N = P.shape
    R = rets_of(P)
    return scheduled(T, N, lookback, rebalance_every, lambda t: min_var_exact(np.cov(R[t - lookback + 1:t + 1], rowvar=False, ddof=1)))


def r_lowvol(P, lookback, top_fraction, rebalance_every, **_):
    T, N = P.shape
    R, n = rets_of(P), count_of(top_fraction, N)

    def fn(t):
        sd = R[t - lookback + 1:t + 1].std(axis=0, ddof=1)
        w = np.zeros(N)
        w[pick(list(sd), n, True)] = 1 / n
        return w
    return scheduled(T, N, lookback, rebalance_every, fn)


def r_reversal(P, lookback, top_fraction, rebalance_every, long_only=True, **_):
    T, N = P.shape
    n = min(count_of(top_fraction, N), N if long_only else (N // 2 or 1))

    def fn(t):
        ret = list(P[t] / P[t - lookback] - 1)
        w = np.zeros(N)
        w[pick(ret, n, True)] = (1 if long_only else 0.5) / n
        if not long_only:
            w[pick(ret, n)] = -0.5 / n
        return w
    return scheduled(T, N, lookback, rebalance_every, fn)


def r_trendfilter(P, sma, rebalance_every, weighting="equal", vol_lookback=63, **_):
    T, N = P.shape
    R = rets_of(P)
    start = sma - 1 if weighting == "equal" else max(sma - 1, vol_lookback)

    def fn(t):
        if weighting == "equal":
            base = np.ones(N) / N
        else:
            sd = R[t - vol_lookback + 1:t + 1].std(axis=0, ddof=1)
            iv = np.where(sd > 0, 1 / np.where(sd > 0, sd, 1), 0)
            base = iv / iv.sum()
        avg = P[t - sma + 1:t + 1].mean(axis=0)
        return np.where(P[t] > avg, base, 0.0)
    return scheduled(T, N, start, rebalance_every, fn)


def r_nearhigh(P, window, top_fraction, rebalance_every, **_):
    T, N = P.shape
    n = count_of(top_fraction, N)

    def fn(t):
        score = P[t] / P[t - window + 1:t + 1].max(axis=0)
        w = np.zeros(N)
        w[pick(list(score), n)] = 1 / n
        return w
    return scheduled(T, N, window - 1, rebalance_every, fn)


def r_pairs(PP, window, entry_z, exit_z, **_):
    ly, lx = np.log(PP[:, 0]), np.log(PP[:, 1])
    pos, out = 0, []
    for t in range(len(PP)):
        if t < window - 1:
            out.append([0.0, 0.0]); continue
        X = np.column_stack([np.ones(window), lx[t - window + 1:t + 1]])
        a_, b_ = np.linalg.lstsq(X, ly[t - window + 1:t + 1], rcond=None)[0]
        spread = ly[t - window + 1:t + 1] - a_ - b_ * lx[t - window + 1:t + 1]
        sd = spread.std(ddof=1)
        z = 0.0 if sd == 0 else spread[-1] / sd
        if pos == 1 and z >= -exit_z:
            pos = 0
        elif pos == -1 and z <= exit_z:
            pos = 0
        if pos == 0:
            if z < -entry_z:
                pos = 1
            elif z > entry_z:
                pos = -1
        g = 1 + abs(b_)
        out.append([pos / g, -pos * b_ / g])
    return out


RECIPES = {
    "ma_crossover": r_ma, "time_series_momentum": r_tsmom, "trend_ensemble": r_ensemble, "breakout": r_breakout,
    "macd_trend": r_macd, "zscore_reversion": r_zscore, "rsi_reversion": r_rsi, "volatility_target": r_voltarget,
    "cross_sectional_momentum": r_xsmom, "dual_momentum": r_dual, "risk_parity_rebalance": r_riskparity,
    "equal_weight_rebalance": r_equal, "min_variance_rebalance": r_minvar, "low_volatility": r_lowvol,
    "short_term_reversal": r_reversal, "trend_filter_allocation": r_trendfilter, "high_proximity": r_nearhigh,
    "pairs_trading": r_pairs,
}


def run_sleeve(s, P, asset=0, pair=(0, 1), cost_bps=5):
    if s["data"] == "single":
        cols = [asset]
    elif s["data"] == "pair":
        cols = list(pair)
    else:
        cols = list(range(P.shape[1]))
    sub = P[:, cols]
    arg = sub[:, 0] if s["data"] == "single" else sub
    W = RECIPES[s["recipe"]](arg, **s["params"])
    net, gross, tos, final = engine(sub, W, cost_bps=cost_bps)
    target = W[-1] if W[-1] is not None else final
    return net, gross, tos, cols, np.asarray(target, float)


# ---------------------------------------------------------------------------------------------
# Data: a null universe and one with planted structure (a trending asset and a cointegrated pair)
# ---------------------------------------------------------------------------------------------
rng = np.random.default_rng(404)
T, N = 1000, 5
common = rng.normal(0, 0.006, (T, 1))
R0 = common + rng.normal(0.0002, 0.009, (T, N))
drift = np.repeat(rng.choice([-1, 1], T // 125) * 0.0025, 125)
R0[:, 0] += drift
x = np.cumsum(R0[:, 2])
ou = np.zeros(T)
for t in range(1, T):
    ou[t] = 0.9 * ou[t - 1] + rng.normal(0, 0.006)
LP = np.cumsum(R0, axis=0)
LP[:, 1] = 0.1 + 0.9 * x + ou
PM = (100 * np.exp(LP)).round(4)
PL = PM.tolist()


# Every new recipe and a sleeve from every family, run alone.
def recipe_case(tool, args, W, P):
    net, *_ = engine(P, W)
    add(tool, {"prices": P.tolist() if P.shape[1] > 1 else P[:, 0].tolist(), **args}, {k: v for k, v in summary(net).items() if k in ("cagr", "sharpe", "max_drawdown", "total_return")})


p0 = PM[:, :1]
recipe_case("backtest_trend_ensemble", {}, r_ensemble(PM[:, 0], [21, 63, 126, 252]), p0)
recipe_case("backtest_trend_ensemble", {"lookbacks": [10, 50, 200], "vol_target": 0.12, "long_only": False}, r_ensemble(PM[:, 0], [10, 50, 200], 0.12, False), p0)
recipe_case("backtest_macd_trend", {}, r_macd(PM[:, 0], 12, 26, 9), p0)
recipe_case("backtest_macd_trend", {"fast": 5, "slow": 35, "signal": 5, "long_only": False}, r_macd(PM[:, 0], 5, 35, 5, False), p0)
recipe_case("backtest_equal_weight_rebalance", {"rebalance_every": 63}, r_equal(PM, 63), PM)
recipe_case("backtest_min_variance_rebalance", {"lookback": 126, "rebalance_every": 21}, r_minvar(PM, 126, 21), PM)
recipe_case("backtest_low_volatility", {"lookback": 63, "top_fraction": 0.4}, r_lowvol(PM, 63, 0.4, 21), PM)
recipe_case("backtest_short_term_reversal", {"lookback": 5, "top_fraction": 0.4, "rebalance_every": 5, "long_only": False}, r_reversal(PM, 5, 0.4, 5, False), PM)
recipe_case("backtest_trend_filter_allocation", {"sma": 150, "weighting": "inverse_vol"}, r_trendfilter(PM, 150, 21, "inverse_vol"), PM)
recipe_case("backtest_trend_filter_allocation", {"sma": 100, "rebalance_every": 5}, r_trendfilter(PM, 100, 5), PM)
recipe_case("backtest_high_proximity", {"window": 126, "top_fraction": 0.5}, r_nearhigh(PM, 126, 0.5, 21), PM)
recipe_case("backtest_cross_sectional_momentum", {"lookback": 126, "skip": 21, "top_fraction": 0.5, "rebalance_every": 21}, r_xsmom(PM, 126, 21, 0.5, 21), PM)

symbols = ["AAA", "BBB", "CCC", "DDD", "EEE"]
for fam in sorted({s["family"] for s in CATALOG}):
    s = next(c for c in CATALOG if c["family"] == fam and c["warmup"] < 300)
    net, gross, tos, cols, target = run_sleeve(s, PM, asset=0, pair=(1, 2))
    st = summary(net[s["warmup"]:])
    tw = {}
    for c, w in zip(cols, target):
        tw[symbols[c]] = tw.get(symbols[c], 0) + float(w)
    tw = {k: (0.0 if abs(v) < 1e-12 else v) for k, v in tw.items()}
    add("run_sleeve", {"id": s["id"], "prices": PL, "pair": [1, 2], "symbols": symbols},
        {"spec_sha256": s["spec_sha256"], "full_period": {k: v for k, v in summary(net).items() if k != "volatility"}, "after_warmup": {"sharpe": st["sharpe"], "cagr": st["cagr"], "max_drawdown": st["max_drawdown"]},
         "annual_turnover": tos.mean() * 252, "cost_drag_annual": (gross.mean() - net.mean()) * 252, "target_weights": tw})


# ---------------------------------------------------------------------------------------------
# Tournament machinery
# ---------------------------------------------------------------------------------------------
M32 = 0xFFFFFFFF


def mulberry32(seed):
    a = seed & M32

    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return rnd


_r = mulberry32(42)
assert [_r(), _r(), _r()] == [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]


def stationary_indices(n, block, rnd):
    p, idx, out = 1 / block, 0, np.empty(n, dtype=np.int64)
    for t in range(n):
        u = rnd()
        if t == 0 or u < p:
            idx = math.floor(rnd() * n)
        else:
            idx = (idx + 1) % n
        out[t] = idx
    return out


def unfit(s, n_cols, T_, min_eval):
    if s["data"] != "single" and n_cols < 2:
        return True
    if s["recipe"] == "min_variance_rebalance" and s["params"]["lookback"] <= n_cols:
        return True
    return s["warmup"] > T_ - 1 - min_eval


def per_sharpe(x):
    sd = x.std(ddof=1)
    return x.mean() / sd if sd > 0 else 0.0


def dsr(ret, trials, sv):
    sr = per_sharpe(ret)
    g3, g4 = stats.skew(ret), stats.kurtosis(ret, fisher=False)
    eg = 0.5772156649015329
    star = math.sqrt(sv) * ((1 - eg) * stats.norm.ppf(1 - 1 / trials) + eg * stats.norm.ppf(1 - 1 / (trials * math.e))) if trials > 1 else 0
    return star, stats.norm.cdf((sr - star) * math.sqrt(len(ret) - 1) / math.sqrt(1 - g3 * sr + (g4 - 1) / 4 * sr * sr))


def eff_trials(R):
    C = np.corrcoef(R)
    return R.shape[0] ** 2 / (C ** 2).sum()


def joint_tests(R, B, reps, block, seed):
    """Reality Check from arch (unstudentized, 'upper' recentring) on the shared draws, and an
    independent numpy re-studentized SPA (lower/consistent/upper) and StepM on the same draws."""
    D = R - B[None, :]
    n = D.shape[1]
    keep = [k for k in range(D.shape[0]) if D[k].std(ddof=1) > 0]
    D = D[keep]
    rnd = mulberry32(seed)
    draws = [stationary_indices(n, block, rnd) for _ in range(reps)]
    it = iter(draws)
    rc = SPA(np.zeros(n), -D.T, block_size=block, reps=reps)
    rc.bootstrap.update_indices = lambda: next(it)
    rc.compute()
    m, sd = D.mean(axis=1), D.std(axis=1, ddof=1)
    t_obs = math.sqrt(n) * m / sd
    thr = -sd * math.sqrt(2 * math.log(math.log(n)) / n)
    centers = [np.maximum(m, 0), np.where(m >= thr, m, 0), m]
    spa_max = np.zeros((3, reps))
    tstar = np.empty((len(keep), reps))
    for r, idx in enumerate(draws):
        X = D[:, idx]
        mb, sb = X.mean(axis=1), X.std(axis=1, ddof=1)
        for j in range(3):
            v = np.where(sb > 0, math.sqrt(n) * (mb - centers[j]) / np.where(sb > 0, sb, 1), 0.0)
            spa_max[j, r] = max(0.0, v.max())
        tstar[:, r] = np.where(sb > 0, math.sqrt(n) * (mb - m) / np.where(sb > 0, sb, 1), -np.inf)
    obs = max(0.0, t_obs.max())
    pv = {name: float((spa_max[j] >= obs).mean()) for j, name in enumerate(("lower", "consistent", "upper"))}
    superior, active = [], list(range(len(keep)))
    while active:
        crit = np.quantile(tstar[active].max(axis=0), 0.95)
        better = [k for k in active if t_obs[k] > crit]
        if not better:
            break
        superior += better
        active = [k for k in active if k not in better]
    return len(keep), obs, pv, float(rc.pvalues["upper"]), sorted(keep[k] for k in superior)


def pbo(R, S):
    K, n = R.shape
    m = n // S
    off = n - S * m
    chunks = [R[:, off + c * m: off + (c + 1) * m] for c in range(S)]

    def sharpe(cs):
        X = np.concatenate([chunks[c] for c in cs], axis=1)
        sd = X.std(axis=1, ddof=1)
        return np.where(sd > 0, X.mean(axis=1) / np.where(sd > 0, sd, 1), 0.0)
    logits, isb, oosb = [], [], []
    for IS in itertools.combinations(range(S), S // 2):
        OOS = [c for c in range(S) if c not in IS]
        si = sharpe(IS)
        best = int(np.argmax(si))
        so = sharpe(OOS)
        mine = so[best]
        less = (so < mine).sum()
        eq = (so == mine).sum() - 1
        w = (1 + less + 0.5 * eq) / (K + 1)
        logits.append(math.log(w / (1 - w)))
        isb.append(si[best])
        oosb.append(mine)
    logits, isb, oosb = map(np.array, (logits, isb, oosb))
    slope = np.cov(isb, oosb, ddof=0)[0, 1] / isb.var()
    return {"probability": (logits <= 0).mean(), "splits": S, "combinations": len(logits), "median_logit": float(np.median(logits)), "probability_oos_loss": (oosb < 0).mean(), "degradation_slope": slope}


def run_universe(P, sleeves, min_eval=252):
    chosen = [s for s in sleeves if not unfit(s, P.shape[1], P.shape[0], min_eval)]
    W0 = max(s["warmup"] for s in chosen)
    runs = [run_sleeve(s, P) for s in chosen]
    R = np.array([r[0][W0:] for r in runs])
    bh, *_ = engine(P, [list(np.ones(P.shape[1]) / P.shape[1])] + [None] * (len(P) - 1), cost_bps=0)
    return chosen, W0, runs, R, bh[W0:]


def tournament_case(P, args, reps, seed, S, top=10):
    sleeves = CATALOG if "families" not in args else [s for s in CATALOG if s["family"] in args["families"]]
    chosen, W0, runs, R, B = run_universe(P, sleeves)
    K, n = R.shape
    sh = [summary(r)["sharpe"] or 0.0 for r in R]
    order = sorted(range(K), key=lambda k: (-sh[k], k))
    best = order[0]
    keff = eff_trials(R[[k for k in range(K) if R[k].std() > 0]])
    sv = np.var([per_sharpe(r) for r in R], ddof=1)
    star, d = dsr(R[best], K, sv)
    star_e, d_e = dsr(R[best], keff, sv)
    block = max(1, jsround(n ** (1 / 3)))
    tested, stat, pv, rcp, sup = joint_tests(R, B, reps, block, seed)
    lb = []
    for k in order[:top]:
        s = summary(R[k])
        lb.append([chosen[k]["id"], chosen[k]["family"], s["sharpe"], s["cagr"], s["max_drawdown"], runs[k][2][W0:].mean() * 252])
    bs = summary(B)
    add("sleeve_tournament", {"prices": P.tolist(), **args, "reps": reps, "seed": seed, "splits": S, "top": top},
        {"evaluation": {"from_period": W0, "periods": n}, "sleeves_run": K, "benchmark": {"cagr": bs["cagr"], "sharpe": bs["sharpe"], "max_drawdown": bs["max_drawdown"]}, "leaderboard": lb,
         "multiple_testing": {"trials": K, "effective_trials": keff,
                              "best": {"id": chosen[best]["id"], "sharpe": sh[best], "deflated_sharpe_probability": d, "deflated_sharpe_probability_effective": d_e, "expected_max_sharpe_under_null": star * math.sqrt(252), "expected_max_sharpe_under_null_effective": star_e * math.sqrt(252)},
                              "reality_check": {"p_value": rcp}, "spa": {"sleeves_tested": tested, "statistic": stat, "p_values": pv, "block": block},
                              "stepm": {"superior": [chosen[k]["id"] for k in sup]},
                              "pbo": pbo(R, S)}}, tol=1e-8)
    return chosen, W0, runs, R, B


chosen, W0, runs, R, B = tournament_case(PM, {}, reps=500, seed=11, S=10)
tournament_case(PM[:, :1], {"families": ["time_series_momentum", "ma_crossover", "volatility_target"]}, reps=300, seed=3, S=8)

# Walk-forward selection of the top sleeves by trailing Sharpe.
train, refit, k_top = 126, 42, 4
fam = ["time_series_momentum", "risk_parity", "short_term_reversal", "pairs"]
ch, W1, rr, RW, BW = run_universe(PM, [s for s in CATALOG if s["family"] in fam], min_eval=train + refit)
oos, allv, bench, iss, ooss = [], [], [], [], []
n = RW.shape[1]
for s0 in range(train, n, refit):
    scores = sorted(((per_sharpe(RW[k, s0 - train:s0]), k) for k in range(len(ch))), key=lambda x: (-x[0], x[1]))[:k_top]
    seg = []
    for t in range(s0, min(n, s0 + refit)):
        v = np.mean([RW[k, t] for _, k in scores])
        oos.append(v); seg.append(v); allv.append(RW[:, t].mean()); bench.append(BW[t])
    iss.append(np.mean([v for v, _ in scores]) * math.sqrt(252))
    if len(seg) > 1:
        ooss.append(per_sharpe(np.array(seg)) * math.sqrt(252))
rows = [[label] + [summary(np.array(x))[f] for f in ("cagr", "sharpe", "volatility", "max_drawdown")] for label, x in (("selected top sleeves", oos), ("all sleeves equally", allv), ("benchmark", bench))]
add("sleeve_walk_forward", {"prices": PL, "families": fam, "train": train, "refit": refit, "top_k": k_top},
    {"sleeves": len(ch), "out_of_sample_periods": len(oos), "rows": rows, "selection_decay": {"mean_in_sample_sharpe_of_picks": np.mean(iss), "mean_out_of_sample_sharpe_of_picks": np.mean(ooss)}})

# Combining sleeves with trailing inverse-volatility weights.
ids = ["tsmom-126-vt10-long", "riskparity-63-r21", "reversal-5-top20-r5-long", "pairs-60-z20-x5"]
cs = [BY_ID[i] for i in ids]
W2 = max(s["warmup"] for s in cs)
cr = [run_sleeve(s, PM, pair=(1, 2)) for s in cs]
RC = np.array([r[0][W2:] for r in cr])
vl, kk = 63, 21
w = np.ones(len(ids)) / len(ids)
book = []
for t in range(vl, RC.shape[1]):
    if (t - vl) % kk == 0:
        inv = np.array([1 / RC[j, t - vl:t].std(ddof=1) if RC[j, t - vl:t].std(ddof=1) > 0 else 0 for j in range(len(ids))])
        w = inv / inv.sum()
    book.append(w @ RC[:, t])
book = np.array(book)
seg = RC[:, vl:]
vols = seg.std(axis=1, ddof=1)
target = {}
for j, (net, gross, tos, cols, tg) in enumerate(cr):
    for c, x in zip(cols, tg):
        target[symbols[c]] = target.get(symbols[c], 0) + w[j] * (0.0 if abs(x) < 1e-12 else x)
sb = summary(book)
add("combine_sleeves", {"ids": ids, "prices": PL, "pair": [1, 2], "weighting": "inverse_vol", "symbols": symbols},
    {"book": {"cagr": sb["cagr"], "sharpe": sb["sharpe"], "max_drawdown": sb["max_drawdown"], "diversification_ratio": (w * vols).sum() / book.std(ddof=1)},
     "rows": [[i, w[j], summary(seg[j])["cagr"], summary(seg[j])["sharpe"], summary(seg[j])["max_drawdown"]] for j, i in enumerate(ids)],
     "correlation": np.corrcoef(seg).tolist(), "target_weights": target})

# Clusters by average linkage on sqrt((1 - rho) / 2), cut at 0.5.
live = [k for k in range(R.shape[0]) if R[k].std() > 0]
RL = R[live]
Cm = np.corrcoef(RL)
D = np.sqrt(np.clip((1 - Cm) / 2, 0, None))
np.fill_diagonal(D, 0)
labels = fcluster(linkage(squareform(D, checks=False), "average"), t=0.5, criterion="distance")
groups = sorted(([i for i in range(len(live)) if labels[i] == g] for g in set(labels)), key=lambda g: (-len(g), g[0]))
shl = [summary(RL[i])["sharpe"] for i in range(len(live))]
crow = []
for g in groups:
    b = g[0]
    for q in g:
        if shl[q] > shl[b]:
            b = q
    crow.append([len(g), chosen[live[b]]["id"], shl[b]])
add("sleeve_clusters", {"prices": PL}, {"sleeves": len(live), "clusters": len(groups), "effective_trials": len(live) ** 2 / (Cm ** 2).sum(), "rows": crow})

# Regimes of the equal-weight buy-and-hold benchmark.
bh_full, *_ = engine(PM, [list(np.ones(N) / N)] + [None] * (T - 1), cost_bps=0)
level = np.r_[1.0, np.cumprod(1 + bh_full)]
n = R.shape[1]
vol, up = [], []
for j in range(n):
    i = j + W0
    vol.append(bh_full[i - 63:i].std(ddof=1) if i >= 63 else None)
    up.append(bool(level[i] > level[i - 199:i + 1].mean()) if i >= 199 else None)
vv = np.array([v for v in vol if v is not None])
c1, c2 = np.quantile(vv, 1 / 3), np.quantile(vv, 2 / 3)
reg = {
    "calm": [v is not None and v <= c1 for v in vol], "normal": [v is not None and c1 < v <= c2 for v in vol], "turbulent": [v is not None and v > c2 for v in vol],
    "uptrend": [u is True for u in up], "downtrend": [u is False for u in up],
}
score = []
for k in range(R.shape[0]):
    row = []
    for nm, mask in reg.items():
        x = R[k][np.array(mask)]
        row.append(x.mean() / x.std(ddof=1) * math.sqrt(252) if len(x) > 2 and x.std(ddof=1) > 0 else None)
    score.append(row)
table = {}
for j, nm in enumerate(reg):
    order = sorted(((score[k][j], k) for k in range(R.shape[0]) if score[k][j] is not None), key=lambda x: (-x[0], x[1]))
    table[nm] = {"periods": int(sum(reg[nm])), "median_sharpe": float(np.median([v for v, _ in order])), "top": [[chosen[k]["id"], v] for v, k in order[:5]]}
robust = sorted(((chosen[k]["id"], min(v if v is not None else -math.inf for v in score[k])) for k in range(R.shape[0])), key=lambda x: -x[1])
robust = [r for r in robust if r[1] > 0]
add("sleeve_regime_map", {"prices": PL}, {"sleeves": R.shape[0], "evaluation_periods": n, "regimes": table, "positive_in_every_regime": {"count": len(robust), "top": robust[:5]}})

print(json.dumps({"generated_by": "scripts/reference/sleeves.py", "cases": cases}, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o)))
