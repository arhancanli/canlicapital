import assert from "node:assert/strict";
import { test } from "node:test";

import { createSession } from "../src/sources.mjs";
import { ticTable, treasuryHolders } from "../src/tic.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-tic-fixtures.mjs: the Treasury's slt_table5.txt.
const run = (args) => treasuryHolders(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("the table read oldest first, with totals kept apart from countries", () => {
  const t = ticTable("Table 5\nCountry\t2026-08\t2026-07\nJapan\t1068.3\t1103.9\nGrand Total\t9331.7\t9248.4\n\t\nNotes:\tx\n");
  assert.deepEqual(t.months, ["2026-07", "2026-08"]);
  assert.deepEqual(t.rows, [{ name: "Japan", values: [1103.9, 1068.3] }, { name: "Grand Total", values: [9248.4, 9331.7] }]);
});

test("every major foreign holder at the latest month end, largest first, with the change on a year and its share", async () => {
  const r = await run({});
  assert.equal(r.month, "2026-08");
  assert.deepEqual(r.columns, ["country", "2026-08", "change_on_year", "share_of_foreign_pct"]);
  assert.deepEqual(r.rows.slice(0, 3), [["Japan", 1068.3, -115.6, 11.4], ["United Kingdom", 1009.5, 108.2, 10.8], ["China, Mainland", 590.7, -109, 6.3]]);
  assert.deepEqual(r.totals.grand_total, { "2026-08": 9331.7, "2025-08": 9249.1 });
  assert.match(r.limits[0], /custodian's country/);
});

test("one country by the name people use, month by month, with its rank", async () => {
  const r = await run({ country: "China", months: 3 });
  assert.equal(r.country, "China, Mainland");
  assert.deepEqual(r.year_ago, { month: "2025-08", billions: 699.7 });
  assert.equal(r.change_on_year, -109);
  assert.equal(r.rank, 3);
  assert.deepEqual(r.rows, [["2026-06", 633.4], ["2026-07", 618], ["2026-08", 590.7]]);
  await assert.rejects(run({ country: "Peru" }), /Peru is among "All Other"/);
});
