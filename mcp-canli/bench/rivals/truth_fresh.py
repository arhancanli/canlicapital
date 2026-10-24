"""Ground truth for the FRESH (held-out) question set: written after the server fixes, never used to
tune anything. Same categories as truth.py, different companies, dates and figures.
    uv run python truth_fresh.py > truth_fresh.json
"""
import json, math, re, statistics, sys
sys.path.insert(0, ".")
from truthlib import *

T = {}
ms = [f for f in subm(789019) if f["form"] == "10-K"][0]
t = text(doc_url(789019, ms))
T["msft_employees_10k"] = int(re.search(r"employed approximately ([\d,]+) people", t).group(1).replace(",", ""))
pr = text("https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/q2fy27pr.htm")
T["nvda_q2fy27_revenue"] = round(float(re.search(r"Revenue of \$([\d.]+) billion", pr).group(1)) * 1e9)
T["_nvda_q2fy27_revenue_note"] = "press release headline, rounded to $0.1 billion; tolerance 0.2% accepts the exact figure"
dei = facts(789019)["dei"]["EntityCommonStockSharesOutstanding"]["units"]["shares"]
T["msft_shares_outstanding_10k_fy2026"] = [x for x in dei if x.get("accn") == ms["accessionNumber"]][0]["val"]
g = facts(1652044)["us-gaap"]
tag = "Revenues" if "Revenues" in g else "RevenueFromContractWithCustomerExcludingAssessedTax"
T["googl_revenue_fy2025"] = fact(1652044, tag, "USD", "2025-12-31")
T["amzn_net_income_fy2025"] = fact(1018724, "NetIncomeLoss", "USD", "2025-12-31")
T["meta_diluted_eps_fy2025"] = fact(1326801, "EarningsPerShareDiluted", "USD/shares", "2025-12-31")
nr = form4_rows(1045810, "2026-09-01", "2026-09-30")
T["nvda_stevens_shares_sold_2026_09_18"] = sum(r["shares"] for r in nr if r["code"] == "S" and r["date"] == "2026-09-18" and r["owner"] == "STEVENS MARK A")
T["msft_form4_filings_aug_2026"] = sum(1 for f in subm(789019) if f["form"] == "4" and "2026-08-01" <= f["filingDate"] <= "2026-08-31")
mr = form4_rows(1326801, "2026-09-01", "2026-09-30")
T["meta_insider_open_market_shares_sold_sep_2026"] = sum(r["shares"] for r in mr if r["code"] == "S")
T["brk_13f_total_value_2026q1"] = sum(r["value"] for r in thirteen_f(1067983, "2026-03-31"))
T["brk_bac_shares_2026q2"] = sum(r["shares"] for r in thirteen_f(1067983, "2026-06-30") if r["issuer"] == "BANK OF AMER CORP")
T["pershing_13f_entries_2026q1"] = len(thirteen_f(1336528, "2026-03-31"))
tr = treasury(2026)
d30 = [r for r in tr if r["Date"] == "09/30/2026"][0]; d15 = [r for r in tr if r["Date"] == "09/15/2026"][0]
T["ust_30y_2026_09_30"] = float(d30["30 Yr"])
T["ust_10y3m_2026_09_15"] = round(float(d15["10 Yr"]) - float(d15["3 Mo"]), 4)
T["unrate_2026_07"] = fred("UNRATE")["2026-07-01"]
pce = fred("PCEPILFE"); T["core_pce_yoy_pct_2026_07"] = round(100 * (pce["2026-07-01"] / pce["2025-07-01"] - 1), 4)
T["msft_close_2026_09_30"] = round(closes("MSFT", "2026-09-30", "2026-09-30", adjusted=False)["2026-09-30"], 4)
a = closes("AAPL", "2025-12-31", "2026-06-30"); T["aapl_total_return_pct_2025_12_31_to_2026_06_30"] = round(100 * (a["2026-06-30"] / a["2025-12-31"] - 1), 4)
_, qc = rets_2025("QQQ"); T["qqq_max_drawdown_2025"] = round(max_drawdown(qc, "2025-01-01"), 6)
amz, _ = rets_2025("AMZN"); T["amzn_ann_vol_2025"] = round(statistics.stdev(amz.values()) * math.sqrt(252), 6)
nv, _ = rets_2025("NVDA"); am, _ = rets_2025("AMD"); k = sorted(set(nv) & set(am))
T["nvda_amd_corr_2025"] = round(statistics.correlation([nv[d] for d in k], [am[d] for d in k]), 6)
ap, _ = rets_2025("AAPL"); sp, _ = rets_2025("SPY"); k = sorted(set(ap) & set(sp))
T["aapl_beta_spy_2025"] = round(statistics.covariance([ap[d] for d in k], [sp[d] for d in k]) / statistics.variance([sp[d] for d in k]), 6)
qq, _ = rets_2025("QQQ"); T["qqq_sharpe_2025"] = round(statistics.mean(qq.values()) / statistics.stdev(qq.values()) * math.sqrt(252), 4)
T["bs_put"] = round(bs(50, 48, 0.25, 0.05, 0.0, 0.35, call=False), 6)
print(json.dumps(T, indent=1))
