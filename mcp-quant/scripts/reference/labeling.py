"""Reference values for the labeling (data annotation) toolset, following the pandas snippets in
Lopez de Prado, Advances in Financial Machine Learning: getDailyVol (pandas ewm std), getTEvents
(CUSUM filter), applyPtSlOnT1 / getBins (triple barrier and meta-labels), mpNumCoEvents /
mpSampleTW / getTimeDecay (uniqueness, attribution, decay), trend scanning with statsmodels OLS
t-values, and purged k-fold with embargo. The per-period annotator is re-implemented with pandas.

Regenerate with:

    uv run --with numpy --with pandas --with statsmodels python scripts/reference/labeling.py > test/fixtures/labeling.json
"""

import json
import math

import numpy as np
import pandas as pd
import statsmodels.api as sm

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


rng = np.random.default_rng(77)
n = 900
r = rng.standard_t(5, n) * 0.009 + 0.0002
r[350] += 0.12
p = 100 * np.exp(np.cumsum(r))
p = p.round(4)
p[500:504] = p[499]
P = pd.Series(p)
PL = p.tolist()


def daily_vol(close, span):
    ret = close / close.shift(1) - 1
    return ret.ewm(span=span).std()  # adjust=True, bias=False, as getDailyVol


vol = daily_vol(P, 100)

# CUSUM filter (getTEvents), fixed and volatility-scaled thresholds.
def cusum(close, h):
    lp = np.log(close.to_numpy())
    ev, sp, sn = [], 0.0, 0.0
    for t in range(1, len(lp)):
        th = h(t)
        if not (th > 0):
            continue
        d = lp[t] - lp[t - 1]
        sp, sn = max(0.0, sp + d), min(0.0, sn + d)
        if sn < -th:
            sn = 0.0
            ev.append([t, -1])
        elif sp > th:
            sp = 0.0
            ev.append([t, 1])
    return ev


ev_fixed = cusum(P, lambda t: 0.02)
add("cusum_filter_events", {"prices": PL, "threshold": 0.02}, {"events": len(ev_fixed), "rows": ev_fixed})
ev_vol = cusum(P, lambda t: 2 * vol.iloc[t - 1])
add("cusum_filter_events", {"prices": PL}, {"events": len(ev_vol), "rows": ev_vol})


# Triple barrier (applyPtSlOnT1 + getBins), with and without a side.
def triple(close, events, pt, sl, hold, trgt, side=None, vertical_zero=False):
    rows = []
    c = close.to_numpy()
    for t0 in events:
        tg = trgt.iloc[t0]
        if not (tg > 0) or t0 >= len(c) - 1:
            continue
        sd = 1 if side is None else side[t0]
        if side is not None and sd not in (1, -1):
            continue
        t1 = min(len(c) - 1, t0 + hold)
        path = (c[t0 + 1:t1 + 1] / c[t0] - 1) * sd
        up = np.flatnonzero(path >= pt * tg) if pt > 0 else np.array([], int)
        dn = np.flatnonzero(path <= -sl * tg) if sl > 0 else np.array([], int)
        first_up = t0 + 1 + up[0] if len(up) else math.inf
        first_dn = t0 + 1 + dn[0] if len(dn) else math.inf
        if first_up == math.inf and first_dn == math.inf:
            touch, kind = t1, "vertical"
        elif first_up < first_dn:
            touch, kind = first_up, "profit_take"
        else:
            touch, kind = first_dn, "stop_loss"
        ret = (c[touch] / c[t0] - 1) * sd
        if side is not None:
            lab = 1 if ret > 0 else 0
        else:
            lab = 0 if (kind == "vertical" and vertical_zero) else int(np.sign(ret))
        rows.append([t0, int(touch), ret, lab, kind, tg])
    return rows


tb = triple(P, [e[0] for e in ev_vol], 1, 1, 20, vol)
add("triple_barrier_labels", {"prices": PL, "events": [e[0] for e in ev_vol]}, {"labeled": len(tb), "rows": tb})
tb2 = triple(P, list(range(n)), 2, 1, 10, vol, vertical_zero=True)
add("triple_barrier_labels", {"prices": PL, "profit_take": 2, "stop_loss": 1, "max_holding": 10, "vertical_label": "zero"}, {"labeled": len(tb2), "rows": tb2})
side = np.sign(P - P.rolling(20).mean()).fillna(0).astype(int).tolist()
tb3 = triple(P, list(range(n)), 1, 2, 15, vol, side=side)
add("triple_barrier_labels", {"prices": PL, "side": side, "stop_loss": 2, "max_holding": 15}, {"labeled": len(tb3), "rows": tb3})

# Fixed horizon.
h = 5
fwd = P.shift(-h) / P - 1
thr = 0.5 * vol * math.sqrt(h)
lab = [None if (t + h >= n or not (thr.iloc[t] >= 0)) else (1 if fwd.iloc[t] > thr.iloc[t] else -1 if fwd.iloc[t] < -thr.iloc[t] else 0) for t in range(n)]
add("fixed_horizon_labels", {"prices": PL, "volatility_multiple": 0.5}, {"labels": lab})

# Trend scanning with statsmodels OLS t-values.
rows = []
pp = p[:300]
for t in range(0, len(pp) - 5 + 1):
    best = None
    for L in range(5, 21):
        if t + L > len(pp):
            break
        y = pp[t:t + L]
        tv = sm.OLS(y, sm.add_constant(np.arange(L, dtype=float))).fit().tvalues[1]
        if best is None or abs(tv) > abs(best[1]):
            best = (L, tv)
    rows.append([t, t + best[0] - 1, best[1], int(np.sign(best[1]))])
add("trend_scanning_labels", {"prices": pp.tolist()}, {"labeled": len(rows), "rows": rows}, tol=1e-8)

# Sample weights: mpNumCoEvents, mpSampleTW, getTimeDecay.
spans = [[a, b] for a, b, *_ in tb]
conc = np.zeros(n)
for a, b in spans:
    conc[a:b + 1] += 1
uniq = [np.mean(1 / conc[a:b + 1]) for a, b in spans]
lr = np.log(P).diff().to_numpy()
attr = [abs((lr[a + 1:b + 1] / conc[a + 1:b + 1]).sum()) for a, b in spans]
attr = np.array(attr) * len(spans) / np.sum(attr)
for c in (1, 0.5, -0.5):
    s_u = pd.Series(uniq, index=[b for a, b in spans]).sort_index(kind="stable").cumsum()
    order = sorted(range(len(spans)), key=lambda i: (spans[i][1], i))
    cum = np.empty(len(spans))
    acc = 0.0
    for i in order:
        acc += uniq[i]
        cum[i] = acc
    last = acc
    slope = (1 - c) / last if c >= 0 else 1 / ((c + 1) * last)
    dec = np.maximum(0, 1 - slope * last + slope * cum)
    add("sample_weights", {"prices": PL, "spans": spans, "decay": c},
        {"labels": len(spans), "mean_uniqueness": float(np.mean(uniq)), "max_concurrency": int(conc.max()), "rows": [[a, b, u, w, d] for (a, b), u, w, d in zip(spans, uniq, attr, dec)]})

# Purged k-fold with embargo.
for k, emb in ((5, None), (4, 12)):
    m = len(spans)
    span_len = max(b for a, b in spans) - spans[0][0] + 1
    e = math.floor(0.01 * span_len) if emb is None else emb
    out = []
    for f in range(k):
        lo, hi = math.floor(f * m / k), math.floor((f + 1) * m / k)
        t0, t1 = spans[lo][0], max(spans[i][1] for i in range(lo, hi))
        tr = pu = em = 0
        for i, (a, b) in enumerate(spans):
            if lo <= i < hi:
                continue
            if a <= t1 and b >= t0:
                pu += 1
            elif t1 < a <= t1 + e:
                em += 1
            else:
                tr += 1
        out.append({"fold": f, "test": hi - lo, "train": tr, "purged": pu, "embargoed": em, "test_span": [t0, t1]})
    args = {"spans": spans, "folds": k}
    if emb is not None:
        args["embargo_periods"] = emb
    add("purged_cv_splits", args, {"embargo_periods": e, "splits": out})

# Annotator.
ret = P.pct_change()
rr = ret.iloc[1:]
med = rr.median()
mad = (rr - med).abs().median() * 1.4826
z = (ret - med) / mad
events = []
for t in range(1, n):
    if abs(z.iloc[t]) > 5:
        events.append([t, "outlier_up" if z.iloc[t] > 0 else "outlier_down", ret.iloc[t]])
t = 0
while t < n:
    j = t
    while j + 1 < n and p[j + 1] == p[t]:
        j += 1
    if j - t + 1 >= 3:
        events.append([t, "stale_run", j - t + 1])
    t = j + 1
peak, peakT, trough, troughT, indd, ath, highs = p[0], 0, p[0], 0, False, p[0], 0
for t in range(1, n):
    if p[t] > ath:
        ath = p[t]
        highs += 1
    if p[t] >= peak:
        if indd and trough / peak - 1 <= -0.1:
            events.append([peakT, "drawdown", {"trough_period": troughT, "recovery_period": t, "depth": trough / peak - 1}])
        peak, peakT, trough, troughT, indd = p[t], t, p[t], t, False
    else:
        indd = True
        if p[t] < trough:
            trough, troughT = p[t], t
if indd and trough / peak - 1 <= -0.1:
    events.append([peakT, "drawdown", {"trough_period": troughT, "recovery_period": None, "depth": trough / peak - 1}])
rv = ret.rolling(63).std(ddof=1)
seen, reg = [], {}
for t in range(63, n):
    seen.append(rv.iloc[t])
    if len(seen) >= 20:
        c1, c2 = np.quantile(seen, 1 / 3), np.quantile(seen, 2 / 3)
        lab = "calm" if rv.iloc[t] <= c1 else "normal" if rv.iloc[t] <= c2 else "turbulent"
        reg[lab] = reg.get(lab, 0) + 1
events.sort(key=lambda e: e[0])
add("annotate_price_series", {"prices": PL},
    {"event_count": len(events), "events": events, "summary": {"outliers": sum(e[1].startswith("outlier") for e in events), "stale_runs": sum(e[1] == "stale_run" for e in events), "drawdown_episodes": sum(e[1] == "drawdown" for e in events), "new_highs": highs, "volatility_regimes": reg}})

print(json.dumps({"generated_by": "scripts/reference/labeling.py", "cases": cases}, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o)))
