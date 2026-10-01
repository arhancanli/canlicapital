# Offline attempt accounting and source parity

This companion to [BASELINE.md](./BASELINE.md) prepares a checked accounting
contract and replays supplied local ledgers. It supplies no transport, automatic
retry, provider client, model execution, price lookup or financial allocation.
All three experiment arms remain unassigned and held. The fixed cohort remains
15 public pipeline-smoke questions; it is not held-out expert gold or a ranking.

```sh
node scripts/datasets/filing-facts/attempt-accounting.mjs prepare . baseline.json questions.json packets.json new-contract.json
node scripts/datasets/filing-facts/attempt-accounting.mjs audit . baseline.json questions.json packets.json contract.json ledger.json new-report.json
node scripts/datasets/filing-facts/attempt-accounting.mjs replay . baseline.json questions.json packets.json contract.json ledger.json report.json
```

Use `-` in place of the packet filename to declare source availability unverified.
The baseline and question projection come from PR351. Exact input bytes, dataset,
sample order, question hashes, scoring version/sources and accounting source/guide
bytes bind the contract. Changed bytes require a new contract. Outputs are created
exclusively with mode0600; existing inputs and historical records cannot be overwritten.
The CLI reads bounded regular files through one descriptor. The exported functions
accept UTF-8 JSON bytes, rather than live objects that can execute getters.

Source packets use `canli.filing-facts-source-packets.v1`. Declare a scoped rights
record (`status`, `content_class`, `basis`, `evidence_text`), the identical truncation
policy, and all15 ordered item IDs. The supported content class is
`original-questions-numeric-facts-filing-identifiers`. A policy declares `method`
(`none` or `prefix`), `unit: "utf16-code-units"` and an integer `limit`.
Each row has `available`, `unavailable_reason`, `coverage_kind`,
`coverage_evidence_text`, `original_source_bindings`, `source_assisted` and `mcp`.
An available arm frame supplies `raw_text` and `supplied_text`; both arms must
match byte-for-byte and follow the declared policy. Unavailable rows supply null
frames and an explicit reason. Source bindings contain URI, byte count and SHA256.
Coverage kinds are `selected-facts`, `captured-annual-series`,
`full-original-sources` or `unverified`.

These checks bind declarations and evidence bytes. They cannot verify legal rights
or completeness. Identical packets do not prove identical complete filing access.
Unanswerable coverage and independent full-original-source requirements remain
unsatisfied, including when a producer declares a packet complete. Selected V0
rows, a snapshot-relative earliest observation and a cited accession are insufficient.
Rendered issuer text, vendor data and future provider transfers need their own rights.

Ledgers use `canli.filing-facts-attempt-ledger.v1`, with an explicit purpose:
`synthetic-software-fixture` or `local-unverified-capture`. The latter is a local
claim, not authenticated provider output. Bind `contract_sha256`,
`question_projection_sha256` and, for MCP, `source_contract_sha256` (the canonical
hash of `contract.source_parity`). Closed ledgers require a null source hash and
empty tool traces. The accepted labels remain `closed` and `mcp`; source-assisted
is refused and must never be disguised as closed. This module does not convert
anything into PR343 answer-capture/evaluation evidence or change that schema.

Declare `provider`, `requested_model`, `generation_settings`,
`time_basis: "caller-observed-monotonic-ms"`, finite `bounds`, response JSON
pointers, `price_basis` or null, and item records. Response pointers name `answer`,
`response_id`, `model`, and `usage` component paths; input/output token paths are
required and cannot share the same pointer. Counts come from retained raw JSON. Missing, negative, fractional or
otherwise invalid usage stays unknown, with an explicit unavailable reason.

Each item records its ID/question hash, `status`, `error`, `declared_attempts`
(integer or null), `final_attempt`, `response_text`, `response_missing_reason`,
`time` and `attempts`. Status is `completed`, `error`, `aborted`, `not_started` or
`incomplete`. A missing item is retained in report denominators. Declared missing
attempt slots remain missing; unknown attempt counts do not become zero.

An attempt records `id`, `ordinal`, `turn`, `retry_of` (earlier ordinal or null),
`status`, `http_status`, exact `request_raw`, `response_raw`, their missing reason,
`answer_text`/missing reason, `error`, `usage_unavailable_reason`, `time` and
`tool_traces`. Status is `response`, `http_error`, `transport_error`, `aborted` or
`pending`. Retry requests must retain the same bytes and turn when their predecessor
is present. Missing predecessors remain missing slots. Raw answer text must agree
with the response pointer; malformed/error bodies remain raw evidence. Tool traces
retain ID/name/status/error, arguments, full result and supplied result. Successful
results are checked against the frozen packet; explicit tool errors are retained
and counted separately. A future collector must retain every attempt before proceeding.
Opaque request bytes and caller labels do not independently prove prompt isolation.

Timing has `started_at`, `ended_at`, `duration_ms`, and `unavailable_reason`.
Use explicit nulls and a reason for unavailable fields. Durations are supplied
caller-observed monotonic measurements, not inferred from wall timestamps.
Pending attempts do not count as completed latency measurements. Attempt totals
include retries/errors; item-duration means use all15 items only with complete
coverage. Unknowns never become invented zero latency, usage or cost.

A supplied price basis contains currency, as-of time, provider/model, original
`source_text`, explicit `units`, and decimal-string `rates_per_unit` for every usage component.
Input/output counts use individual `token` units, not millions of tokens.
The calculation uses exact integer arithmetic at12 decimal currency places.
Its output is a **supplied-rate usage estimate**, with a separate known component
subtotal. Missing price/usage or unverified observed-model applicability prevents
a complete estimate. An item with no retained attempts has no complete cost estimate,
including an abort before a request. Rates, component mapping/non-overlap, taxes, discounts and
other charges are not independently verified. Actual provider billing stays null.
Every raw price/source/ledger binding remains in the audit. No provider or price
is selected by this preparation.

The [regression fixture builders](./attempt-accounting.test.mjs) show complete
ledger and packet shapes with explicitly synthetic response and price values.
The `prepareAttemptContract`, `auditAttemptLedger` and `replayAttemptReport`
exports provide the same offline operations as the CLI. Keep the original
baseline/projection/packet/contract/ledger files alongside any report; the report
contains their bindings and normalized coverage, while raw bodies stay in the ledger.

Inputs are capped at8MiB, depth40 and200,000 nodes; an item at64 attempts, six conversation turns, a raw
request/response at64KiB and a source packet at256KiB. These are resource bounds,
not performance claims. Declared finite-bound violations are reported rather than
erasing their costs or failed attempts. Replay reconstructs the full report from
the same bound inputs. Synthetic values prove software behavior only; every owner
goal still needs its own indexing, expert, adoption, research and financial evidence.
Text fields require well-formed Unicode; truncation that cuts a surrogate pair
refuses rather than allowing distinct strings to share replacement-character bytes.
