# Changelog

## Unreleased

- Live price streams for `canli://quote`: a subscribed crypto pair streams from Coinbase's public ticker with no key, or Kraken's when Coinbase cannot be reached (three tries with no price) or does not list the pair; US stocks stream from Alpaca's trade stream with your Alpaca keys, or Finnhub's with `FINNHUB_API_KEY`. The client is told as prices trade, at most once a second for each address, instead of every 15 seconds, and each streamed quote says which exchange it came from (`streamed_from`). Symbols no stream carries are checked on the timer as before. Works on Node 20 (the `ws` package) and on Node 22 and later (Node's own WebSocket); streams close when the client goes; `CANLI_STREAMS=0` turns them off.

## 0.22.0

- The Lab, red_team, the data lake, track records, backtest_forensics, beat_probability, and luck that counts every variant a session runs. 443 tools, on canli-markets-mcp 0.17.0 (139 tools, `default_risk`), canli-fundamentals-mcp 0.10.0, canli-quant-mcp 0.4.0, canli-backtest-mcp 0.6.0 and canli-validation-mcp 0.16.0.
- `default_risk` (canli-markets-mcp 0.17.0), the second Canli model: the chance a company reports a bankruptcy within a year of its latest 10-K, from that report's own figures, with Ohlson's O and Altman's Z'' beside it; tested walk-forward 2014 to 2025.
- canli-fundamentals-mcp 0.10.0: an answer as of a date holds nothing filed after it (`changed_after` only when asked by name), and 8-Ks and pay-versus-performance tables no longer read as restatements.
- Signed answers, on the hosted server: each receipt names the endpoint that issued it and carries the root of a Merkle tree over the answer's values (RFC 9162), so `run_tool`'s `prove` returns one value with its path to the signed root, and `receipt_check` checks proofs against it and says whether the receipt is signed with canlicapital.com's published key. A local server holds no key, so its schema is unchanged.

- Luck counts every variant of a `breadth_sweep` (canli-backtest-mcp 0.6.0), each named by its row's settings and measured on its own days. A breadth sweep is named by its files, grid and split (`sweep_id`), so the same sweep run again, or its shards merged after it ran whole, adds nothing, and the answer says it was counted already. Its shards are counted as they run, each variant by its combination: an agent that reads a shard's results and stops there has still tried them, and the merge adds only the variants this session has not counted (those of shards run on other machines).

- The Lab, on your machine: `canli-mcp lab build --shards 8` downloads Kenneth French's daily portfolio and factor files once (US from 1926; Developed, Europe, Japan, Asia Pacific and North America from 1990) and runs 588 rule variants on each of their 1,678 series: 986,664 strategies, each a number that rebuilds it exactly, after a 5 bp cost on turnover. About 1.4 GB, minutes with shards. `originality_check` sets your returns against all of them in seconds: the nearest by monthly correlation, how many are near-copies, your Sharpe's rank among every strategy covering the same months, and the best of them as the luck bar simple rules reached. `lab_search` finds strategies by family, series, Sharpe and history, or nearly uncorrelated with your book; `lab_strategy`, `lab_status`. The manifest states the effective number too: a sample of 1,500 varies like about 15 independent strategies, the market's movement above all.
- The Lab on every strategy answer. Where the Lab is built on this machine and a result is dated, a strategy answer gains `lab` beside `luck`: over the months it traded (the rule's flat warm-up left out), where its Sharpe from monthly returns ranks among the Lab's strategies covering the same months, the best of them, and the Lab strategy it most resembles, with how many have a monthly correlation of 0.7 or more. For a sweep it is the best variant, the one a search keeps. Dates come from the call's own `dates` (one per return or one per price row) or from `breadth_sweep`, which hands over its prices file's dates (canli-backtest-mcp 0.6.0); a result with no dates that fit gets no note. About a second for a million strategies, at most three a batch, each series once a session; a session without the Lab is told once how to build it, and `CANLI_LAB_NOTES=off` stops the notes. The hosted server has no Lab and adds none.
- The Lab's blends: every pair of its strategies, half and half, set back to equal weights each month, is a strategy too: 486,752,431,116 of them on a full build, each rebuilt exactly from its two ids (`lab_strategy` with `blend: [id, id]`: each month the average of the two, statistics over the months both have). `originality_check` adds where your Sharpe ranks among blends: every pair of a seeded sample of 2,000 strategies covering all your months, about two million blends, each Sharpe exact from the pair's means and covariance, and the best of them; about a second more. `lab_status` gives the count. Blends are mixtures of the same strategies, so they add count and not independent movement: the effective number (about 15) holds for them too, and the answers say so. Strategy answers' `lab` notes leave blends out, to stay at about a second.
- The Lab's offsets are read from their own bytes: a small Lab's file, read into a shared buffer, gave wrong offsets (a full build's never did).
- `backtest_forensics`: every common way a backtest misleads, in one call, each with its evidence and what would clear it: the search behind it (deflated Sharpe, overfitting), factor exposure sold as skill (alpha after the Fama-French five factors and momentum), lookahead in the weights, smoothing and selling tail risk, best days far above what normal returns give, an edge that fades, numbers too good for real trading, and near-copies in the Lab.
- `red_team`: the loop an agent runs when it rewrites a strategy until it passes, with the server keeping score. Every attempt and every variant in it is counted, an attempt worse than an earlier one cannot pass, ten failed attempts are told to stop, and a pass goes to `holdout_test`, once. Locally every attempt is kept in the Null Zoo (`zoo_search`, `zoo_stats`): encrypted at rest, chained by hash, and a later session on the same data is judged with the tries before it.
- The data lake: `lake_save` keeps any tool's table as a dated vintage in DuckDB-readable Parquet, `lake_import` your own files, `lake_query` runs one read-only SQL statement, `lake_panel` builds a wide panel the backtests read, from the latest vintage or as the lake knew it on a day. DuckDB is optional (`canli-mcp lake setup`), and each connection reaches only the lake folder.
- Track records committed before each day: `track_commit` puts only a salted hash of tomorrow's positions into the signed proof ledger, `track_score` checks every committed day and scores the track on public prices. A day committed but not shown stops the score.
- `beat_probability`, the first Canli model: the chance a company's next EPS or revenue lands above, within or below its own guided range, from its record against its guidance blended with the market's base rate (its quarters plus four at the base rate), and as it stood on any past date. Validated walk-forward on the S&P 500 guidance dataset, each quarter predicted from what was filed before it: Brier 0.408 against 0.494 for the base rate on EPS (56 companies, gain 0.087, 95% interval 0.046 to 0.132 by company) and 0.469 against 0.528 on revenue (42 companies); scripts/research/beat-probability/validate.mjs reproduces it. Cisco, 10 of 11 quarters above: 84% above next time.
- `backtest_strategy`'s grid variants are counted by luck (canli-validation-mcp 0.16.0, which lists every variant's Sharpe).
- `triangulate`: a bank's income statement has no single revenue line, only revenue tags on components, so its revenue is now read on the facts and history roads alone. Cathay General, Park National and Pathward showed revenue 86 to 95% apart because a component (Cathay's $7.6 million of fees) was set against total revenue; all three now agree. Found running `triangulate` over the S&P SmallCap 600.
- `triangulate`: a later filing that prints a figure in tenths of a million no longer reads as a change. Resolute Holdings' equity, 6,523 thousand in the 10-K and 6.5 million in its 10-Qs, was reported "history apart by 0.4%"; a whole number of 100,000 within half of that of a figure that is not one now agrees, and the reading says "agree (history rounded to 0.1 million)". A real change stays a disagreement: Resolute's assets, down 0.69 million in a reclassification, still read apart.
- Overfitting across the session. Where a tool hands over each variant's returns (canli-quant-mcp's backtests, `strategy_sweep` and `sleeve_tournament`, and canli-backtest-mcp's `breadth_sweep`, a shard's as it runs; canli-quant-mcp 0.4.0 and canli-backtest-mcp 0.6.0), the variants run on the same data, at the same frequency and over the same periods are pooled, and a strategy answer's luck gives `overfitting_across_session`: the probability of backtest overfitting (CSCV) of picking the best of all of them, not only of one sweep's grid. A sweep and a backtest on the same prices share a pool, prices read from an earlier call's result count as the data they are, breadth sweeps share one by their prices file's bytes, and a variant run again is pooled once. The returns never reach the model: they travel inside the process under a symbol key that JSON leaves out. A session pools up to 1,000 variants and 8 million numbers, and a large pool is measured on fewer splits (12 for a thousand variants), so the measure stays under about half a second; past the cap, the answer says how many variants it was measured on.

## 0.21.0

- canli-markets-mcp 0.16.0, 442 tools in all. `portfolio_rules`: where a list of holdings stands against the US lines that bring a filing or cap concentration, each with its rule's text linked: a position over 5% of its class (Schedule 13D or 13G) or 10% (a Section 16 insider), the $100 million Form 13F line, concentration (largest issuer, top five, HHI, effective positions), the 75-5-10 and RIC diversification tests, and days to exit at a share of FINRA's average daily volume. A check, not compliance advice.
- `index_constituents` on a past date: an index's members as its tracking ETF's N-PORT reported them, companies since removed included, and who joined and left between two dates, so a backtest's universe has no survivorship bias.
- Prices as traded on every source: `price_history` with `adjusted: false` gave split-adjusted prices on the keyless source; `adjustment` now chooses all (the default), splits or none.
- Yahoo's data is off wherever keyless prices are off, as on the hosted server: `stock_snapshot`, `analyst_history`, `market_movers` and `etf_profile` now say so there and point to the local install.
- canli-fundamentals-mcp 0.9.1: a company renamed since the reference was captured is found by its new name ("Here Group Limited" is CIK 1932770; "Franklin Templeton" is Franklin Resources), which caused both of 0.20.0's misses in FilingFacts' week 44.

## 0.20.0

- A company named in words that matches more than one filer ("Delta": Delta Air Lines, Delta Apparel, Delta Natural Gas) is put to the person, where their client can be asked (MCP elicitation), and the call runs again for the one they pick; the answer says what was asked and chosen under `asked`. On the 2025 protocol the question goes out while the call waits; on the 2026-07-28 protocol it rides an `input_required` result and the client's retry carries the answer, and a client is only sent a question it said it can answer. A client that cannot be asked, a person who declines, or `CANLI_ASK=0` leaves the first match standing with the others listed, as before.
- canli-markets-mcp 0.15.0: twenty-nine new tools, 441 in all, each checked against a second source. The economy from its publishers: `world_series` (a country's economy from its own statistics office or central bank, 17 measures for 70 countries and the euro area, `check: true` against a second official publisher), `inflation_nowcast` (the Cleveland Fed's CPI and PCE nowcast and its record), `inflation_breakdown` (CPI by component), `gdp_nowcast` (the Atlanta Fed's GDPNow from its own workbook), `recession_watch` (each recession indicator against its line; the New York Fed's yield-curve model reproduced exactly, and the Fed Board staff's excess bond premium model), `financial_conditions` (the OFR's stress index by category, the NFCI, credit spreads by rating, the excess bond premium and the VIX, each in its own history), `labor_market` (the jobs report in one answer), `job_postings` (Indeed's daily postings in eleven economies), `consumer_expectations` (the New York Fed's consumer survey), `housing_market` (Zillow and Realtor.com, nationally or by metro) and `state_economy` (a state beside the nation, or every state ranked).
- The Fed and money markets: `rate_expectations` (the odds at each FOMC meeting from fed funds futures, by FedWatch's method), `fed_liquidity` (the repo facilities, the Fed's holdings, reserves, the TGA, the discount window and net liquidity), `money_markets` (repo by segment against the Fed's rates, what money funds hold, primary dealers' Treasury positions), `fed_speeches` (what Board members said, a speech's passages on policy), `central_bank_speeches` (central bankers everywhere, from the BIS), `treasury_holders` (the Treasury's TIC table) and `reserve_currencies` (the IMF's COFER).
- Markets: `market_breadth` (how many S&P 500 members are above their averages, rising and at new highs, by sector; the Dow rebuilt from its members matches the index), `earnings_season` (the S&P 500's beats, misses and median surprise, by sector or for named companies), `earnings_move` (the move options price for a company's next results, the results' own move backed out, beside its past reactions), `energy_report` (the EIA's weekly oil and gas report against the five-year average), `crop_outlook` (the USDA's WASDE), `commodity_prices` (the World Bank's Pink Sheet), `lockup_calendar` (IPO lock-up expiries from prospectuses), `options_sentiment` (Cboe's put/call ratios) and `margin_debt` (FINRA).
- Filings: `release_check` sets an earnings release against the 10-Q filed after it (Vicor's $2.6M profit in the release was a $14.5M loss in the 10-Q), and `audit_signals` finds going-concern doubts, auditor changes and critical audit matters. `index_constituents` reads State Street's daily holdings (the S&P 500 as of the latest day, the Dow, the sector SPDRs), and `economic_series` takes `as_of` and `revisions` (ALFRED's vintages).
- The time machine holds `economic_series` to its date by ALFRED's vintage; `world_series` stays off under `as_of`.
- Resources `canli://economy/{country}` and `canli://fed` (the futures odds, the Fed's liquidity, the money markets, both nowcasts and the Fed's speeches in one attachable answer); prompts `country_economy`, `compare_economies` and `market_sentiment`. `macro_snapshot` reads the futures odds, both nowcasts and the Fed's liquidity; `earnings_preview` prices the results with `earnings_move`, since the nearest expiration can end before them; `market_today` adds `market_breadth`.

## 0.19.0

- canli-markets-mcp 0.14.1: six more tools, 412 in all, where Bloomberg, FactSet, Aladdin, QuantConnect and Tiingo led. `scenario_risk` runs your holdings through a macro shock or a replayed crisis, the unshocked factors moved the way history moves them together, with each holding's modelled return beside its actual one; `bond_offerings` lists every bond a company sold from its term sheets and fee tables, every dollar yield recomputed from its price; `standardized_financials` puts US GAAP and IFRS filers in one template; `trade_flows` reads UN Comtrade with Taiwan named and unattributed trade flagged; `trade_ticks` gives every Kraken trade to the microsecond; `financial_cycle` gives the BIS's house prices, debt service, credit and exchange rates.
- Live prices: `canli://quote/AAPL,MSFT,BTC-USD` gives the latest price, previous close and change of up to ten symbols. On a local server a client can subscribe to the address (`resources/subscribe`): the server checks it every `CANLI_QUOTE_SECONDS` (default 15) and sends `notifications/resources/updated` when a price changes, so a host shows prices as they move without the model asking again. Hosted and browser servers answer reads only; a holdout or a past date hides the present, so quotes too.
- Vendors' own MCP servers by name: `canli-mcp upstream add fmp` (and alphavantage, financialdatasets, unusualwhales, quiver, valuein, coinmarketcap, dune, which take the vendor's key, and coingecko, coinpaprika, dexpaprika, cryptocom, etherscan, blockscout, kalshi, gate, which need none). The answer names the variables to set; an address given on the command line wins over the preset. `canli-mcp upstream presets` lists them. The eight keyless servers were connected through the gateway on 2026-11-04 (2.5 to 3.7 s each). The only tools held back as changing things were CoinPaprika's and DexPaprika's submitFeedback and Kalshi's price-alert writers.
- bench/rivals/rivals-census-2026-11-04.json: the tool lists of 165 finance MCP servers (5,979 tools; 80 vendor-official, 26 enterprise, 59 community), each with where it was read, how it is set up and whether the list is complete.

## 0.18.0

- `canli-mcp setup`: canli-mcp added to every MCP client found on the machine in one command (Claude Desktop, Cursor, Windsurf, VS Code, Gemini CLI, Kiro, LM Studio, Amazon Q, Codex). Each gets one `canli` entry in its own format (VS Code's `servers` with `type: "stdio"`, Codex's TOML), the rest of the file is kept and a copy saved beside it. A file with comments is left alone, with the entry to add by hand, and an existing different `canli` entry is never replaced. `--dry-run`, `--only`, `--remove`, `--json`.
- Other MCP servers behind this one: `canli-mcp upstream add <name> <url>` (or `-- <command>`), or `CANLI_UPSTREAMS`, connects a server when canli-mcp starts, without delaying it. Its tools join `find_tool`, `run_tool` batches, `$result`, budgets, receipts, the policy file and the audit log, and stay out of the client's tool list. Keys are written as `${NAME}` and read from the environment. Tools that send orders or change anything stay off unless the server is marked `--write`, and then never run in a batch. Another server's text is scanned for words addressed to a model; its tools are off under `as_of`, the time machine and a holdout. `canli://privacy` lists each server, its tools, what was left off and why. A server run as a command is started from `local/commands.mjs`, still the one place canli-mcp starts anything.
- canli-markets-mcp 0.13.0: sixteen more tools, 406 in all. `filing_check` reads a 10-K or 10-Q against its own XBRL, `source_check` asks whether an answer's documents are still the same, and `buybacks` gives share repurchases. The parity tools are `treasury_cash`, `federal_budget`, `factor_returns` (Fama-French), `crypto_options` (Deribit, DVOL), `market_hours`, `analyst_history`, `market_movers`, `congress_trades` (House members' own reports), `market_calendar` (earnings with consensus, dividends, splits, IPOs), `etf_profile`, `crypto_markets`, `company_emissions` (EPA) and `unusual_options`. `price_history` also takes minute bars. Search was checked on the release before it was published: buybacks now also answers "is the share count shrinking" and market_movers "most shorted stocks"; the questions about today's targets and consensus stay with stock_snapshot.
- Packs: canli-fundamentals-mcp 0.9.0 (`vintage_diff`, and a long session sees reports filed after it began) and canli-quant-mcp 0.3.0 (every variant of a sweep counted, the probability of overfitting from `strategy_sweep`, `lookahead_check`): 390 tools. `find_tool` knows the words people use for `strategy_stress_test` ("survive", "worst case"), so "will my strategy survive a crash" finds it first again.
- Answer budgets: `run_tool` takes `max_chars`, the most characters of JSON to read of each result. A longer result is shortened step by step (lists to fewer ends, long text cut shorter, then only its shape) until it fits, and stays whole under its ref for `show_result`.
- `cost_preview`: before a heavy call, how long the tool took and how many characters it answered with earlier in this session (median and largest, about how many tokens), and whether it reads the network, so the call can set `max_chars` or `select` first.
- `compare_answers` and `rerun_answer`. The first sets two kept answers side by side: the rows added and removed, the fields changed, and whether they answered the same question. The second runs a kept answer's call again now and says whether the answer is the same, apart from when its sources were read, or what changed. Each kept result now remembers the call that made it.
- `receipt_check`: an earlier answer's receipt, and the receipts it was built from, checked against their documents now: each the same, changed since, or unreachable, through the markets pack's `source_check` (canli-markets-mcp, next release). An answer whose documents changed may no longer hold. `receipt: true` now puts the receipt's sources in the answer too, so a model can pass it on.
- A receipt on every run_tool answer, in `_meta` under `canlicapital.com/receipt`: the server and pack versions, SHA-256 of the request and of the whole result, the source documents the result was read from (the markets pack's evidence with the first 16 hex digits of each document's SHA-256, a fundamentals snapshot with its full SHA-256), and the time. `receipt: true` still adds the hashes to the answer itself. Receipt chains: an answer built from kept results (a `$result` ref in its arguments, or `show_result`) lists their receipts under `from`, which list theirs: two levels written out, then each named by its hashes, so a number can be followed back to the documents it came from.
- A cost meter on every answer, in MCP's `_meta` under `canlicapital.com/cost`, which hosts do not put in front of the model: wall time, the process's CPU time over the call, and the characters the model reads. Measuring costs no tokens.
- `as_of` on any run_tool call: that call answers as of a past date under the time machine's locks (arguments held to the date, later rows dropped, anything else dated later stops the answer), and a tool that cannot be held to a date is refused for that call. Under a server started with `--as-of`, a call can only ask for an earlier date. The date errors no longer name the `--as-of` flag, since a call can give the date too. The calls a desk tool such as `swarm` makes are held to the same date, and while a holdout is set, to the holdout's.
- `changes_only` on run_tool: a call made before in this session is answered with only what changed since then (table rows added and removed, fields changed), or that nothing did; where and when figures were fetched does not count as a change. The whole result stays under its ref. The receipt's sources now come from the whole results even when `select` or `changes_only` narrows the answer.
- Luck counts every variant of a sweep: with canli-quant-mcp 0.3.0, `strategy_sweep` and `sleeve_tournament` return every variant's Sharpe (`every_trial`), and each is a trial, named by its settings where the answer's table shows them. A grid of 400 is 400 tries, where before a sweep counted as none. The model reads how many were counted; the whole list stays under the answer's ref. `strategy_sweep` also gives the probability of backtest overfitting over its variants.
- Batches run in waves: a call starts as soon as the calls whose results it reads are done, so independent calls run at once even when others in the batch wait. Before, one `$result` anywhere made the whole batch run a call at a time. Results keep the batch's order.
- Progress and cancellation for batches: a run_tool batch sends a progress notification as each call finishes when the client asks for progress. That also keeps a long batch alive on clients that wait longer while progress comes. A cancelled request starts no further call; calls already running finish and their answer is dropped.
- Errors that give the corrected call: an argument a model got nearly right gets the tool's own key it most likely meant, by spelling (`retruns`) or by the names models reach for (`start_date` for `start`, `ticker` for `symbol`). When renaming fixes the call, the error gives the exact call. It is checked with any `$file` read in, and shown as it was sent, so nothing read from a file comes back. Nothing is guessed when no key is close.
- Words addressed to an AI inside a source's text: when a result from any pack holds phrases written to steer a model ("ignore all previous instructions", a chat template's system marker, "you are now an assistant"), the answer carries `caution` with where they are and a short excerpt. The text stays as the source gave it. On Microsoft's and NVIDIA's latest 10-Ks and Apple's latest proxy statement in full (about a million characters), nothing is flagged.
- `export_result`: a kept result, or a table inside it, written to a CSV or JSON file in CANLI_HOME/exports for a spreadsheet or a notebook. A receipt sits beside it with the file's SHA-256 and the receipt of the answer it came from. The rows never pass through the model, which reads only where the file is. Plain names only, never over an existing file, local server only. canli://privacy names the folder.
- Offline with company figures: `canli-mcp pack add <companies>` saves each company's Canli reference record and SEC snapshot (and the ticker and name indexes) on this machine. With `CANLI_OFFLINE=packs`, the fundamentals pack then joins quant and validation, reading only what was saved, with fetch refused by the tripwire. A saved company answers as of its snapshot (Apple's `history` in 54 ms, with no network), and one not saved says so. `canli-mcp pack list` shows the pack; canli://privacy states the mode.
- The network tripwire: a pack that says it sends nothing (quant, validation, a plugin whose network is "none") runs each tool with fetch refused, so the claim holds while the tool runs, and an answer whose every call ran so says `network: "none"` in its receipt. A plugin that says it sends nothing and fetches anyway is refused with a plain error. canli://privacy states it.
- The tools listed beside run_tool now keep their results under a ref like run_tool's: the server had meant to share its store with them and did not.
- Identical read-only calls in flight share one computation: a batch that asks the same thing twice, or concurrent requests in one process (the hosted server). The first caller keeps the result and each later one gets its own copy. A tool that writes or sends anything always runs.
- Pre-registration: `preregister` hashes a hypothesis and its plan with the time before any data is read. Every later answer's receipt names it under `after`, so the order (hypothesis, then data) is in the client's own records. Anyone given the text can hash it again. It is kept in CANLI_HOME/preregistrations.jsonl (readable only by its owner), and in the signed audit log when one is on. Local server only. canli://privacy now states the pre-registration file and the holdout vault (kept in memory, written nowhere), and that every answer carries a receipt.
- `canli://company/AAPL`, a company by its address: `company_report` (profile, five fiscal years of figures, price and risk), to attach to a conversation (in Claude Code, `@canli:canli://company/AAPL`). Refused while a holdout is set.
- `canli://week/AAPL,NVDA,VOO`, a resource a host can attach at the start of a session: `my_week` over the holdings in the address, with the sentinel's events of the same seven days on a local server. It reads the present, so it does not answer on a server running as of a past date or with a holdout set.
- The holdout vault: `holdout_set` hides every date from a day on, from every tool, for the rest of the session, under the time machine's locks (a tool that cannot be held to the day before is off), and clears the results kept so far, which may show those years. `holdout_test` runs one call on the hidden years, once, recorded with the hashes of what was asked and answered, and in the audit log when it is on. After it, the years stay hidden and a second test is refused. `holdout_status` shows the vault, the test, and how many calls read the world before the vault was set. It hides what the server's tools read, not data a caller passes in or the model's memory. Local server only. The tools listed beside run_tool (history and financial_statements by default) are held to it as well.
- The time machine holds `vintage_diff` (canli-fundamentals-mcp 0.9.0) to its date: `from` and `to` are never later than it.
- `fiscal_calendar`: a company's fiscal calendar from its own filings: each year's start and end, 52 or 53 weeks for a week-based year, each quarter's end, and the calendar quarter holding most of each fiscal quarter's days, to line quarters up across companies. Apple's FY2023 ran 53 weeks; Walmart's and Microsoft's years follow calendar months.
- `red_flags`: what careful readers check before believing a promoted stock, from the company's own filings over the last years. It covers late-filing notices, auditor changes, delisting notices, non-reliance notices, unregistered share sales, changes in control, going-concern language, name changes, reverse splits and the forensic screens. Each comes with dates and links, nothing found, or not checked when its source could not be read (never "no"). Super Micro shows five since November 2023 (late 10-Qs, the auditor change, delisting notices, unregistered sales, an M-score above -1.78); Apple shows none. Flags to look at, not accusations.
- `reconcile_shares`: a company's share counts reconciled filing by filing: cover page, outstanding and issued at the period's end, and the basic and diluted weighted averages. Only what cannot be ordinary is flagged: a count about a thousand or a million times the filing's other counts, fewer shares issued than outstanding, or a diluted average below the basic one. Over every filing since 2009 it flags Apple's April 2014 10-Q, where outstanding and issued were filed in thousands, and nothing at JPMorgan, Alphabet or Microsoft.
- `restatement_causes`: why a company's figures were restated, from what it filed. Restated values are grouped by the filing that changed them, and each group is set against the company's own notices: a non-reliance 8-K under Item 4.02 in the 400 days before (an error), an amended 10-K or 10-Q filed that day, a stock split, or a value moved to another tag. Otherwise a group is broad (10 or more values in one filing: a new standard, discontinued operations, new segments) or narrow, with the filing to read. Super Micro's 2019 restatements read as errors after its 4.02 notice of 15 November 2018; Apple's 10-K/A of January 2010 as an amended report, and its 2014 split as a split.
- Every new report checked as it is filed: a sentinel filing rule with `check: true` runs the markets pack's `filing_check` (canli-markets-mcp, next release) on each new 10-K or 10-Q. The event says what it found inside the document: scale against the stated unit, the same fact tagged twice, sums. SEC's company facts trail a filing minutes old, so that comparison is left out. Concept names and links reach the block in their own shapes.
- Insider clusters: a sentinel rule of kind `insider_cluster` (`company`, optional `insiders`, default 3, `within_days`, default 30, `side` buy or sell, `min_value`) fires when that many different insiders trade the same way in the open market within the window (Form 4 code P or S, read hourly), and again when more join. Their names and roles are the filer's own text, kept in the event's facts and out of what a model reads. What reaches the block from a source's table is now held to its own shape (dates, accession numbers, numbers).
- Sentinel events to a chat: `canli-mcp sentinel run --slack <incoming webhook>` or `--discord <webhook>` sends each event as a message a person reads: what happened, the rule and how it was seen, without the context block, within Discord's limit. canli://privacy names both.
- A claim watched until filings resolve it: a sentinel rule of kind `reported` (`company`, `concept`, `end`, optional `start`, `unit`, `above`, `below`) fires once at a figure's first report, or at once if it is out already, with the value, the filing, and whether it meets the claim. Without a start, the longest period ending that day is read. It shares the restatement rule's 15-minute reads and its 8-company limit.
- Restatement alerts: a sentinel rule of kind `restatement` (`company`, `concept`, `end`, optional `start` and `unit`) watches one figure of one period and fires when a later filing reports a different value, which may be a restatement, a correction or a reclassification. The event gives both values and the change in percent, both filings with a link to the new one, and every filing that reported the period; the headline uses the rule's own words, never the name as filed. It reads the fundamentals pack's `vintages` every 15 minutes, which needs canli-fundamentals-mcp 0.9.0 to see filings since the Canli reference was captured. A period not reported yet is waited for. 8 companies at most. `canli-mcp sentinel run` now loads the fundamentals pack too.
- run_tool's own descriptions are shorter, so the tool list stays as small with the new option; `digits` now says it defaults to six significant figures, which it always did.
- Luck, counted by the server. Every strategy result (the tools `signed_trial_count` counts: `backtest_*`, the sleeve tools, breadth books, `cpcv`, `audit_backtest`) now carries `luck`: how many strategies were tested in the session, the best of them, the Sharpe ratio luck alone would give the best of that many, and the best's deflated Sharpe ratio, with one short reading. Nothing has to be recorded by hand, so a variant cannot be left out. One ledger per sampling frequency (`periods_per_year`); the statistics are canli-validation-mcp's trial ledger. On the hosted server, which keeps nothing between requests, one request is counted, and the reading says so. Measuring a Sharpe ratio (`sharpe_ratio`) is not a trial.

## 0.17.1

With canli-validation-mcp 0.15.0.

- Hansen's SPA and Romano and Wolf's StepM hold their size: each bootstrap resample is divided by its own standard deviation instead of one estimated once from the sample, and p-values count ties. On 4,000 skill-less searches per family (20 strategies, 504 days) the SPA rejected 5.1% at a nominal 5% with normal returns and 5.4% with negative skew, against 7.2% and 12.7% before. When no strategy beats the benchmark, the p-value is now 1.
- The time machine no longer lets later filings through in fields without a date. `known_as_of` and `cross_section` returned `changed_after`, and `history` its `changed` column: whether a later filing reported a different value, which nobody knew on the date. They are left out, and the answer names them. A dropped later row is no longer counted, since how many later filings reported a figure is later news too. `list_concepts` is off in a time-machine run (its counts and order come from every filing). `cross_section` returns its rows again: the day its figures were fetched counted as a later date, so every row was dropped.

## 0.17.0

With canli-markets-mcp 0.12.0 and canli-fundamentals-mcp 0.8.0, from a test against other finance MCP servers on the newest models.

- Companies outside the US: `history` reads a company that is not in the reference live from the SEC (`data.sec.gov`), and says so. That gives it about 25 of the largest foreign companies it could not read, among them TSMC, Shell, Novo Nordisk, SAP, HSBC and AstraZeneca. Only canli-mcp turns this on; canli-fundamentals-mcp on its own still contacts only canlicapital.com.
- `financial_statements` reads foreign filers properly: a year shown in two currencies keeps both, `money_scale` reads millions of euros or yen, and a single statement of income and comprehensive income is found.
- `stock_snapshot`: analysts' price targets, ratings and estimates, valuation ratios, 52-week range, short interest and the next earnings date, from Yahoo Finance and labelled as its aggregates.
- `technical_indicators`: moving averages, RSI, MACD, Bollinger Bands and ATR for a symbol in one call.
- `reference_rates` has the ECB's euro exchange reference rates (`fx:GBP`).
- Names people use reach the company: "Google", "Facebook", "TSMC", "BofA". A latest value over fifteen months old says so.
- Smaller: `list_filings` takes `form`, `read_filing` counts each word it finds, `event_study` takes `last`.

## 0.16.1

With canli-markets-mcp 0.11.1, which adds `exposure_map` and reads guidance more carefully in `earnings_release` and `guidance_record`, and canli-backtest-mcp 0.5.1.

- `my_week`: one plain summary across up to 25 holdings: how each moved, what it told the SEC about, and when it is expected to report next.
- Less to read in every result: numbers show six significant figures, a tool's limits come once a session, and the list of source documents becomes a count. On the 33 recorded answers that is 15% fewer characters on a first call and 22% fewer when a tool is called again (`bench/result-chars.mjs`). The whole result stays under its ref.
- Faster start: Node's compile cache takes start-up from about 200 ms to about 155 ms from the second run on (Node 22.1 or later).
- `--as-of`: a live sweep of every tool found `earnings_calendar`, `world_economy` and `company_profile` wrong. The first and last are now off, the second is held to the year, and metadata no longer says what today is.
- `find_tool` finds the new tools: 26 of 26 first on a set that scored 18 before keywords.

## 0.16.0

With canli-markets-mcp 0.11.0 and canli-backtest-mcp 0.5.0, which add `filing_memory`, `guidance_record`, `what_happened_next`, `shipping_activity`, `page_attention`, `latest_price`, `filing_sentiment`, the `exchange_*` paper market, `agent_consensus` and `find_diversifiers`.

- The sentinel watches for a price move or level, a move in implied volatility, or a new filing, and sends a block of context the moment one comes: `sentinel_add`, `canli-mcp sentinel run`, and `canli-mcp --channel`, which wakes a Claude Code session. Crypto streams from Coinbase and US stocks from Alpaca with your keys; the rest is read on a timer, and every event says how late it can be. A rule can only watch and tell. Where events go is set by whoever starts it, and no outside text reaches the block.
- The time machine: `canli-mcp --as-of 2020-03-01` shows only what was public that day. Tools that cannot be held to the date are off, later rows are dropped, and any other later date stops the answer. `recipes/agent_backtest.mjs` backtests a model with it, and checks whether the model simply remembers the future.
- `signed_trial_count` counts the backtests behind a result from the signed audit log, and `canli-mcp check returns.csv --trials log` uses that count.
- `canli-mcp models install` adds optional local models, for `filing_memory` to rank by meaning and for `filing_sentiment`. No tool installs anything.
- `recipes/exchange_agents.mjs` runs different models against each other in the paper exchange, each through its own server.

## 0.15.1

- `verify_claims`, through canli-markets-mcp 0.10.1: a sentence calls a figure wrong only if it names the company and one period of its own. Otherwise the filed figure is shown without a verdict against it. On 0.10.0, 12 of 24 settled answers on 284 real sentences were wrong, 11 of them false contradictions. The fix is not yet measured on new sentences.
- `company_report`, through the same release: Lennox's fiscal 2025 revenue no longer reads as its fourth quarter.
- The hub goes from 5 to 18 strategies.
- `canli-mcp run` reaches the tools the server answers itself, such as `triangulate`, `brief`, `hub_list` and `find_tool`. It stopped with a TypeError on them in 0.15.0.

## 0.15.0

- Backtests that meet the market, through canli-backtest-mcp 0.4.0: `backtest_signal` with `capital_usd` and `dollar_volume_file` fills only what recent volume allows and pays square-root impact, and shows the Sharpe at each size, with none for a book that could not fill. Every reply replays the named crises its dates cover. Also `crisis_replay`, `cpcv` with shards other machines can run, a signed ledger of what companies filed (`proof_filings`, `proof_file`, `proof_verify`, `proof_find`), a paper league and a paper market for agents, with made-up money only.
- Through canli-markets-mcp 0.10.0: `figure_trace` follows a reported figure down the filing's own calculation and `token_check` reads what an ERC-20 contract can do. `verify_claims` fixes from claims people wrote in public posts: on 0.9.0, 14 of 29 settled answers on 64 real sentences were wrong, every one a false "contradicted"; a later sample on the first fixes had 4 of 13 wrong, and the last fixes are not yet measured.
- Packs: canli-markets-mcp 0.10.0, canli-backtest-mcp 0.4.0. Context stays at 2,524 tokens.
- `canli-mcp gui`: the tools and result views in a browser, on this machine. `canli-mcp serve`: MCP over Streamable HTTP and WebSocket for agents on this machine. Both answer only on the loopback address and need a token.
- `canli-mcp check returns.csv --trials 40`: the luck check for a CI job on any platform, computed on the runner. It never says passed. `canli-mcp run <tool> '<json>'` runs one tool from a shell and refuses any that sends orders.
- Views: a strategy against each crisis and at each size, the luck cliff of a deflated Sharpe, cross-validated paths, a figure traced down its filing, and clickable volatility surface cells.
- The hub: `hub_list`, `hub_check`, `hub_run`. Strategies as data, a recipe with fixed parameters, checked for plain words and no performance claims. No contributor's code runs.
- `draft_orders`: orders in a standard form with a hash, for a person to act on. It sends nothing.
- Recipes in `recipes/`: plain code, Claude, LangGraph, OpenAI Agents and CrewAI, stopping at an order file for a person to read. Templates for GitLab CI and Hugging Face in `integrations/`.

## 0.14.0

- `verify_claims` reads claims as people say them: "earned $9 per share", "lost $18.8 billion", "has $90 billion in cash",
  "about", "over", "last year". A part of the business is no longer judged against the whole company, and a second
  figure in a sentence is no longer dropped. Another company's figure, someone else's money and the future are not read.
- Packs: canli-markets-mcp 0.9.0.
- 0.13.3 was never on npm: a manual Glama build made that number there, so this release skips it.

## 0.13.2

- Clearer front tools: each description now says when to use it instead of its neighbours, what comes next, and how it
  fails. `history` and `financial_statements` say which to prefer. Context at start-up rises from 2,403 to 2,524 tokens.
- `triangulate` tells two readings of one fact from two measures under different tags: `different_measures` names a gap
  the tags explain, such as cash with restricted cash, and `disagreements` keeps the rest. It also compares facts with
  history when a filer's statements cannot be read, and reads a filer's diluted-common line (Hewlett Packard Enterprise).
- Packs: canli-markets-mcp 0.8.4 (Exxon's statements and filings work again; Northern Trust's revenue reads $8.09 billion;
  NXP's units), canli-fundamentals-mcp 0.7.5 ("BP" no longer reads BP Midstream Partners).

## 0.13.1

- `triangulate` holds one company on every road, and counts agreement with any of a statement's lines for a measure, so
  net income before and after preferred dividends is not called a disagreement.
- The fundamentals pack (0.7.4) finds the listed company for a name: "T Rowe Price Group Inc" had read a credit fund.

## 0.13.0

- `triangulate`: a company's revenue, net income, EPS, operating income, assets, equity and cash reached by three
  separate roads, with any disagreement named. `brief` runs it, and `swarm` runs it across an index.
- Run across the S&P 500 (3,112 figures, 49 lines flagged), it found bugs now fixed in the markets (0.8.3) and
  fundamentals (0.7.3) packs: names that found the wrong company, American Express's and Republic Services' revenue,
  Comfort Systems' history and NXP's scale.

## 0.12.2

The markets pack moves to 0.8.2: `brief`, `earnings_release` and `earnings_calendar` now read foreign issuers' results
from Form 6-K, and figures in other currencies keep them.

## 0.12.1

Wrong figures fixed, in the fundamentals pack (0.7.2) and the markets pack (0.8.1). `history` read proxy statements as
filings, so Arista's latest net income came back as 3,511. `company_report` showed no net income for Booking, whose P/E
read 0.91. Share counts tagged in thousands and Berkshire's two classes are handled, and Exxon Mobil's history is back.
`screen_companies` now filters and ranks on P/E, P/S, FCF yield and market cap across the whole market in seconds.

## 0.12.0

The markets pack moves to 0.8.0: ten new tools (355 in all), and foreign filers read properly (see its changelog).

- `brief`: one call on one company runs a dozen tools at once and returns one digest with flags that name their
  evidence, each full answer under a ref. NVDA: 12 workers, 3.9K characters against 43K for the answers themselves.
- `swarm`: one read-only tool over up to 500 companies, one ranked table back, resumable. The S&P 500 through
  `forensic_scores`: 69 seconds, 2.6K characters returned, 480 finished, 20 failures named.
- `stress_worlds`: a portfolio through thousands of synthetic worlds, real history resampled in blocks with real
  crises dropped in, alone or combined, or your own shocks. 5,000 worlds across 7 scenarios in 2 seconds. Scenarios,
  not forecasts.
- All three are ordinary code, not model calls, so the workers cost no model tokens.
- `run_tool` is marked destructive only when the paper pack is on: without it nothing can change an
  account, and clients asked for confirmation on every call for no reason. The hosted server, where
  nothing outlives a request, marks it read-only.

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
