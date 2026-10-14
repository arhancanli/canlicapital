# Finance coverage and quality, 0.5.0

The flagship combines seven exact published Canli packages. Its full catalog has 311 tools;
paper trading is enabled with paper credentials or an explicit pack selection. Three discovery
tools are advertised initially. The 32 prompts, 15 static resources (one is the result viewer drawn by clients with MCP Apps) and nine resource templates
appear only for enabled packs. This is a coverage inventory, not a worldwide ranking.

| Area | Available in this release | Scope and remaining work |
| --- | --- | --- |
| SEC fundamentals | `known_as_of`, `history`, `vintages`, `restatements`, `cross_section` | Filing dates and fiscal periods remain explicit; a revised figure is not substituted for an earlier vintage. |
| Filing research | `list_filings`, `read_filing`, `search_filings`, `company_events`, `mentions_trend`, `filing_tables` | Source filing text, press-release headlines, and the table in a filing that holds a figure, followed through earlier filings; continuous filing monitoring remains a gap against [EdgarTools' documented interfaces](https://github.com/dgunning/edgartools/blob/main/docs/ai/mcp-tools.md). |
| Statements as filed | `financial_statements` | Income statement, balance sheet, cash flow and equity statement from SEC's rendered XBRL reports, several filings joined; restated and split-changed lines shown beside their first-reported figures. US filers with XBRL. |
| Earnings and guidance | `earnings_release`, `earnings_calendar` | Results and guidance from the company's own release, as ranges with quotes; last quarter's guidance against the results. Guidance given only on the call is not in the release; parsing is by rule, so each figure carries its quote. |
| Checking the answer | `verify_claims` | A draft's GAAP figures checked against XBRL company facts: confirmed, contradicted (with what the wrong figure matches) or not reported. Non-GAAP, guidance and segment figures are not checked by it. |
| Ownership and funds | Insider trades, 13F, 13D/13G, N-PORT portfolios, index constituents | Cover-page checks and source receipts; reporting lags remain part of each source contract. |
| Macro and rates | FRED, Treasury yields/auctions/debt, FOMC, economic calendar, World Bank, OECD | Source series and dates; unsupported series names are refused. |
| Prices and derivatives | `price_history`, options chains/surfaces, VIX futures, CFTC positioning | Provider history, rate limits and freshness vary; exchange-grade live feeds for every asset are not established. |
| News and transcripts | Company 8-K results and EX-99 headlines | General news sentiment and earnings-call transcripts are gaps relative to the [official Alpha Vantage MCP catalog](https://mcp.alphavantage.co/). |
| Quantitative analytics | 235 tools for performance, risk, options, fixed income, portfolios, econometrics, indicators and labels | Quant 0.1.2 checks computed values before serialization; overflow is an error, not a missing value. |
| Strategy research | 399 sleeves, tournaments, clustering, walk-forward analysis, purged CV | Numerical checks do not establish forward returns or eliminate selection bias. |
| Backtest validation | DSR, PBO, track record, placebo and leakage checks, point-in-time factor construction | Inputs and the variants tried matter; insufficient evidence must remain visible. |
| Research record | Search/read the Canli public record and source limits | Expert labels and independent reproduction remain separately measured outcomes. |
| Execution | Alpaca paper accounts, previews, constrained submission and rebalancing | Paper only; order-sending tools cannot run in batches. Live capital is outside this release. |
| Pipelines and context | Batches of up to 25, file inputs, result references, selection, paging and retained results | Large results return previews with recoverable paths; server memory is bounded. |
| Guides | Combined workflows plus pack prompts, schemas, examples, methods, sleeve specs and completions | Upstream examples keep their original client configuration. Dynamic lookup retains the published handlers. |
| Charts and providers | Structured tables suitable for downstream visualization | Built-in chart artifacts and broader keyed providers are gaps against [OpenBB's MCP interface](https://docs.openbb.co/odp/python/extensions/interface/openbb-mcp). |
| Banking and accounting | No bank-ledger or accounting-system adapter | Additional connectors require explicit data contracts and authentication; they are not inferred from market-data coverage. |
| Transport and distribution | Local stdio through npm; official MCP Registry and GitHub release; MCPB build workflow | Three individual Canli servers also have hosted HTTP endpoints. Flagship HTTP hosting and authenticated third-party directory parity are separate delivery work. |

## Reproducible release checks

- `npm test`: live tool/index parity, source guide parity, discovery queries, required prompt
  arguments, resource completion, disabled packs, unknown names, stable receipts, batch bounds,
  non-finite refusal, paging and offline operation with network access poisoned.
- `npm audit signatures`: verifies registry signatures and available package attestations.
- `npm run build-index`: derives tools and guide metadata from the exact installed packages.
- `uv run --with tiktoken python bench/context.py --json`: measures initial tool objects plus
  instructions and five-launch median startup. On Node 24.19.0, 2026-10-13: 1,113 o200k_base tokens
  versus 35,142 for seven separate servers; 75 ms versus 64–90 ms each. This excludes later tool
  calls, prompts, results, provider fees and model reasoning.

The dated rival benchmark in `bench/rivals/REPORT.md` retains its limited question set, tuned
arms and incomplete runs. This release has no new paid model evaluation. Local tests and context
measurements do not establish the lowest hallucination rate or total cost across the finance world.

## Next substantive batch

1. Evidence integrity and freshness: extend refusal and stale/conflicting-source tests using
   independently checked finance tasks, with raw answers and failures retained.
2. Coverage: provider-backed news/transcripts and chart artifacts, followed by broader asset and
   accounting integrations with explicit source, authentication and licensing contracts.
3. Efficiency: measure cold and warm workflows, result size, provider calls and total cost together;
   compare exact peer versions on tasks written independently of fixes.
4. Distribution: verify authenticated Glama/Smithery source and runtime parity, then a separately
   tested hosted flagship that preserves pack selection and execution limits.
