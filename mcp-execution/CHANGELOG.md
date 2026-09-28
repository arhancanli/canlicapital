# Changelog

## Unreleased

The first release, 0.1.0, is paper trading only. It ships when every item of its release bar holds.

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
