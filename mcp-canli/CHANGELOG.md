# Changelog

## 0.11.1

- A view's own follow-up calls ask as a view does (`view: true`), so a long answer comes back whole.
  Before, "Compare with the S&P 500" on a backtest since 2010 asked for 4,228 days of SPY, got the
  shortened preview a model gets above 200,000 characters, and drew no line.

## 0.11.0

- More interactive views (`src/view/atlas.js`, in the same page): a market map from `market_overview`
  (tiles by move over any period, ranked or in order, a tile opens its candlestick chart, Refresh); the
  Treasury curve from `treasury_yields` against a month, a year and five years before, with a slider
  and Play through five years of history and the 10Y-2Y and 10Y-3M spreads; `financial_statements`
  charted, as filed, as a share of revenue or total assets, or as growth, with a trend on every line;
  the `volatility_surface` as smiles, term structure and a heatmap; several price series in one batch
  compared (growth of 1, return, CAGR, volatility, Sharpe, drawdown, correlation and beta to the first,
  a correlation heatmap with the number of independent bets); `correlation_matrix` as a heatmap. The
  comparison's correlations and volatility match the quant pack's tools, checked in the tests.
- Every other table sorts by any heading; a long one has a filter box. A full-screen button where
  the host offers it.
- Four prompts that open views: `compare_stocks`, `yield_curve`, `volatility_surface` and
  `statement_charts`. Thirty-one of its own, fifty-six in all.
- With `view: true`, a result smaller than its summary is sent whole (a one-day yield curve was 1,191
  characters, its summary 1,296).
- Packs: canli-markets-mcp 0.7.4 (`treasury_yields` ranges across years line maturities up by name).
- Context cost re-measured: 2,408 tokens up front (13 more than 0.10.0).

## 0.10.0

- Interactive views in hosts that draw MCP Apps (`src/view/studio.js`, in the same self-contained
  page): candlesticks with zoom, pan, ranges, moving averages, Bollinger bands, volume, RSI and MACD
  (the quant pack's definitions, checked value for value); option chains with calls and puts around
  the strike, quotes, greeks or activity, any expiration and a contract's payoff; backtest
  dashboards with figures, growth of 1 against buy-and-hold (and the S&P 500 on request), trade
  markers, the drawdown and a sortable trade log, whose sliders rerun the backtest and count every
  setting tried, with a deflated-Sharpe check of them all; sweep heatmaps whose cells open their
  dashboard; treemaps of holdings and weights; and the paper order ticket with Approve. Views call
  tools only when the person picks, releases or presses something, through the host.
- Two prompts that open views: `stock_chart` (two years of prices and the option chain) and
  `strategy_lab` (a crossover dashboard with sliders). Twenty-seven of its own, fifty-two in all.
- `run_tool` takes `view: true`: the view gets the whole result (up to 2,000,000 characters) and the
  model a summary (every field; long lists as their length, first and last items and range), so a
  two-year price history costs the model 1,598 characters instead of 30,529. Backtests run with
  `view` get their curve and trades. Without MCP Apps nothing changes but the curve.
- Packs: canli-quant-mcp 0.2.0 (backtest `curve` and `dates`), canli-paper-trading-mcp 0.3.1
  (preview prices and notionals).
- A test that looked for a ticker in the audit log now skips the base64 signatures, which could
  spell it by chance (about one run in a thousand).
- `audit verify` finds the public keys beside the log (its `CANLI_HOME`'s `audit-keys`) before this
  machine's, so a copied log checks without flags.
- The package description gives the current counts; the context cost re-measured for 0.9.0: 2,319
  tokens up front with every pack, against 53,974 for the seven servers run separately.


## 0.9.0

- Packs: canli-markets-mcp 0.7.3, with two new tools: `shareholder_returns` (dividends per share and in
  total, buybacks and shares issued, the diluted share count, payout ratios, a split-adjusted dividend
  record and the dividend and shareholder yields) and `market_overview` (US indices and the VIX, the
  sectors ranked by the month, yields, the dollar, commodities, crypto and markets abroad, over a day to a
  year, in one call). `ownership_breadth` now finds the CUSIP from a company's name for many more
  companies, and `news` waits out GDELT's rate limit and searches companies by their plain names. 345 tools.
- Three prompts: `research_report` (a full research note in one batched call), `market_today` and
  `dividend_check`. Twenty-five of its own, fifty with the packs'.
- `CANLI_POLICY` takes the policy itself as JSON as well as a file's path, for a desktop app's config.
- The audit log signs a checkpoint when the server exits, so a log that ends cleanly ends signed;
  `audit verify` on a missing log answers plainly instead of failing.
- The registry description gives the current counts.

## 0.8.0

- Packs: canli-markets-mcp 0.7.1 (nine new tools: federal contracts, drug pipelines and FDA
  approvals, SEC comment letters, a reverse DCF from the filings, FDIC bank call reports, language
  drift across 10-Ks, planned insider sales from Form 144, the IPO pipeline, and GPU compute prices
  with the Cirrun GPU Index), canli-backtest-mcp 0.3.0 (`breadth_sweep`: parameter sweeps on every
  core or as checked shards, against the best-of-N luck benchmark) and canli-paper-trading-mcp
  0.3.0 (pre-trade attestations signed with Ed25519 and post-quantum ML-DSA-65,
  `verify_attestation`, and a private mode in which the model never sees account figures): 343
  tools. Markets' `reverse_dcf` is `company_reverse_dcf` here, beside quant's `reverse_dcf`.
- For firms: `CANLI_POLICY` names a policy file (tools allowed and denied by name or pack, orders
  off, calls a minute) and turns on a tamper-evident audit log: each call's tool, time, outcome and
  the SHA-256 of its arguments and result, hash-chained, with checkpoints signed by Ed25519 and, on
  Node 24.7+, post-quantum ML-DSA-65. `canli-mcp audit verify` checks a log; `audit_log` (through
  `run_tool`) shows, signs or checks it in a session. Without `CANLI_POLICY` nothing changes and
  nothing is written.
- Plugins: `CANLI_PLUGINS` loads other people's packs (an export of `registerTools(server)`); their
  tools join the search, batches, the policy file and the audit log, and `canli://privacy` shows
  what each says it sends and keeps.
- `canli-mcp watch`: a live feed of new SEC filings as lines of JSON, by form, 8-K event and filer.
- Seven new prompts: `valuation_check`, `language_drift`, `biotech_catalysts`,
  `government_exposure`, `bank_health`, `insider_watch` and `ipo_watch` (twenty-two in all).

## 0.7.1

- The packs move to zod 4.6.7 (validation 0.14.1, research 0.3.1, quant 0.1.3, paper trading
  0.1.1; no code change), so an installed canli-mcp audits clean.

## 0.7.0

- Packs: canli-markets-mcp 0.6.0, canli-fundamentals-mcp 0.7.0 and canli-backtest-mcp 0.2.0 (332
  tools). Five new prompts: `filing_changes`, `why_it_moved`, `portfolio_xray`,
  `peers_and_red_flags` and `human_check`. Held out over rounds 5 to 7 (600 FilingFacts questions
  never sampled before): 92.8% against 0.6.0's 86.8%.
- `history` and `financial_statements` are listed as tools of their own beside the three discovery
  tools (`CANLI_FRONT`; empty restores three): one step instead of a search on the commonest
  questions. `run_tool` also runs `find_tool` and `describe_tool`. The instructions name the common
  tools and make `verify_claims` a check for drafts, not every answer. On 200 held-out FilingFacts
  questions (DeepSeek V4.1 Flash) this branch answered 93.0% against 0.6.0's 87.0% (14 right only
  here, 2 only there, p = 0.002), with a fifth of the runs that hit the turn limit and fewer tokens.

## 0.6.0

Beyond the US, and results drawn the way a reader needs them.

- Pins canli-markets-mcp 0.5.0: four tools from the publishers themselves, no key.
  `european_filings` reads a European company's annual report as it filed it in ESEF (from
  filings.xbrl.org): the tagged totals and comparatives, in the company's own currency. In a
  cross-check, revenue and net profit equal the same companies' Form 20-F at the SEC (12 of 12).
  `reference_rates` gives SOFR, the effective fed funds rate with the Fed's range, the euro
  short-term rate and the ECB's rates, SONIA and Bank Rate, and about forty policy rates the BIS
  collects; in a cross-check they agree with the BIS (9 of 9). `prediction_markets` shows what
  Polymarket and Kalshi traders pay for an outcome. `crypto_fundamentals` gives DefiLlama's value
  locked, fees, revenue and stablecoin supply. The catalog has 315 tools.
- Three new workflow prompts:
  - `global_rates`: four central banks' policy rates beside SOFR, the euro short-term rate and
    SONIA, and the Treasury curve.
  - `european_company`: a company's latest ESEF annual report.
  - `defi_snapshot`: stablecoin supply, value locked on Ethereum and Solana, and a protocol's fees
    and revenue.

  `macro_snapshot` adds what prediction markets price for the Fed's next decisions and SOFR
  against the Fed's range. The full server offers 35 prompts. Every call they ask for passes its
  tool's schema, and each batch ran against the live sources before release.
- The result viewer draws what it used to leave out:
  - grouped figures as labelled figures, with the tables inside them: a stock's market data and
    P/E, the next expected earnings date, the latest short interest, the Fed's latest decision, a
    protocol's value locked and fees;
  - lists of records as tables;
  - a market's probability as a percentage;
  - the Treasury curve over its maturities, and a futures curve by expiration;
  - a policy rate as steps between its decisions, to the last day asked for.

  Charts keep their lines on one scale (no volume beside a rate, no basis points beside percent),
  skip transactions that share a day, and label axes in millions and billions. Columns no row
  fills are left out. The page ships without its comment lines (32 KB).
- `find_tool`: 41 requests for the eight tools added in 0.5.0 and 0.6.0 were written before
  measuring. They found the right tool first 36 times and in the top three 38 times. Two phrases
  people use for these tools ("effective federal funds", "comparable sales") were then added to the
  index, giving 38 and 40. The earlier sets are unchanged: right tool first in 47 of 50, 37 of 37
  and 89 of 96.
- The registry entry lists the hosted server, `https://canlicapital.com/mcp/canli`. It runs this
  package's public-data and computing packs over Streamable HTTP for clients that take a URL.
  Files, prices and paper trading stay with the local server.
- `canli://privacy` and the README name every host the markets pack now contacts: the New York Fed,
  filings.xbrl.org, the ECB, the Bank of England, the BIS, Polymarket, Kalshi and DefiLlama.
- Context on Node 24.19.0, 2026-10-15: 1,160 o200k_base tokens for the initial tools and
  instructions, unchanged, against 39,962 for the seven servers run separately.
- Robustness: the markets pack's 43 tools took 590 calls with hostile arguments, with no crash
  and no leak.

## 0.5.0

- Pins canli-markets-mcp 0.4.0: four tools for the work an analyst does with filings, and for
  checking the answer. `financial_statements` returns statements exactly as filed (several years
  joined; restated and split-changed lines beside their first-reported figures, never mixed).
  `filing_tables` finds the table in a filing that holds a figure, and follows it through earlier
  filings. `earnings_release` reads a results release: guidance as ranges with quotes, and the
  previous quarter's guidance set against the results. `verify_claims` checks a draft's figures
  against the filings: confirmed, contradicted (with the filed figure and what the wrong one
  matches: another year, a quarter, a unit slip) or not reported. The catalog has 311 tools.
- Two new workflow prompts: `financial_history` (four years of statements as filed) and
  `fact_check` (a draft's figures checked and the draft returned corrected); `company_brief` and
  `earnings_preview` now read the latest results release, its guidance and last quarter's guidance
  against the results. The full server offers 32 prompts.
- With the markets pack enabled, the server's instructions ask agents to check reported figures
  with `verify_claims` before answering.
- Results drawn in the chat: in clients that draw MCP Apps, `run_tool` results appear as a page
  beside the answer (tables, statements as filed, checked claims with their verdicts, last
  quarter's guidance as ranges with the actual marked, line charts for dated series). One
  self-contained page served as `ui://canli/view`, with no network access and every string
  escaped; the model's context is unchanged. Tested in the MCP Apps reference host (`basic-host`
  from `@modelcontextprotocol/ext-apps` 2.0.3) with live results (an earnings release, a fact
  check, a price chart, light and dark); not yet tried inside a commercial client.
- Context re-measured on Node 24.19.0, 2026-10-15: 1,160 o200k_base tokens for the initial tools and
  instructions (the instructions now ask for `verify_claims`), versus 38,047 for the seven separate
  servers; start-up 73 ms against 62-89 ms each.
- Measured in canli-markets-mcp's `bench/analyst`: 87 questions checked against truths built
  without the tools; first runs on releases and companies not used in development were 26 of 32
  (fresh), 9 of 9 (fresh-2), 15 of 19 (verify) and 6 of 6 (traps); the defects they found are
  fixed. A tool-level measure, not a model benchmark.

## 0.4.0

- The packs' own interfaces are available in the combined server: 25 additional prompts (30 total), 11 additional static resources (14 total), and 8 additional resource templates (9 total). Names and URI schemes identify the pack, schemas and completions use its published MCP handlers, and renamed validation tools use the combined names. Listing these interfaces loads no pack code; disabled packs stay hidden. Original standalone client examples retain their transport configuration.
- Includes a build script and attested release workflow for a Claude Desktop MCPB extension, with bundled exact dependencies and optional offline configuration.
- Pins the corrected quant 0.1.2 and backtest 0.1.2 engines, fundamentals 0.6.0, research 0.3.0, and markets 0.3.0. The rebuilt catalog has 307 tools, including the source-backed earnings calendar.
- Context remeasured locally on Node 24.19.0: 1,113 o200k_base tokens for the initial tools and instructions, versus 35,142 for the seven separate servers. This is a context measurement, not a worldwide quality or latency ranking.

- Wrapped `run_tool` requests and options moved out of a tool's arguments are validated again
  before execution. Wrapping could previously bypass the 25-call batch limit and the bounds on
  `digits`, `select` and `receipt`. Oversized batches now fail before any call runs.
- `show_result` keeps a table's column labels when paging its rows. Text is paged by character
  offset, and previews name the actual shortened text path, so the full text can be recovered.

- **Workflows as prompts.** `company_brief`, `earnings_preview`, `macro_snapshot`, `ownership` and
  `backtest_check` are MCP prompts. Clients list them as slash commands; each runs one batched
  `run_tool` call across the packs and says what to write. A prompt is offered only when every tool
  it names is in an enabled pack. Every call is checked against its tool's schema in
  `test/prompts.test.mjs`. Prompt metadata is requested separately from the tool list; the client
  decides when to include it in model context.
- **Results too large to read.** A result above 200,000 characters of JSON (about 50,000 tokens)
  comes back as a preview. Every field stays, long lists show their first and last 5 items, and a
  note names the lists it cut. The whole result stays under its ref. `show_result`, called through
  `run_tool` (`{"name": "show_result", "arguments": {"ref": "r3", "path": "values", "offset": 0,
  "limit": 200}}`), reads any part of it, a page at a time. Before this, a 30,000-price
  `convert_returns` sent 626,859 characters into the model's context. The note appears only when
  needed, so the three front tools cost the 1,113 tokens with all seven packs enabled.
- **Numerical errors.** Quant 0.1.2 refuses computed NaN and Infinity with field diagnostics, before JSON or success receipts. The combined server forwards those errors. Its generic `non_finite_values` diagnostics still name non-finite values returned by other packs.

## 0.3.0

The markets pack (canli-markets-mcp 0.2.1) goes from 13 tools to 34, so canli-mcp has 306, and
`find_tool` finds the right one more often.

- Fix, from canli-markets-mcp 0.2.1: `economic_series` no longer answers with a series that
  shares one word with the request. In canli-mcp 0.2.1 it answered "silver price" and "bitcoin
  price" with US CPI, and "japan inflation" with US inflation. The new `world_economy` and
  `economic_outlook` had the same flaw before release: "wage growth" gave GDP growth. A request
  that names nothing these tools hold is now refused, with where to look instead.
  `economic_series` also knows 27 more FRED series by name (PPI, wages, consumer credit,
  permits, gasoline ...), and `find_tool` finds them.
- Fix, from canli-markets-mcp 0.2.1: company names. In canli-mcp 0.2.1 "facebook" was Denny
  Hill/Facebook LLC, "jp morgan" JP Morgan AG, and "google" an old Google Inc. with no ticker. A
  name now resolves to the largest listed company whose registered name starts with it (Google is
  Alphabet). Fund managers resolve to the filer of their 13Fs (Vanguard, Fidelity's FMR, Citadel
  Advisors, Bridgewater, Renaissance ...).

- New in the markets pack, all from the publishers and without a key:
  - options chains with implied volatility and greeks, the volatility surface, and the VIX futures
    curve (Cboe's delayed data);
  - short interest and off-exchange volume (FINRA), fails to deliver (SEC), futures positioning
    (CFTC Commitments of Traders);
  - fund and ETF portfolios (N-PORT), index members, 5% holders (13D/13G), events from 8-Ks, private
    offerings (Form D), investment advisers (IAPD);
  - executive pay against performance, and revenue by segment, from the filings' XBRL;
  - Fed decisions, votes and dot-plot medians, and the US economic calendar;
  - Treasury auctions, the federal debt, and World Bank and OECD data;
  - prices for currencies, futures, indices, crypto and stocks listed abroad.
- `canli://privacy` and the README name every service the markets pack reaches. 0.2.1 still said SEC,
  Treasury and FRED only.
- `find_tool`:
  - Plurals lose only their "s". "rates" used to become "rat" and matched nothing that said "rate";
    the same happened to prices, shares, trades, futures, values and sales.
  - Keyword lists are no longer discounted for their length, and repeated matches count for more
    (k1 3).
  - "max" and "min" match "maximum" and "minimum". Time words (last, latest, recent, current, today,
    now) are ignored.
  - `economic_series` is found by the series it resolves (core CPI, mortgage rates, GDP growth,
    payrolls ...), the company screen by profit and margin words, and the paper tools by buy, sell,
    trade and order.
  - "8-K" and "10-Q" keep their number, "news" is no longer stemmed to "new", and a one-word tool
    name (`history`) that merely appears in a request no longer gets the naming bonus.
  - Measured on 48 everyday requests written after these changes and never tuned on: the right tool
    first 46 times (0.2.1: 25), in the top three 47 times (29). On the questions 0.2.1 also had a
    tool for, 27 of 29 first against 25.
  - 48 everyday requests written before the changes were used to tune them: 34 first before, 43
    after. The 50 cross-pack requests stay at 47 first, 50 in the top three. All four sets are in
    `test/search.test.mjs`.
- Fix: `find_tool` threw on any request containing "constructor" (an abbreviation table read the
  word's built-in property). `select` and `$result` paths read only a result's own fields, so
  "constructor" is reported as a missing field rather than returning a function.
- Context, re-measured with `bench/context.py`: 1,109 tokens, against 34,508 for the seven servers
  listed separately (24,858 when markets had 13 tools).
- `bench/robustness.mjs`: every tool, called offline with hostile arguments ("constructor", empty and
  5,000-character strings, unusual unicode, edge numbers, empty and 20,000-item arrays), in a
  throwaway home folder. On 0.3.0: 2,980 calls ran, and none crashed or leaked internals in
  canli-mcp itself. It found 3 crashes in packs (fundamentals `cross_section` on "constructor",
  backtest `backtest_signal` on a NUL byte) and 4 NaN answers on degenerate quant inputs; those are
  fixed in the packs' next releases.
- `bench/rivals/coverage.mjs` and `COVERAGE.md`: which of 53 finance questions each server has a tool
  for, checked against every server's own tool list. canli-mcp 49, OpenBB 39, Yahoo Finance MCP 13,
  EdgarTools 11.

## 0.2.1

The first release on npm: 0.2.0's contents, unchanged. The 0.2.0 number is held by a staged copy on
npm that could not be approved from this machine, and npm does not publish over a staged version,
so this release takes the next number and is published from GitHub Actions with provenance.

## 0.2.0

The first release on npm. 0.1.0 is the version the rival benchmark measured (`bench/rivals`) and was
never published; 0.2.0 adds the markets pack and the fixes that benchmark found.

- canli-backtest-mcp 0.1.1: 0.1.0 shipped a `file:` dependency and could not install from npm.
- Fix: `digits` rounded whole numbers too, so with `digits: 6` a 13F's 227,917,808 shares came back
  as 227,918,000 and a CIK changed. It now rounds fractions only; counts, shares, IDs and dollar
  totals stay exact. Found by the rival benchmark (`bench/rivals`).
- `select` and `$result` paths take column names on tables: `rows.0.accession`, `rows.close`.
- Every result has a ref (`"r1"`, `"r2"`, ...) that a later `run_tool` call can pass as
  `{"$result": "r1", "path": "close"}`, so data fetched in one call feeds the next without being
  copied through the model (the last 32 results are kept, in this process only).
- `select` that keeps a table's `rows` also keeps its `columns`, so the rows stay readable.
- `run_tool` called through itself (`{"name": "run_tool", "arguments": {...}}`) is unwrapped instead of
  failing; models in the rival benchmark did this.
- `find_tool` finds the fundamentals tools for revenue, net income and EPS questions.

- New pack, markets (canli-markets-mcp, 13 tools): research across the market (screens of every
  US-listed company, company reports, event studies, filing trends) and SEC filings and their sections, EDGAR full-text search,
  insider trades, 13F holdings, Treasury yields, FRED series and prices from the sources, no key
  (your Alpaca or Tiingo key is used for prices when set). 285 tools; `economic_series` and `price_history` return columns
  that feed straight into the quant tools through `$result`.
- Context re-measured on 2026-10-09: 1,109 tokens, against 24,858 for the seven servers listed
  separately (0.1.0's 995 was measured before the argument signatures were added; it is 1,037).

## 0.1.0 (not published to npm)

First version: every Canli Capital MCP server in one process. 272 tools from canli-quant-mcp,
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
