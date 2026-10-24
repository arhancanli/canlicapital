// market_overview: changes over each window, yields in points, sectors ranked, and a market that
// fails named rather than sinking the rest. Yahoo's chart answers are made up here.
import assert from "node:assert/strict";
import test from "node:test";

import { changes, GROUPS, marketOverview } from "../src/overview.mjs";
import { createSession } from "../src/sources.mjs";

test("changes: sessions back, the year to date from the prior year's last close, and points for yields", () => {
  const dates = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2025, 11, 31) + (i - 40) * 86400000).toISOString().slice(0, 10));
  const closes = dates.map((_, i) => 100 + i);
  const c = changes(dates, closes);
  assert.equal(c.day, Math.round((399 / 398 - 1) * 1e4) / 1e4);
  assert.equal(c.week, Math.round((399 / 394 - 1) * 1e4) / 1e4);
  assert.equal(c.year_to_date, Math.round((399 / 140 - 1) * 1e4) / 1e4, "from the last close of 2025");
  assert.equal(changes(dates, closes, { points: true }).month, 21);
  assert.equal(changes(dates.slice(-10), closes.slice(-10)).month, null, "too short a history is null, not a guess");
});

test("the overview: every group, sectors best month first, and a failed market listed as missing", async () => {
  const day = 86400;
  const fetchImpl = async (url) => {
    const symbol = decodeURIComponent(new URL(url).pathname.split("/").pop());
    if (symbol === "^HSI") return new Response("{}", { status: 404 });
    const slope = GROUPS.sectors.findIndex(([s]) => s === symbol) + 1;
    const ts = Array.from({ length: 280 }, (_, i) => 1761955200 + i * day);
    const close = ts.map((_, i) => 50 + i * (slope || 1) * 0.01);
    return Response.json({ chart: { result: [{ meta: { currency: "USD", exchangeName: "X", gmtoffset: 0 }, timestamp: ts, indicators: { quote: [{ open: close, high: close, low: close, close, volume: close.map(() => 1) }], adjclose: [{ adjclose: close }] } }] } });
  };
  const s = createSession({ fetchImpl, env: {}, now: () => (1761955200 + 280 * day) * 1000, sleep: async () => {} });
  const r = await marketOverview(s, {});
  assert.deepEqual(Object.keys(GROUPS).filter((g) => !r[g]), []);
  assert.equal(r.sectors.length, 11);
  assert.equal(r.sectors[0][0], "XLRE", "the steepest rise over the month first");
  assert.ok(r.sectors.every((row, i) => i === 0 || row[6] <= r.sectors[i - 1][6]));
  assert.equal(r.world.find((x) => x[0] === "^HSI"), undefined);
  assert.match(r.missing.join(" "), /\^HSI/);
  const tnx = r.rates.find((x) => x[0] === "^TNX");
  assert.equal(tnx[4], 0.01, "a yield's day change is in percentage points");
  const only = await marketOverview(s, { groups: ["crypto"] });
  assert.deepEqual(Object.keys(only).filter((k) => Object.keys(GROUPS).includes(k)), ["crypto"]);
});
