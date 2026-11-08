import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, runTriangulate } from "../src/triangulate.mjs";

// Resolute Holdings' 2025 balance sheet: the 10-K in thousands (equity 6,523), the later 10-Qs in millions to one
// decimal (6.5). Its assets moved by 0.69 million in a reclassification, a change that must stay a disagreement.
const end = "2025-12-31";
const roads = {
  company_report: { company: { name: "Resolute Holdings Management, Inc.", ticker: "RHLD", cik: "0002039497" },
    financials: { columns: ["end", "revenue", "net_income", "eps_diluted", "cash"], rows: [[end, null, null, null, null]], latest_tags: {} } },
  financial_statements: { filings: { rows: [] }, income: null,
    balance_sheet: { columns: ["line", "concept", `At ${end}`], money_scale: 1000,
      rows: [["Total assets", "us-gaap:Assets", 333415], ["Total stockholders' equity", "us-gaap:StockholdersEquity", 6523]] } },
};
const later = { assets: [332700000, "us-gaap:Assets"], equity: [6500000, "us-gaap:StockholdersEquity"] };
const desk = { call: async (name, input) => name === "history"
  ? (later[input.concept] ? { columns: ["end", "form", "value", "tag"], rows: [[end, "10-Q", ...later[input.concept]]] } : null)
  : roads[name] };

test("triangulate: a later filing's tenths of a million agree with the annual report's thousands, and the reading says so", async () => {
  assert.equal(compare(6523000, 6500000, { scale: 1000 }), "agree, rounded to 0.1 million");
  assert.equal(compare(6500000, 6523000, { scale: 1000 }), "agree, rounded to 0.1 million", "either road may be the rounded one");
  assert.match(compare(6523000, 6400000, { scale: 1000 }), /^apart by/, "more than half a tenth apart is a change");
  assert.match(compare(6500000, 6600000, { scale: 1000 }), /^apart by/, "two figures in tenths a tenth apart are a change");
  assert.match(compare(30000, 0), /^apart by/, "nothing is rounded to zero");
  assert.match(compare(3.04, 3.1, { perShare: true }), /^apart by/, "per-share figures keep their own rule");

  const out = await runTriangulate(desk, { company: "RHLD" });
  const reading = Object.fromEntries(out.rows.map((r) => [r[0], r[5]]));
  assert.equal(reading.equity, "agree (history rounded to 0.1 million)");
  assert.match(reading.assets, /^history apart by 0\.2%/);
  assert.equal(out.disagreements, 1);
  assert.match(out.disagreement_text, /^assets /);
  assert.equal(out.agreements, 1);
});
