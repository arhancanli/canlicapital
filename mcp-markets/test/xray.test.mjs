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
