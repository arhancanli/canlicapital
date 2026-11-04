// fiscal_calendar: each fiscal year from the company's own period dates, 52 or 53 weeks for a week-based year and
// none for one that follows calendar months, quarter ends from the 10-Qs and Q4 as the rest of the year, and the
// calendar quarter holding most of each fiscal quarter's days.
import assert from "node:assert/strict";
import test from "node:test";

import { runFiscal } from "../src/fiscal.mjs";

const COLUMNS = ["end", "start", "val"];
const ctx = (annual, quarterly) => ({ call: async (_n, args) => ({ company: { name: "X" }, columns: COLUMNS, rows: args.periods === "annual" ? annual : quarterly }) });

test("a 53-week year, quarter ends and calendar quarters", async () => {
  const out = await runFiscal(ctx([["2023-09-30", "2022-09-25", 1]], [["2022-12-31", "2022-09-25", 1], ["2023-04-01", "2023-01-01", 1], ["2023-07-01", "2023-04-02", 1]]), { company: "AAPL" });
  assert.deepEqual(out.rows[0], ["2022-09-25", "2023-09-30", 371, 53, "2022-12-31", "2023-04-01", "2023-07-01", "2023-09-30", ["2022Q4", "2023Q1", "2023Q2", "2023Q3"]]);
  assert.match(out.reading, /1 of 1 ran 53 weeks/);
});

test("a year that follows calendar months has no weeks; a missing quarter leaves the rest empty", async () => {
  const months = await runFiscal(ctx([["2026-06-30", "2025-07-01", 1]], [["2025-09-30", "2025-07-01", 1], ["2025-12-31", "2025-10-01", 1], ["2026-03-31", "2026-01-01", 1]]), { company: "MSFT" });
  assert.equal(months.rows[0][3], null);
  assert.deepEqual(months.rows[0][8], ["2025Q3", "2025Q4", "2026Q1", "2026Q2"]);
  assert.match(months.reading, /follow calendar months/);
  const gap = await runFiscal(ctx([["2026-06-30", "2025-07-01", 1]], [["2025-09-30", "2025-07-01", 1]]), { company: "X" });
  assert.deepEqual(gap.rows[0].slice(4), ["2025-09-30", null, null, null, null]);
});
