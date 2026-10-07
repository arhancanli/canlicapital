# canli-backtest-mcp

Backtests an AI agent can trust. An MCP server that builds **point-in-time factors from SEC
filings**, runs **cross-sectional backtests of any signal on your own prices** with **no lookahead**
(enforced in code), charges **costs on the actual trades**, and records **every variant in a trial
ledger**, so the best of a search is judged against the whole search instead of alone.

Local stdio only: your prices, signals and ledgers never leave your machine.

## Why

Three mistakes make most agent-run backtests look better than they are:

1. **Lookahead.** Using a number before it was public: an annual figure in January that was filed in
   February, or a value that was later restated. `pit_factor` only uses what had been filed with the
   SEC by each date, as it stood then; `backtest_signal` only trades on signal rows dated at least
   `lag_days` trading days earlier, and stops if anything reaches past that.
2. **Free trading.** Ignoring turnover. Positions drift with prices between rebalances, and costs are
   charged on the trades from those drifted positions to the new targets.
3. **Counting only the winner.** An agent tries 200 variants and reports the best. With `ledger`,
   every run is recorded (in canli-validation-mcp's hash-chained ledger), and each reply gives the
   best run's deflated Sharpe after counting all of them, and the Sharpe that luck alone reaches.

## Tools

| tool | what it does |
|---|---|
| `list_factors` | The factors `pit_factor` builds and what each measures. |
| `pit_factor` | A factor (`roa`, `gross_margin`, `operating_margin`, `revenue_growth`, `asset_growth`, `accruals`, or `level:<measure>`) for your tickers, monthly, as known on each date. Writes a signal CSV. |
| `backtest_signal` | Rank on the signal, long the top quantile (and short the bottom), rebalance weekly, monthly, quarterly or every N days, with `lag_days`, `cost_bps` and an optional `ledger`. |

## Quick start

```bash
npx -y canli-backtest-mcp
```

Claude Code:

```bash
claude mcp add canli-backtest -- npx -y canli-backtest-mcp
```

Then ask: *"Build roa for these 200 tickers from 2015 to 2024, backtest it monthly on prices.csv with
10 bps costs, try quantiles 0.1, 0.2 and 0.3 in the ledger 'roa-search', and tell me whether the best
one survives the search."*

## Files

Both files are CSV with a `date` column (YYYY-MM-DD) and one column per ticker:

- **prices**: closing prices, one row per trading day. Bring your own; adjust for splits and dividends
  if you want total returns. The server does not supply prices (vendor licences forbid passing them on).
- **signal**: one row per date the values became known. `pit_factor` writes this; your own signal works
  too, as long as each row is dated by when it was available.

Empty cells are missing values, never zero.

## What a result does not establish

- Prices are yours: survivorship, splits, dividends and data errors in them pass straight into the result.
- A backtest measures one path of history under these costs; it does not establish that the signal keeps working.
- Costs are a flat rate per unit traded; market impact, short-borrow fees and financing are not charged unless included in `cost_bps`.
- SEC values are what companies reported in XBRL, as filed; late filers, non-XBRL filers and tag changes can be missing.

## Configuration

| variable | default | meaning |
|---|---|---|
| `CANLI_LEDGER_DIR` | `~/.canli/ledgers` | where ledgers are kept (shared with canli-validation-mcp) |
| `CANLI_CACHE_DIR` | `~/.cache/canli-fundamentals` | SEC data cache |

## Part of the Canli Capital MCP family

[canli-validation-mcp](https://www.npmjs.com/package/canli-validation-mcp) (validators and the trial
ledger), [canli-fundamentals-mcp](https://www.npmjs.com/package/canli-fundamentals-mcp) (SEC fundamentals
point in time), [canli-research-mcp](https://www.npmjs.com/package/canli-research-mcp) (the open research
record). Source: [github.com/arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/tree/main/mcp-backtest).
MIT licensed. Built by Arhan Canli.
