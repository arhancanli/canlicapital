// ownership_breadth: filing windows, and counts read from replayed EDGAR full-text search answers.
import assert from "node:assert/strict";
import test from "node:test";

import { filingQuarters, ownershipBreadth } from "../src/breadth.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "./replay.mjs";

test("13F filing windows: each calendar quarter of filings reports the quarter before", () => {
  assert.deepEqual(filingQuarters(Date.parse("2026-10-24T00:00:00Z"), 3), [
    { filed_from: "2026-07-01", filed_to: "2026-09-30", holdings_quarter: "2026Q2" },
    { filed_from: "2026-04-01", filed_to: "2026-06-30", holdings_quarter: "2026Q1" },
    { filed_from: "2026-01-01", filed_to: "2026-03-31", holdings_quarter: "2025Q4" },
  ]);
  assert.equal(filingQuarters(Date.parse("2026-02-10T00:00:00Z"), 1)[0].holdings_quarter, "2025Q3");
});

test("counts per quarter and the change, for a CUSIP given", async () => {
  const url = (from, to) => `https://efts.sec.gov/LATEST/search-index?q=%22037833100%22&forms=13F-HR&dateRange=custom&startdt=${from}&enddt=${to}`;
  const hit = (name, cik) => ({ _id: `000000000${cik}-26-000001:infotable.xml`, _source: { display_names: [`${name}  (CIK 000${cik})`], ciks: [`000${cik}`], file_date: "2026-08-14" } });
  const extra = {
    [url("2026-07-01", "2026-09-30")]: { hits: { total: { value: 6776, relation: "eq" }, hits: [hit("BERKSHIRE HATHAWAY INC", 1067983)] } },
    [url("2026-04-01", "2026-06-30")]: { hits: { total: { value: 6652, relation: "eq" }, hits: [] } },
  };
  const s = createSession({ fetchImpl: replayFetch(extra).fetchImpl, env: {}, now: () => Date.parse("2026-10-24T00:00:00Z"), sleep: async () => {} });
  const r = await ownershipBreadth(s, { cusip: "037833100", quarters: 2, holders: 5 });
  assert.deepEqual(r.rows.map((x) => [x[0], x[3]]), [["2026Q2", 6776], ["2026Q1", 6652]]);
  assert.equal(r.change_latest_vs_prior, 0.0186);
  assert.deepEqual(r.holders_sample.rows[0].slice(0, 2), ["BERKSHIRE HATHAWAY INC", 1067983]);
  await assert.rejects(ownershipBreadth(s, {}), /needs company or cusip/);
});
