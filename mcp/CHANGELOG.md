# Changelog

## Unreleased

- New lab tool `check_leakage` finds lookahead in a signal without seeing its code. `plan` picks
  seeded cut points between 40% and 95% of the series; the caller reruns its own code on the rows
  before each cut, and `compare` checks every output column: a value that changed when the later
  rows were removed used them. The result names the pattern (future rows with their horizon, the
  full sample, or scattered rows) and the SHA-256 of exactly what it compared. On your machine,
  `columns_file` reads the columns from a JSON file instead of the call. On a fixed zoo of
  22 pandas and statsmodels signals (`config/research/leakage-zoo.json`, built by
  `scripts/research/leakage/`), all 11 leaks are found with the right pattern and none of the
  11 honest indicators is flagged. New prompt: `check_signal_for_lookahead`.
- New lab tool `placebo_test` tests a whole research pipeline on placebo data: the caller's returns
  with the periods in a random order, the same order for every asset, so nothing can be predicted.
  `plan` writes `real.csv` and 19 placebos to a new temporary folder (the hosted endpoint returns
  small placebos inline); the caller runs its pipeline unchanged on each, and `compare` ranks the
  real result among the placebo results, so every choice the pipeline makes is counted. The
  permutation was chosen by a pre-registered study (`scripts/research/placebo/v1/`): in all
  30 simulated markets and pipelines where nothing can be predicted, its false-positive rate
  at a nominal 5% was 4.6% to 5.5%, where a t-test on the best rule reached 10.9% to 78.9%
  and Bonferroni 8.0% to 10.3% in drifting markets. New prompt: `test_pipeline_on_placebos`.
- The listed schemas leave out keywords zod writes that constrain nothing: JavaScript's
  safe-integer range on every integer field, `propertyNames` of type string, and an empty
  `additionalProperties`. zod still validates every call. That takes 357 tokens off the default
  tool list, which costs 5,970 tokens with the two new tools, against 5,581 in 0.12.0 without
  them (`bench/tool_list_tokens.py`). `canli://schemas/{tool}` serves the same schemas the list
  carries.
- README: the tool count and the `validate` toolset's validator count were out of date.

## 0.12.0 (2026-10-04)

- `audit_backtest` opens with a headline: one test, chosen because its false-positive rate was
  measured before anyone looked at a caller's numbers. Null Zoo v1 (`scripts/research/null-zoo/v1/`)
  drew 360,000 complete simulated searches (20 strategies, 504 days) from nine return families at
  four levels of true skill and scored every candidate; the bar (at most 6% false positives at a
  nominal 5% on every family, at least 45% power at a true Sharpe of 2) and the rule that picks
  the test were committed before the run (`config/research/null-zoo-v1-prereg.json`).
  With variants, the headline is White's Reality Check (`reality_check`): in the confirmation run
  v1b, on fresh seeds and with the bar unchanged, its false-positive rate was between 4.5% and
  6.4% across the nine families, at a power of 53.5% on i.i.d. normal returns at a true Sharpe of
  2. It exceeded the bar on ar1 (6.4%), which the result names when the returns look like that.
  The first run (v1) had listed only Hansen's studentized SPA, the textbook choice; it exceeded
  the bar on 7 of 9 families there, and measured 4.3% to 12.6% in v1b. Without variants, the
  headline is luck trials with Lo's autocorrelation correction (`luck_trials_lo`), within the bar
  except on skew_negative (8.8%), which the result names when the returns look like that.
  The result states, in one sentence, the measured rate on returns shaped like the caller's (by
  rules also fixed before the run) and the worst across families. Results:
  `config/research/null-zoo-v1-evaluation.json` and `config/research/null-zoo-v1b-evaluation.json`.
- Trials are counted, not only declared. With variants, the deflated Sharpe runs with the larger
  of the declared count and Li and Ji's effective count of the variants sent, and the larger
  Sharpe spread, so a search cannot be made to look smaller than it was.
- New in the result: Lo's autocorrelation-adjusted Sharpe, a stationary-bootstrap 95% interval
  for the Sharpe, the haircut Sharpe, the minimum backtest length, the selected variant's
  out-of-sample decay across CSCV splits (median, 10th and 90th percentiles, share below zero,
  and the out-of-sample on in-sample line; also in `validate_overfitting`), and `fix_next`: at most
  five next steps, each with a stable id. `CANLI_FULL_ENVELOPE=1` returns every field.
- The new arithmetic (`js/audit-core.js`) matches statsmodels' Newey-West t and numpy's
  eigenvalue-based effective trials to 1e-9 on fixed cases (`scripts/research/audit/`).
- Cheaper. Each check's plain reading is stated once, in `readings`, and local mode's note once:
  a returns-only audit grows by 111 o200k tokens despite everything above. The default tool list
  falls from 5,946 to 5,581 tokens, and to 5,445 with a key configured: `get_receipt` is folded
  into `verify_receipt` (`include_receipt: true` returns the stored receipt), `get_key` is listed
  only when no key is configured, and `company_financial_history` leaves the default toolsets
  (`CANLI_TOOLSETS=all` or `company` lists it; canli-fundamentals-mcp covers company data point in
  time).
- A later audit check that cannot be reached is now that check's error, not a failed audit.
- Migration: call `verify_receipt` with `id` and `include_receipt: true` where you called
  `get_receipt`. The audit's schema is `canli.audit.v2`: `headline`, `fix_next` and `computed` are
  new, and each check's plain reading is only in `readings`.

## 0.11.0 (2026-10-03)

- The lab: four tools that compute in the server process, on stdio and on the hosted endpoint,
  with no API call and no receipt. `backtest_strategy` runs a rule (`sma_cross`, `momentum`,
  `mean_reversion`, `breakout`, `buy_and_hold`) over every parameter set in a grid on the caller's
  prices, with no look-ahead by construction, and validates the best variant with the number of
  variants the call actually ran: deflated Sharpe across the grid's measured dispersion, CSCV
  overfitting probability on every variant's returns, probabilistic Sharpe, minimum track record,
  and buy and hold beside it. `summarize_series` states a long price or return series in about a
  hundred words plus fields (dated drawdowns, trend, volatility regime, tails, jumps, stale data).
  `stress_test` runs seeded block-bootstrap histories and four named scenarios and reports a
  fragility share. `check_feasibility` checks a plan against broker order-rate and minimum-order
  limits (Alpaca, Interactive Brokers), the 2026 FINRA intraday margin change that retired the
  pattern day trader rule, T+1 settlement, participation, square-root market impact with copies of
  the same strategy crowding the book, and capacity. A new `lab` toolset lists them; the full tool
  list measures 5,946 o200k tokens (lab 1,595).
- Code-generation resources: `canli://schemas/{tool}` (each tool's exact input and output JSON
  Schema), `canli://examples/{language}/{tool}` (a working Python, JavaScript or curl call; both
  variables complete), `canli://strategy-spec` and `canli://openapi`. Four guided prompts:
  `backtest_and_validate`, `stress_my_strategy`, `production_check`, `summarize_market_series`.
- Files read by the local server may carry an ISO date column; its dates label results. Dates are
  the only non-numeric cells ever read, and only when every cell of the column is an ISO date.

- Local `validate_paper_evidence` accepts a record/export file and its signed source journal;
  verifies full-file/range hashes, optional detached self-signature and recomputed claims.
  Full export companion metrics/observations are checked too. No journal means conformance
  only. File/signature inputs require local stdio and are never sent to the hosted API.
  Local mode preserves `receipt:null`; hosted/API contracts and version remain unchanged.

- Signed statements and content hashes escape DEL (U+007F) as `\u007f`, as Python's `json.dumps`
  does. It was written raw, so a statement containing it would not have reproduced in Python.

## 0.10.1 (2026-09-28)

- A missing value is refused by its position instead of being read as zero. JSON has no NaN, so a
  gap arrives as `null`, and the API read `null` as 0: in a return series it became a period of
  zero return (a 60-period series with one null moved its Sharpe from 5.19 to 5.56), in a variants
  matrix a zero cell, and in `other_sharpe_ratios_annualized` a Sharpe of 0. A malformed string was
  dropped without a word. Now `returns[5] is null, not a finite number` (and `matrix[3][0]`,
  `other_sharpe_ratios_annualized[1]`) comes back as an error; numeric strings still read as
  numbers. The MCP tools already refused these through their input schemas; this closes the same
  gap for direct API calls.
- A matrix whose rows differ in length is refused, naming the row.
- The receipts of `overfitting` and `haircut-sharpe` name `js/moments-core.js`, and those of
  `reality-check` name `api/_lib/limits.js`, the code each now runs.

## 0.10.0 (2026-09-28)

- `validate_reality_check`: data-snooping tests on every variant a search tried. Hansen's SPA
  (2005) gives the chance that the best variant's studentized excess return is this good when no
  variant has an edge, with lower and upper bounds and its Monte Carlo error; White's Reality
  Check (2000) asks the same without studentizing; Romano and Wolf's StepM (2005) names the
  variants that beat the benchmark with the familywise error held at `alpha`. One seeded stationary
  bootstrap feeds all three, so a result reproduces exactly from its inputs. Send `matrix`, or
  `matrix_file` (read on your machine, then sent as numbers), and an optional `benchmark` series.
  Works in local mode and on the hosted endpoint, and is `POST /api/v1/validate/reality-check` on
  the API.
- Checked against independent implementations: on three fixed-seed cases the p-values agree with
  Python's `arch` 8.0 and with a numpy transcription of Hansen's formulas within Monte Carlo error,
  the SPA statistic to nine digits, and the StepM sets match `arch`'s. On pure noise, a 5% SPA
  rejects at most 10% of 200 searches in CI.
- A matrix cell that is not a number (JSON null, a string) is refused with its row and column,
  never read as zero.

## 0.9.1 (2026-09-28)

Breadth answers are exact where two were wrong without warning:

- `sleeves_required` is solved in closed form at any size. It searched only up to 500 sleeves, so a
  reachable target that needs more was called unreachable: a target of 50 from sleeves of Sharpe 1
  at correlation 0.0001 needs 3,333 sleeves, and now says so.
- A negative average correlation caps the sleeve count (`1 + (N - 1) * rho` must stay positive), so
  it caps the book Sharpe too. The result gives `max_sleeves` and the ceiling reached there
  (`ceiling_kind: "maximum"`): at -0.3, 4 sleeves of Sharpe 1 reach 6.32. It was reported as having
  no ceiling. `ceiling_kind` is `limit` for a positive correlation (approached, never reached) and
  `unbounded` only at zero. A sleeve count above `max_sleeves` is refused, naming the cap.
- The target note states the sleeve count it found.

The same code runs the API, local mode and the calculator at canlicapital.com/tools/breadth.

## 0.9.0 (2026-09-27)

- Server instructions: `initialize` carries a short, byte-stable paragraph on which tool to call
  first (clients such as Claude Code put it in the system prompt, which matters most when tool
  definitions are deferred). Also on the hosted endpoint.
- The tool list is 9% smaller (4,229 to 3,834 tokens, o200k, `bench/tool_list_tokens.py`): tool and
  parameter descriptions say the same in fewer words, and every tool keeps its boundary sentence
  and its "use this other tool instead" guidance.

## 0.8.2 (2026-09-27)

- Registry and client metadata: the MCP Registry entry now declares the hosted endpoint
  (`remotes`: streamable HTTP at https://canlicapital.com/mcp, with an optional secret
  Authorization header), a title, the documentation page, icons and the environment variables the
  package reads (`CANLI_KEY`, `CANLI_LOCAL`, `CANLI_API_BASE`). Its description names what the
  server checks. `initialize` returns the same title, website and icons in `serverInfo`, on stdio
  and on the hosted endpoint.
- npm keywords, so the package is found by `deflated-sharpe-ratio`, `cscv`, `backtesting` and the
  other terms people search for.

## 0.8.1 (2026-09-27)

Fixes from an outside audit, each with a test that fails without it:

- `audit_backtest` with `returns_file`: a blank or NaN cell in a column of numbers made the reader
  drop that column, and with one other numeric column left (a benchmark) it audited that one
  instead, reporting success. Such a column is now refused, naming its lines, and `source` gives
  `returns_column_position`. A file without a header whose first column is a date no longer loses
  its first row: a row is a header only when its cells differ in kind from the rows below.
- `verify_receipt` answers a malformed receipt with `valid: false`, `well_formed: false` and what
  is missing, instead of an internal error.
- Inline `matrix` and `variants` are capped at 200 variants per row, the API's quota, so a call
  can no longer exceed the stdio buffer and end the server; larger searches use `variants_file`.
- `validate_deflated_sharpe` and `validate_track_record` describe `skew` as their own field again
  (the luck-trials wording had overwritten it); a test fails on any duplicated description key.
- `company_financial_history`: when the ticker index cannot be reached, the error says to retry,
  check `service_status`, or pass the SEC CIK.

## 0.8.0 (2026-09-27)

- Built on the MCP SDK's v2 server package (`@modelcontextprotocol/server` 2.1.0) instead of
  `@modelcontextprotocol/sdk` 1.30: the installed dependency tree goes from about 95 packages to 4
  (Express, CORS, cross-spawn, ajv and the rest were never used by a stdio server). v1 and v2
  clients both connect (checked over stdio and Streamable HTTP).
- Every tool publishes an output schema. They are open (extra fields always pass) and terse; a
  test lists tools the way real clients do and fails on a missing or closed schema.
- Tool descriptions say when to use each validator and which sibling to use instead.
- The property-based tests are `test/properties.test.js`, so fuzzing detectors that scan `.js`
  files find them.

## 0.7.1 (2026-09-27)

- Hosted endpoint: when the shared anonymous key's daily quota is used up, a validation is still
  answered, computed by the same code on the hosted endpoint, with `computed: "hosted_without_receipt"`,
  no stored receipt, and a note on getting a free key or running locally with `CANLI_LOCAL=1`. A
  caller's own key, and every other refusal, is reported unchanged.
- stdio without `CANLI_KEY`: the first validation no longer comes back 401 for the model to work
  out that `get_key` comes first. The server issues the free key once, as `get_key` would, and
  retries once; if no key can be issued, the original refusal is reported.
- README: a first screen with the question the server answers, a three-line quick start and a
  worked example.

## 0.7.0 (2026-09-26)

- Toolsets: `CANLI_TOOLSETS` (stdio) or `?toolsets=` (hosted endpoint) lists only `validate`,
  `receipts`, `company` or `status` tools. The tool list is re-sent to the model every turn; listing
  only `company_financial_history` sends 8 percent of the full list's tokens (README, "Toolsets",
  reproduced by `bench/tool_list_tokens.py`). Default: every tool. An unknown name is refused.
- Citation metadata: `CITATION.cff` and `.zenodo.json` name the author with his ORCID
  (0009-0004-4138-7907), so each release of the standalone repository is archived with a DOI.

## 0.6.0 (2026-09-26)

- `validate_luck_trials` takes the returns' `autocorrelation` and corrects the Sharpe as Lo (2002)
  first. Measured on the Null Zoo: with autocorrelation 0.2 and none sent, a nominal 5 percent
  test rejected 20.0 percent of skill-less searches; with it corrected, 5.9 percent.
- `validate_luck_trials`: luck-equivalent trials, a new statistic. How many skill-less strategies a
  search would have had to try for its best to reach the observed Sharpe by luck (at even odds and at
  5 percent), and, with a trial count, the chance that it did. Built from the Student t null of the
  Sharpe's t-statistic and the Sidak best-of-N probability, calibrated by Monte Carlo in CI; the size
  study is published with its seeds. Too generous for negatively skewed returns, which the reading
  says when the skew is sent.
- Signed receipts: canlicapital.com signs every validation receipt with Ed25519 over the canonical
  JSON of its id, endpoint, input and output hashes and source-file hashes; the public key is at
  https://canlicapital.com/.well-known/canli-receipt-keys.json and bundled in this package.
  `verify_receipt` checks a receipt offline: its output against its output hash, its content
  against its id, and its signature against the bundled key.
- `validate_haircut_sharpe`: the haircut Sharpe ratio of Harvey and Liu (2015) for the number of
  tests run, by Bonferroni and for independent tests, and with the other tests' Sharpe ratios by Holm
  and BHY (`POST /api/v1/validate/haircut-sharpe`). Agrees with the authors' own `Haircut_SR.m` on
  every deterministic output, keeps a finite answer for strong Sharpe ratios where that code returns
  an infinite one, and uses a Student t checked against R.
- Compact validation results: the answer, the boundary sentences (without the quota line) and the
  receipt's id and URL. Metadata and source hashes stay in the stored receipt (`get_receipt`) and
  `service_status`; `CANLI_FULL_ENVELOPE=1` restores every field.
- The hosted endpoint answers validations with its own deployment's API handlers in process instead
  of a second HTTPS request to canlicapital.com: one network round trip and one function invocation
  fewer per validation, with the same keys, quotas and receipts.
- `validate_backtest_length`: the minimum backtest length (Bailey, Borwein, López de Prado and Zhu,
  2014) before the best of N independent trials is not expected to reach a target Sharpe by luck,
  and the most independent trials a backtest's years allow (`POST /api/v1/validate/backtest-length`).
  Reproduces the paper's statements exactly: the best of 10 trials at 1.57, at most 45 trials in 5
  years and 7 in 2.
- `audit_backtest`: deflated Sharpe, minimum track record length and, with every variant's returns,
  CSCV overfitting on one return series in one call. Each check is its validator's own result and
  receipt; the audit adds no grade. On a local server, `returns_file` and `variants_file` read the
  backtest's CSV or JSON output instead of numbers copied into the call.
- The minimum track record reading states the Sharpe to three decimals instead of every digit of a
  derived float.
- Every input parameter carries a description (units, defaults, allowed values, which fields
  exclude each other), and each tool description says what it returns. Measured with the agent
  benchmark before and after on gpt-5.4-mini and Claude Haiku 4.5: no loss of accuracy, for more
  tokens per task because the tool list is longer.

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
