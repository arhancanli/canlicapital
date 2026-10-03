# Offline attempt-scoring command

Score a saved **synthetic software fixture** ledger or replay an existing scoring
artifact. This command adapts files to the delivered `scoreAttemptLedger` and
`replayAttemptScoring` APIs. It leaves the scorer, measurement companion, source
closure and artifact schema unchanged.

## Commands

Supply an explicit checkout root and five explicit file paths. All paths must be
normalized absolute paths with canonical parent directories. The checkout root
must also resolve to its own real path. The command accepts positional arguments
only; a missing or extra argument, another mode, or an option refuses the command.

```sh
node scripts/datasets/filing-facts/attempt-scoring-cli.mjs score \
  /absolute/canlicapital-checkout \
  /absolute/private-fixture/accounting.json \
  /absolute/private-fixture/baseline.json \
  /absolute/private-fixture/questions.json \
  /absolute/private-fixture/ledger.json \
  /absolute/private-fixture/new-artifact.json

node scripts/datasets/filing-facts/attempt-scoring-cli.mjs replay \
  /absolute/canlicapital-checkout \
  /absolute/private-fixture/accounting.json \
  /absolute/private-fixture/baseline.json \
  /absolute/private-fixture/questions.json \
  /absolute/private-fixture/ledger.json \
  /absolute/private-fixture/new-artifact.json
```

`npm run filingfacts:attempt-scoring -- score ...` and `... -- replay ...` forward
these same arguments. An owned symlink to the command entry has the same behavior
as a direct entry. Importing the module defines its bounded asynchronous
`main(argv)` function without starting a command. `main` returns
`{ exitCode, stdout, stderr }`; the direct entry writes those bounded strings.

The four inputs are the original saved accounting contract, baseline, question
projection and ledger bytes. The CLI passes them directly to the unchanged core;
it does not parse and reserialize them. It always supplies `packets: null`.
The inherited strict UTF-8/JSON parser and auditor decide whether the saved
documents, raw envelopes, sources, fixed sample and measurements agree.

Only purpose `synthetic-software-fixture`, closed arm, provider
`synthetic-fixture` and model `fixture-model` are accepted by the inherited core.
The command supplies no collector, transport, tool, source/context, provider,
model, clock, price lookup or execution-arm option.

## Reading saved files

Every supplied file must be a regular file. Inputs use one descriptor each,
opened with `O_NOFOLLOW | O_NONBLOCK`. Final-component symlinks, directories,
FIFOs, duplicate file identities and noncanonical parents refuse admission.

All four descriptors for score, or all five for replay, have their type, declared
size and combined byte budget admitted **before the first supplied payload
allocation or read**. The limits come from `ATTEMPT_SCORING_LIMITS`:

| Input | Maximum |
| --- | ---: |
| accounting | 256 KiB |
| baseline | 256 KiB |
| questions | 256 KiB |
| ledger | 8 MiB |
| replay artifact | 1 MiB |
| score combined inputs | 9 MiB |
| replay combined inputs | 10 MiB |

The individual ceilings permit at most 8.75 MiB for score and 9.75 MiB for
replay, so they are already stricter than the combined ceilings. The adapter
still checks the combined budget before reading. Tests observe all admissions
before the first payload allocation/read, rather than invent an unreachable
combined-limit failure under these fixed individual limits.

Reads loop over finite chunks, handle positive short reads and probe at most one
overflow byte. They compare the same descriptor's device, inode, mode,
owner/group, link count, size and nanosecond modification/change times. A final
recheck of every still-owned descriptor and named entry catches an earlier input
changing during a later capture. Descriptor ownership is cleared before each
single close attempt; a throwing close is never retried by numeric FD.

The scoring core is loaded lazily after argument/root validation. Its original
source/dataset reads, closure rechecks and bounded-input limitations remain in
force. A core import or scoring refusal produces a fixed error code, without an
exception stack or raw body.

## Creating an artifact

Score computes the complete artifact and bounded summary before opening the
output directory or creating the output. The parent must be an existing
canonical directory owned by the current Unix user with permissions `0700`.
The adapter opens and admits its directory descriptor first and rechecks its
identity, ownership and permissions throughout finalization.

Only the explicit requested output may be created. `O_EXCL | O_NOFOLLOW` refuses
an existing file, symlink or special entry. A successful new file is regular,
owned, singly linked and `0600`; a restrictive umask that removes those owner
permissions causes a refusal rather than a permission rewrite.

The adapter writes the **exact returned `artifact_bytes`**, within the inherited
1 MiB cap, through a positive short-write loop. Success requires file `fsync`,
full same-FD byte readback and stable metadata, one successful file close, parent
directory `fsync`, one successful directory close, and matching final named
entries. File times are rechecked after readback and directory finalization.

Any uncertain creation, write, flush, readback, close or path guard produces a
failure without a success summary. A created empty, partial or complete file is
retained for explicit review. The CLI never unlinks, overwrites, replaces,
changes permissions, retries a command, creates a temporary artifact or transfers
a lock. Review a retained file before choosing a different explicit output path;
the adapter does not guess whether an interrupted write reached durable storage.

These checks assume a trusted local caller and filesystem. They check observed
descriptor/entry identity and returned durability operations; they do not provide
hostile-process isolation, hard syscall preemption or a power-loss experiment.

Replay opens only the five supplied files for reading. It recomputes the full
artifact through the unchanged core, including input/source/dataset bindings,
all 15 rows, selected final attempts, scores and the complete measurement
companion. Rehashing an edited row or companion cannot make it replay correctly.

## Output and interpretation

Exit zero has one compact JSON summary of at most 4 KiB. It identifies `score`
or `replay`, `selected_items: 15`, purpose/arm, the core's `artifact_sha256`,
the SHA-256 of the exact saved bytes as `artifact_file_sha256`, and their byte
count. It reports `model_baseline: false` and `execution_authorized: false`.
The core digest and the saved-file digest have different preimages; both are
explicitly named.

A refusal has exit one, no success stdout, and at most 1 KiB of stderr containing
a stable `CLI_*` code. Paths, prompts, answers, supplied bodies and stacks are not
echoed. Standard-output failure also prevents an exit-zero acknowledgment.

All 15 selected items remain in the core's denominator. Only its audited final
complete successful attempt can be scored; earlier or best-looking responses do
not replace that choice. Unknown usage, latency, prices and billing remain null,
with existing partial coverage and known subtotals preserved. The command does
not infer source completeness, expert gold, model performance or human labels.
The artifact binds its historical scoring closure. The CLI wrapper has separate
signed source/test/review pins and is not inserted into that older schema.

This is a private repository utility under Unreleased. Software-fixture evidence
does not establish provider authenticity, observed billing, research novelty,
actual search indexing, adoption or qualified financial strategy outcomes.

## Validation boundary

`npm run test:attempt-scoring-cli` selects the new test file. Its cases also occur
once in the root verify list, immediately after `attempt-scoring.test.mjs`.
Existing commands, the 30 inherited bridge cases and the incoming guard cases
retain their original registration and source bytes.

The new tests use owned finite fixtures and actual Node CLI children with bounded
timers, a returned terminal and absence checks for their own completed PIDs.
Test-only preloads first load the core, then bind native FS faults to captured
target descriptors. They prove positive admission/read/write/flush controls,
retain uncertain outputs for assertions, and prove unrelated reused FDs stay
open. Separately armed network/subprocess denial and read-only replay write
denial distinguish an exercised refusal control from an uncalled mock. Test
harness cleanup occurs only after assertions on its own temporary fixtures.

Written tests are not execution evidence. For this assignment, the first new
project runtime is the existing automatic remote CI after signed CLEAN freeze;
no local project import, CLI, test or build is authorized by writing this guide.
Exact source, retained CI, independent peers, any future archive allocation,
ordinary merge and actual custody remain separate gates. PRIMARY alone merges
and publishes; Lead allocates finite local runtime. All owner goals remain active.
