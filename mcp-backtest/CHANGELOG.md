# Changelog

## 0.6.0

- `breadth_sweep` returns `every_trial`: every variant's annualized Sharpe, best first, with its combination `k`, the days it was measured on (one number when all variants share them, else one per variant) and `periods_per_year`. With `split_date` it is the Sharpe the settings were chosen on. A server that counts what a session tries, as canli-mcp does, counts each variant and not only the best, as with canli-quant-mcp's `strategy_sweep`. A shard's answer carries `every_trial` for its own variants, so they are counted as each shard runs, not first at the merge.
- `breadth_sweep` hands each variant's daily book returns to a server that runs this package in its own process, as canli-quant-mcp's sweeps do: every date of the prices file (a flat day as 0, so variants with longer warm-ups line up), in `every_trial`'s order, under `Symbol.for("canli.trial_returns")`. JSON leaves that key out, so the answer, `out_file` and shard files are unchanged. A shard hands over its own variants' returns as it runs; a merge hands over none. canli-mcp pools them by the prices file's bytes to measure overfitting across everything a session tried on that data.
- With those returns, the date of each day (the prices file's first column) under `Symbol.for("canli.trial_dates")`, so canli-mcp can set the best variant against the Lab's strategies over the same months. JSON leaves it out too.

## 0.5.1

- A file path with a null byte is refused by name instead of crashing. Found by the robustness bench on `find_diversifiers`.

## 0.5.0

New tools: `exchange_new`, `exchange_join`, `exchange_view`, `exchange_orders`, `exchange_step`, `exchange_report`, `exchange_run`, `agent_consensus`, `find_diversifiers`.

- The agent exchange is a closed paper market with limit order books, margin rules and forced selling, so a shock can become a cascade. Different AI agents join with tokens, each sees only its own account, time moves in steps that wait for everyone, and a hash chain of the tape lets anyone check a run by replaying it. The rules are in docs/AGENT_EXCHANGE.md.
- `agent_consensus` counts how many independent views a group of agents really holds, from their errors after each agent's usual error on that outcome is removed, because forecasters who are right about the same things otherwise look alike.
- `find_diversifiers` ranks by independent bets added and behaviour on a book's worst days. Return is never used to rank.
- A file that is not an arena or an exchange is refused without quoting it. A JSON parse error quotes what it read.

## 0.4.0

- `backtest_signal` with `capital_usd` and `dollar_volume_file`: an order fills only up to a share of recent daily volume and pays square-root impact, read from the days before each trade. The reply shows the Sharpe at each size the market can take, and none for a book that could not fill.
- Every `backtest_signal` reply replays the named crises its dates fully cover and lists the rest as untested. `fails` names what went wrong.
- `crisis_replay`: the same for any returns file.
- `cpcv`: combinatorial purged cross-validation of a search, with shards other machines can run and a merge that refuses other data, gaps and duplicates.
- `proof_filings`, `proof_file`, `proof_verify`, `proof_find`: a signed, append-only ledger of what companies filed, their restatements and file hashes. It shows lines were not changed afterwards, not that a figure is right.
- `league_new`, `league_commit`, `league_score`: a paper league. Commit a hash, reveal later, scored in the open against the best luck gives, with a paper book chosen on earlier rounds only. No prizes, no stakes, nobody's money.
- `arena_new`, `arena_orders`, `arena_step`: a paper market for AI agents with made-up assets and money.

## 0.3.0

- `breadth_sweep`: a grid of breadth-book settings run in parallel on every core (or as shards other
  machines run, merged with checks on inputs, grid, gaps and duplicates); the best Sharpe is set
  against the best-of-N luck benchmark, and with `split_date` the chosen settings are scored after it.

## 0.2.0

- The breadth lab: `breadth_signals` (24 cross-sectional signals with their sources),
  `breadth_book` (a sleeve for every signal in every group of names from your price panel, hedged
  and scaled, traded as one netted account; the book netted and standalone, the netting ratio,
  effective bets and ideas, and every sleeve's returns written as a dataset with its specs) and
  `effective_bets` (independent bets in any set of return series).
- `price_panel`: a price panel from free sources for the breadth lab or `backtest_signal`: the
  tickers you name or an index fund's current holdings, daily adjusted closes and dollar volume, and
  each company's Fama-French industry from its SEC SIC code (QQQ's 100 largest: 93 matched, 70 s).
- Annotation: `annotation_packet` (figures, or every figure in a draft such as an AI's answer,
  checked by machine against the filings and written as blind CSV packets for people to label), `annotation_agreement` (Cohen's kappa between people and
  against the machine) and `annotation_gold` (a gold JSONL set with a datasheet and hashes).

## 0.1.2

- Fix: a NUL character in `prices_file`, `signal_file` or `out_file` reached the file system, which
  throws a TypeError. It now fails argument validation with the reason.
- Fix: a factor named like a built-in property ("constructor") read Object's constructor out of the
  factor table; it is now an unknown factor, with the list of known ones. Both were found by
  canli-mcp's `bench/robustness.mjs`.

## 0.1.1

- Installable on its own. 0.1.0 was published with `canli-validation-mcp` declared as
  `file:../mcp`, a path that exists only inside this repository, so a standalone install could not
  load the server. 0.1.1 depends on the published `canli-validation-mcp@^0.14.0`. No code changes.

## 0.1.0 (2026-10-07)

- First release. `pit_factor`: point-in-time factors from SEC filings (roa, gross_margin,
  operating_margin, revenue_growth, asset_growth, accruals, level:<measure>) using only what had been
  filed by each date. `backtest_signal`: cross-sectional backtest of any signal on your own prices,
  trading only on signal rows at least lag_days old (checked at every rebalance), costs on the
  actual trades, and every run recorded in canli-validation-mcp's trial ledger when ledger is given.
  `list_factors`.
