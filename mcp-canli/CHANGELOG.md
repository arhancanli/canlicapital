# Changelog

## Unreleased

## 0.1.0

First release: every Canli Capital MCP server in one process. 272 tools from canli-quant-mcp,
canli-validation-mcp (run locally), canli-fundamentals-mcp, canli-research-mcp, canli-backtest-mcp
and canli-paper-trading-mcp, behind `find_tool`, `describe_tool` and `run_tool`.

- 995 tokens of context by default, against 18,158 for the six servers listed separately (o200k).
- A prebuilt search index; each pack's code loads the first time one of its tools is used.
- Batches of up to 25 calls, `$result` references between calls and `return: "last"`.
- `$file` references for long data, read on this machine.
- `CANLI_OFFLINE=1`, enforced by a test that poisons the network; paper trading only with
  Alpaca paper keys; `canli://privacy` states what every pack sends and stores.
