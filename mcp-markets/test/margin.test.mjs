import assert from "node:assert/strict";
import { test } from "node:test";

import { marginDebt } from "../src/margin.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// FINRA's margin statistics workbook as published on 2026-11-04 (to September 2026), stored whole.
const run = (args) => marginDebt(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("margin debt at the latest month end, its changes, the record, and the months before", async () => {
  const r = await run({ months: 3 });
  assert.equal(r.month, "2026-09");
  assert.equal(r.summary[0], "Investors owed $1.48 trillion against their stocks in margin accounts at the end of 2026-09, up 1.8% on the month and up 31.4% on a year, 1.5% below the record of $1.5 trillion (2026-06).");
  assert.deepEqual(r.latest, { margin_debt_billions: 1480.1, change_on_month_pct: 1.8, change_on_year_pct: 31.4, free_credit_billions: 433.9, debt_less_free_credit_billions: 1046.1 });
  assert.deepEqual(r.record, { month: "2026-06", margin_debt_billions: 1502.1, latest_is_record: false });
  assert.deepEqual(r.rows, [["2026-07", 1417.2, 205.1, 217.3], ["2026-08", 1453.8, 207.6, 217.5], ["2026-09", 1480.1, 215.3, 218.6]]);
  assert.equal((await run({ months: 360 })).rows[0][0], "1997-01");
});
