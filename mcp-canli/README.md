# canli-mcp

Every Canli Capital MCP server in one: 332 finance tools for Claude, Cursor or any MCP client.

- Quant finance: 235 tools covering performance and risk, options and exotics, fixed income,
  portfolios, econometrics, indicators, and a library of 399 strategy sleeves with
  multiple-testing corrections.
- Backtest validation: deflated Sharpe, overfitting probability, data-snooping tests, leakage checks
  and placebo tests, run on your machine.
- Point-in-time SEC fundamentals.
- An analyst's filings, and a check on the answer: financial statements exactly as filed (several
  years joined, restatements and splits shown beside the first-reported figures), the table in any
  filing that holds a figure (followed through earlier filings), earnings releases with their
  guidance as ranges and last quarter's guidance set against the results, and `verify_claims`,
  which checks a draft's figures against the filings: confirmed, contradicted (with the filed
  figure and what the wrong one matches) or not reported.
- Markets from the sources, no key: screens of every US-listed company, company reports, event
  studies, SEC filings and their sections, insider trades, 13F and 5% holders, fund and ETF
  portfolios, index members, short interest, off-exchange volume, fails to deliver, futures
  positioning, executive pay, revenue by segment, options chains and volatility surfaces, the VIX
  futures curve, Fed decisions and projections, the economic calendar, Treasury yields and auctions,
  the federal debt, FRED, World Bank and OECD data, and prices for stocks, currencies, futures,
  indices and crypto. New in 0.7.0: what changed between two filings, the live filing feed, peer
  comparisons, debt profiles, accounting red-flag scores (Beneish, Piotroski, Altman), 13F ownership
  breadth, a portfolio X-ray, why a stock moved, the news and crypto funding rates.
- Beyond the US, from the publishers: European companies' annual reports as they filed them
  (ESEF), central-bank rates (SOFR, the euro short-term rate, SONIA, the ECB's and the Bank of
  England's rates, and about forty policy rates the BIS collects), what Polymarket and Kalshi
  traders pay for an outcome, and DeFi value locked, fees and stablecoin supply from DefiLlama.
- Canli Capital's open research record.
- Factor backtests without lookahead, a breadth lab (24 signals built into a multi-sleeve book, with
  a count of its truly independent bets), price panels from fund holdings, and data annotation
  (blind labelling packets, agreement between labellers, gold sets with a datasheet).
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

Hosted, no install: add `https://canlicapital.com/mcp/canli` as a connector in claude.ai, ChatGPT
or any client that takes a URL (`claude mcp add --transport http canli https://canlicapital.com/mcp/canli`).
It runs this release with the quant, validation, fundamentals, research, backtest and markets
packs. File arguments (`$file`), prices and paper trading need the local server: files there would
be the server's disk, the keyless price source is for personal use, and paper trading needs your
own broker keys. The hosted server keeps nothing between requests, so chain calls inside one
`run_tool` batch, and each caller gets 60 requests a minute.

## Context and startup

Measured on Node 24 on 2026-10-15 with `bench/context.py` (o200k tokens of the tool objects a
client receives, plus the server instructions; all seven packs enabled with `CANLI_PACKS=all`; start-up is the median time from launch to the
tool list, on a machine running other work; `bench/context-2026-10-15-0.6.0.json`):

| | seven servers separately | canli-mcp |
|---|---|---|
| initial tool list and instructions | 39,962 tokens | 1,160 tokens |
| processes | 7 | 1 |
| start-up | 71-100 ms each | 86 ms |

The four tools this release adds cost the combined server nothing up front; run separately, the
markets server's list grew by 1,915 tokens.

- **Three tools in context.** The model searches with `find_tool`, reads one schema with
  `describe_tool`, and calls anything with `run_tool`. On 48 everyday requests written after the
  last change to the search and never tuned on, the right tool comes first 46 times and is in the
  top three 47 times (0.2.1: 25 and 29). For the eight tools added in 0.5.0 and 0.6.0, 41 requests
  written before measuring found the right tool first 36 times and in the top three 38 times; two
  words they used were then added to the index (38 and 40). `test/search.test.mjs` holds these and
  176 more.
- **Nothing loads until it is used.** Start-up reads a prebuilt index of all 332 tools; a pack's
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

## Workflows as prompts

Clients that show MCP prompts (Claude Desktop and Claude Code list them as slash commands) offer fifteen
workflows. Each one runs a single batched `run_tool` call and says what to write from the results:

| prompt | asks for | runs |
|---|---|---|
| `company_brief` | a ticker | company report, 8-K news with press-release headlines, the latest results against their guidance, next earnings date, insider trades, short interest, options-implied move |
| `earnings_preview` | a ticker | earnings date and timing, what the company guided for the quarter and whether it met its last guidance, the move options price in, past reactions to results (event study), recent results headlines, revenue by segment |
| `financial_history` | a ticker | four years of statements as filed, with restatements and splits shown |
| `fact_check` | a ticker and a draft | every reported figure in the draft checked against the filings, the draft returned corrected |
| `macro_snapshot` | nothing | the Fed's latest decision and projections, what prediction markets price for its next decisions, SOFR against the Fed's range, the next two weeks' key releases, CPI, core PCE, unemployment, the Treasury curve, the VIX futures curve |
| `global_rates` | nothing | the Fed's, ECB's, Bank of England's and Bank of Japan's policy rates, SOFR, the euro short-term rate and SONIA beside them, the Treasury curve |
| `european_company` | a company's name or LEI | its latest ESEF annual report: revenue, profit, EPS, assets, equity, cash flows and dividends beside the prior years, linked to the report |
| `defi_snapshot` | a protocol (optional) | stablecoin supply and its change, value locked on Ethereum and Solana, the protocol's value locked, fees and revenue |
| `ownership` | a ticker | 5% holders and activists, insider buying and selling, short interest |
| `filing_changes` | a ticker | the latest 10-K's risk factors and MD&A against the one before: new, dropped and rewritten paragraphs, words rising |
| `why_it_moved` | a ticker and a date | the day's move beyond the market, how unusual it was, the filings and news around it |
| `portfolio_xray` | symbols and weights | look-through positions across funds, overlap between them, the largest exposures |
| `peers_and_red_flags` | a ticker | industry peers, debt and borrowing, institutional ownership breadth, Beneish, Piotroski and Altman screens |
| `human_check` | a company and a draft | a blind labelling packet of the draft's figures, with guidelines and an answer key |
| `backtest_check` | a returns file | deflated Sharpe for the variants tried, the track record needed, then leakage and placebo plans |

A prompt is offered only when every tool it names is in an enabled pack (`CANLI_PACKS`,
`CANLI_OFFLINE`), and `test/prompts.test.mjs` checks each call against its tool's own schema.
Prompts are requested separately from `tools/list`. Their context cost depends on how the client
includes prompt and resource metadata.

The packs also bring their own 25 prompts, so the full server offers 40. Their names identify the
pack, such as `fundamentals.known_on_date`, `quant.audit_backtest`,
`validation.stress_my_strategy` and `research.literature_review`. They route tool calls through
`run_tool`, preserve the source pack's prompt argument checks, and forward its completion helpers.

The 15 static resources and nine resource templates include the 399 sleeve specifications,
reference methods, exact input/output schemas, concept mappings, limits and client examples.
Pack resource schemes keep their names separate: `canli-quant://`, `canli-validation://`,
`canli-fundamentals://` and `canli-research://`. For example, read
`canli-fundamentals://schemas/cross_section`. Original client examples retain each pack's local or
hosted connection. Disabled packs have no guides; listing guides reads the prebuilt metadata and
loads no pack code. The guide handlers load only when a prompt, resource or completion is used.

## Results drawn in the chat

Clients that draw MCP Apps (the extension of 2026-01-26) show each `run_tool` result as a page
beside the answer: tables with the figures aligned, statements as filed with their scale, checked
claims under their sentence with a verdict for each figure, last quarter's guidance as a range with
the actual result marked, and a line chart for prices or any series of dates. A result's grouped
figures (a stock's market data, the next earnings date, a protocol's fees) are drawn as labelled
figures, the Treasury curve over its maturities, a futures curve by expiration, a policy rate as
steps between its decisions, and a market's probability as a percentage. The page is the
resource `ui://canli/view`, one self-contained file with no network access and no external
scripts, drawn in the client's sandbox; every string from a result is escaped. What the model
reads does not change, and clients without MCP Apps ignore the page.

[FEATURES.md](FEATURES.md) maps the supported finance workflows, evidence checks and remaining gaps.
For Claude Desktop, the GitHub release also carries a `.mcpb` extension with its dependencies and
GitHub build attestation. Its manifest lets you choose enabled packs and offline mode.

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
| markets | SEC EDGAR and the SEC's adviser database, the US Treasury, FRED, FINRA, the CFTC, the Federal Reserve and the New York Fed, BLS, BEA, the Census Bureau, the OECD, the World Bank, Cboe, filings.xbrl.org (European filings), the ECB, the Bank of England, the BIS, Polymarket, Kalshi and DefiLlama directly (the company, form, dates, search words, rate or series you ask for); Yahoo Finance's public chart data for prices, or for US stocks Alpaca or Tiingo with your key | none |
| paper | Alpaca's paper API only, with your paper keys | a hash-chained order log in `~/.canli` |

`CANLI_OFFLINE=1` enables only the packs with no network, and no other pack's code is even loaded.
`test/privacy.test.mjs` runs the server that way with `fetch` and every network module made to
throw, and the quant and validation tools still answer. The server itself has no network, write or
logging code (also tested). Opt-in receipts (`receipt: true`) carry hashes, never data.

## Configuration

| variable | effect |
|---|---|
| `CANLI_PACKS` | Packs to enable: `quant,validation,fundamentals,research,backtest,markets,paper` or `all`. Default: all but paper. |
| `CANLI_OFFLINE` | `1` keeps only `quant` and `validation`. |
| `ALPACA_PAPER_KEY_ID`, `ALPACA_PAPER_SECRET_KEY` | Paper keys (starting `PK`); setting them enables the paper pack. Live keys are refused. |
| `CANLI_HOME` | Where the paper pack keeps its limits file, kill switch and order log; default `~/.canli`. |

Order-sending tools never run inside a batch: preview first, then send on its own.

## Packs and what each is checked against

| pack | package | tools | tested against |
|---|---|---|---|
| quant | [canli-quant-mcp](https://www.npmjs.com/package/canli-quant-mcp) | 235 | QuantLib, statsmodels, arch, TA-Lib, scipy, pandas: 465 reference cases |
| validation | [canli-validation-mcp](https://www.npmjs.com/package/canli-validation-mcp) | 17 | the Null Zoo benchmark of 160,000 simulated searches |
| fundamentals | [canli-fundamentals-mcp](https://www.npmjs.com/package/canli-fundamentals-mcp) | 7 | SEC XBRL filings |
| research | [canli-research-mcp](https://www.npmjs.com/package/canli-research-mcp) | 6 | the published research record and its hash chain |
| backtest | [canli-backtest-mcp](https://www.npmjs.com/package/canli-backtest-mcp) | 10 | point-in-time SEC data and the breadth lab's own checks |
| markets | [canli-markets-mcp](https://www.npmjs.com/package/canli-markets-mcp) | 53 | replayed responses from the SEC, Treasury, FRED, FINRA, CFTC, the Fed, OECD, World Bank, Cboe, ECB, Bank of England, BIS, filings.xbrl.org, Polymarket, Kalshi and DefiLlama: a 13F's total equals its cover page; ESEF figures equal the same companies' Form 20-F at the SEC; central-bank rates agree with the BIS |
| paper | [canli-paper-trading-mcp](https://www.npmjs.com/package/canli-paper-trading-mcp) | 4 | a simulated Alpaca paper API |

Two tools differ from their standalone servers. Validation's `stress_test` is `strategy_stress_test`
here, because the quant pack has a portfolio `stress_test`. Validation's `get_key` and
`service_status` are left out, because validation runs locally here. `canli://packs` lists both.

## Development

```bash
npm ci && npm test
npm run build-index        # after updating a pack; a test fails if the index and the packs differ
node bench/robustness.mjs  # every tool, offline, with hostile arguments: crashes and leaks reported
```

MIT licence.
