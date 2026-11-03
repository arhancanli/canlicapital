// Canli Data's first pack, SEC facts as first filed: each period's value from the first filing that reported it
// and from the latest, changes counted, a restatement in an amendment seen, other forms left out, an IFRS filer
// read in its own taxonomy, and a file without facts refused.
import assert from "node:assert/strict";
import test from "node:test";

import { FIRST_FILED_COLUMNS, firstFiled, packDataset } from "../src/data.mjs";

const filings = { E1: ["8-K", "2025-01-30"], A1: ["10-K", "2025-02-14"], R1: ["10-K/A", "2025-06-02"], A2: ["10-K", "2026-02-13"] };
const fact = (accn, end, val, start) => ({ ...(start ? { start } : {}), end, val, accn, form: filings[accn][0], filed: filings[accn][1] });
const companyfacts = {
  cik: 1234567,
  entityName: "Example Holdings Inc.",
  facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [fact("A1", "2025-01-31", 900)] } } },
    "us-gaap": {
      // 2024 revenue: 5,000 first filed, 5,100 in the next annual report's comparatives; the earnings release is no report.
      Revenues: { units: { USD: [fact("E1", "2024-12-31", 4990, "2024-01-01"), fact("A1", "2024-12-31", 5000, "2024-01-01"), fact("A2", "2024-12-31", 5100, "2024-01-01"), fact("A2", "2025-12-31", 5600, "2025-01-01")] } },
      // Assets at the end of 2024: 990 in an amendment, then 1,000 again in the next annual report.
      Assets: { units: { USD: [fact("A2", "2024-12-31", 1000), fact("R1", "2024-12-31", 990), fact("A1", "2024-12-31", 1000)] } },
      EarningsPerShareBasic: { units: { "USD/shares": [fact("A1", "2024-12-31", 6.11, "2024-01-01")] } },
    },
  },
};

test("each period's value as first filed and as last filed, with the filings named and the changes counted", () => {
  const rows = firstFiled(companyfacts);
  assert.deepEqual(rows.map((r) => [r.concept, r.unit, r.start, r.end]), [
    ["Assets", "USD", null, "2024-12-31"],
    ["EarningsPerShareBasic", "USD/shares", "2024-01-01", "2024-12-31"],
    ["Revenues", "USD", "2024-01-01", "2024-12-31"],
    ["Revenues", "USD", "2025-01-01", "2025-12-31"],
  ]);
  const [assets, eps, revenue2024, revenue2025] = rows;
  assert.deepEqual([revenue2024.first_value, revenue2024.first_accession, revenue2024.latest_value, revenue2024.latest_accession, revenue2024.filings, revenue2024.values], [5000, "A1", 5100, "A2", 2, 2], "the earnings release's 4,990 is not counted");
  assert.deepEqual([assets.first_value, assets.first_form, assets.latest_value, assets.latest_filed, assets.filings, assets.values], [1000, "10-K", 1000, "2026-02-13", 3, 2], "back to 1,000 after a restatement is still a change");
  assert.deepEqual([eps.first_value, revenue2025.values, revenue2025.first_filed], [6.11, 1, "2026-02-13"]);
  assert.deepEqual(Object.keys(rows[0]), FIRST_FILED_COLUMNS.map((c) => c.name), "every row has exactly the columns, in order");
  assert.equal(firstFiled(companyfacts, { forms: ["10-K"] }).find((r) => r.concept === "Assets").values, 1, "without amendments the restatement is not seen");
});

test("an IFRS filer is read in its own taxonomy, the pack's rows come out as CSV, and a file without facts is refused", () => {
  const ifrs = { cik: 7654321, entityName: "Example Semiconductor plc", facts: { "ifrs-full": { Revenue: { units: { TWD: [{ start: "2025-01-01", end: "2025-12-31", val: 3809054000000, accn: "F1", form: "20-F", filed: "2026-04-16" }] } } } } };
  const [row] = firstFiled(ifrs);
  assert.deepEqual([row.taxonomy, row.concept, row.unit, row.first_value, row.values], ["ifrs-full", "Revenue", "TWD", 3809054000000, 1]);
  const pack = packDataset({ name: "sec-first-filed", source: "a test", license: "cc-by-4.0", columns: FIRST_FILED_COLUMNS, rows: firstFiled(companyfacts) });
  assert.equal(pack.csv.split("\n")[1], "1234567,Example Holdings Inc.,us-gaap,Assets,USD,,2024-12-31,1000,A1,10-K,2025-02-14,1000,A2,10-K,2026-02-13,3,2");
  assert.throws(() => firstFiled({ facts: { dei: {} } }), /no us-gaap or ifrs-full facts/);
});
