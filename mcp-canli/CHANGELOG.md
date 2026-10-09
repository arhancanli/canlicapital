# Changelog

## Unreleased

- Fix: `digits` rounded whole numbers too, so with `digits: 6` a 13F's 227,917,808 shares came back
  as 227,918,000 and a CIK changed. It now rounds fractions only; counts, shares, IDs and dollar
  totals stay exact. Found by the rival benchmark (`bench/rivals`).
- `select` and `$result` paths take column names on tables: `rows.0.accession`, `rows.close`.
- Every result has a ref (`"r1"`, `"r2"`, ...) that a later `run_tool` call can pass as
  `{"$result": "r1", "path": "close"}`, so data fetched in one call feeds the next without being
  copied through the model (the last 32 results are kept, in this process only).
- `find_tool` finds the fundamentals tools for revenue, net income and EPS questions.

- New pack, markets (canli-markets-mcp): SEC filings and their sections, EDGAR full-text search,
  insider trades, 13F holdings, Treasury yields, FRED series and prices from the sources, no key
  (your Alpaca or Tiingo key is used for prices when set). 281 tools; `economic_series` and `price_history` return columns
  that feed straight into the quant tools through `$result`.
- Context re-measured on 2026-10-09: 1,109 tokens, against 22,355 for the seven servers listed
  separately (0.1.0's 995 was measured before the argument signatures were added; it is 1,037).

## 0.1.0

First release: every Canli Capital MCP server in one process. 272 tools from canli-quant-mcp,
canli-validation-mcp (run locally), canli-fundamentals-mcp, canli-research-mcp, canli-backtest-mcp
and canli-paper-trading-mcp, behind `find_tool`, `describe_tool` and `run_tool`.

- 995 tokens of context by default, against 18,158 for the six servers listed separately (o200k).
- A prebuilt search index; each pack's code loads the first time one of its tools is used.
- Batches of up to 25 calls, `$result` references between calls and `return: "last"`.
- `$file` references for long data, read on this machine.
- `find_tool` rows include each tool's argument signature (about 27 tokens, against 274 for
  `describe_tool`), and argument errors repeat it. `select` returns only the named fields.
- Fixes from an agent evaluation (`bench/`):
  - search no longer filters by pack;
  - run options are moved out of a call's arguments;
  - a `column` list is read as `columns`;
  - missing `select` fields list the fields that exist.
- `CANLI_OFFLINE=1`, enforced by a test that poisons the network; paper trading only with
  Alpaca paper keys; `canli://privacy` states what every pack sends and stores.
