"""Ground truth for the second frontier set, written before any server ran on it (2026-10-24):
computed from primary sources (SEC frames, company concepts and submissions, EDGAR full-text search,
Treasury) with the rules each question states, independently of every server compared.
    uv run python truth_frontier2.py > truth_frontier2.json
"""
import json, statistics, sys, urllib.request
sys.path.insert(0, ".")
from truthlib import *

T = {}
L = listed()
venue = lambda cik: cik in L and L[cik][1] in ("NYSE", "Nasdaq")
in_fy = lambda r: "2025-02-01" <= r["end"] <= "2026-01-31"
REV = ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax")

# Each company's fiscal year ending in the window sits in the CY2025 frame or, for an early year end,
# the CY2024 frame; the value is re-read from the company's own 10-K (larger of the two revenue tags).
def window_values(tags):
    out = {}
    for period in ("CY2025", "CY2024"):
        for tag in tags:
            for c, r in frame(tag, "USD", period).items():
                if venue(c) and in_fy(r) and (c not in out or r["val"] > out[c]["val"]):
                    out[c] = dict(r, tag=tag)
    return out
rev = window_values(REV)
ni = window_values(("NetIncomeLoss",))
big = {c: r for c, r in rev.items() if r["val"] > 90e9 and c in ni}
margins = {}
for c, r in big.items():
    rv = [tenk(c, t, r["end"], r.get("start")) for t in REV]; rv = max([v for v in rv if v is not None] or [r["val"]])
    nv = tenk(c, "NetIncomeLoss", ni[c]["end"], ni[c].get("start")) or ni[c]["val"]
    if rv > 100e9: margins[c] = (nv / rv, rv, nv)
best = max(margins, key=lambda c: margins[c][0])
T["max_net_margin_pct_rev_over_100b"] = round(100 * margins[best][0], 4); T["_max_net_margin"] = [L[best][0], margins[best][1], margins[best][2]]

# Capital expenditures under either tag companies use for them (Amazon reports "productive assets").
# Exxon Mobil (CIK 34088) is listed though SEC's exchange file now gives XOM to its new holding company.
CAPEX = ("PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets")
L.setdefault(34088, ("XOM", "NYSE", "EXXON MOBIL CORP"))
capex = window_values(CAPEX)
over = {}
for c, r in capex.items():
    if r["val"] < 15e9: continue
    vals = [tenk(c, t, r["end"], r.get("start")) for t in CAPEX]
    v = max([x for x in vals if x is not None] or [r["val"]])
    if v > 20e9: over[L[c][0]] = v
T["count_capex_over_20b"] = len(over); T["_capex_over_20b"] = sorted(over)

a24 = fact(19617, "Assets", "USD", "2024-12-31"); a25 = fact(19617, "Assets", "USD", "2025-12-31")
T["jpm_assets_growth_pct_2025"] = round(100 * (a25 / a24 - 1), 4); T["_jpm_assets"] = [a24, a25]

T["tsla_8k_item_502_2025"] = sum(1 for f in subm(1318605) if f["form"] == "8-K" and "2025-01-01" <= f["filingDate"] <= "2025-12-31" and "5.02" in (f.get("items") or "").split(","))

rows = [r for r in treasury(2026) if r["Date"][:2] == "09"]
T["ust10_par_avg_2026_09"] = round(statistics.mean(float(r["10 Yr"]) for r in rows), 4); T["_ust10_days"] = len(rows)

e24 = fact(789019, "EarningsPerShareDiluted", "USD/shares", "2024-06-30"); e25 = fact(789019, "EarningsPerShareDiluted", "USD/shares", "2025-06-30")
T["msft_diluted_eps_growth_pct_fy2025"] = round(100 * (e25 / e24 - 1), 4); T["_msft_eps"] = [e24, e25]

p = urllib.request.quote
d = json.loads(sec(f"https://efts.sec.gov/LATEST/search-index?q={p(chr(34) + 'reciprocal tariffs' + chr(34))}&forms=10-K&dateRange=custom&startdt=2026-01-01&enddt=2026-06-30"))
T["reciprocal_tariffs_10k_docs_2026h1"] = d["hits"]["total"]["value"]

T["aapl_form4_s_transactions_2026q3"] = sum(1 for r in form4_rows(320193, "2026-07-01", "2026-09-30") if r["code"] == "S")
print(json.dumps(T, indent=1))
