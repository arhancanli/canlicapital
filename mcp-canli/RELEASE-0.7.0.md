# Releasing canli-mcp 0.7.0 (branch mcp/flagship-proof-20261023)

The branch changes four packages. Release them in dependency order, each from main after the merge,
following the fewer-and-bigger rule: one release of each.

1. **canli-markets-mcp 0.6.0**: `latest_filings`, `filing_diff`, `news`, `explain_move`,
   `portfolio_xray`, `comps`, `debt_profile`, `ownership_breadth`, `forensic_scores`, `funding_rates`, the screen's `fiscal_year_end` window and capex under both tags,
   statement scales, event-study day 0, `seriesFilings`/`loadNport` exported; plus #484 and #497 if
   merged. Bump `package.json`, `server.json`, CHANGELOG heading; `npm test`; `node bench/live/run.mjs`
   (all PASS; news may be refused for a minute after heavy use: GDELT's limit).
2. **canli-fundamentals-mcp 0.7.0**: `history` latest by default, other version, `change_pct`,
   `concepts`, `covers`, the `as_of` note; same-name filers named. The test files pin
   `src/server.mjs`'s SHA-256: update every pin after the last edit.
3. **canli-backtest-mcp 0.2.0**: the breadth lab, `price_panel`, annotation. Depends on
   canli-markets-mcp `^0.6.0` (it imports `funds.mjs`, `sources.mjs`, `tools.mjs` and `verify.mjs`)
   and canli-fundamentals-mcp `^0.7.0`.
4. **canli-mcp 0.7.0**: pin the three new versions, `npm run build-index`, then
   - add prompts for the new tools (what changed in a 10-K, why a stock moved, portfolio X-ray, comps,
     check an AI answer with people, train a breadth book); `test/prompts.test.mjs` checks each call
     against the published schemas, which is why they wait for this step;
   - refresh FEATURES.md's counts and the context measurement (`bench/context.py`): with the front
     tools the initial list is about 2,260 o200k tokens (1,076 for 0.6.0; 1,216 with
     `CANLI_FRONT=""`);
   - `node bench/robustness.mjs` for every pack (the branch's dev build: 0 findings in fundamentals,
     backtest and markets, 2026-10-24);
   - the hosted pin and the deploy (see the canlicapital production-source notes).

Speed, through the dev flagship on an idle machine (2026-10-24, no AI): history 129 ms cold and
10 ms warm, four measures in one call 144 ms, verify_claims 0.5 s, latest_filings 0.4 s,
explain_move 0.6 s (without news), filing_diff 1.2 s, financial_statements 1.4 s, portfolio_xray
1.5 s, screen_companies 3.7 s, comps 5.8 s.

Dependencies: zod < 4.6.6 has a high advisory (memory exhaustion on oversized constrained
collections). mcp/ moves to 4.6.7 in #501 (with the execution-guide re-pin); markets, backtest and
canli-mcp are on 4.6.7 in this branch. canli-fundamentals-mcp freezes its whole lockfile and the
zod version in its supply-chain package tests (`ORIGINAL_LOCK` and the dependency assertions in the
`*-package.test.mjs` files): bump it there deliberately at release, with those pins. Quant, research
and paper-trading also need a 4.6.7 release, or `npm audit` on an installed canli-mcp stays high.

Evidence for the release notes: `bench/filingfacts/HELDOUT.md` (rounds 1-6) and
`bench/rivals/REPORT.md` (DeepSeek runs, with the tuned-question caveats).
