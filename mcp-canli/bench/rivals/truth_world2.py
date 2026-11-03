"""Ground truth for the second world set, written and frozen after the first set's fixes and before any
server ran on it (2026-11-02), so the fixes cannot have been tuned to it. Each value is read from the
primary source with the rule its question states, independently of every server compared.
    uv run python truth_world2.py > truth_world2.json
"""
import csv, html as html_lib, io, json, math, re, statistics, subprocess, sys
sys.path.insert(0, ".")
from truthlib import *

T = {}
L = listed()
venue = lambda cik: cik in L and L[cik][1] in ("NYSE", "Nasdaq")

# A line of a filing's rendered statement, as SEC serves it: the page whose name fits, the row whose label
# fits, the column of the period (and currency) asked for, times the page's scale for money.
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
            nums = [x for x in c[1:] if re.search(r"\d", x)]
            v = float(re.sub(r"[^\d.]", "", nums[col]))
            return round(v * scale, 2), f"{c[0]} | {nums[:4]} | {title[:70]}"
    raise SystemExit(f"no line {label} in {cik}")
def add(key, cik, form, period, page, label, col=0):
    T[key], T["_" + key] = line(cik, form, period, page, label, col)

# Foreign companies, as filed
add("tsm_revenue_2025_twd", 1046179, "20-F", "2025-12-31", "PROFIT OR LOSS", "NET REVENUE")
add("shel_revenue_2025_usd", 1306965, "20-F", "2025-12-31", "STATEMENT OF INCOME", "Revenue")
add("azn_total_revenue_2025_usd", 901832, "20-F", "2025-12-31", "Comprehensive Income", "Total Revenue")
add("sap_revenue_2025_eur", 1000184, "20-F", "2025-12-31", "Income Statement", "Total revenue")
add("tm_revenue_fy2026_jpy", 1094517, "20-F", "2026-03-31", "STATEMENT OF INCOME", "Total sales revenues")
add("baba_revenue_fy2026_cny", 1577552, "20-F", "2026-03-31", "INCOME STATEMENTS", "Revenue")
add("ul_turnover_2025_eur", 217410, "20-F", "2025-12-31", "income statement", "Turnover")
add("bhp_revenue_fy2026_usd", 811809, "20-F", "2026-06-30", "Income Statement", "Revenue")
add("infy_revenue_fy2026_usd", 1067491, "20-F", "2026-03-31", "Comprehensive Income", "Revenues")
add("nvs_net_sales_2025_usd", 1114448, "20-F", "2025-12-31", "income statements", "Net sales from continuing operations")
add("sony_sales_fy2026_jpy", 313838, "20-F", "2026-03-31", "Statements of Income", "Sales")
add("pdd_revenue_2025_usd", 1737806, "20-F", "2025-12-31", "COMPREHENSIVE INCOME", r"Revenues.*", 1)
add("deo_sales_fy2026_usd", 835403, "20-F", "2026-06-30", "income statement", "Sales")

# US companies
T["amzn_operating_income_2025"] = fact(1018724, "OperatingIncomeLoss", "USD", "2025-12-31")
T["msft_diluted_eps_fy2025"] = fact(789019, "EarningsPerShareDiluted", "USD/shares", "2025-06-30")
nv = [x for x in facts(1045810)["us-gaap"]["Revenues"]["units"]["USD"] if x.get("form") == "10-K" and "2026-01-01" <= x["end"] <= "2026-02-15" and (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300]
T["nvda_revenue_fy2026"] = sorted(nv, key=lambda x: x["filed"])[-1]["val"]
T["_nvda_end"] = sorted(nv, key=lambda x: x["filed"])[-1]["end"]
T["wmt_capex_fy2026"] = fact(104169, "PaymentsToAcquirePropertyPlantAndEquipment", "USD", "2026-01-31")
T["meta_rnd_2025"] = fact(1326801, "ResearchAndDevelopmentExpense", "USD", "2025-12-31")
T["brk_net_earnings_2025"] = fact(1067983, "NetIncomeLoss", "USD", "2025-12-31")

# Filings
tsla = [f for f in subm(1318605) if f["form"] == "10-K" and "2026-01-01" <= f["filingDate"] <= "2026-12-31"][0]
T["tsla_tariff_mentions_fy2025"] = len(re.findall(r"tariff", text(doc_url(1318605, tsla)), re.I))
T["msft_10k_filed_fy2025"] = int(sorted(f["filingDate"] for f in subm(789019) if f["form"] == "10-K" and "2025-07-01" <= f["filingDate"] <= "2025-12-31")[0].replace("-", ""))
T["tsla_8k_count_2025"] = sum(1 for f in subm(1318605) if f["form"] == "8-K" and "2025-01-01" <= f["filingDate"] <= "2025-12-31")
wmt = [f for f in subm(104169) if f["form"] == "10-K" and "2026-01-01" <= f["filingDate"] <= "2026-12-31"][0]
T["_wmt_associates_quote"] = re.search(r".{0,120}\b2\.\d million associates.{0,60}|.{0,80}approximately 2\.\d million.{0,80}associates.{0,40}", text(doc_url(104169, wmt))).group(0)
T["wmt_associates_millions"] = float(re.search(r"(2\.\d) million", T["_wmt_associates_quote"]).group(1)) * 1e6

# Insiders
T["msft_form4_q2_2026"] = sum(1 for f in subm(789019) if f["form"] == "4" and "2026-04-01" <= f["filingDate"] <= "2026-06-30")
am = form4_rows(2488, "2026-08-01", "2026-08-31")
T["amd_open_market_shares_sold_aug_2026"] = sum(r["shares"] for r in am if r["code"] == "S")

# 13F
T["brk_ko_shares_2026q2"] = sum(r["shares"] for r in thirteen_f(1067983, "2026-06-30") if r["issuer"] == "COCA COLA CO")
T["appaloosa_13f_entries_2026q2"] = len(thirteen_f(1656456, "2026-06-30"))

# Rates and the economy
tr = treasury(2026)
row = lambda d: [r for r in tr if r["Date"] == d][0]
T["ust_30y_2026_06_30"] = float(row("06/30/2026")["30 Yr"])
T["ust_3m_2026_07_15"] = float(row("07/15/2026")["3 Mo"])
T["unrate_2026_08"] = fred("UNRATE")["2026-08-01"]
T["mortgage30_2026_09_03"] = fred("MORTGAGE30US")["2026-09-03"]

# Prices
T["amzn_close_2026_09_15"] = round(closes("AMZN", "2026-09-15", "2026-09-15", adjusted=False)["2026-09-15"], 4)
q = closes("QQQ", "2025-12-31", "2026-09-30"); T["qqq_total_return_pct_2026_ytd_sep"] = round(100 * (q["2026-09-30"] / q["2025-12-31"] - 1), 4)
T["eth_close_2026_08_31"] = round(closes("ETH-USD", "2026-08-31", "2026-08-31", adjusted=False)["2026-08-31"], 2)
ecb = subprocess.run(["curl", "-s", "--max-time", "40", "https://data-api.ecb.europa.eu/service/data/EXR/D.GBP.EUR.SP00.A?startPeriod=2026-09-15&endPeriod=2026-09-15&format=csvdata"], capture_output=True, text=True).stdout
T["eurgbp_ecb_2026_09_15"] = float(list(csv.DictReader(io.StringIO(ecb)))[0]["OBS_VALUE"])

# Analytics
nvr, _ = rets_2025("NVDA"); T["nvda_ann_vol_2025"] = round(statistics.stdev(nvr.values()) * math.sqrt(252), 6)
ms, _ = rets_2025("MSFT"); go, _ = rets_2025("GOOGL"); k = sorted(set(ms) & set(go))
T["msft_googl_corr_2025"] = round(statistics.correlation([ms[d] for d in k], [go[d] for d in k]), 6)
T["bs_put_price"] = round(bs(100, 95, 1, 0.03, 0, 0.3, call=False), 4)
print(json.dumps(T, indent=1))
