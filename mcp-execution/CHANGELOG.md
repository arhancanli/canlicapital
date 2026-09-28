# Changelog

## Unreleased

The first release, 0.1.0, is paper trading only. It ships when every item of its release bar holds.

- `check_orders`: each order's estimated cost (the commission you state, half the quoted spread,
  square-root impact at coefficients 0.5, 1.0 and 1.5, and short borrow carry), checked against
  your limits, the market state and the kill switch.
  - It rejects with every reason and never resizes.
  - Anything not given is listed as not modelled, never assumed.
  - Verdicts and reason codes match AlphaForge's pre-trade checker on 5,000 random batches.
- Your limits file (`~/.canli/limits.json`) can only be tightened by a call. The `KILL` file
  refuses every order. Both are read on every call.
- The hosted build has the cost and order-level checks only and takes no account.
