# Supplied-file expert intake preparation

`canli-expert-intake-files` is an opt-in repository **Unreleased** command.
The package version `0.5.0` does not establish publication or installation of this
command. An admitted local tarball contains its complete package-local source
closure. Node >=20.10 is required; this command starts no SDK child, network
request, provider, source fetch or review dispatch.

The command calls the unchanged `prepareExpertIntake` once. Its complete
`canli.filing-facts-expert-preparation.v1` report prepares two blank reviewer
packets with the same immutable item content and a separate adjudicator worklist.
Role handles remain supplied declarations. The report establishes no real humans,
expertise, independence, source rights, labels, recruitment or admission.

## Four complete synthetic inputs

Use a new owned private directory with mode `0700`; resolve its absolute real
path. Save each marked JSON block as the named UTF-8 file with **one final LF**.
Paths must be absolute and normalized, with canonical parents and no input
symlinks or hardlinks. These three items, identities and example.invalid URLs are
software fixtures. No evidence or returned reviewer submissions are required.
The marked workflow is WRITTEN_UNRUN until this exact source's existing remote CI
executes its bounded direct-command fixture.

### `gold.json`

<!-- EXPERT_INTAKE_FILES_GOLD_BEGIN -->
```json
{
  "schema": "canli.filing-facts-gold-packet.v0",
  "guidelines": "scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md",
  "judgements": {
    "question_clear": [
      "yes",
      "no"
    ],
    "answer_matches_filing": [
      "yes",
      "no",
      "cannot_find"
    ],
    "citation_correct": [
      "yes",
      "no"
    ]
  },
  "annotator": "",
  "labels": [
    {
      "id": "software-fixture-0",
      "template": "lookup",
      "company": "SYNTHETIC SOFTWARE FIXTURE",
      "question": "Synthetic question 0?",
      "answer": "0 fictional units",
      "filings": [
        "https://example.invalid/software-fixture/0"
      ],
      "question_clear": "",
      "answer_matches_filing": "",
      "citation_correct": "",
      "notes": ""
    },
    {
      "id": "software-fixture-1",
      "template": "lookup",
      "company": "SYNTHETIC SOFTWARE FIXTURE",
      "question": "Synthetic question 1?",
      "answer": "1 fictional units",
      "filings": [
        "https://example.invalid/software-fixture/1"
      ],
      "question_clear": "",
      "answer_matches_filing": "",
      "citation_correct": "",
      "notes": ""
    },
    {
      "id": "software-fixture-2",
      "template": "lookup",
      "company": "SYNTHETIC SOFTWARE FIXTURE",
      "question": "Synthetic question 2?",
      "answer": "2 fictional units",
      "filings": [
        "https://example.invalid/software-fixture/2"
      ],
      "question_clear": "",
      "answer_matches_filing": "",
      "citation_correct": "",
      "notes": ""
    }
  ]
}
```
<!-- EXPERT_INTAKE_FILES_GOLD_END -->

### `intake.json`

<!-- EXPERT_INTAKE_FILES_INTAKE_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-intake.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "roles": [
    {
      "role": "reviewer_a",
      "handle": "synthetic-reviewer_a",
      "aliases": [],
      "affiliations": null,
      "conflicts": null,
      "identity_evidence_ids": [],
      "independence_evidence_ids": [],
      "qualifications": []
    },
    {
      "role": "reviewer_b",
      "handle": "synthetic-reviewer_b",
      "aliases": [],
      "affiliations": null,
      "conflicts": null,
      "identity_evidence_ids": [],
      "independence_evidence_ids": [],
      "qualifications": []
    },
    {
      "role": "adjudicator",
      "handle": "synthetic-adjudicator",
      "aliases": [],
      "affiliations": null,
      "conflicts": null,
      "identity_evidence_ids": [],
      "independence_evidence_ids": [],
      "qualifications": []
    }
  ],
  "sources": []
}
```
<!-- EXPERT_INTAKE_FILES_INTAKE_END -->

### `evidence-inventory.json`

<!-- EXPERT_INTAKE_FILES_EVIDENCE_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-evidence.v1",
  "evidence": []
}
```
<!-- EXPERT_INTAKE_FILES_EVIDENCE_INVENTORY_END -->

### `intake-settings.json`

<!-- EXPERT_INTAKE_FILES_INTAKE_SETTINGS_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-settings.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "prepared_on": "2026-10-05",
  "required_uses": [
    "human_review"
  ],
  "implementation_source_sha256": null
}
```
<!-- EXPERT_INTAKE_FILES_INTAKE_SETTINGS_END -->

The expected **raw** SHA256 of `gold.json`, including the single final LF, is
`b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb`. The separate `b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264`
packet-content pin describes the immutable content convention; the unchanged
kernel verifies it from the supplied packet. These are distinct bindings.

Replace `/absolute/private-intake` below with that existing directory's resolved
absolute path. The output path must be unused. Invoke the command from an admitted
package/bin fixture, or from the actual installed package when it is available:

```sh
canli-expert-intake-files \
  --gold /absolute/private-intake/gold.json \
  --expected-gold-sha256 b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb \
  --intake /absolute/private-intake/intake.json \
  --evidence-inventory /absolute/private-intake/evidence-inventory.json \
  --intake-settings /absolute/private-intake/intake-settings.json \
  --out /absolute/private-intake/preparation.json
```

For a repository checkout, the focused run script passes those same flags to the
same module: `npm run filingfacts:expert-intake-files -- <flags>`. Ordinary imports
perform no preparation. The direct command and an owned absolute executable alias
use real-file entry identity. There is no implicit current-directory inventory,
stdin input, root/server override, network source or returned-submission input.

## Admission and private artifact

Each scalar flag occurs once; `--evidence` may repeat zero to64 times in inventory
order, each with an explicit absolute regular-file path. Expected raw SHA is a
primitive lowercase64 hex value. All input descriptors pass ownership, type,
identity, individual/group and whole-input metadata admission before any payload
allocation or read, dynamic kernel load or call. The bounds are:

| Input | Maximum raw bytes |
| --- | ---: |
| Gold | 524288 |
| Intake | 65536 |
| Evidence inventory | 32768 |
| Intake settings | 4096 |
| Each evidence file | 32768 |
| Evidence group | 262144 |
| All inputs together | 786432 |

There are at most68 input descriptors. Individually legal maxima total888832
bytes, so the aggregate cap independently restricts combinations. Bounded reads,
one overflow byte, same-FD and final whole-batch path observations bind exactly
the captured buffers. Evidence remains opaque; an inventory match authenticates
neither the document nor its rights.

The complete public report is written as JSON plus one LF, at most2097153 bytes
(JSON alone at most2097152). Output creation uses `O_EXCL`, no-follow and mode
`0600` in an existing owned parent with no group/world access. The command checks
positive short-write progress, file fsync, same-FD exact readback, output/path and
private parent identity, then directory fsync and known one-close completion.
Numeric FD ownership is relinquished before each sole close attempt. Any uncertain
write, flush, readback, replacement or close refuses and **retains the partial
artifact**. It never overwrites, unlinks, reopens or retries ambiguous effects.
Inspect and retain such an artifact privately; a refusal is not a saved success.

A success emits only bounded JSON with `status`, complete report byte SHA/size,
`selected_n`, `declared_role_count` and `syntactic_only`. A refusal emits a stable
small code to stderr; it does not echo paths, payloads or raw native errors. The
artifact's selected-N includes every supplied gold item even when all roles or
source-rights evidence are missing. Established human, expertise, independence,
rights, labels and admission counts remain NULL. Caller module source SHA remains
explicitly declared and unverified; behavior fingerprint is diagnostic.

This direct CLI has **no whole-command deadline or SDK15/5/20 clock claim**.
Its terminal delivery retries only the same bounded frame on native backpressure;
it does not repeat file or core effects. Remote fixtures separately bound process
time, terminal output and known owned cleanup. Raw package capture precedes strict
member/mode/source admission; dependency cache links and actual npm installation
are unnecessary for this direct package-local preparation command.
