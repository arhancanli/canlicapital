"""What each server in the benchmark costs in context before the model has asked anything.

Starts every server the benchmark compares over stdio with the same commands as arms.mjs, reads its
instructions (from initialize) and its whole tool list (following nextCursor), and counts both in
o200k_base tokens, in the shape an OpenAI-style client sends tools (name, description, parameters),
as scripts/bench/mcp-tool-tokens.py does for Canli's own servers. No model is called.

    uv run --with tiktoken python context.py [--json]
"""

import json
import os
import pathlib
import subprocess
import sys
import time

import tiktoken

HERE = pathlib.Path(__file__).resolve().parent
RIVALS = pathlib.Path(os.environ.get("RIVALS_DIR", pathlib.Path.home() / "canli-bench-rivals"))
EDGAR_ID = {"EDGAR_IDENTITY": "Canli Capital benchmark research@example.com"}
SERVERS = {
    "canli-mcp": (["node", str(HERE.parents[1] / "src" / "server.mjs")], {}),
    "openbb (all tools)": ([str(RIVALS / ".venv/bin/openbb-mcp"), "--transport", "stdio"], {}),
    "openbb (tool discovery, as benchmarked)": ([str(RIVALS / ".venv/bin/openbb-mcp"), "--transport", "stdio", "--tool-discovery"], {}),
    "edgartools": ([str(RIVALS / ".venv-edgar/bin/edgartools-mcp")], EDGAR_ID),
    "yahoo": ([str(RIVALS / "yfmcp/.venv313/bin/python"), str(RIVALS / "yfmcp/server.py")], {}),
}
O200K = tiktoken.get_encoding("o200k_base")


def read(proc, want_id, timeout=240):
    start = time.time()
    for line in proc.stdout:
        if time.time() - start > timeout:
            raise TimeoutError(want_id)
        line = line.strip()
        if not line.startswith("{"):
            continue  # a server that prints to stdout (the Yahoo server does) is not speaking JSON-RPC there
        reply = json.loads(line)
        if reply.get("id") == want_id:
            if "error" in reply:
                raise RuntimeError(reply["error"])
            return reply["result"]
    raise EOFError(want_id)


def measure(command, extra_env):
    env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], **extra_env}
    t0 = time.time()
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
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
        seconds = time.time() - t0
    finally:
        proc.kill()
    shaped = [{"type": "function", "function": {"name": t["name"], "description": t.get("description", ""),
                                                "parameters": {k: v for k, v in (t.get("inputSchema") or {}).items() if k != "$schema"}}} for t in tools]
    instructions = init.get("instructions") or ""
    tool_tokens = len(O200K.encode(json.dumps(shaped, separators=(",", ":"))))
    instruction_tokens = len(O200K.encode(instructions)) if instructions else 0
    return {"server": init.get("serverInfo", {}), "tools": len(tools), "tool_tokens": tool_tokens,
            "instruction_tokens": instruction_tokens, "total_tokens": tool_tokens + instruction_tokens,
            "seconds_to_list": round(seconds, 2)}


def main():
    rows = {}
    for name, (command, extra_env) in SERVERS.items():
        try:
            rows[name] = measure(command, extra_env)
        except Exception as error:  # report a server that will not start, do not hide it
            rows[name] = {"error": f"{type(error).__name__}: {error}"[:300]}
    if "--json" in sys.argv:
        print(json.dumps({"measured": time.strftime("%Y-%m-%d"), "tokenizer": "o200k_base", "rows": rows}, indent=2))
        return
    print("| server | tools | tool-list tokens | instruction tokens | total |")
    print("|---|---|---|---|---|")
    for name, r in rows.items():
        if "error" in r:
            print(f"| {name} | error: {r['error']} | | | |")
        else:
            print(f"| {name} | {r['tools']:,} | {r['tool_tokens']:,} | {r['instruction_tokens']:,} | {r['total_tokens']:,} |")


main()
