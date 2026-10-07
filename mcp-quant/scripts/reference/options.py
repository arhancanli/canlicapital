"""Reference values for the options toolset from QuantLib, independent of the server.

    uv run --with QuantLib python scripts/reference/options.py > test/fixtures/options.json

Greeks QuantLib's analytic engine does not report (vanna, volga, charm, speed) come from central
finite differences of QuantLib prices.
"""

import json
import math

import QuantLib as ql

TODAY = ql.Date(15, 1, 2025)
ql.Settings.instance().evaluationDate = TODAY
DC = ql.Actual365Fixed()
cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


def process(S, r, q, v):
    return ql.BlackScholesMertonProcess(
        ql.QuoteHandle(ql.SimpleQuote(S)),
        ql.YieldTermStructureHandle(ql.FlatForward(TODAY, q, DC)),
        ql.YieldTermStructureHandle(ql.FlatForward(TODAY, r, DC)),
        ql.BlackVolTermStructureHandle(ql.BlackConstantVol(TODAY, ql.NullCalendar(), v, DC)),
    )


def option(typ, K, days, payoff=None, american=False):
    t = ql.Option.Call if typ == "call" else ql.Option.Put
    pay = payoff or ql.PlainVanillaPayoff(t, K)
    ex = ql.AmericanExercise(TODAY, TODAY + days) if american else ql.EuropeanExercise(TODAY + days)
    return ql.VanillaOption(pay, ex)


def price(typ, S, K, days, r, q, v):
    o = option(typ, K, days)
    o.setPricingEngine(ql.AnalyticEuropeanEngine(process(S, r, q, v)))
    return o


GRID = [("call", 100, 105, 91, 0.04, 0.01, 0.2), ("put", 100, 105, 91, 0.04, 0.01, 0.2), ("call", 50, 40, 730, 0.05, 0.0, 0.35),
        ("put", 2000, 1900, 30, 0.02, 0.015, 0.15), ("call", 1.1, 1.12, 365, 0.035, 0.025, 0.08), ("put", 80, 60, 3650, 0.03, 0.02, 0.4)]

for typ, S, K, days, r, q, v in GRID:
    T = days / 365
    o = price(typ, S, K, days, r, q, v)
    p = lambda S_=S, v_=v, d_=days: price(typ, S_, K, d_, r, q, v_)
    hS, hv = S * 1e-4, 1e-4
    delta = lambda S_, v_: p(S_, v_).delta()
    vanna = (delta(S, v + hv) - delta(S, v - hv)) / (2 * hv)
    vega = lambda v_: p(S, v_).vega()
    volga = (vega(v + hv) - vega(v - hv)) / (2 * hv)
    gamma = lambda S_: p(S_).gamma()
    speed = (gamma(S + hS) - gamma(S - hS)) / (2 * hS)
    args = {"type": typ, "spot": S, "strike": K, "years": T, "rate": r, "dividend_yield": q, "volatility": v}
    add("black_scholes", args, {"price": o.NPV(), "delta": o.delta(), "gamma": o.gamma(), "vega": o.vega(), "theta": o.theta(), "rho": o.rho()})
    add("black_scholes", args, {"vanna": vanna, "volga": volga, "speed": speed}, tol=1e-5)
    add("implied_volatility", {k: a for k, a in args.items() if k != "volatility"} | {"price": o.NPV()}, {"implied_volatility": v}, tol=1e-8)
    am = option(typ, K, days, american=True)
    # QuantLib's binomial American engine undershoots (below the European price for a call that is
    # never exercised early), so the reference is its finite-difference engine. Its error halves as
    # the grid doubles (first order), so 2 V(8000) - V(4000) extrapolates out the leading term.
    def fd(n):
        am.setPricingEngine(ql.FdBlackScholesVanillaEngine(process(S, r, q, v), n, n))
        return am.NPV()
    add("american_option", args, {"price": 2 * fd(8000) - fd(4000), "european_price": o.NPV()}, tol=1e-5)
    for kind, payoff in (("cash", ql.CashOrNothingPayoff(ql.Option.Call if typ == "call" else ql.Option.Put, K, 1.0)), ("asset", ql.AssetOrNothingPayoff(ql.Option.Call if typ == "call" else ql.Option.Put, K))):
        d = option(typ, K, days, payoff=payoff)
        d.setPricingEngine(ql.AnalyticEuropeanEngine(process(S, r, q, v)))
        add("digital_option", args | {"payout": kind}, {"price": d.NPV(), "delta": d.delta()}, tol=1e-8)
    # Black-76 and Bachelier with QuantLib's closed forms.
    F = S * math.exp((r - q) * T)
    disc = math.exp(-r * T)
    t = ql.Option.Call if typ == "call" else ql.Option.Put
    add("black76", {"type": typ, "forward": F, "strike": K, "years": T, "rate": r, "volatility": v}, {"price": ql.blackFormula(t, K, F, v * math.sqrt(T), disc)})
    nv = v * F
    add("bachelier", {"type": typ, "forward": F, "strike": K, "years": T, "rate": r, "normal_volatility": nv}, {"price": ql.bachelierBlackFormula(t, K, F, nv * math.sqrt(T), disc)})

# Bachelier with a negative forward.
add("bachelier", {"type": "call", "forward": -0.002, "strike": 0.001, "years": 2, "rate": 0.01, "normal_volatility": 0.006},
    {"price": ql.bachelierBlackFormula(ql.Option.Call, 0.001, -0.002, 0.006 * math.sqrt(2), math.exp(-0.02))})
# Hull, Options Futures and Other Derivatives, example 15.6: S=42 K=40 r=10% vol=20% T=0.5: call 4.76, put 0.81.
add("black_scholes", {"type": "call", "spot": 42, "strike": 40, "years": 0.5, "rate": 0.1, "volatility": 0.2}, {"price": 4.759422392871532}, tol=1e-9)
add("black_scholes", {"type": "put", "spot": 42, "strike": 40, "years": 0.5, "rate": 0.1, "volatility": 0.2}, {"price": 0.8085993729000922}, tol=1e-9)
add("put_call_parity", {"call": 4.759422392871532, "put": 0.8085993729000922, "spot": 42, "strike": 40, "years": 0.5, "rate": 0.1}, {"parity_gap": 0.0, "implied_forward": 42 * math.exp(0.05)}, tol=1e-9)
add("option_strategy_payoff", {"legs": [{"type": "call", "strike": 100, "quantity": 1, "premium": 5}, {"type": "call", "strike": 110, "quantity": -1, "premium": 2}]},
    {"net_premium": 3, "breakevens": [103], "max_profit": 7, "max_loss": -3})
add("option_strategy_payoff", {"legs": [{"type": "call", "strike": 100, "quantity": 1, "premium": 4}, {"type": "put", "strike": 100, "quantity": 1, "premium": 3.5}]},
    {"net_premium": 7.5, "breakevens": [92.5, 107.5], "max_loss": -7.5})

print(json.dumps({"generated_by": "scripts/reference/options.py", "cases": cases}))
