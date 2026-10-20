"""Truths for the analyst questions, independent of the tools they test.

Statement figures come from SEC's companyfacts XBRL API (one JSON per company, a different SEC
product from the rendered R pages financial_statements reads). Table figures come from the raw
10-K HTML through this file's own row reader. Guidance answers are the releases' own words, in
questions.json (expect + source_quote), read by hand.

    python3 -I bench/analyst/truth.py            # writes bench/analyst/truth.json
"""
import datetime
import hashlib
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
UA = {"User-Agent": "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)"}
SEEN = {}


def get(url):
    if url in SEEN:
        return SEEN[url]
    time.sleep(0.15)
    body = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    SEEN[url] = (body, hashlib.sha256(body).hexdigest())
    return SEEN[url]


def days(start, end):
    a = datetime.date.fromisoformat(start)
    b = datetime.date.fromisoformat(end)
    return (b - a).days


def fact(cik, concepts, end=None, instant=None, unit=None):
    """The value a company's latest 10-K reports for a concept and period."""
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
    body, digest = get(url)
    facts = json.loads(body)["facts"]
    for concept in concepts:
        ns, name = concept.split(":")
        entry = facts.get(ns, {}).get(name)
        if not entry:
            continue
        for u, rows in entry["units"].items():
            if unit and u != unit:
                continue
            if not unit and u not in ("USD", "USD/shares"):
                continue
            hits = []
            for r in rows:
                if not str(r.get("form", "")).startswith("10-K"):
                    continue
                if instant and r.get("end") == instant and "start" not in r:
                    hits.append(r)
                if end and r.get("end") == end and "start" in r and 350 <= days(r["start"], r["end"]) <= 380:
                    hits.append(r)
            if hits:
                best = max(hits, key=lambda r: (r["filed"], r["accn"]))
                return {"value": best["val"], "concept": concept, "unit": u, "accession": best["accn"], "filed": best["filed"], "source": url, "sha256": digest}
    raise LookupError(f"CIK {cik}: no 10-K fact for {concepts} at {end or instant}")


def main_document(cik, accession):
    sub, _ = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    recent = json.loads(sub)["filings"]["recent"]
    i = recent["accessionNumber"].index(accession)
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/{recent['primaryDocument'][i]}"


def row_numbers(cik, accession, label, count, after=None):
    """The first numbers in the first table row whose text holds the label (after a phrase, if given)."""
    url = main_document(cik, accession)
    body, digest = get(url)
    doc = body.decode("utf-8", errors="replace")
    if after:
        # The phrase in the raw HTML, tags and non-breaking spaces allowed between its words.
        gap = r"(?:\s|<[^>]+>|&#160;|&nbsp;)+"
        m = re.search(gap.join(re.escape(w) for w in after.split()), doc, re.I)
        if not m:
            raise LookupError(f"{url}: no '{after}'")
        doc = doc[m.end():]
    for tr in re.findall(r"(?is)<tr\b.*?</tr>", doc):
        cells = [html.unescape(re.sub(r"<[^>]+>", " ", c)).replace("\xa0", " ").strip() for c in re.findall(r"(?is)<td\b[^>]*>(.*?)</td>", tr)]
        text = " ".join(c for c in cells if c)
        if label.lower() not in text.lower():
            continue
        nums = [float(n.replace(",", "")) for c in cells for n in re.findall(r"^\(?\$?\s*([\d,]+(?:\.\d+)?)\)?$", c.strip())]
        if len(nums) >= count:
            return {"values": nums[:count], "row": text[:200], "source": url, "sha256": digest}
    raise LookupError(f"{url}: no row with '{label}' and {count} numbers")


def main():
    questions = json.loads((HERE / "questions.json").read_text())["questions"]
    out = {}
    for q in questions:
        t = q.get("truth")
        try:
            if not t:
                out[q["id"]] = {"given": q["expect"], "source_quote": q.get("source_quote")}
            elif t["kind"] == "fact":
                f = fact(t["cik"], t["concepts"], t.get("end"), t.get("instant"), t.get("unit"))
                out[q["id"]] = {**f, "values": [f["value"]]}
            elif t["kind"] == "facts":
                fs = [fact(t["cik"], t["concepts"], end=e, unit=t.get("unit")) for e in t["ends"]]
                out[q["id"]] = {"values": [f["value"] for f in fs], "concept": fs[0]["concept"], "accessions": [f["accession"] for f in fs], "source": fs[0]["source"], "sha256": fs[0]["sha256"]}
            elif t["kind"] == "html_row":
                rows = [row_numbers(t["cik"], a, t["label"], t["count"], t.get("after")) for a in t["accessions"]]
                vals = []
                for r in rows:
                    vals += [v for v in r["values"] if v not in vals]
                out[q["id"]] = {"values": vals, "rows": [r["row"] for r in rows], "sources": [r["source"] for r in rows], "sha256": [r["sha256"] for r in rows]}
            print(q["id"], out[q["id"]].get("values", out[q["id"]].get("given")))
        except Exception as err:  # a truth that cannot be built is recorded, not guessed
            out[q["id"]] = {"error": str(err)}
            print(q["id"], "ERROR", err, file=sys.stderr)
    payload = {"built": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "truths": out}
    (HERE / "truth.json").write_text(json.dumps(payload, indent=1) + "\n")


if __name__ == "__main__":
    main()
