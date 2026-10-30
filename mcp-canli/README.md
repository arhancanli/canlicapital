# canli-mcp

[![npm](https://img.shields.io/npm/v/canli-mcp)](https://www.npmjs.com/package/canli-mcp)
[![npm downloads](https://img.shields.io/npm/dw/canli-mcp)](https://www.npmjs.com/package/canli-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=canli-mcp)
[![Glama score](https://glama.ai/mcp/servers/arhancanli/canli-mcp/badges/score.svg)](https://glama.ai/mcp/servers/arhancanli/canli-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/canli-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/canli-mcp)
[![CI](https://github.com/arhancanli/canli-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/canli-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/arhancanli/canli-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/arhancanli/canli-mcp/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](https://github.com/arhancanli/canli-mcp/blob/main/LICENSE)

Every Canli Capital MCP server in one: 355 finance tools for Claude, Cursor or any MCP client.

```bash
claude mcp add canli -- npx -y canli-mcp
```

No key and no account. [Add to VS Code](https://insiders.vscode.dev/redirect/mcp/install?name=canli-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22canli-mcp%22%5D%7D)
· [Try the views in your browser](https://canlicapital.com/mcp-servers#views)
· [Questions it answers](https://canlicapital.com/mcp-servers/answers)
· hosted, nothing to install: `https://canlicapital.com/mcp/canli`

![canli-mcp's market map in the chat: every index, sector, rate, currency and commodity as a tile](https://raw.githubusercontent.com/arhancanli/canlicapital/main/public/videos/canli-mcp/market.jpg)

- Interactive views in the chat: candlestick charts you zoom and pan with moving averages,
  Bollinger bands, RSI and MACD; option chains with any expiration a click away; backtest
  dashboards whose sliders rerun the backtest and count every setting tried; treemaps; a paper order
  ticket with an Approve button. New in 0.11.0: a market map whose tiles open their charts, the
  Treasury curve against earlier dates and played through five years, statements charted with
  margins and growth, the volatility surface, several prices compared with a correlation heatmap and
  the number of independent bets they add up to, and every table sortable. With `view: true` the
  person gets the whole result drawn and the model a summary: 19 to 47 times fewer characters in our
  checks.
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
  breadth, a portfolio X-ray, why a stock moved, the news and crypto funding rates. New in 0.8.0:
  US federal contracts (USAspending), drug pipelines with trial readouts and FDA approvals, SEC
  comment letters, the growth a share price implies (reverse DCF from the filings), bank call
  reports (FDIC), how a 10-K's language drifted over the years, planned insider sales (Form 144),
  the IPO pipeline, and GPU compute prices across the clouds with a daily index of them.
- Beyond the US, from the publishers: European companies' annual reports as they filed them
  (ESEF), central-bank rates (SOFR, the euro short-term rate, SONIA, the ECB's and the Bank of
  England's rates, and about forty policy rates the BIS collects), what Polymarket and Kalshi
  traders pay for an outcome, and DeFi value locked, fees and stablecoin supply from DefiLlama.
- Canli Capital's open research record.
- Factor backtests without lookahead, a breadth lab (24 signals built into a multi-sleeve book, with
  a count of its truly independent bets), price panels from fund holdings, and data annotation
  (blind labelling packets, agreement between labellers, gold sets with a datasheet). Parameter
  sweeps run on every core (or as shards other machines run and merge, checked), with the best
  result set against the luck of picking the best of many.
- Alpaca paper trading behind pre-trade checks, each check signed (Ed25519 and post-quantum
  ML-DSA-65) so an auditor can verify it, and a private mode in which the model never sees the
  account's figures.
- For firms: a policy file (which tools may run, orders off, calls a minute) and a tamper-evident
  audit log of every call, signed with Ed25519 and post-quantum ML-DSA-65; and a live feed of SEC
  filings as they arrive.

Each pack is a published, separately tested server. This package loads them into one process and
puts five tools in front of them.

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

Measured on Node 24 on 2026-10-24 with `bench/context.py` (o200k tokens of the tool objects a
client receives, plus the server instructions; all seven packs enabled with `CANLI_PACKS=all`; start-up is the median time from launch to the
tool list, on a machine running other work; `bench/context-2026-10-24-0.11.0.json`):

| | seven servers separately | canli-mcp |
|---|---|---|
| initial tool list and instructions | 53,974 tokens (115 tools) | 2,408 tokens (5 tools) |
| processes | 7 | 1 |
| start-up | 87-139 ms each | 149 ms |

Tools the packs add cost the combined server nothing up front: since 0.6.0 the seven servers' own
lists grew from 39,962 to 53,974 tokens. The interactive views of 0.10.0 added 76 tokens, those of 0.11.0 another 13.

- **Five tools in context.** The model searches with `find_tool`, reads one schema with
  `describe_tool`, and calls anything with `run_tool`; `history` and `financial_statements`, the
  most used, are listed directly too (`CANLI_FRONT` changes them; empty lists only the three). On 48 everyday requests written after the
  last change to the search and never tuned on, the right tool comes first 46 times and is in the
  top three 47 times (0.2.1: 25 and 29). For the eight tools added in 0.5.0 and 0.6.0, 41 requests
  written before measuring found the right tool first 36 times and in the top three 38 times; two
  words they used were then added to the index (38 and 40). For the 0.7.0 to 0.9.0 tools, 43 requests
  written before measuring: 41 first, 42 in the top three. `test/search.test.mjs` holds these and
  176 more.
- **Nothing loads until it is used.** Start-up reads a prebuilt index of all 355 tools; a pack's
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

## One call, many workers

Four tools work on the server, so the model asks once and reads one short answer. The workers are ordinary code,
not model calls, so they cost no model tokens.

- `brief` on a company runs a dozen tools at once (accounts, latest results and guidance, segments, valuation, debt,
  accounting screens, peers, shorts, options, news, and pipelines for drug makers or call reports for banks) and
  returns a digest with flags that name their evidence. Each full answer stays under a ref for `show_result`.
- `swarm` runs one read-only tool over up to 500 companies and returns one ranked table, with medians and failures.
  Long runs come back in parts with a `resume` ref. Take the names from another tool:
  `{"tool": "forensic_scores", "over": {"tool": "index_constituents", "arguments": {"index": "VOO", "limit": 510}, "column": "name"}, "sort_by": "altman.z_score", "order": "asc"}`.
- `triangulate` reaches a company's headline figures by three separate roads (the statement as filed, the XBRL facts,
  the point-in-time history) and says where they disagree. `brief` runs it too, and `swarm` runs it across an index.
- `stress_worlds` runs a portfolio through thousands of worlds: real market history resampled in blocks, with real
  crises dropped in at random times and sizes, alone or together (`"bank_crisis+compute_bust"`), or your own shocks.
  It shows the range of outcomes and how far to trust the answer. These are scenarios, not forecasts: they say what
  a portfolio does in such a world, not how likely that world is.

## Workflows as prompts

Clients that show MCP prompts (Claude Desktop and Claude Code list them as slash commands) offer thirty-one
workflows. Each one runs a single batched `run_tool` call and says what to write from the results:

| prompt | asks for | runs |
|---|---|---|
| `research_report` | a ticker | a full research note: the business and segments, statements as filed, results against guidance, peers, the growth the price implies, debt, dividends and buybacks, Beneish, Piotroski and Altman screens, what changed in the risk factors, ownership breadth, insiders, news |
| `market_today` | nothing | US indices and the VIX, sectors ranked by the month, yields, the dollar, oil, gold, bitcoin and markets abroad over a day to a year, the week's key releases, the Fed's latest decision and what prediction markets price for its next |
| `stock_chart` | a ticker | an interactive chart of two years of prices (candlesticks, averages, Bollinger bands, RSI, MACD) and the option chain, with the price against its 50- and 200-day averages, the RSI and the options-implied move |
| `strategy_lab` | a ticker | a 50/200-day crossover since 2010 as a dashboard with sliders, figures against buy-and-hold and a luck check of every setting tried |
| `compare_stocks` | two to eight tickers | five years side by side: growth of 1, each one's return, volatility, Sharpe, worst drawdown and beta, a correlation heatmap and the number of independent bets |
| `yield_curve` | nothing | the Treasury curve against a month, a year and five years ago, played through five years, with the 10Y-2Y and 10Y-3M spreads and how often it was inverted |
| `volatility_surface` | a ticker | implied volatility by strike and expiration: each expiration's smile, the term structure at the money and at 25 delta, the skew, the surface as a heatmap |
| `statement_charts` | a ticker | the statements as filed, charted: any line over the years, margins, the balance sheet as a share of assets, growth |
| `dividend_check` | a ticker | years of dividends and buybacks against earnings and free cash flow, the split-adjusted dividend record, the yields, debt falling due, Altman and Piotroski screens |
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
| `valuation_check` | a ticker | the free-cash-flow growth the share price implies (from the latest year and the three-year average), its sensitivity, and the company's peers |
| `language_drift` | a ticker and a theme (optional) | year-by-year similarity of the risk factors and MD&A, the biggest rewrite and its rising words, the theme's frequency |
| `biotech_catalysts` | a ticker | trials with primary completions due in the next year, the pipeline by phase, FDA approvals, recent 8-K news |
| `government_exposure` | a ticker | federal contract obligations by agency and the largest awards, against revenue; SEC comment-letter topics |
| `bank_health` | a bank | eight quarters of FDIC call-report figures: deposits and the uninsured share, capital, loan quality, unrealized losses, return on assets |
| `insider_watch` | a ticker | planned sales (Form 144) beside reported trades (Form 4) |
| `ipo_watch` | days (optional) | S-1 and F-1 filers apart from SPACs, funds and follow-ons, and the deals that priced |
| `backtest_check` | a returns file | deflated Sharpe for the variants tried, the track record needed, then leakage and placebo plans |

A prompt is offered only when every tool it names is in an enabled pack (`CANLI_PACKS`,
`CANLI_OFFLINE`), and `test/prompts.test.mjs` checks each call against its tool's own schema.
Prompts are requested separately from `tools/list`. Their context cost depends on how the client
includes prompt and resource metadata.

The packs also bring their own 25 prompts, so the full server offers 56. Their names identify the
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
beside the answer, and some results as interactive views:

- Prices (`price_history`): candlesticks or a line, zoom (ctrl or ⌘ + scroll, + and −, or ranges
  from a month to all), drag to pan, moving averages 20, 50 and 200, Bollinger bands, volume, and
  RSI and MACD panes, with each bar's figures under the cursor and a table view. The indicators are
  the quant pack's own (TA-Lib's definitions), checked value for value in the tests.
- Option chains (`options_chain`): calls and puts mirrored around the strike, in-the-money shading,
  open interest as bars, the price line between strikes, quotes, greeks or activity, any
  expiration from a menu, and a picked contract's payoff at expiry and break-even.
- Backtests (any `backtest_*` recipe): figures against buy-and-hold, growth of 1 with trade
  markers, the drawdown, the S&P 500 (SPY) on request, and the trades, sortable and filtered.
  Sliders rerun the backtest with new parameters; the dashboard counts every setting tried and can
  run them all through `strategy_sweep` for the deflated Sharpe ratio, so tuning by hand cannot
  pass off luck as skill. `strategy_sweep` over two parameters is a heatmap whose cells open their
  dashboard.
- Holdings and weights (`paper_account`, fund portfolios, optimizers): a treemap sized by value and
  coloured by return.
- Paper orders (`preview_paper_orders`, `rebalance_to_weights`): a ticket with each order's price,
  notional, cost and checks, the token's countdown and Approve, which sends exactly the previewed
  orders through `send_paper_orders` and shows the receipt.
- The market (`market_overview`): every index, sector, yield, currency, commodity and crypto as a
  tile coloured by its move over a day, a week, a month, three months, the year to date or a year,
  ranked or in order, with the best, the worst and how many sectors rose; a tile opens that market's
  candlestick chart, and Refresh reloads the map.
- The Treasury curve (`treasury_yields`): the curve on a day against a month, a year and five years
  before (five years of history load once), a slider and Play that run the curve through time, the
  10Y-2Y and 10Y-3M spreads over the years with the share of days inverted, and each maturity's
  rates under the cursor.
- Statements (`financial_statements`): the income statement, balance sheet and cash flows as filed,
  with a trend for every line; as filed, as a share of revenue (the margins) or of total assets, or
  as growth on the year before; click lines to chart them over the years.
- Implied volatility (`volatility_surface`): each expiration's smile by moneyness, the term
  structure at the money and at 25 delta, the skew, and the whole surface as a heatmap.
- Several prices in one batch: growth of 1 over three months to all, a sortable table of each one's
  return, CAGR, volatility, Sharpe, worst drawdown, and correlation and beta to the first, and a
  heatmap of how their daily returns move together (as given or clustered) with the average pair,
  the closest and most opposed pairs, the best diversifier and the number of independent bets
  ((sum of eigenvalues)² over the sum of their squares). `correlation_matrix` results get the same
  heatmap. The figures agree with the quant pack's own tools, checked in the tests.
- Every other table sorts by any heading, and a long one has a filter box. Hosts that offer full
  screen get a button for it.

Zooming, panning, sorting and toggling call nothing. An expiration, a released slider, the S&P 500
or Approve calls `run_tool` through the host (which may ask the person first), and the answer goes
to the view, not the conversation; what the person did is passed to the model as context. With
`view: true`, `run_tool` sends the model a summary (every field, long lists as their length, ends and
range) and the view the whole result: a two-year price history fell from 30,529 characters to 1,598
for the model, a backtest with its curve from 50,320 to 1,369, five stocks over five years compared
from 357,016 to 7,656. A result smaller than its summary is sent whole. Without MCP Apps, `view` changes
nothing but adding a backtest's curve.

Every result's page also has tables with the figures aligned, statements as filed with their scale, checked
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
| markets | SEC EDGAR and the SEC's adviser database, the US Treasury, FRED, FINRA, the CFTC, the Federal Reserve and the New York Fed, BLS, BEA, the Census Bureau, the OECD, the World Bank, Cboe, filings.xbrl.org (European filings), the ECB, the Bank of England, the BIS, Polymarket, Kalshi, DefiLlama, OKX, GDELT (news), USAspending, ClinicalTrials.gov, openFDA, the FDIC and Cirrun's GPU price index directly (the company, form, dates, search words, rate or series you ask for); Yahoo Finance's public chart data for prices, or for US stocks Alpaca or Tiingo with your key | none |
| paper | Alpaca's paper API only, with your paper keys | a hash-chained order log in `~/.canli` |

`CANLI_OFFLINE=1` enables only the packs with no network, and no other pack's code is even loaded.
`test/privacy.test.mjs` runs the server that way with `fetch` and every network module made to
throw, and the quant and validation tools still answer. The server itself has no network or logging
code, and writes only the audit log a policy file asks for (both tested). Opt-in receipts
(`receipt: true`) carry hashes, never data.

## Configuration

| variable | effect |
|---|---|
| `CANLI_PACKS` | Packs to enable: `quant,validation,fundamentals,research,backtest,markets,paper` or `all`. Default: all but paper. |
| `CANLI_OFFLINE` | `1` keeps only `quant` and `validation`. |
| `ALPACA_PAPER_KEY_ID`, `ALPACA_PAPER_SECRET_KEY` | Paper keys (starting `PK`); setting them enables the paper pack. Live keys are refused. |
| `CANLI_HOME` | Where the paper pack keeps its limits file, kill switch and order log, and the audit log and its keys are kept; default `~/.canli`. |
| `CANLI_POLICY` | A policy file's path, or the policy itself as JSON (below). Unset: no policy and no audit log. |
| `CANLI_PLUGINS` | Plugin packs to load (below): package names or `.mjs` paths, comma-separated. |

Order-sending tools never run inside a batch: preview first, then send on its own.

## For firms: policy and audit log

A compliance team sets what the server may do in one file and points `CANLI_POLICY` at it (or puts
the JSON itself in `CANLI_POLICY`, handy in a desktop app's config):

```json
{
  "tools": { "allow": ["markets:*", "fundamentals:*", "history"], "deny": ["news"] },
  "orders": "off",
  "calls_per_minute": 120,
  "audit": { "arguments": "hash" }
}
```

A tool is named by itself or by pack (`markets:*`). With an allow list only those run; deny wins;
`"orders": "off"` refuses every tool that sends orders. A refused call returns the reason and is
logged like any other.

With `audit`, every call is written to `CANLI_HOME/audit/` (one JSONL file per server process): the
tool, the time, the outcome and the SHA-256 of the arguments and the result (the arguments
themselves only with `"arguments": "full"`). Each record carries the hash of the one before it, so
an edited, removed or inserted record breaks the chain. Every 20 records, and when the server exits, a checkpoint is signed
with an Ed25519 key and, on Node 24.7 or later, also with an ML-DSA-65 key (FIPS 204, a
post-quantum signature); both must verify. The keys are made on your machine the first time and
never leave it; give an auditor the public halves (`CANLI_HOME/audit-keys/*.pub.pem`), and they
check a log with

```bash
npx canli-mcp audit verify path/to/audit --ed25519 audit-ed25519.pub.pem --ml-dsa audit-ml-dsa-65.pub.pem
```

which exits 1 and names the record when anything was changed. Without the flags it uses the public
keys beside the log (a copied `CANLI_HOME`'s `audit-keys`), then this machine's. Inside a session, `audit_log`
(through `run_tool`) shows the log's state, signs a checkpoint now (`action: "checkpoint"`) or
checks it (`action: "verify"`). Records after the last checkpoint are chained but not yet signed,
and verify says how many; a log cut short after a checkpoint loses that tail without a trace.

## Plugins

Anyone can add a pack. `CANLI_PLUGINS` names packages installed beside canli-mcp, or paths to
`.mjs` files, comma-separated. A plugin exports `registerTools(server)` and registers tools the way
the Canli packs do; it may also export `pack` (its short name), `title`, and `network` and `disk`
(what it sends and keeps, shown in `canli://privacy`):

```js
import { z } from "zod";
export const pack = "weather", network = "api.weather.gov", disk = "none";
export function registerTools(server) {
  server.registerTool("degree_days", { title: "Heating degree days", description: "...",
    inputSchema: z.object({ station: z.string() }) }, async ({ station }) => ({ structuredContent: { /* ... */ }, content: [] }));
}
```

Its tools are found by `find_tool`, run in `run_tool` batches with `$file` and `$result`, and fall
under the policy file (`"weather:*"`) and the audit log like any other. A clash with an existing
tool name stops the start with the reason. A plugin is code you chose to install and runs with the
server's rights; none loads unless named, and none loads with `CANLI_OFFLINE=1`.

## Live filings feed

`canli-mcp watch` reads EDGAR's latest-filings feed every 60 seconds (`--every`, at least 15) and
prints each new filing once, as a line of JSON, oldest first:

```bash
npx canli-mcp watch --forms 8-K,SC\ 13D --event earnings
npx canli-mcp watch --company "bancorp" | while read -r l; do curl -s -d "$l" "$WEBHOOK"; done
```

EDGAR posts a filing about a minute after accepting it, so most filings arrive within two minutes.
The first read only marks what is already there. Lines of type `error` report a failed read; the
feed carries on.

## Packs and what each is checked against

| pack | package | tools | tested against |
|---|---|---|---|
| quant | [canli-quant-mcp](https://www.npmjs.com/package/canli-quant-mcp) | 235 | QuantLib, statsmodels, arch, TA-Lib, scipy, pandas: 465 reference cases |
| validation | [canli-validation-mcp](https://www.npmjs.com/package/canli-validation-mcp) | 17 | the Null Zoo benchmark of 160,000 simulated searches |
| fundamentals | [canli-fundamentals-mcp](https://www.npmjs.com/package/canli-fundamentals-mcp) | 7 | SEC XBRL filings |
| research | [canli-research-mcp](https://www.npmjs.com/package/canli-research-mcp) | 6 | the published research record and its hash chain |
| backtest | [canli-backtest-mcp](https://www.npmjs.com/package/canli-backtest-mcp) | 11 | point-in-time SEC data and the breadth lab's own checks |
| markets | [canli-markets-mcp](https://www.npmjs.com/package/canli-markets-mcp) | 74 | replayed responses from the SEC, Treasury, FRED, FINRA, CFTC, the Fed, OECD, World Bank, Cboe, ECB, Bank of England, BIS, filings.xbrl.org, Polymarket, Kalshi, DefiLlama, USAspending, ClinicalTrials.gov, openFDA, the FDIC and Cirrun's GPU price index: a 13F's total equals its cover page; ESEF figures equal the same companies' Form 20-F at the SEC; central-bank rates agree with the BIS |
| paper | [canli-paper-trading-mcp](https://www.npmjs.com/package/canli-paper-trading-mcp) | 5 | a simulated Alpaca paper API |

Two tools differ from their standalone servers. Validation's `stress_test` is `strategy_stress_test`
here, because the quant pack has a portfolio `stress_test`; markets' `reverse_dcf` (which reads the
filings) is `company_reverse_dcf`, because the quant pack's `reverse_dcf` takes the figures you give it. Validation's `get_key` and
`service_status` are left out, because validation runs locally here. `canli://packs` lists both.

## Development

```bash
npm ci && npm test
npm run build-index        # after updating a pack; a test fails if the index and the packs differ
node bench/robustness.mjs  # every tool, offline, with hostile arguments: crashes and leaks reported
```

MIT licence.
