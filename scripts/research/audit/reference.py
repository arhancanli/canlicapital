"""Independent reference values for js/audit-core.js, computed with statsmodels and numpy rather
than transcribed from the JavaScript.

- Newey-West t of each series' mean: statsmodels OLS on a constant, HAC covariance, Bartlett
  kernel, maxlags floor(4 (T/100)^(2/9)), no small-sample correction.
- Effective number of trials from the variants' correlation matrix (numpy eigvalsh):
  Nyholt (2004) 1 + (k - 1)(1 - var(lambda) / k) with var ddof=1, and Li and Ji (2005)
  sum(I(|lambda| >= 1) + |lambda| - floor(|lambda|)).
- The cross-trial standard deviation of the annualized Sharpe ratios (ddof 1 throughout).
Usage: python reference.py <input.json>  (written by build-reference.mjs); prints JSON.
"""
import json
import math
import sys

import numpy as np
import statsmodels
import statsmodels.api as sm


def newey_west_t(x):
    x = np.asarray(x, dtype=float)
    lag = int(math.floor(4 * (len(x) / 100) ** (2 / 9)))
    fit = sm.OLS(x, np.ones(len(x))).fit(cov_type="HAC", cov_kwds={"maxlags": lag, "kernel": "bartlett", "use_correction": False})
    return float(fit.tvalues[0]), lag


def search(m, ppy):
    m = np.asarray(m, dtype=float)
    sd = m.std(axis=0, ddof=1)
    sharpes = m.mean(axis=0) / sd * math.sqrt(ppy)
    r = np.corrcoef(m, rowvar=False)
    lam = np.linalg.eigvalsh(r)
    k = len(lam)
    nyholt = 1 + (k - 1) * (1 - lam.var(ddof=1) / k)
    a = np.abs(lam)
    li_ji = float(np.sum((a >= 1).astype(float) + a - np.floor(a)))
    upper = r[np.triu_indices(k, 1)]
    return {
        "cross_trial_sharpe_sd_annualized": float(sharpes.std(ddof=1)),
        "nyholt": float(nyholt),
        "li_ji": li_ji,
        "mean_pairwise_correlation": float(upper.mean()),
        "sd_pairwise_correlation": float(upper.std(ddof=1)),
    }


def main():
    data = json.load(open(sys.argv[1]))
    ppy = data["periods_per_year"]
    out = {
        "schema": "canli.audit-core.reference.v1",
        "computed_with": {"numpy": np.__version__, "statsmodels": statsmodels.__version__, "python": sys.version.split()[0]},
        "newey_west_t": {name: dict(zip(("t", "lag"), newey_west_t(x))) for name, x in data["series"].items()},
        "search": {name: search(m, ppy) for name, m in data["variants"].items()},
    }
    print(json.dumps(out, indent=1, sort_keys=True))


main()
