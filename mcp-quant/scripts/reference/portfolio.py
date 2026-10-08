"""Reference values for the portfolio toolset, computed independently of the server.

Closed forms in numpy, long-only problems by scipy SLSQP (looser tolerance), risk parity by cyclical
coordinate descent, HRP from the paper's code with scipy linkage, Ledoit-Wolf from scikit-learn and
Black-Litterman in its precision form. Regenerate with:

    uv run --with numpy --with scipy --with scikit-learn python scripts/reference/portfolio.py > test/fixtures/portfolio.json
"""

import json

import numpy as np
import scipy.cluster.hierarchy as sch
from scipy import stats
from scipy.optimize import minimize
from sklearn.covariance import ledoit_wolf

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


rng = np.random.default_rng(11)
T, N = 500, 6
f = rng.normal(0.0004, 0.01, T)
B = np.array([0.6, 0.9, 1.1, 0.4, 1.3, 0.2])
R = (np.outer(f, B) + rng.normal(0, 1, (T, N)) * np.array([0.008, 0.01, 0.012, 0.006, 0.015, 0.005]) + np.array([0.0002, 0.0001, 0.0004, 0.0001, 0.0006, 0.00005])).round(10)
RL = R.tolist()
C = np.cov(R.T, ddof=1) * 252
mu = R.mean(0) * 252
names = [f"asset_{i + 1}" for i in range(N)]
lab = lambda w: dict(zip(names, map(float, w)))
ones = np.ones(N)

w = np.array([0.25, 0.15, 0.2, 0.1, 0.2, 0.1])
vol = np.sqrt(w @ C @ w)
rc = w * (C @ w) / vol
bw = np.full(N, 1 / N)
add("portfolio_risk", {"returns": RL, "weights": w.tolist(), "benchmark_weights": bw.tolist()}, {"volatility": vol, "expected_return": w @ mu, "risk_contribution_percent": lab(rc / vol), "diversification_ratio": w @ np.sqrt(np.diag(C)) / vol, "effective_number_of_assets": 1 / (w @ w), "tracking_error": np.sqrt((w - bw) @ C @ (w - bw)), "annual_var_parametric": -stats.norm.ppf(0.05) * vol - w @ mu})

x = np.linalg.solve(C, ones)
add("min_variance_portfolio", {"returns": RL, "long_only": False}, {"weights": lab(x / x.sum())})


def slsqp(obj, cons, bounds, x0):
    res = minimize(obj, x0, method="SLSQP", constraints=cons, bounds=bounds, options={"ftol": 1e-16, "maxiter": 2000})
    return res.x


cons_sum = [{"type": "eq", "fun": lambda w: w.sum() - 1}]
wmv = slsqp(lambda w: w @ C @ w, cons_sum, [(0, None)] * N, ones / N)
add("min_variance_portfolio", {"returns": RL}, {"weights": lab(wmv), "volatility": np.sqrt(wmv @ C @ wmv)}, tol=2e-5)
wcap = slsqp(lambda w: w @ C @ w, cons_sum, [(0, 0.25)] * N, ones / N)
add("min_variance_portfolio", {"returns": RL, "max_weight": 0.25}, {"volatility": np.sqrt(wcap @ C @ wcap)}, tol=1e-7)

rf = 0.02
xt = np.linalg.solve(C, mu - rf)
wt = xt / xt.sum()
add("max_sharpe_portfolio", {"returns": RL, "risk_free": rf, "long_only": False}, {"weights": lab(wt), "sharpe": (wt @ mu - rf) / np.sqrt(wt @ C @ wt)})
wsl = slsqp(lambda w: -(w @ mu - rf) / np.sqrt(w @ C @ w), cons_sum, [(0, None)] * N, ones / N)
add("max_sharpe_portfolio", {"returns": RL, "risk_free": rf}, {"sharpe": (wsl @ mu - rf) / np.sqrt(wsl @ C @ wsl)}, tol=1e-8)

target = float(np.percentile(mu, 60))
Ci = np.linalg.inv(C)
A_, B_, Cc = ones @ Ci @ ones, ones @ Ci @ mu, mu @ Ci @ mu
D = A_ * Cc - B_**2
wtg = ((Cc - B_ * target) * (Ci @ ones) + (A_ * target - B_) * (Ci @ mu)) / D
add("mean_variance_portfolio", {"returns": RL, "target_return": target, "long_only": False}, {"weights": lab(wtg), "expected_return": target})
wlt = slsqp(lambda w: w @ C @ w, cons_sum + [{"type": "eq", "fun": lambda w: w @ mu - target}], [(0, None)] * N, ones / N)
add("mean_variance_portfolio", {"returns": RL, "target_return": target}, {"volatility": np.sqrt(wlt @ C @ wlt), "expected_return": target}, tol=1e-7)
lam = 4.0
wra = slsqp(lambda w: lam / 2 * w @ C @ w - w @ mu, cons_sum, [(0, None)] * N, ones / N)
add("mean_variance_portfolio", {"returns": RL, "risk_aversion": lam}, {"volatility": np.sqrt(wra @ C @ wra), "expected_return": wra @ mu}, tol=1e-6)

# Risk parity by cyclical coordinate descent (Griveau-Billion, Richard and Roncalli 2013).
def erc(C, b):
    x = 1 / np.sqrt(np.diag(C))
    for _ in range(20000):
        old = x.copy()
        for i in range(len(b)):
            s = C[i] @ x - C[i, i] * x[i]
            x[i] = (-s + np.sqrt(s * s + 4 * C[i, i] * b[i])) / (2 * C[i, i])
        if np.max(np.abs(x - old)) < 1e-17:
            break
    return x / x.sum()


add("risk_parity_portfolio", {"returns": RL}, {"weights": lab(erc(C, ones / N))}, tol=1e-8)
bud = np.array([0.3, 0.2, 0.1, 0.2, 0.1, 0.1])
add("risk_parity_portfolio", {"covariance": C.tolist(), "risk_budgets": bud.tolist()}, {"weights": lab(erc(C, bud))}, tol=1e-8)
iv = 1 / np.sqrt(np.diag(C))
add("inverse_volatility_weights", {"returns": RL}, {"weights": lab(iv / iv.sum())})

# HRP, following López de Prado (2016).
corr = np.corrcoef(R.T)
dist = np.sqrt((1 - corr) / 2)
link = sch.linkage(dist, "single")


def quasi_diag(link):
    link = link.astype(int)
    order = [link[-1, 0], link[-1, 1]]
    n = link[-1, 3]
    while max(order) >= n:
        out = []
        for v in order:
            out.extend(link[v - n, :2].tolist() if v >= n else [v])
        order = out
    return order


def cvar(items):
    sub = C[np.ix_(items, items)]
    ivp = 1 / np.diag(sub)
    ivp /= ivp.sum()
    return ivp @ sub @ ivp


order = quasi_diag(link)
wh = np.ones(N)
groups = [order]
while groups:
    groups = [g[j:k] for g in groups for j, k in ((0, len(g) // 2), (len(g) // 2, len(g))) if len(g) > 1]
    for i in range(0, len(groups), 2):
        v0, v1 = cvar(groups[i]), cvar(groups[i + 1])
        a = 1 - v0 / (v0 + v1)
        wh[groups[i]] *= a
        wh[groups[i + 1]] *= 1 - a
add("hierarchical_risk_parity", {"returns": RL}, {"weights": lab(wh), "cluster_order": [names[i] for i in order]})

r0 = B_ / A_
pts = np.linspace(r0, r0 + 2 * (mu.max() - r0), 5)
add("efficient_frontier", {"returns": RL, "points": 5, "long_only": False}, {"rows": [[float(r), float(np.sqrt((A_ * r * r - 2 * B_ * r + Cc) / D))] for r in pts]}, tol=1e-8)

# Black-Litterman, precision form.
Cs = C[:4, :4]
mw = np.array([0.4, 0.3, 0.2, 0.1])
delta, tau = 2.5, 0.05
pi = delta * Cs @ mw
P = np.array([[1, -1, 0, 0], [0, 0, 1, 0]], float)
Q = np.array([0.02, 0.08])
Om = np.diag([tau * P[0] @ Cs @ P[0], 0.001])
post = np.linalg.inv(np.linalg.inv(tau * Cs) + P.T @ np.linalg.inv(Om) @ P) @ (np.linalg.inv(tau * Cs) @ pi + P.T @ np.linalg.inv(Om) @ Q)
n4 = names[:4]
add("black_litterman", {"covariance": Cs.tolist(), "market_weights": mw.tolist(), "views": [{"weights": P[0].tolist(), "expected_return": 0.02}, {"weights": P[1].tolist(), "expected_return": 0.08, "variance": 0.001}]}, {"equilibrium_returns": dict(zip(n4, pi)), "posterior_returns": dict(zip(n4, post)), "optimal_weights": dict(zip(n4, np.linalg.solve(Cs, post) / delta))}, tol=1e-8)

lw, shrink = ledoit_wolf(R)
add("covariance_shrinkage", {"returns": RL}, {"shrinkage": shrink, "covariance_per_period": lw.tolist()}, tol=1e-8)
sp = stats.spearmanr(R).correlation
add("correlation_matrix", {"returns": RL}, {"matrix": corr.tolist(), "average_pairwise": corr[np.triu_indices(N, 1)].mean()})
add("correlation_matrix", {"returns": RL, "method": "spearman"}, {"matrix": sp.tolist()})

hold, px, tw = [100, 50, 0], [20.0, 80.0, 10.0], [0.4, 0.4, 0.2]
nav = 100 * 20 + 50 * 80 + 1000
add("rebalance_trades", {"holdings": hold, "prices": px, "target_weights": tw, "cash": 1000, "whole_shares": False}, {"nav": nav, "rows": [["asset_1", 2000 / nav, 0.4, (0.4 * nav - 2000) / 20, 0.4 * nav - 2000], ["asset_2", 4000 / nav, 0.4, (0.4 * nav - 4000) / 80, 0.4 * nav - 4000], ["asset_3", 0, 0.2, 0.2 * nav / 10, 0.2 * nav]]})
kw = np.linalg.solve(C, mu - 0.01) * 0.5
add("kelly_portfolio", {"returns": RL, "risk_free": 0.01, "fraction": 0.5}, {"weights": lab(kw), "expected_growth": 0.01 + kw @ (mu - 0.01) - 0.5 * kw @ C @ kw})

print(json.dumps({"generated_by": "scripts/reference/portfolio.py", "cases": cases}, default=float))
