# Finance coverage and quality, 0.6.0

The flagship combines seven exact published Canli packages. Its full catalog has 355 tools;
paper trading is enabled with paper credentials or an explicit pack selection. Five tools are
advertised initially (three for discovery and running, two common ones). The 56 prompts, 15 static resources (one is the result viewer drawn by clients with MCP Apps) and nine resource templates
appear only for enabled packs. This is a coverage inventory, not a worldwide ranking.

| Area | Available in this release | Scope and remaining work |
| --- | --- | --- |
| SEC fundamentals | `known_as_of`, `history`, `vintages`, `restatements`, `cross_section` | `history` gives the latest value with the first report beside it (or the reverse), the change from a year earlier, several measures in one call and the span covered; it is listed directly beside the discovery tools. Filing dates and fiscal periods remain explicit; a revised figure is not substituted for an earlier vintage. |
| Filing research | `list_filings`, `read_filing`, `search_filings`, `company_events`, `mentions_trend`, `filing_tables`, `latest_filings`, `filing_diff` | Source filing text, press-release headlines, the table in a filing that holds a figure, what has just been filed across every company (EDGAR's live feed), and what changed in a 10-K's risk factors or any item since the last one: new, dropped and changed paragraphs and the words that rose. |
| Statements as filed | `financial_statements` | Income statement, balance sheet, cash flow and equity statement from SEC's rendered XBRL reports, several filings joined; restated and split-changed lines shown beside their first-reported figures. US filers with XBRL. |
| Earnings and guidance | `earnings_release`, `earnings_calendar` | Results and guidance from the company's own release, as ranges with quotes; last quarter's guidance against the results. Guidance given only on the call is not in the release; parsing is by rule, so each figure carries its quote. |
| Checking the answer | `verify_claims` | A draft's GAAP figures checked against XBRL company facts: confirmed, contradicted (with what the wrong figure matches) or not reported. Non-GAAP, guidance and segment figures are not checked by it. |
| Ownership and funds | Insider trades, 13F, 13D/13G, N-PORT portfolios, index constituents, `portfolio_xray` | A portfolio's funds opened into the companies they hold: look-through exposure, overlap between funds and effective positions. Cover-page checks and source receipts; reporting lags remain part of each source contract. |
| Macro and rates | FRED, Treasury yields/auctions/debt, FOMC, economic calendar, World Bank, OECD, `reference_rates` | Source series and dates; unsupported series names are refused. Reference rates come from their publishers (SOFR and the effective fed funds rate with the Fed's range from the New York Fed, the euro short-term rate and policy rates from the ECB, SONIA and Bank Rate from the Bank of England, about forty policy rates from the BIS); a cross-check finds the ECB's, the Bank of England's and the Fed's rates equal to the BIS's (9 of 9). |
| Europe | `european_filings` | Annual reports filed in ESEF by issuers on EU and EEA regulated markets, from filings.xbrl.org: the report's tagged totals and comparatives in the company's currency. Revenue and net profit equal the same companies' Form 20-F at the SEC in a cross-check (12 of 12). Breakdowns by segment are not drawn from these reports, and only filers in the repository are covered. |
| Prediction markets | `prediction_markets` | Polymarket and Kalshi prices by search words, with bid, ask, volume and each event's rules. Prices are traders', before fees and the spread; thin markets move on small trades. |
| Crypto fundamentals | `crypto_fundamentals` | DefiLlama's value locked, fees, revenue and stablecoin supply; its adapters' measures, which a protocol's own reports can count otherwise. Prices are `price_history`'s. |
| Prices and derivatives | `price_history`, options chains/surfaces, VIX futures, CFTC positioning | Provider history, rate limits and freshness vary; exchange-grade live feeds for every asset are not established. |
| News and moves | `news`, `explain_move`, company 8-K results and EX-99 headlines | The world's press on a company or topic from GDELT's open index with the daily tone of the coverage, and a day's abnormal return with its rarity beside the filings and headlines around it. Earnings-call transcripts remain a gap relative to the [official Alpha Vantage MCP catalog](https://mcp.alphavantage.co/). |
| Quantitative analytics | 235 tools for performance, risk, options, fixed income, portfolios, econometrics, indicators and labels | Quant 0.1.2 checks computed values before serialization; overflow is an error, not a missing value. |
| Strategy research | 399 sleeves, tournaments, clustering, walk-forward analysis, purged CV; the breadth lab: `price_panel`, `breadth_signals`, `breadth_book`, `effective_bets` | A free price panel from an index fund's holdings, a sleeve for every cross-sectional signal in every industry traded as one netted account (the netting ratio reported), effective independent bets and ideas, and every sleeve's returns written as a dataset to train on. Numerical checks do not establish forward returns or eliminate selection bias. |
| Backtest validation | DSR, PBO, track record, placebo and leakage checks, point-in-time factor construction | Inputs and the variants tried matter; insufficient evidence must remain visible. |
| Research record | Search/read the Canli public record and source limits | Expert labels and independent reproduction remain separately measured outcomes. |
| Labelled datasets | `annotation_packet`, `annotation_agreement`, `annotation_gold` | Figures checked by machine against the filings and written as blind packets for people to label; agreement and Cohen's kappa between people and against the machine; a gold set with a datasheet and hashes. |
| Execution | Alpaca paper accounts, previews, constrained submission and rebalancing | Paper only; order-sending tools cannot run in batches. Live capital is outside this release. |
| Pipelines and context | Batches of up to 25, file inputs, result references, selection, paging and retained results | Large results return previews with recoverable paths; server memory is bounded. |
| Guides | Combined workflows plus pack prompts, schemas, examples, methods, sleeve specs and completions | Upstream examples keep their original client configuration. Dynamic lookup retains the published handlers. |
| Charts and providers | Results drawn in clients with MCP Apps: tables, statements, checked claims, guidance ranges, labelled figures, line charts, the Treasury and futures curves; interactive candlesticks with indicators, option chains, backtest dashboards with sliders and a luck check, sweep heatmaps, treemaps and a paper order ticket with Approve; a market map, the Treasury curve through time, statements with margins and growth, the volatility surface, stock comparisons with correlation heatmaps and independent bets, and sortable tables; `view: true` sends the model a summary instead of the data | Exported images and broader keyed providers are gaps against [OpenBB's MCP interface](https://docs.openbb.co/odp/python/extensions/interface/openbb-mcp); the views are tested in a local host that follows the MCP Apps protocol, not yet in a commercial client. |
| Banking and accounting | No bank-ledger or accounting-system adapter | Additional connectors require explicit data contracts and authentication; they are not inferred from market-data coverage. |
| Transport and distribution | Local stdio through npm; official MCP Registry and GitHub release; MCPB build workflow; hosted Streamable HTTP at `https://canlicapital.com/mcp/canli` | The hosted server runs the public-data and computing packs; file arguments, prices and paper trading stay local. Authenticated third-party directory parity is separate delivery work. |

## Reproducible release checks

- `npm test`: live tool/index parity, source guide parity, discovery queries, required prompt
  arguments, resource completion, disabled packs, unknown names, stable receipts, batch bounds,
  non-finite refusal, paging and offline operation with network access poisoned.
- `npm audit signatures`: verifies registry signatures and available package attestations.
- `npm run build-index`: derives tools and guide metadata from the exact installed packages.
- `uv run --with tiktoken python bench/context.py --json`: measures initial tool objects plus
  instructions and five-launch median startup. On Node 24.19.0, 2026-10-15 (0.6.0): 1,160
  o200k_base tokens versus 39,962 for seven separate servers; 86 ms versus 71–100 ms each, on a
  machine running other work. This excludes later tool calls, prompts, results, provider fees and
  model reasoning.

The dated rival benchmark in `bench/rivals/REPORT.md` retains its limited question set, tuned
arms and incomplete runs. This release has no new paid model evaluation. Local tests and context
measurements do not establish the lowest hallucination rate or total cost across the finance world.

## Next substantive batch

1. Evidence integrity and freshness: extend refusal and stale/conflicting-source tests using
   independently checked finance tasks, with raw answers and failures retained.
2. Coverage: provider-backed news/transcripts, segment detail from European reports, and broader
   asset and accounting integrations with explicit source, authentication and licensing contracts.
3. Efficiency: measure cold and warm workflows, result size, provider calls and total cost together;
   compare exact peer versions on tasks written independently of fixes.
4. Distribution: verify authenticated Glama/Smithery source and runtime parity, and measure the
   hosted flagship's latency, limits and use in production.
