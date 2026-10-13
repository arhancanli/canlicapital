"""What canli-mcp costs a client in context and start-up, against its seven packs run separately.

Starts canli-mcp (this checkout) and each pack's own server from node_modules over stdio, reads the
instructions (from initialize) and the whole tool list (following nextCursor), and counts both in
o200k_base tokens as a client receives them: the tool objects exactly as tools/list returns them,
plus the instructions. Start-up is the median time from launch to the tool list over five launches.
No model is called and nothing leaves the machine.

    uv run --with tiktoken python bench/context.py [--json]
"""

import json
import os
import pathlib
import statistics
import subprocess
import sys
import time

import tiktoken

HERE = pathlib.Path(__file__).resolve().parents[1]
PACKS = ["canli-quant-mcp", "canli-validation-mcp", "canli-fundamentals-mcp", "canli-research-mcp",
         "canli-backtest-mcp", "canli-markets-mcp", "canli-paper-trading-mcp"]
O200K = tiktoken.get_encoding("o200k_base")
LAUNCHES = 5


def read(proc, want_id):
    for line in proc.stdout:
        line = line.strip()
        if not line.startswith("{"):
            continue
        reply = json.loads(line)
        if reply.get("id") == want_id:
            if "error" in reply:
                raise RuntimeError(reply["error"])
            return reply["result"]
    raise EOFError(want_id)


def launch(server_file):
    # Enable all seven flagship packs, including paper, for the same coverage as the separate
    # servers. Initialization and listing make no broker call and need no credentials.
    env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "CANLI_PACKS": "all"}
    t0 = time.perf_counter()
    proc = subprocess.Popen(["node", str(server_file)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, env=env)
    send = lambda m: (proc.stdin.write(json.dumps(m) + "\n"), proc.stdin.flush())
    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "count", "version": "0"}}})
        init = read(proc, 1)
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        tools, cursor, ask = [], None, 2
        while True:
            send({"jsonrpc": "2.0", "id": ask, "method": "tools/list", "params": {"cursor": cursor} if cursor else {}})
            page = read(proc, ask)
            tools += page.get("tools", [])
            cursor = page.get("nextCursor")
            ask += 1
            if not cursor:
                break
        seconds = time.perf_counter() - t0
    finally:
        proc.kill()
    return init, tools, seconds


def measure(server_file):
    runs = [launch(server_file) for _ in range(LAUNCHES)]
    init, tools, _ = runs[0]
    instructions = init.get("instructions") or ""
    tool_tokens = len(O200K.encode(json.dumps(tools, separators=(",", ":"))))
    instruction_tokens = len(O200K.encode(instructions)) if instructions else 0
    return {"version": init.get("serverInfo", {}).get("version"), "tools": len(tools), "tool_tokens": tool_tokens,
            "instruction_tokens": instruction_tokens, "total_tokens": tool_tokens + instruction_tokens,
            "startup_ms": round(statistics.median(r[2] for r in runs) * 1000)}


def main():
    rows = {"canli-mcp": measure(HERE / "src" / "server.mjs")}
    for pack in PACKS:
        rows[pack] = measure(HERE / "node_modules" / pack / "src" / "server.mjs")
    packs = [r for name, r in rows.items() if name != "canli-mcp"]
    separately = {"tools": sum(r["tools"] for r in packs), "total_tokens": sum(r["total_tokens"] for r in packs),
                  "startup_ms": [min(r["startup_ms"] for r in packs), max(r["startup_ms"] for r in packs)]}
    node = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()
    if "--json" in sys.argv:
        print(json.dumps({"measured": time.strftime("%Y-%m-%d"), "node": node, "tokenizer": "o200k_base", "configuration": {"CANLI_PACKS": "all", "scope": "initial tool list and instructions; no tool execution"},
                          "rows": rows, "seven_separately": separately}, indent=2))
        return
    print(f"Node {node}, o200k_base")
    print("| server | version | tools | tokens | start-up |")
    print("|---|---|---|---|---|")
    for name, r in rows.items():
        print(f"| {name} | {r['version']} | {r['tools']} | {r['total_tokens']:,} | {r['startup_ms']} ms |")
    lo, hi = separately["startup_ms"]
    print(f"| seven separately | | {separately['tools']} | {separately['total_tokens']:,} | {lo}-{hi} ms each |")


main()
