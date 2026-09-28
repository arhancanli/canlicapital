"""Independent point-in-time selection over SEC companyfacts, for checking cross_section.

For each (company snapshot, as_of): among us-gaap:NetIncomeLoss USD facts, drop registration
statements and prospectuses (424B, S-, F-, POS forms), keep annual durations (350 to 380 days,
inclusive), group by (start, end), order each period's filings by (filed, accession), take the last
filing on or before as_of, and report the period with the latest end (then latest start) that has
one. changed_after: any later filing of that period reported a different value.
Written from that rule, not from the JavaScript. Usage: python reference.py <cases.json>
"""
import datetime as dt
import gzip
import json
import re
import sys

NON_PERIODIC = re.compile(r"^(424B|S-\d|F-\d|POS )")


def pick(facts, as_of):
    rows = facts.get("facts", {}).get("us-gaap", {}).get("NetIncomeLoss", {}).get("units", {}).get("USD", [])
    periods = {}
    for r in rows:
        if not r.get("start") or NON_PERIODIC.match(r.get("form") or ""):
            continue
        days = (dt.date.fromisoformat(r["end"]) - dt.date.fromisoformat(r["start"])).days + 1
        if not 350 <= days <= 380:
            continue
        periods.setdefault((r["start"], r["end"]), []).append(r)
    best = None
    for (start, end), vs in periods.items():
        vs.sort(key=lambda v: (v["filed"], v.get("accn") or ""))
        known = [i for i, v in enumerate(vs) if v["filed"] <= as_of]
        if not known:
            continue
        i = known[-1]
        cand = (end, start, vs[i], any(v["val"] != vs[i]["val"] for v in vs[i + 1:]))
        if best is None or (cand[0], cand[1]) > (best[0], best[1]):
            best = cand
    if best is None:
        return None
    end, start, v, changed = best
    return {"end": end, "start": start, "val": v["val"], "filed": v["filed"], "accn": v.get("accn"), "changed_after": changed}


def main():
    cases = json.load(open(sys.argv[1]))
    out = []
    for c in cases:
        facts = json.loads(gzip.open(c["snapshot"]).read())
        out.append({"cik": c["cik"], "as_of": c["as_of"], "pick": pick(facts, c["as_of"])})
    print(json.dumps(out))


main()
