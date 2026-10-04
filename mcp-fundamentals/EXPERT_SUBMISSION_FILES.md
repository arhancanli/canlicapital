# Expert-submission files in a package

`canli-expert-submission-files` is a repository **Unreleased** candidate command.
The current `0.5.0` version field does not establish that this command is published
or available from npm. The reviewed local tarball includes the command and this
guide. It needs Node >=20.10 and the admitted package-local modules; it starts no
SDK server, child process, discovery call, network request or provider.

The command calls the unchanged supplied-byte expert reconciler once. It reports
syntactic consistency, missing roles and per-item worklists. It cannot establish
real humans, expertise, independence, rights, verified labels or adjudication.
Caller source declarations remain unverified.

## Complete synthetic inputs

Make a new private directory with mode `0700`. Resolve its absolute real path;
input paths must be normalized and cannot traverse symlink parents. Save each
JSON block below as the indicated UTF-8 file with **one final LF**. No reviewer
files or evidence files are supplied in this example. All people, questions and
URLs are software fixtures. These six marked blocks are the complete input
workflow used by the bounded direct-command regression; they are written until
that exact source's remote CI runs.

### `gold.json`

<!-- EXPERT_FILES_GOLD_BEGIN -->
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
<!-- EXPERT_FILES_GOLD_END -->

### `intake.json`

<!-- EXPERT_FILES_INTAKE_BEGIN -->
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
<!-- EXPERT_FILES_INTAKE_END -->

### `evidence-inventory.json`

<!-- EXPERT_FILES_EVIDENCE_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-evidence.v1",
  "evidence": []
}
```
<!-- EXPERT_FILES_EVIDENCE_INVENTORY_END -->

### `intake-settings.json`

<!-- EXPERT_FILES_INTAKE_SETTINGS_BEGIN -->
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
<!-- EXPERT_FILES_INTAKE_SETTINGS_END -->

### `submission-inventory.json`

<!-- EXPERT_FILES_SUBMISSION_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-submission-inventory.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "submissions": []
}
```
<!-- EXPERT_FILES_SUBMISSION_INVENTORY_END -->

### `audit-settings.json`

<!-- EXPERT_FILES_AUDIT_SETTINGS_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-submission-settings.v1",
  "packet_sha256": "b9124d3f8f55952bf6aeec8db7c58c82aa67514dbc044833c0c762e235e29264",
  "implementation_source_sha256": null
}
```
<!-- EXPERT_FILES_AUDIT_SETTINGS_END -->

## Run once against an unused private output

Set `DIR` to the absolute real path of your private directory. The separate raw
gold SHA is `b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb` for the exact marked gold bytes including their final LF.
Compute and compare it on your files, for example with `sha256sum "$DIR/gold.json"`
or `shasum -a 256 "$DIR/gold.json"`; it is distinct from the packet-content hash.

<!-- EXPERT_FILES_COMMAND_BEGIN -->
```sh
canli-expert-submission-files \
  --gold "$DIR/gold.json" \
  --expected-gold-sha256 b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb \
  --intake "$DIR/intake.json" \
  --evidence-inventory "$DIR/evidence-inventory.json" \
  --intake-settings "$DIR/intake-settings.json" \
  --submission-inventory "$DIR/submission-inventory.json" \
  --audit-settings "$DIR/audit-settings.json" \
  --out "$DIR/report.json"
```
<!-- EXPERT_FILES_COMMAND_END -->

Repeated `--evidence` files follow inventory order (0..64), and repeated
`--submission` files follow submission inventory order (0..2). Every supplied
file needs an individually admitted owned regular FD before any payload read:
72 files maximum, 4 MiB total, evidence group 256 KiB, intake prefix 768 KiB.
Individual limits are gold 512 KiB, intake 64 KiB, evidence inventory 32 KiB,
intake settings 4 KiB, evidence 32 KiB, submission inventory 16 KiB, audit
settings 4 KiB and each submission 2 MiB. Input symlinks, aliases, empty files,
nonregular files, ownership uncertainty and changed files refuse.

The full unchanged API report, including raw bindings and notes, is saved as
JSON plus LF, capped at 6 MiB plus that LF. For this example selected N stays
**3**, required reviewer-item assignments stay **6**, both reviewer submissions
are missing, and authenticated human/expertise/independence/rights/verified
labels/adjudication remain unknown/null. No missing denominator is zero-filled.
Only a small non-echoing saved status, output SHA, byte count and denominator are
printed; refusal emits a bounded stable code without supplied paths or content.

The output is `0600` with exclusive creation in the existing private parent.
Successful completion requires file fsync, byte-exact readback, known single FD
closure, directory fsync and final identity observations. An uncertain or partial
output is retained, never overwritten, unlinked or automatically retried. Use a
new unused output name for a deliberate later attempt. The native direct command
has no whole-command deadline or hard preemption. Its test child has explicit
bounded process and cleanup controls; SDK-client 15/5/20 clocks are not this CLI's
contract. This workflow is not npm installation, publication, hostile-environment
proof or authenticated expert review.
