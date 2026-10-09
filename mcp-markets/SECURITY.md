# Security and privacy

## Reporting a vulnerability

Use GitHub private vulnerability reporting on
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/security/advisories/new),
not a public issue. Do not include credentials or private data in a report. The current `main`
branch and the latest npm release are supported.

## What the server does on your machine

`npx -y canli-markets-mcp` runs `src/server.mjs` over stdio. It:

- reads its own `package.json`, to report its version, and no other file of yours;
- sends GET requests, only when a tool is called, and only to these hosts: `www.sec.gov`,
  `data.sec.gov` and `efts.sec.gov` (SEC EDGAR), `home.treasury.gov` (Treasury rates),
  `fred.stlouisfed.org` (FRED), and, for `price_history` only, `data.alpaca.markets` or
  `api.tiingo.com` with your key. Nothing goes to Canli Capital;
- sends what the tool needs and nothing else: the company, form, dates, search words or series
  asked for. SEC requests carry a User-Agent naming this package (or `SEC_USER_AGENT`, which SEC
  asks for: your name and email); other hosts get `canli-markets-mcp`;
- keeps SEC requests at most 8 a second (SEC's limit is 10), refuses redirects, gives every
  request a 20 second deadline and discards responses above a size cap;
- keeps responses in memory for 10 minutes and writes no files;
- reads `ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY` (or the paper pair `ALPACA_PAPER_KEY_ID`/
  `ALPACA_PAPER_SECRET_KEY`) or `TIINGO_API_KEY` only for `price_history`; keys travel only in
  request headers, never in URLs or error messages;
- sends no telemetry and logs nothing; stdout carries only the MCP protocol.

The published package contains `LICENSE`, `README.md`, `CHANGELOG.md`, `package.json` and `src/`.
Dependencies are pinned to exact versions with a lockfile; there are no install scripts.

## What the data is not

Filings are shown as filed; Canli Capital does not edit or verify them. 13F and Form 4 data have
the gaps their forms have (each result lists them). Nothing here is investment advice.
