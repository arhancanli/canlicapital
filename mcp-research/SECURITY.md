# Security and privacy

## Reporting a vulnerability

Use GitHub private vulnerability reporting on
[arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/security/advisories/new),
not a public issue. Do not include credentials or private data in a report. The current `main`
branch and the latest npm release are supported.

## What the server does on your machine

`npx -y canli-research-mcp` runs `src/server.mjs` over stdio. It:

- reads its own `package.json`, to report its version, and no other file of yours;
- sends requests only to `CANLI_API_BASE` (default `https://canlicapital.com`), only when a tool
  is called, and only GETs of static published files: the research index (`/research-index.json`),
  a paper (`/research/<slug>.md`, where the slug must be lowercase letters, digits and hyphens), and
  the trial ledger, live record, sleeves and chain head under `/api/v1/`. Redirects are refused,
  every request has a 15 second deadline, and a response larger than 4 MiB is discarded;
- keeps each file in memory for 10 minutes and writes no files;
- needs no key or account, sends no telemetry and logs nothing; stdout carries only the MCP
  protocol. Your questions are never sent anywhere: search runs on this machine over the index.

The published package contains `LICENSE`, `README.md`, `package.json` and `src/`. Dependencies are
pinned to exact versions with a lockfile.

## The hosted endpoint

`https://canlicapital.com/mcp/research` runs the same tools and is stateless: no sign-in, no key,
and no session. Request bodies are capped at 64 KiB. The hosting platform keeps its own standard
request logs (method, path, status, time); our code logs nothing about the questions asked.

## What the record is not

These are research documents as Canli Capital published them. Each paper states its own claim
boundary, and a finding holds only within it. The live record is paper execution only: nothing
here is funded performance or investment advice.
