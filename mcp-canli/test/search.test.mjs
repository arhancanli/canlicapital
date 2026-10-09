// find_tool across every pack: plain requests must find a right tool first, or at worst in the top
// three. Where two packs answer the same question, either tool counts.
import assert from "node:assert/strict";
import test from "node:test";

import { ENTRIES } from "../src/server.mjs";
import { buildIndex, search } from "../src/search.mjs";

const INDEX = buildIndex(ENTRIES);
const PACKS = ["quant", "validation", "fundamentals", "research", "backtest", "markets", "paper"];
const Q = [
  ["did my backtest overfit after trying 40 variants", ["validate_deflated_sharpe", "deflated_sharpe_ratio"]],
  ["probability of backtest overfitting cscv", ["validate_overfitting"]],
  ["data snooping test on all the variants i tried", ["validate_reality_check"]],
  ["how many years of track record do i need", ["validate_track_record"]],
  ["haircut sharpe harvey liu", ["validate_haircut_sharpe"]],
  ["audit my strategy returns", ["audit_backtest"]],
  ["does my signal look ahead", ["check_leakage"]],
  ["run my pipeline on noise placebo", ["placebo_test"]],
  ["will my strategy survive a crash bootstrap drawdown", ["strategy_stress_test"]],
  ["can my broker handle this many orders", ["check_feasibility"]],
  ["summarize this long price series", ["summarize_series"]],
  ["what had apple reported as of march 2019", ["known_as_of"]],
  ["restated revenue numbers", ["restatements"]],
  ["every filing behind one number revision history", ["vintages"]],
  ["find the cik for a company", ["find_company"]],
  ["net income for many companies on one date", ["cross_section"]],
  ["canli research papers on momentum", ["search_research"]],
  ["how many hypotheses have you tried", ["trial_ledger"]],
  ["live paper trading record", ["live_record"]],
  ["build a value factor from sec filings without lookahead", ["pit_factor"]],
  ["backtest my signal csv against prices", ["backtest_signal"]],
  ["my alpaca paper account balance", ["paper_account"]],
  ["rebalance my paper account to target weights", ["rebalance_to_weights"]],
  ["price a european call", ["black_scholes"]],
  ["value at risk of my portfolio", ["value_at_risk", "portfolio_var"]],
  ["detect bull and bear regimes", ["markov_regime_switching"]],
  ["which of the 399 sleeves work on my data", ["sleeve_tournament"]],
  ["triple barrier labels for machine learning", ["triple_barrier_labels"]],
  ["portfolio scenario stress test shocks", ["stress_test"]],
  ["bond yield to maturity", ["bond_yield"]],
  ["risk factors in nvidia's latest 10-k", ["read_filing"]],
  ["did any insiders sell tesla stock", ["insider_trades"]],
  ["what does berkshire hathaway own 13f", ["fund_holdings"]],
  ["10 year treasury yield today", ["treasury_yields", "economic_series"]],
  ["core inflation year over year", ["economic_series"]],
  ["daily stock prices for aapl", ["price_history"]],
  ["which companies mention tariffs in their filings", ["search_filings"]],
  ["list a company's 8-k filings", ["list_filings"]],
  ["what industry is a company in and when does its fiscal year end", ["company_profile"]],
  ["unemployment rate data", ["economic_series"]],
];

test("cross-pack requests: a right tool first in at least 36 of 40, in the top three in all 40", () => {
  let top1 = 0, top3 = 0;
  const misses = [];
  for (const [q, want] of Q) {
    const r = search(INDEX, q, { packs: PACKS, limit: 3 }).map((t) => t.name);
    if (want.includes(r[0])) top1++;
    if (r.some((n) => want.includes(n))) top3++; else misses.push(`${q} -> ${r.join(", ")}`);
  }
  console.log(JSON.stringify({ top1, top3, misses }));
  assert.ok(top1 >= 36 && top3 === Q.length, JSON.stringify({ top1, top3, misses }));
});
