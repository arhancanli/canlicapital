"""Reference values for the exotics toolset from QuantLib's engines (AnalyticBarrierEngine,
AnalyticContinuousGeometricAveragePriceAsianEngine, AnalyticHestonEngine, sabrVolatility, KirkEngine,
AnalyticEuropeanMargrabeEngine, AnalyticContinuousFloatingLookbackEngine, AnalyticSimpleChooserEngine,
and a Poisson sum over its Black-Scholes engine for Merton jumps). Regenerate with:

    uv run --with QuantLib python scripts/reference/exotics.py > test/fixtures/exotics.json
"""

import json

import QuantLib as ql

cases = []


def add(tool, args, expect, tol=1e-9):
    cases.append({"tool": tool, "args": args, "expect": expect, "tol": tol})


today = ql.Date(15, 3, 2026)
ql.Settings.instance().evaluationDate = today
dc = ql.Actual365Fixed()


def T_date(t):
    return today + int(round(t * 365))


def flat(r):
    return ql.YieldTermStructureHandle(ql.FlatForward(today, r, dc))


def bsp(s, r, q, v):
    return ql.BlackScholesMertonProcess(ql.QuoteHandle(ql.SimpleQuote(s)), flat(q), flat(r), ql.BlackVolTermStructureHandle(ql.BlackConstantVol(today, ql.NullCalendar(), v, dc)))


OPT = {"call": ql.Option.Call, "put": ql.Option.Put}
BT = {"down_in": ql.Barrier.DownIn, "down_out": ql.Barrier.DownOut, "up_in": ql.Barrier.UpIn, "up_out": ql.Barrier.UpOut}

t = 0.5  # 182.5 days -> use exact day count below
for bt, typ, s, k, h, reb in [("down_out", "call", 100, 100, 90, 0), ("down_in", "call", 100, 95, 90, 0), ("down_in", "call", 100, 85, 90, 2),
                              ("up_out", "call", 100, 100, 120, 0), ("up_in", "call", 100, 110, 120, 1), ("up_in", "call", 100, 125, 120, 0),
                              ("down_out", "put", 100, 100, 85, 3), ("down_out", "put", 100, 80, 85, 0), ("down_in", "put", 100, 95, 85, 0),
                              ("up_out", "put", 100, 105, 115, 0), ("up_out", "put", 100, 120, 115, 0), ("up_in", "put", 100, 110, 115, 0)]:
    ex = ql.EuropeanExercise(T_date(t))
    tt = dc.yearFraction(today, T_date(t))
    opt = ql.BarrierOption(BT[bt], h, reb, ql.PlainVanillaPayoff(OPT[typ], k), ex)
    opt.setPricingEngine(ql.AnalyticBarrierEngine(bsp(s, 0.05, 0.02, 0.25)))
    add("barrier_option", {"type": typ, "barrier_type": bt, "spot": s, "strike": k, "barrier": h, "rebate": reb, "years": tt, "rate": 0.05, "dividend_yield": 0.02, "volatility": 0.25}, {"price": opt.NPV()}, tol=1e-8)

for typ, k in [("call", 95), ("put", 105)]:
    ex = ql.EuropeanExercise(T_date(1.0))
    tt = dc.yearFraction(today, T_date(1.0))
    opt = ql.ContinuousAveragingAsianOption(ql.Average.Geometric, ql.PlainVanillaPayoff(OPT[typ], k), ex)
    opt.setPricingEngine(ql.AnalyticContinuousGeometricAveragePriceAsianEngine(bsp(100, 0.04, 0.01, 0.3)))
    add("asian_option_geometric", {"type": typ, "spot": 100, "strike": k, "years": tt, "rate": 0.04, "dividend_yield": 0.01, "volatility": 0.3}, {"price": opt.NPV()})

for typ, k, (v0, kap, th, sg, rho) in [("call", 100, (0.04, 1.5, 0.04, 0.5, -0.7)), ("put", 90, (0.06, 2.0, 0.05, 0.8, -0.5)), ("call", 120, (0.02, 0.8, 0.06, 0.3, 0.2))]:
    ex = ql.EuropeanExercise(T_date(1.0))
    tt = dc.yearFraction(today, T_date(1.0))
    proc = ql.HestonProcess(flat(0.03), flat(0.01), ql.QuoteHandle(ql.SimpleQuote(100)), v0, kap, th, sg, rho)
    opt = ql.VanillaOption(ql.PlainVanillaPayoff(OPT[typ], k), ex)
    opt.setPricingEngine(ql.AnalyticHestonEngine(ql.HestonModel(proc), 1e-14, 100000))
    add("heston_option", {"type": typ, "spot": 100, "strike": k, "years": tt, "rate": 0.03, "dividend_yield": 0.01, "v0": v0, "kappa": kap, "theta": th, "sigma": sg, "rho": rho}, {"price": opt.NPV()}, tol=1e-7)

strikes = [0.02, 0.025, 0.03, 0.035, 0.045]
add("sabr_volatility", {"forward": 0.03, "strikes": strikes, "years": 2, "alpha": 0.035, "beta": 0.5, "nu": 0.4, "rho": -0.3}, {"rows": [[k, ql.sabrVolatility(k, 0.03, 2, 0.035, 0.5, 0.4, -0.3)] for k in strikes]})
add("sabr_volatility", {"forward": 100, "strikes": [80, 100, 120], "years": 0.5, "alpha": 0.2, "beta": 1, "nu": 0.6, "rho": -0.5}, {"rows": [[k, ql.sabrVolatility(k, 100, 0.5, 0.2, 1, 0.6, -0.5)] for k in (80, 100, 120)]})


def black_proc(f, r, v):
    return ql.BlackProcess(ql.QuoteHandle(ql.SimpleQuote(f)), flat(r), ql.BlackVolTermStructureHandle(ql.BlackConstantVol(today, ql.NullCalendar(), v, dc)))


for typ, k in [("call", 3.0), ("put", 5.0)]:
    ex = ql.EuropeanExercise(T_date(0.75))
    tt = dc.yearFraction(today, T_date(0.75))
    opt = ql.BasketOption(ql.SpreadBasketPayoff(ql.PlainVanillaPayoff(OPT[typ], k)), ex)
    opt.setPricingEngine(ql.KirkEngine(black_proc(110, 0.04, 0.3), black_proc(100, 0.04, 0.25), 0.6))
    add("spread_option", {"type": typ, "forward1": 110, "forward2": 100, "strike": k, "years": tt, "rate": 0.04, "volatility1": 0.3, "volatility2": 0.25, "correlation": 0.6}, {"price": opt.NPV()})

ex = ql.EuropeanExercise(T_date(1.0))
tt = dc.yearFraction(today, T_date(1.0))
opt = ql.MargrabeOption(2, 1, ex)
opt.setPricingEngine(ql.AnalyticEuropeanMargrabeEngine(bsp(50, 0.05, 0.01, 0.3), bsp(95, 0.05, 0.03, 0.2), 0.4))
add("exchange_option", {"spot1": 50, "spot2": 95, "quantity1": 2, "quantity2": 1, "years": tt, "dividend_yield1": 0.01, "dividend_yield2": 0.03, "volatility1": 0.3, "volatility2": 0.2, "correlation": 0.4}, {"price": opt.NPV()})

for typ, ext in [("call", 92.0), ("put", 108.0), ("call", 100.0)]:
    ex = ql.EuropeanExercise(T_date(0.5))
    tt = dc.yearFraction(today, T_date(0.5))
    opt = ql.ContinuousFloatingLookbackOption(ext, ql.FloatingTypePayoff(OPT[typ]), ex)
    opt.setPricingEngine(ql.AnalyticContinuousFloatingLookbackEngine(bsp(100, 0.05, 0.01, 0.3)))
    add("lookback_option", {"type": typ, "spot": 100, "extreme": ext, "years": tt, "rate": 0.05, "dividend_yield": 0.01, "volatility": 0.3}, {"price": opt.NPV()})

ex = ql.EuropeanExercise(T_date(1.0))
tt = dc.yearFraction(today, T_date(1.0))
tc_date = T_date(0.25)
opt = ql.SimpleChooserOption(tc_date, 100, ex)
opt.setPricingEngine(ql.AnalyticSimpleChooserEngine(bsp(100, 0.05, 0.02, 0.25)))
add("chooser_option", {"spot": 100, "strike": 100, "years": tt, "choice_years": dc.yearFraction(today, tc_date), "rate": 0.05, "dividend_yield": 0.02, "volatility": 0.25}, {"price": opt.NPV()}, tol=1e-8)

# Merton (1976): QuantLib's Python build has no JumpDiffusionEngine, so the reference sums the
# Poisson series with QuantLib's analytic Black-Scholes engine (Merton's eq. 16), to 1e-16 weight.
import math


def bs_ql(typ, s, k, tt, r, q, v):
    ex = ql.EuropeanExercise(T_date(1.0))
    o = ql.VanillaOption(ql.PlainVanillaPayoff(OPT[typ], k), ex)
    o.setPricingEngine(ql.AnalyticEuropeanEngine(bsp(s, r, q, v)))
    return o.NPV()


for typ, k in [("call", 100), ("put", 90)]:
    tt = dc.yearFraction(today, T_date(1.0))
    lam, m, d, r, q, v = 0.5, -0.1, 0.15, 0.04, 0.01, 0.2
    kbar = math.exp(m + d * d / 2) - 1
    lp = lam * (1 + kbar) * tt
    total = 0.0
    for n in range(60):
        w = math.exp(-lp) * lp**n / math.factorial(n)
        rn = r - lam * kbar + n * math.log(1 + kbar) / tt
        vn = math.sqrt(v * v + n * d * d / tt)
        total += w * bs_ql(typ, 100, k, tt, rn, q, vn) * math.exp((rn - r) * tt)
    add("jump_diffusion_option", {"type": typ, "spot": 100, "strike": k, "years": tt, "rate": r, "dividend_yield": q, "volatility": v, "jump_intensity": lam, "jump_mean": m, "jump_volatility": d}, {"price": total}, tol=1e-8)

print(json.dumps({"generated_by": "scripts/reference/exotics.py", "cases": cases}))
