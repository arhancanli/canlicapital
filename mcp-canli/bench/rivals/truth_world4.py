"""Answers for the fourth world set: a check on the fixes from the first three, written and frozen on 2026-11-02 before
any server ran on it. Primary sources, read independently of every server; analyst and market stats from Yahoo that day.
    ~/canli-bench-rivals/yfmcp/.venv313/bin/python truth_world4.py > truth_world4.json
"""
import csv, html as html_lib, io, json, math, re, statistics, subprocess, sys
sys.path.insert(0, ".")
from truthlib import *
import yfinance as yf

T = {}
def r_page(cik, form, period, page):
    f = [x for x in subm(cik) if x["form"] == form and x["reportDate"] == period][0]
    base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{f['accessionNumber'].replace('-', '')}"
    xml = sec(base + "/FilingSummary.xml")
    for rep in re.findall(r"<Report\b.*?</Report>", xml, re.S):
        name = re.search(r"<ShortName>(.*?)</ShortName>", rep).group(1)
        if re.search(page, name, re.I) and not re.search("parenthetical", name, re.I):
            return f, sec(base + "/" + re.search(r"<HtmlFileName>(.*?)</HtmlFileName>", rep).group(1))
    raise SystemExit(f"no page {page} for {cik}")
def cells(row):
    return [re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", c))).replace("\xa0", " ").strip() for c in re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row, re.S)]
def line(cik, form, period, page, label, col=0):
    f, html = r_page(cik, form, period, page)
    table = html[html.find('class="report"'):]
    title = cells(re.search(r"<tr\b.*?</tr>", table, re.S).group(0))[0]
    scale = next((v for w, v in (("Thousands", 1e3), ("Millions", 1e6), ("Billions", 1e9)) if re.search(r"(?<!shares) in " + w, title.replace("shares in", "SHARES"))), 1)
    for row in re.findall(r"<tr\b.*?</tr>", table, re.S):
        c = cells(row)
        if c and re.fullmatch(label, c[0], re.I):
            nums = [x for x in c[1:] if re.search(r"\d", x) and not re.fullmatch(r"\[\d+\]", x)]
            return round(float(re.sub(r"[^\d.]", "", nums[col])) * scale, 2), f"{c[0]} | {nums[:3]} | {title[:60]}"
    raise SystemExit(f"no line {label} in {cik}: " + title)
def add(key, *a, **k):
    T[key], T["_" + key] = line(*a, **k)
def fy(cik, tags, prefix, unit="USD"):
    f = facts(cik)["us-gaap"]
    for tag in tags if isinstance(tags, tuple) else (tags,):
        hits = [x for x in f.get(tag, {}).get("units", {}).get(unit, []) if x["end"].startswith(prefix) and x.get("form") == "10-K" and ("start" not in x or (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300)]
        if hits:
            return sorted(hits, key=lambda x: x["filed"])[-1]["val"]
    raise SystemExit(f"no {tags} {prefix} for {cik}")

# Foreign companies, as filed
add("asml_sales_2025_eur", 937966, "20-F", "2025-12-31", "Statements of Operations", "Total net sales")
add("rio_sales_2025_usd", 863064, "20-F", "2025-12-31", "income statement", "Consolidated sales revenue")
add("pbr_sales_2025_usd", 1119639, "20-F", "2025-12-31", "Statements of Income", "Sales revenues")
add("gsk_turnover_2025_gbp", 1131399, "20-F", "2025-12-31", "income statement", "Turnover")
add("jd_revenue_2025_cny", 1549802, "20-F", "2025-12-31", "Statements of Operations", "Total net revenues")
add("vale_revenue_2025_usd", 917851, "20-F", "2025-12-31", "Income Statement", "Net operating revenue")
add("hsbc_total_assets_2025_usd", 1089113, "20-F", "2025-12-31", "balance sheet", "Total assets")
add("ry_net_income_fy2025_cad", 1000275, "40-F", "2025-10-31", "Statements of Income", "Net income")

# US companies, smaller and with other tags
REV = ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax")
T["cmg_revenue_2025"] = fy(1058090, REV, "2025-12")
T["de_net_income_fy2025"] = fy(315189, "NetIncomeLoss", "2025-1")
T["crm_revenue_fy2026"] = fy(1108524, REV, "2026-01")
T["hd_diluted_eps_fy2025"] = fy(354950, "EarningsPerShareDiluted", "2026-0", "USD/shares")
T["intc_capex_2025"] = fy(50863, "PaymentsToAcquirePropertyPlantAndEquipment", "2025-12")
T["pfe_total_assets_2025"] = fy(78003, "Assets", "2025-12")
T["cat_rnd_2025"] = fy(18230, ("ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"), "2025-12")
first = sorted([x for x in facts(19617)["us-gaap"]["NetIncomeLoss"]["units"]["USD"] if x["end"] == "2019-12-31" and x.get("form") == "10-K" and (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300], key=lambda x: x["filed"])
T["jpm_net_income_2019_first"] = first[0]["val"]

# Filings
xom = [f for f in subm(34088) if f["form"] == "10-K" and "2026-01-01" <= f["filingDate"] <= "2026-12-31"][0]
T["xom_climate_mentions_fy2025"] = len(re.findall(r"climate", text(doc_url(34088, xom)), re.I))
T["amzn_10k_filed_fy2025"] = int(sorted(f["filingDate"] for f in subm(1018724) if f["form"] == "10-K" and "2026-01-01" <= f["filingDate"] <= "2026-12-31")[0].replace("-", ""))
T["meta_8k_count_2025"] = sum(1 for f in subm(1326801) if f["form"] == "8-K" and "2025-01-01" <= f["filingDate"] <= "2025-12-31")
aapl = [f for f in subm(320193) if f["form"] == "10-K" and "2025-10-01" <= f["filingDate"] <= "2025-12-31"][0]
T["_aapl_people"] = re.search(r".{0,100}full-time equivalent employees.{0,40}", text(doc_url(320193, aapl))).group(0)
T["aapl_employees_fy2025"] = int(re.search(r"(\d{3},\d{3})", T["_aapl_people"]).group(1).replace(",", ""))

# Insiders and 13F
T["googl_form4_q3_2026"] = sum(1 for f in subm(1652044) if f["form"] == "4" and "2026-07-01" <= f["filingDate"] <= "2026-09-30")
T["baupost_13f_entries_2026q2"] = len(thirteen_f(1061768, "2026-06-30"))
T["brk_bac_shares_2026q2"] = sum(r["shares"] for r in thirteen_f(1067983, "2026-06-30") if r["issuer"] == "BANK OF AMER CORP")

# Rates and the economy
tr = treasury(2026)
T["ust_5y_2026_09_30"] = float([r for r in tr if r["Date"] == "09/30/2026"][0]["5 Yr"])
pce = fred("PCEPI"); T["pce_yoy_pct_2026_08"] = round(100 * (pce["2026-08-01"] / pce["2025-08-01"] - 1), 4)
T["houst_2026_08"] = fred("HOUST")["2026-08-01"]
T["sofr_2026_09_15"] = fred("SOFR")["2026-09-15"]

# Prices, crypto and currencies
T["nvda_close_2026_10_01"] = round(closes("NVDA", "2026-10-01", "2026-10-01", adjusted=False)["2026-10-01"], 4)
T["gld_close_2026_08_31"] = round(closes("GLD", "2026-08-31", "2026-08-31", adjusted=False)["2026-08-31"], 4)
T["sol_close_2026_09_30"] = round(closes("SOL-USD", "2026-09-30", "2026-09-30", adjusted=False)["2026-09-30"], 2)
ecb = subprocess.run(["curl", "-s", "--max-time", "40", "https://data-api.ecb.europa.eu/service/data/EXR/D.JPY.EUR.SP00.A?startPeriod=2026-08-14&endPeriod=2026-08-14&format=csvdata"], capture_output=True, text=True).stdout
T["eurjpy_ecb_2026_08_14"] = float(list(csv.DictReader(io.StringIO(ecb)))[0]["OBS_VALUE"])

# Analytics
c = closes("AAPL", "2024-12-31", "2025-12-31")
T["aapl_max_drawdown_2025"] = round(max_drawdown(c, "2024-12-31"), 6)
ts, _ = rets_2025("TSLA"); sp, _ = rets_2025("SPY"); k = sorted(set(ts) & set(sp))
x = [sp[d] for d in k]; y = [ts[d] for d in k]; mx = statistics.mean(x); my = statistics.mean(y)
T["tsla_beta_spy_2025"] = round(sum((a - mx) * (b - my) for a, b in zip(x, y)) / sum((a - mx) ** 2 for a in x), 6)
T["bs_call_div_price"] = round(bs(100, 110, 0.75, 0.04, 0.02, 0.35, call=True), 4)

# Analyst views and market stats: Yahoo, that day
crm = yf.Ticker("CRM").get_info(); pfe = yf.Ticker("PFE").get_info(); dis = yf.Ticker("DIS").get_info()
T["crm_target_mean"] = crm["targetMeanPrice"]
T["pfe_trailing_pe"] = pfe["trailingPE"]
T["dis_market_cap"] = dis["marketCap"]
T["dis_inst_pct"] = round(100 * dis["heldPercentInstitutions"], 2)
print(json.dumps(T, indent=1))
