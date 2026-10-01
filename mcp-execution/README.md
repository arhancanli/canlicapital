# canli-execution-mcp

**Status: in development, not yet released.** Nothing here is on npm or hosted yet. The first
release, 0.1.0, is paper trading only and ships when every item of its release bar holds (see
`CHANGELOG.md`).

An MCP server for planning and checking orders before they are sent. It places no orders: this
build has no broker code at all.

- `size_position` turns a budget you state into a lot-rounded position that stays under every cap,
  with the orders from your current position and the cap that binds.
- `check_orders` estimates what each order would cost and checks it against your limits, the
  market state and a kill switch. It rejects with every reason and never resizes an order.
- `measure_shortfall` measures the cost of supplied fills: delay, execution, unfilled opportunity
  and stated fees. It runs locally; the default result is an aggregate rather than a long fill list.
- `journal` checks a signed journal and exports recomputed paper evidence, offline.

## What `measure_shortfall` computes

All prices are USD; each fee is the USD amount charged for that fill (a rebate can be negative).
The denominator is the whole order's decision notional, including in arrival/at-open comparisons.
Positive means cost. The fill source is your declaration, not authenticated broker evidence.

Send this to `measure_shortfall` through your local MCP client:

```json
{
  "fill_source": "self_reported",
  "orders": [{
    "id": "example", "side": "buy", "qty": 100,
    "decision_price": 100, "decision_ts": "2026-10-01T12:00:00Z",
    "arrival_mid": 101, "horizon_price": 104,
    "fills": [{"qty": 60, "price": 102, "fee": 6, "ts": "2026-10-01T12:01:00Z"}]
  }]
}
```

The result is 60 bp delay, 60 bp execution, 160 bp opportunity and 6 bp fees: 286 bp total.
Sixty of the hundred shares filled, so the fill rate by notional is 0.6.

For a large local history, save just the `orders` array as JSON, then call with
`{"fill_source":"self_reported","orders_file":"/absolute/path/to/orders.json"}` instead of
inline `orders`. Give exactly one input form. Files are capped at 16 MiB, validated against the
same order schema, and read through one file descriptor. The result binds the captured bytes
with their SHA-256, without returning the path or raw history. Nothing is uploaded.

- Remove `fee` from that fill: `fees_bps` and `total_bps` become null; `price_cost_bps` remains
  280. Missing fees are never zero-filled. With no `arrival_mid`, the delay/execution split is
  unknown while combined price cost is still measurable.
- Add `"benchmark": "arrival"`: delay is zero, execution is 60 bp, unfilled opportunity is
  120 bp and fees are 6 bp, for 186 bp against arrival, still divided by decision notional.
  `"at_open"` uses each order's `open_price` instead.

Unfilled quantity needs a `horizon_price`; without it the whole order is excluded, with its reason.
The fixed 30% price-move guard excludes possible splits/bad marks and also real large moves.
Duplicate IDs, overfills and fills before their decision timestamp refuse rather than change data.
`max_rows` is 0 by default; set it to 1..200 for per-order rows. Exclusions are counted, with a
bounded list of IDs. The tool never returns every order just because the input contains many.

For a 95% stationary-bootstrap percentile interval, send `"bootstrap": {}`, optionally a top-level `seed`,
and `block_length`/`resamples` inside the bootstrap object. Defaults: seed 20261001, mean block
length min(5, usable orders), 499 resamples. Orders must be chronological by decision time.
The interval resamples geometric circular blocks and recomputes the notional-weighted ratio.
If any fill fee is missing, every resampled order uses price cost excluding fees. Fewer than two
usable orders cannot produce an interval. This interval depends on ordering/block length and
does not establish profitability or account for regime shifts.

Three synthetic cases agree with arch 8.0.0 on every sampled index and the cost/notional
ratio-percentile interval when using the recorded shared random draws. The local seeded
generator is xorshift32, distinct from NumPy/arch; equal numeric seeds across libraries do not
imply identical draws. The fixtures are reproducible with
`scripts/research/execution-parity/record-shortfall-arch.py`. A separate read-only local check
compares against ALPHAC's paper-order analysis; only aggregates are published, not vendor bars
or order rows. Paper-engine costs remain labeled as paper measurements.

The recorded local stdio benchmark uses synthetic fills and three warmups per case. For 1,000
orders, aggregate-only medians were 4.0 ms inline and 3.3 ms from a file; a 199-resample bootstrap
from the file was 24.7 ms. The supplied inline orders cost 96,154 o200k input tokens; the file
request cost 58 (path lengths vary), with a 370-token text response. These are one-machine
measurements, not hosted latency or a comparative ranking. The full four-tool list is 1,636
o200k / 1,571 cl100k. From the repository root, reproduce with:

```sh
uv run --no-project --with tiktoken python scripts/bench/execution-shortfall.py
uv run --no-project --with tiktoken python scripts/bench/mcp-tool-tokens.py --json
```

Full observations and source hashes: `artifacts/goal/shortfall-local-benchmark-20261001.json`.

## The trade journal

A trade journal (`canli.trade-journal.v0`, specified in `standards/trade-journal/`) is an
append-only file of signed, hash-chained entries: what was decided, checked, sent, acknowledged,
filled, marked and corrected, in order. Anyone holding the file can check that no entry was changed,
dropped, reordered or inserted, and that every entry was signed by the key named on the first line.
`journal` with `verify` names the first line that fails, and why; `head` gives the last hash, the
entry count and the key's fingerprint. These two actions return verdicts and hashes.

The repository source also supports `export`, with the additive account profile in
[`EXPORT.md`](https://github.com/arhancanli/canlicapital/blob/main/standards/trade-journal/EXPORT.md).
It requires signed opening cash/positions, explicit USD fill fees and complete valuations;
missing evidence or unresolved reconciliation refuses export. Returns, costs, turnover and
drawdown are recomputed for inclusive `from`/`to` sequence bounds, replaying earlier holdings.
Losses through zero and drawdown above 100% remain in the record. Trial counts stay unknown.

An export returns `record` inline up to 16 KiB, or a new private `record_file` above that size.
Optional `sign:true` uses the matching local 0600 `CANLI_HOME/journal.key`; it is self-attestation.
The source journal is never modified or uploaded. A `publish_url` is metadata, not a publication
action. See [SECURITY.md](https://github.com/arhancanli/canlicapital/blob/main/mcp-execution/SECURITY.md).

Run both unreleased servers from the repository checkout. With the validation server configured
as `CANLI_LOCAL=1 node mcp/src/server.mjs`, the two MCP calls are:

```json
{"action":"export","file":"/absolute/paper-session.jsonl"}
```

Then call `validate_paper_evidence` with the returned artifact and original source:

```json
{"record_file":"/absolute/returned-export.json","journal_file":"/absolute/paper-session.jsonl"}
```

For an inline export, send its `record`, optional detached `signature`, and `journal_file`
instead. `bindings.checked:true` and `all_match:true` mean the supplied source and claims match.
Without the journal, a conforming shape leaves source facts/signatures unchecked. Local results
have no stored Canli receipt. These fields are not available from the currently published npm
validation package or hosted release until the next substantial release batch.

The standard was checked with a second verifier, written in Python from the standard's text alone:
- The two agree on all 36 named vectors, one for each way a journal can fail.
- They agree on 1,000 journals that each had one byte flipped. Every one of those fails at the
  line holding the flipped byte.

A separate Python Decimal financial reference agrees on 1,000 signed synthetic accounting
journals (36,192 numerical comparisons, absolute tolerance 1e-12), including decimal partial
fills, corrections, carried window state, fees, all declared frequencies and five insolvency/
recovery cases. This is independent implementation within this repository, not external review
or broker evidence. Reproduction instructions are in
[`export-reference.md`](https://github.com/arhancanli/canlicapital/blob/main/scripts/research/trade-journal/export-reference.md).

## What `size_position` computes

You state a budget, in one of three ways:
- a volatility target: the position whose annual volatility is that share of equity;
- risk per trade: a stop distance and the share of equity you accept losing at the stop;
- a fixed fraction of equity.

The position is then the smallest of that budget and your caps. The caps are the position,
gross and net caps as fractions of equity, and ADV participation, which caps the opening order.
The result is floored to your lot size. The tool names the cap that binds and the headroom left
under each one.

A drawdown state from your own ladder halves the budget, or zeroes it. The ladder halves at
`half_at`, goes flat at `flat_at`, and a halved ladder releases below 0.75 of `half_at`.

The orders to reach the position follow the same rules as AlphaForge's rebalancer:
- The lot grid is applied.
- A small opening order is skipped below 1.05 times the minimum notional.
- A reduce is never skipped.
- A flip is sent as a reduce-only close, then an open.

A reduce that brings a position back under a cap is rounded up to the lot, so the position ends
at or under the cap. There are no default caps: `max_position_frac` must come from the call or
your limits file.

## What `check_orders` computes

For each order, from the inputs given:

- **Commission**, from the fee schedule you state (a rate in basis points, a per-share charge with
  a minimum, and US equity sell-side regulatory fees). With no schedule, commission is listed as
  not modelled. It is never assumed.
- **Half the quoted spread**, from the bid and ask you give.
- **Market impact** by the square-root law, `Y * daily_vol * sqrt(notional / ADV)` (Toth et al.
  2011; Almgren et al. 2005), at the coefficient `Y` = 0.5, 1.0 and 1.5. That is a range of the
  model's parameter, not a probability interval. Up to 1% of ADV the regime is `ok` and above 1%
  it is `warn`. Above 5% the law understates cost, so no impact number is given.
- **Borrow carry** for a sale that opens a short, ACT/360.
- **A walked book**, when you give one: the fill a taker order would get through the levels, and
  whether the book ran out.

It then checks each order in batch order against a working book:

- Price collar, position cap, gross and net caps (fractions of equity), ADV participation, and
  order and daily notional caps.
- Symbol and order-type allowlists.
- Market state: a closed market refuses market, DAY and IOC orders. Only a GTC limit may rest.
- Mark staleness, and the kill switch.
- A reduce-only order that does not reduce is refused. Reduce-only orders are exempt from the
  position, gross, net and ADV caps, so a trader can always de-risk, but never from the collar.
- When the book is over its gross cap even with every opening order dropped, opening orders are
  refused as `systemic_breach` and reduce-only orders still go through.

A check that needs an input you did not give is listed in `checks_skipped` with the reason. It is
never passed silently.

## Your limits and the kill switch

Local state lives in one directory you control, `~/.canli` (or `CANLI_HOME`). No tool writes to it:

- `limits.json`: your limits. A call can only tighten them, never loosen them. An unreadable or
  invalid file refuses every check rather than run without it.
- `KILL`: while this file exists, every order is refused as `kill_switch_engaged`.

Both are read on every call. Each result carries `limits_digest`, the sha256 of the effective
limits, so a record can show which limits a check ran under.

## How it was checked

- The cost functions match AlphaForge's `TransactionCostModel`, `FeeSchedule` and book walk on
  1,000 random cases each, to 1e-12.
- The verdicts and reason codes match AlphaForge's `PreTradeChecker` on 5,000 random batches.
- The sizing was checked against AlphaForge:
  - 2,996 of 3,000 lot-rounding cases give the same orders. In the other 4, AlphaForge raises
    building a zero-lot order; here that order is left out.
  - 59,889 of 60,000 drawdown-ladder updates give the same state. The other 111 are the live
    ladder's timed rearms after a halt. A stateless call cannot count bars, so it stays flat until
    you pass state `normal`.
  - All 1,000 volatility-target cases match.
- Across 10,000 random books, a sized position never added exposure past a cap.
- Each rule was broken in turn, and a test failed every time.
- The recorded fixtures and the scripts that recorded them are in this repository
  (`scripts/research/execution-parity/`), pinned to the AlphaForge commit named in each file.

## Hosted

The hosted build will offer `check_orders` with the cost and order-level checks only. It takes no
account or positions and keeps nothing. Position, gross and net caps need your book, so they run
locally.

Not investment advice. The results are estimates from the inputs you give and a published model;
they are not a quote from any venue.

MIT licensed.
