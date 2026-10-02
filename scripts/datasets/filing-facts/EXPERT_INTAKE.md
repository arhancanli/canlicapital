# Prepare independent FilingFacts expert review

`prepareExpertIntake` prepares two blank review packets and verification worklists
from an explicitly supplied immutable gold packet. It preserves every question,
stated answer, template, company and filing reference. A coordinator can see which
review roles, qualification documents and source-use declarations are missing
before arranging real review.

This private, Unreleased utility makes mechanical byte, identity-alias and scope
checks. It does not authenticate people, establish expertise or independence,
clear rights, admit review or release, generate judgements, recruit reviewers or
dispatch packets. All corresponding verified counts and admission results remain
`null`. Existing MCP defaults, tools, versions, dataset files, browser workflows
and agreement/adjudication interfaces are unchanged.

## Explicit input contract

```js
prepareExpertIntake(
  goldBytes, expectedGoldRawSha256, intakeBytes, inventoryBytes,
  evidenceBuffers, settingsBytes,
)
```

The four JSON byte inputs and every evidence file must be native `Buffer` or
`Uint8Array` values with ordinary native prototypes and nonshared backing memory.
The evidence argument is an ordinary dense array of native byte buffers, in the
same order as inventory rows. Proxies, subclasses, shared buffers, sparse arrays,
accessors on array entries and unexpected array properties are refused. Native
byte slots are copied without consulting caller-owned byte getters. Input
objects, callbacks, coercive hashes and implicit filesystem paths are unsupported.
The implementation assumes trusted Node intrinsics and native SHA-256/UTF-8/URL
behavior; it is not a sandbox against a modified runtime.

All bytes are copied before any decoding, schema extraction or binding. Evidence
hashes, length checks and returned base64 bindings use those same owned copies.
The utility never reads a document from a path or interprets evidence contents.
Its report retains the exact raw JSON and opaque evidence bytes as base64, so a
coordinator can reproduce the mechanical checks. Use synthetic documents for
repository examples and tests; keep real private credential material and reports
under the coordinator's separately authorized handling process.

`expectedGoldRawSha256` is a separately supplied lowercase 64-character SHA-256 of
the raw gold bytes. Settings and intake also carry the expected canonical packet
SHA. Obtain both expected pins from the independently identified gold artifact;
recomputing an advertised expected hash from an untrusted replacement does not
authenticate it. Matching hashes establish byte/content consistency, not source
truth, author identity, rights or expert labels.

The existing `packetContent` helper hashes the immutable packet schema and
ID-sorted `id/template/company/question/answer/filings`. Raw SHA additionally binds
the original item order, guidelines, judgement vocabulary and blank fields.
The current delivered gold packet has 50 blank rows, raw SHA
`91c6f960e34509653800a4cda81bd0632dd58c889ee78eb6461a985765500413`
and canonical SHA
`15c595ed8109dd324dffeddd104d2f72154ef3710b9d64a0fb7eac7ddc95b7ee`.
The utility consumes a pinned packet; it does not generate or sample a new gold
set. It refuses completed judgements, nonempty notes/annotator, duplicate item
IDs, altered vocabulary, unknown gold fields and contradictory packet pins.

## Executable synthetic import example

This example contains software fixtures only. Its declared credential and document
are not real qualifications or rights evidence. The guide's marked example is
imported and checked by the registered test suite on existing remote CI.

<!-- executable-example:start -->
```js
import { createHash } from 'node:crypto';
import { packetContent } from '../../../js/filing-facts-packet.js';
import { prepareExpertIntake } from './expert-intake.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
const gold = {
  schema: 'canli.filing-facts-gold-packet.v0',
  guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
  judgements: {
    question_clear: ['yes', 'no'],
    answer_matches_filing: ['yes', 'no', 'cannot_find'],
    citation_correct: ['yes', 'no'],
  },
  annotator: '',
  labels: [{
    id: 'synthetic-example', template: 'lookup', company: 'Synthetic fixture',
    question: 'What is the supplied synthetic total?', answer: '10 USD',
    filings: ['https://example.invalid/synthetic-filing/'],
    question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '',
  }],
};
const rawGold = json(gold);
const packetSha = sha(packetContent(gold));
const document = Buffer.from('SYNTHETIC SOFTWARE FIXTURE; not a credential');
const intake = {
  schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packetSha,
  roles: [{
    role: 'reviewer_a', handle: 'synthetic-reviewer-a', aliases: [],
    affiliations: null, conflicts: null,
    identity_evidence_ids: [], independence_evidence_ids: [],
    qualifications: [{
      id: 'synthetic-phd', kind: 'phd', title: 'Synthetic declared PhD',
      task_relevance: 'Synthetic financial-statement review',
      evidence_ids: ['synthetic-document'], verification: null,
    }],
  }],
  sources: [],
};
const inventory = {
  schema: 'canli.filing-facts-expert-evidence.v1',
  evidence: [{
    id: 'synthetic-document', packet_sha256: packetSha, purpose: 'qualification',
    subject: { role: 'reviewer_a', handle: 'synthetic-reviewer-a', qualification_id: 'synthetic-phd' },
    expected_sha256: sha(document), expected_bytes: document.length,
  }],
};
const settings = {
  schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packetSha,
  required_uses: ['human_review'], prepared_on: '2026-10-02',
  implementation_source_sha256: null,
};
export const exampleReport = prepareExpertIntake(
  rawGold, sha(rawGold), json(intake), json(inventory), [document], json(settings),
);
// selected_n = 1; prepared_item_assignments = 2.
// Missing reviewer_b, adjudicator and source-rights declarations remain visible.
// Judgements/notes remain ''; verified_experts_n and verified_source_rights_n are null.
```
<!-- executable-example:end -->

## Declaration schema

Every object has closed fields. Intake requires `schema`, `packet_sha256`,
`roles` and `sources`. Empty role/source arrays represent missing declarations;
they never remove selected gold items or cited sources from coverage.

Each role requires exactly:

| Field | Accepted declaration |
| --- | --- |
| `role` | `reviewer_a`, `reviewer_b` or `adjudicator`; each at most once |
| `handle` | Nonempty string stable handle, at most 128 UTF-16 units |
| `aliases` | Explicit string aliases; no inferred names, emails or affiliations |
| `affiliations` | `null` for unknown, or a bounded array of declared affiliation strings |
| `conflicts` | `null` for unknown, or records with `id`, `description`, `evidence_ids` |
| `identity_evidence_ids` | Inventory IDs for that exact role and handle |
| `independence_evidence_ids` | Inventory IDs for that exact role and handle |
| `qualifications` | Bounded qualification declarations, including an empty array when none are supplied |

Qualification fields are `id`, `kind`, `title`, `task_relevance`, `evidence_ids`
and `verification`. Kind is `phd`, `cfa`, `engineering` or `other`. Task relevance
may be `null`; a title alone never establishes relevant expertise. Verification
is `null` or an exact `who`, `date`, `method`, `evidence_ids` declaration. Dates
must be valid `YYYY-MM-DD` values from 1900 onward. These are caller claims whose
provenance still needs checking; no `verified` boolean or expert flag is accepted.

Handles and aliases use the delivered agreement convention:
`trim().normalize('NFKC').toLowerCase()`. Any overlap, including an adjudicator
alias matching a reviewer, is refused. This detects only supplied text aliases.
Different strings do not prove different real people or independence; undisclosed
aliases remain unknown. Shared employer information is retained without inferring
dependence or independence. Affiliation and conflict declarations need independent
assessment.

For each exact distinct cited URL, the source ID is lowercase SHA-256 of its UTF-8
bytes. Exact source references are kept distinct; the utility does not merge URL
aliases or discover missing filings. A source declaration requires `source_id`,
the exact `url`, and `claims`. URLs must be HTTPS without user credentials,
fragments or whitespace; they are parsed without network access. A declaration
for an uncited source or a substituted ID/URL is refused.

Every rights claim requires `id`, `declaration_text`, `allowed_uses`, `denied_uses`,
`evidence_ids`, `verification`. Declaration text may be `null`. Use arrays may be
`null` for unknown or explicit arrays drawn from `human_review`, `evaluation`,
`training`, `redistribution`. Scope is mechanical only: required uses omitted
from allowed declarations remain uncovered; denied uses remain restricted;
allow/deny overlap across claims is exposed as contradictory. A restriction on
training alongside permission for human review is not itself a contradiction.
Missing evidence and unknown scopes are reported for every source, including
sources absent from intake. Public SEC origin, a URL or the V0 dataset-card
licence is not independent clearance of source material or future training and
redistribution uses. The utility does not interpret a document or change licences.

## Evidence inventory and bindings

Inventory requires `schema: canli.filing-facts-expert-evidence.v1` and an `evidence`
array. Each row has `id`, `packet_sha256`, `purpose`, `subject`,
`expected_sha256`, `expected_bytes`. Hashes are lowercase SHA-256; expected byte
counts are positive safe integers. IDs are nonempty ASCII strings of at most 128
units matching `[A-Za-z0-9][A-Za-z0-9_.:-]*` and may not repeat. Inventory order
corresponds exactly to the native buffers array; different bytes, reordered
attachments, advertised length mismatches or cardinality mismatches are refused.

| Purpose | Exact subject fields |
| --- | --- |
| `identity`, `independence` | `role`, `handle` |
| `qualification` | `role`, `handle`, `qualification_id` |
| `conflict` | `role`, `handle`, `conflict_id` |
| `source_rights` | `source_id`, `url` |

Role, qualification and conflict subjects must already be declared; source
subjects must name an exact packet source. A provided record for a different
reviewer/source/packet or purpose cannot satisfy an evidence reference. A declared
ID absent from inventory remains explicit missing work, without an invented hash
or zero verification result. Correctly bound but unreferenced evidence remains
retained and marked unreferenced. Opaque bytes may be binary; evidence authenticity,
who created it, what it proves and its permitted use all remain unverified.

Settings require `schema: canli.filing-facts-expert-settings.v1`, `packet_sha256`,
a nonempty `required_uses` array, `prepared_on` and
`implementation_source_sha256` (lowercase SHA-256 or `null`). The preparation date
is declared and unauthenticated. Whole-module SHA is also declared and explicitly
unverified because this pure core does not read its file. A behavior fingerprint
binds the loaded function sources, schemas, limits, role/use rules and known
dependency source pins; complete Git bytes and whole-module/dependency pins need
the separate signed source manifest and independent review. Function fingerprints
are not self-authentication of file bytes or a compromised runtime.

## Finite boundaries and report

| Boundary | Maximum |
| --- | --- |
| Gold / intake / inventory / settings raw bytes | 512 KiB / 64 KiB / 32 KiB / 4 KiB |
| One evidence file / all evidence bytes / all input bytes | 32 KiB / 256 KiB / 768 KiB |
| Gold items / exact distinct sources / filings per item | 128 / 128 / 16 |
| Role declarations / aliases per role | 3 / 8 |
| Qualifications / conflicts per role / claims per source | 8 / 16 / 8 |
| Inventory records / references per evidence list | 64 / 8 |
| JSON array entries / nesting depth / parsed nodes per input | 256 / 16 / 32,768 |
| Decoded JSON string / number token | 4,096 UTF-16 units / 128 characters |
| Complete JSON and canonical report bytes | 2 MiB each |

Individual text and identifier limits are stricter where noted in the schema.
No input/output overflow is truncated into a success. Malformed UTF-8, unpaired
Unicode, duplicate decoded JSON keys, unknown fields, invalid dates, negative
zero, nonfinite/unsafe/coercive numbers and decimal literals that would lose
precision are refused. Whitespace counts toward original-byte budgets. Output
Unicode escaping can exceed the canonical report cap even when raw inputs fit;
the entire report is then refused without returning partial packets or evidence.

The owned deterministic report contains raw bindings, two full blank review
packets, three role worklists, all cited-source worklists, exact evidence bindings,
an empty adjudication submission and a task for every item. Missing roles use
`declared_handle: null` and a blank packet annotator, with no invented person.
Coverage separates selected items, prepared assignments, declared roles/sources
and provided/missing/unreferenced evidence. Prepared completed-review pairs are
mechanically zero because all fields are blank; actual human/expert review and
verification counts are unknown (`null`).

`content_hash` is SHA-256 of the existing `canonicalJson` representation without
the `content_hash` member. The returned object is deeply frozen and survives
JSON serialization with the same canonical digest. Raw/canonical gold digests
and evidence byte hashes remain separate from this derived report hash.

## Coordinator's next real work

1. Identify and bind the intended immutable gold artifact independently. Resolve
   every missing reviewer/adjudicator declaration without dropping gold items.
2. Authenticate the consenting people, check supplied aliases and actual
   independence, verify task-relevant qualifications and assess conflicts using
   a separately authorized process. Hashes and self-declared checks are inputs
   to that process, not proof that it happened.
3. Resolve source-use rights for every cited source and each requested use, with
   authentic in-scope evidence and a recorded separate admission decision.
4. Arrange two independent reviews of the same packet under the existing
   annotation guidelines. Preserve full selected-N and actual submissions;
   blanks and software fixtures never count as human or expert labels.
5. Use canonical gold with the existing agreement/adjudication interfaces only
   after real complete submissions and distinct source-backed adjudication.
   Preserve missing/rejected items and qualification/rights verification records
   separately. Preparation alone never authorizes publication or a benchmark.

The focused command is `npm run test:expert-intake`; required `npm run verify`
also includes this test file. Implementation fixtures first run on existing
remote CI after a signed clean source freeze. Written fixture names are not
execution evidence. Independent source and exact-current-CI review remain
separate gates, and this phase does not finish any full owner outcome.


## Initial validation and preserved evidence, 2026-10-02T07:22:45.514919+00:00

Signed clean13927e84 passes all47distinct intake cases once in ROOT on existing
remoteNode22.23.3 CI: root6+1044+9, MCP141+1+15+68+139, all7checks. Tested
4fc3de54/tree0a5e equals139 with[eeb,139]parents; captured CodeQLref0/latest
JavaScript and Python0. Both independent initial source and retained-CI reviews
pass with their scope limits. These are software fixtures, including unchanged
public blank50-item gold compatibility, not human/expert/rights verification.

[Preserved initial evidence](../../../docs/goal/evidence/filingfacts-expert-intake-20261002/README.md)
retains32files under PRIMARY exactV2 allocation7b71d6a2: original source/products,
all8rawCI/API captures, all4peer reviews, original metadata-reader errors and
preview wording correction. Manifest SHA45d422ce59aa101c7b7a33af29972ea13e2580fa097d4bb44efa21a01d59ca57
binds original3103500B/stored929299B includingREADME+manifest, three lossless
gzip-mtime0 members and12explicit external nonmembers. Alternative proposals
remain retained separately; final-head/source/CI/delivery evidence stays external
to avoid selfreference. Core/tests/package remain byteexact139, guide/goals
append only; final signed-head/currentCI and both independent final extensions
still required. No local project runtime or provider/model/publication action.
All full owner objectives remain ACTIVE and actual verified outcomes unknown.
