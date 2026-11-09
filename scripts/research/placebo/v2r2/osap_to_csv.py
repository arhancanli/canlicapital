"""Placebo study v2, round 2: converts the Open Source Asset Pricing long-short returns file
(PredictorLSretWide.parquet, data release 2026.10) to a plain CSV that the Node code reads. Nothing
is computed: each value is written as Python's repr of the float in the file (percent per month), a
missing value as an empty field, and the date as yyyymm. The parquet file's SHA-256 is checked first.

    python3 osap_to_csv.py <PredictorLSretWide.parquet> <out.csv> <expected sha256>
"""
import hashlib
import sys

import pyarrow.parquet as pq

src, out, want = sys.argv[1], sys.argv[2], sys.argv[3]
got = hashlib.sha256(open(src, "rb").read()).hexdigest()
if got != want:
    raise SystemExit(f"{src}: SHA-256 {got} is not the registered {want}")
table = pq.read_table(src)
cols = table.column_names
if cols[0] != "date":
    raise SystemExit("first column is not date")
data = {c: table.column(c).to_pylist() for c in cols}
with open(out, "w", newline="\n") as f:
    f.write(",".join(["yyyymm"] + cols[1:]) + "\n")
    for i, d in enumerate(data["date"]):
        d = str(d)
        yyyymm = d[0:4] + d[5:7]
        vals = ["" if (v is None or v != v) else repr(float(v)) for v in (data[c][i] for c in cols[1:])]
        f.write(",".join([yyyymm] + vals) + "\n")
