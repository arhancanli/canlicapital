# Changelog

## Unreleased

The first release, 0.1.0, is paper trading only. It ships when every item of its release bar holds.

- Opt-in local `journal initialize/append` adapter uses the delivered private writer
  and fixed local signing key. Default advertised actions and hosted behavior remain
  unchanged. Typed pending/uncertainty errors return no success receipt, and exact
  retries preserve the original request and prefix. Fourteen synthetic adapter/wire
  cases are written; runtime/CI acceptance remains pending. No version or release.

- Private local journal storage foundation: supplied-key initialization and
  exclusive appends verify the chain, bind retry identity and request persistence
  before success. Interrupted operations return uncertainty and retain pending
  evidence. Its API is not registered directly; see `JOURNAL_STORAGE.md`.
  - 18 storage and 3 packaging cases pass. Three emitted synthetic signed snapshots
    pass the separate Python verifier; five request/receipt/prefix bindings, including
    two retries after a later append, agree with independent recomputation.
  - The initial shared-initialization failure and source/helper corrections remain
    retained. No hardware persistence, latency, broker or hosted-release claim.

- `journal export` recomputes cash, explicit fees, per-mark returns, turnover and drawdown
  from a declared signed account/window into paper-evidence.v0. Unknown fees, incomplete marks,
  unresolved reconciliation and unsupported financial events refuse; insolvencies stay visible.
  - 1,000 signed synthetic journals agree with separate Python Decimal accounting to absolute
    1e-12. A real two-stdio link validates a signed private export against its source journal.
  - Bundles above 16 KiB create exclusive local 0600 files with hash/path summaries. Signing
    is explicit and requires a private matching genesis key; no keys/journal entries are uploaded.
  - Journal annotations now declare possible local writes; head/verify still do not write.
    Bounded regular-file snapshots refuse FIFO/device input and detected concurrent edits.
  - The journal-export checkpoint measured the four-tool list at 1,691 o200k / 1,621 cl100k,
    with journal at 163 o200k. The 150-token journal and full seven-tool 1,700-token release
    gates remain open; no version bump or publication. Receipts are retained with the batch.

- `measure_shortfall` (local only): delay, execution, unfilled opportunity and stated USD fill
  fees, with decision/arrival/at-open comparisons and a seeded stationary-bootstrap interval.
  - Missing fees keep total cost unknown. Missing arrival keeps the delay/execution split unknown.
  - Duplicate IDs, overfills and backwards fill timestamps refuse; missing prices, zero quantity
    and possible splits are counted as exclusions. Default output is a bounded aggregate.
  - `orders_file` validates a bounded local JSON array and binds its captured bytes by SHA-256.
    The recorded 1,000-order request uses 58 o200k input tokens versus 96,154 inline; path
    lengths vary. No raw history is returned or uploaded. Local median: 3.3 ms without CI,
    24.7 ms with 199 bootstrap draws; these are single-machine synthetic measurements.
  - The stationary indices and ratio-percentile intervals agree with arch 8.0.0 on three
    recorded synthetic fixed-seed cases. An independent cash-flow identity checks 1,000 orders.
  - At the earlier shortfall checkpoint, the four-tool list measured 1,636 o200k / 1,571 cl100k
    using the shared family bench; the later journal-export measurement is recorded above.
    The new tool adds 386 o200k; its original 220-token target is not met. Broker tools and the
    full seven-tool release budget remain outstanding. No version bump or publication.

- `check_orders`: each order's estimated cost (the commission you state, half the quoted spread,
  square-root impact at coefficients 0.5, 1.0 and 1.5, and short borrow carry), checked against
  your limits, the market state and the kill switch.
  - It rejects with every reason and never resizes.
  - Anything not given is listed as not modelled, never assumed.
  - Verdicts and reason codes match AlphaForge's pre-trade checker on 5,000 random batches.
- `size_position`: the position a budget allows on one side, lot-rounded and never above a cap,
  with the orders from your current position and the cap that binds.
  - Budgets: a volatility target, risk per trade, or a fixed fraction of equity.
  - Your drawdown ladder's state halves or zeroes the budget.
  - It gives AlphaForge's orders on 2,996 of 3,000 rebalancer cases and its ladder state on 59,889 of 60,000 updates. The remainder are the deliberate differences: no zero-lot order, and no timed rearm.
  - `require_drawdown_state` in the limits file refuses a size without that state.
- `journal`: `head` and `verify` for a trade journal in the new `canli.trade-journal.v0` format.
  Each line is signed with Ed25519 and chained to the one before by sha256.
  - A second verifier in Python, written from the standard alone, agrees on 36 named vectors and
    on 1,000 journals with one byte flipped.
  - Every flipped journal fails at the line holding the flipped byte.
- Your limits file (`~/.canli/limits.json`) can only be tightened by a call. The `KILL` file
  refuses every order. Both are read on every call.
- The hosted build has the cost and order-level checks only and takes no account.
