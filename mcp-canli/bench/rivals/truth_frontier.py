"""Ground truth for the FRONTIER questions: research across the market (screens, event studies,
filing trends, multi-step company figures), computed from primary sources with the rules each
question states, independently of every server compared.
    uv run python truth_frontier.py > truth_frontier.json
"""
import json, math, statistics, sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
sys.path.insert(0, ".")
from truthlib import *

T = {}
L = listed()
venue = lambda cik: cik in L and L[cik][1] in ("NYSE", "Nasdaq")
# Fiscal years ending February 2025 to January 2026 (the CY2025 frame, filtered by end date).
in_fy = lambda r: "2025-02-01" <= r["end"] <= "2026-01-31"
rev_a = frame("Revenues", "USD", "CY2025"); rev_b = frame("RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "CY2025")
revenue = {c: max(r["val"] for r in (rev_a.get(c), rev_b.get(c)) if r) for c in set(rev_a) | set(rev_b) if venue(c) and in_fy((rev_a.get(c) or rev_b.get(c)))}
ni = {c: r["val"] for c, r in frame("NetIncomeLoss", "USD", "CY2025").items() if venue(c) and in_fy(r)}
assets = {c: r["val"] for c, r in frame("Assets", "USD", "CY2025Q4I").items() if venue(c) and "2025-10-01" <= r["end"] <= "2026-01-31"}
# Frames take the latest filing's value, which can be a proxy statement's pay-versus-performance
# table with a slip (Medline: $1.157 trillion; Oncology Institute: +$60.6 billion for a $60.6 million
# loss). Every candidate near a cutoff is re-read from the company's own 10-K.
asset_end = {c: r["end"] for c, r in frame("Assets", "USD", "CY2025Q4I").items()}
assets = {c: (tenk(c, "Assets", asset_end[c]) or v) for c, v in assets.items() if v > 0.5e12}
T["count_assets_over_1t"] = sum(1 for v in assets.values() if v > 1e12)
T["_assets_over_1t"] = sorted((L[c][0], v) for c, v in assets.items() if v > 1e12)
ni_rows = {c: r for c, r in frame("NetIncomeLoss", "USD", "CY2025").items()}
for c in sorted(ni, key=ni.get, reverse=True)[:40]:
    v = tenk(c, "NetIncomeLoss", ni_rows[c]["end"], ni_rows[c].get("start"))
    if v is not None: ni[c] = v
top_ni = max(ni, key=ni.get)
T["largest_net_income"] = ni[top_ni]; T["_largest_net_income_ticker"] = L[top_ni][0]
T["count_net_income_over_50b"] = sum(1 for v in ni.values() if v > 50e9)
T["_net_income_over_50b"] = sorted(L[c][0] for c, v in ni.items() if v > 50e9)
rd_a = frame("ResearchAndDevelopmentExpense", "USD", "CY2025"); rd_b = frame("ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost", "USD", "CY2025")
rd = {c: max(r["val"] for r in (rd_a.get(c), rd_b.get(c)) if r) for c in set(rd_a) | set(rd_b)}
big = {c: v for c, v in revenue.items() if v > 50e9 and c in rd}
for c in sorted(big, key=lambda c: rd[c] / big[c], reverse=True)[:10]:
    r = rd_a.get(c) or rd_b.get(c)
    vals = [tenk(c, t, r["end"], r.get("start")) for t in ("ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost")]
    vals = [v for v in vals if v is not None]
    if vals: rd[c] = max(vals)
best_rd = max(big, key=lambda c: rd[c] / big[c])
T["max_rd_intensity_pct_rev_over_50b"] = round(100 * rd[best_rd] / big[best_rd], 4); T["_max_rd_ticker"] = L[best_rd][0]
prev_a = frame("Revenues", "USD", "CY2024"); prev_b = frame("RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "CY2024")
def prev(c):
    # The prior year in the same tag as the current year's value.
    cur_tag = "a" if (rev_a.get(c) and revenue[c] == rev_a[c]["val"]) else "b"
    r = (prev_a if cur_tag == "a" else prev_b).get(c) or prev_a.get(c) or prev_b.get(c)
    return r["val"] if r else None
growth = {c: revenue[c] / prev(c) - 1 for c in revenue if revenue[c] > 20e9 and prev(c) and prev(c) > 0}
# Re-read the leaders' current and prior revenue from their 10-Ks (both standard tags; the larger).
def tenk_rev(c, r):
    vals = [tenk(c, t, r["end"], r.get("start")) for t in ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax")]
    vals = [v for v in vals if v is not None]
    if not vals: return None
    # Two tags exactly 1,000 (or a million, a billion) times apart are one figure with a scale slip
    # (Tigo Energy's 10-K tags 2025 revenue as $103,536,000 and as $103,536,000,000): the smaller.
    lo, hi = min(vals), max(vals)
    if lo > 0 and any(abs(hi / lo / k - 1) < 0.005 for k in (1e3, 1e6, 1e9)): return lo
    return hi
for c in sorted(growth, key=growth.get, reverse=True)[:25]:
    cur_r = rev_a.get(c) or rev_b.get(c); prv_r = prev_a.get(c) or prev_b.get(c)
    cur, prv = tenk_rev(c, cur_r), (tenk_rev(c, prv_r) if prv_r else None)
    if cur is not None: revenue[c] = cur
    if cur is not None and prv:
        growth[c] = cur / prv - 1
    if revenue[c] <= 20e9: growth.pop(c, None)
g_best = max(growth, key=growth.get)
T["max_revenue_growth_pct_rev_over_20b"] = round(100 * growth[g_best], 4); T["_max_growth_ticker"] = L[g_best][0]

# Event study: NVIDIA's last 8 earnings releases (8-K item 2.02); day 0 is the first session after
# acceptance (16:00 New York close); market model on SPY over 120 days ending 10 days before day -0.
subs = subm(1045810)
earn = sorted([f for f in subs if f["form"] == "8-K" and "2.02" in (f.get("items") or "").split(",")], key=lambda f: f["acceptanceDateTime"])[-8:]
px = closes("NVDA", "2023-06-01", "2026-10-08"); mk = closes("SPY", "2023-06-01", "2026-10-08")
days = [d for d in sorted(px) if d in mk]
R = {days[i]: px[days[i]] / px[days[i - 1]] - 1 for i in range(1, len(days))}
M = {days[i]: mk[days[i]] / mk[days[i - 1]] - 1 for i in range(1, len(days))}
dd = days[1:]
cars = []
for f in earn:
    t = datetime.fromisoformat(f["acceptanceDateTime"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
    d0 = next(d for d in dd if (d > t.strftime("%Y-%m-%d") if t.hour >= 16 else d >= t.strftime("%Y-%m-%d")))
    k = dd.index(d0)
    est = dd[k - 10 - 120:k - 10]
    x = [M[d] for d in est]; y = [R[d] for d in est]
    b = statistics.covariance(x, y) / statistics.variance(x); a = statistics.mean(y) - b * statistics.mean(x)
    cars.append(sum(R[dd[k + j]] - (a + b * M[dd[k + j]]) for j in (0, 1)))
T["nvda_earnings_mean_car_0_1_pct"] = round(100 * statistics.mean(cars), 4)

# Filing trends (EDGAR full-text search counts of documents).
def efts_count(q, forms, s, e):
    p = urllib.request.quote
    d = json.loads(sec(f"https://efts.sec.gov/LATEST/search-index?q={p(q)}&forms={p(forms)}&dateRange=custom&startdt={s}&enddt={e}"))
    return d["hits"]["total"]["value"]
T["agentic_ai_10k_10q_docs_2026q3"] = efts_count('"agentic AI"', "10-K,10-Q", "2026-07-01", "2026-09-30")
a22 = efts_count('"artificial intelligence"', "10-K", "2022-01-01", "2022-12-31"); a25 = efts_count('"artificial intelligence"', "10-K", "2025-01-01", "2025-12-31")
T["ai_10k_mentions_ratio_2025_vs_2022"] = round(a25 / a22, 4); T["_ai_counts"] = [a22, a25]

# Apple: free cash flow (operating cash flow minus capex) for fiscal 2025, over market value at the
# 2026-10-08 close with the latest cover-page share count.
f = facts(320193)
ocf = fact(320193, "NetCashProvidedByUsedInOperatingActivities", "USD", "2025-09-27")
capex = fact(320193, "PaymentsToAcquirePropertyPlantAndEquipment", "USD", "2025-09-27")
sh = max(f["dei"]["EntityCommonStockSharesOutstanding"]["units"]["shares"], key=lambda x: x["end"])
price = closes("AAPL", "2026-10-08", "2026-10-08", adjusted=False)["2026-10-08"]
T["aapl_fcf_yield_pct"] = round(100 * (ocf - capex) / (sh["val"] * price), 4); T["_aapl_fcf_inputs"] = [ocf, capex, sh["val"], sh["end"], price]

# Microsoft: revenue growth rate per year from fiscal 2020 to fiscal 2025 (5 years).
r20 = fact(789019, "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "2020-06-30")
r25 = fact(789019, "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "2025-06-30")
T["msft_revenue_cagr_pct_fy2020_fy2025"] = round(100 * ((r25 / r20) ** (1 / 5) - 1), 4); T["_msft_rev"] = [r20, r25]
print(json.dumps(T, indent=1))
