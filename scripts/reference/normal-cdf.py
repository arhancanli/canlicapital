"""Reference values for js/dsr-core.js normalCdf and normalPpf, from the C library's erfc.

Writes js/fixtures/normal-cdf-reference.json: Phi(x) = erfc(-x / sqrt(2)) / 2 at x from -37 to 8,
dense near the centre and through the tails. Run: python3 scripts/reference/normal-cdf.py
"""
import json
import math
from pathlib import Path

xs = sorted({round(-37 + i * 0.5, 2) for i in range(91)} | {round(-4 + i * 0.05, 2) for i in range(161)})
points = [[x, 0.5 * math.erfc(-x / math.sqrt(2))] for x in xs]
out = Path(__file__).resolve().parents[2] / "js" / "fixtures" / "normal-cdf-reference.json"
out.write_text(json.dumps({"source": "0.5 * math.erfc(-x / math.sqrt(2)), CPython math module (C library erfc)", "points": points}, indent=0) + "\n")
print(f"wrote {len(points)} points to {out}")
