# Offline finite baseline preparation

This prepares a **pipeline smoke contract**, not a model baseline or a ranking.
The fixed sample is 15 public V0 items: three per template, seed `20261001`, using
PR343's existing `stratifiedSample`. Larger studies need a separately reviewed
cohort and power/acceptance plan. These public questions are not held-out expert
gold and may have appeared in model training.

```sh
node scripts/datasets/filing-facts/baseline-contract-cli.mjs prepare . new-plan.json
node scripts/datasets/filing-facts/baseline-contract-cli.mjs audit . new-plan.json
node scripts/datasets/filing-facts/baseline-contract-cli.mjs questions . new-plan.json new-questions.json
node scripts/datasets/filing-facts/baseline-contract-cli.mjs audit-fixture . new-plan.json synthetic-capture.json
```

Every command is offline. Output files are created exclusively with mode `0600`;
existing inputs and results cannot be overwritten. The plan binds all five V0
files (including `SHA256SUMS`), the canonical dataset card, current README and
evaluation caveats, all seven PR343 scoring/replay dependencies, and the plan's
own compiler, CLI and instructions. Audit reconstructs the entire contract and
refuses changed bytes, sample order, expected/source bindings or requirements.
Keep the original plan and its source checkout. A changed implementation or card
requires a new plan; never replace old hashes to make an old audit pass.

The question projection contains only the selected IDs and original question
strings, plus its plan binding and explicit lack of execution authorization.
Expected answers and cited fact rows do not enter that projection. The plan
stores hashes of complete items, expected answers and cited fact rows; the exact
pinned dataset remains the offline oracle. Do not feed the dataset or plan to a
closed-book model. Cited facts do not establish full source availability.

Closed, source-assisted and MCP arms remain **held**. A fair comparison uses the
same question bytes, model/version and generation settings. Source-assisted and
MCP must expose the same immutable source bytes, temporal/concept coverage and
truncation policy. Their complete cohort and source availability must be frozen
before requests. Never remove errors or unavailable items after a run. Closed
versus assisted measures the availability of sources as well as the workflow;
it does not isolate an MCP transport effect. One earliest cited row does not
establish an unanswerable item's complete annual concept history.

PR343's capture currently supports `closed` and `mcp`, not a separate direct
source-assisted arm. Its live adapter also lacks attempt-level latency, price,
cost and retry records. A reviewed schema/measurement adapter and pinned source
parity are prerequisites to any execution; no source-assisted record is labelled
closed-book to bypass those requirements. The preparation CLI never invokes
that adapter. Provider, model, prices, resources and financial holds are null.
Fresh lead/127f usable-model and wallet review, the shared $6 total cash guard,
$2 reviewed job hold and $20 credit margin remain separate admission gates.
This contract allocates none of them and grants no model calls.

The fixture command accepts only `purpose: "synthetic-software-fixture"`, the
matching `baseline_contract_sha256`, and the full fixed sample in a closed-arm
PR343 capture. It calls `evaluateCapture` and `auditEvidence` unchanged. Raw
responses/errors and all missing entries keep PR343's full denominator; closed
tool contracts, calls, traces and source context are refused. Its result says
that it is a software fixture and makes no observed cost, usage or latency claim.
Actual model evidence remains unassigned and is refused by this command.

Future captures must retain every raw response, provider/model/response ID,
usage record, tool argument/result/truncation and every request/retry attempt,
including errors. Record attempt start/end and elapsed latency, cost or null
with reason, and a pinned price basis. Missing measurements stay null with
coverage counts. No success-only mean or partial total may imply complete cost.
Keep all 15 selected items in accuracy, coverage and missing/error denominators;
use [EVALUATION.md](./EVALUATION.md) and its replay CLI for authoritative scoring.

V0's 150-item historical arm records have no raw responses and remain unchanged
and unrescorable; parsing-change impact remains unmeasured. The 50-row packet is
blank, not authenticated human/expert gold. XBRL tagging errors can enter the
machine-derived answers. The historical card's blanket public-domain wording
does not clear rendered issuer filings, vendor rows or future provider transfer.
Only cleared original questions, numeric facts and filing identifiers belong
in a future run; data rights and human review retain their own evidence gates.
