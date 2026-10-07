"""Reference values for the performance toolset, computed independently of the server.

numpy, scipy, statsmodels and empyrical-reloaded on fixed-seed series; the server's results must
match within each case's tolerance (test/reference.test.mjs). Regenerate with:

    uv run --with numpy --with scipy --with statsmodels --with empyrical-reloaded --with pytz \
        python scripts/reference/performance.py > test/fixtures/performance.json
"""

import json
import math

import empyrical as ep
import numpy as np
from scipy import stats
from statsmodels.regression.linear_model import OLS
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tools import add_constant
from statsmodels.tsa.stattools import acf

PPY = 252


def series(seed, n, mu, sigma, df=None):
    rng = np.random.default_rng(seed)
    x = rng.standard_t(df, n) * sigma / math.sqrt(df / (df - 2)) if df else rng.normal(0, sigma, n)
    return (x + mu).round(10)


def drawdown(r):
    w = np.cumprod(1 + r)
    peak = np.maximum.accumulate(np.concatenate([[1.0], w]))[1:]
    return w / peak - 1


cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


for seed, (n, mu, sig, df) in enumerate([(756, 0.0005, 0.012, None), (1000, 0.0002, 0.02, 4), (260, -0.0003, 0.008, 6)]):
    r = series(seed, n, mu, sig, df)
    b = (0.6 * r + series(seed + 100, n, 0.0003, 0.01)).round(10)
    R = r.tolist()
    B = b.tolist()
    rf = 0.03
    rfp = (1 + rf) ** (1 / PPY) - 1
    ex = r - rfp

    cagr = np.prod(1 + r) ** (PPY / n) - 1
    mdd = drawdown(r).min()
    add("return_stats", {"returns": R, "risk_free": rf}, {
        "cagr": cagr, "volatility": r.std(ddof=1) * math.sqrt(PPY), "max_drawdown": mdd,
        "sharpe": ex.mean() / ex.std(ddof=1) * math.sqrt(PPY),
        "skew": stats.skew(r), "excess_kurtosis": stats.kurtosis(r),
        "total_return": np.prod(1 + r) - 1, "positive_share": float((r > 0).mean()),
    })
    # empyrical's sharpe uses ddof=1 and arithmetic excess over a per-period rf.
    srp = ex.mean() / ex.std(ddof=1)
    g1, g2 = stats.skew(ex), stats.kurtosis(ex)
    se_me = math.sqrt((1 + 0.5 * srp**2 - g1 * srp + g2 / 4 * srp**2) / n)
    add("sharpe_ratio", {"returns": R, "risk_free": rf}, {
        "sharpe": ep.sharpe_ratio(r, risk_free=rfp, annualization=PPY),
        "se_iid_normal": math.sqrt((1 + 0.5 * srp**2) / n) * math.sqrt(PPY),
        "se_non_normal": se_me * math.sqrt(PPY),
        "p_value_sharpe_le_0": stats.norm.sf(srp / se_me),
    })
    add("sortino_ratio", {"returns": R}, {"sortino": ep.sortino_ratio(r, annualization=PPY), "downside_deviation": ep.downside_risk(r, annualization=PPY)})
    add("calmar_ratio", {"returns": R}, {"calmar": ep.calmar_ratio(r, annualization=PPY), "max_drawdown": ep.max_drawdown(r)})
    add("omega_ratio", {"returns": R, "threshold": 0.05}, {"omega": ep.omega_ratio(r, required_return=0.05, annualization=PPY)})
    add("max_drawdown", {"returns": R}, {"max_drawdown": ep.max_drawdown(r), "current_drawdown": drawdown(r)[-1], "share_of_periods_under_water": float((drawdown(r) < 0).mean())})

    for c in (0.95, 0.99):
        q = np.quantile(r, 1 - c)
        z = stats.norm.ppf(1 - c)
        S, K = stats.skew(r), stats.kurtosis(r)
        zcf = z + (z * z - 1) * S / 6 + (z**3 - 3 * z) * K / 24 - (2 * z**3 - 5 * z) * S * S / 36
        add("value_at_risk", {"returns": R, "confidence": c}, {
            "historical": -q, "gaussian": -(r.mean() + r.std(ddof=1) * z), "cornish_fisher": -(r.mean() + r.std(ddof=1) * zcf),
        })
        add("expected_shortfall", {"returns": R, "confidence": c}, {
            "historical": -r[r <= q].mean(), "gaussian": -(r.mean() - r.std(ddof=1) * stats.norm.pdf(z) / (1 - c)),
        })
    # 10-period VaR from overlapping compounded windows.
    w10 = np.array([np.prod(1 + r[i:i + 10]) - 1 for i in range(n - 9)])
    add("value_at_risk", {"returns": R, "horizon": 10}, {"historical": -np.quantile(w10, 0.05), "gaussian": -(r.mean() * 10 + r.std(ddof=1) * math.sqrt(10) * stats.norm.ppf(0.05))})

    fit = OLS(ex, add_constant(b - rfp)).fit()
    add("capm_regression", {"returns": R, "benchmark": B, "risk_free": rf}, {
        "beta": fit.params[1], "alpha_per_period": fit.params[0], "alpha_annual": fit.params[0] * PPY,
        "t_alpha": fit.tvalues[0], "t_beta": fit.tvalues[1], "p_alpha": fit.pvalues[0], "r_squared": fit.rsquared,
        "correlation": np.corrcoef(r, b)[0, 1], "residual_volatility": math.sqrt(fit.mse_resid) * math.sqrt(PPY),
    }, tol=1e-8)
    act = r - b
    add("information_ratio", {"returns": R, "benchmark": B}, {"tracking_error": act.std(ddof=1) * math.sqrt(PPY), "information_ratio": act.mean() * PPY / (act.std(ddof=1) * math.sqrt(PPY))})
    add("capture_ratios", {"returns": R, "benchmark": B}, {"up_capture": ep.up_capture(r, b), "down_capture": ep.down_capture(r, b)})
    dd = drawdown(r)
    ui = math.sqrt((dd**2).mean())
    add("ulcer_index", {"returns": R}, {"ulcer_index": ui, "martin_ratio": cagr / ui, "pain_index": -dd.mean()})
    add("tail_ratio", {"returns": R}, {"tail_ratio": ep.tail_ratio(r)})
    add("gain_to_pain", {"returns": R}, {"gain_to_pain": r.sum() / -r[r < 0].sum()})
    a10 = acf(r, nlags=10, fft=False)[1:]
    lb = acorr_ljungbox(r, lags=[10], return_df=True)
    add("autocorrelation", {"returns": R, "lags": 10}, {"acf": a10.tolist(), "ljung_box_q": float(lb["lb_stat"].iloc[0]), "p_value": float(lb["lb_pvalue"].iloc[0])})
    jb = stats.jarque_bera(r)
    add("normality_test", {"returns": R}, {"jarque_bera": jb.statistic, "p_value": jb.pvalue})
    add("kelly_fraction", {"returns": R}, {"kelly": r.mean() / r.var(ddof=1)})
    depth = -dd
    dar = np.quantile(depth, 0.95)
    add("drawdown_at_risk", {"returns": R}, {"drawdown_at_risk": dar, "conditional_drawdown_at_risk": depth[depth >= dar].mean()})

    # Monthly series for the Lo (2002) adjustment, by its eq. 17 with 11 lags.
    m = series(seed + 50, 240, 0.006, 0.03)
    em = m
    rho = acf(em, nlags=11, fft=False)[1:]
    srm = em.mean() / em.std(ddof=1)
    eta = 12 / math.sqrt(12 + 2 * sum((12 - k) * rho[k - 1] for k in range(1, 12)))
    add("autocorrelation_adjusted_sharpe", {"returns": m.tolist(), "periods_per_year": 12}, {"sharpe_adjusted": srm * eta, "sharpe_sqrt_time": srm * math.sqrt(12)})

pnl = [120, -50, 30, -80, -20, 200, 0, 45, -10, 60]
add("trade_stats", {"pnl": pnl}, {"win_rate": 0.5, "profit_factor": 455 / 160, "payoff_ratio": (455 / 5) / (160 / 4), "expectancy": 29.5, "longest_loss_streak": 2})
add("kelly_fraction", {"win_probability": 0.55, "payoff": 1.0}, {"kelly": 0.1})
add("return_stats", {"prices": [100, 101, 99.99, 102.5, 101.475]}, {"total_return": 0.01475, "periods": 4})

print(json.dumps({"generated_by": "scripts/reference/performance.py", "cases": cases}, default=float))
