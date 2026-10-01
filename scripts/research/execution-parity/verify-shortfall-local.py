"""Read-only parity check against ALPHAC's local paper-order analysis.

Run with the engine's Python environment (pandas/pyarrow), passing --engine-root and optionally
--output. No orders are sent and neither databases nor source artifacts are changed. Only
aggregate results leave this process; order/price rows are passed to local Node over stdin.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--engine-root", type=Path, required=True)
parser.add_argument("--output", type=Path)
args = parser.parse_args()
engine = args.engine_root.resolve()
repo = Path(__file__).resolve().parents[3]
source = engine / "scripts/analyze_implementation_shortfall.py"
spec = importlib.util.spec_from_file_location("recorded_shortfall", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cases, expected = {}, {}
for sleeve, db in module.SLEEVES.items():
    orders = module.load_orders(db)  # the source opens SQLite with mode=ro
    bars = module.load_bars(orders.instrument_id.tolist())
    reference_rows, exclusions = module.decompose(orders, bars)
    expected[sleeve] = {**module.summarize(reference_rows), "excluded": exclusions}
    encoded = []
    for i, raw in enumerate(orders.itertuples(index=False)):
        row = {"id": f"record-{i}", "side": raw.side.lower(), "qty": float(raw.qty), "fills": []}
        frame = bars.get(raw.instrument_id)
        session = dt.datetime.fromtimestamp(raw.fill_ts / 1000, dt.UTC).date()
        if frame is not None and session in frame.index:
            prior = frame.index[frame.index < session]
            if len(prior):
                row.update(decision_price=float(frame.loc[prior[-1], "close"]),
                           arrival_mid=float(frame.loc[session, "open"]),
                           horizon_price=float(frame.loc[session, "close"]))
                if raw.status == module.FILLED and raw.fill_price and raw.filled_qty > 0:
                    row["fills"] = [{"qty": float(raw.filled_qty), "price": float(raw.fill_price)}]
        encoded.append(row)
    cases[sleeve] = encoded

program = """
import { readFileSync } from 'node:fs';
const {measureShortfall} = await import(process.argv[1]);
const cases = JSON.parse(readFileSync(0, 'utf8'));
const results = Object.fromEntries(Object.entries(cases).map(([name, orders])=>{
 const {rows, ...summary} = measureShortfall({orders}); return [name, summary];
}));
process.stdout.write(JSON.stringify(results));
"""
proc = subprocess.run(["node", "--input-type=module", "-e", program, (repo / "js/shortfall-core.js").as_uri()],
                      input=json.dumps(cases, allow_nan=False), text=True, capture_output=True, check=True)
actual = json.loads(proc.stdout)
comparisons = {}
for sleeve, reference in expected.items():
    result = actual[sleeve]
    fields = {"price_cost_bps": "implementation_shortfall_bps_of_decision_notional",
              "fill_rate_by_count": "fill_rate_by_count", "fill_rate_by_notional": "fill_rate_by_notional",
              "decision_notional_usd": "decision_notional_usd"}
    matches = {}
    for field, reference_field in fields.items():
        a, b = result["aggregate"][field], reference[reference_field]
        tolerance = 1e-9 if field == "decision_notional_usd" else 1e-9 if field == "price_cost_bps" else 1e-12
        matches[field] = {"actual": a, "reference": b, "absolute_difference": abs(a - b), "tolerance": tolerance, "pass": math.isclose(a, b, rel_tol=0, abs_tol=tolerance)}
    matches["orders"] = {"actual": result["orders"], "reference": reference["orders"], "pass": result["orders"] == reference["orders"]}
    comparisons[sleeve] = {"checks": matches, "fees": "not supplied by the source analysis; total including fees remains unknown",
                           "total_including_fees_bps": result["aggregate"]["total_bps"], "excluded": result["excluded"]}
report = {"checked_at": dt.datetime.now(dt.UTC).isoformat(), "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=engine, text=True).strip(),
          "source_analysis_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "comparisons": comparisons,
          "core_sha256": hashlib.sha256((repo / "js/shortfall-core.js").read_bytes()).hexdigest(),
          "captured_input_sha256": hashlib.sha256(json.dumps(cases, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest(),
          "pass": all(check["pass"] for item in comparisons.values() for check in item["checks"].values()),
          "boundary": "Local recorded paper data; not funded execution. No source order/price rows are published by this report."}
text = json.dumps(report, indent=2, allow_nan=False) + "\n"
if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text)
print(text)
raise SystemExit(0 if report["pass"] else 1)
