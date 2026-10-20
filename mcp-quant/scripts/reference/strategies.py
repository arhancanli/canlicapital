"""Reference values for the strategies toolset: every recipe re-implemented here with pandas
(rolling windows, vectorized signals) and its own copy of the drift-aware costed engine.
Regenerate with:

    uv run --with numpy --with pandas --with scipy python scripts/reference/strategies.py > test/fixtures/strategies.json
"""

import json
import math

import numpy as np
import pandas as pd
from scipy import stats

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


def engine(P, W, cost_bps=5, ppy=252, rf=0.0):
    """P: (T, N) prices. W: list of target arrays or None. Returns net returns."""
    P = np.asarray(P, float)
    T, N = P.shape
    rfp = (1 + rf) ** (1 / ppy) - 1
    w = np.zeros(N)
    net = []
    for t in range(T - 1):
        to = 0.0
        if W[t] is not None:
            tgt = np.asarray(W[t], float)
            to = np.abs(tgt - w).sum()
            w = tgt.copy()
        r = P[t + 1] / P[t] - 1
        g = w @ r + (1 - w.sum()) * rfp
        net.append(g - cost_bps / 1e4 * to)
        w = w * (1 + r) / (1 + g) if 1 + g > 0 else np.zeros(N)
    return np.array(net)


def summary(net, ppy=252):
    eq = np.cumprod(1 + net)
    dd = (eq / np.maximum.accumulate(np.r_[1.0, eq])[1:] - 1).min()
    return {"cagr": eq[-1] ** (ppy / len(net)) - 1, "sharpe": net.mean() / net.std(ddof=1) * math.sqrt(ppy), "max_drawdown": min(dd, 0.0), "total_return": eq[-1] - 1}


rng = np.random.default_rng(21)
T = 900
regime = np.repeat(rng.normal(0, 0.0012, T // 100), 100)
p = (100 * np.exp(np.cumsum(regime + rng.normal(0.0002, 0.012, T)))).round(4)
s = pd.Series(p)
P1 = p[:, None]

f, sl = 20, 100
sig = np.where((s.rolling(f).mean() > s.rolling(sl).mean()), 1.0, 0.0)
sig[: sl - 1] = 0
add("backtest_ma_crossover", {"prices": p.tolist(), "fast": f, "slow": sl}, summary(engine(P1, [[v] for v in sig])))
sig2 = np.where(s.rolling(f).mean() > s.rolling(sl).mean(), 1.0, -1.0)
sig2[: sl - 1] = 0
add("backtest_ma_crossover", {"prices": p.tolist(), "fast": f, "slow": sl, "long_only": False, "cost_bps": 10}, summary(engine(P1, [[v] for v in sig2], cost_bps=10)))

L = 126
mom = np.sign(s / s.shift(L) - 1).fillna(0).to_numpy()
mom = np.maximum(mom, 0)
add("backtest_time_series_momentum", {"prices": p.tolist(), "lookback": L}, summary(engine(P1, [[v] for v in mom])))
r = s.pct_change().fillna(0)
vol = r.rolling(63).std(ddof=1) * math.sqrt(252)
momls = np.sign(s / s.shift(L) - 1).fillna(0).to_numpy()
scaled = [[0.0] if t < L or momls[t] == 0 else [momls[t] * min(2, 0.15 / vol.iloc[t])] for t in range(T)]
add("backtest_time_series_momentum", {"prices": p.tolist(), "lookback": L, "vol_target": 0.15, "long_only": False}, summary(engine(P1, scaled)))

n, m = 20, 10
pos, W = 0, []
for t in range(T):
    if t >= n:
        if p[t] > p[t - n:t].max():
            pos = 1
    if t >= m and pos == 1 and p[t] < p[t - m:t].min():
        pos = 0
    W.append([pos])
add("backtest_breakout", {"prices": p.tolist(), "entry": n, "exit": m}, summary(engine(P1, W)))

w_, ez, xz = 20, 1.5, 0.25
zs = ((s - s.rolling(w_).mean()) / s.rolling(w_).std(ddof=1)).to_numpy()
pos, W = 0, []
for t in range(T):
    if t < w_ - 1:
        W.append([0]); continue
    z = zs[t]
    if pos == 1 and z >= -xz: pos = 0
    elif pos == -1 and z <= xz: pos = 0
    if pos == 0:
        if z < -ez: pos = 1
        elif z > ez: pos = -1
    W.append([pos])
add("backtest_zscore_reversion", {"prices": p.tolist(), "window": w_, "entry_z": ez, "exit_z": xz, "long_only": False}, summary(engine(P1, W)))

# Wilder RSI via pandas ewm(alpha=1/n) seeded with the simple mean, as Wilder defines it.
def wilder_rsi(x, n):
    d = np.diff(x)
    g, l = np.maximum(d, 0), np.maximum(-d, 0)
    out = [None] * len(x)
    ag, al = g[:n].mean(), l[:n].mean()
    out[n] = 100 * ag / (ag + al) if ag + al else 50
    for i in range(n, len(d)):
        ag = (ag * (n - 1) + g[i]) / n
        al = (al * (n - 1) + l[i]) / n
        out[i + 1] = 100 * ag / (ag + al) if ag + al else 50
    return out


rs = wilder_rsi(p, 14)
pos, W = 0, []
for v in rs:
    if v is not None:
        if pos == 0 and v < 30: pos = 1
        elif pos == 1 and v > 50: pos = 0
    W.append([pos])
add("backtest_rsi_reversion", {"prices": p.tolist()}, summary(engine(P1, W)))

W = []
vt = r.rolling(63).std(ddof=1) * math.sqrt(252)
for t in range(T):
    if t < 63: W.append([0])
    elif (t - 63) % 5: W.append(None)
    else: W.append([min(2, 0.1 / vt.iloc[t])])
add("backtest_volatility_target", {"prices": p.tolist(), "rebalance_every": 5}, summary(engine(P1, W)))

N = 8
mu = rng.normal(0.0002, 0.0004, N)
R = rng.normal(0, 0.011, (T, N)) + mu + 0.4 * rng.normal(0, 0.01, (T, 1))
PM = (50 * np.exp(np.cumsum(R, axis=0))).round(4)
df = pd.DataFrame(PM)
Lx, sk, top, k = 126, 21, 2, 21
W = []
for t in range(T):
    if t < Lx:
        W.append([0.0] * N if t == 0 else None); continue
    if (t - Lx) % k:
        W.append(None); continue
    sc = df.iloc[t - sk] / df.iloc[t - Lx] - 1
    order = sorted(range(N), key=lambda i: (-sc[i], i))
    w = np.zeros(N)
    w[order[:top]] = 0.5 / top
    w[order[-top:]] = -0.5 / top
    W.append(w)
add("backtest_cross_sectional_momentum", {"prices": PM.tolist(), "lookback": Lx, "skip": sk, "top": top, "long_only": False}, summary(engine(PM, W)))

W = []
for t in range(T):
    if t < Lx:
        W.append([0.0] * N if t == 0 else None); continue
    if (t - Lx) % k:
        W.append(None); continue
    ret = df.iloc[t] / df.iloc[t - Lx] - 1
    cand = [i for i in range(N) if i != 7]
    best = max(cand, key=lambda i: (ret[i], -i))
    w = np.zeros(N)
    if ret[best] > ret[7]: w[best] = 1
    else: w[7] = 1
    W.append(w)
add("backtest_dual_momentum", {"prices": PM.tolist(), "lookback": Lx, "safe_asset": 7}, summary(engine(PM, W)))

rets = df.pct_change().fillna(0)
W = []
for t in range(T):
    if t < 63:
        W.append([0.0] * N if t == 0 else None); continue
    if (t - 63) % 21:
        W.append(None); continue
    win = rets.iloc[t - 62:t + 1]
    iv = 1 / win.std(ddof=1)
    w = (iv / iv.sum()).to_numpy()
    v = w @ win.cov().to_numpy() @ w
    W.append(w * min(2, 0.08 / math.sqrt(v * 252)))
add("backtest_risk_parity_rebalance", {"prices": PM.tolist(), "target_volatility": 0.08}, summary(engine(PM, W)))

xp = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, T)))
ou = np.zeros(T)
for t in range(1, T):
    ou[t] = 0.95 * ou[t - 1] + rng.normal(0, 0.01)
yp = (np.exp(0.2 + 0.8 * np.log(xp) + ou)).round(4)
xp = xp.round(4)
ly, lx = np.log(yp), np.log(xp)
pos, W = 0, []
win = 60
for t in range(T):
    if t < win - 1:
        W.append([0, 0]); continue
    X = np.column_stack([np.ones(win), lx[t - win + 1:t + 1]])
    a_, b_ = np.linalg.lstsq(X, ly[t - win + 1:t + 1], rcond=None)[0]
    spread = ly[t - win + 1:t + 1] - a_ - b_ * lx[t - win + 1:t + 1]
    z = spread[-1] / spread.std(ddof=1)
    if pos == 1 and z >= -0.5: pos = 0
    elif pos == -1 and z <= 0.5: pos = 0
    if pos == 0:
        if z < -2: pos = 1
        elif z > 2: pos = -1
    g = 1 + abs(b_)
    W.append([pos / g, -pos * b_ / g])
PP = np.column_stack([yp, xp])
add("backtest_pairs_trading", {"prices": PP.tolist()}, summary(engine(PP, W)), tol=1e-8)

Wc = [None] * T
for t in range(0, T, 63):
    Wc[t] = (np.ones(N) / N).tolist()
add("backtest_weights", {"prices": PM.tolist(), "weights": Wc, "cost_bps": 2}, summary(engine(PM, Wc, cost_bps=2)))

# Sweep: MA grid, Sharpe of each variant, deflated Sharpe of the best.
grid = [(fa, sb) for fa in (10, 20, 50) for sb in (100, 150, 200)]
res = []
for fa, sb in grid:
    sg = np.where(s.rolling(fa).mean() > s.rolling(sb).mean(), 1.0, 0.0)
    sg[: sb - 1] = 0
    net = engine(P1, [[v] for v in sg])
    res.append((summary(net)["sharpe"], fa, sb, net))
res.sort(key=lambda x: -x[0])
best = res[0][3]
srs = np.array([x[0] for x in res])
sr = best.mean() / best.std(ddof=1)
g3, g4 = stats.skew(best), stats.kurtosis(best, fisher=False)
v = srs.var(ddof=1) / 252
eg = 0.5772156649015329
star = math.sqrt(v) * ((1 - eg) * stats.norm.ppf(1 - 1 / 9) + eg * stats.norm.ppf(1 - 1 / (9 * math.e)))
dsr = stats.norm.cdf((sr - star) * math.sqrt(len(best) - 1) / math.sqrt(1 - g3 * sr + (g4 - 1) / 4 * sr * sr))
add("strategy_sweep", {"recipe": "ma_crossover", "arguments": {"prices": p.tolist()}, "grid": {"fast": [10, 20, 50], "slow": [100, 150, 200]}}, {"best": {"params": {"fast": res[0][1], "slow": res[0][2]}, "sharpe": res[0][0]}, "deflation": {"trials": 9, "deflated_sharpe_probability": dsr}}, tol=1e-8)

print(json.dumps({"generated_by": "scripts/reference/strategies.py", "cases": cases}, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o)))
