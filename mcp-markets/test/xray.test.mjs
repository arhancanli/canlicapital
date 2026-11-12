// portfolio_xray on IVV's replayed N-PORT: SPY looked through IVV, a stock held directly merged with
// the funds' position in it, overlap and concentration.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import { issuerKey, portfolioXray } from "../src/xray.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });

test("issuers match across funds and stocks by name", () => {
  assert.equal(issuerKey("Apple Inc"), issuerKey("Apple Inc."));
  assert.equal(issuerKey("NVIDIA CORP"), issuerKey("NVIDIA Corp"));
  assert.equal(issuerKey("Alphabet Inc Class A"), issuerKey("Alphabet Inc"));
  assert.equal(issuerKey("JPMORGAN CHASE & CO"), "jpmorgan chase and");
});

test("SPY opened through IVV, a direct stock merged with the funds' holding of it", async () => {
  const r = await portfolioXray(session(), { holdings: [{ symbol: "SPY", weight: 30 }, { symbol: "IVV", weight: 60 }, { symbol: "AAPL", weight: 10 }], top: 5 });
  assert.match(r.notes[0], /SPY files no N-PORT/);
  assert.equal(r.funds.find((f) => f.symbol === "SPY").looked_through, "IVV");
  // Each fund's report checked against itself, as fund_portfolio gives it: IVV's positions come to 100.12% of net assets.
  assert.deepEqual(r.funds.map((f) => [f.symbol, f.values_add_to]), [["SPY", 1.0012], ["IVV", 1.0012]]);
  assert.deepEqual(r.overlap.rows, [["SPY", "IVV", 1]]);
  const apple = r.rows.find((x) => /apple/i.test(x[0]));
  assert.ok(apple && apple[2].AAPL === 0.1 && apple[2].IVV > 0, JSON.stringify(apple));
  assert.ok(r.effective_positions > 5 && r.effective_positions < r.positions_after_look_through);
});

test("the shared merge: a stock and two funds, their overlap, and the same answer for any casing", async () => {
  const { issuerKey, mergeOpened } = await import("../src/xray-merge.mjs");
  assert.equal(issuerKey("NVIDIA Corp"), issuerKey("NVIDIA CORPORATION"));
  const opened = { VOO: { kind: "fund", fund: "An S&P fund", period: "2026-06-30", filed: "2026-08-01", positions: [["NVIDIA Corp", 8], ["Apple Inc", 7], ["Other Co", 85]], values_add_to: 1.0009 }, QQQ: { kind: "fund", fund: "A tech fund", period: "2026-06-30", filed: "2026-08-01", positions: [["NVIDIA CORP", 10], ["Apple Inc", 10], ["Third Inc", 80]] }, NVDA: { kind: "stock", name: "NVIDIA CORP" } };
  const r = mergeOpened([{ symbol: "VOO", weight: 60 }, { symbol: "qqq", weight: 30 }, { symbol: "NVDA", weight: 10 }], (s) => opened[s]);
  assert.equal(r.holdings, 3);
  assert.equal(r.positions_after_look_through, 4, "nvidia counts once");
  const top = r.rows.find((x) => /other/i.test(x[0]));
  assert.equal(top[1], 0.51);
  const nvidia = r.rows.find((x) => /nvidia/i.test(x[0]));
  assert.equal(nvidia[1], 0.178);
  assert.deepEqual(Object.keys(nvidia[2]), ["VOO", "QQQ", "NVDA"]);
  assert.deepEqual(r.overlap.rows[0], ["VOO", "QQQ", 0.15]);
  assert.equal(r.funds[0].weights_add_to, 1);
  assert.deepEqual([r.funds[0].values_add_to, "values_add_to" in r.funds[1]], [1.0009, false], "the check on each report, where the report gives it");
});

test("holdingsCheck: a report's positions against its net assets, and totals that disagree or are missing", async () => {
  const { holdingsCheck } = await import("../src/funds.mjs");
  const report = (over) => ({ holdings: [{ value: 600 }, { value: 395.5 }, { value: null }], net_assets: 1000, total_assets: 1004, total_liabilities: 4, ...over });
  assert.deepEqual(holdingsCheck(report()), { positions_total: 995.5, values_add_to: 0.9955, liabilities: 4, other_assets: 8.5, totals_agree: true });
  assert.equal(holdingsCheck(report({ total_liabilities: 40 })).totals_agree, false, "total assets less liabilities are not the net assets");
  assert.deepEqual(holdingsCheck(report({ net_assets: 0, total_assets: undefined })), { positions_total: 995.5, values_add_to: null, liabilities: 4, other_assets: null, totals_agree: null });
});

