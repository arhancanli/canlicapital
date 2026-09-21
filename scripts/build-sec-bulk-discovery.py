"""Build cohort discovery files from SEC's bulk companyfacts archive.

scripts/prepare-company-batch.mjs reads a discovery object in the shape of SEC's
company_tickers.json ({"0": {"cik_str": 320193, "ticker": "...", "title": "..."}}).
The pinned ticker file lists 8,031 CIKs and misses most active XBRL filers, so
this script derives discovery slices from the bulk archive instead.

Selection: entities with US-GAAP facts from 10-K, 10-Q, 20-F or 40-F filings,
a filing within the two years before the archive snapshot, and at least four
of the concepts the current release publishes. Ranking is by concept coverage
(descending), then latest filing date (descending), then CIK. The result is
written as consecutive slices of SLICE entities so each becomes one capture
queue. A slice is a candidate list only; capture, review, staging and
admission decide what is published.

Usage:
  python3 scripts/build-sec-bulk-discovery.py companyfacts.zip \
    config/company-admission-v22.json OUTPUT_DIR [--snapshot 2026-09-19] [--slice 1000] \
    [--exclude-delivery delivery.json] [--exclude-ledger prior-queues.json]

Exclusions mirror scripts/prepare-company-batch.mjs (companies already in a
delivery, CIKs in any pinned prior queue) so that every slice holds exactly
SLICE new candidates in ranking order; the batch script re-applies the same
exclusions when it writes a queue.
"""
import hashlib
import json
import re
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

FORMS = {"10-K", "10-Q", "10-K/A", "10-Q/A", "20-F", "40-F"}


def sha256_path(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(argv):
    zip_path, admission_path, out_dir = argv[0], argv[1], Path(argv[2])
    snapshot = argv[argv.index("--snapshot") + 1] if "--snapshot" in argv else "2026-09-19"
    slice_size = int(argv[argv.index("--slice") + 1]) if "--slice" in argv else 1000
    recent_from = (date.fromisoformat(snapshot) - timedelta(days=730)).isoformat()
    concepts = set(json.load(open(admission_path))["concepts"])
    out_dir.mkdir(parents=True, exist_ok=True)
    excluded, exclusions = set(), []
    if "--exclude-delivery" in argv:
        path = argv[argv.index("--exclude-delivery") + 1]
        delivery = json.load(open(path))
        assert delivery["schema"] == "canli.company-delivery.v1"
        ciks = {int(row["cik"]) for row in delivery["files"]}
        excluded |= ciks
        exclusions.append({"kind": "delivery", "path": path, "sha256": sha256_path(path), "ciks": len(ciks)})
    if "--exclude-ledger" in argv:
        path = argv[argv.index("--exclude-ledger") + 1]
        ledger = json.load(open(path))
        assert ledger["schema"] == "canli.company-prior-queues.v1"
        ciks = set()
        for queue in ledger["queues"]:
            body = Path(queue["path"]).read_bytes()
            assert hashlib.sha256(body).hexdigest() == queue["sha256"], queue["path"]
            ciks |= {int(cik) for cik in json.loads(body)}
        excluded |= ciks
        exclusions.append({"kind": "prior-queues", "path": path, "sha256": sha256_path(path), "ciks": len(ciks)})

    ranked = []
    skipped_identity = 0
    excluded_seen = 0
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            member = re.fullmatch(r"CIK(\d{10})\.json", info.filename)
            if not member:
                continue
            name_cik = int(member.group(1))
            try:
                data = json.loads(archive.read(info))
            except Exception:
                continue
            usgaap = data.get("facts", {}).get("us-gaap", {})
            if not usgaap:
                continue
            latest = ""
            present = 0
            for tag, body in usgaap.items():
                reported = False
                for rows in body.get("units", {}).values():
                    for row in rows:
                        if row.get("form") in FORMS:
                            reported = True
                            filed = row.get("filed", "")
                            if filed > latest:
                                latest = filed
                if reported and tag in concepts:
                    present += 1
            if latest < recent_from or present < 4:
                continue
            if name_cik in excluded:
                excluded_seen += 1
                continue
            # The member name is the archive's own identity; a body that disagrees is skipped.
            if "cik" in data and int(data["cik"]) != name_cik:
                skipped_identity += 1
                continue
            ranked.append((-present, latest, name_cik, data.get("entityName", "")))
    ranked.sort(key=lambda row: (row[0], "" if not row[1] else "".join(chr(255 - ord(c)) for c in row[1]), row[2]))

    slices = []
    for index in range(0, len(ranked), slice_size):
        rows = ranked[index:index + slice_size]
        discovery = {str(i): {"cik_str": cik, "ticker": "", "title": name} for i, (_, _, cik, name) in enumerate(rows)}
        name = f"discovery-slice-{index // slice_size + 1:02d}.json"
        path = out_dir / name
        bytes_ = (json.dumps(discovery, indent=2) + "\n").encode()
        path.write_bytes(bytes_)
        slices.append({"file": name, "sha256": hashlib.sha256(bytes_).hexdigest(), "entities": len(rows),
                       "concept_coverage_range": [-rows[0][0], -rows[-1][0]], "latest_filed_range": [min(r[1] for r in rows), max(r[1] for r in rows)]})
    summary = {
        "schema": "canli.sec-bulk-discovery.v1",
        "archive": {"path": str(zip_path), "sha256": sha256_path(zip_path), "snapshot": snapshot},
        "admission_concepts": {"path": admission_path, "count": len(concepts)},
        "rules": {"forms": sorted(FORMS), "filed_on_or_after": recent_from, "minimum_current_concepts": 4,
                  "ranking": "concept coverage descending, latest filing date descending, CIK ascending"},
        "exclusions": exclusions,
        "eligible_entities_excluded_as_known": excluded_seen,
        "eligible_entities": len(ranked),
        "skipped_identity_mismatch": skipped_identity,
        "slice_size": slice_size,
        "slices": slices,
        "scope": "Candidate discovery only. Not capture, review, admission, release or indexing.",
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps({"eligible_entities": len(ranked), "slices": len(slices), "first_slice": slices[0] if slices else None}))


if __name__ == "__main__":
    main(sys.argv[1:])
