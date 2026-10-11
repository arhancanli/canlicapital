# Changelog

## Unreleased

- **Workflows as prompts.** `company_brief`, `earnings_preview`, `macro_snapshot`, `ownership` and
  `backtest_check` are MCP prompts. Clients list them as slash commands; each runs one batched
  `run_tool` call across the packs and says what to write. A prompt is offered only when every tool
  it names is in an enabled pack. Every call is checked against its tool's schema in
  `test/prompts.test.mjs`. They cost no context until chosen.
- **Results too large to read.** A result above 200,000 characters of JSON (about 50,000 tokens)
  comes back as a preview. Every field stays, long lists show their first and last 5 items, and a
  note names the lists it cut. The whole result stays under its ref. `show_result`, called through
  `run_tool` (`{"name": "show_result", "arguments": {"ref": "r3", "path": "values", "offset": 0,
  "limit": 200}}`), reads any part of it, a page at a time. Before this, a 30,000-price
  `convert_returns` sent 626,859 characters into the model's context. The note appears only when
  needed, so the three front tools cost the same 1,109 tokens.
- **Numbers JSON cannot print.** NaN and Infinity print as null, so a model read an overflow or a
  division by zero as a missing value. Such results now carry `non_finite_values`, naming the
  fields (for example `zero_coupon_bond` at price 1e308: modified_duration, convexity, dv01).

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
