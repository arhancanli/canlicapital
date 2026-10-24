# Changelog

## Unreleased

- Every preview, rebalance and send returns an Ed25519-signed attestation (orders, limits and
  verdict hashed, account committed); `verify_attestation` checks one offline, and opens commitments.
- `CANLI_PAPER_PRIVATE=1`: the model sees commitments instead of the account's figures; order sizes
  from a rebalance and numbers in check messages are hidden too.

## 0.1.1

- zod 4.6.7 (a high advisory in earlier zod: memory exhaustion on oversized constrained collections). No code change.

## Unreleased

## 0.1.0

First release: `paper_account`, `preview_paper_orders`, `rebalance_to_weights` and
`send_paper_orders` on Alpaca's paper endpoint only, with the repository's pre-trade checks, the
trader's limits file and kill switch, single-use five-minute confirmation tokens, idempotent client
order ids and a hash-chained local order log. Every broker request times out after 10 s; reads
retry transient failures; an order whose response is lost is resolved by its client order id. Tested against a fake Alpaca API (forged, altered,
expired and reused tokens send nothing; the kill switch read at send time stops a previewed order).
