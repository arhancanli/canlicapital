"""Reference values for the econometrics toolset, computed independently of the server.

statsmodels (OLS and robust covariances, adfuller, kpss, coint, grangercausalitytests, het_arch),
arch (GARCH, variance ratio), pandas (EWMA), scipy (t-tests) and the published formulas for the
range estimators and the Sharpe statistics. Regenerate with:

    uv run --with numpy --with scipy --with statsmodels --with arch --with pandas \
        python scripts/reference/econometrics.py > test/fixtures/econometrics.json
"""

import json
import math
import warnings

import numpy as np
import pandas as pd
from arch import arch_model
from arch.unitroot import VarianceRatio
from scipy import stats
from statsmodels.regression.linear_model import OLS
from statsmodels.stats.diagnostic import het_arch
from statsmodels.tools import add_constant
from statsmodels.tsa.stattools import adfuller, coint, grangercausalitytests, kpss

warnings.filterwarnings("ignore")
cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


rng = np.random.default_rng(5)
n = 600
X = rng.normal(0, 1, (n, 3)).round(8)
y = (0.3 + X @ np.array([0.5, -0.2, 0.1]) + rng.standard_t(5, n) * 0.8).round(8)
# AR(1) errors to make HAC matter.
e = np.zeros(n)
for t in range(1, n):
    e[t] = 0.5 * e[t - 1] + rng.normal(0, 0.5)
y2 = (y + e).round(8)
for cov, kw in [("classical", {}), ("hc1", {}), ("hac", {"maxlags": 6})]:
    fit = OLS(y2, add_constant(X)).fit() if cov == "classical" else OLS(y2, add_constant(X)).fit(cov_type="HC1" if cov == "hc1" else "HAC", cov_kwds=kw or None)
    rows = [[nm, float(b), float(s), float(t_), float(p)] for nm, b, s, t_, p in zip(["const", "x1", "x2", "x3"], fit.params, fit.bse, fit.tvalues, fit.pvalues)]
    args = {"y": y2.tolist(), "x": X.tolist(), "standard_errors": cov}
    if cov == "hac":
        args["lags"] = 6
    add("linear_regression", args, {"rows": rows, "r_squared": fit.rsquared, "adj_r_squared": fit.rsquared_adj, "aic": fit.aic}, tol=1e-8)

ff = rng.normal(0.0003, 0.01, (n, 3)).round(8)
ret = (0.0002 + ff @ np.array([1.1, 0.3, -0.2]) + rng.normal(0, 0.006, n)).round(8)
fit = OLS(ret, add_constant(ff)).fit(cov_type="HAC", cov_kwds={"maxlags": int(4 * (n / 100) ** (2 / 9))})
add("factor_regression", {"returns": ret.tolist(), "factors": ff.tolist()}, {"alpha_annual": fit.params[0] * 252, "alpha_t": fit.tvalues[0], "alpha_p_value": fit.pvalues[0]}, tol=1e-8)

rw = np.cumsum(rng.normal(0, 1, 500)).round(8)
ar = np.zeros(500)
for t in range(1, 500):
    ar[t] = 0.9 * ar[t - 1] + rng.normal()
ar = ar.round(8)
trend = (ar + 0.05 * np.arange(500)).round(8)
for s, reg in [(rw, "c"), (ar, "c"), (trend, "ct"), (ar, "n")]:
    r = adfuller(s, regression=reg, autolag="AIC")
    add("adf_test", {"series": s.tolist(), "regression": reg}, {"adf_stat": r[0], "p_value": r[1], "used_lag": r[2], "nobs": r[3], "critical_values": r[4]}, tol=1e-8)
r = adfuller(ar, maxlag=3, autolag=None, regression="c")
add("adf_test", {"series": ar.tolist(), "max_lag": 3, "autolag": False}, {"adf_stat": r[0], "p_value": r[1]}, tol=1e-8)
for s, reg in [(rw, "c"), (ar, "c"), (trend, "ct")]:
    k = kpss(s, regression=reg, nlags="auto")
    add("kpss_test", {"series": s.tolist(), "regression": reg}, {"kpss_stat": k[0], "p_value": k[1], "lags": k[2]}, tol=1e-8)

px = np.exp(np.cumsum(rng.normal(0.0003, 0.012, 800) + 0.08 * np.r_[0, rng.normal(0, 0.012, 799)])).round(8)
rows = []
for q in (2, 5, 10):
    vr = VarianceRatio(np.log(px), lags=q, trend="c", debiased=True, robust=True, overlap=True)
    rows.append([q, vr.vr, vr.stat, vr.pvalue])
add("variance_ratio_test", {"prices": px.tolist(), "horizons": [2, 5, 10]}, {"rows": rows}, tol=1e-8)
vr = VarianceRatio(np.log(px), lags=4, robust=False)
add("variance_ratio_test", {"prices": px.tolist(), "horizons": [4], "robust": False}, {"rows": [[4, vr.vr, vr.stat, vr.pvalue]]}, tol=1e-8)

xa = np.cumsum(rng.normal(0, 1, 700))
ya = (1.5 * xa + 2 + np.r_[ar, ar[:200]] * 0.5).round(8)
xa = xa.round(8)
c = coint(ya, xa, trend="c")
co = OLS(ya, add_constant(xa, prepend=False)).fit()
add("cointegration_test", {"y": ya.tolist(), "x": [xa.tolist()]}, {"hedge_ratios": [co.params[0]], "intercept": co.params[1], "adf_stat": c[0], "p_value": c[1], "critical_values": {"1%": c[2][0], "5%": c[2][1], "10%": c[2][2]}}, tol=1e-8)
yb = (np.cumsum(rng.normal(0, 1, 700)) + 0.3 * xa).round(8)
c = coint(yb, xa, trend="c")
add("cointegration_test", {"y": yb.tolist(), "x": [xa.tolist()]}, {"adf_stat": c[0], "p_value": c[1]}, tol=1e-8)

ou = np.zeros(1000)
for t in range(1, 1000):
    ou[t] = ou[t - 1] + 0.05 * (1.0 - ou[t - 1]) + 0.1 * rng.normal()
ou = ou.round(8)
f = OLS(np.diff(ou), add_constant(ou[:-1])).fit()
a_, b_ = f.params
phi = 1 + b_
dt = 1 / 252
th = -math.log(phi) / dt
sig = math.sqrt(f.mse_resid * 2 * th / (1 - phi * phi))
add("mean_reversion_fit", {"series": ou.tolist()}, {"ar_coefficient": phi, "half_life_periods": math.log(2) / -math.log(phi), "long_run_mean": -a_ / b_, "sigma": sig, "current_z_score": (ou[-1] + a_ / b_) / (sig / math.sqrt(2 * th)), "slope_t_stat": f.tvalues[1]}, tol=1e-8)

# GARCH(1,1): simulate, fit with arch on percent returns, convert to fractions.
T = 2000
om, al, be = 2e-6, 0.08, 0.9
r = np.zeros(T)
s2 = om / (1 - al - be)
for t in range(T):
    r[t] = 0.0004 + math.sqrt(s2) * rng.normal()
    s2 = om + al * (r[t] - 0.0004) ** 2 + be * s2
r = r.round(10)
am = arch_model(r * 100, mean="Constant", vol="GARCH", p=1, q=1, dist="normal", rescale=False)
res = am.fit(disp="off", options={"ftol": 1e-14, "maxiter": 2000})
pr = res.params
add("garch_volatility", {"returns": r.tolist()}, {"loglik": res.loglikelihood + T * math.log(100)}, tol=1e-7)
add("garch_volatility", {"returns": r.tolist()}, {"mu": pr["mu"] / 100, "omega": pr["omega"] / 1e4, "alpha": pr["alpha[1]"], "beta": pr["beta[1]"]}, tol=5e-3)

ewm = pd.Series(r ** 2).ewm(alpha=0.06, adjust=False).mean().to_numpy()
add("ewma_volatility", {"returns": r.tolist()}, {"current_vol_annual": math.sqrt(ewm[-1] * 252)})

# OHLC bars from a simulated intraday path.
bars = []
p = 100.0
for d in range(300):
    path = p * np.exp(np.cumsum(rng.normal(0, 0.012 / math.sqrt(78), 78)))
    o = p * math.exp(rng.normal(0, 0.003))
    hi, lo = max(o, path.max()), min(o, path.min())
    bars.append((o, hi, lo, path[-1]))
    p = path[-1]
O, H, L, C = (np.array(v).round(6) for v in zip(*bars))
lnr = np.log
cc = np.diff(lnr(C))
park = np.mean(lnr(H / L) ** 2) / (4 * math.log(2))
gk = np.mean(0.5 * lnr(H / L) ** 2 - (2 * math.log(2) - 1) * lnr(C / O) ** 2)
rs = lnr(H / C) * lnr(H / O) + lnr(L / C) * lnr(L / O)
oo = lnr(O[1:] / C[:-1])
ccx = lnr(C[1:] / O[1:])
m = len(O) - 1
kk = 0.34 / (1.34 + (m + 1) / (m - 1))
yz = oo.var(ddof=1) + kk * ccx.var(ddof=1) + (1 - kk) * rs[1:].mean()
add("range_volatility", {"open": O.tolist(), "high": H.tolist(), "low": L.tolist(), "close": C.tolist()}, {"close_to_close": cc.std(ddof=1) * math.sqrt(252), "parkinson": math.sqrt(park * 252), "garman_klass": math.sqrt(gk * 252), "rogers_satchell": math.sqrt(rs.mean() * 252), "yang_zhang": math.sqrt(yz * 252)})

# Sharpe statistics (Bailey and López de Prado 2012, 2014).
sr_r = (rng.standard_t(5, 1000) * 0.01 + 0.0006).round(10)
srp = sr_r.mean() / sr_r.std(ddof=1)
g3, g4 = stats.skew(sr_r), stats.kurtosis(sr_r, fisher=False)
vt = 1 - g3 * srp + (g4 - 1) / 4 * srp**2
bench = 0.0
add("probabilistic_sharpe_ratio", {"returns": sr_r.tolist(), "benchmark_sharpe": 0}, {"psr": stats.norm.cdf((srp - bench) * math.sqrt(999) / math.sqrt(vt)), "min_track_record_periods": 1 + vt * (stats.norm.ppf(0.95) / (srp - bench)) ** 2})
trials = rng.normal(0.5, 0.6, 40)
Nt = 100
vper = trials.var(ddof=1) / 252
eg = 0.5772156649015329
sstar = math.sqrt(vper) * ((1 - eg) * stats.norm.ppf(1 - 1 / Nt) + eg * stats.norm.ppf(1 - 1 / (Nt * math.e)))
add("deflated_sharpe_ratio", {"returns": sr_r.tolist(), "trials": Nt, "trial_sharpes": trials.tolist()}, {"dsr": stats.norm.cdf((srp - sstar) * math.sqrt(999) / math.sqrt(vt)), "expected_max_sharpe_annual": sstar * math.sqrt(252)})

A = (rng.normal(0, 1, (400, 1)) @ np.array([[1, 0.8, 0.6, 0.3, 0.1]]) + rng.normal(0, 0.7, (400, 5))).round(8)
w_, v_ = np.linalg.eigh(np.corrcoef(A.T))
idx = np.argsort(w_)[::-1]
w_, v_ = w_[idx], v_[:, idx]
v_ = v_ * np.sign(v_[np.argmax(np.abs(v_), axis=0), range(5)])
add("pca_factors", {"returns": A.tolist(), "components": 3}, {"rows": [[i + 1, w_[i], w_[i] / 5, w_[: i + 1].sum() / 5] for i in range(3)], "loadings": v_[:, :3].T.tolist()}, tol=1e-8)

bb = rng.normal(0, 0.01, 300).round(8)
rr = (0.8 * bb + rng.normal(0, 0.005, 300)).round(8)
rb = pd.Series(rr).rolling(60).cov(pd.Series(bb)) / pd.Series(bb).rolling(60).var()
rb = rb.dropna().to_numpy()
add("rolling_beta", {"returns": rr.tolist(), "benchmark": bb.tolist(), "window": 60}, {"latest_beta": rb[-1], "mean_beta": rb.mean(), "min_beta": rb.min(), "max_beta": rb.max()}, tol=1e-8)

gx = rng.normal(0, 1, 500)
gy = np.zeros(500)
for t in range(2, 500):
    gy[t] = 0.3 * gy[t - 1] + 0.4 * gx[t - 2] + rng.normal()
gx, gy = gx.round(8), gy.round(8)
gc = grangercausalitytests(np.column_stack([gy, gx]), maxlag=3)
# statsmodels drops the first p observations per lag; the tool aligns every lag on max_lag. Compare lag 3 only.
add("granger_causality", {"y": gy.tolist(), "x": gx.tolist(), "max_lag": 3}, {"rows": [[1, None, None], [2, None, None], [3, gc[3][0]["ssr_ftest"][0], gc[3][0]["ssr_ftest"][1]]]}, tol=1e-8)

lm = het_arch(r - r.mean(), nlags=5)
add("arch_effects_test", {"returns": r.tolist(), "lags": 5}, {"lm_stat": lm[0], "p_value": lm[1], "f_stat": lm[2], "f_p_value": lm[3]}, tol=1e-8)

tt = stats.ttest_1samp(sr_r, 0)
L_ = int(4 * (1000 / 100) ** (2 / 9))
nw = OLS(sr_r, np.ones(1000)).fit(cov_type="HAC", cov_kwds={"maxlags": L_})
add("mean_return_test", {"returns": sr_r.tolist()}, {"t_stat": tt.statistic, "p_value": tt.pvalue, "t_stat_newey_west": nw.tvalues[0], "p_value_newey_west": nw.pvalues[0]}, tol=1e-8)

ra = sr_r
rb2 = (0.5 * sr_r + rng.normal(0.0002, 0.008, 1000)).round(10)
s1, s2_ = ra.mean() / ra.std(ddof=1), rb2.mean() / rb2.std(ddof=1)
rho = np.corrcoef(ra, rb2)[0, 1]
thv = (2 - 2 * rho + 0.5 * (s1**2 + s2_**2 - 2 * s1 * s2_ * rho**2)) / 1000
zz = (s1 - s2_) / math.sqrt(thv)
add("compare_sharpe_ratios", {"returns_a": ra.tolist(), "returns_b": rb2.tolist()}, {"z_stat": zz, "p_value": 2 * stats.norm.sf(abs(zz)), "correlation": rho})
wt = stats.ttest_ind(sr_r[:400], rb2[:300], equal_var=False)
add("welch_t_test", {"sample_a": sr_r[:400].tolist(), "sample_b": rb2[:300].tolist()}, {"t_stat": wt.statistic, "p_value": wt.pvalue}, tol=1e-8)

print(json.dumps({"generated_by": "scripts/reference/econometrics.py", "cases": cases}, default=float))
