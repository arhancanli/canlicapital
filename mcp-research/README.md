# canli-research-mcp

An MCP (Model Context Protocol) server for Canli Capital's open research record. It gives an AI
assistant six read-only tools over what canlicapital.com publishes: every research paper and killed
candidate, the research topics, the count of hypotheses tried against the declared budget, the live
paper-trading record with its sleeves, and the head of the chain that shows the published record
was not rewritten.

Every result carries the limits its source states, beside two of its own: these are research
documents, each with its own claim boundary, and everything here is paper execution, not funded
performance or investment advice.

## Tools

| Tool | Reads | Returns |
|---|---|---|
| `search_research` | `/research-index.json` | Papers matching words in their titles and summaries, as columns and rows |
| `list_topics` | `/research-index.json` | Each topic, how many papers it holds, and what it covers |
| `get_paper` | `/research/{slug}.md` | A paper's text and headings; `section` returns one part, `max_chars` caps the length |
| `trial_ledger` | `/api/v1/trials/summary.json` | Hypotheses tried against the budget, killed and survived |
| `live_record` | `/api/v1/record.json`, `/api/v1/sleeves.json` | The live paper record and each sleeve's paper equity |
| `chain_head` | `/api/v1/chain/head.json` | The head of the tamper-evident chain, and where to verify it |

## Install

```bash
claude mcp add canli-research -- npx -y canli-research-mcp
```

Hosted, no install (claude.ai connectors, ChatGPT, Cursor, or any client that takes a URL):

```bash
claude mcp add --transport http canli-research https://canlicapital.com/mcp/research
```

Any MCP client that spawns a process works the same way: `npx -y canli-research-mcp`.

## Cost and speed

The server reads only static files served from canlicapital.com's CDN, caches each one in memory
for the session (ten minutes), and computes nothing, so a repeated question costs no request. The
tool list a model re-reads on every turn is small and identical on every launch, which lets model
providers serve it from their prompt cache; a test keeps it under 2,500 characters and byte-stable.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CANLI_API_BASE` | `https://canlicapital.com` | Where the record is read from. |

## Privacy

The server sends only GET requests for public files, with no key, cookie or query of yours; it
writes nothing to disk.

## Related

- [canli-validation-mcp](https://www.npmjs.com/package/canli-validation-mcp): validate a backtest (deflated
  Sharpe, overfitting, track record, backtest length, haircut Sharpe), with signed receipts.
- Source: [arhancanli/canlicapital](https://github.com/arhancanli/canlicapital/tree/main/mcp-research).

## Unreleased: bounded response and cache admission

The repository implementation accepts at most 4 MiB of response-body bytes per static file,
counted before decoding. It reads the native response stream rather than materializing an
unbounded response first. A usable advertised Content-Length above the cap is refused before
any read; absent or misleading lengths still require actual byte accounting. HTTP errors are
refused before their bodies are read. Valid UTF-8, including code points split across chunks,
preserves the published text; invalid or truncated UTF-8 is refused rather than silently replaced.

One existing 15-second request signal covers both fetch and body reads. Known failures attempt
reader cancellation and release once; a late fetch response is discarded without reading it.
Cancellation promises are observed without extending the request deadline. The transport may
already have allocated an oversized supplied chunk, and JavaScript cannot preempt a blocked
event loop or synchronous transport code. This is an accepted-body-byte bound and cooperative
request deadline, not a total process-memory guarantee or a hosted latency measurement.

Only complete, decoded successful responses enter the ten-minute session cache. JSON is parsed
before admission; HTTP errors, overflow, abort, invalid UTF-8 and malformed JSON do not become
cache entries. A failed concurrent response cannot evict a newer valid result. Cache ages must
be finite, nonnegative and strictly below ten minutes, so clock rollback and expiry require a
fresh request. There are no added retries, tools, configuration options or dependencies.

This change is Unreleased. Native Response/ReadableStream fixtures exercise these boundaries
with injected responses; their execution and release status are recorded in repository evidence.
