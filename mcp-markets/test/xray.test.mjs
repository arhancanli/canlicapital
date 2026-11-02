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
  assert.deepEqual(r.overlap.rows, [["SPY", "IVV", 1]]);
  const apple = r.rows.find((x) => /apple/i.test(x[0]));
  assert.ok(apple && apple[2].AAPL === 0.1 && apple[2].IVV > 0, JSON.stringify(apple));
  assert.ok(r.effective_positions > 5 && r.effective_positions < r.positions_after_look_through);
});

test("the shared merge: a stock and two funds, their overlap, and the same answer for any casing", async () => {
  const { issuerKey, mergeOpened } = await import("../src/xray-merge.mjs");
  assert.equal(issuerKey("NVIDIA Corp"), issuerKey("NVIDIA CORPORATION"));
  const opened = { VOO: { kind: "fund", fund: "An S&P fund", period: "2026-06-30", filed: "2026-08-01", positions: [["NVIDIA Corp", 8], ["Apple Inc", 7], ["Other Co", 85]] }, QQQ: { kind: "fund", fund: "A tech fund", period: "2026-06-30", filed: "2026-08-01", positions: [["NVIDIA CORP", 10], ["Apple Inc", 10], ["Third Inc", 80]] }, NVDA: { kind: "stock", name: "NVIDIA CORP" } };
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
});

