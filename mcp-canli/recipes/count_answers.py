"""Count the tool calls in an MCP session log that the server answered without an error.

python3 count_answers.py answers.log    prints the count; recipes CI needs at least one

answers.log is the server's standard output, one JSON-RPC message a line. A tool's answer is a result with content;
a refused call is a JSON-RPC error, or a result that says isError.
"""
import json
import sys

ok = 0
try:
    lines = open(sys.argv[1], encoding="utf-8")
except FileNotFoundError:
    lines = []
for line in lines:
    try:
        m = json.loads(line)
    except ValueError:
        continue
    r = m.get("result") if isinstance(m, dict) else None
    if isinstance(r, dict) and "content" in r and not r.get("isError"):
        ok += 1
print(ok)
