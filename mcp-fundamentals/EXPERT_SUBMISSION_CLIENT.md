# Supplied-file expert SDK audit client

`canli-expert-submission-client` is a repository **Unreleased** package candidate.
Its version field does not establish npm publication or installation. It is an
opt-in convenience for the unchanged local `filingfacts_audit_expert_submissions`
endpoint; the direct `canli-expert-submission-files` command remains available.

The client captures your six explicit files and optional ordered evidence and
submission files, initializes ONE owned local stdio child using locked SDK2.1
legacy negotiation, and makes ONE audit call with the exact tool definition.
It performs no discovery, network fetch, provider call or hidden retry. The
complete report, raw bindings, full selected-N, notes and missing-work lists are
saved; no compact projection replaces them. Every human, expertise, independence,
rights, label and adjudication outcome remains unknown/null. Source declarations
and diagnostic behavior fingerprints do not authenticate executing code.

## Six complete synthetic inputs

Create a new caller-owned private directory, mode0700. Use its absolute canonical
real path for every input and the unused report path. Save each marked JSON block
below as the indicated UTF8 file with ONE final LF; those same exact bytes are
used by the future guide command fixture. All names and URLs below are software
fixtures. No reviewer submissions or opaque evidence files are supplied.

### `gold.json`

<!-- EXPERT_CLIENT_GOLD_BEGIN -->
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
<!-- EXPERT_CLIENT_GOLD_END -->

### `intake.json`

<!-- EXPERT_CLIENT_INTAKE_BEGIN -->
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
<!-- EXPERT_CLIENT_INTAKE_END -->

### `evidence-inventory.json`

<!-- EXPERT_CLIENT_EVIDENCE_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-evidence.v1",
  "evidence": []
}
```
<!-- EXPERT_CLIENT_EVIDENCE_INVENTORY_END -->

### `intake-settings.json`

<!-- EXPERT_CLIENT_INTAKE_SETTINGS_BEGIN -->
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
<!-- EXPERT_CLIENT_INTAKE_SETTINGS_END -->

### `submission-inventory.json`

<!-- EXPERT_CLIENT_SUBMISSION_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-submission-inventory.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "submissions": []
}
```
<!-- EXPERT_CLIENT_SUBMISSION_INVENTORY_END -->

### `audit-settings.json`

<!-- EXPERT_CLIENT_AUDIT_SETTINGS_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-submission-settings.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "implementation_source_sha256": null
}
```
<!-- EXPERT_CLIENT_AUDIT_SETTINGS_END -->

## Explicit command

With those six files in your private `$INPUT_DIR`, use the admitted package bin:

```sh
canli-expert-submission-client --gold "$INPUT_DIR/gold.json" --expected-gold-sha256 b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb --intake "$INPUT_DIR/intake.json" --evidence-inventory "$INPUT_DIR/evidence-inventory.json" --intake-settings "$INPUT_DIR/intake-settings.json" --submission-inventory "$INPUT_DIR/submission-inventory.json" --audit-settings "$INPUT_DIR/audit-settings.json" --out "$INPUT_DIR/private-report.json"
```

The SHA is a separate primitive lowercase64-character pin of the marked original
gold bytes including LF. Add zero to64 ordered `--evidence` paths and zero to2
ordered `--submission` paths only when their inventories bind those exact files.
There is no caller-selected package root/server/transport/provider. An absolute
owned bin symlink resolves to the same package entry. Do not pass private input
bytes or secrets in command flags or terminal messages.

A successful terminal is one small JSON status with `status:"saved"`, finite
counts, output SHA/bytes and owned-child lifecycle. The full report is ONLY in
the private0600 output file. This synthetic batch has selected_n3, two absent
reviewer submissions and all6 item assignments missing; it establishes no
human review. Every original report field remains in the saved JSON plus LF.

## Bounds and refusal

The client admits all<=72 owner-regular FD identities and sizes BEFORE payload
reads/base64/SDK child entry. Exact caps are gold512KiB/intake64KiB/inventory32KiB,
evidence32KiB each and256KiB total, intake settings4KiB/intake group768KiB,
submission inventory16KiB/submissions2MiB each/audit settings4KiB, total4MiB.
SameFD reads, one overflow-byte observation, whole-batch stability and once-only
close protect the captured raw bindings. Noncanonical/symlink paths, aliases,
malformed UTF8/duplicate JSON keys, mismatched pins and uncertain closes refuse.

Request inclLF6MiB/full report6MiB/complete escaped duplicated tool result19MiB/
whole response inclLF20MiB are actual encoded-byte bounds. The complete report
is validated against captured bindings, immutable rows, full denominators and
NULL/source-declaration policies; rehashing an altered companion is insufficient.
The same absolute clock starts before file admission: observed work15s, then
one5s closure/output/terminal reserve, observed total20s. Fresh observation follows
actual serialization/UTF8 admission immediately before the captured native writer.
Synchronous filesystem or serialization work has no hard preemption guarantee.
The protected direct-file CLI has no SDK child or this workflow deadline.

An unused output under a private owned parent is created exclusively0600, bounded,
fsynced, read back on the same FD, checked against its path, closed once and its
parent flushed. A partial or uncertain file is retained; no unlink/overwrite or
retry conceals a failure. Success also requires known exit/absence of the SAME
owned child after one memoized close; close-Promise resolution alone is insufficient.
A tiny stable refusal echoes no raw input, path, SDK exception, stderr or stack.

## Verification scope

This guide and32..40 finite cases are WRITTEN_UNRUN until this exact signed source
runs in existing automatic remoteCI. Future artifact evidence must distinguish
RAW_CAPTURED_NOT_ADMITTED from ADMITTED with the same gzip SHA and exact20 bodies/
sixbins/12JS-MJS import closure. An owned extracted default-command mode fixture
and links to locked external dependency caches are disclosed; they are not an
npm installation, publication, hostile-runtime guarantee or developer-adoption
measurement. No local runtime or human/expert/rights admission is implied.
