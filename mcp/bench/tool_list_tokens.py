"""Tokens of the tool list a model is sent on every turn, for every toolset and for all of them.

Reproduces the README's "Toolsets" figures. Launches this package's server over stdio with each
CANLI_TOOLSETS value, reads tools/list, and counts the list in the shape an OpenAI-style client
sends it (name, description, input schema). Tokenizer: tiktoken o200k_base; other models'
tokenizers give different absolute counts.

    uv run --with tiktoken python bench/tool_list_tokens.py
"""

import json
import os
import pathlib
import subprocess

import tiktoken

SERVER = pathlib.Path(__file__).resolve().parent.parent / "src" / "server.mjs"
ENC = tiktoken.get_encoding("o200k_base")
TOOLSETS = ["all", "validate", "receipts", "company", "status"]


def tool_list(toolsets):
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "count", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    env = {**os.environ, "CANLI_TOOLSETS": toolsets, "CANLI_KEY": ""}
    proc = subprocess.Popen(["node", str(SERVER)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
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


full = len(ENC.encode(json.dumps(tool_list("all"), separators=(",", ":"))))
print("| CANLI_TOOLSETS | tools | tokens per turn | of all |")
print("|---|---|---|---|")
for name in TOOLSETS:
    tools = tool_list(name)
    n = len(ENC.encode(json.dumps(tools, separators=(",", ":"))))
    print(f"| `{name}` | {len(tools)} | {n:,} | {100 * n / full:.0f}% |")
