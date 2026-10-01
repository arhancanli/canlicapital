"""Local stdio latency and token cost on deterministic synthetic orders, not market fills.

uv run --no-project --with tiktoken python scripts/bench/execution-shortfall.py > report.json
Measures the full local tools/call round trip after three warmups; no network or broker calls.
"""

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import platform
import select
import statistics
import subprocess
import tempfile
import time

import tiktoken

ROOT = Path(__file__).resolve().parents[2]
ENCODINGS = {name: tiktoken.get_encoding(name) for name in ("o200k_base", "cl100k_base")}


def compact(value):
    return json.dumps(value, separators=(",", ":"))


def quantile(values, p):
    ordered = sorted(values)
    position = (len(ordered) - 1) * p
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def inputs(n, bootstrap):
    start = dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc)
    args = {"fill_source": "simulated", "orders": []}
    for i in range(n):
        stamp = lambda offset: (start + dt.timedelta(seconds=i + offset)).isoformat()
        args["orders"].append({
            "id": f"synthetic-{i}", "side": "buy" if i % 2 else "sell", "qty": 100,
            "decision_price": 100, "decision_ts": stamp(0), "arrival_mid": 100.05,
            "horizon_price": 100.2,
            "fills": [{"qty": 60 + i % 41, "price": 100.1 + (i % 7) * .01, "fee": .1, "ts": stamp(1)}],
        })
    if bootstrap:
        args.update(seed=20261001, bootstrap={"block_length": 5, "resamples": 199})
    return args


def main():
    load_at_start = os.getloadavg()
    env = {**os.environ, "CANLI_KEY": "", "CANLI_EXEC_TOOLSETS": "all"}
    proc = subprocess.Popen(["node", str(ROOT / "mcp-execution/src/server.mjs")],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
    temporary = tempfile.TemporaryDirectory(prefix="canli-shortfall-bench-")
    request_id = 0

    def rpc(method, params):
        nonlocal request_id
        request_id += 1
        payload = compact({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
        began = time.perf_counter_ns()
        proc.stdin.write(payload + "\n")
        proc.stdin.flush()
        while True:
            if not select.select([proc.stdout], [], [], 30)[0]:
                raise TimeoutError(f"no stdio response to {method}")
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError(f"server exited with {proc.poll()}")
            reply = json.loads(line)
            if reply.get("id") == request_id:
                elapsed = (time.perf_counter_ns() - began) / 1e6
                if "error" in reply or reply.get("result", {}).get("isError"):
                    raise RuntimeError(f"synthetic benchmark refused: {reply}")
                return reply["result"], elapsed

    try:
        rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "local-shortfall-bench", "version": "1"}})
        proc.stdin.write(compact({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
        proc.stdin.flush()
        rpc("tools/list", {})
        cases = []
        for n, bootstrap, local_file in [(100, False, False), (1000, False, False), (100, True, False), (1000, True, False), (1000, False, True), (1000, True, True)]:
            args = inputs(n, bootstrap)
            if local_file:
                path = Path(temporary.name) / f"orders-{n}-{bootstrap}.json"
                path.write_text(compact(args.pop("orders")))
                args["orders_file"] = str(path)
            for _ in range(3):
                rpc("tools/call", {"name": "measure_shortfall", "arguments": args})
            timings = []
            for _ in range(10 if bootstrap else 30):
                result, elapsed = rpc("tools/call", {"name": "measure_shortfall", "arguments": args})
                timings.append(elapsed)
            text = result["content"][0]["text"]
            if result["structuredContent"] != json.loads(text):
                raise RuntimeError("text and structured result differ")
            cases.append({
                "orders": n, "input_mode": "local_file" if local_file else "inline", "bootstrap": args.get("bootstrap"), "warmups": 3, "runs": len(timings),
                "latency_ms": {"min": min(timings), "median": statistics.median(timings), "p95": quantile(timings, .95), "max": max(timings)},
                "input_bytes": len(compact(args).encode()), "output_text_bytes": len(text.encode()),
                "output_result_bytes": len(compact(result).encode()),
                "tokens": {name: {"input": len(enc.encode(compact(args))), "output_text": len(enc.encode(text)), "output_result": len(enc.encode(compact(result)))} for name, enc in ENCODINGS.items()},
                "output_sha256": hashlib.sha256(text.encode()).hexdigest(),
            })
        sources = ["js/shortfall-core.js", "mcp-execution/src/measure-shortfall.mjs", "scripts/bench/execution-shortfall.py"]
        print(json.dumps({
            "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "scope": "local stdio tools/call, warm process, aggregate-only results, synthetic USD orders",
            "environment": {"platform": platform.platform(), "node": subprocess.check_output(["node", "--version"], text=True).strip(), "python": platform.python_version(), "load_average_at_start": load_at_start},
            "sources_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sources},
            "cases": cases,
            "limits": ["Single machine; not hosted/network latency or an external comparative benchmark.", "The input payload necessarily scales with supplied fills; tool-list and aggregate output are bounded separately.", "Token counts use explicit o200k_base/cl100k_base encodings, not a universal model billing guarantee. output_result includes both text and structured content."],
        }, indent=2))
    finally:
        temporary.cleanup()
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


if __name__ == "__main__":
    main()
