# Changelog

## 0.2.0 (2026-09-27)

- Built on the MCP SDK's v2 server package (`@modelcontextprotocol/server` 2.1.0): about 94
  installed packages down to 4.
- Every tool publishes an open output schema, and the descriptions say when to use each tool.
- `get_paper` with a `section` keeps its subsections: a section runs to the next heading of its own
  level or higher. 0.1.0 stopped at the first `###`, returning a few characters of a long section
  with `truncated: false`.
- An unknown slug says to use `search_research` or `list_topics`; an unreachable site says to retry.
- `initialize` returns a title, the documentation page and icons in `serverInfo`, and the registry
  entry carries the same title, website and icons.
- Hosted at https://canlicapital.com/mcp/research over MCP Streamable HTTP (stateless, no key), declared
  as a remote in the registry entry.

## 0.1.0 (2026-09-26)

- First release: `search_research`, `list_topics`, `get_paper`, `trial_ledger`, `live_record` and
  `chain_head`, read-only over canlicapital.com's published research record.
