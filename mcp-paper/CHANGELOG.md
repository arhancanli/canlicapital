# Changelog

## Unreleased

## 0.1.0

First release: `paper_account`, `preview_paper_orders`, `rebalance_to_weights` and
`send_paper_orders` on Alpaca's paper endpoint only, with the repository's pre-trade checks, the
trader's limits file and kill switch, single-use five-minute confirmation tokens, idempotent client
order ids and a hash-chained local order log. Tested against a fake Alpaca API (forged, altered,
expired and reused tokens send nothing; the kill switch read at send time stops a previewed order).
