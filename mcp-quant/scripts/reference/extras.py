"""Reference values for the risk and returns toolsets and the later additions to portfolio, tvm and
rates: numpy/pandas/scipy re-derivations, numpy-financial for the loan APR, scipy SLSQP for the
long-only optimizers. Regenerate with:

    uv run --with numpy --with pandas --with scipy --with numpy-financial python scripts/reference/extras.py > test/fixtures/extras.json
"""

import json
import math

import numpy as np
import numpy_financial as npf
import pandas as pd
from scipy import stats
from scipy.optimize import minimize

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


rng = np.random.default_rng(31)
T, N = 750, 4
R = (rng.multivariate_normal([0.0003, 0.0002, 0.0001, 0.0004], np.array([[1, .5, .2, .6], [.5, 1, .3, .4], [.2, .3, 1, .1], [.6, .4, .1, 1]]) * 1e-4, T)).round(8)
w = np.array([400000.0, 250000.0, -150000.0, 300000.0])
pnl = R @ w
cut = np.quantile(pnl, 0.01)
tail = R[pnl <= cut]
C = np.cov(R.T, ddof=1)
mu = R.mean(0)
sd = math.sqrt(w @ C @ w)
z = stats.norm.ppf(0.99)
add("portfolio_var", {"positions": w.tolist(), "returns": R.tolist(), "horizon": 10}, {
    "historical_var": -cut * math.sqrt(10), "historical_es": -pnl[pnl <= cut].mean() * math.sqrt(10),
    "parametric_var": (z * sd - w @ mu) * math.sqrt(10), "parametric_es": (sd * stats.norm.pdf(z) / 0.01 - w @ mu) * math.sqrt(10),
    "es_contribution": {f"position_{i + 1}": -(tail[:, i] * w[i]).mean() * math.sqrt(10) for i in range(N)},
})

betas = [1.2, 0.8, 1.0, 1.5]
rows = []
for name, shocks in [("crash", [b * -0.2 for b in betas]), ("custom", [-0.1, 0.05, 0.3, -0.2])]:
    p = w * np.array(shocks)
    rows.append([name, float(p.sum()), float(p.sum() / np.abs(w).sum() * 100), f"position_{int(np.argmin(p)) + 1}", float(p.min())])
add("stress_test", {"positions": w.tolist(), "betas": betas, "scenarios": [{"name": "crash", "market_shock": -0.2}, {"name": "custom", "shocks": [-0.1, 0.05, 0.3, -0.2]}]}, {"rows": rows})


def bs(typ, s, k, t, r, q, v):
    d1 = (math.log(s / k) + (r - q + v * v / 2) * t) / (v * math.sqrt(t))
    d2 = d1 - v * math.sqrt(t)
    if typ == "call":
        return s * math.exp(-q * t) * stats.norm.cdf(d1) - k * math.exp(-r * t) * stats.norm.cdf(d2)
    return k * math.exp(-r * t) * stats.norm.cdf(-d2) - s * math.exp(-q * t) * stats.norm.cdf(-d1)


legs = [{"type": "call", "quantity": 100, "strike": 105, "years": 0.25, "volatility": 0.22}, {"type": "put", "quantity": -50, "strike": 95, "years": 0.5, "volatility": 0.27}, {"type": "stock", "quantity": -30}]


def book(s, dv, dt):
    tot = 0.0
    for l in legs:
        if l["type"] == "stock":
            tot += l["quantity"] * s
        else:
            tot += l["quantity"] * bs(l["type"], s, l["strike"], l["years"] - dt, 0.03, 0.0, l["volatility"] + dv)
    return tot


base = book(100, 0, 0)
moves, shifts = [-0.1, 0, 0.1], [-0.05, 0, 0.05]
add("option_scenario_grid", {"spot": 100, "rate": 0.03, "legs": legs, "spot_moves": moves, "vol_shifts": shifts, "days_forward": 7}, {"value": base, "pnl": [[book(100 * (1 + m), dv, 7 / 365) - base for dv in shifts] for m in moves]})

add("exposure_and_hedge", {"positions": w.tolist(), "betas": betas, "hedge_price": 5000, "hedge_multiplier": 50}, {"gross": float(np.abs(w).sum()), "net": float(w.sum()), "beta_adjusted_net": float(w @ np.array(betas)), "hedge_units": float(-(w @ np.array(betas)) / (5000 * 50))})
wt = np.array([0.3, 0.2, 0.15, 0.1, 0.1, 0.05, 0.05, 0.05])
srt = np.sort(wt)
n = len(wt)
gini = (2 * np.sum((np.arange(1, n + 1)) * srt)) / (n * srt.sum()) - (n + 1) / n
add("concentration_metrics", {"weights": wt.tolist(), "top_k": 3}, {"herfindahl": float((wt**2).sum()), "effective_positions": float(1 / (wt**2).sum()), "top_k_share": 0.65, "gini": gini})
sh, px, adv = [100000, -50000, 20000], [50, 20, 300], [400000, 1000000, 20000]
days = [abs(s) / (0.2 * a) for s, a in zip(sh, adv)]
val = [abs(s) * p for s, p in zip(sh, px)]
add("liquidation_horizon", {"shares": sh, "prices": px, "adv": adv}, {"max_days": max(days), "liquid_within_1_day": sum(v * min(1, 1 / d) for v, d in zip(val, days)) / sum(val), "liquid_within_5_days": sum(v * min(1, 5 / d) for v, d in zip(val, days)) / sum(val)})

# returns
pr = (100 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, 400)))).round(6)
simple = pr[1:] / pr[:-1] - 1
add("convert_returns", {"values": pr.tolist(), "from": "prices", "to": "log"}, {"values": np.log(pr[1:] / pr[:-1]).tolist()})
add("convert_returns", {"values": simple.tolist(), "from": "simple", "to": "prices", "start_value": pr[0]}, {"values": pr.tolist()}, tol=1e-8)
dates = pd.bdate_range("2023-01-02", periods=400)
ser = pd.Series(simple[:399].tolist() + [0.001], index=dates)
rets = ser.tolist()
ds = [d.strftime("%Y-%m-%d") for d in dates]
mon = (1 + ser).groupby([dates.year, dates.month]).prod() - 1
add("resample_returns", {"returns": rets, "dates": ds, "to": "month"}, {"rows": [[f"{y}-{m:02d}", v] for (y, m), v in mon.items()]})
iso = dates.isocalendar()
wk = (1 + ser).groupby([iso.year.values, iso.week.values]).prod() - 1
add("resample_returns", {"returns": rets, "dates": ds, "to": "week"}, {"rows": [[f"{y}-W{wk_:02d}", v] for (y, wk_), v in wk.items()]})
yr = (1 + ser).groupby(dates.year).prod() - 1
add("monthly_returns_table", {"returns": rets, "dates": ds}, {"rows": [[y] + [mon.get((y, m)) for m in range(1, 13)] + [yr[y]] for y in sorted(set(dates.year))], "best_month": mon.max(), "worst_month": mon.min()})
wp, wb = [0.4, 0.3, 0.3], [0.5, 0.3, 0.2]
rp, rb = [0.08, 0.02, -0.01], [0.06, 0.03, 0.01]
Rb = sum(a * b for a, b in zip(wb, rb))
add("brinson_attribution", {"segments": ["tech", "health", "energy"], "portfolio_weights": wp, "benchmark_weights": wb, "portfolio_returns": rp, "benchmark_returns": rb}, {
    "allocation": sum((wp[i] - wb[i]) * (rb[i] - Rb) for i in range(3)), "selection": sum(wb[i] * (rp[i] - rb[i]) for i in range(3)), "interaction": sum((wp[i] - wb[i]) * (rp[i] - rb[i]) for i in range(3)),
    "active_return": sum(a * b for a, b in zip(wp, rp)) - Rb})

# portfolio additions
Ca = np.cov(R.T, ddof=1) * 252
sds = np.sqrt(np.diag(Ca))
res = minimize(lambda x: -(x @ sds) / math.sqrt(x @ Ca @ x), np.ones(N) / N, method="SLSQP", bounds=[(0, None)] * N, constraints=[{"type": "eq", "fun": lambda x: x.sum() - 1}], options={"ftol": 1e-16, "maxiter": 1000})
add("max_diversification_portfolio", {"returns": R.tolist()}, {"diversification_ratio": -res.fun}, tol=1e-8)
bw = np.array([0.4, 0.3, 0.2, 0.1])
res = minimize(lambda x: (x - bw) @ Ca @ (x - bw), np.array([1 / 3, 1 / 3, 0, 1 / 3]), method="SLSQP", bounds=[(0, None), (0, None), (0, 0), (0, None)], constraints=[{"type": "eq", "fun": lambda x: x.sum() - 1}], options={"ftol": 1e-18, "maxiter": 1000})
add("index_tracking_portfolio", {"returns": R.tolist(), "benchmark_weights": bw.tolist(), "allowed": [True, True, False, True]}, {"tracking_error": math.sqrt(res.fun)}, tol=1e-6)

# tvm additions
P_, ar, yrs, fee = 300000, 0.065, 30, 6000
pay = -npf.pmt(ar / 12, 360, P_)
per = npf.rate(360, -pay, P_ - fee, 0, tol=1e-14, maxiter=1000)
add("loan_true_cost", {"principal": P_, "annual_rate": ar, "years": yrs, "upfront_fees": fee}, {"payment": pay, "apr": per * 12, "effective_annual_rate": (1 + per) ** 12 - 1}, tol=1e-8)
b = 50000.0
for t in range(25):
    b = b * 1.06 + 12000 * 1.03**t
real = 1.06 / 1.025 - 1
lvl = b * real / ((1 - (1 + real) ** -30) * (1 + real))
x, lasts = b, 0
for t in range(200):
    wdr = 40000 * 1.025**25 * 1.025**t
    if x < wdr:
        break
    x = (x - wdr) * 1.06
    lasts = t + 1
add("retirement_projection", {"balance": 50000, "annual_contribution": 12000, "contribution_growth": 0.03, "years_to_retirement": 25, "return_rate": 0.06, "inflation": 0.025, "annual_withdrawal": 40000}, {"balance_at_retirement": b, "sustainable_withdrawal_nominal_first_year": lvl, "years_withdrawals_last": lasts})

# rates additions: key rate durations by repricing on a bumped, linearly interpolated zero curve.
cy, cz = [0.5, 1, 2, 3, 5, 7, 10], [0.051, 0.0495, 0.0465, 0.045, 0.0442, 0.0446, 0.0458]
# 5.5-year semiannual 4.25% bond, settlement on a coupon date, cash flows at 0.5..5.5 years (30/360 = ACT/365 only approximately, so use dates).
from datetime import date
settle = date(2026, 2, 28)
flows = []
for k in range(1, 12):
    m = 2 + 6 * k
    y, mo = 2026 + (m - 1) // 12, (m - 1) % 12 + 1
    import calendar
    d = date(y, mo, min(28 if mo != 2 else 28, calendar.monthrange(y, mo)[1]))
    flows.append(((d - settle).days / 365, 2.125 + (100 if k == 11 else 0)))


def pv(zr):
    return sum(a * math.exp(-np.interp(t, cy, zr) * t) for t, a in flows)


base = pv(cz)
rows = []
for k in range(len(cy)):
    up = pv([r + (1e-4 if j == k else 0) for j, r in enumerate(cz)])
    dn = pv([r - (1e-4 if j == k else 0) for j, r in enumerate(cz)])
    rows.append([cy[k], (dn - up) / 2])
add("key_rate_durations", {"settlement": "2026-02-28", "maturity": "2031-08-28", "coupon_rate": 0.0425, "curve": {"years": cy, "zero_rates": cz}}, {"dirty_price": base, "rows": rows}, tol=1e-8)
add("breakeven_inflation", {"nominal_yield": 0.043, "real_yield": 0.019, "expected_inflation": 0.03}, {"breakeven_exact": 1.043 / 1.019 - 1, "real_yield_at_view": 1.043 / 1.03 - 1, "favours": "inflation-linked (your view is above breakeven)"})

print(json.dumps({"generated_by": "scripts/reference/extras.py", "cases": cases}, default=float))
