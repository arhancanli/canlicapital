# canli-mcp

Every Canli Capital MCP server in one: 281 finance tools for Claude, Cursor or any MCP client.

- Quant finance: 235 tools covering performance and risk, options and exotics, fixed income,
  portfolios, econometrics, indicators, and a library of 399 strategy sleeves with
  multiple-testing corrections.
- Backtest validation: deflated Sharpe, overfitting probability, data-snooping tests, leakage checks
  and placebo tests, run on your machine.
- Point-in-time SEC fundamentals.
- Market data from the sources, no key: SEC filings and their sections, full-text search, insider
  trades, 13F holdings, Treasury yields, FRED series and prices.
- Canli Capital's open research record.
- Factor backtests without lookahead.
- Alpaca paper trading behind pre-trade checks.

Each pack is a published, separately tested server. This package loads them into one process and
puts three tools in front of them.

```bash
npx -y canli-mcp
```

Claude Code:

```bash
claude mcp add canli -- npx -y canli-mcp
```

Claude Desktop, Cursor or any MCP client:

```json
{ "mcpServers": { "canli": { "command": "npx", "args": ["-y", "canli-mcp"] } } }
```

## Why one server is cheaper and faster

Measured on Node 24 on 2026-10-09 (o200k tokens of the tool objects a client receives, plus the
server instructions):

| | seven servers separately | canli-mcp |
|---|---|---|
| tool list and instructions sent with every request | 22,211 tokens | 1,041 tokens |
| processes | 7 | 1 |
| start-up | about 110-165 ms each | 110 ms |

- **Three tools in context.** The model searches with `find_tool`, reads one schema with
  `describe_tool`, and calls anything with `run_tool`. On 45 requests spread over every pack, the
  right tool comes first 40 times and is in the top three every time (`test/search.test.mjs`).
- **Nothing loads until it is used.** Start-up reads a prebuilt index of all 281 tools; a pack's
  code loads the first time one of its tools runs.
- **Data by file, not by pasting.** Any argument can be `{"$file": "prices.csv", "column": "close"}`
  (or `"columns": ["SPY", "TLT"]` or `"all"`). For 1,000 prices that is 23 tokens instead of 4,893,
  and the model cannot drop a number while copying.
- **Several calls in one round trip.** `run_tool` takes `calls` (up to 25). A call can use an
  earlier call's output with `{"$result": 0, "path": "rows", "pick": [0, 1]}`, so intermediate data
  never passes through the model, and `return: "last"` sends back only the final answer. Labeling
  1,000 prices and then weighting the labels took 72 tokens of tool input this way, against 31,917
  to read the labels and type them into the next call.
- **Shorter numbers when they are enough.** `digits: 5` rounds every result.

## An agent, end to end

The same model (gpt-5.4-mini) answered seven tasks twice each:
- the Sharpe ratio, drawdown and value at risk of a pasted price file;
- a deflated Sharpe from summary numbers;
- a Black-Scholes price;
- a 399-sleeve tournament on three assets;
- Apple's first-reported 2019 EPS.

Answers were graded against the tools' own values (`bench/agent-eval.mjs`; results in
`bench/agent-eval-2026-10-08.json`):

| | correct | tokens per task | turns | seconds |
|---|---|---|---|---|
| the six servers, installed separately | 11 of 14 | 63,984 | 4.1 | 22.6 |
| canli-mcp, first version | 10 of 14 | 43,043 | 5.8 | 9.5 |
| canli-mcp, after fixing what the runs showed | 14 of 14 | 27,267 | 4.2 | 7.2 |

The fixes came from reading the runs:
- The model narrowed `find_tool` to one pack and missed the tool that took its inputs, so the pack
  filter is gone.
- It passed made-up two-point series to a tool that wanted returns, so the quant deflated and
  probabilistic Sharpe tools now take summary numbers and refuse too little data.
- It put `select` and `return` inside a tool's arguments, so run_tool moves them out.
- It asked `select` for fields that do not exist, so the reply now lists the fields that do.

This is one small model with two runs per task, so read the differences as large or small, not as
exact rates.

## Privacy

Everything runs on your machine. `canli://privacy` states, per pack, what leaves it:

| pack | network | disk |
|---|---|---|
| quant | none | none |
| validation | none (private local mode) | reads a returns file only when you pass its path |
| fundamentals | public SEC data from canlicapital.com (the company and measure you ask for) | caches that public data in `~/.cache/canli-fundamentals` (`CANLI_CACHE_DIR=""` keeps nothing) |
| research | public research pages from canlicapital.com (your search words) | none |
| backtest | public SEC data, as fundamentals; your prices and signals stay local | your trial ledgers in `~/.canli/ledgers` |
| markets | SEC EDGAR, the US Treasury and FRED directly (the company, form, dates or series you ask for); Yahoo Finance's public chart data for prices, or Alpaca or Tiingo with your key | none |
| paper | Alpaca's paper API only, with your paper keys | a hash-chained order log in `~/.canli` |

`CANLI_OFFLINE=1` enables only the packs with no network, and no other pack's code is even loaded.
`test/privacy.test.mjs` runs the server that way with `fetch` and every network module made to
throw, and the quant and validation tools still answer. The server itself has no network, write or
logging code (also tested). Opt-in receipts (`receipt: true`) carry hashes, never data.

## Configuration

| variable | effect |
|---|---|
| `CANLI_PACKS` | Packs to enable: `quant,validation,fundamentals,research,backtest,paper` or `all`. Default: all but paper. |
| `CANLI_OFFLINE` | `1` keeps only `quant` and `validation`. |
| `ALPACA_PAPER_KEY_ID`, `ALPACA_PAPER_SECRET_KEY` | Paper keys (starting `PK`); setting them enables the paper pack. Live keys are refused. |
| `CANLI_HOME` | Where the paper pack keeps its limits file, kill switch and order log; default `~/.canli`. |

Order-sending tools never run inside a batch: preview first, then send on its own.

## Packs and what each is checked against

| pack | package | tools | tested against |
|---|---|---|---|
| quant | [canli-quant-mcp](https://www.npmjs.com/package/canli-quant-mcp) | 235 | QuantLib, statsmodels, arch, TA-Lib, scipy, pandas: 461 reference cases |
| validation | [canli-validation-mcp](https://www.npmjs.com/package/canli-validation-mcp) | 17 | the Null Zoo benchmark of 160,000 simulated searches |
| fundamentals | [canli-fundamentals-mcp](https://www.npmjs.com/package/canli-fundamentals-mcp) | 7 | SEC XBRL filings |
| research | [canli-research-mcp](https://www.npmjs.com/package/canli-research-mcp) | 6 | the published research record and its hash chain |
| backtest | [canli-backtest-mcp](https://www.npmjs.com/package/canli-backtest-mcp) | 3 | point-in-time SEC data |
| markets | [canli-markets-mcp](https://www.npmjs.com/package/canli-markets-mcp) | 9 | replayed SEC, Treasury and FRED responses: a 13F's total equals its cover page |
| paper | [canli-paper-trading-mcp](https://www.npmjs.com/package/canli-paper-trading-mcp) | 4 | a simulated Alpaca paper API |

Two tools differ from their standalone servers. Validation's `stress_test` is `strategy_stress_test`
here, because the quant pack has a portfolio `stress_test`. Validation's `get_key` and
`service_status` are left out, because validation runs locally here. `canli://packs` lists both.

## Development

```bash
npm ci && npm test
npm run build-index   # after updating a pack; a test fails if the index and the packs differ
```

MIT licence.
