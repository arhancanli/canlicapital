# Reconcile supplied FilingFacts expert returns

`reconcileExpertSubmissions` connects the unchanged expert-intake preparation to
full packets exported by the delivered browser `filledPacket` function. It checks
raw byte bindings, immutable packet consistency and syntactic judgement coverage.
This private, Unreleased utility does not authenticate a person or document,
verify expertise, independence or rights, admit data, create decisions or release
an expert dataset. Every established human/expert/rights/labels/admission outcome
remains `null`, including when two fictional complete returns agree.

## Explicit supplied-byte contract

```js
reconcileExpertSubmissions(
  goldBytes, expectedGoldRawSha256, intakeBytes, evidenceInventoryBytes,
  evidenceBuffers, intakeSettingsBytes,
  submissionInventoryBytes, submissionBuffers, auditSettingsBytes,
)
```

The first six inputs are exactly the existing
[expert-intake contract](EXPERT_INTAKE.md). The utility captures its own native
copies and recomputes `prepareExpertIntake` unchanged from them. It never accepts
an already prepared object as evidence. All old gold, intake, evidence, settings,
parser and preparation report limits remain enforced. The delivered blank50 gold
has raw SHA `91c6f960e34509653800a4cda81bd0632dd58c889ee78eb6461a985765500413`
and packet SHA `15c595ed8109dd324dffeddd104d2f72154ef3710b9d64a0fb7eac7ddc95b7ee`.

Every byte argument is a native nonshared `Buffer` or `Uint8Array` with its exact
native prototype. Evidence and submission containers are ordinary dense arrays;
proxies, subclasses, accessors on entries, sparse arrays and extra own properties
are refused without calling getters. Native byte-slot access bypasses shadowed
caller properties, as in intake. No paths, parsed caller objects, callbacks,
transports, credentials or SDK clients are accepted. Trusted Node intrinsics,
SHA-256 and UTF-8 are assumed; this is not a runtime or custody sandbox.

The submission inventory is a closed JSON object:

```json
{
  "schema": "canli.filing-facts-expert-submission-inventory.v1",
  "packet_sha256": "<independently identified canonical gold SHA>",
  "submissions": [
    {
      "role": "reviewer_a",
      "declared_handle": "<exact intake declaration>",
      "packet_sha256": "<same canonical gold SHA>",
      "expected_sha256": "<independently supplied raw return SHA>",
      "expected_bytes": 123
    }
  ]
}
```

Rows correspond exactly to the supplied native buffers in inventory order.
Only `reviewer_a` and `reviewer_b` are accepted, at most once each. An empty
inventory and array mean both files are absent. One role file may be supplied
without the other. A file requires that exact role's intake declaration. The
inventory handle must equal the original declared handle; the returned packet's
annotator must equal its trimmed handle, matching the delivered browser export.
Aliases never substitute for this binding. Existing intake handles/aliases use
NFKC, trim and case collision checks; different supplied strings do not establish
different people or actual independence.

Raw SHA is a lowercase64 SHA-256 and byte count is a positive safe integer.
Expected pins must be obtained from separately identified artifacts by the
coordinator. The example computes them for explicitly fictional bytes only.
Matching supplied pins do not authenticate an author, document, qualification,
source rights or a review. Hashing, parsing and returned base64 bindings always
use the same owned captured bytes. No evidence document is interpreted.

Audit settings require exactly `schema`, `packet_sha256` and
`implementation_source_sha256`. Schema is
`canli.filing-facts-expert-submission-settings.v1`; packet SHA must match gold.
Whole-module SHA is explicitly caller-declared lowercase64 or `null`, with
verification `false`. Function-source behavior fingerprints include unchanged
intake preparation and loaded agreement/canonical/packet functions. Known
whole-file dependency pins also remain explicitly unverified by this pure core;
the signed Git manifest and independent review bind complete source bytes.

## Accepted returns and retained denominator

A return must have the full delivered `filledPacket` shape: exact gold `schema`,
`guidelines`, `judgements`, `annotator`, `labels` and `packet_sha256`. Every row
requires `id`, `template`, `company`, `question`, `answer`, `filings`, all three
judgements and `notes`. Every selected gold ID must occur exactly once. Immutable
values and the exact judgement vocabulary must match. Unknown or missing fields,
changed/foreign/extra/duplicate rows, swapped roles, contradictory pins and
malformed bytes refuse the entire invocation with `ExpertSubmissionAuditError`.
Original intake refusal codes are retained with `INTAKE_` prefixes. No partial
success report, silent repair, resampling or denominator reduction is returned.

Immutable row ordering may differ, as supported by the ID-sorted packet digest.
The raw pin records that actual order and the returned packet retains it.
Judgements may be `''` or the exact existing choices. Notes must be a bounded
string. A `no` or `cannot_find` requires nonblank notes for complete-item
syntactic coverage, using unchanged `missingJudgements`. The compact comment
format and browser draft format are not full returned packets.

Reports distinguish absent files, present partial or blank exports and complete
syntactic exports. Each role and every pair retain full selected-N. Per-field
coverage exposes eligible and missing counts for each role and pair. The
unchanged `cohensKappa` function computes only eligible field pairs; it returns
`null` kappa for a constant identical category. The unchanged `agreement`
function is called only for two explicitly supplied compatible returns, using
canonical gold and its original complete-item/notes rule. Both results are
explicitly labelled syntactic and never verified expert agreement.

The existing preparation's empty `canli.filing-facts-adjudication.v1` submission
is retained. Every selected item gets a worklist row showing absent submissions,
missing fields or required notes, and every eligible differing field, including
partial items excluded from complete-item agreement. No adjudication decisions
or labels are generated. Authentication, consenting real reviewers, task-relevant
expertise, actual independence, source rights/completeness, admission, expert
agreement and expert adjudication all require separately authorized actual work.

## Finite boundaries and custody

| Additional boundary | Maximum |
| --- | --- |
| One raw submission | 2 MiB |
| Submission inventory / audit settings | 16 KiB / 4 KiB |
| Supplied submission files | 2 |
| Total original input bytes, including all old inputs and evidence | 4 MiB |
| Complete final JSON / canonical report / canonical JSON roundtrip | 6 MiB each |
| JSON depth / nodes / array rows / decoded string / numeric token | 16 / 32,768 / 256 / 4,096 UTF-16 units / 128 characters |

Whitespace counts toward raw limits. UTF-8, surrogate pairs, duplicate decoded
keys, numeric precision and all original intake limits remain strict. No overflow
is truncated into success. Canonical non-ASCII escaping or repeated output
packets may overflow the report cap even when all inputs fit; the whole report
is refused. These finite byte/schema limits are not a wall-time, whole-process
memory, source truth, document authenticity or custody guarantee.

The deterministic deeply frozen report retains the full unchanged preparation,
original inventory/settings bindings and raw returns with expected pins and
parsed packets. Its `content_hash` covers `canonicalJson` without that member;
JSON roundtrip must preserve that digest. Reports can contain exact private raw
material. Keep actual submissions/credentials under the coordinator's authorized
handling; repository examples and fixtures contain fictional bytes and judgement
claims only. This utility neither reads nor writes files, calls the network,
recruits people, dispatches packets or publishes anything.

## Executable fictional example

This software fixture uses the actual browser export helper and one explicitly
fictional return. Its declared credential is fictional. No real labels or private
credentials are included. The marked example is imported by the registered
remote test.

<!-- executable-example:start -->
```js
import { createHash } from 'node:crypto';
import { packetContent } from '../../../js/filing-facts-packet.js';
import { filledPacket } from '../../../js/annotate-core.js';
import { reconcileExpertSubmissions } from './expert-submission-audit.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
const gold = {
  schema: 'canli.filing-facts-gold-packet.v0',
  guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
  judgements: { question_clear: ['yes', 'no'],
    answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] },
  annotator: '',
  labels: [{ id: 'synthetic-example', template: 'lookup', company: 'SYNTHETIC fixture company',
    question: 'What is the supplied fictional total?', answer: '10 synthetic USD',
    filings: ['https://www.sec.gov/Archives/edgar/data/0/synthetic-example/'],
    question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' }],
};
const rawGold = json(gold);
const packetSha = sha(packetContent(gold));
const intake = { schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packetSha,
  roles: [{ role: 'reviewer_a', handle: 'synthetic-reviewer-a', aliases: [], affiliations: null,
    conflicts: null, identity_evidence_ids: [], independence_evidence_ids: [],
    qualifications: [{ id: 'synthetic-qualification', kind: 'phd', title: 'SYNTHETIC declared PhD',
      task_relevance: null, evidence_ids: [], verification: null }] }], sources: [] };
const evidenceInventory = { schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] };
const intakeSettings = { schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packetSha,
  required_uses: ['human_review'], prepared_on: '2026-10-02', implementation_source_sha256: null };
const returned = filledPacket(gold, { 'synthetic-example': {
  question_clear: 'yes', answer_matches_filing: 'yes', citation_correct: 'yes', notes: '' },
}, 'synthetic-reviewer-a', packetSha);
const rawReturn = json(returned);
const inventory = { schema: 'canli.filing-facts-expert-submission-inventory.v1', packet_sha256: packetSha,
  submissions: [{ role: 'reviewer_a', declared_handle: 'synthetic-reviewer-a', packet_sha256: packetSha,
    expected_sha256: sha(rawReturn), expected_bytes: rawReturn.length }] };
const settings = { schema: 'canli.filing-facts-expert-submission-settings.v1', packet_sha256: packetSha,
  implementation_source_sha256: null };
export const exampleReport = reconcileExpertSubmissions(
  rawGold, sha(rawGold), json(intake), json(evidenceInventory), [], json(intakeSettings),
  json(inventory), [rawReturn], json(settings),
);
// selected_n = 1, required_item_assignments_n = 2; reviewer_b is absent.
// All established expert/human/rights/labels/admission outcomes remain null.
```
<!-- executable-example:end -->

`npm run test:expert-submission-audit` is the focused command. The existing
`npm run verify` registration runs these named fixtures once in ROOT on remote CI.
Written cases remain unexecuted until that actual CI evidence is captured.
Source review and retained-current-CI review are separate independent gates;
ordinary repository delivery and any substantial release remain separate.
All full CanliCapital owner objectives stay active.


## Exact source-declaration boundary

Source SHA declarations require exactly64 primitive lowercase hex characters or
`null`. A trailing LF, CR, Unicode line separator, paragraph separator or other
extra character is refused, even when escaped within otherwise valid JSON. The
derived report checks both its own declaration and the unchanged preparation's
declared module SHA. The intake module itself remains byte-exact; valid six-input
preparation is still recomputed unchanged. A named regression with valid64/null
controls covers this boundary. The original source-review finding and prior48-case
remote evidence remain retained separately from this correction and its new-head
CI; this paragraph is documentation, not evidence that the regression ran.


Review calibration: the original newline-admission finding was source reasoning,
not an executed failure. ECMAScript CompileAssertion for `$` permits a position
before a line terminator only with the multiline flag. The original SHA pattern
has no such flag, so that counterexample is unsupported by the standard. The new
named fixture checks the original native no-multiline pattern and unchanged
intake refusal as well as the explicit length64 contract guard. Its actual remote
result must remain separate from the written finding and correction. Original
receipts and earlier wording are preserved rather than rewritten. See the
[ECMAScript assertion rules](https://tc39.es/ecma262/multipage/text-processing.html#sec-compileassertion).


Initial49-case validation and evidence, 2026-10-02T18:21:23.844051+00:00: signed292/tree5fa7 passes49unique newcases onceROOT/0MCP+47unchangedintake/root6+1093+9/MCP141+1+82+119+139/all7/Node22.23.3 with fullplans/allfail-cancel-skip-todo0. Both independent current source and retainedCI gatesPASS. The literal63-file evidence archive follows PRIMARY14916B9b721b5f allocation of exactV2proposal055ba903; manifest40887B1da07b8227bcc1d0bd8cf80249d0ea914c5fcf64f291f5e569b45e167ea23d1d binds original11431132/stored3173124/10mtime0 single-member gzip and11externalnonmembers. Original182/48CI/staticHOLD2d137/withdrawal6001/intermediatec448/metadata errors and actual native49 calibration stay intact. Source/test/package292 bytes/modes exact; guide/goals appendonly. New signed documentaryhead/currentCI/allfour finalpeer sourcearchive-CI extensions and PRIMARYsolemerge/actualcustody still required. No localprojectjob-grant-rerun-model-spend-pub; allfullgoalsACTIVE/real expert-rights-labels/indexing-adoption-qualifiedoutcomesunknown.
