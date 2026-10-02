# Execution planning file and fee admission evidence

This archive binds the private, Unreleased execution source at signed implementation
`cf907f46e6ede3edc39fb854c75d61d9f1e3060a` to its original findings, corrections,
remote CI and independent source review. It introduces no version or registry release.

Planning inputs open nonblocking before regular-file admission. Limits are capped at
1 MiB and orders at 16 MiB; captured bytes, length and metadata come from one descriptor.
Metadata-only fee objects refuse in both strict local and hosted contracts. Omitted
commission remains unknown and supplied numeric zero remains zero.

At that implementation, 22 new named cases pass within 105 execution cases on remote
Node22.23.3; root CI passes 6 preverify, 925 main and 9 notification tests. All seven
checks pass, the captured merge-ref has zero open CodeQL alerts, and the tested merge
`af37ac655f579bf0216d6bba33460eca46ac9769` has the implementation tree. The independent
review closes both original source findings within static scope. Its separate CI receipt
parses the existing remote run; the reviewer did not execute these tests independently.

The earlier `86653770` MCP job has 100 passes and five fault-harness failures within
105 cases. Those failures and original raw bytes remain here. The correction loads the
implementation before filesystem interception and binds only the actual input descriptor;
no original failing result is relabeled. The initial CodeQL language-field parser
assumption is retained as a metadata error, separate from product and test outcomes.

`manifest.json` lists original and stored byte lengths, SHA-256 hashes, provenance and
encoding. `gzip-mtime0` assets decompress exactly to their named original; `exact-bytes`
assets retain the original bytes. The manifest excludes its own hash. Final commit CI,
review extensions and actual merge receipts stay in coordination because this archive
cannot contain future or self-referential evidence. Earlier receipts describing a gate
as pending remain historical and are not rewritten.

These checks observe a local snapshot; they do not freeze a file, exclude all changes
between observations, guarantee synchronous filesystem timing, establish network or
hardware persistence, or qualify a trading strategy. Protected preservation compares
Git modes, types, blobs and sizes, not a repeated whole-working-tree byte audit. Default
advertised schemas and registry spans are source-equal; no fresh token/latency score is
inferred. There is no local reviewer project run, provider/model/broker call, spend,
website/npm publication, expert label or measured indexing/adoption/strategy outcome.
Every original owner objective remains in force.
