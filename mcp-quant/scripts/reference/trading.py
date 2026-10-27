"""Reference values for the execution, sizing and crypto_fx toolsets, computed independently: closed
forms re-derived here (Almgren-Chriss kappa solved numerically from its defining equation, the
first-passage probability by Monte Carlo-free reflection formula, impermanent loss from simulated
pool reserves), scipy for roots and maximization. Regenerate with:

    uv run --with numpy --with scipy --with statsmodels python scripts/reference/trading.py > test/fixtures/trading.json
"""

import json
import math

import numpy as np
from scipy import stats
from scipy.optimize import brentq, minimize_scalar
from statsmodels.regression.linear_model import OLS

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


# --- execution ---------------------------------------------------------------------------------
# Almgren and Chriss (2000) section 4 example.
X, N, tau, sig, eta, gam, eps, lam = 1e6, 5, 1.0, 0.95, 2.5e-6, 2.5e-7, 0.0625, 2e-6
eta_t = eta * (1 - gam * tau / (2 * eta))
kt2 = lam * sig**2 / eta_t
kappa = brentq(lambda k: 2 * (math.cosh(k * tau) - 1) / tau**2 - kt2, 1e-9, 10, xtol=1e-15)
x = [X * math.sinh(kappa * (N - j) * tau) / math.sinh(kappa * N * tau) for j in range(N + 1)]
n = [x[k] - x[k + 1] for k in range(N)]
cost = 0.5 * gam * X**2 + eps * sum(n) + eta_t / tau * sum(v * v for v in n)
var = sig**2 * tau * sum(v * v for v in x[1:])
add("almgren_chriss_schedule", {"shares": X, "periods": N, "volatility": sig, "temporary_impact": eta, "permanent_impact": gam, "fixed_cost": eps, "risk_aversion": lam}, {"kappa": kappa, "holdings": x, "expected_cost": cost, "cost_variance": var})
add("almgren_chriss_schedule", {"shares": 5000, "periods": 4, "volatility": 0.3, "temporary_impact": 1e-4, "risk_aversion": 0}, {"holdings": [5000, 3750, 2500, 1250, 0], "expected_cost": 1e-4 * 4 * 1250**2})

add("market_impact_estimate", {"order_shares": 50000, "daily_volume": 2e6, "daily_volatility": 0.018, "price": 40, "spread_bps": 4, "coefficient": 0.8}, {"impact_bps": 0.8 * 0.018 * math.sqrt(0.025) * 1e4, "total_cost": (0.8 * 0.018 * math.sqrt(0.025) * 1e4 + 2) / 1e4 * 50000 * 40})

fills = [[100.10, 3000], [100.25, 4000], [100.40, 1000]]
filled = 8000
avg = (100.10 * 3000 + 100.25 * 4000 + 100.40 * 1000) / filled
add("implementation_shortfall", {"side": "buy", "order_shares": 10000, "decision_price": 100.0, "arrival_price": 100.05, "fills": fills, "final_price": 100.8, "fees": 40}, {"average_fill_price": avg, "delay_cost": 0.05 * 8000, "execution_cost": (avg - 100.05) * 8000, "opportunity_cost": 0.8 * 2000, "total_shortfall": 0.05 * 8000 + (avg - 100.05) * 8000 + 1600 + 40})

vol = [100, 300, 200, 50, 350]
add("execution_schedule", {"order_shares": 120, "bucket_volumes": vol}, {"schedule": [120 * v / 1000 for v in vol]})
add("execution_schedule", {"order_shares": 120, "bucket_volumes": vol, "max_participation": 0.1}, {"schedule": [10, 30, 20, 5, 35], "unscheduled_shares": 20})

rng = np.random.default_rng(9)
mid = 50 + np.cumsum(rng.normal(0, 0.05, 2000))
trade = (mid + 0.02 * rng.choice([-1, 1], 2000)).round(6)
dp = np.diff(trade)
cv = np.cov(dp[1:], dp[:-1], ddof=1)[0, 1]
days = 250
hi = np.empty(days); lo = np.empty(days); cl = np.empty(days)
p = 30.0
for d in range(days):
    path = p * np.exp(np.cumsum(rng.normal(0, 0.015 / math.sqrt(390), 390)))
    sp = path * 0.001
    hi[d], lo[d], cl[d] = (path + sp / 2).max(), (path - sp / 2).min(), path[-1]
    p = path[-1]
hi, lo, cl = hi.round(6), lo.round(6), cl.round(6)
k = 3 - 2 * math.sqrt(2)
est = []
for t in range(days - 1):
    b = math.log(hi[t] / lo[t]) ** 2 + math.log(hi[t + 1] / lo[t + 1]) ** 2
    g = math.log(max(hi[t], hi[t + 1]) / min(lo[t], lo[t + 1])) ** 2
    a = (math.sqrt(2 * b) - math.sqrt(b)) / k - math.sqrt(g / k)
    est.append(max(0.0, 2 * (math.exp(a) - 1) / (1 + math.exp(a))))
add("spread_estimators", {"close": trade.tolist()}, {"roll_spread": 2 * math.sqrt(-cv)})
add("spread_estimators", {"close": cl.tolist(), "high": hi.tolist(), "low": lo.tolist()}, {"corwin_schultz_spread_relative": float(np.mean(est))})

r = rng.normal(0, 0.01, 300).round(8)
dv = rng.uniform(1e6, 5e6, 300).round(2)
sv = rng.normal(0, 1000, 300).round(2)
dpk = (2e-5 * sv + rng.normal(0, 0.01, 300)).round(8)
add("liquidity_measures", {"returns": r.tolist(), "dollar_volume": dv.tolist(), "price_changes": dpk.tolist(), "signed_volume": sv.tolist()}, {"amihud_per_million": float(np.mean(np.abs(r) / dv) * 1e6), "kyle_lambda": OLS(dpk, np.column_stack([np.ones(300), sv])).fit().params[1]})

bids = [[99.98, 500], [99.97, 800], [99.95, 1500]]
asks = [[100.01, 300], [100.02, 600], [100.05, 2000]]
mid_ = (99.98 + 100.01) / 2
avgfill = (100.01 * 300 + 100.02 * 600 + 100.05 * 100) / 1000
add("order_book_analysis", {"bids": bids, "asks": asks, "order_size": 1000}, {"mid": mid_, "microprice": (99.98 * 300 + 100.01 * 500) / 800, "depth_imbalance": (2800 - 2900) / 5700, "fill": {"average_price": avgfill, "worst_price": 100.05}, "slippage_bps_vs_mid": (avgfill / mid_ - 1) * 1e4})

# --- sizing ------------------------------------------------------------------------------------
add("position_size_from_stop", {"equity": 100000, "risk_fraction": 0.01, "entry": 50, "stop": 47.5}, {"shares": 400, "notional": 20000, "capital_at_risk": 1000})
add("position_size_from_stop", {"equity": 100000, "risk_fraction": 0.02, "entry": 10, "stop": 9.9, "max_weight": 0.5}, {"shares": 5000, "capped_by_max_weight": True})
add("volatility_target_size", {"asset_volatility": 0.32, "target_volatility": 0.1, "equity": 250000, "price": 80}, {"weight": 0.3125, "shares": math.floor(0.3125 * 250000 / 80)})
tr = [120, -80, 45, -30, 200, -95, 60, 15, -40, 130]
res = minimize_scalar(lambda f: -sum(math.log(1 + f * t / 95) for t in tr), bounds=(0, 0.999999), method="bounded", options={"xatol": 1e-12})
add("optimal_f", {"trades": tr}, {"optimal_f": res.x, "terminal_wealth_relative": math.exp(-res.fun)}, tol=1e-7)
add("trade_expectancy", {"win_rate": 0.45, "average_win": 300, "average_loss": 200, "cost_per_trade": 10}, {"expectancy": 0.45 * 300 - 0.55 * 200 - 10, "break_even_win_rate": 210 / 500})
mu, s, D, T = 0.12, 0.25, 0.3, 2
m = mu - s * s / 2
xx = -math.log(1 - D)
within = stats.norm.cdf((-xx - m * T) / (s * math.sqrt(T))) + math.exp(-2 * m * xx / s**2) * stats.norm.cdf((-xx + m * T) / (s * math.sqrt(T)))
add("drawdown_probability", {"annual_return": mu, "annual_volatility": s, "drawdown": D, "years": T}, {"probability_ever": math.exp(-2 * m * xx / s**2), "probability_within_horizon": within})
add("leverage_and_margin", {"notional": 500000, "equity": 60000, "initial_margin_rate": 0.1, "maintenance_margin_rate": 0.05}, {"leverage": 500000 / 60000, "adverse_move_to_margin_call": (60000 - 25000) / (500000 * 0.95)})
add("var_position_limit", {"var_budget": 10000, "annual_volatility": 0.3, "confidence": 0.99, "days": 10}, {"max_notional": 10000 / (stats.norm.ppf(0.99) * 0.3 * math.sqrt(10 / 252))})

# --- crypto and fx -----------------------------------------------------------------------------
fr = [0.0001, 0.00012, -0.00005, 0.0003, 0.0001]
a = float(np.mean(fr))
add("funding_rate_carry", {"funding_rates": fr, "notional": 1e5, "side": "short", "days": 10}, {"apr": a * 3 * 365, "apy": (1 + a) ** (3 * 365) - 1, "projected_pnl": 1e5 * a * 30})
add("futures_basis", {"spot": 60000, "future": 61500, "days": 90}, {"annualized_simple": (61500 / 60000 - 1) / (90 / 365), "annualized_compounded": (61500 / 60000) ** (365 / 90) - 1})
for side, L, mm in [("long", 10, 0.005), ("short", 25, 0.004)]:
    E = 30000.0
    pl = brentq(lambda p: E / L + (p - E if side == "long" else E - p) - mm * p, 1, 1e6, xtol=1e-12)
    add("liquidation_price", {"entry": E, "leverage": L, "side": side, "maintenance_margin_rate": mm}, {"liquidation_price": pl})
t = 180 / 360
fwd = 1.08 * (1 + 0.052 * t) / (1 + 0.035 * t)
add("fx_forward", {"spot": 1.08, "base_rate": 0.035, "quote_rate": 0.052, "days": 180}, {"forward": fwd, "forward_points_pips": (fwd - 1.08) / 1e-4})
add("fx_forward", {"spot": 1.08, "base_rate": 0.035, "forward": fwd, "days": 180}, {"implied_quote_rate": 0.052})
add("fx_cross_rate", {"leg1": {"bid": 1.0850, "ask": 1.0852}, "leg1_pair": "EURUSD", "leg2": {"bid": 149.50, "ask": 149.53}, "leg2_pair": "USDJPY", "target": "EURJPY"}, {"bid": 1.0850 * 149.50, "ask": 1.0852 * 149.53})
add("fx_cross_rate", {"leg1": {"bid": 1.0850, "ask": 1.0852}, "leg1_pair": "EURUSD", "leg2": {"bid": 1.2700, "ask": 1.2703}, "leg2_pair": "GBPUSD", "target": "EURGBP"}, {"bid": 1.0850 / 1.2703, "ask": 1.0852 / 1.2700})
pairs = [{"pair": "BTC/USDT", "bid": 60000, "ask": 60010}, {"pair": "ETH/BTC", "bid": 0.0505, "ask": 0.0506}, {"pair": "ETH/USDT", "bid": 3060, "ask": 3061}]
f = 0.001
btc_usdt_eth = 60000 * (1 - f) / 3061 * (1 - f) * 0.0505 * (1 - f) - 1
btc_eth_usdt = (1 / 0.0506) * (1 - f) * 3060 * (1 - f) / 60010 * (1 - f) - 1
add("triangular_arbitrage", {"pairs": pairs, "fee_rate": f}, {"cycles": [{"return": btc_usdt_eth}, {"return": btc_eth_usdt}], "arbitrage": max(btc_usdt_eth, btc_eth_usdt) > 0})
add("pip_value", {"price": 1.27, "units": 100000, "quote_to_account": 1.0, "risk_amount": 500, "stop_pips": 25}, {"pip_value": 10.0, "units_for_risk": 500 / (25 * 1e-4)})
add("carry_trade_return", {"funding_rate": 0.001, "investment_rate": 0.05, "spot_start": 150, "spot_end": 147, "days": 365}, {"total_return": 1.05 * 147 / 150 - 1.001, "break_even_fx_move": 1.001 / 1.05 - 1})

# Impermanent loss from pool reserves: constant product x*y = k, arbitraged to the new price.
for kk in (0.5, 1.5, 3.0):
    x0, y0 = 1.0, 1.0
    x1, y1 = 1 / math.sqrt(kk), math.sqrt(kk)
    add("impermanent_loss", {"price_ratio": kk}, {"impermanent_loss": (x1 * kk + y1) / (x0 * kk + y0) - 1})
# Concentrated range [0.8, 1.25]: amounts from Uniswap v3 liquidity math with L chosen so value at entry is 1.
pa, pb = 0.8, 1.25
for kk in (0.9, 1.1, 1.6):
    sa, sb = math.sqrt(pa), math.sqrt(pb)
    L = 1 / ((1 - 1 / sb) + (1 - sa))
    x0, y0 = L * (1 - 1 / sb), L * (1 - sa)
    sp = math.sqrt(min(max(kk, pa), pb))
    x1, y1 = L * (1 / sp - 1 / sb), L * (sp - sa)
    add("impermanent_loss", {"price_ratio": kk, "range_lower": pa, "range_upper": pb}, {"impermanent_loss": (x1 * kk + y1) / (x0 * kk + y0) - 1})

print(json.dumps({"generated_by": "scripts/reference/trading.py", "cases": cases}, default=float))
