# Changelog

## Unreleased

## 0.5.0 (2026-09-25)

- Full-precision normal CDF behind every probability (PSR, deflated Sharpe, minimum track record
  length): relative error at most 1.5e-14 for x >= -20 against the C library's erfc, replacing an
  approximation with absolute error up to 7e-8 and no relative accuracy in the tails. Results move in
  the seventh decimal place or beyond.
- `validate_track_record` refuses a Sharpe so close to its benchmark that no finite record reaches the
  confidence, instead of returning an infinite length as `null` years.
- Property-based tests (fast-check) of every validator: totality on arbitrary input, the monotonicities
  the formulas imply, inverse consistency and invariances.
- Prompts `validate_backtest` and `track_record_needed`; resources `canli://limits` and
  `canli://sources`; every tool result also carries its envelope as `structuredContent`. The hosted
  endpoint serves the same, through one `registerAll`.
- `company_financial_history` accepts `ticker` (for example `AAPL`) as well as `cik`, resolved through
  `GET /api/v1/company-tickers.json`, an index of the tickers of companies in the release.
- Private local mode (`CANLI_LOCAL=1`, or the Claude Desktop setting): the five validators run on this
  machine from `src/local`, a byte-for-byte mirror of the API's computation, so nothing about the
  submitted series leaves it and no receipt is stored. Requires Node 20.10 or later.
- In local mode `get_key` sends nothing and reports that no key is needed, instead of issuing a key
  the local validators never use. Found by the agent benchmark (`bench/agent`: fixed tasks, scored
  on the right tool and the right answer, run on OpenAI and Anthropic models).

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
