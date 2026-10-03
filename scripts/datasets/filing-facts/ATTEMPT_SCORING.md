# Offline synthetic attempt scoring

The bridge accepts the delivered attempt accounting inputs and retains all fifteen
selected questions. It calls the unchanged FilingFacts scorer and accounting
auditor; it does not convert the ledger into the older integer-token capture.
The module is source complete. Its meaningful fixture cases remain unrun until
the existing remote CI runs the exact signed source.

## Native input contract and fixed limits

`scoreAttemptLedger(root, inputs)` accepts exactly `accounting`, `baseline`,
`questions`, `packets`, and `ledger`. `packets` must be `null`. All other inputs
must be native Buffer or Uint8Array views of ordinary, non-shared ArrayBuffers.
Parsed objects, strings, proxies, getters and shared buffers are refused.
Each native view is measured through intrinsic typed-array slots; every size and
the aggregate size is admitted before copying, parsing or hashing. Copies are
owned by the bridge. No caller iterator, species, conversion or JSON hook runs.

The fixed byte ceilings are 256 KiB each for accounting, baseline and questions,
8 MiB for ledger, and 9 MiB for all supplied inputs. JSON has at most forty levels
and 200,000 nodes. Duplicate JSON members, invalid UTF-8, lone Unicode surrogates
and nonfinite JSON numbers are refused. The scoring dataset is read through one
regular bounded descriptor, at most 8 MiB, with same-descriptor stability checks.
Implementation files have a 128 KiB ceiling each. Generation settings have a
16 KiB encoded ceiling.

`replayAttemptScoring(root, inputs, artifactBytes)` adds one native artifact input,
at most 1 MiB, and a 10 MiB total supplied-input ceiling. It owns all copies before
the first parse or hash. It deterministically recomputes the whole artifact.

The complete artifact, including its digest and final newline, is at most 1 MiB.
Before any derived report digest or artifact encoding, an exact JSON byte walk
charges braces, commas, keys, numbers and the inherited Python-compatible ASCII
escapes, reserving both fixed SHA-256 fields and the newline. NUL and each non-ASCII
code unit cost six encoded bytes; an astral pair costs twelve. Oversized derived
records are refused before their serialization; a bounded raw field is not a
promise that every derived record fits. Inherited auditors retain their original
finite limits and source-read behavior.

## Synthetic closed-arm admission

The ledger purpose must be `synthetic-software-fixture`, its arm must be `closed`,
and its declared provider/model must be `synthetic-fixture`/`fixture-model`.
Source packets, source-assisted/MCP admission and tool traces are refused.
Each recorded request is a closed question-only JSON envelope: `question` must
match the frozen projection; optional `fixture_turn` must match the recorded turn.
Source/context/tool metadata cannot enter that envelope. Nested source/context/tool
metadata is refused in generation settings and valid JSON responses. Malformed raw
error bodies remain opaque retained evidence with the original unknown measurements.
Observed model and price
labels, when present, must describe the same fixture model. These are software
inputs; they never authenticate a provider, model run or billing record.

## Source, cohort and scoring

The same owned dataset buffer is hashed against the immutable baseline before
the scorer parses it. Selection is exactly seed 20261001, three items from each
of five templates, in the original fifteen-item order. Original question, item,
expected-answer and cited-fact bindings are rebuilt. The original scoring/helper
closure and the whole new module are bound and rechecked before return.

A scored item must be completed with complete recorded attempt positions and
the audited named final successful raw attempt. Earlier answers are never picked.
Missing records, pending, not-started, incomplete, error and aborted items retain
explicit statuses and remain denominator failures. Blank or missing final answer
markers also remain in the denominator. The unchanged scorer determines numeric
formatting, wrong units, abstention and invention; its behaviour function sees all
fifteen rows, with twelve answerable and three unanswerable items.

The complete recomputed accounting companion is carried unchanged and hash-bound.
Unknown usage, clocks, prices and billing stay null. Known failed/retry subtotals
remain partial. No implicit retry or collector invocation occurs in either API.
Only remote synthetic tests may call the existing collector/recovery helpers.

This artifact establishes software-fixture replay only. It establishes no model
baseline, ranking, source completeness, independent expert labels or rights,
actual indexing, adoption, qualified strategy performance or financial outcome.

## API and replay

```js
import { scoreAttemptLedger, replayAttemptScoring } from './attempt-scoring.mjs';

// root is the absolute checkout path. Each document is supplied original byte data.
const inputs = { accounting, baseline, questions, packets: null, ledger };
const { artifact, artifact_bytes } = scoreAttemptLedger(root, inputs);
const receipt = replayAttemptScoring(root, inputs, artifact_bytes);
```

The result contains a deeply frozen artifact and a separate native Buffer holding
canonical JSON plus one newline. Replay owns a new copy of that buffer and of all
supplied inputs, strictly parses it, recomputes the full artifact, and compares all
members. Rehashing an altered score, status, measurement or implementation does not
make it pass replay. Unknown or additional report members are refused by equality.
No writer, collector, transport callback or automatic retry is part of either API.

The source closure includes the original seven scoring sources, baseline contract,
baseline CLI and guide, accounting module and guide, and this whole module and guide.
Import captures bounded regular source bytes; each invocation checks both its supplied
checkout and the loaded module's checkout before and after scoring. This detects
post-load edits, including comments. It cannot attest to trusted execution, provider
authenticity or an adversary who has replaced the JavaScript runtime itself.

The original baseline and accounting auditors keep their existing source reads.
The bridge adds its own single-descriptor dataset capture, hashes that same buffer,
then passes it to the unchanged dataset parser and sampler. It does not change a
historical V0 record or generate a token-complete legacy capture.

## Validation scope

The focused registration is `npm run test:attempt-scoring`. Root `verify` explicitly
lists tests; the new file is included exactly once adjacent to attempt accounting.
Existing commands, registrations, order and defaults remain unchanged.

Written tests exercise actual synthetic collector completion and interrupted pending
recovery, final-answer selection, all cohort statuses, original unit and abstention
predicates, failed retry measurements, null/partial accounting, native input admission,
duplicate/UTF-8/Unicode JSON refusal, same-buffer transient reads, source mutation,
rehashed artifacts, canonical expansion and separate caps. Synthetic descriptor and
network/process controls assert their adapters were reached or armed. Scoring and
replay never write to the repository or read credentials. Collector tests write only
to owned temporary fixture directories.

First runtime validation is the repository's existing remote CI on the exact signed
new head. Written cases and static source review do not establish a runtime pass.
No website, package-version or registry publication is part of this change.
