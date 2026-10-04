# Supplied-file Fundamentals audit client

This is an Unreleased package candidate. It packages the existing offline audit client for convenience; it does not add a financial audit capability or establish a published npm release, production installation or adoption.

The opt-in command `canli-fundamentals-audit-files` reads three supplied files, starts the same package's `audit_inputs` stdio server once, calls its compact view once, and closes that known child before returning a result. The existing default seven-tool command and the other opt-in commands keep their behavior.

Save the following fictional examples as three separate UTF-8 files. These supplied bytes have no authenticated source, rights or capture-time provenance. The reference includes two conflicting observations of `Ambiguous` and six selected usage rows so every outcome remains in the denominator.

<!-- AUDIT_FILES_REFERENCE_BEGIN -->
```json
{"schema":"canli.fundamentals.audit-reference.v1","companyfacts":[{"cik":123456,"facts":{"us-gaap":{"Assets":{"units":{"USD":[{"end":"2019-12-31","val":100,"accn":"0000123456-20-000001","filed":"2020-02-10","form":"10-K"}]}},"Ambiguous":{"units":{"USD":[{"end":"2019-12-31","val":100,"accn":"0000123456-20-000001","filed":"2020-02-10","form":"10-K"},{"end":"2019-12-31","val":99,"accn":"0000123456-20-000002","filed":"2020-02-10","form":"10-K"}]}}}}}]}
```
<!-- AUDIT_FILES_REFERENCE_END -->

<!-- AUDIT_FILES_USAGE_BEGIN -->
```json
[{"cik":"0000123456","taxonomy":"us-gaap","concept":"Assets","unit":"USD","start":null,"end":"2019-12-31","value":100,"used_on":"2020-03-01"},{"cik":"0000123456","taxonomy":"us-gaap","concept":"Assets","unit":"USD","start":null,"end":"2019-12-31","value":999,"used_on":"2020-03-01"},{"cik":"0000123456","taxonomy":"us-gaap","concept":"Missing","unit":"USD","start":null,"end":"2019-12-31","value":100,"used_on":"2020-03-01"},{"cik":"0000123456","taxonomy":"us-gaap","concept":"Ambiguous","unit":"USD","start":null,"end":"2019-12-31","value":100,"used_on":"2020-03-01"},{"cik":"0000123456","taxonomy":"us-gaap","concept":"Assets","unit":"EUR","start":null,"end":"2019-12-31","value":100,"used_on":"2020-03-01"},{"cik":"0000123456","taxonomy":"us-gaap","concept":"Assets","unit":"USD","start":null,"end":"2019-12-31","value":100,"used_on":"2020-02-10"}]
```
<!-- AUDIT_FILES_USAGE_END -->

<!-- AUDIT_FILES_SETTINGS_BEGIN -->
```json
{"schema":"canli.fundamentals.audit-settings.v1","snapshot_captured_at":null,"capture_reason":"Synthetic supplied bytes; no authenticated capture.","completeness":"partial","completeness_reason":"Only selected fictional observations supplied.","implementation_source_sha256":null}
```
<!-- AUDIT_FILES_SETTINGS_END -->

Set `PACKAGE_ROOT` to the absolute directory of this admitted package, `REFERENCE`, `USAGE` and `SETTINGS` to the three absolute file paths, and `REFERENCE_SHA256` to the separate lowercase SHA-256 of the exact saved reference bytes. Whitespace is part of that pin. The package root can be a filesystem alias of this same package; another server root is refused. Each of the five flags must occur exactly once.

<!-- AUDIT_FILES_COMMAND_BEGIN -->
```sh
canli-fundamentals-audit-files --root "$PACKAGE_ROOT" --reference "$REFERENCE" --expected-reference-sha256 "$REFERENCE_SHA256" --usage "$USAGE" --settings "$SETTINGS"
```
<!-- AUDIT_FILES_COMMAND_END -->

For an admitted candidate without a PATH bin link, invoke its executable `src/audit-inputs-client.mjs` with those same flags. A bin symlink resolves to the same package. The remote artifact fixture executes the marked workflow as its first of at most three command entries; the second checks an owned bin symlink and the third checks a bounded server refusal. The fixture uses a disclosed link to already locked dependencies and does not claim an npm installation.

A successful stdout line has schema `canli.fundamentals.audit-client-result.v1`, an entire compact artifact and qualified lifecycle observations. The example retains selected N=6 and `match`, `mismatch`, `missing`, `ambiguous`, `unsupported`, and `timing_indeterminate`. Unknown verdicts remain null. The client verifies the compact artifact hash, exact original input bindings and selected rows. It preserves `verified.complete_core_report:false` and `source_execution_authenticated:false`; omitted core evidence and caller source declarations are not authenticated. Rights, full-universe coverage, adjudication, global availability and other established unknowns stay null. Same-day date-only filing observations do not establish intraday tradability, and mismatches do not establish a restatement cause.

All three regular file descriptors and their individual sizes are admitted before a payload read: reference 524,288 bytes, usage 65,536 bytes, settings 4,096 bytes, aggregate 573,440 bytes. Reads retain the same captured bytes, enforce strict UTF-8/JSON and close each owned descriptor once. Direct file symlinks, short reads, overflow and observed instability are refused. The client writes no files.

One monotonic budget begins before CLI parsing and root capture: 15 seconds for work, with 5 seconds for owned child closure and final encoding, 20 seconds total. Observations include queued SDK work and synchronous serialization. Immediately before the native stdin and terminal stdout writes, the same clock and sticky abort state are observed after encoded-byte admission. These cooperative checks do not forcibly preempt synchronous JavaScript. Startup outcomes are handled before child-field admission; unknown child identity or closure prevents success. SIGINT/SIGTERM and caller aborts remain sticky through terminal writing.

Requests include the whole legacy JSON-RPC frame and LF within 1 MiB. Received frames and successful terminal JSON+LF are bounded to 524,288 bytes; stderr is drained within 65,536 bytes and is never echoed. A refusal is at most 2,048 bytes and excludes raw inputs, paths, exception messages and stacks. Exactly one terminal frame is attempted: writer failure, drain failure or observed late completion has no retry. If a write was already accepted and later completion fails, exit status is failure; emitted bytes cannot be recalled. An exit status of zero therefore also requires the terminal completion observation. Declared lifecycle timings describe observations before the final native write, not a guarantee about downstream consumers.

The client uses the locked 2.1 legacy negotiation and the exact tool definition in the second call options to avoid discovery and hidden retry. No network, key, hosted tool, provider or model is used by this workflow. The package's default server, schemas, audit math, versions and original repository examples remain unchanged.
