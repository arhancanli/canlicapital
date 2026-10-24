# Changelog

## 0.3.1

- A preview's rows add `price` (the quote's mid, or a limit order's limit) and `notional`, so an
  order ticket shows what each order costs before it is sent. Both are left out in private mode.

## 0.3.0

- Attestations are signed twice on Node 24.7+: Ed25519 and post-quantum ML-DSA-65 (FIPS 204), over
  the same statement naming both keys (`v: 2`, `pq_key_id`, `pq_signature`); `verify_attestation`
  requires both to hold (`pq_public_key_pem`, default `CANLI_HOME/attest-ml-dsa-65.pub.pem`).
  Attestations from 0.2.0 still verify with the Ed25519 key alone.

## 0.2.0

- Every preview, rebalance and send returns an Ed25519-signed attestation (orders, limits and
  verdict hashed, account committed); `verify_attestation` checks one offline, and opens commitments.
- `CANLI_PAPER_PRIVATE=1`: the model sees commitments instead of the account's figures; order sizes
  from a rebalance and numbers in check messages are hidden too.

## 0.1.1

- zod 4.6.7 (a high advisory in earlier zod: memory exhaustion on oversized constrained collections). No code change.

## 0.2.0

## 0.1.0

First release: `paper_account`, `preview_paper_orders`, `rebalance_to_weights` and
`send_paper_orders` on Alpaca's paper endpoint only, with the repository's pre-trade checks, the
trader's limits file and kill switch, single-use five-minute confirmation tokens, idempotent client
order ids and a hash-chained local order log. Every broker request times out after 10 s; reads
retry transient failures; an order whose response is lost is resolved by its client order id. Tested against a fake Alpaca API (forged, altered,
expired and reused tokens send nothing; the kill switch read at send time stops a previewed order).
