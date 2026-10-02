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

The response-bound change has32 new native-stream cases passing in the existing remote MCP
job (47 research tests in total), with separate initial source and retained-CI reviews by both
independent reviewers. Original source/logs/API captures and the four literal receipts are in
[the27-member evidence archive](../docs/goal/evidence/research-response-bounds-20261002/README.md).
Its exact PRIMARY allocation preserves twenty original assets plus four reviews and three
documentary files. Final documentary-head verification and publication remain separate;
these repository fixtures do not establish hosted latency, adoption or real financial outcomes.

## Unreleased: bounded session cache retention

The repository session cache retains at most 32 entries and 8 MiB of text measured as UTF-8
bytes. A valid cache hit or admission moves that path to the most recent position; admission
evicts the least recently used paths until both bounds fit. Replacement releases the old
value's weight. Cache operations also remove unrelated entries whose age is negative,
nonfinite or at least ten minutes. Clock values and timestamps must be finite numbers;
strings and other unusable metadata are not coerced into fresh evidence.

JSON validation still precedes admission. Failed, malformed, HTTP-error or aborted responses
cannot remove a newer healthy concurrent result, and a validated success is returned even
when unusable admission time prevents retention. The 4 MiB response-byte limit, strict UTF-8
reader, cooperative 15-second request scope and all six tool outputs remain unchanged.

The cache remains a Map for get, has, iteration, set, delete and clear inspection in injected
fixtures. Inspection does not promote an entry or expire it. Normal set admission enforces
the bounds; controlled lookups remeasure retained text before allowing a hit, so changed
test-entry fields cannot leave stale byte accounting. Replacing the session cache, bypassing
set with Map.prototype, or using accessor properties and mutation during an operation is
outside the supported fixture contract. Direct field mutation can exceed a bound between
operations; the next controlled cache operation repairs it before returning a hit.

The bound covers retained text bytes per session, not JavaScript string/object overhead,
transport allocations, parsed or returned values, the number of sessions, whole-process
memory or hard wall time. There is no autonomous timer, configurable policy, retry or new
dependency. Finite native/injected fixtures contain at most 12 MiB of synthetic payload per
case; execution, independent review and release status are separate evidence gates. This
change is Unreleased and makes no measured hosted latency, token, cost or adoption claim.


The cache-retention change has35 distinct new cases passing once in the existing remote
MCP job (82 research cases total), with separate source and retained-CI reviews by both
independent reviewers. The fixtures include fresh retained hits and refetch after capacity
eviction. Original source/intake/logs/API captures, four literal review receipts and prior
actual-delivery custody are in [the30-member evidence archive](../docs/goal/evidence/research-cache-bounds-20261002/README.md).
Its exact PRIMARY allocation includes23 origin assets, four initial reviews and three
documentary files. Final documentary-head verification and publication remain separate;
these fixtures do not establish hosted latency, adoption, indexing or financial outcomes.
