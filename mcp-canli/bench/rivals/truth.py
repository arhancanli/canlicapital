"""Ground truth for the rival benchmark, computed straight from primary sources (SEC EDGAR JSON and
XML, Treasury CSV, FRED CSV, Yahoo Finance chart JSON), independently of every server compared.
    uv run python truth.py > truth.json
"""
import csv, io, json, math, re, statistics, time, urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "Canli Capital benchmark (+https://canlicapital.com/developers)"}
def get(url, ua=UA):
    time.sleep(0.15)
    with urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=60) as r:
        return r.read().decode("utf-8", "replace")
sec = lambda u: get(u)
plain = lambda u: get(u, {"User-Agent": "canli-benchmark"})
T = {}

# --- SEC XBRL facts ---------------------------------------------------------------------------
def fact(cik, tag, unit, end, form="10-K", fp="FY", tax="us-gaap"):
    f = json.loads(sec(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"))["facts"][tax][tag]["units"][unit]
    hits = [x for x in f if x["end"] == end and x.get("form") == form and (fp is None or x.get("fp") == fp)]
    hits = [x for x in hits if "start" not in x or (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300] if fp == "FY" else hits
    return sorted(hits, key=lambda x: x["filed"])[0]["val"]
T["apple_revenue_fy2025"] = fact(320193, "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "2025-09-27")
T["msft_net_income_fy2025"] = fact(789019, "NetIncomeLoss", "USD", "2025-06-30")
T["nvda_diluted_eps_fy2026"] = fact(1045810, "EarningsPerShareDiluted", "USD/shares", "2026-01-25")
af = json.loads(sec("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json"))["facts"]["dei"]["EntityCommonStockSharesOutstanding"]["units"]["shares"]
T["apple_shares_outstanding_10k_fy2025"] = [x for x in af if x.get("accn") == "0000320193-25-000079"][0]["val"]

# --- filing text ------------------------------------------------------------------------------
def text(url):
    h = sec(url)
    h = re.sub(r"<[^>]+>", " ", h); h = re.sub(r"&#160;|&nbsp;", " ", h)
    return re.sub(r"\s+", " ", h)
nv = text("https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm")
m = re.search(r"we had approximately ([\d,]+) employees", nv)
T["nvda_employees_10k"] = int(m.group(1).replace(",", ""))
T["_nvda_employees_quote"] = nv[m.start() - 60:m.end() + 40]
ts = text("https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/exhibit991111111.htm")
m = re.search(r"delivered over ([\d,]+) vehicles", ts)
T["tsla_q3_2026_deliveries"] = int(m.group(1).replace(",", ""))

# --- Form 4 -----------------------------------------------------------------------------------
def subm(cik):
    r = json.loads(sec(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))["filings"]["recent"]
    return [dict(zip(r, v)) for v in zip(*r.values())]
def form4_rows(cik, start, end):
    out = []
    for f in subm(cik):
        if f["form"] != "4" or not (start <= f["filingDate"] <= end):
            continue
        doc = f["primaryDocument"].split("/")[-1]
        x = sec(f"https://www.sec.gov/Archives/edgar/data/{cik}/{f['accessionNumber'].replace('-', '')}/{doc}")
        for t in re.findall(r"<nonDerivativeTransaction>(.*?)</nonDerivativeTransaction>", x, re.S):
            g = lambda tag: (re.search(rf"<{tag}>\s*(?:<value>)?\s*([^<\s]+)", t) or [None, None])[1]
            out.append({"date": g("transactionDate"), "code": g("transactionCode"), "shares": float(g("transactionShares") or 0), "filed": f["filingDate"]})
    return out
tr = form4_rows(1318605, "2026-09-01", "2026-09-30")
T["tsla_cfo_shares_sold_2026_09_08"] = sum(r["shares"] for r in tr if r["date"] == "2026-09-08" and r["code"] == "S")
nr = form4_rows(1045810, "2026-07-01", "2026-09-30")
T["nvda_insider_open_market_shares_sold_q3_2026"] = sum(r["shares"] for r in nr if r["code"] == "S")
T["apple_form4_filings_sept_2026"] = sum(1 for f in subm(320193) if f["form"] == "4" and "2026-09-01" <= f["filingDate"] <= "2026-09-30")

# --- 13F --------------------------------------------------------------------------------------
def info_table(cik, acc):
    base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}"
    idx = json.loads(sec(f"{base}/index.json"))["directory"]["item"]
    name = [i["name"] for i in idx if i["name"].endswith(".xml") and i["name"] != "primary_doc.xml"][0]
    x = sec(f"{base}/{name}")
    rows = re.findall(r"<(?:\w+:)?infoTable>(.*?)</(?:\w+:)?infoTable>", x, re.S)
    g = lambda r, tag: re.search(rf"<(?:\w+:)?{tag}>([^<]*)<", r).group(1)
    return [{"issuer": g(r, "nameOfIssuer"), "value": int(g(r, "value")), "shares": int(g(r, "sshPrnamt"))} for r in rows]
brk = info_table(1067983, "0001193125-26-352200")
T["brk_apple_shares_2026q2"] = sum(r["shares"] for r in brk if r["issuer"] == "APPLE INC")
T["brk_13f_total_value_2026q2"] = sum(r["value"] for r in brk)
T["bridgewater_13f_entries_2026q2"] = len(info_table(1350694, "0001350694-26-000003"))

# --- Treasury and FRED ------------------------------------------------------------------------
tcsv = list(csv.DictReader(io.StringIO(plain("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv"))))
day = [r for r in tcsv if r["Date"] == "10/08/2026"][0]
T["ust_10y_2026_10_08"] = float(day["10 Yr"])
T["ust_2s10s_2026_10_08"] = round(float(day["10 Yr"]) - float(day["2 Yr"]), 4)
def fred(i):
    return {d: float(v) for d, v in (l.split(",") for l in plain(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={i}").strip().splitlines()[1:]) if v not in ("", ".")}
cpi = fred("CPIAUCSL")
T["cpi_yoy_pct_2026_08"] = round(100 * (cpi["2026-08-01"] / cpi["2025-08-01"] - 1), 4)
T["unrate_2026_08"] = fred("UNRATE")["2026-08-01"]

# --- prices (Yahoo chart, adjusted closes) ----------------------------------------------------
def closes(sym, start, end, adjusted=True):
    p1 = int(datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp()); p2 = int(datetime.fromisoformat(end).replace(tzinfo=timezone.utc).timestamp()) + 86399
    r = json.loads(plain(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d&includeAdjustedClose=true"))["chart"]["result"][0]
    off = r["meta"]["gmtoffset"]
    c = r["indicators"]["adjclose"][0]["adjclose"] if adjusted else r["indicators"]["quote"][0]["close"]
    return {datetime.fromtimestamp(t + off, timezone.utc).strftime("%Y-%m-%d"): v for t, v in zip(r["timestamp"], c) if v is not None}
T["aapl_close_2026_10_08"] = round(closes("AAPL", "2026-10-08", "2026-10-08", adjusted=False)["2026-10-08"], 4)
ms = closes("MSFT", "2025-12-31", "2026-09-30")
T["msft_total_return_pct_2025_12_31_to_2026_09_30"] = round(100 * (ms["2026-09-30"] / ms["2025-12-31"] - 1), 4)
def rets(sym):
    c = closes(sym, "2024-12-31", "2025-12-31"); d = sorted(c)
    return {d[i]: c[d[i]] / c[d[i - 1]] - 1 for i in range(1, len(d))}, c
spy_r, spy_c = rets("SPY")
peak, mdd = 0, 0
for d in sorted(spy_c):
    if d < "2025-01-01": continue
    peak = max(peak, spy_c[d]); mdd = min(mdd, spy_c[d] / peak - 1)
T["spy_max_drawdown_2025"] = round(mdd, 6)
T["spy_sharpe_2025"] = round(statistics.mean(spy_r.values()) / statistics.stdev(spy_r.values()) * math.sqrt(252), 4)
nv_r, _ = rets("NVDA"); T["nvda_ann_vol_2025"] = round(statistics.stdev(nv_r.values()) * math.sqrt(252), 6)
a_r, _ = rets("AAPL"); m_r, _ = rets("MSFT"); k = sorted(set(a_r) & set(m_r))
T["aapl_msft_corr_2025"] = round(statistics.correlation([a_r[d] for d in k], [m_r[d] for d in k]), 6)
t_r, _ = rets("TSLA"); k = sorted(set(t_r) & set(spy_r))
T["tsla_beta_spy_2025"] = round(statistics.covariance([t_r[d] for d in k], [spy_r[d] for d in k]) / statistics.variance([spy_r[d] for d in k]), 6)

# --- closed form ------------------------------------------------------------------------------
S, K, Tm, r, q, v = 100, 105, 0.5, 0.04, 0.01, 0.22
N = lambda x: 0.5 * math.erfc(-x / math.sqrt(2))
d1 = (math.log(S / K) + (r - q + v * v / 2) * Tm) / (v * math.sqrt(Tm)); d2 = d1 - v * math.sqrt(Tm)
T["bs_call"] = round(S * math.exp(-q * Tm) * N(d1) - K * math.exp(-r * Tm) * N(d2), 6)
print(json.dumps(T, indent=1))
