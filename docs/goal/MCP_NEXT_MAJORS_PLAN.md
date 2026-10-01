# Canli MCP family: plan for the next major releases

Plan dated 2026-09-28, read-only research. None of this is built yet. Figures come from the three researcher and reviewer passes of 2026-09-28 or from the repository at `/Users/arhancanli/cc-xs-20260928`, unless marked **estimate**. Token figures use the tokenizer they were measured with: o200k for validation, cl100k for fundamentals and research. Foundation task 0c makes the family report a single unit.

Every server follows the owner's release rule (CONTRIBUTING.md, PR #332). Feature PRs add entries under `## Unreleased`. Each release is one substantial version with one npm publish, one registry entry and one GitHub release. Only a fix for an answer that was wrong without warning may ship as a patch. Versions already shipped stay as they are.

---

## 1. What each server is for after its next major

**canli-validation-mcp** checks two things about a backtest: whether it was built honestly, and what it is worth after trading. It compares the returns with the positions and prices that supposedly produced them. It prices the trading and counts every variant the agent tried in a session. It then gives one test result whose false-alarm rate has been measured on the kind of returns sent, with a receipt that anyone can check.

**canli-fundamentals-mcp** is the free point-in-time SEC data layer for equity factor research:
- every periodic filer, including the ones that died;
- what each number was on any date;
- standard statements and published factors built only from filings known on that date;
- a check of the fundamentals an agent's own backtest used.

**canli-research-mcp** is the check an agent runs before testing any quant idea. It says whether Canli already tried the idea and why it died, what the published record says, and whether the data can be had for free. It lists the known pitfalls that apply and returns a hash of the spec, which the agent then registers with validation.

---

## 0. Before any major (about 3.5 days)

**0a. The hosted endpoints must serve released code only.** `api/mcp.js` imports `../mcp/src/server.mjs`, and `api/mcp-fundamentals.js` and `api/mcp-research.js` import their packages' `src/server.mjs` the same way. Under the Unreleased rule, every merged feature PR therefore reaches hosted users at the next deploy, weeks before the npm release. That breaks the hosted/npm parity the family promises (plan rank 7).
- **Fix:** put new surface behind a preview toolset that only a preview deployment enables, or have the hosted handlers import the released package version. Pick whichever keeps the git-less Vercel build passing.
- **Check:** a CI test asserts that hosted `tools/list` equals the last released npm package's `tools/list` byte for byte, on all three servers.
- **Effort:** about 1 day (estimate).

**0b. Patch fundamentals 0.5.1, which the patch rule allows.** Quarterly mode is one quarter stale for about three months a year at every 10-K filer, and says nothing. `known_as_of` AAPL, periods quarterly, as_of 2025-11-15 returns revenue for the quarter ending 2025-06-28 with `stale=false`, although the FY2025 10-K was filed 2025-10-31.
- **Patch:** set `stale=true`, with the reason that fiscal Q4 is filed only inside the annual report. Derived quarters come in the major.
- **Check:** the AAPL case returns `stale=true`, and a property test passes over the KR, COST and AAPL fixtures.
- **Effort:** about 0.5 day (estimate).

**0c. Shared foundations** (about 2 days, estimate):
- **One token bench for all three servers.** Extend `mcp/bench/tool_list_tokens.py` to report cl100k and o200k, and fail CI when a list grows past the last release.
- **One canonical-JSON (RFC 8785) plus sha256 module** for the spec hashes (research preflight, validation `research_session`) and the data-audit digests. Independent check: byte equality with Python `rfc8785` on 50 fuzzed inputs.
- **A written digest contract, `canli.data-audit/1`:** server, version, reference or snapshot hash, verdict counts and sha256. Whichever server ships first, the other conforms to it.
- **One shared list of pitfall IDs,** used by research's pitfall catalogue and validation's `fix_next`.

---


> **Amendment 2026-09-28 (build):** the family already has one canonical JSON, `scripts/canonical-json.mjs` (Python `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=True)`, with a differential test), and receipts use it through `api/_lib/canonical.js`. Step 0c therefore reuses it instead of adding RFC 8785: two digest conventions for the same content could never agree. Step 0a is PR #334 (hosted serves `mcp-released/`), and the family token bench is `scripts/bench/mcp-tool-tokens.py`.

## 2. The next major for each server

These rules apply to all three releases:
- The MCP inspector exits 0 in both the legacy and the modern protocol era, on stdio and hosted.
- Every tool is exercised by a real client after `tools/list`, and output schemas stay open.
- Every test runner asserts its pass count, so a nested `node --test` that runs nothing fails.
- Every number in the README, CHANGELOG and registry text is generated by a bench and audited with `grep -F`.
- The CHANGELOG shows measured before and after figures, failures included.
- Hosted `tools/list` equals npm's (0a).
- Commits are signed, merges are squash-only, and no AI credit appears in commits, changelogs or READMEs.
- Long calibration runs are started detached (`nohup … & disown` with log markers), never from the session.

### 2.1 canli-validation-mcp 1.0 (from 0.10.1)

**Tool list:** 15 tools today, measured at 4,194 o200k with `mcp/bench/tool_list_tokens.py`. After the release there are 14:
- **Removed:** `get_receipt`, folded into `verify_receipt`, and `company_financial_history`, which moves out of the default list.
- **Hidden:** `get_key`, which is listed only when no key is configured.
- **Added:** `research_session` and `check_leakage`.

Everything else extends existing tools.

**Build order**

**1. Pay for the new tools first.**
- **Job:** keep the tool list from growing.
- **Change:**
  - fold `get_receipt` into `verify_receipt`, which already fetches by id;
  - take `company_financial_history` out of the default toolset, since fundamentals does this better and point in time (decision 7);
  - list `get_key` only when no key is configured;
  - fix the stale README sentence "It is not signed" (mcp/README.md:321-322).
- **Check:** token bench before and after; the existing agent-benchmark tasks are unchanged.
- **Effort:** about 1 day (estimate).

**2. A calibrated audit result (V3, revised).**
- **Job:** one test whose false-alarm rate is measured on autocorrelated, skewed and fat-tailed returns. Today, in Null Zoo v0, DSR read at 0.95 finds a real Sharpe-2 strategy 9.0% of the time, and luck trials call AR(1) noise skilled 20.0% of the time.
- **Change** (to `audit_backtest`; no new tool):
  - **Headline test:** a studentized stationary-bootstrap SPA when variants are sent. It already ships in `validate_reality_check` and was checked against `arch` in PR #329. Otherwise, luck trials with the Lo correction and non-normal SE. Fixed seed.
  - **Added outputs:** a 90/95% bootstrap Sharpe CI, the haircut Sharpe, MinBTL, lag-1 autocorrelation and the Lo factor.
  - **Result object:** `{test, level, p, measured_size_link, sentence}`. The sentence is worded as "a test at level α whose measured size on this return shape is X", never "real" or "fake".
  - **DSR** stays, labelled as an estimate.
  - **Derived inputs:** when variants are sent, the trials, effective trials and cross-trial SD are computed from them, and the declared fields become optional. `mcp/src/schemas.mjs:235-236` requires them today.
- **Check:**
  - Null Zoo v1: the 8 v0 families plus a block-cluster correlated family, at least 10,000 searches per cell. At that size the standard error of a size of 5% is about 0.0022, from √(0.05·0.95/10,000). Seeds are published.
  - The perfect-detector ceiling is computed, and the bar pre-registered, before the run.
  - The bootstrap CI matches `arch` StationaryBootstrap within Monte Carlo error on 3 fixed-seed cases.
  - The Lo/HAC t matches statsmodels Newey-West to 1e-8.
- **Effort:** about 5 days, plus detached compute.

**3. The audit computes what it can and returns `fix_next`.**
- **Job:** an agent sends what it has and gets every check those inputs allow, plus what to fix next. Today it has to type numbers the server could compute.
- **Change:** `audit_backtest` runs every check whose inputs are present:
  - variants give counted and effective trials, SD, SPA and PBO;
  - dates give the by-year view (the date column is used, not discarded);
  - positions and prices trigger item 6;
  - prefix files trigger item 8.

  It returns `fix_next`, at most 5 items, each naming the failed check, the concrete change and the next call.
- **Check:** every remediation is pinned by a test to the check that triggers it, and every `fix_next` id is in the shared pitfall list.
- **Effort:** about 2 days (estimate).

**4. Out-of-sample decay (V7, reduced).**
- **Job:** answer "what should I expect live", not only "is this overfit".
- **Change:**
  - `validate_overfitting` and the audit's overfitting step add `oos {median, p10, p90, prob_below_zero}` and `degradation {slope, intercept, r2}` from `is_oos_pairs`, which `pboCscv` already computes (js/pbo-core.js:106-110);
  - an optional `embargo_blocks` parameter;
  - CSCV runs in a worker thread on stdio above a size threshold.
  - There is no CPCV and no purge: the server never trains a model, so there are no labels to purge.
- **Check:**
  - `rn_pairs` is identical to CRAN `pbo`.
  - Slope, intercept and r2 match an unrounded `lm` on `rn_pairs` in the same R run to 1e-9 (CRAN rounds its own figures).
  - `below_threshold` matches exactly.
  - The Null Zoo OOS median of the selected variant is within 2 MC SE of 0 on every null family.
- **Effort:** about 2 days.

**5. Research sessions that count trials (V1, revised).**
- **Job:** an agent that tried 200 variants can no longer declare 5.
- **Change:** new tool `research_session {action: open | log | status | close}`.
  - `open` registers a hypothesis by hash only, the `spec_sha256` that research's preflight returns, with success criteria and a trial budget. It returns a signed registration receipt.
  - `log` takes a batch of variant summaries or a `variants_file` in one call, for one quota unit.
  - Every validator and `audit_backtest` take an optional `session_id` and deflate by max(declared, counted). When a matrix is sent in one call, the effective count comes from meff. Each result reports the raw count and any shortfall.
  - **Hosted:** Supabase rows private to the key, never readable by receipt id, with no return arrays.
  - **Local:** a hash-chained JSONL file. It is unsigned, and results say it is the user's own notebook.
  - Reuse the `glassbox.trial-ledger/2` schema in js/trial-accounting-core.js.
- **Data:** the caller's own results. One migration and a SECURITY DEFINER RPC on Supabase `bpnensyowfmdwhqmfdrg` (decision 6).
- **Check:**
  - A caller who declares 5 trials after 20 logged gets 20, with a shortfall flag.
  - Byte, dropped-row and reordered-row tampering all fail `verify_receipt`, naming the sequence number.
  - meff matches CRAN `poolr::meff` (nyholt, liji) to 1e-9 on 5 fixtures.
  - Size with meff on the block-cluster zoo family is in [0.03, 0.07].
  - The same session replayed locally and hosted gives identical counts and digests.
- **Limit, stated in the result:** it counts only what is sent, and a new session or key resets it. Anonymous hosted callers share one key (the `resolveKey` fallback in api/mcp.js), so key-lifetime counts mean nothing for them.
- **Effort:** about 8 days.

**6. Positions × prices: reconciliation, costs, fills and capacity (V4, with V2's timing mode merged in).**
- **Job:** learn whether the claimed returns come from the claimed trades, and what the strategy is worth after trading.
- **Inputs** (added to `audit_backtest`; local-first):
  - optional `positions_file` (date, asset, weight or quantity);
  - `prices_file` (date, asset, OHLCV);
  - `trades_file` (time, asset, side, qty, price, fee);
  - `aum`;
  - a declared timing convention (decide at close t, fill at open t+1).
- **Output:**
  - A reconciliation of rebuilt gross returns against claimed returns. A match only under same-bar fills is named as lookahead, with the rows.
  - Turnover and holding period.
  - A net Sharpe/DSR cost ladder and break-even bps.
  - Fill violations with rows: outside low-high, before the signal, or with the wrong fee sign.
  - The EDGE spread per asset.
  - Impact and capacity as a table over a named coefficient range, never a single point.
- **Hosted limits:** 1 MiB and 20,000 observations (api/_lib/limits.js), so realistic panels are local-only, and the schema says so.
- **New code, not reuse:** js/execution-core.js is a single-asset SMA demo on synthetic bars.
- **Data:** prices supplied by the user only, because config/data_source_rights_policy.json forbids redistributing vendor bars.
- **Check:**
  - An independent pandas recompute matches reconciliation, turnover and net PnL to 1e-12.
  - EDGE matches the authors' MIT-licensed `bidask` to 1e-9.
  - Break-even is within 0.1 bp of a numpy grid.
  - A planted 50-trade fixture: 20 of 20 defects flagged, and 0 flags on the clean fixture.
  - Property tests: net Sharpe never rises with cost, and capacity falls as the coefficient rises.
- **Effort:** about 10-12 days.

**7. Survivorship red flag from the caller's panel.**
- **Job:** catch an equity universe built from today's index members.
- **Change:** part of item 6's prices path. It reports each asset's first and last bar, and flags zero deaths over a multi-year equity window or membership that never changes. `fix_next` points to fundamentals (link E). The result says it cannot tell a biased universe from one that simply had no deaths.
- **Check:** planted panels with and without deaths are classified 100% correctly, with 0 flags on a panel with realistic delistings.
- **Effort:** about 1 day (estimate).

**8. `check_leakage`, prefix mode (new tool).**
- **Job:** prove a signal does not look ahead, without sharing code.
- **Change:**
  - **Two steps:** the server issues the cut points; the agent reruns its own signal on each prefix and sends the columns.
  - **Output:** the first differing timestamp per prefix, the share of rows that differ, the warm-up for recursive indicators such as EWM, and a receipt.
  - **Local-only for multi-asset:** a 50 × 2,520 × 3 table is about 378k numbers.
- **Check:**
  - A pandas planted-leak zoo with 10 leak types and 10 honest indicators.
  - Agreement with freqtrade `lookahead-analysis` on shared strategies. freqtrade is GPL-3, so it is used only as a CI oracle and never shipped.
- **Limit, stated in the result:** a pass does not prove there is no leak. An agent can fabricate the columns, and survivorship and vendor revisions leave no trace here.
- **Effort:** about 3-4 days.

**9. Pipeline placebo (an action of `check_leakage`).**
- **Job:** catch uncounted trials, leaks and hidden choices at once, by running the agent's whole search on data with no edge.
- **Change:**
  - `placebo_make` returns K seeded surrogate price files built locally from the user's prices: sign-randomized or block-shuffled returns, re-integrated to prices. The seed is committed before the files are released. Without prices, it uses the existing generator in selection-risk-core.js.
  - `placebo_score` takes the best Sharpe found on each placebo and returns an empirical p-value, the expected-maximum reference from the MinBTL core, and a receipt.
  - The result states the agent's cost: K = 20-100 reruns of its own search.
- **Check:**
  - On honest planted pipelines, the placebo bests match the expected maximum of N within MC error.
  - The p-value's size is in [0.03, 0.07] on the zoo families.
  - Detection of planted leaky pipelines is compared with a pre-computed ceiling.
- **Effort:** about 3 days (estimate), plus detached calibration compute.

**10. Stability by year, and factors the user supplies (V8, reduced).**
- **Job:** tell whether the edge is one lucky period, or beta or momentum.
- **Change** (to `audit_backtest`):
  - From dates: Sharpe by year, the share of positive years, and a sup-F or CUSUM break test.
  - An optional benchmark series, with regime thresholds from trailing volatility over an expanding window.
  - An optional `factors_file` supplied by the caller gives the HAC alpha t-stat and the betas.
  - No factor data is bundled or fetched. The result says factor models mean little outside US equities.
- **Check:**
  - sup-F/CUSUM against statsmodels or R `strucchange`.
  - HAC alpha and betas against statsmodels to 1e-8 on 3 fixtures.
  - Three planted strategies classified correctly: Mkt-RF plus noise gives beta near 1 and an insignificant alpha; UMD plus noise gives R² ≥ 0.8 and no alpha beyond momentum; pure alpha gives a significant alpha.
  - By-year Sharpe against pandas.
- **Effort:** about 3-4 days.

**Validation 1.0 release bar (all must hold)**

- **Calibration**, pre-registered for Null Zoo v1:
  - The headline test's size is at most 0.06 at a nominal 0.05 on every null family. In v0, luck trials reach 0.200 on AR(1) and 0.088 on negative skew.
  - Power is at least 0.45 on iid normal returns, true Sharpe 2, 504 days, 20 trials, on each headline path. In v0, luck trials reach 0.533 and DSR at 0.95 reaches 0.090.
  - The bar is fixed only after the ceiling shows it can be reached. A family that cannot reach it is published as a failure; the bar is never softened quietly.
- **Independent agreement in CI:**
  - SPA/RC/StepM and the bootstrap CI match `arch` within MC error on 3 of 3 cases.
  - The Lo/HAC t matches statsmodels to 1e-8.
  - CSCV matches CRAN `pbo` and an unrounded `lm` as in item 4.
  - meff matches `poolr` to 1e-9.
  - EDGE matches `bidask` to 1e-9.
  - Reconciliation matches pandas to 1e-12, and break-even is within 0.1 bp.
  - sup-F matches statsmodels or strucchange.
  - Prefix verdicts agree with freqtrade on the shared strategies.
- **Planted defects:**
  - 20 of 20 fill defects flagged, with 0 flags on the clean fixture.
  - Same-bar fills are named as lookahead by row on 100% of planted cases.
  - The prefix mode flags 10 of 10 leak types, and 0 of 10 honest indicators after warm-up.
  - The placebo's size lies in [0.03, 0.07].
  - The survivorship flag is 100% correct on planted panels.
- **Trial accounting:**
  - Declared 5 after 20 logged returns 20.
  - A 200-variant log is one call and one quota unit.
  - 100% of tamper cases fail, naming the sequence number.
  - Local and hosted replays are identical.
- **Agent benchmark** (mcp/bench/agent, 3 runs per task, gpt-5.4-mini and one Claude model):
  - Every existing task stays at or above its 0.10.1 accuracy and right-first-call rate.
  - The new tasks reach at least 90% correct with the right first call: "you already tried 40 variants", "is there lookahead", "does it survive costs", "run the placebo".
  - Tokens per correct answer on existing tasks are no worse than in 0.10.1.
- **Tokens:** the full tool list (o200k, all toolsets) is at or below 0.10.1's value on the same script (4,194 today). A returns-only audit result grows by at most 120 tokens.
- **Speed:**
  - A local 2,520-day × 50-asset audit takes at most 1.5 s.
  - A stdio ping answers in at most 100 ms during a 2400×200 CSCV.
  - A hosted session log adds at most 60 ms of server time.
- **No regressions:**
  - The DSR worked example, MinTRL, MinBTL, the haircut against Haircut_SR.m, and PBO against CRAN all stay at their current tolerances.
  - 80+ fuzz cases cause 0 crashes.
  - File readers still refuse nulls and misaligned dates by row.
- **Honesty and privacy:**
  - The boundary sentence names what the new checks cannot see.
  - The CHANGELOG carries a before-and-after Null Zoo table, and migration notes cover the removed tools.
  - A test proves hosted session rows contain no return arrays.
  - A network-deny test proves local mode sends nothing.

### 2.2 canli-fundamentals-mcp, next major (from 0.5.0)

**Tool list:** 7 tools at 2,011 cl100k (name, description and input schema; measured 2026-09-28). After the release: 8, adding `audit_inputs`. The bar is 2,600 cl100k or less. Factor definitions go in a resource, which costs nothing per turn.

**Build order**

**1. Complete quarters and TTM (F2, revised).**
- **Job:** quarterly and trailing-twelve-month figures as they could have been computed on the date. Today fiscal Q4 is missing for every flow. Apple since 2020 has 21 quarterly revenue periods, and only 1 of them ends in September. Operating cash flow has 6 quarterly periods, all fiscal Q1.
- **Change:**
  - The `periods` enum gains `ttm`.
  - `quarterly` includes derived Q2-Q4 for every duration flow: revenue, net income, operating income, gross profit, operating cash flow, capex and the item-7 inputs.
  - Each derived row has `derived:true`, both input accessions, and `filed` set to the later input's date. A 53-week year gets a 14-week label.
  - A derived value exists only when both inputs were filed by as_of, pairing the vintages known then.
  - Per-share and weighted-share concepts are never derived; they return null with a reason. Semiannual filers return a reason.
- **Check:**
  - An independent Python derivation over SEC FSDS `num.txt` (qtrs 1-4): 30 companies × 8 quarters × 4 flows, including KR, COST and one IFRS filer.
  - TTM equals FY at fiscal year end.
  - A derived quarter equals the reported value where one exists.
  - Mutation: deriving from the latest vintages must fail the point-in-time test.
- **Bar:** AAPL quarterly as_of 2025-11-15 returns revenue for 2025-06-29..2025-09-27, derived, filed 2025-10-31, with both accessions. It agrees 100% exactly (integer USD) with FSDS wherever the inputs exist.
- **Effort:** about 4.5 days.

**2. Complete the universe (a missing idea from the review).**
- **Job:** screens and survivorship checks that are not tilted toward survivors. The reference holds 12,753 of the 20,390 entities in the SEC companyfacts bulk archive (2026-09-19). A fixed-seed sample (seed 20260928, 1,500 of 7,637) estimates about 4,370 missing periodic filers, ±190 at 95%. Of the sampled missing filers, 64% last filed before 2025, against 51% in a sample of the reference.
- **Change:**
  - The release pipeline builds hash-checked records for every bulk-archive entity with periodic us-gaap or ifrs facts. This is separate from site page admission, so their pages can stay unindexed (decision 12).
  - An `equity_issuer` flag. Build only from the tracked set.
- **Data:** the SEC bulk archive, already cached locally. SEC fair access allows 10 requests a second with a declared User-Agent, and bulk files are preferred.
- **Check:**
  - On 6 dates, at least 99% of the CIKs that FSDS `sub.txt` shows filing a 10-K, 10-Q, 20-F or 40-F in the prior 15 months are present, and every gap is listed.
  - The issuer flag is hand-checked on 200 random filers.
- **Effort:** about 3.5 days.

**3. One company lifecycle table (F5, revised).**
- **Job:** resolve dead or renamed companies, and know a filer's status and industry on a date.
- **Change:** a table built in the release pipeline and read by both `find_company` and item 4:
  - periodic-filing dates from the catalog;
  - Form 15 and Form 25 dates from submissions;
  - former names with dates;
  - `sic_on_as_of` from FSDS `sub.txt`, because applying today's SIC to old dates is lookahead;
  - `tickers_seen` from `dei:TradingSymbol`, with coverage measured by year.

  `find_company` gains an optional `as_of`, the match levels `former_name` and `former_ticker`, and returns every holder of a reused ticker. Status fields are opt-in outside `find_company`.
- **Data:** SEC bulk `submissions.zip`, FSDS, and FS&N for TradingSymbol. Measure the FS&N download before choosing it over about 190k per-filing cover fetches (about 5.3 h at 10 requests a second).
- **Check:**
  - TWTR resolves to CIK 1418091 as `former_ticker`, with dates equal to EDGAR's Form 25/15 filings.
  - 50 companies removed from the S&P 500 resolve correctly. The public changes table is used only to pick the test set.
  - SIC matches FSDS per filing.
  - Former names match EDGAR on 200 of 200.
  - Self-resolution stays at 0 wrong companies.
- **Effort:** about 4-5 days (estimate).

**4. Full-universe point-in-time cross-sections (F1, revised).**
- **Job:** one measure for every filer active on a date, ranked or bucketed, in one call. This is the input to every factor rebalance.
- **Change** (to `cross_section`):
  - `companies` becomes optional.
  - `universe {filer_status: active_on_as_of (the default, with equity_issuer) | all, sic_prefix, min_public_float_usd}`.
  - `rank {order, top ≤ 200}` and `stats` (count, missing count, breakpoints).
  - Full rows go to a hash-named file (stdio) or URL (hosted), each with a sha256.
  - Every answer names the panel hash and the universe count.
  - Before 2012-01-01, answers carry a phase-in note: only 1,452 reference companies had an admitted periodic filing by the end of 2010, and 6,737 by the end of 2011.
  - Panels are built per plain measure name and period kind in the release pipeline, and stored hash-named in catalog storage, not in the deploy (which has a 15,000-file cap).
  - Arbitrary XBRL tags still go company by company, and the tool says so.
  - `EntityPublicFloat` can be 15-18 months old, and the tool says so.
- **Check:**
  - 100% equality with the per-company path for 5 measures on 6 dates.
  - At least 99.5% exact agreement with an independent Python FSDS selector that imports no JS, with every mismatch classified.
  - TWTR is present on 2021-06-30 and absent on 2023-06-30.
  - Mutation: removing `filed <= as_of` fails the suite.
- **Bar:**
  - Local warm answer in at most 300 ms.
  - Hosted p95 of at most 2 s with a cold panel cache, measured as server time.
  - Default result of at most 12k characters.
  - A panel size budget frozen after the prototype.
- **Effort:** about 10.5 days.

**5. Data-quality flags (F7, trimmed).**
- **Job:** see and exclude suspect values, so one mis-scaled small cap does not top a ranking.
- **Change:** flags computed in the panel build:
  - cross-tag conflict within one plain name in one filing (measure its rate first);
  - scale (about 1000× off and later corrected);
  - sign;
  - amended;
  - `scope_review`;
  - `ytd_derived`;
  - `multi_class_shares`.

  The identity check runs only when every component is tagged. The `q` column is omitted when no row is flagged. `cross_section` gains `exclude_flags`.
- **Check:**
  - Each flag fires on a planted positive and not on its clean twin, and CI fails if a check is disabled.
  - Precision is at least 90% on 200 flagged values labelled by two reviewers (the Pillar 3 workflow).
  - The 102,134-period SEC cross-check stays at 0 differences.
- **Effort:** about 3.5 days.

**6. Standard statements point in time (a missing idea from the review).**
- **Job:** the most common request, an income statement, balance sheet or cash-flow statement as known on a date, in one call.
- **Change:** `known_as_of` gains `statement: income | balance | cash_flow`. It returns 15-25 lines from a versioned map shared with item 7, each with value, tag and accession. Identity checks run when the components are tagged: A = L + E, and CFO + CFI + CFF + FX = change in cash.
- **Check:**
  - Identity pass rates are published.
  - At least 99.5% exact agreement with an FSDS recompute.
  - 20 statements hand-checked against the 10-K.
- **Tokens:** about +25.
- **Effort:** about 4 days.

**7. Published factors point in time (F3, trimmed).**
- **Job:** a factor by name, for one company or the whole universe on a date, with its components, input accessions and a versioned definition.
- **Change:** the measure vocabulary gains:
  - `f_score`, returning its 9 signals;
  - `gross_profitability` (Novy-Marx 2013);
  - `asset_growth` (Cooper, Gulen and Schill 2008);
  - `accruals_cf` (Hribar and Collins 2002 cash-flow accruals, not Sloan);
  - `book_equity`;
  - `net_share_issuance`, which is null with a reason for multi-class filers. Companyfacts drops dimensional facts, so Alphabet has 0 `dei:EntityCommonStockSharesOutstanding` facts.
  - `altman_z_book`, which is null for financial firms.

  The factors are built as vintage series in the pipeline, so `cross_section` reads them like any other measure. Definitions live in a versioned resource. Beneish M is not included.
- **Check:**
  - An independent Python implementation, written from the papers by a different author or agent who does not read the JS, over 200 stratified company-dates (banks, IFRS filers, 52/53-week filers, split companies).
  - `f_score` agrees signal by signal on 100%, and continuous factors within 1e-9 relative.
  - 20 hand-computed company-years match exactly.
  - 0 inputs are zero-filled.
  - Coverage per factor per date is published by the bench.
- **Competition:** Multyply Labs' paid connector already offers Piotroski F, Altman Z and Beneish M at $0.005-0.25 a call (Glama listing, read 2026-09-28). Valuein includes Piotroski F in its $49/month full-universe plan. Our edge is that the factors are free, keyless and point in time at the vintage level, with their inputs and a published independent agreement.
- **Effort:** about 8 days.

**8. `audit_inputs` (F4, revised; it also absorbs validation's V6).**
- **Job:** check that the fundamentals a backtest used could have been known on the dates it used them, and that its universe did not drop companies that later died.
- **Change:** new tool `audit_inputs`.
  - **Inputs:** `rows`, at most 2,000 inline, or `rows_file` in local mode only, of [company, measure, period_end, value, used_on]; optional `universe {as_of, companies}`; `value_tolerance_pct`.
  - **Timing check:** `lookahead` compares used_on with the first filed date and reports how many days early. It needs no value.
  - **Value checks,** run only when a value matches some SEC vintage: `restated_value_used`, `scale_mismatch`, `period_mismatch`, and `split_units`. A split re-denomination is a unit convention, not lookahead: restated EPS of 2.98 with adjusted prices gives the same P/E as the filed 11.91 with unadjusted prices.
  - `value_not_found` is stated as "not found is not the same as wrong".
  - **Universe check:** the count of active filers left out, split by whether they later stopped filing.
  - **Also returned:** the detection power of a sample. 200 random rows catch a 2% lookahead rate with probability 1 − 0.98^200, about 98%. Plus a `canli.data-audit/1` digest.
  - Inline rows are output tokens the model must write (2,000 rows is about 30k), so the tool is designed around samples, and full audits run locally.
- **Check:**
  - A planted corpus built from FSDS by the independent selector: 1,000 clean rows; 100 lookahead, 100 restated, 50 scale and 50 period defects; split cases; and 30 companies planted as dropped.
  - Disabling each check drops its class recall to 0.
  - It runs through a real client that lists tools first.
- **Bar:**
  - 100% recall per class and 0 false positives on the clean rows.
  - 30 of 30 dropped companies found.
  - The digest is byte-stable across platforms.
  - Validation's `audit_backtest` signs the digest into its receipt.
- **Effort:** about 5.5 days.

**9. A point-in-time dataset that backtest code reads directly (a missing idea from the review).**
- **Job:** backtests run in code, so give that code a free, hash-checked dataset.
- **Change:**
  - Each release publishes the item-4 panels, the item-7 factor series and the lifecycle table as Parquet at hash-named paths, with a manifest (sha256, rows, schema, build commit, reference hash). The files are extracted from the tracked build set only.
  - An MCP resource returns the manifest and a short pandas/DuckDB loader that uses `merge_asof` on known dates.
  - One prompt, `factor_study`, runs link A.
  - None of this costs tool-list tokens.
- **Check:** DuckDB over the Parquet reproduces `cross_section` 100% on 6 dates × 5 measures, and the loader refuses a tampered file (mutation test).
- **Effort:** about 3 days. The licence is decision 14.

**Fundamentals release bar (all must hold)**

- **No regression:** the 102,134-period SEC cross-check, the 80-case `known_as_of` recompute and the 6,020 property checks stay at 0 differences, and the KR, COST, TM and AAPL-2010 fixtures pass.
- **Quarterly:**
  - The AAPL 2025-11-15 case above passes.
  - Every Apple fiscal quarter from FY2020 Q1 has discrete revenue, net income, operating cash flow and capex, with the count generated by the bench.
  - A property test shows no per-share or weighted-share value is ever derived by subtraction.
- **Point in time:** 0 violations across panels, derived quarters, factors, statements and audit verdicts. Removing any one `filed <= as_of` gate fails CI.
- **Universe:**
  - At least 99% FSDS coverage on 2012-06-30, 2015-06-30, 2018-06-30, 2021-06-30, 2024-06-30 and 2026-06-30, with every gap listed.
  - A phase-in note before 2012.
  - TWTR resolves as `former_ticker`, and is in the active universe on 2021-06-30 and absent on 2023-06-30.
  - The bench publishes the count of active companies with no current ticker; it is never typed by hand.
- **Agreement:**
  - Panels are 100% equal to the per-company path and at least 99.5% exactly equal to FSDS, with 0 unexplained mismatches.
  - Factors and statements meet the bars of items 6 and 7.
  - Flags reach at least 90% precision.
  - `audit_inputs` has 100% recall and 0 false positives.
  - DuckDB reproduces the dataset 100%.
- **Speed and size:**
  - Local warm cross-section in at most 300 ms.
  - Hosted p95 of at most 2 s, cold, as server time.
  - Default results of at most 12k characters.
  - Warm heap at or under 60 MB.
- **Tokens:** the 8-tool list is at most 2,600 cl100k, generated in CI.
- **Claims:** any comparison with named competitors (Multyply, valuein, cyanheads, edgartools) is measured on named measures.

### 2.3 canli-research-mcp, next major (source 0.2.0; npm latest is still 0.1.0)

**Tool list:** 6 tools, recorded at 659 tokens for 0.2.0. Re-measure that figure in the family bench before relying on it. After the release: 7, adding `preflight`. The bar is 1,100 cl100k or less.

The package rule stays: read only published static files, write nothing. The tool returns a hash the agent can register; it registers nothing itself.

**Build order**

**1. Trial lookup (R1, revised).**
- **Job:** answer "was this tried, and why did it die?" before spending compute.
- **Change:**
  - `trial_ledger` gains `query`, `hypothesis_key`, `family`, `verdict` and `limit`.
  - Called with no arguments, it keeps every 0.2.0 field (a shape contract test, not a byte test) and explains the 228 against 349 wording.
  - Rows come in two kinds, identity and named kill. The 46 named kills are strategies, not identities, so they are joined only where an explicit link exists.
  - Each Sharpe carries its basis: "annualized, observed, first record" or "net of cost, gauntlet".
  - Null stays null. Across the 350 packets, Sharpe is null on 9, skew on 71 and kurtosis on 78.
  - A row returns the packet URL and its size, never the packet inline: `66d48edd39ac6709.json` is 5,879,500 bytes, over the 4 MiB fetch cap.
- **Data:** the site generator builds `/api/v1/trials/identities.json`, targeted under 1 MB and measured, from:
  - `trial-packets/index.json` (228 legacy identities);
  - `forward_index.json` (121 forward identities);
  - `kill_log.json` and the family files.

  It lives under `/api/v1`, not `public/glassbox`, which the hourly deploy rsync `--delete`s, and it must pass the git-less build.
- **Check:**
  - An independent Python rebuild from the raw glassbox files is row-equal after a canonical sort.
  - A mutation that drops one identity fails.
  - 30 paraphrased queries are frozen before tuning.
- **Bar:**
  - The number of retrievable keys equals `distinct_hypothesis_identities` at build time (349 today, derived, not typed).
  - 46 of 46 named kills return a reason, a Sharpe and its basis.
  - At least 27 of 30 paraphrases put the right record in the top 3.
  - A limit-10 result is at most 1,500 tokens.
- **Effort:** about 4.5 days.

**2. Full-text section search (R2, revised).**
- **Job:** find the right paper and section from a plain question. Confirmed failures on 0.2.0: "reversals" returns 0 results, and "funding rate carry" ranks the FX carry paper first. Some summaries do not describe their papers at all.
- **Change:**
  - `search_research` becomes BM25 over the `##` and `###` sections of the 114 papers (563,533 bytes).
  - It adds Porter stemming and a reviewed table of about 100 synonym pairs.
  - New filters: topic, kind and year_from.
  - Each row carries the best heading and a snippet of at most 160 characters.
  - Trial identities are searchable as `kind=trial`, from item 1's file, so there is one index.
- **Check:**
  - A 60-query labelled set (20 held out) is written before the code.
  - 0.2.0 is measured on it first, as the control.
  - Parity with `rank_bm25`, fed the same pre-stemmed tokens, gives a top-10 overlap of at least 0.9.
  - The stemmer is tested separately against a frozen word list.
- **Bar:**
  - Held-out recall@5 of at least 0.9, and strictly above 0.2.0's.
  - A zero-result rate of at most 5%.
  - 100% of returned headings resolve through `get_paper`.
  - Warm p50 of at most 10 ms.
  - A limit-10 result of at most 2,500 characters.
- **Effort:** about 3.5 days.

**3. A catalogue of pitfalls from Canli's own incidents.**
- **Job:** stop agents repeating silent backtest errors that Canli has already hit and written up.
- **Change:** a generator-built file of 20-30 failure classes. Each has:
  - a trigger rule on spec fields;
  - the check to run, a validation call where one exists (IDs shared with `fix_next`);
  - the Canli paper that documents it, for example corporate-action-basis-reconstruction, alphavintage-missing-release-correction, sharadar-hdb-zero-dividend-quarantine, crypto-lab-carry-crash-incident or legacy-dsr-restatement;
  - a literature DOI where one exists.

  It is served inside `preflight` and as a resource.
- **Check:** each rule fires on its planted spec and not on a clean spec (a mutation test per rule), and 100% of the cited slugs resolve.
- **Effort:** about 2-3 days (estimate).

**4. `preflight` (new tool; absorbs R5 and the read-only half of R4).**
- **Job:** one read-only call before testing any quant idea.
- **Change:** `preflight {idea, spec?, limit?}` returns:
  - `canli_trials` (item 1) and `canli_papers` (item 2);
  - `literature`;
  - `data_feasibility`, from atlas_reachability_screen.json (20 families, 13 of them "vendor only"), data_gate_unblocks.json (18 families) and the 12 feasibility protocols;
  - `pitfalls`.

  With a spec, it also returns `missing_sections` against the 11 required packet sections, and `spec_sha256` (RFC 8785, computed locally; nothing is sent and nothing is stored). Its next step says: "register this hash with canli-validation research_session".
- **Literature layer:**
  - Without a licence answer, it holds the 65 distinct DOIs Canli's papers already cite, resolved through Crossref at build time, plus links to OSAP.
  - With the authors' consent (decision 20), it adds OSAP's bibliographic facts and derived statistics per predictor, each with its source file and release date. That adds about 3 days.
- **Check:**
  - Feasibility rows equal their source JSON.
  - The hash matches Python `rfc8785` on 50 fuzzed specs.
  - A request capture shows 0 bytes of the spec leave the process.
  - The paraphrase ceiling is measured on a training split before the literature bar is frozen.
- **Bar:** results of at most 2,000 tokens at the default limit, and at most 150 tool-list tokens, measured.
- **Effort:** about 5 days, plus 3 for the licensed layer.

**5. `get_paper` views: `data` and `kit`.**
- **Job:**
  - `data` serves the measured tables behind validation's choice of method, for example which correction holds its level on AR(1) returns.
  - `kit` gives everything needed to rerun a result, and says what is missing.
- **Change:** `view: text | data | kit`, as one enum.
  - `data` returns the machine-readable results a paper binds to, as columns and rows: Null Zoo v0 now, v1 once validation releases.
  - `kit` returns the section checklist (present or missing), the bound files with hashes, the expected numbers, the tolerance and whether it was pre-registered, the replay history, and the reproduce.py level to run.
  - Completeness comes from the union of both packet indexes. 124 of the 350 per-key packets are marked complete, but that means accounting-complete, not rerunnable. A packet is never called reproducible unless a replay file says exact.
- **Check:**
  - The Null Zoo rerun from published seeds is byte-equal, and the rows equal the file.
  - Every kit sha256 matches the bytes the CDN serves.
  - Completeness labels equal the index union for every identity.
  - The AlphaVintage portable rerun (tolerance 5e-5) runs as a recorded pre-release job with a published log, not as a CI gate on every build.
- **Effort:** about 4.5 days (1.5 estimated for `data`, 3 for `kit`).

**6. `validate_args` bridge (R3, revised; blocked on the exporter and decision 22).**
- **Job:** judge a Canli result with validation in one step, using the honest search size.
- **Change:**
  - Single-identity `trial_ledger` results carry `validate_args`, using validation's exact field names: `effective_independent_trials`, `cross_trial_sharpe_sd_annualized`, `non_excess_kurtosis` and `periods_per_year`.
  - Raw N and the luck-equivalent effective N are reported separately.
  - The block is null with a reason when periodicity, skew or kurtosis is missing.
  - One sentence says Canli's N does not apply to the caller's own strategy.
- **Precondition:** the ALPHAC exporter publishes `periods_per_year` and `sharpe_per_period` per identity, and recomputes V[SR] on one stated periodicity. Today, of the 117 packets that publish `sharpe_per_period`, 95 imply 365 periods a year and 22 imply 252; about 230 packets publish none.
- **Check:**
  - 100% of `validate_args` parse with validation's own zod schema.
  - The DSR from 20 identities matches an independent scipy implementation within 1e-9.
  - The kurtosis convention is pinned on a known series.
- **Effort:** about 3 days, plus the exporter change.

**7. Integrity that verifies something (R6, revised, plus a research state root).**
- **Job:** answer "was this changed after publication?" with a check, not a URL.
- **Change:**
  - `chain_head {artifact?, date?, seq?}` verifies the hash links, the Ed25519 signatures and the disclosed payload hashes (from seq 436 onward) over a segmented, append-only log. The full log is 12,938,683 bytes, over the 4 MiB cap.
  - Every result gains `as_of` and `age_days`.
  - `content_hash` is labelled a self-consistency check only.
  - **State root:** the ALPHAC exporter and the site generator add `research_root` to each daily payload. It is a Merkle root over every paper, kill_log.json, both packet indexes and every per-key packet, and the leaf lists are published. `chain_head` then returns inclusion proofs.
  - Fix `research.json`'s document_count, which says 111 while the index holds 114.
- **Check:**
  - The server and a separate PyNaCl/hashlib script agree on 100% of entries.
  - 100% of tamper fixtures are caught.
  - One paper and one packet each verify by inclusion proof.
- **Effort:** about 5-6 days (estimate). It needs decision 23.

**8. Prompts and completable resources (R8).**
- **Job:** an agent runs the whole sequence without being told the order. This closes plan rank 6.
- **Change:** prompts `test_an_idea` and `judge_a_result`; resource templates `research://paper/{slug}` and `research://trial/{label}`, with completion. Build it last.
- **Check:**
  - The inspector passes in both eras.
  - Completion covers 114 of 114 slugs and all identity labels.
  - Prompt bytes are pinned.
  - One model transcript is run by hand before release, not in CI.
- **Effort:** about 1.5 days.

**Research release bar (all must hold)**

- **Distribution:**
  - npm latest equals this version, with SLSA provenance.
  - The registry's latest equals `server.json`.
  - stdio and hosted `tools/list` are byte-equal.
  - The CHANGELOG includes the 0.2.0 changes, if 0.2.0 is not published first.
- **Compatibility:** every 0.2.0 argument is still accepted, and every 0.2.0 output field is still present, pinned by shape contract tests.
- **Items 1-8** meet their bars above. Every validator used for them shares no code with the server.
- **Limits:**
  - Every file the server can fetch is at most 4 MiB, checked in CI over every path it can request.
  - No result exceeds its documented cap.
  - A cold `npx` start from the registry takes under 2 s.
  - `completion/complete` never returns -32601.
- **Tokens:** 7 tools at or under 1,100 cl100k, and CI fails above that.

---

## 3. Links between servers

Each link below is a call sequence an agent would run. Each has a test that proves the two sides fit.

**A. A factor study, end to end** (fundamentals, then the agent's code, then validation)
1. `fundamentals.cross_section {measure: "f_score", as_of, universe: {filer_status: "active_on_as_of"}, rank: {order: "desc", top: 100}}` for each rebalance date. For many dates, the agent loads the Parquet dataset through the resource loader instead.
2. The agent's own code builds portfolios using its own prices.
3. `fundamentals.audit_inputs {rows_file}` locally, or a 200-row sample hosted. It returns verdict counts and a `canli.data-audit/1` digest.
4. `validation.research_session {action: "open", hypothesis_sha256, criteria, budget}`, then `{action: "log", variants_file}`.
5. `validation.audit_backtest {returns_file, variants_file, positions_file, prices_file, session_id, data_audit}`. It returns the calibrated result, the reconciliation, costs, `fix_next`, and a receipt covering both the data audit and the statistics.
6. `validation.verify_receipt`.

**Link test:** a digest produced by fundamentals is accepted and signed by validation, and changing one byte of it fails `verify_receipt`. The `factor_study` prompt runs this sequence.

**B. Before testing an idea** (research, then validation)
1. `research.preflight {idea, spec}` returns trials, papers, literature, data feasibility, pitfalls, missing sections and `spec_sha256`.
2. `research.trial_ledger {hypothesis_key}` for any match, then `research.get_paper {slug, section}` to read why it died.
3. `validation.research_session {action: "open", hypothesis_sha256: <spec_sha256 from step 1>}`.

**Link test:** both servers use the shared RFC 8785 module, and on 50 fuzzed specs the hash research returns equals the one validation registers. Python `rfc8785` is the independent check.

**C. Judging a published Canli result** (research, then validation)
1. `research.trial_ledger {hypothesis_key}` returns `validate_args`.
2. `validation.validate_deflated_sharpe(validate_args)`.

**Link test:** every `validate_args` parses with validation's zod schema, and the DSR matches scipy within 1e-9. This only works after the exporter change (decision 22).

**D. Choosing a correction that holds its level** (validation, then research)
1. `validation.audit_backtest` returns a result with `measured_size_link`.
2. `research.get_paper {slug: "null-zoo-v1", view: "data"}` returns the size and power table for the matching return shape.

**Link test:** the size quoted in the validation result equals the matching row in the research table.

**E. Checking a universe for survivorship** (validation, then fundamentals)
1. `validation.audit_backtest {prices_file}` flags zero deaths, and `fix_next` names fundamentals.
2. `fundamentals.cross_section {universe: {filer_status: "active_on_as_of"}, as_of}`, or `find_company {as_of}`, for status.
3. `fundamentals.audit_inputs {universe: {as_of, companies}}` counts the active filers the list left out that later stopped filing.

**Link test:** a planted universe with 30 dropped dead filers is flagged by validation and counted 30 of 30 by fundamentals.

**F. Pitfalls and fixes share IDs** (research and validation). Every `fix_next` item carries a pitfall ID that resolves through `research.preflight` or `get_paper` to the Canli paper documenting it.

**Link test:** a CI check in both repositories over the shared ID list confirms that every ID resolves and every pitfall with a validation check names it.

**G. Before trading** (links to the separate trading design, workflow wf_c7e77c9f-e37). An order-capable tool should read validation's break-even bps, net cost ladder and capacity table before sizing. It is out of scope here, but item 6 in 2.1 is what makes it possible.

---

## 4. Order of work and effort

Proposed order: foundations and patches, then validation, then fundamentals, then research.
- **Validation first:** it is the live, hosted flagship. Its calibration (Null Zoo v1) and `research_session` are what research's preflight and fundamentals' digest point into.
- **Fundamentals second:** its digest then lands in a validation that already accepts `canli.data-audit/1`.
- **Research third:** npm is blocked on the Trusted Publisher anyway. Its best views (Null Zoo v1 data, "register with validation") need validation's release, and items 6 and 7 wait on ALPHAC exporter decisions.

| Step | Work | Effort, solo working days |
|---|---|---|
| 0 | Hosted serves released code; fundamentals 0.5.1 stale-Q4 patch; shared bench, hash module, digest contract, pitfall IDs | ~3.5 |
| 1 | validation 1.0, items 1-10 | ~40 |
| 2 | fundamentals major, items 1-9 | ~46-47 |
| 3 | research major, items 1-8 | ~33 (30 without the licensed literature layer) |
| | **Total** | **~120-125, about 24-25 working weeks** |

The total leaves out agent-benchmark runs, detached zoo compute and release mechanics. Treat it as a lower bound: the reviewers already raised several researcher estimates, including V1 from 6 to 8 days, V4 from 7 to 10-12, and F1 from 8 to 10.5.

**If time is short, a lean path of about 84 days:**
- **Validation (about 26.5 days):** ship items 1-7, with item 6 dropping EDGE and the impact/capacity table (saves about 3-4 days, estimate). Move items 8-10 (`check_leakage` prefix, the placebo and year-by-year stability) to the following major. That also keeps `check_leakage` off the tool list.
- **Fundamentals (about 36.5 days):** ship items 1-4, 7 and 8. Cut in this order: the Parquet dataset (item 9, which needs a licence decision anyway), then the flags (item 5; keep the scale and sign flags the panel build produces), then statements (item 6).
- **Research (about 17 days):** ship items 1-4 (preflight with cited DOIs only) and item 8. Move items 5-7 to the following major.

**Never cut:**
- step 0;
- F2, which fixes a live wrong answer;
- V3, since every other check reports through it;
- V1, which closes the declare-5-after-200 hole;
- the complete universe plus F1, which is what fundamentals is for;
- R1 plus preflight, which is what research is for.

---

## 5. Decisions only the owner can make

**Family**
1. **Build validation first, then fundamentals, then research?**
   - Yes: the order above.
   - No, fundamentals first: the biggest data gap closes about 40 days sooner, but validation's `data_audit` acceptance must be built in that window.
2. **Make the hosted endpoints serve only released code (0a)?**
   - Yes: about 1 day of work, and hosted stays equal to npm through a build of 40 days or more.
   - No: hosted users see half-built features for weeks.
3. **Approve API spend for the agent benchmark: 3 runs per task, gpt-5.4-mini plus one Claude model, per release?** The cost will be estimated from the 0.10.1 bench's token counts before you approve. If no, the release bars' agent sections cannot be measured.

**Validation**

4. **May `audit_backtest` give a headline test result with one sentence?** This reverses "The audit does not grade the strategy" (server.mjs:376).
   - Yes: agents get one line to quote, worded as a test with its measured size.
   - No: the p-value, CI and size ship without a sentence.
5. **May hosted validations be linked to a key hash and a session,** storing per-trial Sharpe and moments (never returns), private to the key, never readable by receipt id, with a retention period you set?
   - Yes: hosted trial counting works.
   - No: sessions are local-only notebooks with no third-party value.
6. **Approve the Supabase migration and SECURITY DEFINER RPC on `bpnensyowfmdwhqmfdrg`, and the hosted deploy?** The cost is estimated at $0 on the current tier; this is not measured.
7. **Call it 1.0.0, and remove `get_receipt` and `company_financial_history` outright?**
   - Yes: clean, but breaking for anyone calling them.
   - No (recommended): keep them callable outside the default list for one major, with the token savings still realized for default clients.
8. **Make local mode the default for keyless first use?**
   - Yes: no 401, key issuance and retry on the first call (estimated at 0.9-3.3 s), `get_key` leaves the list, and receipts become opt-in.
   - No: keep issuing the key in the background.
9. **Take factors only from files the user supplies, with no Ken French data hosted or fetched?**
   - Yes (recommended): no licence question.
   - No: a licence review against `config/data_source_rights_policy.json` is needed first.
10. **Publish Null Zoo v1 and the placebo calibration under your name before the release?**
    - Yes: the change to the headline has public evidence.
    - No: only the CHANGELOG table.
11. **For the following major: anchor receipts with OpenTimestamps through the existing glassbox pipeline (no Sigstore Rekor until sigstore/rekor #2993 is answered), and offer forward-record commit/reveal?** Both keep hosted state and make a public trust claim, and the anchoring cron needs a missed-day alarm.

**Fundamentals**

12. **Serve fundamentals for the estimated ~4,370 periodic filers outside the site's admitted set, and the 15 withheld companies (with a `scope_review` flag), without admitting their pages?**
    - Yes: the universe is not tilted toward survivors.
    - No: F1 and `audit_inputs` must state that dead filers are under-represented.
13. **Keep no price source for now, so value factors come only from the caller's own prices?** Every free source found has terms risk: Yahoo's ToS, and Stooq's terms are unclear. If no, you pick a source to review.
14. **Publish the point-in-time dataset under CC BY 4.0 (or CC0), and mirror it on Hugging Face or Kaggle?** The storage and bandwidth cost per release will be measured from the prototype. If no, item 9 is cut.
15. **Promise in SECURITY.md and the README that rows sent to hosted `audit_inputs` are never logged or stored?** If no, hosted mode cannot be recommended for private data.
16. **May the README comparisons name paid competitors and their prices (Multyply Labs, valuein)?** If no, comparisons name only free tools.
17. **Accept a fundamentals release of about 46 days,** rather than taking the lean path of about 36.5 days?

**Research**

18. **Set up the npm Trusted Publisher for canli-research-mcp now, and publish 0.2.0 straight away?** 0.2.0 fixes a silent wrong answer (`get_paper` with a section returned 25 of 5,019 characters with `truncated:false`), so the patch rule allows it. If no, npm users keep 0.1.0 (SDK v1, output schemas on 0 of 6 tools, 95 packages) until the major.
19. **Number the research major 1.0.0,** rather than 0.3.0?
20. **Write to Chen and Zimmermann (Open Source Asset Pricing) for consent to ship derived statistics per predictor?** OSAP states no data licence, and its returns are built from CRSP.
    - Yes, if they agree: about 3 days for the literature layer.
    - No: cited DOIs and links only.
21. **Keep JKP Global Factor Data excluded?** It is CC BY-NC 4.0, and other use needs prior consent. Yes is recommended while the company plans commercial use.
22. **Publish `periods_per_year` and `sharpe_per_period` for every identity, and recompute the published V[SR] on one periodicity?**
    - Yes: `validate_args` becomes possible, but the DSR benchmark figures already on the site will move.
    - No: item 6 is cut.
23. **Add `research_root` to the signed transparency-log payload?** This is a new schema version, touches the ALPHAC exporter and extends what the signing key is used for.
    - Yes: papers and packets become tamper-evident.
    - No: integrity claims stay limited to the track record.
24. **Reconcile the live-record length upstream?** record.json says 5 observations, while track_record.json has 43 live points. This is needed before any comparison of live and research results.
25. **Skip build-time harvesting from OpenAlex and arXiv for now?** Yes is recommended: it avoids terms and rate-limit work (arXiv allows 1 request every 3 s).

---

## 6. Proposed and cut, with the reason

**Validation**
- **V6, a point-in-time fundamentals check inside validation:** it duplicates fundamentals' `audit_inputs` (item 8 there), and its headline example was a split unit convention, not lookahead.
- **V9, specification robustness with a joint p-value:** the server cannot re-run specifications, so the "joint test" would just be RC/SPA again, and a curated set looks robust. Revisit later as a descriptive block over counted session trials.
- **V5, public anchoring of receipts:** deferred to the following major, because it is worth little before V1 sessions exist. Rekor has no acceptable-use policy (#2993 is still open).
- **V2 timing mode (circular-shift placebo):** it tests for timing skill, not leakage, and false-alarms on real short-horizon signals. Replaced by V4's reconciliation.
- **V7's CPCV with purge, and matching skfolio's folds:** the server never trains a model, so there are no labels to purge, and matching the folds would prove nothing.
- **V8 volatility-tercile regimes, a Chow test at a data-chosen date, and bundled Ken French data:** the first selects on the outcome, the second is snooping, and the third is a licence risk.
- **Ljung-Box plus lags 2-5 in V3:** costs tokens without changing any decision.
- **Forward-record notarization (commit and reveal):** moved to the following major, after V1 and anchoring.

**Fundamentals**
- **F6, a filings/events tool:** moved to the following major and built on F5's submissions ingest. Accepted timestamps alone are standard elsewhere.
- **Nightly incremental refresh:** moved to the following major; it needs an owner decision on where it runs.
- **F8, insider Form 4 data:** moved to the following major. It is standard among competitors (pipeworx is free and keyless), and our only edge would be point-in-time factor aggregates.
- **F9, 10-K section text:** cut. Parsing is fragile, it would fetch from sec.gov at request time, others already extract sections, and its citation was unverified.
- **F10, 13F ownership:** cut until you decide on CUSIP handling (CUSIP Global Services asserts rights).
- **Beneish M in F3:** cut. Its inputs are sparse for small filers, and it is a fraud screen, not a return factor.
- **F7's same-filing conflict flag:** it fired 0 times in 192,347 keys, so it was replaced with a cross-tag conflict flag.
- **F7's identity flag on every row:** kept only where every component is tagged, to avoid false positives.

**Research**
- **R4, pre-registration as a writing tool in research:** it would put the first stateful write in a read-only server and start a second chain. It moves to validation's `research_session`; research keeps only the local hash and checklist.
- **R5 as its own tool:** folded into `preflight` to keep the tool list small.
- **R9, live record against research record:** the two published sources disagree on the length of the live record (5 against 43). Revisit when it reaches 252 observations.
- **R6's claim that an artifact was "not changed":** a hash declared inside the file itself proves only self-consistency. It stays labelled that way until the state root exists.
- **R3 as first specified (N=349 passed as `effective_independent_trials`):** the field names were wrong, and a raw count was labelled as an effective one. Reworked as item 6.
- **Embedding-based semantic search:** deferred. It needs a model at query time or a paid embedding API.
- **JKP factor data:** excluded under CC BY-NC 4.0.
- **Sigstore Rekor as an anchor:** excluded until #2993 gets an acceptable-use answer.
