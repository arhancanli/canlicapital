// funding_rates on replayed OKX pages: annualized carry, the share of positive periods, a coin OKX lacks.
import assert from "node:assert/strict";
import test from "node:test";

import { fundingRates } from "../src/funding.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "./replay.mjs";

const NOW = Date.parse("2026-10-24T00:00:00Z");
const page = (rates) => ({ code: "0", data: rates.map((r, i) => ({ instId: "BTC-USDT-SWAP", fundingTime: String(NOW - i * 8 * 3600000), fundingRate: String(r), realizedRate: String(r) })) });

test("annualized funding from eight-hour periods, newest first", async () => {
  const extra = {
    "https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100": page([0.0001, 0.0001, -0.0001, 0.0001]),
    "https://www.okx.com/api/v5/public/funding-rate-history?instId=ZZZ-USDT-SWAP&limit=100": { code: "51001", msg: "Instrument ID doesn't exist.", data: [] },
  };
  const s = createSession({ fetchImpl: replayFetch(extra).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
  const r = await fundingRates(s, { coins: ["btc", "zzz"], days: 30, series: true });
  const btc = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0][i]]));
  assert.equal(btc.mean_per_period, 0.00005); assert.equal(btc.annualized, 0.0548, "0.00005 x 3 x 365");
  assert.equal(btc.share_positive, 0.75); assert.equal(btc.periods, 4);
  assert.equal(r.series.BTC.length, 4);
  assert.match(r.missing[0][1], /no USDT perpetual ZZZ-USDT-SWAP/);
});
