# Journal performance export

Draft accounting profile `canli.trade-journal.account.v0`, additive to the existing signed
`canli.trade-journal.v0` format. The existing integrity verifier and vectors do not change.
Integrity alone is insufficient for performance: the writer must also supply the evidence below.

Genesis `payload.account` contains:

```json
{"schema":"canli.trade-journal.account.v0","strategy_id":"demo","venue":"local_sim",
 "currency":"USD","initial_cash":10000,"initial_positions":[],
 "frequency":"DAILY","periods_per_year":365}
```

`initial_positions` is an explicit array of `{symbol, qty, price}`. Quantities may be signed;
prices must be positive. Opening equity is cash plus the marked positions and must be positive.
`venue` is `local_sim`, `alpaca_paper` or `mixed`. `identity_kind` may name `CANDIDATE`, `SLEEVE`
or `BOOK` (default CANDIDATE); `session_id` is an optional label, not proof of counted trials.
`frequency` is DAILY, HOURLY, WEEKLY, MONTHLY or IRREGULAR (default IRREGULAR). Regular frequency
requires a positive declared `periods_per_year`. All other account members are refused.

Each fill requires a unique nonempty `fill_id`, a prior matching order, and an explicit finite
USD `fee` (zero must be written; a negative rebate is allowed). Cumulative filled quantity may
not exceed the order quantity. Optional `filled_at` must be a real UTC timestamp, not before
the order's journal timestamp or after the fill's journal timestamp. Optional scope labels
must match the account. The fill price and quantity must be positive.

Each mark gives positive prices for every nonzero open position and a nonempty source. A
caller-supplied `equity`, if present and nonnull, must match reconstructed equity to relative
1e-12 (absolute 1e-12 below one USD). No stale price is carried forward. Optional `observed_at`
must be a real UTC timestamp no later than the journal timestamp; effective observation times
must strictly increase. Undeclared cash flows, corporate actions, financing or missing fills
cannot be inferred. Declared unsupported cash-flow/corporate-action fields refuse export.

Corrections to order, fill and mark payloads require a nonempty reason and an explicit
`replacement` object. This is a shallow patch of the referenced payload; later corrections
to the same original event apply in sequence. Event sequence, kind and timestamp do not change.
Corrections to other kinds, unexplained corrections and non-AGREE reconciliation refuse export.
All corrections in the selected prefix are recorded, including those affecting carried state.

## Accounting and scope

Amounts and quantities are interpreted as the exact authored decimal numbers, using decimal
integer arithmetic for cash, holdings, fees and traded notional. This avoids binary roundoff
changing partial-fill/overfill judgments. Exported ratios are finite IEEE-754 numbers.

For a signed fill quantity q (positive buy, negative sell), price p and fee f:

- cash changes by `-q*p-f` and holdings by q;
- marked equity is cash plus `sum(qty*mark_price)`;
- an interval return is `equity/current_previous_equity - 1`;
- interval turnover is both-sided absolute traded notional divided by prior marked equity;
- cumulative return is final equity divided by opening window equity minus one;
- drawdown is the maximum of `1-equity/running_peak`, including the opening window equity;
- annual turnover is mean interval turnover times declared periods per year for regular samples.

`from`/`to` are inclusive journal sequence bounds. `from` is genesis or a mark used as the
opening valuation; `to` includes at least one later mark. State before `from` is replayed.
All bytes are verified, even outside the selected prefix; only corrections at or before `to`
can affect the calculation. A fill after the last selected mark refuses export: it needs a
valuation or an explicitly earlier `to`. Full-file SHA256 and selected end-line hash bind scope.

Equity at or below zero is retained. Later relative returns whose denominator is nonpositive
are null and explicitly counted; Sharpe and annual turnover then remain unreported. Losses
and drawdown above 100% are not removed. Financial arithmetic outside finite representable
ranges refuses export rather than emitting NaN or infinity.

UTC period buckets determine regularity. Missing or duplicate declared periods make the
effective series IRREGULAR; no zero-return observations are inserted. Regular nonconstant
finite returns use the shared validation moments and minimum-track-record core: sample SD,
population skew/non-excess kurtosis, benchmark Sharpe zero, confidence 0.95. Sharpe is reported
only after the minimum observation count; irregular, constant, insufficient or nonpositive
Sharpe samples retain a null figure. This test does not adjust for uncounted strategy selection.
Trial counts and preregistration remain unknown/false until bound research-ledger evidence exists.

## Output and verification

The export bundle contains the standard `canli.paper-evidence.v0` record, per-mark observations,
metrics, the full journal SHA256, selected sequence range and chain head. Its performance is
net of the supplied paper/modelled fees; it does not establish market execution or complete
cost coverage. Spread/impact embedded in supplied fill prices are not separately estimated.

The record is unsigned by default. Explicit signing uses only the local owner's `journal.key`
(0600, bounded regular file) whose Ed25519 public key matches genesis; a detached signature
covers canonical record bytes. Signed source journals are distinguished from signed exports.
A supplied publication URL is retained but never fetched by this offline operation; public
availability is not inferred from the URL. Source key possession is self-attestation.

Bundles up to 16 KiB return inline. Larger bundles are written to a private local exports
directory with exclusive creation and return a hash/path summary. Local validation accepts
`record` or `record_file` plus `journal_file`, checks the journal and bindings, and recomputes
all reconstructable record fields. Numeric comparisons use absolute 1e-12; identities, scope,
disclosures and enum fields must match exactly. A claimed signed record needs its detached
signature. Without a journal, validation reports shape/field relationships only. No raw journal
or signing key is uploaded; there is no third-party anchor or broker request in this workflow.
