import assert from "node:assert/strict";
import { test } from "node:test";

import { coferTable, quarterBack, reserveCurrencies } from "../src/reserves.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-reserves-fixtures.mjs on 2026-11-04: the IMF's COFER to 2026-Q2.
const run = (args) => reserveCurrencies(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("quarters counted back across years, and the IMF's CSV as shares and values by currency", () => {
  assert.equal(quarterBack("2026-Q2", 4), "2025-Q2");
  assert.equal(quarterBack("2026-Q1", 1), "2025-Q4");
  assert.equal(quarterBack("2026-Q2", 40), "2016-Q2");
  const t = coferTable("FXR_CURRENCY,TYPE_OF_TRANSFORMATION,TIME_PERIOD,OBS_VALUE\nCI_USD,SHRO_PT,2026-Q2,56.7\nCI_USD,NV_USD,2026-Q2,7494549610004.36\nCI_USD,SHRO_PT,2026,56\n");
  assert.deepEqual(t, { CI_USD: { share: { "2026-Q2": 56.7 }, value: { "2026-Q2": 7494549610004.36 } } });
});

test("each currency's share of the world's reserves, its value and its changes, largest first, the rest last", async () => {
  const r = await run({});
  assert.equal(r.quarter, "2026-Q2");
  assert.equal(r.summary[0], "In 2026-Q2 the US dollar was 56.7% of the world's foreign exchange reserves whose currency is reported ($7.49 trillion of $13.22 trillion), down 0.24 points on a year and down 7.3 points on ten years; the euro 20.6%, the Japanese yen 4.96%, the pound sterling 4.57%, the Canadian dollar 2.47%.");
  assert.deepEqual(r.rows[0], ["US dollar", 56.7, 7494.5, -0.24, -7.3, 1.7]);
  // The renminbi is reported from 2016-Q4, so it has no share ten years back.
  assert.deepEqual(r.rows.find((x) => x[0] === "Chinese renminbi"), ["Chinese renminbi", 2.11, 279.4, 0.14, null, 9.2]);
  assert.equal(r.rows.at(-1)[0], "other currencies");
  assert.deepEqual(r.history.rows.at(-1), ["2026-Q2", 56.7, 20.6, 4.96, 4.57, 2.11, 2.47, 2.25, 0.27, 6.06]);
  assert.equal((await run({ quarters: 40 })).history.rows.length, 40);
});
