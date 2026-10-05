# Prepare expert-intake packets from supplied files

This opt-in file client is repository-only and Unreleased. It calls the local `filingfacts_prepare_expert_intake` MCP endpoint through the locked SDK, once, using files you supply. Use it with the candidate package artifact containing `canli-expert-intake-client`; publication and installed-release availability are separate. It uses no network collector or provider.

Save the four marked JSON inputs below as `gold.json`, `intake.json`, `inventory.json`, and `settings.json`. Preserve each final LF. They are fictional software fixtures, with example.invalid sources and no authenticated person, expertise, independence or rights. The complete selected N is 3. Missing declarations never reduce N. The original gold file SHA256 is `b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb`.

Create a private canonical directory and supply absolute canonical paths. The output path must be unused; the client refuses existing output, symbolic links, hardlinks and ambiguous paths.

```sh
umask 077
task_dir=$(mktemp -d "${TMPDIR:-/tmp}/canli-intake.XXXXXX")
task_dir=$(cd "$task_dir" && pwd -P)
# Save the four marked JSON inputs into this directory before running.
canli-expert-intake-client \
  --gold "$task_dir/gold.json" \
  --expected-gold-sha256 b958f12debf58d64818286f536b240c5daf20dac244950a2ad294e54fa33acfb \
  --intake "$task_dir/intake.json" \
  --evidence-inventory "$task_dir/inventory.json" \
  --intake-settings "$task_dir/settings.json" \
  --out "$task_dir/prepared.json"
```

Repeat `--evidence /absolute/owned/file` for up to 64 opaque evidence files in inventory order. Their raw bytes and hashes stay bound; they do not authenticate a document or establish source-use rights. There is no root, server, network endpoint or provider override.

All input FDs are admitted before payload reads or base64 copies: at most 68 owned regular files, 512KiB gold, 64KiB intake, 32KiB inventory, 4KiB settings, 32KiB per evidence file, 256KiB combined evidence and 768KiB combined input. Fatal UTF8 and duplicate JSON keys refuse structured inputs. Private output is created with 0600/O_EXCL only after the original complete response is validated and the known owned child has closed. Full output is at most 2MiB JSON plus one LF; flush, exact readback, stable paths and directory durability are required. Uncertainty retains partial output and returns refusal; it does not unlink or retry.

The client computes exactly one reference with the unchanged intake core from the same captured bytes before SDK startup. It compares every returned field to that reference. It persists the original returned report, never a reference fallback. Complete reviewer packets remain blank and cover the same gold. The adjudicator worklist is distinct and has no decisions. Qualification, conflict, source-rights, evidence and missing-role worklists remain complete. Real human, expertise, independence, rights, labels, agreement and admission outcomes remain null. Source declarations remain unverified.

One shared observed clock covers file capture, reference, imports, SDK startup, one call and response validation: 15 seconds of work plus 5 seconds for known closure, output and the final terminal, 20 seconds total. Serialization and actual UTF8 frame admission precede the last clock observation immediately before the captured native write. These are observed boundaries, not hard preemption, global idleness or a deadline claim about the separate direct file CLI. The locked SDK explicitly uses legacy negotiation and the exact tool definition in the second call options, with no discovery or hidden retry.

Successful stdout is a small no-echo hash/N/known-child summary. Refusal uses bounded stderr without input, paths or SDK exception text. Read the complete saved report for mechanical preparation results.

## Exact synthetic inputs

<!-- EXPERT_INTAKE_CLIENT_GOLD_BEGIN -->
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
<!-- EXPERT_INTAKE_CLIENT_GOLD_END -->

<!-- EXPERT_INTAKE_CLIENT_INTAKE_BEGIN -->
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
<!-- EXPERT_INTAKE_CLIENT_INTAKE_END -->

<!-- EXPERT_INTAKE_CLIENT_EVIDENCE_INVENTORY_BEGIN -->
```json
{
  "schema": "canli.filing-facts-expert-evidence.v1",
  "evidence": []
}
```
<!-- EXPERT_INTAKE_CLIENT_EVIDENCE_INVENTORY_END -->

<!-- EXPERT_INTAKE_CLIENT_INTAKE_SETTINGS_BEGIN -->
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
<!-- EXPERT_INTAKE_CLIENT_INTAKE_SETTINGS_END -->

The marked workflow is WRITTEN_UNRUN until the signed candidate runs in existing automatic remote CI. Its one guide entry is shared with entry1 of the new package test; the absolute alias and bounded server-refusal controls are the only other two new command/SDK-child entry sites. The fixture uses one guarded offline pack and locked read-only dependency-cache links, which are not an npm-install or publication claim.
