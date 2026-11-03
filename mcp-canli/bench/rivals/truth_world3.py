"""Answers for the third world set: what rivals are built for and canli-mcp may lose on. Analyst views, options and
market stats have no primary source, so the answer is Yahoo's on the freeze date, read with yfinance, and the rule is
a 5% band (10% for the analyst counts and open interest). Written and frozen 2026-11-02 before any server ran on it.
Run again only to check drift, never to change an answer after a run.
"""
import json, sys
import yfinance as yf
T = {}
def info(sym):
    return yf.Ticker(sym).get_info()
aapl, msft, nvda, ko, jpm, amd, meta, xom, wmt = (info(s) for s in ("AAPL", "MSFT", "NVDA", "KO", "JPM", "AMD", "META", "XOM", "WMT"))
T["aapl_target_mean"] = aapl["targetMeanPrice"]
T["msft_target_mean"] = msft["targetMeanPrice"]
T["msft_analyst_count"] = msft["numberOfAnalystOpinions"]
T["nvda_recommendation_mean"] = nvda["recommendationMean"]
goog = yf.Ticker("GOOGL").get_earnings_estimate()
T["googl_eps_estimate_next_year"] = float(goog.loc["+1y", "avg"])
T["ko_trailing_pe"] = ko["trailingPE"]
T["jpm_dividend_rate"] = jpm["dividendRate"]
T["amd_52w_high"] = amd["fiftyTwoWeekHigh"]
T["meta_market_cap"] = meta["marketCap"]
T["xom_shares_short"] = xom["sharesShort"]
T["wmt_institution_pct"] = round(100 * wmt["heldPercentInstitutions"], 2)
t = yf.Ticker("TSLA")
T["_tsla_expiries"] = list(t.options)[:12]
ch = t.option_chain("2026-12-18")
row = ch.calls[ch.calls["strike"] == 400].iloc[0]
T["tsla_call_400_oi"] = int(row["openInterest"])
T["tsla_call_400_iv_pct"] = round(100 * float(row["impliedVolatility"]), 2)
a = yf.Ticker("AAPL").option_chain("2026-12-18")
T["aapl_put_call_oi_ratio"] = round(float(a.puts["openInterest"].sum()) / float(a.calls["openInterest"].sum()), 4)
T["spy_expiry_count"] = len(yf.Ticker("SPY").options)
print(json.dumps(T, indent=1))
