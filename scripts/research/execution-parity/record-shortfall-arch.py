"""Record synthetic stationary-bootstrap oracle cases; ships no market/vendor/order data.

    uv run --no-project --with arch==8.0.0 python scripts/research/execution-parity/record-shortfall-arch.py

The generator knows only the documented cost/notional ratio and arch's sampling API. It does
not import or run JavaScript. Starts/uniforms let the JS sampling rule be checked exactly.
"""
import gzip
import json
import math
from pathlib import Path

import arch
import numpy as np
from arch.bootstrap import StationaryBootstrap

assert arch.__version__ == "8.0.0"
cases = []
for n, seed, block in [(8, 31415, 2), (13, 27183, 3), (21, 12345, 4)]:
    notionals = [1000.0 + 37 * i for i in range(n)]
    costs = [(-1 if i % 3 == 0 else 1) * (i + 1) * 0.37 for i in range(n)]
    rng = np.random.default_rng(seed)
    oracle = StationaryBootstrap(block, np.arange(n), seed=seed)
    draws, values = [], []
    for _ in range(199):
        starts = rng.integers(n, size=n).tolist()
        uniforms = rng.random(n).tolist()
        indices = oracle.update_indices().tolist()
        draws.append({"starts": starts, "uniforms": uniforms, "indices": indices})
        values.append(math.fsum(costs[i] for i in indices) / math.fsum(notionals[i] for i in indices) * 10000)
    low, high = np.percentile(values, [2.5, 97.5])
    cases.append({"seed": seed, "block_length": block, "costs": costs, "notionals": notionals,
                  "low_bps": float(low), "high_bps": float(high), "draws": draws})

out = Path(__file__).resolve().parents[3] / "mcp-execution/test/fixtures/shortfall-arch.json.gz"
data = json.dumps({"oracle": "arch 8.0.0 StationaryBootstrap", "cases": cases}, separators=(",", ":"), allow_nan=False).encode()
out.write_bytes(gzip.compress(data, mtime=0))
print(f"Recorded {len(cases)} synthetic oracle cases, {out.stat().st_size} compressed bytes")
