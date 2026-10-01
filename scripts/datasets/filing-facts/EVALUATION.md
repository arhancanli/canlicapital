# Reproducible FilingFacts evaluation

`replay-evaluation.mjs` scores saved answers and audits evidence entirely offline. It does not
load API credentials, call models or connect to MCP servers. Use the exact dataset bytes and
the evaluator checkout recorded in the evidence. The source hashes bind the scorer, evidence
runner, CLI, sampler, its imported generator/checker/template modules and canonical JSON
helper. Replay refuses changed sources, captures, scores or totals.

```sh
node scripts/datasets/filing-facts/replay-evaluation.mjs score items.jsonl capture.json evaluation.json
node scripts/datasets/filing-facts/replay-evaluation.mjs audit items.jsonl evaluation.json
```

Both commands validate the dataset digest and deterministic stratified sample. Duplicate,
unknown or out-of-sample IDs are refused. Scoring creates a new private file exclusively;
an existing result or input file cannot be overwritten. Audit exits 0 for a recomputed result,
1 for invalid evidence and 2 for an unsupported historical record that cannot be rescored.

The capture schema is `canli.filing-facts-answer-capture.v1`. Required fields are `provider`,
`model`, `arm` (`closed` or `mcp`), an ISO `recorded_at`, and `dataset_sha256`, the SHA256
of the exact JSONL bytes. `sampling` declares `method: "stratified"`, an unsigned 32-bit
`seed`, positive integer `per_template` and the selected `item_ids` in deterministic order.
Each captured run supplies `id`, raw `response_text` (string or null), `error` (string or null),
and nonnegative integer `tokens` and `tool_calls`. An MCP capture also retains its observed
`tool_contract.tools`. Closed-book captures must omit tool contracts and have zero tool calls
and empty or omitted tool traces. Inconsistent closed-book claims are refused. Missing captured
runs stay visible in coverage.

`eval.mjs` writes this capture inside `canli.filing-facts-evaluation.v1`, together with scores,
raw answers, the exact dataset digest, scorer version and source hashes. It records observed
provider response IDs/model names/usage, tool arguments/results and any result truncation.
It keeps oracle answers out of model prompts and captures; expected answers enter only during
offline scoring. This command still makes paid API calls when invoked, so use saved captures
for replay. No model calls are needed to verify the tests or historical limitations.

```sh
node scripts/datasets/filing-facts/eval.mjs items.jsonl new-evaluation.json --arm closed --seed 20260926
```

Retain `evaluation.capture` as the original answer capture when rescoring with a future scorer.
Produce a separate result and keep the original evidence and source checkout; an old source
hash must never be replaced just to pass a newer audit. New scores are a new evaluation of the
saved answers, not a new model run.

The scorer `canli.filing-facts-scoring.v1` reads the last standalone `ANSWER:` line. Blank
answers are missing. A number must be a complete decimal or scientific-notation number, with
valid optional thousands separators and a unit compatible with the answer kind. Arbitrary
internal whitespace, hexadecimal literals, nonfinite numbers and contradictory prose fail.
Numerical tolerances stay at 0.1% relative (minimum 0.005) for numbers, 0.05 points for percent
answers and 0.0005 for ratios. Absence requires the complete answer `not reported`, `not
available`, `no data`, `does not report`, `not disclosed` or `unavailable`, with an optional
final period or exclamation mark. A numeric answer followed by an absence phrase is incorrect.
Finite numeric answers to absence questions are counted as invented numbers, including
answers with a recognized currency or percent suffix.
Wrong-unit numbers on answerable questions are also counted as numbers given and wrong.

Overall accuracy divides correct answers by every selected item, including missing captures,
missing responses and request errors. `response_accuracy` separately uses captured responses
without request errors; it is null when there are none. Per-template accuracy uses every
selected item in that template. Answerable accuracy and abstention use every selected
answerable item; unanswerable correctness, abstention and invented-number rates use every
selected unanswerable item. `numbers_given` counts finite numeric answers on answerable
items. `numbers_wrong` divides incorrect finite numeric answers by `numbers_given`;
it is null when none were given. Abstention requires a complete absence answer;
malformed prose is neither a valid number nor an abstention. Coverage reports request failures,
missing evidence and responses without a final answer so a smaller successful subset cannot
hide incomplete work.

The public v0 baselines used legacy answer parsing and contain parsed answers and recorded
scores but no raw model responses, source-bound capture or scorer version. The effect of these
parsing changes on the old baseline is unmeasured. Full-sample coverage/denominator rules in
this guide apply to v1 evaluation evidence. V0 bytes and published scores remain historical.
They are explicitly **unrescorable**; do not synthesize raw answers from `parsed`, `expected`
or `correct`, or silently replace historical accuracy and abstention statistics.

```sh
node scripts/datasets/filing-facts/replay-evaluation.mjs audit public/datasets/filing-facts/v0/filing-facts-v0.jsonl public/datasets/filing-facts/v0/ff-eval-closed.json
```

Source binding and deterministic replay establish the scores of the supplied local capture.
They do not authenticate a provider response, establish filing truth, or prove human review
or expert qualifications. Synthetic test captures are labelled fixtures and are never model
baselines or expert gold. Filing truth and human annotation retain their separate checks.
