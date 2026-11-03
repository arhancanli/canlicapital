# canli-backtest-mcp

Backtests an AI agent can trust. An MCP server that builds **point-in-time factors from SEC
filings**, runs **cross-sectional backtests of any signal on your own prices** with **no lookahead**
(enforced in code), charges **costs on the actual trades**, and records **every variant in a trial
ledger**, so the best of a search is judged against the whole search instead of alone.

Local stdio only: your prices, signals and ledgers never leave your machine.

**[canli-backtest-mcp on canlicapital.com](https://canlicapital.com/mcp-servers/backtest)** · [All Canli Capital MCP servers](https://canlicapital.com/mcp-servers). Free, MIT-licensed. For every server behind one install, use [canli-mcp](https://www.npmjs.com/package/canli-mcp).

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

## Breadth lab, sweeps and labelled data

| tool | what it does |
|---|---|
| `price_panel` | A price, dollar-volume and industry-group panel built from a fund's holdings (IVV for the S&P 500), ready for the tools below |
| `breadth_signals` | The 24 cross-sectional signals the lab builds sleeves from, each with its reference |
| `breadth_book` | Every signal inside every group of names as a sleeve, traded as one netted account: the book's Sharpe after costs, the netting saved, and its effective independent bets; writes the sleeves as a CSV with their specs |
| `breadth_sweep` | A grid of book settings run in parallel on every core, or as shards other machines run and merge back (inputs, grid, gaps and duplicates checked); the best Sharpe is set against what the best of that many trials reaches by luck, and with `split_date` the chosen settings are scored after it |
| `effective_bets` | How many independent bets a set of return series holds (the participation ratio of their correlations), by series and by family |
| `annotation_packet`, `annotation_agreement`, `annotation_gold` | Blind labelling packets of figures (or of a draft's figures) with guidelines and an answer key; agreement between labellers (Cohen's kappa); and a gold set with its datasheet |

## Size, crises and cross-validation

A backtest that assumes any size fills at the close flatters itself, so:

- **Size.** Give `backtest_signal` a `capital_usd` and a `dollar_volume_file`. An order fills only up to `max_participation` of recent daily volume (10% unless you say otherwise) and pays square-root impact, with volume and volatility read from the days before each trade. The reply shows the Sharpe at $100k to $1B, and no Sharpe for a size the market could not take. Order-book depth is not modelled: it needs paid data.
- **Crises.** Every reply holds the result against named crises, from the dot-com bust to the 2023 bank run. A crisis its dates do not fully cover is listed as untested, never as passed. `crisis_replay` does this for any returns file.
- **Cross-validation.** `cpcv` takes every variant's returns and, for each choice of held-out blocks, chooses the best on the rest, with purge and embargo at the edges, then scores it on what was held out. You get a spread of out-of-sample results, not one path. Splits can run as shards on other machines and merge back.

## A record, a league and a paper market

- **Proof ledger.** `proof_filings` writes what companies filed into an append-only file, each line chained to the last and each batch signed, with a line for every figure a later filing changed. `proof_file` adds any file's hash, `proof_verify` checks the whole file and says which line first fails. It shows lines were not altered, not that a figure is right, and no record means only no record. Publish the head somewhere else, or the key holder could rewrite it all. The [published ledger](https://github.com/arhancanli/canlicapital/releases) does that with a public attestation each month.
- **League.** `league_new`, `league_commit` and `league_score` run a tournament scored after the fact: an entrant signs and commits a hash before a round closes and shows the file afterwards, and anyone with the files can rerun the table. Each record is set against the best luck gives across that many entrants. The top entrants, chosen on earlier rounds only, form a paper book. No prizes, no stakes, nobody's money.
- **Arena.** `arena_new`, `arena_orders` and `arena_step` are a paper market for agents to trade in, cleared in a call auction, reproducible from a seed. Made-up assets and made-up money: it cannot reach anything real.
- **Agent exchange.** `exchange_new`, `exchange_join`, `exchange_view`, `exchange_orders`, `exchange_step` and `exchange_report` are a closed paper market where different AI agents and scripted traders meet in limit order books, with margin rules and forced selling, so a shock can become a cascade. `exchange_run` runs a whole market of scripted traders in one call. Time moves in steps, each agent sees only its own account, and a hash of the tape lets anyone check a run. Made-up assets and money. The rules are in [docs/AGENT_EXCHANGE.md](docs/AGENT_EXCHANGE.md).
- **Consensus.** `agent_consensus` combines agents' probabilities and counts how many independent views they really hold, from how their errors move together: five models that share their mistakes are not five votes.
- **Diversifiers.** `find_diversifiers` ranks candidates by the independent bets they add and how they behave on the book's worst days. Return is shown last and never used to rank.

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
