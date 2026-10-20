"""Reference values for the tvm and valuation toolsets, computed independently of the server.

numpy-financial for the spreadsheet functions, scipy for roots, and the published formulas written
out separately for the scores. Regenerate with:

    uv run --with numpy-financial --with scipy python scripts/reference/corporate.py > test/fixtures/corporate.json
"""

import json
import math
from datetime import date

import numpy as np
import numpy_financial as npf
from scipy.optimize import brentq

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


# --- tvm ---------------------------------------------------------------------------------------
for r, cf in [(0.08, [-1000, 300, 400, 500, 200]), (0.12, [-50000, 8000, 12000, 15000, 18000, 21000, 9000]), (0.03, [-200, 20, 20, 20, 220])]:
    add("net_present_value", {"rate": r, "cashflows": cf}, {"npv": npf.npv(r, cf), "irr": npf.irr(cf), "profitability_index": npf.npv(r, [0] + cf[1:]) / -cf[0]})
    add("internal_rate_of_return", {"cashflows": cf}, {"irr": npf.irr(cf), "sign_changes": 1})
    add("modified_irr", {"cashflows": cf, "finance_rate": 0.07, "reinvest_rate": 0.1}, {"mirr": npf.mirr(cf, 0.07, 0.1)})
    n = len(cf) - 1
    add("equivalent_annual_annuity", {"rate": r, "cashflows": cf}, {"equivalent_annual_annuity": npf.pmt(r, n, -npf.npv(r, cf))})

dates = ["2024-01-15", "2024-06-30", "2025-02-01", "2025-11-20", "2026-08-01"]
amts = [-10000, 2000, 3500, 4000, 3200]
d0 = date.fromisoformat(dates[0])
ts = [(date.fromisoformat(d) - d0).days / 365 for d in dates]
xnpv = lambda r: sum(a / (1 + r) ** t for a, t in zip(amts, ts))
add("xnpv_xirr", {"cashflows": amts, "dates": dates, "rate": 0.09}, {"xnpv": xnpv(0.09), "xirr": brentq(xnpv, -0.9, 5, xtol=1e-15)})

for args in [
    {"rate": 0.065 / 12, "nper": 360, "pv": 300000, "fv": 0},
    {"rate": 0.05, "nper": 20, "pmt": -1000, "pv": 0, "when": "begin"},
    {"rate": 0.004, "pmt": -1500, "pv": 0, "fv": 250000},
    {"nper": 60, "pmt": -450, "pv": 22000, "fv": 0},
    {"rate": 0.07, "nper": 15, "pmt": -2000, "fv": 80000},
]:
    w = args.get("when", "end")
    r, n, pmt, pv, fv = (args.get(k) for k in ("rate", "nper", "pmt", "pv", "fv"))
    if pmt is None:
        exp = {"pmt": npf.pmt(r, n, pv, fv, w)}
    elif n is None:
        exp = {"nper": npf.nper(r, pmt, pv, fv, w)}
    elif r is None:
        exp = {"rate": npf.rate(n, pmt, pv, fv, w, tol=1e-14, maxiter=1000)}
    elif pv is None:
        exp = {"pv": npf.pv(r, n, pmt, fv, w)}
    else:
        exp = {"fv": npf.fv(r, n, pmt, pv, w)}
    add("time_value_solver", args, exp, tol=1e-8)

P, ar, yrs = 250000, 0.06, 30
pay = -npf.pmt(ar / 12, 360, P)
sched = [[k, pay, -npf.ipmt(ar / 12, k, 360, P), -npf.ppmt(ar / 12, k, 360, P)] for k in range(1, 13)]
bal = P
for row in sched:
    bal -= row[3]
    row.append(bal)
total_int = sum(-npf.ipmt(ar / 12, k, 360, P) for k in range(1, 361))
add("amortization_schedule", {"principal": P, "annual_rate": ar, "years": yrs}, {"payment": pay, "total_interest": total_int}, tol=1e-8)
pay1 = -npf.pmt(ar / 12, 12, 12000)
rows1 = []
bal = 12000
for k in range(1, 13):
    i, p_ = -npf.ipmt(ar / 12, k, 12, 12000), -npf.ppmt(ar / 12, k, 12, 12000)
    bal -= p_
    rows1.append([k, pay1, i, p_, max(0.0, bal)])
add("amortization_schedule", {"principal": 12000, "annual_rate": ar, "years": 1}, {"rows": rows1}, tol=1e-7)

for x, m in [(0.06, 12), (0.05, "continuous"), (0.08, 4)]:
    ear = math.exp(x) - 1 if m == "continuous" else (1 + x / m) ** m - 1
    add("rate_conversion", {"rate": x, "from": m, "inflation": 0.03}, {"effective_annual": ear, "continuous": math.log(1 + ear), "nominal_compounded_12": 12 * ((1 + ear) ** (1 / 12) - 1), "real_rate_exact": (1 + ear) / 1.03 - 1})

for c, r, g, n in [(1000, 0.08, 0.03, 20), (500, 0.06, 0.06, 10), (1200, 0.1, 0.02, None)]:
    if n is None:
        add("growing_annuity", {"payment": c, "rate": r, "growth": g}, {"present_value": c / (r - g)})
    else:
        pv = sum(c * (1 + g) ** (t - 1) / (1 + r) ** t for t in range(1, n + 1))
        add("growing_annuity", {"payment": c, "rate": r, "growth": g, "periods": n}, {"present_value": pv, "future_value": pv * (1 + r) ** n})

cf = [-1000, 300, 400, 500, 200]
disc = [c / 1.1**t for t, c in enumerate(cf)]
cum = np.cumsum(disc)
add("payback_period", {"cashflows": cf, "rate": 0.1}, {"payback": 2 + 300 / 500, "discounted_payback": 3 + -cum[3] / disc[4]})

add("wacc", {"equity_value": 600, "debt_value": 400, "beta": 1.2, "risk_free": 0.04, "market_premium": 0.055, "cost_of_debt": 0.06, "tax_rate": 0.25}, {"wacc": 0.6 * (0.04 + 1.2 * 0.055) + 0.4 * 0.06 * 0.75, "cost_of_equity": 0.106})
add("wacc", {"equity_value": 5000, "debt_value": 1500, "preferred_value": 500, "cost_of_equity": 0.11, "cost_of_debt": 0.055, "cost_of_preferred": 0.07, "tax_rate": 0.21}, {"wacc": (5000 * 0.11 + 1500 * 0.055 * 0.79 + 500 * 0.07) / 7000})
ba = 1.3 / (1 + 0.75 * 0.5)
add("levered_beta", {"beta": 1.3, "debt_to_equity": 0.5, "tax_rate": 0.25, "target_debt_to_equity": 1.0}, {"asset_beta": ba, "relevered_beta": ba * (1 + 0.75)})
add("break_even", {"price": 50, "variable_cost": 30, "fixed_costs": 100000, "units": 8000}, {"break_even_units": 5000, "break_even_revenue": 250000, "margin_of_safety": 3000 / 8000, "operating_leverage": 160000 / 60000})

# --- valuation ---------------------------------------------------------------------------------
f = [100, 110, 120, 130, 140]
r, g = 0.09, 0.025
pv = sum(c / (1 + r) ** (t + 1) for t, c in enumerate(f))
tv = 140 * (1 + g) / (r - g)
ev = pv + tv / (1 + r) ** 5
add("dcf_valuation", {"free_cash_flows": f, "discount_rate": r, "terminal_growth": g, "net_debt": 300, "shares": 50}, {"enterprise_value": ev, "equity_value": ev - 300, "per_share": (ev - 300) / 50})
pvm = sum(c / (1 + r) ** (t + 0.5) for t, c in enumerate(f))
add("dcf_valuation", {"free_cash_flows": f, "discount_rate": r, "terminal_multiple": 12, "terminal_metric": 210, "mid_year": True}, {"enterprise_value": pvm + 12 * 210 / (1 + r) ** 5})


def ev_growth(gg, base=80, n=10, rr=0.09, tg=0.025):
    fl = [base * (1 + gg) ** (t + 1) for t in range(n)]
    return sum(c / (1 + rr) ** (t + 1) for t, c in enumerate(fl)) + fl[-1] * (1 + tg) / (rr - tg) / (1 + rr) ** n


target = 40 * 100 + 500
add("reverse_dcf", {"price": 40, "shares": 100, "net_debt": 500, "base_free_cash_flow": 80, "discount_rate": 0.09, "terminal_growth": 0.025}, {"implied_growth": brentq(lambda x: ev_growth(x) - target, -0.5, 1, xtol=1e-15)}, tol=1e-8)

add("dividend_discount_model", {"model": "gordon", "dividend": 2, "required_return": 0.08, "growth": 0.03, "price": 45}, {"value": 2.06 / 0.05, "implied_required_return": 2.06 / 45 + 0.03})
pv2 = sum(2 * 1.12**t / 1.09**t for t in range(1, 6))
add("dividend_discount_model", {"model": "two_stage", "dividend": 2, "required_return": 0.09, "growth": 0.03, "high_growth": 0.12, "years": 5}, {"value": pv2 + 2 * 1.12**5 * 1.03 / 0.06 / 1.09**5})
add("dividend_discount_model", {"model": "h_model", "dividend": 2, "required_return": 0.09, "growth": 0.03, "high_growth": 0.12, "years": 4}, {"value": 2 * (1.03 + 4 * 0.09) / 0.06})

b0, e, d, ke = 1000, [150, 160, 170], [50, 55, 60], 0.1
b, pvri, ri = b0, 0, 0
for t, (x, y) in enumerate(zip(e, d)):
    ri = x - ke * b
    pvri += ri / (1 + ke) ** (t + 1)
    b += x - y
add("residual_income_valuation", {"book_value": b0, "earnings": e, "dividends": d, "cost_of_equity": ke, "terminal_growth": 0.02}, {"value": b0 + pvri + ri * 1.02 / 0.08 / 1.1**3})

add("enterprise_value_multiples", {"market_cap": 1000, "total_debt": 300, "cash": 100, "minority_interest": 20, "ebitda": 150, "net_income": 60, "free_cash_flow": 50}, {"enterprise_value": 1220, "ev_to_ebitda": 1220 / 150, "price_to_earnings": 1000 / 60, "fcf_yield": 0.05})

wc, re_, ebit, mve, tl, s, ta = 120, 300, 90, 800, 500, 1100, 1000
add("altman_z_score", {"working_capital": wc, "retained_earnings": re_, "ebit": ebit, "equity_value": mve, "total_liabilities": tl, "revenue": s, "total_assets": ta}, {"z_score": 1.2 * 0.12 + 1.4 * 0.3 + 3.3 * 0.09 + 0.6 * 1.6 + 1.1, "zone": "grey"})
add("altman_z_score", {"variant": "non_manufacturing", "working_capital": wc, "retained_earnings": re_, "ebit": ebit, "equity_value": 500, "total_liabilities": tl, "revenue": s, "total_assets": ta}, {"z_score": 6.56 * 0.12 + 3.26 * 0.3 + 6.72 * 0.09 + 1.05 * 1.0, "zone": "safe"})

cur = {"net_income": 120, "operating_cash_flow": 150, "total_assets": 1000, "long_term_debt": 200, "current_assets": 400, "current_liabilities": 200, "shares_outstanding": 100, "revenue": 900, "gross_profit": 360}
pri = {"net_income": 100, "operating_cash_flow": 90, "total_assets": 950, "long_term_debt": 220, "current_assets": 350, "current_liabilities": 200, "shares_outstanding": 102, "revenue": 820, "gross_profit": 320}
add("piotroski_f_score", {"current": cur, "prior": pri}, {"f_score": 9})

bc = {"receivables": 150, "revenue": 1200, "cost_of_goods_sold": 700, "current_assets": 500, "ppe": 400, "total_assets": 1100, "depreciation": 50, "sga": 180, "current_liabilities": 250, "long_term_debt": 300, "net_income": 110, "operating_cash_flow": 60}
bp = {"receivables": 100, "revenue": 1000, "cost_of_goods_sold": 560, "current_assets": 450, "ppe": 380, "total_assets": 950, "depreciation": 48, "sga": 160, "current_liabilities": 220, "long_term_debt": 280, "net_income": 95, "operating_cash_flow": 90}
dsri = (150 / 1200) / (100 / 1000)
gmi = (440 / 1000) / (500 / 1200)
aqi = (1 - 900 / 1100) / (1 - 830 / 950)
sgi = 1.2
depi = (48 / 428) / (50 / 450)
sgai = (180 / 1200) / (160 / 1000)
lvgi = (550 / 1100) / (500 / 950)
tata = 50 / 1100
m = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi
add("beneish_m_score", {"current": bc, "prior": bp}, {"m_score": m, "indexes": {"dsri": dsri, "gmi": gmi, "aqi": aqi, "depi": depi, "lvgi": lvgi, "tata": tata}})

add("dupont_analysis", {"net_income": 80, "revenue": 1000, "total_assets": 800, "equity": 400, "pretax_income": 105, "ebit": 125}, {"roe": 0.2, "net_margin": 0.08, "asset_turnover": 1.25, "equity_multiplier": 2, "tax_burden": 80 / 105, "interest_burden": 105 / 125, "operating_margin": 0.125})
add("graham_valuation", {"eps": 5, "book_value_per_share": 30, "growth_percent": 7, "aaa_yield_percent": 5.2, "price": 60}, {"graham_number": math.sqrt(22.5 * 150), "growth_formula_value": 5 * 22.5 * 4.4 / 5.2})

print(json.dumps({"generated_by": "scripts/reference/corporate.py", "cases": cases}, default=float))
