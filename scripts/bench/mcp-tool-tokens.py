"""Tokens of each Canli MCP server's tool list: what a model is sent on every turn.

Launches each package's server over stdio (working source, or the released copy with --released),
reads tools/list, and counts the list in the shape an OpenAI-style client sends it (name,
description, input schema), in both o200k_base and cl100k_base. One bench for the whole family, so
every server's figure is measured the same way.

    uv run --with tiktoken python scripts/bench/mcp-tool-tokens.py [--released] [--json]
"""

import json
import os
import pathlib
import subprocess
import sys

import tiktoken

ROOT = pathlib.Path(__file__).resolve().parents[2]
SERVERS = {
    "validation": ("mcp", "validation"),
    "fundamentals": ("mcp-fundamentals", "fundamentals"),
    "research": ("mcp-research", "research"),
    "execution": ("mcp-execution", "execution"),
}
ENCODINGS = {name: tiktoken.get_encoding(name) for name in ("o200k_base", "cl100k_base")}


def tool_list(server_file):
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "count", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    env = {**os.environ, "CANLI_KEY": "", "CANLI_TOOLSETS": "all", "CANLI_EXEC_TOOLSETS": "all"}
    proc = subprocess.Popen(["node", str(server_file)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
    for m in messages:
        proc.stdin.write(json.dumps(m) + "\n")
    proc.stdin.flush()
    tools = None
    for line in proc.stdout:
        reply = json.loads(line)
        if reply.get("id") == 2:
            tools = reply["result"]["tools"]
            break
    proc.kill()
    return [
        {"type": "function", "function": {"name": t["name"], "description": t.get("description", ""),
                                          "parameters": {k: v for k, v in t["inputSchema"].items() if k != "$schema"}}}
        for t in tools
    ]


def main():
    released = "--released" in sys.argv
    rows = []
    for name, (working, copy) in SERVERS.items():
        base = ROOT / "mcp-released" / copy if released else ROOT / working
        server = base / "src" / "server.mjs"
        if not server.exists():
            continue
        version = json.loads((base / "package.json").read_text())["version"]
        tools = tool_list(server)
        text = json.dumps(tools, separators=(",", ":"))
        rows.append({"server": name, "version": version, "tools": len(tools), "chars": len(text),
                     **{enc: len(ENCODINGS[enc].encode(text)) for enc in ENCODINGS}})
    if "--json" in sys.argv:
        print(json.dumps({"source": "released" if released else "working", "rows": rows}, indent=2))
        return
    print("| server | version | tools | o200k | cl100k |")
    print("|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['server']} | {r['version']} | {r['tools']} | {r['o200k_base']:,} | {r['cl100k_base']:,} |")


main()
