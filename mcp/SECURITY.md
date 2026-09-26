# Security and privacy

## Reporting a vulnerability

Use GitHub private vulnerability reporting on
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/security/advisories/new),
not a public issue. Do not include real credentials, account data or proprietary inputs in a
report. The current `main` branch and the latest npm release are supported.

## What the server does on your machine

`npx -y canli-validation-mcp` runs `src/server.mjs` over stdio. It:

- reads its own `package.json`, to report its version, and a file only when a call to
  `audit_backtest` names one (`returns_file`, `variants_file`): it parses numbers from that file,
  up to 5 MB, and never returns the file's text; error messages name rows and columns by position,
  never by content. The hosted endpoint refuses file paths;
- sends requests only to `CANLI_API_BASE` (default `https://canlicapital.com`), and only when a
  tool is called;
- writes no files, keeps no local cache, sends no telemetry, and logs only a fatal startup error
  to stderr;
- holds a key issued by `get_key` in memory for the session and never writes it to disk.

The published package contains `LICENSE`, `README.md`, `package.json` and `src/`; a test in
`test/package-smoke.mjs` fails if anything else is packed. Dependencies are pinned to exact
versions with a lockfile.

## Private local mode

With `CANLI_LOCAL=1` the validators compute on your machine from `src/local`, a byte-for-byte copy of
the API's computation. The series you submit is not sent anywhere and no receipt is stored. The read
tools (`get_receipt`, `service_status`, `company_financial_history`) still call canlicapital.com and
send no series.

## The hosted endpoint

`https://canlicapital.com/mcp` runs the same tools and is stateless. When you send
`Authorization: Bearer <key>`, that key is forwarded to the validation API and is never echoed
back or logged by our code. Without a header, requests run under a shared anonymous key that is
held as an encrypted environment variable and never returned to callers. A malformed
Authorization header is refused rather than replaced with the shared key. The hosting platform
keeps its own standard request logs (method, path, status, time).

## What the validation API stores

| Stored | Not stored |
|---|---|
| A SHA-256 hash of each API key, its optional label, creation and last-use times, revocation time, and the site that requested it | The key itself |
| A daily call count per key | Which series you submitted |
| A daily key-issuance count per client, where the client is the request address hashed with a secret salt | The request address |
| For each receipt: the endpoint, a SHA-256 hash of your input, the verdict the API returned, and a timestamp | Your input: the returns, trials or record you sent |

Every table has row-level security with no policies, so nothing reads it except the API's own
server-side role. The company financial history tool reads a public release and stores nothing.

## What a receipt is not

A receipt is content-hashed, reproducible from the open-source core it names, and signed with
Ed25519 by a key published at https://canlicapital.com/.well-known/canli-receipt-keys.json; the
`verify_receipt` tool checks the signature offline against the copy of that key in this package. A
valid signature proves canlicapital.com computed that output from that input with that code. It says
nothing about the data source, costs, survivorship or lookahead in how your series was built.
