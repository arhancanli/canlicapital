"""Reference values for the rates toolset, computed independently of the server.

QuantLib prices the bonds and short-rate models; numpy and scipy compute the rest from textbook
formulas. Regenerate with:

    uv run --with QuantLib --with numpy --with scipy python scripts/reference/rates.py > test/fixtures/rates.json
"""

import json
import math

import numpy as np
import QuantLib as ql
from scipy.optimize import brentq

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


def qdate(s):
    y, m, d = map(int, s.split("-"))
    return ql.Date(d, m, y)


DC = {
    "30/360": lambda s: ql.Thirty360(ql.Thirty360.BondBasis),
    "ACT/360": lambda s: ql.Actual360(),
    "ACT/365F": lambda s: ql.Actual365Fixed(),
    "ACT/ACT": lambda s: ql.ActualActual(ql.ActualActual.ISMA, s),
}


def ql_bond(settle, maturity, coupon, freq, dc_name):
    s, m = qdate(settle), qdate(maturity)
    ql.Settings.instance().evaluationDate = s
    sched = ql.Schedule(s - ql.Period(3, ql.Years), m, ql.Period(12 // freq, ql.Months), ql.NullCalendar(), ql.Unadjusted, ql.Unadjusted, ql.DateGeneration.Backward, False)
    dc = DC[dc_name](sched)
    return ql.FixedRateBond(0, 100.0, sched, [coupon], dc), dc, s


BONDS = [
    ("2026-03-15", "2031-08-31", 0.0425, 2, "30/360", 0.0461),
    ("2026-01-10", "2036-01-10", 0.05, 2, "ACT/ACT", 0.0399),
    ("2026-05-20", "2029-11-15", 0.03, 4, "ACT/360", 0.035),
    ("2026-07-01", "2045-02-28", 0.0675, 1, "ACT/365F", 0.071),
    ("2026-02-27", "2027-02-28", 0.0, 2, "30/360", 0.04),
    ("2026-06-30", "2056-06-30", 0.02, 12, "ACT/ACT", -0.002),
]
for settle, mat, c, f, dcn, y in BONDS:
    bond, dc, s = ql_bond(settle, mat, c, f, dcn)
    rate = ql.InterestRate(y, dc, ql.Compounded, f)
    clean = ql.BondFunctions.cleanPrice(bond, rate, s)
    dirty = clean + bond.accruedAmount(s)
    mod = ql.BondFunctions.duration(bond, rate, ql.Duration.Modified, s)
    mac = ql.BondFunctions.duration(bond, rate, ql.Duration.Macaulay, s)
    conv = ql.BondFunctions.convexity(bond, rate, s)
    args = {"settlement": settle, "maturity": mat, "coupon_rate": c, "frequency": f, "day_count": dcn}
    add("bond_price", {**args, "yield": y}, {"clean_price": clean, "dirty_price": dirty, "accrued_interest": bond.accruedAmount(s), "modified_duration": mod, "macaulay_duration": mac, "convexity": conv, "dv01": mod * dirty * 1e-4})
    target = clean - 1.25
    yy = ql.BondFunctions.bondYield(bond, ql.BondPrice(target, ql.BondPrice.Clean), dc, ql.Compounded, f, s, 1e-15, 1000)
    add("bond_yield", {**args, "clean_price": target}, {"yield": yy}, tol=1e-8)

for T, comp, y in [(5, 1, 0.04), (2.5, 2, 0.031), (10, "continuous", 0.045), (0.75, 12, -0.004)]:
    p = 100 * math.exp(-y * T) if comp == "continuous" else 100 * (1 + y / comp) ** (-comp * T)
    g = 1 if comp == "continuous" else 1 + y / comp
    add("zero_coupon_bond", {"years": T, "yield": y, "compounding": comp}, {"price": p, "modified_duration": T / g})
    add("zero_coupon_bond", {"years": T, "price": p, "compounding": comp}, {"yield": y})

# Bootstrap by solving the par-bond equations as one linear system (independent of the forward recursion).
tenors = [0.5, 1, 2, 3, 5, 7, 10]
pars = [0.052, 0.050, 0.047, 0.045, 0.044, 0.0445, 0.046]
f = 2
grid = np.arange(1, 21) / f
par_grid = np.interp(grid, tenors, pars)
A = np.zeros((20, 20))
for k in range(20):
    A[k, : k + 1] = par_grid[k] / f
    A[k, k] += 1
dfs = np.linalg.solve(A, np.ones(20))
add("bootstrap_zero_curve", {"years": tenors, "par_yields": pars, "frequency": 2}, {"rows": [[float(t), float(p), float(d), float(-math.log(d) / t), float(f * (d ** (-1 / (f * t)) - 1)), float(f * ((1 if i == 0 else dfs[i - 1]) / d - 1))] for i, (t, p, d) in enumerate(zip(grid, par_grid, dfs))]}, tol=1e-9)

for comp in ["continuous", "simple", 2]:
    r1, r2, t1, t2 = 0.04, 0.047, 1.5, 4
    df = (lambda r, t: math.exp(-r * t)) if comp == "continuous" else (lambda r, t: 1 / (1 + r * t)) if comp == "simple" else (lambda r, t: (1 + r / comp) ** (-comp * t))
    fdf = df(r2, t2) / df(r1, t1)
    fw = -math.log(fdf) / 2.5 if comp == "continuous" else (1 / fdf - 1) / 2.5 if comp == "simple" else comp * (fdf ** (-1 / (comp * 2.5)) - 1)
    add("forward_rate", {"t1": t1, "t2": t2, "zero_rate_1": r1, "zero_rate_2": r2, "compounding": comp}, {"forward_rate": fw, "forward_discount_factor": fdf})

# Nelson-Siegel: same tau grid, numpy least squares.
mats = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30]
ys = [0.0530, 0.0525, 0.0505, 0.0470, 0.0452, 0.0440, 0.0442, 0.0448, 0.0472, 0.0468]


def ns_fit(tau):
    x = np.array(mats) / tau
    e = np.exp(-x)
    X = np.column_stack([np.ones(len(mats)), (1 - e) / x, (1 - e) / x - e])
    b, *_ = np.linalg.lstsq(X, np.array(ys), rcond=None)
    r = np.array(ys) - X @ b
    return float(r @ r), b, tau


best = min((ns_fit(0.05 * 400 ** (i / 400)) for i in range(401)), key=lambda t: t[0])
add("nelson_siegel_fit", {"years": mats, "yields": ys}, {"beta0": best[1][0], "beta1": best[1][1], "beta2": best[1][2], "tau": best[2], "rmse": math.sqrt(best[0] / len(mats))}, tol=1e-7)
fixed = ns_fit(1.8)
add("nelson_siegel_fit", {"years": mats, "yields": ys, "tau": 1.8}, {"beta0": fixed[1][0], "beta1": fixed[1][1], "beta2": fixed[1][2]}, tol=1e-8)

# Swaps and FRAs on a QuantLib zero curve (continuous, linear zero rates, flat extrapolation).
cy, cz = [0.5, 1, 2, 3, 5, 7, 10], [0.0510, 0.0495, 0.0465, 0.0450, 0.0442, 0.0446, 0.0458]


def zr(t):
    return float(np.interp(t, cy, cz))


def dfc(t, shift=0.0):
    return math.exp(-(zr(t) + shift) * t)


for T, K, ff in [(5, 0.044, 2), (3, 0.05, 1), (10, 0.04, 4)]:
    def pv(sh):
        ann = sum(dfc(k / ff, sh) / ff for k in range(1, int(T * ff) + 1))
        return ann, 1 - dfc(T, sh), 1e6 * ((1 - dfc(T, sh)) - K * ann)
    ann, fl, v = pv(0)
    add("interest_rate_swap", {"curve": {"years": cy, "zero_rates": cz}, "years": T, "fixed_rate": K, "fixed_frequency": ff}, {"par_rate": fl / ann, "value_pay_fixed": v, "annuity": ann, "dv01_curve_parallel": (pv(-1e-4)[2] - pv(1e-4)[2]) / 2}, tol=1e-8)
for s, e, K in [(0.5, 1.0, 0.048), (2, 2.25, 0.043)]:
    fwd = (dfc(s) / dfc(e) - 1) / (e - s)
    add("forward_rate_agreement", {"curve": {"years": cy, "zero_rates": cz}, "start": s, "end": e, "fixed_rate": K}, {"forward_rate": fwd, "value_pay_fixed": 1e6 * (e - s) * (fwd - K) * dfc(e)})

# Z-spread: QuantLib cash flows, scipy root.
for settle, mat, c, f, dcn, price in [("2026-03-15", "2031-08-31", 0.0425, 2, "30/360", 97.4), ("2026-01-10", "2033-01-10", 0.06, 2, "ACT/ACT", 103.2)]:
    bond, dc, s = ql_bond(settle, mat, c, f, dcn)
    flows = [(cf.date() - s, cf.amount()) for cf in bond.cashflows() if cf.date() > s]
    dirty = price + bond.accruedAmount(s)
    zs = brentq(lambda z: sum(a * math.exp(-(zr(d / 365) + z) * d / 365) for d, a in flows) - dirty, -0.2, 0.5, xtol=1e-15)
    add("z_spread", {"settlement": settle, "maturity": mat, "coupon_rate": c, "frequency": f, "day_count": dcn, "clean_price": price, "curve": {"years": cy, "zero_rates": cz}}, {"z_spread": zs}, tol=1e-8)

add("credit_hazard_rate", {"spread": 0.012, "recovery": 0.4, "years": 5}, {"hazard_rate": 0.02, "survival_probability": math.exp(-0.1), "default_probability": 1 - math.exp(-0.1)})
add("credit_hazard_rate", {"hazard_rate": 0.035, "recovery": 0.25, "years": 3}, {"spread": 0.035 * 0.75, "expected_loss": (1 - math.exp(-0.105)) * 0.75})

for model, r0, a, b, sg, T in [("vasicek", 0.03, 0.15, 0.05, 0.01, 5), ("vasicek", 0.06, 0.4, 0.04, 0.02, 12), ("cir", 0.03, 0.2, 0.05, 0.05, 7), ("cir", 0.01, 0.6, 0.035, 0.08, 2)]:
    m = ql.Vasicek(r0, a, b, sg) if model == "vasicek" else ql.CoxIngersollRoss(r0, b, a, sg)
    p = m.discountBond(0.0, T, r0)
    add("short_rate_bond_price", {"model": model, "short_rate": r0, "mean_reversion": a, "long_run_rate": b, "volatility": sg, "years": T}, {"price": p, "yield_continuous": -math.log(p) / T}, tol=1e-9)

for days, dr in [(91, 0.0512), (182, 0.048), (364, 0.045)]:
    P = 100 * (1 - dr * days / 360)
    if days <= 182:
        bey = (100 - P) / P * 365 / days
    else:
        t = days / 365
        bey = brentq(lambda y: P * (1 + y / 2) * (1 + y * (t - 0.5)) - 100, 0, 1, xtol=1e-15)
    add("treasury_bill_yields", {"days": days, "discount_rate": dr}, {"price": P, "bond_equivalent_yield": bey, "money_market_yield": (100 - P) / P * 360 / days, "effective_annual_yield": (100 / P) ** (365 / days) - 1}, tol=1e-9)

print(json.dumps({"generated_by": "scripts/reference/rates.py", "cases": cases}, default=float))
