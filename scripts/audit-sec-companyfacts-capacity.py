"""Capacity inventory of SEC bulk companyfacts for the CanliCapital growth plan.

Reads each CIK##########.json member once, streaming, and records only counts.
Output is a capacity estimate, not admission, editorial approval or indexing.

SEC requires a declared User-Agent; without one the archive answers 403.
    curl -A 'CanliCapital research https://canlicapital.com' -o companyfacts.zip \
      https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip
    python3 scripts/audit-sec-companyfacts-capacity.py companyfacts.zip \
      config/company-admission-v22.json OUTPUT.json
"""
import collections
import json
import sys
import zipfile
from datetime import date

ZIP, ADMISSION, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
admission = json.load(open(ADMISSION))
current_concepts = set(admission["concepts"])
v22_ciks = set(admission["companies"])
RECENT = "2024-09-21"  # filed within the last two years of the 2026-09-19 snapshot
FORMS = {"10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F"}

entities = 0
with_usgaap = 0
active = 0
current_hist = collections.Counter()      # companies by number of the 34 concepts present
tag_companies = collections.Counter()     # us-gaap tag -> companies reporting it (any time)
tag_recent = collections.Counter()        # us-gaap tag -> active companies reporting it recently
filings_per_company = []
filings_recent_companies = 0
ifrs_only = 0
buckets = collections.Counter()
per_company_tag_counts = []

with zipfile.ZipFile(ZIP) as z:
    for info in z.infolist():
        if not info.filename.endswith(".json"):
            continue
        entities += 1
        try:
            data = json.loads(z.read(info))
        except Exception:
            buckets["unparseable"] += 1
            continue
        facts = data.get("facts", {})
        usgaap = facts.get("us-gaap", {})
        if not usgaap:
            if facts.get("ifrs-full"):
                ifrs_only += 1
            buckets["no_usgaap"] += 1
            continue
        with_usgaap += 1
        cik = f"{int(data.get('cik', 0)):010d}"
        accns = set()
        latest_filed = ""
        tags_any = set()
        tags_recent = set()
        for tag, body in usgaap.items():
            reported = False
            recent = False
            for unit_rows in body.get("units", {}).values():
                for row in unit_rows:
                    if row.get("form") in FORMS:
                        reported = True
                        accns.add(row.get("accn"))
                        filed = row.get("filed", "")
                        if filed > latest_filed:
                            latest_filed = filed
                        if filed >= RECENT:
                            recent = True
            if reported:
                tags_any.add(tag)
            if recent:
                tags_recent.add(tag)
        is_active = latest_filed >= RECENT
        active += is_active
        for tag in tags_any:
            tag_companies[tag] += 1
        if is_active:
            for tag in tags_recent:
                tag_recent[tag] += 1
        n_current = len(tags_any & current_concepts)
        current_hist[min(n_current, 34)] += 1
        filings_per_company.append(len(accns))
        per_company_tag_counts.append(len(tags_any))
        buckets["in_v22" if cik in v22_ciks else "not_in_v22"] += 1
        buckets[("active" if is_active else "historical") + ("_in_v22" if cik in v22_ciks else "_not_in_v22")] += 1


def pct(values, q):
    values = sorted(values)
    return values[int(q * (len(values) - 1))] if values else None


eligible_4 = sum(count for n, count in current_hist.items() if n >= 4)
summary = {
    "schema": "canli.sec-companyfacts-capacity.v1",
    "source": "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip",
    "snapshot_last_modified": "2026-09-19",
    "computed_on": date.today().isoformat(),
    "scope": "Capacity counts only. Not editorial admission, page approval or indexing evidence.",
    "entities": entities,
    "entities_with_usgaap_forms": with_usgaap,
    "ifrs_only_entities": ifrs_only,
    "active_filers_last_two_years": active,
    "buckets": dict(buckets),
    "companies_with_at_least_4_of_current_34": eligible_4,
    "current_concept_count_histogram": dict(sorted(current_hist.items())),
    "current_34_histories_all_entities": sum(n * c for n, c in current_hist.items()),
    "filings_per_company": {"total": sum(filings_per_company), "median": pct(filings_per_company, 0.5), "p90": pct(filings_per_company, 0.9)},
    "tags_per_company": {"median": pct(per_company_tag_counts, 0.5), "p90": pct(per_company_tag_counts, 0.9)},
    "top_tags_by_companies": tag_companies.most_common(150),
    "top_tags_by_active_recent_companies": tag_recent.most_common(150),
    "current_concepts": sorted(current_concepts),
}
json.dump(summary, open(OUT, "w"), indent=1)
print(json.dumps({k: summary[k] for k in ["entities", "entities_with_usgaap_forms", "active_filers_last_two_years", "companies_with_at_least_4_of_current_34", "current_34_histories_all_entities", "filings_per_company"]}, indent=1))
