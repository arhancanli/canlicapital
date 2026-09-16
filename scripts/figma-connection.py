"""Use Codex's authenticated MCP transport; never read or expose OAuth tokens.

Examples: python3 scripts/figma-connection.py describe whoami
          python3 scripts/figma-connection.py call whoami '{}'
Only invoke write tools when the user has authorized that operation.
"""
import argparse
import json
import queue
import subprocess
import threading
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["describe", "call", "resource"])
parser.add_argument("tool")
parser.add_argument("arguments", nargs="?", default="{}")
parser.add_argument("--output", help="Save tool-generated JSON or resource text for inspection")
args = parser.parse_args()
process = subprocess.Popen(["codex", "app-server", "--stdio"], stdin=subprocess.PIPE,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
messages = queue.Queue()

def read():
    for line in process.stdout:
        try: messages.put(json.loads(line))
        except ValueError: pass

threading.Thread(target=read, daemon=True).start()

def request(number, method, params):
    process.stdin.write(json.dumps({"id": number, "method": method, "params": params}) + "\n")
    process.stdin.flush()
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        item = messages.get(timeout=max(.1, deadline - time.monotonic()))
        if item.get("id") == number:
            if "error" in item: raise RuntimeError(json.dumps(item["error"]))
            return item["result"]
        if "id" in item and "method" in item:
            raise RuntimeError("Server requested user interaction: " + item["method"])
    raise TimeoutError(method)

try:
    request(1, "initialize", {"clientInfo": {"name": "canli-design-tools", "version": "1.0"}})
    process.stdin.write('{"method":"initialized"}\n')
    process.stdin.flush()
    inventory = request(2, "mcpServerStatus/list", {"detail": "toolsAndAuthOnly"})
    server = next((s for s in inventory["data"] if s["name"] == "figma"), None)
    if not server or (args.action != "resource" and args.tool not in server.get("tools", {})):
        raise RuntimeError("Requested Figma tool is not available")
    if args.action == "describe":
        print(json.dumps(server["tools"][args.tool], indent=2))
    else:
        thread = request(3, "thread/start", {"cwd": "/tmp", "ephemeral": True,
                                            "approvalPolicy": "never", "sandbox": "read-only"})
        if args.action == "resource":
            result = request(4, "mcpServer/resource/read", {"threadId": thread["thread"]["id"],
                              "server": "figma", "uri": args.tool})
        else:
            result = request(4, "mcpServer/tool/call", {"threadId": thread["thread"]["id"],
                              "server": "figma", "tool": args.tool, "arguments": json.loads(args.arguments)})
        if args.output:
            target = Path(args.output)
            target.parent.mkdir(parents=True, exist_ok=True)
            payload = "\n".join(c.get("text", "") for c in result.get("contents", [])) if args.action == "resource" else json.dumps(result, indent=2)
            target.write_text(payload)
            print(json.dumps({"saved": str(target), "characters": len(payload)}))
        else:
            print(json.dumps(result, indent=2))
finally:
    process.terminate()
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired: process.kill(); process.wait()
