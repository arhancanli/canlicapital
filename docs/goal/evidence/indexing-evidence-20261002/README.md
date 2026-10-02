# Offline indexing evidence archive

This is the bounded predecessor archive for PR360. It retains four signed source
identity proofs, original failed and passing remote logs, source findings, fixes,
reviewer receipts and metadata preparation errors. `manifest.json` binds all
30 selected assets and this README by original/stored SHA256 and byte length.
The archive has exactly32 files including README and manifest. Gzip members have
mtime0 and decompress to the exact original bytes; ANSI logs are not rewritten.
The12MiB limit counts ORIGINAL bytes including both metadata files.

Evidence chronology:

- `0210c110`:32 named cases executed,30 passed/2 fixture assertions failed;
  root6 prechecks passed then955/957 main passed; notifications did not run.
  The malformed-hash fixture was overwritten by its own builder; the mutation
  fixture hit a loader read before the intended input. Both failures are retained.
- `ff6f80c1`:32 actual cases passed, root6+957+9 and139 execution passed.
  Primary found an ambiguous close could retry a reused descriptor despite CI.
- `35c2fec3`:34 actual cases passed, root6+959+9 and139 execution passed,
  after four release-before-close sites and two actual reused-FD controls.
  Further source findings concerned unknown row-limit completeness and a CLI
  symlink entry silently skipping execution. Original holds remain unchanged.
- `c07f6261`:both remaining fixes and36 actual cases passed once; root6+961+9,
 139 execution, Node22.23.3, all seven existing remote CI checks, captured
  pull/360/merge alerts0 and latest JavaScript/Python analysis results0.
  Tested merge86761dfbecdab8513d1f89b96e63ecc2a142abf7 has tree63641977e0fe2f1761dea5085b63528bfebe1709
  and parents actualmain64d81591 plus c07f6261. Primary and third independently
  reviewed this exact source and these exact retained CI bindings.

The root/MCP logs, source proofs and author/peer receipts have separate names;
prior results are not relabeled as final-head validation. Original metadata key,
log-fetch and patch preparation errors are retained; they do not imply runtime
failures. The manifest also pins a bounded EXTERNAL catalogue of unselected
original API captures, snapshots, role/phase and preparation records. Those
original bytes remain in coordination and are explicitly not claimed as portable
archive members. Selected reviewer receipts preserve the references to them.

This archive precedes the final documentation/archive commit. Its signed source,
exact final CI, final independent reviews and actual main delivery receipts stay
external to prevent self-reference and require separate verification.

This offline checker binds supplied bytes and declared observation semantics.
Only synthetic fixture extraction is reproducible here; manual/provider metadata
and authorship remain self-attested. Current Google/Bing indexed counts, distinct
admitted canonicals, useful family coverage and qualified target progress are
null. Built/sitemap/submitted/eligible/performance counts do not unlock indexing.
No new provider capture, model run, expert label, local project job/grant, website
or npm publication is established by this archive. All original owner goals
remain ACTIVE, including10M actually indexed useful source-backed canonicals,
quality/SEO/intents/design/analyzers, useful efficient MCP/API and legitimate
developer adoption, expert refinery, governed ALPHAC outcomes, independent
research/reproduction and paper then legally governed real capital.
