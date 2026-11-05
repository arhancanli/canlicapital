import assert from "node:assert/strict";
import { test } from "node:test";

import { excelDate, gdpNowcast } from "../src/gdpnow.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-gdpnow-fixtures.mjs on 2026-11-04: the Atlanta Fed's workbook, its three tabs rebuilt.
const run = (args) => gdpNowcast(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("Excel's day numbers as dates", () => {
  assert.equal(excelDate(46324), "2026-10-29");
  assert.equal(excelDate("46330"), "2026-11-04");
  assert.equal(excelDate(""), null);
});

test("this quarter's nowcast, each update, what each part adds, and the record (FRED's GDPNOW agrees: 3.4408)", async () => {
  const r = await run({});
  assert.equal(r.quarter, "2026-Q4");
  assert.equal(r.summary[0], "The Atlanta Fed's GDPNow puts real GDP growth in 2026-Q4 at 3.44% (annualized) on 2026-11-04, after International trade, ISM Services, Auto sales; it began the quarter at 3.22% on 2026-10-29.");
  assert.deepEqual(r.updates.rows.map((x) => [x[0], x[2], x[3]]), [["2026-10-29", 3.22, null], ["2026-11-02", 3.74, 0.52], ["2026-11-03", 3.72, -0.02], ["2026-11-04", 3.44, -0.28]]);
  assert.deepEqual(r.bea_estimates.map((b) => [b.quarter, b.gdp_pct]), [["2026-Q2", 2.22], ["2026-Q3", 3.37]]);
  const sum = r.contributions_points.rows.reduce((s, [, v]) => s + v, 0);
  assert.ok(Math.abs(sum - 3.44) < 0.03, `contributions add to ${sum}`);
  // The workbook gives 2026-Q3's release date as the quarter's last day, a placeholder: shown as unknown.
  assert.deepEqual(r.track_record.rows[0], ["2026-Q3", 3.27, 3.37, -0.1, null]);
  assert.deepEqual(r.track_record.rows[1], ["2026-Q2", 1.54, 1.5, 0.04, "2026-07-30"]);
  assert.equal(r.track_record.mean_absolute_miss, 0.74);
  assert.equal((await run({ quarters: 20 })).track_record.rows.length, 20);
});
