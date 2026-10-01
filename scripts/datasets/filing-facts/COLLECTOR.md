# Finite offline fixture capture

This collector supplies the missing durable capture prerequisite for
[attempt accounting](./ATTEMPTS.md). It accepts a **required injected synthetic
transport**, not a provider, SDK, endpoint, credential or network default. It does
not run a model, score answers, select prices or authorize any experiment arm.
The callback is trusted application code, not a sandbox: callers must supply
offline fixtures. All real closed, MCP and source-assisted execution remains held.

The exports are `prepareCollectorPolicy(root, inputs)`,
`collectFixture(root, inputs, policyBytes, directory, runtime)` and
`recoverFixture(root, inputs, policyBytes, directory, runtime = {})`.
There is deliberately no transport CLI. The five input members are UTF-8 JSON
bytes: `baseline`, `questions`, `accounting`, `configuration`, and `packets`
(null when unavailable). Prepare the first three with the unchanged PR351/353
APIs. Keep every original input alongside the capture. A policy binds exact input
bytes, all fifteen selected question IDs/hashes, dataset/sample/scorer/accounting
contracts and the loaded collector/guide bytes. Changes require a new policy and
a new empty capture directory; historical captures are never overwritten.

Configuration uses `canli.filing-facts-fixture-configuration.v1` and purpose
`synthetic-software-fixture`. The provider/model labels are `synthetic-fixture`
and `fixture-model`. Declare `arm` (`closed` or fixture-only `mcp`),
`generation_settings`, `response_pointers`, `price_basis` (null or explicitly
synthetic supplied metadata), `limits`, and ordered `items`. Limits contain
`attempts_per_item` (1..8), `turns_per_item` (1..6), and `item_duration_ms`
(1..30,000). These are proposed runner controls, not measured baseline results.
Each item names an ID from the frozen projection and a bounded `steps` array.
Missing items remain missing in the full fifteen-item accounting denominator.

Each step has a globally unique `id`, `turn`, `retry_of`, `request_raw`,
`trigger`, `http_statuses`, `delay_ms`, and `reason`. The first step is turn1,
trigger `start`, null retry/reason, no HTTP statuses and no delay. An explicitly
planned `http_error` or `transport_error` retry names the immediately preceding
ordinal and preserves its request bytes/turn. HTTP retries name their exact
unsuccessful statuses. A `response` continuation advances one turn and is not a
retry. Every later step needs a reason. Unmatched directives stop; neither429 nor
an exception creates an autonomous retry. The entire policy is saved before work.

`runtime.transport` receives a frozen fixture request containing question-only
bytes, the bound request, attempt identity, directive, absolute monotonic deadline
and an AbortSignal. It must return a Buffer or string encoding
`canli.filing-facts-fixture-response.v1`, purpose `synthetic-software-fixture`,
`http_status`, `response_raw` (string or null), `error` (string or null), and
`tools`. A tool has `id`, `name`, `status`, `error`, `arguments_raw`, and
`result_raw`; a supplied/truncated result is derived only after the raw envelope
has been persisted. Successful MCP fixture tools must match the immutable packet.
Envelope identity, HTTP/error bodies and every recorded retry remain available.
The test builders provide concrete configuration and response examples.

Raw requests/responses retain the353 64KiB limits; raw tool results retain its
256KiB bound and at most32 tools. A returned fixture envelope is capped at512KiB.
Within that cap, exact bytes are saved as base64 **before** UTF-8/Unicode/schema
refusal or any supplied-result truncation. Oversized envelopes receive an explicit
bounded refusal with observed length and no invented raw digest. Invalid Unicode
is not repaired. Inputs/events/ledgers are each bounded at8MiB, JSON depth40 and
200,000 nodes; a capture is bounded at32MiB and512 events. Duplicate JSON members,
conflicting identities, substituted files and tampered bindings are refused.
Admission conservatively counts every planned start/end/possible-overrun,
pending/raw/terminal, backoff pair and final marker, refusing plans above512
before capture effects. Original inputs/policy/manifest must leave reserved
control/footer space. Each new dispatch reserves a maximum bounded raw event
plus eight control frames; insufficient remaining byte capacity stops explicitly
before callback invocation. The8MiB ledger also reserves4MiB before a dispatch
for request/response/tool/answer expansion; initial ledger/control capacity is
checked before effects, and recomputed reports must fit the8MiB JSON bound.
These conservative limits can stop a plan before its maximum attempt count.
These are capture resource controls, not financial
holds or a promise against unexpected filesystem failure.

Supply an existing empty, owned mode0700 directory. Inputs, manifest and immutable
hash-chained events are created exclusively as singly linked regular mode0600
files. Reads/writes and readback use one descriptor per file, with identity,
snapshot and directory checks. A pending event is acknowledged before dispatch;
the raw envelope and terminal event are acknowledged before another attempt.
Write/read/fsync/close failures do not acknowledge an outcome or dispatch follow-up
work. Uncertain/partial files are retained for inspection; cleanup never unlinks
a replacement path. The owner manages any eventual removal. Hashes detect changes
against retained inputs; they do not authenticate a hostile writer or provider.

Recovery is read-only. It validates the exact original inputs, policy, event chain,
state transitions and unchanged implementations, then uses353 to reconstruct a
full-N ledger/report. Interrupted pending attempts retain null usage/time/cost
and an unavailable reason; interrupted item attempt totals remain unknown.
Recovery does not resume, retry, discard raw files or invent completion. A corrupt
or partially written event refuses recovery instead of issuing a false receipt.

Default clocks use `performance.now()` and caller wall timestamps. Tests can
inject `monotonic`, `wall`, `wait` and an `io` facade for explicit offline fault
controls; these are trusted callbacks too. An absolute deadline covers waiting,
backoff, request work and capture checks. Abort/timeout is raced against each
asynchronous fixture/wait, and losing callbacks have no collector write or retry
continuation. The absolute clock and explicit abort are rechecked inside the queued
dispatch continuation before invoking a fixture or wait, including a second
settled/abort check after the clock callback returns; earlier queued work or a
synchronous clock-requested cancellation cannot reuse a stale admission.
Recovery caps the actual event inventory
at512 before opening event files, including when the packet input is null.
Captured results that arrive before finalization retain known usage
even if a subsequent capture check exceeds the deadline. Unknown usage, identity,
price and clocks stay null/reasoned; actual provider billing is always null.

An attempt interval ends after raw capture/validation and before its terminal
marker. An item records observed elapsed lower bounds through terminal capture;
its353 duration is deliberately null because its own final-marker acknowledgment
cannot be included in that persisted timestamp. The returned closure observation
is taken after final file/source checks and descriptor closure. It is a caller
observation, not a persisted complete item latency or a universal budget proof.
Deadline breaches observed after marker writes remain explicit in the capture.
There is no universal wall-time or latency guarantee: timers/AbortSignal cannot
preempt synchronous trusted code, synchronous filesystem operations, OS suspension
or wholly between-check replacement. fsync is attempted, but power-loss atomicity,
filesystem durability, prompt isolation, source rights/completeness, absence truth
and authentic provider/billing evidence are not independently established.

All owner goals remain active. Synthetic software capture is not human expert
gold, a model baseline/ranking, observed provider performance or spend, search
indexing, developer adoption, research novelty or governed ALPHAC forward results.
