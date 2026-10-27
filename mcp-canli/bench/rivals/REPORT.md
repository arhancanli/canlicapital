# canli-mcp against other finance MCP servers (interim, 2026-10-09)

Same model (gpt-5.4-mini), system prompt, 12-turn limit, 30,000-character cap on each tool result
and scoring for every arm; only the MCP servers differ. Answers are computed from primary sources
by `truth.py` (SEC EDGAR, Treasury, FRED, Yahoo Finance chart data), independently of every server
compared. Each question ran twice per arm. No API keys for any server: this is the out-of-the-box
setup.

Arms: **canli** = canli-mcp as it stood before the benchmark; **canli-after** and **canli-final** =
the same server after fixes the benchmark prompted (see "Caveats"); **openbb** = openbb-mcp-server
2.0.1 with openbb 5.0.0 (tool-discovery mode, since its 1,056 tools exceed OpenAI's 128-tool limit);
**edgartools** = edgartools 5.61.1 (its MCP server); **yahoo** = Alex2Yang97/yahoo-finance-mcp
b9c1765 (the most-starred Yahoo Finance server); **edgartools+yahoo** = both together. Versions are
pinned in `~/canli-bench-rivals/*-frozen.txt`.

## Caveats, read first

1. **We wrote the 24 questions**, in eight categories our servers were built for (filings, fundamentals,
   insiders, 13F, rates and macro, prices, analytics). The rivals' other strengths are not scored:
   news, options chains and analyst ratings (Yahoo), XBRL statement comparisons (EdgarTools), and
   OpenBB's hundreds of keyed data sources.
2. **canli-after and canli-final were tuned on these same questions.** The fixes are general (a
   rounding bug, search inside filings, references between calls, named yields, total return), but
   their scores here are optimistic. The fair comparison with rivals is the untuned **canli** arm. A
   held-out set of 24 new questions (`tasks_fresh.json`, written after the fixes and never used for
   tuning) is queued to test the final version.
3. **The API account ran out of credit mid-run.** OpenBB completed 14 of 24 questions, EdgarTools and
   EdgarTools+Yahoo 20. Runs that failed for lack of credit are excluded, not scored as wrong
   (`harness-errors.jsonl`). The remaining runs are queued (`nightly.sh`) within OpenAI's free daily
   data-sharing allowance.
4. One model, two runs per question: read differences of a question or two as noise. The sign tests
   below count questions, not runs.
5. Fairness checks made: the 10-year-yield tolerance was widened to accept a market close (5.231)
   instead of Treasury's official 5.22; EdgarTools' wrong filing answers were checked to come from
   its responses (they do not contain the figures), not from the 30,000-character cap; an early
   EdgarTools crash was my shared-environment error and was fixed before any scored run.

## Results so far

Model gpt-5.4-mini; 24 questions; runs per question per arm: 2.

Questions each arm completed (both runs): canli-after 24, edgartools 20, edgartools+yahoo 20, canli-final 24, yahoo 24, canli 24, openbb 14. All arms completed 14.

Accuracy on the questions every arm completed:

| arm | correct |
|---|---|
| canli-after | 23/28 (82%) |
| edgartools | 11/28 (39%) |
| edgartools+yahoo | 15/28 (54%) |
| canli-final | 26/28 (93%) |
| yahoo | 14/28 (50%) |
| canli | 22/28 (79%) |
| openbb | 11/28 (39%) |

All completed runs per arm:

| arm | correct | filings | fundamentals | insiders | 13F | rates_macro | prices | analytics | median input tokens | median seconds | tool errors per run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canli-after | **40/48** (83%) | 6/6 | 5/6 | 5/6 | 5/6 | 6/8 | 6/6 | 7/10 | 8,688 | 4.5 | 0.54 |
| edgartools | **11/41** (27%) | 0/6 | 5/6 | 2/6 | 4/6 | 0/8 | 0/6 | 0/3 | 18,558 | 9.9 | 0.00 |
| edgartools+yahoo | **19/41** (46%) | 1/6 | 6/6 | 2/6 | 4/6 | 2/8 | 4/6 | 0/3 | 21,186 | 10.4 | 0.00 |
| canli-final | **44/48** (92%) | 6/6 | 6/6 | 5/6 | 6/6 | 6/8 | 5/6 | 10/10 | 7,578 | 4.6 | 0.31 |
| yahoo | **18/48** (38%) | 2/6 | 6/6 | 2/6 | 2/6 | 2/8 | 4/6 | 0/10 | 10,335 | 3.5 | 0.00 |
| canli | **38/48** (79%) | 5/6 | 3/6 | 6/6 | 4/6 | 8/8 | 6/6 | 6/10 | 11,782 | 5.3 | 0.69 |
| openbb | **11/28** (39%) | 0/6 | 6/6 | 3/6 | 2/6 | 0/4 | 0/0 | 0/0 | 107,112 | 24.4 | 1.64 |

Paired by question (a question counts for the arm with more correct runs on it; two-sided exact sign test):

- canli-after vs edgartools: canli-after better on 14 questions, worse on 1, p = 0.000977
- canli-after vs edgartools+yahoo: canli-after better on 11 questions, worse on 2, p = 0.0225
- canli-after vs yahoo: canli-after better on 14 questions, worse on 2, p = 0.00418
- canli-after vs openbb: canli-after better on 8 questions, worse on 2, p = 0.109
- canli-final vs edgartools: canli-final better on 16 questions, worse on 1, p = 0.000275
- canli-final vs edgartools+yahoo: canli-final better on 12 questions, worse on 2, p = 0.0129
- canli-final vs yahoo: canli-final better on 15 questions, worse on 2, p = 0.00235
- canli-final vs openbb: canli-final better on 9 questions, worse on 1, p = 0.0215
- canli vs edgartools: canli better on 14 questions, worse on 3, p = 0.0127
- canli vs edgartools+yahoo: canli better on 11 questions, worse on 4, p = 0.118
- canli vs yahoo: canli better on 14 questions, worse on 5, p = 0.0636
- canli vs openbb: canli better on 9 questions, worse on 4, p = 0.267

| question | canli-after | edgartools | edgartools+yahoo | canli-final | yahoo | canli | openbb |
|---|---|---|---|---|---|---|---|
| filing_employees | 2/2 | 0/2 | 0/2 | 2/2 | 2/2 | 1/2 | 0/2 |
| filing_deliveries | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 |
| filing_shares_out | 2/2 | 0/2 | 1/2 | 2/2 | 0/2 | 2/2 | 0/2 |
| fund_revenue | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 1/2 | 2/2 |
| fund_net_income | 1/2 | 1/2 | 2/2 | 2/2 | 2/2 | 1/2 | 2/2 |
| fund_eps | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 1/2 | 2/2 |
| insider_cfo_sale | 1/2 | 2/2 | 2/2 | 1/2 | 2/2 | 2/2 | 2/2 |
| insider_nvda_q3 | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | 1/2 |
| insider_apple_count | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 |
| 13f_brk_apple | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 | 2/2 |
| 13f_brk_total | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 | 2/2 | 0/2 |
| 13f_bw_entries | 1/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 |
| rates_10y | 2/2 | 0/2 | 2/2 | 1/2 | 2/2 | 2/2 | 0/2 |
| rates_2s10s | 0/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | 0/2 |
| macro_cpi | 2/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | - |
| macro_unrate | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | - |
| price_close | 2/2 | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 | - |
| price_total_return | 2/2 | 0/2 | 0/2 | 1/2 | 1/2 | 2/2 | - |
| price_mdd | 2/2 | 0/2 | 2/2 | 2/2 | 1/2 | 2/2 | - |
| analytics_vol | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 2/2 | - |
| analytics_corr | 1/2 | 0/1 | 0/1 | 2/2 | 0/2 | 0/2 | - |
| analytics_beta | 0/2 | - | - | 2/2 | 0/2 | 0/2 | - |
| analytics_sharpe | 2/2 | - | - | 2/2 | 0/2 | 2/2 | - |
| quant_bs | 2/2 | - | - | 2/2 | 0/2 | 2/2 | - |

## Context each server costs before the model asks anything

`context.py` (no model called) starts every server with the benchmark's commands, reads its
instructions and its whole tool list, and counts them in o200k_base tokens in the shape an
OpenAI-style client sends tools. Measured 2026-10-10 (`context-2026-10-10.json`):

| server | tools sent | tokens on every request | seconds to start and list |
|---|---|---|---|
| canli-mcp | 3 (in front of 285) | 859 | 0.13 |
| OpenBB, all tools | 1,056 | 432,001 | 30.7 |
| OpenBB, tool discovery (as benchmarked) | 14 | 2,171 | 26.8 |
| EdgarTools | 13 | 3,801 | 1.6 |
| Yahoo Finance MCP | 9 | 2,205 | 1.4 |


## Held-out and frontier runs on DeepSeek (planned 2026-10-23, before any run)

The OpenAI account had no credit, so the held-out set (`tasks_fresh.json`, 24 questions written after
the fixes and never used for tuning) and the frontier set (`tasks_frontier.json`, 10 questions) run
on `deepseek-flash` (DeepSeek-V4.1-Flash-1017, thinking off, temperature 0) through DeepSeek's
OpenAI-compatible API, with everything else as above. Arms: **canli-0.6.0** (the flagship as
published on npm, installed unchanged), openbb, edgartools, yahoo and edgartools+yahoo, one run per
question per arm first, a second run if the budget allows. Results go to `results-deepseek.jsonl`
and are reported whatever they show; the 2026-10-09 truths and prompt date stay unchanged.

### Results on DeepSeek (2026-10-23, one run per question per arm)

| arm | held-out (24) | frontier (10) | mean input tokens, held-out | mean input tokens, frontier |
|---|---|---|---|---|
| canli-0.6.0 (npm) | 23 | 5 | 17,569 | 76,789 |
| canli-dev (branch mcp/flagship-proof-20261023 at 4c05bb51) | 23 | 9 | 18,552 | 51,991 |
| edgartools | 11 | 6 | 46,210 | 240,471 |
| yahoo | 14 | 5 | 64,330 | 390,774 |
| edgartools+yahoo | 16 | 0 of 6 run (budget) | 126,666 | 477,914 |
| openbb | 16 | 1 | 183,574 | 332,607 |

Read with care: one run per question; the held-out set was written after the 10-09 fixes and before
these runs. **The frontier gain of canli-dev is partly tuned**: three frontier questions (count of
$1 trillion balance sheets, highest R&D intensity, highest revenue growth) failed for 0.6.0 because
`screen_companies` ranked calendar years, and the `fiscal_year_end` window was added after seeing
them. A first run of canli-dev (results-deepseek-dev-run1.jsonl: held-out 21, frontier 4) exposed a
regression, the model calling `run_tool` with `find_tool` as the tool name; it was fixed (c425c9a4)
before this run. A new frontier set, written before any run, is the next fair test.

### Second frontier set (2026-10-24, questions and answers committed in a4256089 before any run)

Eight questions with answers from SEC frames, company concepts and submissions, EDGAR full-text
search and Treasury (`truth_frontier2.py`), one run per arm on deepseek-flash:

| arm | correct | mean input tokens |
|---|---|---|
| canli-dev (the branch as of 4c05bb51) | 7 | 44,112 |
| edgartools | 6 | 227,235 |
| canli-0.6.0 | 5 | 46,286 |
| yahoo | 4 | 242,416 |
| openbb | 3 | 245,139 |

canli-dev's miss was the capex count: `screen_companies` read one capital-spending tag, so Amazon
(which reports productive assets) was missing; it was fixed after this run (15b9a6a0), so that
question is tuned from here. Exxon Mobil, which moved its ticker to a new holding company in 2026, is
not listed under its old filer in SEC's exchange file, a stated limit of the screen.
