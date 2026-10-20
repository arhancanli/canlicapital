"""Primary-source helpers for the benchmark's ground truth (SEC, Treasury, FRED, Yahoo chart data)."""
import csv, io, json, math, re, statistics, time, urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "Canli Capital benchmark (+https://canlicapital.com/developers)"}
def get(url, ua=UA):
    time.sleep(0.15)
    with urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=60) as r:
        return r.read().decode("utf-8", "replace")
sec = lambda u: get(u)
plain = lambda u: get(u, {"User-Agent": "canli-benchmark"})

def facts(cik):
    return json.loads(sec(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"))["facts"]
def fact(cik, tag, unit, end, form="10-K", tax="us-gaap"):
    f = facts(cik)[tax][tag]["units"][unit]
    hits = [x for x in f if x["end"] == end and x.get("form") == form and x.get("fp") == "FY" and ("start" not in x or (datetime.fromisoformat(x["end"]) - datetime.fromisoformat(x["start"])).days > 300)]
    return sorted(hits, key=lambda x: x["filed"])[0]["val"]
def subm(cik):
    r = json.loads(sec(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))["filings"]["recent"]
    return [dict(zip(r, v)) for v in zip(*r.values())]
def text(url):
    h = sec(url)
    h = re.sub(r"<[^>]+>", " ", h); h = re.sub(r"&#160;|&nbsp;|&#xa0;", " ", h); h = h.replace("&#8217;", "'").replace("&amp;", "&")
    return re.sub(r"\s+", " ", h)
def doc_url(cik, f):
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{f['accessionNumber'].replace('-', '')}/{f['primaryDocument'].split('/')[-1]}"
def form4_rows(cik, start, end):
    out = []
    for f in subm(cik):
        if f["form"] != "4" or not (start <= f["filingDate"] <= end):
            continue
        x = sec(doc_url(cik, f))
        owner = (re.search(r"<rptOwnerName>([^<]+)<", x) or [None, None])[1]
        for t in re.findall(r"<nonDerivativeTransaction>(.*?)</nonDerivativeTransaction>", x, re.S):
            g = lambda tag: (re.search(rf"<{tag}>\s*(?:<value>)?\s*([^<\s]+)", t) or [None, None])[1]
            out.append({"owner": owner, "date": g("transactionDate"), "code": g("transactionCode"), "shares": float(g("transactionShares") or 0), "price": float(g("transactionPricePerShare") or 0), "filed": f["filingDate"], "acc": f["accessionNumber"]})
    return out
def info_table(cik, acc):
    base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}"
    idx = json.loads(sec(f"{base}/index.json"))["directory"]["item"]
    name = [i["name"] for i in idx if i["name"].endswith(".xml") and i["name"] != "primary_doc.xml"][0]
    x = sec(f"{base}/{name}")
    rows = re.findall(r"<(?:\w+:)?infoTable>(.*?)</(?:\w+:)?infoTable>", x, re.S)
    g = lambda r, tag: re.search(rf"<(?:\w+:)?{tag}>([^<]*)<", r).group(1)
    return [{"issuer": g(r, "nameOfIssuer"), "value": int(g(r, "value")), "shares": int(g(r, "sshPrnamt"))} for r in rows]
def thirteen_f(cik, period):
    f = [x for x in subm(cik) if x["form"] == "13F-HR" and x["reportDate"] == period][0]
    return info_table(cik, f["accessionNumber"])
def treasury(year):
    return list(csv.DictReader(io.StringIO(plain(f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv"))))
def fred(i):
    return {d: float(v) for d, v in (l.split(",") for l in plain(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={i}").strip().splitlines()[1:]) if v not in ("", ".")}
def closes(sym, start, end, adjusted=True):
    p1 = int(datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp()); p2 = int(datetime.fromisoformat(end).replace(tzinfo=timezone.utc).timestamp()) + 86399
    r = json.loads(plain(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d&includeAdjustedClose=true"))["chart"]["result"][0]
    off = r["meta"]["gmtoffset"]
    c = r["indicators"]["adjclose"][0]["adjclose"] if adjusted else r["indicators"]["quote"][0]["close"]
    return {datetime.fromtimestamp(t + off, timezone.utc).strftime("%Y-%m-%d"): v for t, v in zip(r["timestamp"], c) if v is not None}
def rets_2025(sym):
    c = closes(sym, "2024-12-31", "2025-12-31"); d = sorted(c)
    return {d[i]: c[d[i]] / c[d[i - 1]] - 1 for i in range(1, len(d))}, c
def max_drawdown(c, start):
    peak, mdd = 0, 0
    for d in sorted(c):
        if d < start: continue
        peak = max(peak, c[d]); mdd = min(mdd, c[d] / peak - 1)
    return mdd
N = lambda x: 0.5 * math.erfc(-x / math.sqrt(2))
def bs(S, K, T, r, q, v, call=True):
    d1 = (math.log(S / K) + (r - q + v * v / 2) * T) / (v * math.sqrt(T)); d2 = d1 - v * math.sqrt(T)
    return S * math.exp(-q * T) * N(d1) - K * math.exp(-r * T) * N(d2) if call else K * math.exp(-r * T) * N(-d2) - S * math.exp(-q * T) * N(-d1)

def frame(tag, unit, period, tax="us-gaap"):
    """One XBRL frame: {cik: row}. A missing frame is empty."""
    try:
        d = json.loads(sec(f"https://data.sec.gov/api/xbrl/frames/{tax}/{tag}/{unit.replace('/', '-per-')}/{period}.json"))
    except Exception:
        return {}
    return {r["cik"]: r for r in d["data"]}
def listed():
    d = json.loads(sec("https://www.sec.gov/files/company_tickers_exchange.json"))
    out = {}
    for cik, name, ticker, exch in d["data"]:
        out.setdefault(cik, (ticker, exch, name))
    return out

def tenk(cik, tag, end, start=None, unit="USD"):
    """The value a company's own 10-K (or 10-K/A) reports for a period, latest filed; None if none."""
    try:
        cc = json.loads(sec(f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{tag}.json"))
    except Exception:
        return None
    hits = [x for x in cc["units"].get(unit, []) if x["form"] in ("10-K", "10-K/A") and x["end"] == end and (start is None or x.get("start") == start)]
    return sorted(hits, key=lambda x: x["filed"])[-1]["val"] if hits else None
