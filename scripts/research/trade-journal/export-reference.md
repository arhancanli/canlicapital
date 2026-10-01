# Journal accounting reference

The separate Python implementation reads authored JSON numbers as Decimal and reconstructs
cash, holdings, explicit fees, interval returns, both-sided turnover and observed drawdown.
It uses the existing independent Python journal byte/signature verifier; it never imports or
calls JavaScript accounting. Decimal precision is 100. It is internal independent code, not an
external audit, human gold annotation or authentic broker record.

`export-corpus.mjs` generates 1,000 signed synthetic input journals and explicit window
metadata. JavaScript chooses the inputs; Python consumes the same signed bytes rather than
attempting to reproduce JavaScript's random generator from a common seed. The synthetic key
seed is public test material. No broker or model API is called.

The cases vary opening long/short positions, paper/simulated/mixed venue labels, partial fills,
fees/rebates, corrections, selected windows and all five declared frequencies. Five deliberate
insolvency/recovery cases retain drawdown above 100% and undefined later relative returns.
Hand/adversarial tests additionally cover missing/duplicate period buckets, incomplete fees
and marks, invalid scopes, overfills, corrupt bytes and unresolved reconciliation.

From the repository, with Node 22+ and Python 3.12 plus `cryptography==50.0.0`:

```sh
node scripts/research/trade-journal/export-corpus.mjs /tmp/canli-export-reference
python scripts/research/trade-journal/recompute_export.py /tmp/canli-export-reference /tmp/export-python.json.gz
cmp /tmp/export-python.json.gz mcp-execution/test/fixtures/journal-export-python.json.gz
node --test js/trade-journal-export-core.test.js js/trade-journal-export-python.test.js js/journal-files.test.js
npm test --prefix mcp
npm test --prefix mcp-execution
```

The compressed fixture is deterministic (`gzip` timestamp zero). Its test checks all 1,000
case hashes, selected end hashes/ranges, frequencies, published financial metrics and every
observation to absolute 1e-12. There are 36,192 numerical comparisons; the recorded largest
error is 4.547473508864641e-13. Chain signatures are checked in both implementations. Separate
standard conformance passes on every exported record.

This oracle does not independently reproduce Sharpe, annualized compounding or the shared
minimum-track-record model. Those retain their existing validation-core tests; the export's
gate/disclosures are exercised separately. No claim of full trading-release qualification is
made. Broker state/allowlist/kill/deduplication requirements, research sessions, threshold gates,
hosted signed receipts, external review and all release token budgets remain in the original
trading plan. Local validation deliberately keeps `receipt:null`.

The real two-server stdio test exports a signed 350-observation private artifact and validates
its source hashes, signature, reconstructed record and companion observations. Direct local
tests reject altered claims, altered companion fees, corrupt source bytes, absent/wrong
signatures and hosted/remote file arguments. Source-free conformance reports unchecked bindings.
