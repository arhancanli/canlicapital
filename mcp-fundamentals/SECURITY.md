# Security and privacy

## Reporting a vulnerability

Use GitHub private vulnerability reporting on
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/security/advisories/new),
not a public issue. Do not include credentials or private data in a report. The current `main`
branch and the latest npm release are supported.

## What the server does on your machine

`npx -y canli-fundamentals-mcp` runs `src/server.mjs` over stdio. It:

- reads its own `package.json`, to report its version, and no other file of yours;
- sends requests only to `CANLI_API_BASE` (default `https://canlicapital.com`), only when a tool
  is called, and only three kinds of GET: the ticker list (`/api/v1/company-tickers.json`), a
  company record (`/company-data/<cik>.json`) and the SEC snapshot that record names
  (`/company-data/sources/...`). Redirects are refused, every request has a 30 second deadline,
  and a response over 16 MiB (256 MiB once decompressed) is not read;
- refuses a snapshot unless its SHA-256 equals the hash in the company record, then computes every
  answer on this machine;
- writes one kind of file: each verified snapshot, gzipped and named by its SHA-256, in
  `~/.cache/canli-fundamentals` (set `CANLI_CACHE_DIR` to another path, or to an empty value to keep
  nothing on disk). The directory is created owner-only (`0700`) and each file is written owner-only
  (`0600`) under a random temporary name, then renamed. A cached file is used only if its hash
  still matches its name;
- keeps at most 8 companies in memory for the session;
- needs no key or account, sends no telemetry and logs nothing; stdout carries only the MCP
  protocol.

The published package contains `LICENSE`, `README.md`, `package.json` and `src/`. Dependencies are
pinned to exact versions with a lockfile.

## The hosted endpoint

`https://canlicapital.com/mcp/fundamentals` runs the same tools and is stateless: no sign-in, no
key, and no session. Each function instance keeps its snapshot cache in its own private temporary
directory, and every snapshot is still checked against its hash before use. Request bodies are
capped at 64 KiB. The hosting platform keeps its own standard request logs (method, path, status,
time); our code logs nothing about the questions asked.

## What the data is not

Values are as the SEC's XBRL companyfacts API reported them in the snapshot a result names. A value
that changed in a later filing may be a restatement, a reclassification or a correction, and the
`accn` field names the filing to read. This is company-reported data, not investment advice.
