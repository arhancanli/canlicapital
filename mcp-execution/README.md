# canli-execution-mcp

**Status: in development, not yet released.** Nothing here is on npm or hosted yet. The first
release, 0.1.0, is paper trading only and ships when every item of its release bar holds (see
`CHANGELOG.md`).

An MCP server that checks orders before they are sent. `check_orders` estimates what each order
would cost and checks it against the trader's own limits, the market state and a kill switch. It
rejects with every reason and never resizes an order. It places no orders: this build has no broker
code at all.

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
