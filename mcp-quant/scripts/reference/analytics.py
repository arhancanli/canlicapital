"""Reference values for the deeper analytics: statsmodels (Markov switching, Johansen, recursive
least squares and CUSUM, OLS with Newey-West; Markov fits polished past statsmodels' default
stopping), scipy (Kendall, Spearman, Pearson, generalized
Pareto likelihood, root finding), dcor (distance correlation), an independent pandas
implementation of the CBOE VIX method, and numpy for realized measures, densities and the seeded
block bootstrap (mulberry32 ported).

Regenerate with:

    uv run --with numpy --with pandas --with scipy --with statsmodels --with dcor python scripts/reference/analytics.py > test/fixtures/analytics.json
"""

import json
import math

import dcor
import numpy as np
import statsmodels.api as sm
from scipy import optimize, special, stats
from statsmodels.regression.recursive_ls import RecursiveLS
from statsmodels.tsa.regime_switching.markov_regression import MarkovRegression
from statsmodels.tsa.vector_ar.vecm import coint_johansen

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


rng = np.random.default_rng(1008)

# ---------------------------------------------------------------------------------------------
# Markov switching: two and three regimes with switching mean and variance
# ---------------------------------------------------------------------------------------------
for k, n, seed in ((2, 900, 1), (3, 1200, 2)):
    g = np.random.default_rng(seed)
    st, y = 0, []
    for t in range(n):
        if g.random() < 0.025:
            st = (st + 1 + g.integers(0, k - 1)) % k if k > 2 else 1 - st
        y.append(-0.0012 * st + 0.0006 + 0.007 * (1 + 1.4 * st) * g.standard_normal())
    y = np.array(y).round(8)
    model = MarkovRegression(y, k_regimes=k, trend="c", switching_variance=True)
    res = model.fit(search_reps=30, search_iter=30, maxiter=500, disp=False)
    # statsmodels' default stopping leaves ~1e-12 of likelihood on the table; polish to the optimum.
    res = model.fit(start_params=res.params, method="nm", maxiter=50000, xtol=1e-14, ftol=1e-15, disp=False)
    res = model.fit(start_params=res.params, method="bfgs", maxiter=5000, gtol=1e-12, disp=False)
    pp = dict(zip(res.model.param_names, res.params))
    mu = np.array([pp[f"const[{j}]"] for j in range(k)])
    s2 = np.array([pp[f"sigma2[{j}]"] for j in range(k)])
    order = np.argsort(s2)
    Pt = res.regime_transition[:, :, 0]  # [to, from]
    P = Pt.T[np.ix_(order, order)]
    filt = res.filtered_marginal_probabilities[-1][order]
    rows = [[j, mu[o], math.sqrt(s2[o]), mu[o] * 252, math.sqrt(s2[o] * 252), 1 / (1 - P[j, j])] for j, o in enumerate(order)]
    for j in range(k):
        rows[j] += [None, None, filt[j]]
    add("markov_regime_switching", {"returns": y.tolist(), "regimes": k}, {"rows": rows, "transition_matrix": P.tolist(), "log_likelihood": res.llf, "aic": res.aic}, tol=2e-5)

# ---------------------------------------------------------------------------------------------
# Johansen on three log price series with one cointegrating relation
# ---------------------------------------------------------------------------------------------
n = 700
w1 = np.cumsum(rng.normal(0, 0.01, n))
w2 = np.cumsum(rng.normal(0, 0.012, n))
ou = np.zeros(n)
for t in range(1, n):
    ou[t] = 0.85 * ou[t - 1] + rng.normal(0, 0.004)
L = np.column_stack([4 + w1, 3 + w2, 1 + 0.6 * w1 + 0.4 * w2 + ou])
PX = np.exp(L).round(6)
for det, lags in ((0, 1), (1, 2), (-1, 1)):
    j = coint_johansen(np.log(PX), det, lags)
    eig, lr1, lr2, evec = j.eig.real, j.lr1.real, j.lr2.real, j.evec.real  # numpy's eig returns a complex dtype
    m = 3
    rank = m
    for i in range(m):
        if lr1[i] < j.cvt[i, 1]:
            rank = i
            break
    vecs = [(evec[:, i] / evec[0, i]).tolist() for i in range(max(rank, 1))]
    rows = [[i, eig[i], lr1[i], *j.cvt[i], lr2[i], *j.cvm[i]] for i in range(m)]
    add("johansen_cointegration", {"prices": PX.tolist(), "det_order": det, "lags": lags}, {"rows": rows, "cointegration_rank_5pct": rank, "cointegrating_vectors": vecs}, tol=1e-7)

# ---------------------------------------------------------------------------------------------
# Recursive least squares, CUSUM and CUSUM of squares; a beta that shifts two thirds through
# ---------------------------------------------------------------------------------------------
n = 500
x = rng.normal(0, 0.01, n)
beta = np.where(np.arange(n) < 330, 0.8, 1.4)
yv = (0.0003 + beta * x + rng.normal(0, 0.006, n)).round(9)
x = x.round(9)
for exog, args in ((sm.add_constant(x), {"y": yv.tolist(), "x": [[v] for v in x]}), (np.ones((n, 1)), {"y": (yv + np.where(np.arange(n) > 350, 0.004, 0)).tolist()})):
    yy = np.array(args["y"])
    r = RecursiveLS(yy, exog).fit()
    kx = exog.shape[1]
    path = r.recursive_coefficients.filtered[:, kx:]
    cus, sq = r.cusum, r.cusum_squares
    mm = len(cus)
    root = math.sqrt(n - kx)
    bound = 0.948 * root + 2 * 0.948 * (np.arange(mm) + 1) / root
    nn = 0.5 * (n - kx) - 1
    sc = [1.3581015, -0.6701218, -0.8858694]
    crit = sc[0] / nn ** 0.5 + sc[1] / nn + sc[2] / nn ** 1.5
    dev = np.abs(sq - (np.arange(mm) + 1) / mm)
    c1 = np.flatnonzero(np.abs(cus) > bound)
    c2 = np.flatnonzero(dev > crit)
    names = ["const"] + [f"x{i}" for i in range(1, kx)]
    add("recursive_stability_test", args,
        {"rows": [[names[i], path[i, -1], path[i].min(), path[i].max(), path[i, 0]] for i in range(kx)],
         "cusum": {"max_abs_over_bound": (np.abs(cus) / bound).max(), "crosses": bool(len(c1)), "first_cross_period": int(c1[0] + kx) if len(c1) else None, "last": cus[-1]},
         "cusum_of_squares": {"max_deviation": dev.max(), "critical_value": crit, "crosses": bool(len(c2)), "first_cross_period": int(c2[0] + kx) if len(c2) else None},
         "recursive_residuals": mm}, tol=1e-7)

# ---------------------------------------------------------------------------------------------
# Chow test at a known break and the sup-F scan
# ---------------------------------------------------------------------------------------------
X = sm.add_constant(x)


def ssr(lo, hi):
    return sm.OLS(yv[lo:hi], X[lo:hi]).fit().ssr


full = ssr(0, n)
kx = 2


def chow(b):
    s = ssr(0, b) + ssr(b, n)
    F = ((full - s) / kx) / (s / (n - 2 * kx))
    return F, stats.f.sf(F, kx, n - 2 * kx)


F, p = chow(330)
add("chow_break_test", {"y": yv.tolist(), "x": [[v] for v in x], "break_period": 330}, {"f_stat": F, "p_value": p})
lo, hi = max(kx + 1, math.floor(n * 0.15)), min(n - kx - 1, n - math.floor(n * 0.15))
best = max(((chow(b)[0], b) for b in range(lo, hi + 1)), key=lambda z: (z[0], -z[1]))
add("chow_break_test", {"y": yv.tolist(), "x": [[v] for v in x]}, {"scanned": [lo, hi], "sup_f_stat": best[0], "most_likely_break_period": best[1], "chow_p_value_at_that_period": chow(best[1])[1]})

# ---------------------------------------------------------------------------------------------
# HAR on a persistent realized-variance series
# ---------------------------------------------------------------------------------------------
n = 800
lv = np.zeros(n)
for t in range(1, n):
    lv[t] = 0.97 * lv[t - 1] + rng.normal(0, 0.25)
rv = (np.exp(lv - 9.2) * (1 + 0.3 * rng.standard_normal(n) ** 2)).round(12)
for h, log in ((1, False), (5, True)):
    v = np.log(rv) if log else rv
    Xh, Yh = [], []
    for t in range(21, n - h):
        Xh.append([1, v[t], v[t - 4:t + 1].mean(), v[t - 21:t + 1].mean()])
        Yh.append(v[t + 1:t + 1 + h].mean())
    fit = sm.OLS(np.array(Yh), np.array(Xh)).fit(cov_type="HAC", cov_kwds={"maxlags": h + 4})
    t = n - 1
    f = fit.params @ [1, v[t], v[t - 4:t + 1].mean(), v[t - 21:t + 1].mean()]
    fv = math.exp(f) if log else f
    names = ["const", "daily", "weekly", "monthly"]
    add("har_rv_forecast", {"realized_variance": rv.tolist(), "horizon": h, "log": log},
        {"rows": [[names[i], fit.params[i], fit.bse[i], fit.tvalues[i], fit.pvalues[i]] for i in range(4)], "r_squared": fit.rsquared, "nobs": int(fit.nobs), "forecast_variance": fv, "forecast_annual_volatility": math.sqrt(fv * 252)})

# ---------------------------------------------------------------------------------------------
# Realized measures from intraday returns with planted jumps
# ---------------------------------------------------------------------------------------------
days = []
for d in range(40):
    r = rng.normal(0, 0.0012 * (1 + 0.5 * math.sin(d / 5)), 78)
    if d in (7, 39):
        r[33] += 0.02 if d == 7 else -0.015
    days.append(r.round(10))
mu1 = math.sqrt(2 / math.pi)
mu43 = 2 ** (2 / 3) * special.gamma(7 / 6) / special.gamma(0.5)
theta = math.pi ** 2 / 4 + math.pi - 5
crit = stats.norm.ppf(1 - 0.001)
out = []
for r in days:
    nn = len(r)
    rvd = (r ** 2).sum()
    bv = (np.abs(r[1:]) * np.abs(r[:-1])).sum() / mu1 ** 2
    tq = nn * (nn / (nn - 2)) / mu43 ** 3 * ((np.abs(r[2:]) * np.abs(r[1:-1]) * np.abs(r[:-2])) ** (4 / 3)).sum()
    zz = ((rvd - bv) / rvd) / math.sqrt(theta / nn * max(1, tq / bv ** 2))
    up = (r[r > 0] ** 2).sum()
    out.append(dict(rv=rvd, bv=bv, jump=max(rvd - bv, 0), z=zz, isj=zz > crit, up=up, down=rvd - up, skew=math.sqrt(nn) * (r ** 3).sum() / rvd ** 1.5, kurt=nn * (r ** 4).sum() / rvd ** 2))
tot = sum(o["rv"] for o in out)
la = out[-1]
add("realized_volatility_measures", {"intraday_returns": [d.tolist() for d in days], "include_series": True},
    {"days": 40, "mean_annual_volatility": math.sqrt(np.mean([o["rv"] for o in out]) * 252), "jump_days": sum(o["isj"] for o in out),
     "jump_share_of_variance": sum(o["jump"] for o in out if o["isj"]) / tot, "downside_share_of_variance": sum(o["down"] for o in out) / tot,
     "latest": {"realized_variance": la["rv"], "bipower_variation": la["bv"], "jump_component": la["jump"], "jump_z": la["z"], "jump": bool(la["isj"]), "semivariance_up": la["up"], "semivariance_down": la["down"], "realized_skewness": la["skew"], "realized_kurtosis": la["kurt"]},
     "series": {"realized_variance": [o["rv"] for o in out], "bipower_variation": [o["bv"] for o in out], "jump_z": [o["z"] for o in out]}})

# ---------------------------------------------------------------------------------------------
# Dependence: a nonlinear, tail-heavy relation with ties
# ---------------------------------------------------------------------------------------------
n = 600
a = rng.standard_t(4, n) * 0.01
b = (0.4 * a + 0.6 * np.abs(a) + rng.normal(0, 0.008, n))
a, b = a.round(4), b.round(4)
q = 0.1
ra, rb = stats.rankdata(a), stats.rankdata(b)
u, v = ra / (n + 1), rb / (n + 1)
lo = u <= q
hi = u > 1 - q
pr = stats.pearsonr(a, b)
sp = stats.spearmanr(a, b)
kt = stats.kendalltau(a, b, method="asymptotic")
add("dependence_measures", {"x": a.tolist(), "y": b.tolist()},
    {"rows": [["pearson", pr.statistic, pr.pvalue], ["spearman", sp.statistic, sp.pvalue], ["kendall_tau_b", kt.statistic, kt.pvalue], ["distance_correlation", dcor.distance_correlation(a, b), None]],
     "lower_tail_dependence": (v[lo] <= q).mean(), "upper_tail_dependence": (v[hi] > 1 - q).mean()}, tol=1e-8)

# ---------------------------------------------------------------------------------------------
# Seeded stationary bootstrap
# ---------------------------------------------------------------------------------------------
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


def stat(kind, r, ppy=252):
    if kind == "sharpe":
        sd = r.std(ddof=1)
        return r.mean() / sd * math.sqrt(ppy) if sd > 0 else 0.0
    if kind == "sortino":
        d = math.sqrt((np.minimum(r, 0) ** 2).sum() / len(r))
        return r.mean() / d * math.sqrt(ppy) if d > 0 else 0.0
    eq = np.cumprod(1 + r)
    mdd = min((eq / np.maximum.accumulate(np.r_[1.0, eq])[1:] - 1).min(), 0.0)
    cagr = eq[-1] ** (ppy / len(r)) - 1
    return {"cagr": cagr, "max_drawdown": mdd, "calmar": cagr / -mdd if mdd < 0 else 0.0, "mean": r.mean() * ppy, "volatility": r.std(ddof=1) * math.sqrt(ppy)}[kind]


rets = (rng.normal(0.0004, 0.01, 750) + 0.3 * np.r_[0, rng.normal(0, 0.004, 749)]).round(8)
for kind, seed, reps, block in (("sharpe", 7, 1500, None), ("max_drawdown", 3, 800, 12), ("calmar", 11, 600, 5)):
    nn = len(rets)
    blk = block or max(1, round(nn ** (1 / 3)))
    rnd = mulberry32(seed)
    draws = []
    for _ in range(reps):
        idx, cur = np.empty(nn, dtype=int), 0
        for t in range(nn):
            uu = rnd()
            cur = math.floor(rnd() * nn) if (t == 0 or uu < 1 / blk) else (cur + 1) % nn
            idx[t] = cur
        draws.append(stat(kind, rets[idx]))
    draws = np.array(draws)
    pt = stat(kind, rets)
    lo, hi = np.quantile(draws, 0.025), np.quantile(draws, 0.975)
    args = {"returns": rets.tolist(), "statistic": kind, "seed": seed, "reps": reps}
    if block:
        args["block"] = block
    add("bootstrap_confidence_interval", args, {"estimate": pt, "bootstrap_mean": draws.mean(), "standard_error": draws.std(ddof=1), "percentile_interval": [lo, hi], "basic_interval": [2 * pt - hi, 2 * pt - lo], "share_at_or_below_zero": (draws <= 0).mean(), "block": blk})

# ---------------------------------------------------------------------------------------------
# Extreme value tail: GPD by maximum likelihood on scipy's density
# ---------------------------------------------------------------------------------------------
heavy = (rng.standard_t(3, 3000) * 0.008).round(8)
for uq in (0.95, 0.9):
    Lo = -heavy
    srt = np.sort(Lo)
    u = np.quantile(srt, uq)
    y = Lo[Lo > u] - u
    nll = lambda th: -stats.genpareto.logpdf(y, c=th[0], scale=math.exp(th[1])).sum()
    o = optimize.minimize(nll, [0.1, math.log(y.mean())], method="Nelder-Mead", options={"xatol": 1e-13, "fatol": 1e-15, "maxiter": 200000, "maxfev": 200000})
    o = optimize.minimize(nll, o.x, method="Nelder-Mead", options={"xatol": 1e-14, "fatol": 1e-16, "maxiter": 200000, "maxfev": 200000})
    xi, bb = o.x[0], math.exp(o.x[1])
    Nu, nn = len(y), len(Lo)
    top = np.sort(Lo)[::-1][: Nu + 1]
    hill = np.mean(np.log(top[:Nu] / top[Nu]))
    rows = []
    for p in (0.99, 0.995, 0.999):
        var = u + bb / xi * (((nn / Nu) * (1 - p)) ** -xi - 1)
        rows.append([p, var, var / (1 - xi) + (bb - xi * u) / (1 - xi), np.quantile(srt, p)])
    add("extreme_value_tail", {"returns": heavy.tolist(), "threshold_quantile": uq}, {"threshold": u, "exceedances": Nu, "shape_xi": xi, "scale_beta": bb, "hill_tail_index": 1 / hill, "rows": rows}, tol=2e-6)

# ---------------------------------------------------------------------------------------------
# CBOE VIX method on synthetic skewed chains with zero-bid wings
# ---------------------------------------------------------------------------------------------
def bs(S, K, T, r, vol, call):
    d1 = (math.log(S / K) + (r + vol * vol / 2) * T) / (vol * math.sqrt(T))
    d2 = d1 - vol * math.sqrt(T)
    return S * stats.norm.cdf(d1) - K * math.exp(-r * T) * stats.norm.cdf(d2) if call else K * math.exp(-r * T) * stats.norm.cdf(-d2) - S * stats.norm.cdf(-d1)


def chain(S, minutes, r, base):
    T = minutes / 525600
    opts = []
    for K in range(1500, 2605, 5 if 1900 <= 0 else 25):
        vol = base + 0.25 * max(0, (2000 - K) / 2000) + 0.05 * ((K - 2000) / 2000) ** 2
        c, p = bs(S, K, T, r, vol, True), bs(S, K, T, r, vol, False)
        sp = 0.05 + 0.01 * (c + p) ** 0.5
        cb, pb = max(round(c - sp, 2), 0), max(round(p - sp, 2), 0)
        if K < 1650 and K % 50 == 25:
            pb = 0
        opts.append({"strike": float(K), "call_bid": cb, "call_ask": round(c + sp, 2), "put_bid": pb, "put_ask": round(p + sp, 2)})
    return {"minutes_to_expiry": minutes, "rate": r, "options": opts}


def vix_expiry(e):
    T, R = e["minutes_to_expiry"] / 525600, e["rate"]
    op = sorted(e["options"], key=lambda o: o["strike"])
    K = np.array([o["strike"] for o in op])
    C = np.array([(o["call_bid"] + o["call_ask"]) / 2 for o in op])
    P = np.array([(o["put_bid"] + o["put_ask"]) / 2 for o in op])
    i = int(np.argmin(np.abs(C - P)))
    F = K[i] + math.exp(R * T) * (C[i] - P[i])
    i0 = int(np.flatnonzero(K <= F)[-1])
    used = []
    zeros = 0
    for j in range(i0 - 1, -1, -1):
        if op[j]["put_bid"] == 0:
            zeros += 1
            if zeros == 2:
                break
            continue
        zeros = 0
        used.insert(0, (K[j], P[j]))
    used.append((K[i0], (C[i0] + P[i0]) / 2))
    zeros = 0
    for j in range(i0 + 1, len(op)):
        if op[j]["call_bid"] == 0:
            zeros += 1
            if zeros == 2:
                break
            continue
        zeros = 0
        used.append((K[j], C[j]))
    ks = np.array([k for k, _ in used])
    qs = np.array([q for _, q in used])
    dk = np.empty(len(ks))
    dk[1:-1] = (ks[2:] - ks[:-2]) / 2
    dk[0], dk[-1] = ks[1] - ks[0], ks[-1] - ks[-2]
    s2 = 2 / T * (dk / ks ** 2 * math.exp(R * T) * qs).sum() - (F / K[i0] - 1) ** 2 / T
    return T, F, K[i0], len(ks), s2


near, nxt = chain(2000, 34484, 0.0305, 0.16), chain(2000, 44954, 0.0286, 0.165)
T1, F1, k1, n1, s1 = vix_expiry(near)
T2, F2, k2, n2, s2v = vix_expiry(nxt)
N30, N365 = 43200, 525600
w1 = (44954 - N30) / (44954 - 34484)
w2 = (N30 - 34484) / (44954 - 34484)
idx = 100 * math.sqrt((T1 * s1 * w1 + T2 * s2v * w2) * N365 / N30)
add("vix_style_index", {"near": near, "next": nxt}, {"index": idx, "near": {"forward": F1, "k0": k1, "strikes_used": n1, "variance": s1}, "next": {"forward": F2, "k0": k2, "strikes_used": n2, "variance": s2v}, "weights": [w1, w2]})
add("vix_style_index", {"near": near}, {"index": 100 * math.sqrt(s1)})

# ---------------------------------------------------------------------------------------------
# Risk-neutral density: the discrete formula, and against the lognormal it should recover
# ---------------------------------------------------------------------------------------------
Ks = np.r_[np.arange(50, 90, 2.5), np.arange(90, 115, 1.0), np.arange(115, 181, 2.5)]
Sx, Tx, rx, vx = 100.0, 0.5, 0.02, 0.25
Cx = np.array([bs(Sx, k, Tx, rx, vx, True) for k in Ks])
g = math.exp(rx * Tx)
dens, cdf = [], []
for i in range(1, len(Ks) - 1):
    h1, h2 = Ks[i] - Ks[i - 1], Ks[i + 1] - Ks[i]
    d2 = 2 * (Cx[i - 1] / (h1 * (h1 + h2)) - Cx[i] / (h1 * h2) + Cx[i + 1] / (h2 * (h1 + h2)))
    d1 = -h2 / (h1 * (h1 + h2)) * Cx[i - 1] + (h2 - h1) / (h1 * h2) * Cx[i] + h1 / (h2 * (h1 + h2)) * Cx[i + 1]
    dens.append(g * d2)
    cdf.append(1 + g * d1)
ks = Ks[1:-1]
dens, cdf = np.array(dens), np.array(cdf)
mass = np.trapezoid(dens, ks)
m1 = np.trapezoid(ks * dens, ks) / mass
m2 = np.trapezoid((ks - m1) ** 2 * dens, ks) / mass
add("risk_neutral_density", {"strikes": Ks.tolist(), "call_prices": Cx.tolist(), "years": Tx, "rate": rx, "levels": [90, 100, 120]},
    {"rows": [[k, d, c] for k, d, c in zip(ks, dens, cdf)], "mass_captured": mass, "mean": m1, "volatility_of_price": math.sqrt(m2), "probability_below": [[L, float(np.interp(L, ks, cdf))] for L in (90, 100, 120)]})
lognorm = stats.lognorm(s=vx * math.sqrt(Tx), scale=Sx * math.exp((rx - vx * vx / 2) * Tx))
inner = [i for i, k in enumerate(ks) if 92 <= k <= 112]
add("risk_neutral_density", {"strikes": Ks.tolist(), "call_prices": Cx.tolist(), "years": Tx, "rate": rx},
    {"rows": [[None, lognorm.pdf(ks[i]), lognorm.cdf(ks[i])] if i in inner else [None, None, None] for i in range(len(ks))], "mean": Sx * g}, tol=3e-3)

# ---------------------------------------------------------------------------------------------
# Merton: solve the two equations with scipy
# ---------------------------------------------------------------------------------------------
for E, sE, D, T, r, mu in ((3.0, 0.8, 10.0, 1.0, 0.05, None), (40.0, 0.35, 60.0, 2.0, 0.03, 0.08)):
    def eqs(z):
        V, sv = z
        d1 = (math.log(V / D) + (r + sv * sv / 2) * T) / (sv * math.sqrt(T))
        d2 = d1 - sv * math.sqrt(T)
        return [V * stats.norm.cdf(d1) - D * math.exp(-r * T) * stats.norm.cdf(d2) - E, stats.norm.cdf(d1) * sv * V - sE * E]
    V, sv = optimize.fsolve(eqs, [E + D * math.exp(-r * T), sE * E / (E + D)], xtol=1e-13)
    assert max(abs(x) for x in eqs([V, sv])) < 1e-11
    d1 = (math.log(V / D) + (r + sv * sv / 2) * T) / (sv * math.sqrt(T))
    d2 = d1 - sv * math.sqrt(T)
    exp = {"asset_value": V, "asset_volatility": sv, "distance_to_default": d2, "default_probability_risk_neutral": stats.norm.cdf(-d2), "debt_value": V - E, "credit_spread": -math.log((V - E) / (D * math.exp(-r * T))) / T}
    args = {"equity_value": E, "equity_volatility": sE, "debt": D, "years": T, "rate": r}
    if mu is not None:
        args["asset_drift"] = mu
        dd = (math.log(V / D) + (mu - sv * sv / 2) * T) / (sv * math.sqrt(T))
        exp["default_probability_real_world"] = stats.norm.cdf(-dd)
    add("merton_credit_risk", args, exp, tol=1e-8)

print(json.dumps({"generated_by": "scripts/reference/analytics.py", "cases": cases}, default=lambda o: o.tolist() if hasattr(o, "tolist") else (bool(o) if isinstance(o, np.bool_) else float(o))))
