# Security and privacy

Report vulnerabilities through [GitHub private reporting](https://github.com/arhancanli/canlicapital/security/advisories/new).
Keep real credentials, account data and proprietary strategy inputs out of reports.
Execution remains private and unreleased; this file describes the repository source.

The stdio server computes from supplied inputs. It contains no broker connection, sends no
orders and makes no financial network requests. Documentation and icon URLs are static metadata.
It reads `CANLI_HOME/limits.json` and `CANLI_HOME/KILL` for order checks; calls can tighten the
configured limits. It reads a named journal or `CANLI_HOME/journal.jsonl` only for journal tools.
Shortfall may read a named bounded orders JSON file. Its outputs disclose missing costs and
incomplete account/market state. No tool writes limits. Default journal head/verify/export
does not change the source journal.

Planning-file admission opens with nonblocking read flags, then checks the opened
descriptor for a regular file before reading. Orders JSON is capped at 16 MiB;
`limits.json` is capped at 1 MiB. Captured size and nanosecond modification/change
times must remain stable, and the bytes read must match the admitted size. Limits
resource modification time comes from that same descriptor. An absent limits file
retains the existing optional-policy behavior; an unsafe, oversized or invalid file
refuses rather than silently running without its policy. Invalid UTF-8 is refused.
Ordinary symlink aliases to stable regular planning files remain supported; signing
keys and private journal writes retain their separate, stricter admission rules.

These checks prevent a FIFO from waiting for a writer before type admission. They
do not provide a universal deadline for synchronous filesystem calls, freeze a
file, establish network-filesystem behavior or exclude every change between checks.
The caller controls the local inputs. Software fault tests do not establish device
or power-loss behavior.

Fee schedule dates and source URLs are metadata. A supplied fee object must state
at least one monetary field; otherwise the local and hosted input contracts refuse
it. Omit `fees` when commission is unknown. An explicitly supplied zero remains
zero, and a stated sell-only schedule retains zero commission on buys.

Explicit local startup with `CANLI_EXEC_JOURNAL_WRITE=1` adds `initialize` and `append`
actions to journal. They use the existing owned `0700` home and its bounded private
`0600` Ed25519 `journal.key`, never inline signing material or an alternate file.
The adapter clears captured key bytes, returns only receipts and reuses the delivered
private store's chain, retry, lock and persistence checks. Pending locks and uncertain
writes require manual review; nothing automatically resubmits or deletes pending evidence.
Observed home replacements around key capture or after persistence refuse success;
already written files can remain. The same-user changes entirely between checks and
device persistence limits remain. See `JOURNAL_STORAGE.md` for the exact boundary.

Journal reads require a regular file of at most 256 MiB, and accounting exports are limited to
100,000 entries. Reads use one descriptor, a bounded buffer and before/after metadata checks;
they refuse devices, FIFOs, growing/shrinking inputs and detected concurrent edits. These checks
do not establish broker authenticity, trusted time or the completeness of a user's records.

`journal {action:"export"}` reconstructs one declared USD paper/simulated account. A bundle up
to 16 KiB returns inline. A larger bundle creates a new file under `CANLI_HOME/exports`, with
exclusive creation, mode 0600 and a private owned directory; an existing unsafe directory is
refused. Exports are capped at 64 MiB. They include the source hash and selected chain range.
The tool's write/idempotency annotations reflect this behavior.

Large exports require both the home and exports directories to be private and owned by the
current user. Directory device/inode, ownership, mode and home entry timestamps are checked
around creation and writing; the opened file must still match its named file. Observed swaps
refuse, including a symlink substituted after the initial check. These portable pathname
checks are not directory-anchored creation and cannot defend a compromised same-user process
that changes and restores paths entirely between checks. Failures close the descriptor and
never unlink a pathname that could now belong to another writer. Failed or partial files can
remain; they are never returned as valid exports.

Signing is disabled by default. Explicit `sign:true` reads only `CANLI_HOME/journal.key`, a
regular non-symlink file owned by the user with mode 0600 and a maximum size of 16 KiB. The
Ed25519 public key must match journal genesis. Neither private key bytes nor raw journal entries
are returned. Export records/observations and source names may contain proprietary information;
the caller controls their local storage and any later publication. A publication URL is only
retained as metadata and is never fetched or uploaded by this workflow.

The user's signature covers canonical standard-record bytes. It is self-attestation, not a
Canli API receipt or independent review. Local validation with the original journal recomputes
the record and, for full export files, the companion metrics and observations. Hosted/remote
validation refuses journal/file/signature inputs. Local validation returns no stored receipt.

The package has pinned dependencies and no installation hooks. Packaging tests compare the
mirrored cores byte for byte, scan shipped code for broker hosts/key variables and exercise the
actual stdio transport. Paper-broker tools and their adversarial release requirements remain
outstanding; this implementation does not qualify the full trading release.
