# Security and privacy

Report vulnerabilities through [GitHub private reporting](https://github.com/arhancanli/canlicapital/security/advisories/new).
Keep real credentials, account data and proprietary strategy inputs out of reports.
Execution remains private and unreleased; this file describes the repository source.

The stdio server computes from supplied inputs. It contains no broker connection, sends no
orders and makes no financial network requests. Documentation and icon URLs are static metadata.
It reads `CANLI_HOME/limits.json` and `CANLI_HOME/KILL` for order checks; calls can tighten the
configured limits. It reads a named journal or `CANLI_HOME/journal.jsonl` only for journal tools.
Shortfall may read a named bounded orders JSON file. Its outputs disclose missing costs and
incomplete account/market state. No tool writes limits or changes the source journal.

Journal reads require a regular file of at most 256 MiB, and accounting exports are limited to
100,000 entries. Reads use one descriptor, a bounded buffer and before/after metadata checks;
they refuse devices, FIFOs, growing/shrinking inputs and detected concurrent edits. These checks
do not establish broker authenticity, trusted time or the completeness of a user's records.

`journal {action:"export"}` reconstructs one declared USD paper/simulated account. A bundle up
to 16 KiB returns inline. A larger bundle creates a new file under `CANLI_HOME/exports`, with
exclusive creation, mode 0600 and a private owned directory; an existing unsafe directory is
refused. Exports are capped at 64 MiB. They include the source hash and selected chain range.
The tool's write/idempotency annotations reflect this behavior.

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
