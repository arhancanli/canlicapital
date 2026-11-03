"""Ground truth for the world test's question set, written and frozen before any server ran on it
(2026-11-02): computed from primary sources with the rule each question states, independently of every
server compared.
    uv run python truth_world.py > truth_world.json
"""
import csv, io, json, math, re, statistics, sys
sys.path.insert(0, ".")
from truthlib import *

T = {}
L = listed()
L.setdefault(34088, ("XOM", "NYSE", "EXXON MOBIL CORP"))
venue = lambda cik: cik in L and L[cik][1] in ("NYSE", "Nasdaq")
in_fy = lambda r: "2025-02-01" <= r["end"] <= "2026-01-31"
REV = ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax")

def latest_tenk(cik):
    return [f for f in subm(cik) if f["form"] == "10-K"][0]
def tenk_on_or_before(cik, day):
    return [f for f in subm(cik) if f["form"] == "10-K" and f["filingDate"] <= day][0]
def revenue(cik, end):
    f = facts(cik)["us-gaap"]
    vals = []
    for tag in REV:
        hits = [x for x in f.get(tag, {}).get("units", {}).get("USD", []) if x["end"] == end and x.get("form") in ("10-K", "10-K/A") and (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300]
        if hits: vals.append(sorted(hits, key=lambda x: x["filed"])[-1]["val"])
    return max(vals)
def annual(cik, tag, end, unit="USD"):
    f = facts(cik)["us-gaap"][tag]["units"][unit]
    hits = [x for x in f if x["end"] == end and x.get("form") == "10-K" and ("start" not in x or (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300)]
    return sorted(hits, key=lambda x: x["filed"])

# Filings
t = text(doc_url(909832, tenk_on_or_before(909832, "2025-12-31")))
T["_cost_employees_quote"] = re.search(r".{0,80}(?:employees|employed).{0,80}\d{3},\d{3}.{0,40}|.{0,60}\d{3},\d{3}.{0,40}employees.{0,40}", t).group(0)
T["cost_employees"] = int(re.search(r"(\d{3},\d{3})", T["_cost_employees_quote"]).group(1).replace(",", ""))
goog = tenk_on_or_before(1652044, "2026-10-31")
T["_goog_10k"] = goog["accessionNumber"]
T["goog_ai_mentions"] = len(re.findall(r"artificial intelligence", text(doc_url(1652044, goog)), re.I))
T["ba_8k_count_2025"] = sum(1 for f in subm(12927) if f["form"] == "8-K" and "2025-01-01" <= f["filingDate"] <= "2025-12-31")
T["nflx_10k_filed_fy2025"] = int(sorted(f["filingDate"] for f in subm(1065280) if f["form"] == "10-K" and "2026-01-01" <= f["filingDate"] <= "2026-12-31")[0].replace("-", ""))

# Fundamentals
T["cost_revenue_fy2025"] = revenue(909832, "2025-08-31")
T["jpm_net_income_fy2025"] = fact(19617, "NetIncomeLoss", "USD", "2025-12-31")
T["xom_capex_fy2025"] = fact(34088, "PaymentsToAcquirePropertyPlantAndEquipment", "USD", "2025-12-31")
e = annual(1065280, "EarningsPerShareDiluted", "2025-12-31", "USD/shares")
T["nflx_diluted_eps_fy2025"] = e[-1]["val"]
cogs = fact(80424, "CostOfGoodsAndServicesSold", "USD", "2025-06-30"); rv = revenue(80424, "2025-06-30")
T["pg_gross_margin_pct_fy2025"] = round(100 * (rv - cogs) / rv, 4)
ni_v = fact(1403161, "NetCashProvidedByUsedInOperatingActivities", "USD", "2025-09-30")
cap_v = fact(1403161, "PaymentsToAcquireProductiveAssets", "USD", "2025-09-30")
T["visa_fcf_margin_pct_fy2025"] = round(100 * (ni_v - cap_v) / revenue(1403161, "2025-09-30"), 4)
T["aapl_buybacks_fy2025"] = fact(320193, "PaymentsForRepurchaseOfCommonStock", "USD", "2025-09-27")
first = sorted([x for x in facts(320193)["us-gaap"]["EarningsPerShareDiluted"]["units"]["USD/shares"] if x["end"] == "2019-09-28" and x.get("form") == "10-K" and x.get("fp") == "FY"], key=lambda x: x["filed"])
T["aapl_eps_fy2019_first_reported"] = first[0]["val"]
nv = json.loads(sec("https://data.sec.gov/api/xbrl/companyfacts/CIK0000353278.json"))["facts"]["ifrs-full"]["Revenue"]["units"]["DKK"]
T["novo_revenue_2025_dkk"] = sorted([x for x in nv if x["end"] == "2025-12-31" and x.get("form") == "20-F" and (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300], key=lambda x: x["filed"])[-1]["val"]
T["ko_dividends_paid_2025"] = annual(21344, "CommonStockDividendsPerShareCashPaid", "2025-12-31", "USD/shares")[-1]["val"]

# Insiders
T["aapl_form4_q1_2026"] = sum(1 for f in subm(320193) if f["form"] == "4" and "2026-01-01" <= f["filingDate"] <= "2026-03-31")
pl = form4_rows(1321655, "2026-08-01", "2026-08-31")
T["pltr_open_market_shares_sold_aug_2026"] = sum(r["shares"] for r in pl if r["code"] == "S")

# 13F
T["brk_aapl_shares_2026q2"] = sum(r["shares"] for r in thirteen_f(1067983, "2026-06-30") if r["issuer"] == "APPLE INC")
T["duquesne_13f_entries_2026q2"] = len(thirteen_f(1536411, "2026-06-30"))

# Rates and the economy
tr = treasury(2026)
row = lambda d: [r for r in tr if r["Date"] == d][0]
T["ust_2y_2026_08_14"] = float(row("08/14/2026")["2 Yr"])
r = row("07/31/2026"); T["ust_10y2y_2026_07_31"] = round(float(r["10 Yr"]) - float(r["2 Yr"]), 4)
cpi = fred("CPIAUCNS"); T["cpi_nsa_yoy_pct_2026_08"] = round(100 * (cpi["2026-08-01"] / cpi["2025-08-01"] - 1), 4)
T["gdp_2026q2_billions"] = fred("GDP")["2026-04-01"]
T["fed_upper_target_2026_09_30"] = fred("DFEDTARU")["2026-09-30"]

# Prices
T["tsla_close_2026_08_31"] = round(closes("TSLA", "2026-08-31", "2026-08-31", adjusted=False)["2026-08-31"], 4)
s = closes("SPY", "2025-12-31", "2026-09-30"); T["spy_total_return_pct_2026_ytd_sep"] = round(100 * (s["2026-09-30"] / s["2025-12-31"] - 1), 4)
T["btc_close_2026_06_30"] = round(closes("BTC-USD", "2026-06-30", "2026-06-30", adjusted=False)["2026-06-30"], 2)
import subprocess
ecb = subprocess.run(["curl", "-s", "--max-time", "40", "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-08-14&endPeriod=2026-08-14&format=csvdata"], capture_output=True, text=True).stdout
T["eurusd_ecb_2026_08_14"] = float(list(csv.DictReader(io.StringIO(ecb)))[0]["OBS_VALUE"])

# Analytics
jp, _ = rets_2025("JPM"); T["jpm_ann_vol_2025"] = round(statistics.stdev(jp.values()) * math.sqrt(252), 6)
xo, _ = rets_2025("XOM"); cv, _ = rets_2025("CVX"); k = sorted(set(xo) & set(cv))
T["xom_cvx_corr_2025"] = round(statistics.correlation([xo[d] for d in k], [cv[d] for d in k]), 6)
sp, _ = rets_2025("SPY"); v = sorted(sp.values()); q = 0.05 * (len(v) - 1); lo = int(q)
T["spy_hist_var5_2025"] = round(-(v[lo] + (q - lo) * (v[lo + 1] - v[lo])), 6)
S, K, tt, r0, vol = 100, 105, 0.5, 0.04, 0.25
d1 = (math.log(S / K) + (r0 + vol * vol / 2) * tt) / (vol * math.sqrt(tt))
T["bs_call_delta"] = round(N(d1), 6)

# Whole-market screens
def window_values(tags):
    out = {}
    for period in ("CY2025", "CY2024"):
        for tag in tags:
            for c, x in frame(tag, "USD", period).items():
                if venue(c) and in_fy(x) and (c not in out or x["val"] > out[c]["val"]):
                    out[c] = dict(x, tag=tag)
    return out
oi = window_values(("OperatingIncomeLoss",))
vals = {}
for c, x in oi.items():
    if x["val"] > 40e9:
        v2 = tenk(c, "OperatingIncomeLoss", x["end"], x.get("start")) or x["val"]
        vals[c] = v2
T["count_operating_income_over_50b"] = sum(1 for v2 in vals.values() if v2 > 50e9)
T["_op_income_over_50b"] = sorted(L[c][0] for c, v2 in vals.items() if v2 > 50e9)
print(json.dumps(T, indent=1))
