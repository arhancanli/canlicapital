# Save a private expert-submission audit

This offline command wraps the delivered `reconcileExpertSubmissions` utility.
Supply the original gold packet, intake declarations, inventories, settings and
ordered document/return files. The command captures their exact bytes, calls the
unchanged reconciler once, and saves its complete report in one private file.

The report describes byte consistency and syntactic coverage. Human identity,
task expertise, independence, source rights, expert labels, admission and
adjudication remain `null`. Even two complete fictional returns do not establish
verified expert agreement. No decisions are created. Missing files, judgements
and required notes retain the full selected-item denominator and worklists.

The feature is repository-only and Unreleased. It adds no hosted or default MCP
tool, transport, recruitment, evidence download or release.

## Supply the original files

Use absolute normalized UTF-8 paths with existing canonical parents. Each path
must fit4096 bytes and contain no NUL, control character or unpaired surrogate.
Inputs must be regular files owned by the command's UID. Symlinks, directories,
special files, duplicate paths and duplicate inode aliases are refused. Empty
physical files are refused; empty optional arrays are represented by omitting
their flags and supplying the corresponding empty inventory arrays.

```sh
node scripts/datasets/filing-facts/expert-submission-cli.mjs \
  --gold /absolute/private/gold.json \
  --expected-gold-sha256 YOUR_INDEPENDENT_LOWERCASE64_RAW_SHA256 \
  --intake /absolute/private/intake.json \
  --evidence-inventory /absolute/private/evidence-inventory.json \
  --intake-settings /absolute/private/intake-settings.json \
  --submission-inventory /absolute/private/submission-inventory.json \
  --audit-settings /absolute/private/audit-settings.json \
  --evidence /absolute/private/first-document.bin \
  --submission /absolute/private/reviewer-a.json \
  --out /absolute/private/reconciliation-report.json
```

Replace the SHA placeholder with the separately supplied primitive lowercase64
SHA-256 of the original gold bytes. Repeated `--evidence` and `--submission`
values must follow their original inventory order. There are at most64 evidence
files and2 returns. Each required scalar flag occurs exactly once. Unknown flags,
duplicate scalar flags, missing values and positional extras refuse.

No files or settings are inferred from the output directory, date, environment,
stdin, URL or another role. The inventories retain the delivered closed schemas;
the CLI does not recompute caller pins to repair incorrect input. See
[intake declarations and evidence](EXPERT_INTAKE.md) and
[returned packet and submission schemas](EXPERT_SUBMISSION_AUDIT.md).

The API call receives the same owned captured buffers, in this exact order:

```js
reconcileExpertSubmissions(
  goldBytes, expectedGoldRawSha256, intakeBytes, evidenceInventoryBytes,
  evidenceBuffers, intakeSettingsBytes,
  submissionInventoryBytes, submissionBuffers, auditSettingsBytes,
);
```

Original whitespace, UTF-8, expected hashes and base64 bindings are preserved.
Delivered strict JSON/Unicode, roles, packet immutability, source declarations,
notes and raw-byte semantics decide acceptance. Opaque evidence is never
interpreted in the CLI. Matching a caller hash establishes byte consistency;
it does not authenticate a person, document or rights claim.

## Finite admission and custody

| Supplied bytes | Maximum |
| --- | ---: |
| Gold / intake | 512 KiB / 64 KiB |
| Evidence inventory / intake settings | 32 KiB / 4 KiB |
| Each evidence / all evidence | 32 KiB / 256 KiB |
| Gold, intake, evidence inventory, intake settings and all evidence together | 768 KiB |
| Submission inventory / audit settings | 16 KiB / 4 KiB |
| Each return / returns count | 2 MiB / 2 |
| All supplied bytes / input descriptors | 4 MiB / 72 |
| Complete serialized API report | 6 MiB |
| Saved JSON plus its one newline | 6 MiB + 1 byte |
| Stdout / stderr, including newline | 4096 B / 1024 B |

Arguments and counts are admitted before native input I/O. Every input descriptor
is opened with no-follow and nonblocking flags, admitted from `fstat`, and bound
to its postpath identity. All individual and aggregate sizes are admitted before
the first payload allocation/read. The complete native inventory is finite.
Captured reads use bounded progress accounting and one overflow byte. Same-FD
identity, size, mtime and ctime, plus the postpath identity, are checked after
capture and again across the whole inventory. Truncation, growth, replaced paths,
read errors and uncertain native counts refuse before the core is loaded.

Numeric FD ownership is forgotten before its sole close attempt. Every remaining
known-owned input is given one release attempt on failure. A close error prevents
success and never causes a retry of a potentially reused number. The core is
lazily loaded only after all captured input descriptors are known released.

The output parent must already exist, belong to the UID, and have no group/world
access. It is admitted through an owned directory FD and retained until
completion. Use a private0700 directory. The chosen output name must be unused.
The only production filesystem write is that explicit file, created
`O_EXCL`/no-follow/`O_RDWR` at0600. There is no mkdir, input chmod, overwrite,
unlink, public copy or automatic retry.

The unchanged report is serialized and byte-admitted before creating the output.
Writes account for real short progress, followed by file fsync, exact same-FD
readback bytes/hash, FD/postpath guards, successful file close, directory fsync,
directory/path guards and successful directory close. Exit0 follows these known
closure steps. A zero/invalid count, fsync/readback/close failure or identity
change refuses. A created partial or complete private file may remain after
refusal. Its existence alone does not mean the command succeeded. Inspect it
under the coordinator's custody policy; this command neither deletes nor retries
it. A terminal stdout failure also leaves the invocation unsuccessful.

These checks bound the admitted native inventory and payload. They do not
establish hostile-filesystem ABA immunity, document authenticity, a wall-time or
whole-process memory guarantee, or global process-idle status.

## Bounded terminal result

Successful stdout is exactly one compact JSON object plus newline:

```json
{"status":"saved","report_sha256":"LOWERCASE64","report_bytes":12345,"selected_n":3,"supplied_role_count":2,"syntactic_only":true}
```

The SHA and length bind the saved JSON including its newline. The report's own
canonical `content_hash` remains unchanged and is a distinct binding. Stdout
contains no private path, handle, evidence, packet, notes or credentials.
Successful stderr is empty. Refusals have exit1, empty success stdout and a
single allowlisted code such as `expert-submission-cli: CLI_RECONCILE` on stderr.
Native terminal writes are bounded; unknown exceptions are never echoed.

Refusal groups are argument/path/SHA/count/alias; input type, individual and
aggregate bounds, changed inputs/read/close; source load/reconciliation/report
bound; parent/output/write/flush/readback/changed output; and terminal stdio.
The CLI never retries a refusal or dispatches another process or transport.

The exported `main(argv)` returns `{ exitCode, stdout, stderr }` without writing
terminal streams. Trusted JS-only `filesystem` and `loadCore` options provide
native fault seams for tests. The actual command always uses its native
operations and the one local delivered core; no flag or environment setting can
select an injected implementation. Direct and owned temporary symlink commands
compare both realpaths for entry identity. Ordinary library imports dispatch
nothing.

## Executable fictional preparation example

Create an owned private directory first. The following separate fixture-preparer
writes six explicitly fictional inputs there, using exclusive creation. It is
documentation for synthetic software testing, not an authentication or rights
workflow. Run it from the repository root with your actual private directory in
place of the example path. Existing files refuse rather than being replaced.

```sh
node --input-type=module - /absolute/private/software-fixture <<'JS'
import fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { packetContent } from './js/filing-facts-packet.js';
const root = fs.realpathSync(process.argv[2]);
let fd;
try {
  fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  const st = fs.fstatSync(fd);
  if (!st.isDirectory() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Private directory required');
} finally { if (fd !== undefined) { const owned = fd; fd = undefined; fs.closeSync(owned); } }
const sha = raw => createHash('sha256').update(raw).digest('hex');
const gold = { schema: 'canli.filing-facts-gold-packet.v0',
  guidelines: 'scripts/datasets/filing-facts/ANNOTATION_GUIDELINES.md',
  judgements: { question_clear: ['yes', 'no'], answer_matches_filing: ['yes', 'no', 'cannot_find'], citation_correct: ['yes', 'no'] },
  annotator: '', labels: [{ id: 'software-fixture', template: 'lookup', company: 'SYNTHETIC SOFTWARE FIXTURE',
    question: 'Synthetic amount?', answer: '1 fictional unit', filings: ['https://example.invalid/software-fixture'],
    question_clear: '', answer_matches_filing: '', citation_correct: '', notes: '' }] };
const packet = sha(packetContent(gold));
const data = {
  'gold.json': gold,
  'intake.json': { schema: 'canli.filing-facts-expert-intake.v1', packet_sha256: packet, roles: [], sources: [] },
  'evidence-inventory.json': { schema: 'canli.filing-facts-expert-evidence.v1', evidence: [] },
  'intake-settings.json': { schema: 'canli.filing-facts-expert-settings.v1', packet_sha256: packet,
    prepared_on: '2026-10-03', required_uses: ['human_review'], implementation_source_sha256: null },
  'submission-inventory.json': { schema: 'canli.filing-facts-expert-submission-inventory.v1', packet_sha256: packet, submissions: [] },
  'audit-settings.json': { schema: 'canli.filing-facts-expert-submission-settings.v1', packet_sha256: packet, implementation_source_sha256: null },
};
for (const [name, value] of Object.entries(data)) {
  const raw = Buffer.from(JSON.stringify(value) + '\n');
  fs.writeFileSync(join(root, name), raw, { flag: 'wx', mode: 0o600 });
  if (name === 'gold.json') console.log(sha(raw));
}
JS
```

Use the printed gold SHA in the command above, with these six filenames and
without evidence or submission flags. The report has selected_n1, two required
item assignments, both roles absent and all established outcomes unknown. That
preparer computes a hash of fictional bytes; a real coordinator must supply the
independent expected pins and handle private materials separately.

## Source and verification scope

The protected audit/intake/agreement/canonical/packet sources, old49 audit and47
intake cases, core parsers/math, default surfaces, dependencies, versions, locks,
website, journal and prior archives are unchanged. Core whole-module SHA
declarations remain caller-declared with verificationfalse; behavior fingerprints
remain diagnostic. A filesystem capture does not authenticate executing source.
The frozen external signed Git manifest binds the complete CLI and local import
closure for independent review, with no new digest convention or self-hash.

New native cases cover missing/blank/partial/complete fictional returns; raw
binding, packet/role/order/JSON tampering; all-input preflight and cap controls;
direct/library/symlink entry; private/exclusive/no-follow aliases and special-file
types; actual short progress, read/write/flush/readback/path changes; and actual
close-after-release numeric-FD reuse for input, output and parent. Special FIFO,
socket and device cases use explicitly synthetic native stat responses. Four
actual command child entries are limited to five seconds each in future existing
remote CI; remaining controls use native JS fault seams. Fixtures remain
WRITTEN_UNRUN until signed source is pushed and that CI runs them.

Focused registration is `npm run test:expert-submission-cli`; the root verify
list includes the new test once adjacent to the delivered audit test. The run
registration is `npm run filingfacts:expert-submission-audit -- ...`. Removing
those three additions recovers the original package bytes. All prior verify
commands and both postbuild guards remain unchanged.

Initial PRIMARY and THIRD source reviews and independent exact-current-CI
reviews are separate gates. No archive is allocated at initial source. Any later
documentary allocation, final signed source/archive and separate CI reviews,
unchanged-head readiness, PRIMARY ordinary merge and actual custody remain
separate. This repository utility establishes no measured indexing, real expert
labels/rights, developer adoption or qualified financial strategy outcome.
