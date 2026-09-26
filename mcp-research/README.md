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
