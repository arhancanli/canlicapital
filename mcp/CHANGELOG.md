# Changelog

## Unreleased

- Private local mode (`CANLI_LOCAL=1`, or the Claude Desktop setting): the five validators run on this
  machine from `src/local`, a byte-for-byte mirror of the API's computation, so nothing about the
  submitted series leaves it and no receipt is stored. Requires Node 20.10 or later.

## 0.4.0 (2026-09-25)

- `validate_track_record`: the minimum track record length for an observed Sharpe to clear a
  benchmark at a confidence level, and the probabilistic Sharpe of a record of a given length
  (`POST /api/v1/validate/track-record`), from Bailey and López de Prado (2012) and checked against
  that paper's worked examples.

## 0.3.1 (2026-09-25)

- Tool annotations on every tool: a title, `readOnlyHint` (true for `get_receipt`,
  `service_status` and `company_financial_history`), `destructiveHint: false`, and
  `openWorldHint: true`. Clients use them to present and gate tools.
- An empty `CANLI_KEY`, or an unsubstituted template such as `${user_config.api_key}`, is treated
  as no key instead of being sent to the API.
- Claude Desktop extension (`.mcpb`) attached to each release of
  [arhancanli/canli-validation-mcp](https://github.com/arhancanli/canli-validation-mcp/releases).
- First release published from CI with npm provenance.

## 0.3.0

- Compact context: columnar company history and minified results, measured at about half the
  tokens of 0.2.0 (see "Compact context (0.3.0)" in the README).
