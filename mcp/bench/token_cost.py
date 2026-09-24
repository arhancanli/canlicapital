"""Token cost of one company_financial_history result in three encodings.

Reproduces the README's "Compact context" figures from a live record. Tokenizer: tiktoken
o200k_base (a public BPE tokenizer); other models' tokenizers give different absolute counts.

    uv run --with tiktoken python bench/token_cost.py [CIK]
"""

import json
import sys
import urllib.request

import tiktoken

CIK = (sys.argv[1] if len(sys.argv) > 1 else "320193").zfill(10)
URL = f"https://canlicapital.com/company-data/{CIK}.json"
COLUMNS = ["end", "val", "accn", "fy", "fp", "form", "filed", "unit"]

record = json.load(urllib.request.urlopen(URL))
concept = max(record["concepts"], key=lambda c: len(c["observations"]))
observations = sorted(concept["observations"], key=lambda o: o["end"], reverse=True)[:40]
base = {
    "schema": "canli.mcp.company-history.v1",
    "company": {"cik": record["cik"], "name": record["name"]},
    "claim_boundary": record["claim_boundary"],
    "policy": record["policy"],
    "source": {"sec_response_url": record["source_url"], "sec_response_sha256": record["source_sha256"],
               "fetched_at": record["fetched_at"]},
}
units = sorted({o["unit"] for o in observations})
columns = [c for c in COLUMNS if not (c == "unit" and len(units) == 1)]
columnar = {"unit": units[0]} if len(units) == 1 else {}
columnar |= {"columns": columns, "rows": [[o.get(c) for c in columns] for o in observations]}
history = {"concept": concept["tag"], "label": concept.get("label")}
encodings = {
    "0.2.0 (indented JSON)": json.dumps({**base, "history": {**history, "observations": observations}}, indent=2),
    "minified JSON": json.dumps({**base, "history": {**history, "observations": observations}}, separators=(",", ":")),
    "0.3.0 (minified, columnar)": json.dumps({**base, "history": {**history, "observations": columnar}}, separators=(",", ":")),
}
enc = tiktoken.get_encoding("o200k_base")
first = len(enc.encode(encodings["0.2.0 (indented JSON)"]))
print(f"{record['name']} {concept['tag']}, {len(observations)} observations")
for name, text in encodings.items():
    tokens = len(enc.encode(text))
    print(f"{name:28s} {tokens:6d} tokens  {100 * (1 - tokens / first):5.1f}% fewer")
