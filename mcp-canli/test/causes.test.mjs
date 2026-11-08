// restatement_causes: restated values grouped by the filing that changed them, each set against the company's own
// notices: a non-reliance 8-K (Item 4.02) in the 400 days before, an amended report filed that day, a stock split,
// a moved tag, else broad or narrow by count. Every page of restatements is read; a company that filed no notice
// is an answer, and a source that could not be read is said to be unavailable.
import assert from "node:assert/strict";
import test from "node:test";

import { runCauses } from "../src/causes.mjs";

const COLUMNS = ["concept", "unit", "end", "start", "first_val", "first_filed", "latest_val", "latest_filed", "change_pct", "filings", "cause"];
const row = (concept, latest, pct = 1, cause = null) => [concept, "USD", "2017-06-30", "2016-07-01", 100, "2017-08-30", 100 + pct, latest, pct, 2, cause];
const fake = (replies) => {
  const calls = [];
  return { calls, call: async (name, args) => { calls.push([name, args]); const r = replies[name]; if (r instanceof Error) throw r; return typeof r === "function" ? r(args) : r; } };
};

test("each restating filing set against the company's own notices", async () => {
  const broad = Array.from({ length: 12 }, (_, i) => row(`Concept${i}`, "2019-12-19", i + 1));
  const ctx = fake({
    restatements: (args) => (args.offset ? { columns: COLUMNS, rows: [row("Revenues", "2014-07-23", 600, "split"), row("EarningsPerShareDiluted", "2014-07-23", -85.7, "split")] } : { columns: COLUMNS, rows: [row("Revenues", "2019-05-17", 0.43), ...broad, row("Assets", "2021-03-01", 2), row("Cash", "2015-11-16", 5)], next_offset: 15 }),
    company_events: { columns: ["filed", "company", "items", "events", "headline", "excerpt", "accession", "url"], rows: [["2018-11-15", "X", ["2.02", "4.02"], ["earnings", "restatement"], "", null, "0001628280-18-014419", "u"]] },
    list_filings: { columns: ["filed", "form", "period", "accession", "description", "items", "url"], rows: [["2015-11-16", "10-K/A", "2015-06-30", "0001628280-15-008827", "10-K/A", null, "u"]] },
  });
  const out = await runCauses(ctx, { company: "SMCI", periods: "all" });
  const by = Object.fromEntries(out.rows.map((r) => [r[0], r]));
  assert.equal(by["2019-05-17"][2], "error: non-reliance notice");
  assert.match(by["2019-05-17"][3], /8-K Item 4\.02 filed 2018-11-15 \(0001628280-18-014419\)/);
  assert.equal(by["2019-12-19"][2], "error: non-reliance notice", "within 400 days of the notice");
  assert.equal(by["2021-03-01"][2], "narrow change", "more than 400 days after it");
  assert.equal(by["2015-11-16"][2], "amended report");
  assert.equal(by["2014-07-23"][2], "stock split", "the second page was read");
  assert.equal(out.values, 17);
  assert.deepEqual(ctx.calls.filter(([n]) => n === "restatements").map(([, a]) => a.offset), [0, 15]);
  assert.deepEqual(out.rows.map((r) => r[0]), ["2021-03-01", "2019-12-19", "2019-05-17", "2015-11-16", "2014-07-23"], "latest first");
  assert.equal(out.unavailable, undefined);
});

test("broad and narrow by count; no notice is an answer; an unreadable source says so; since filters", async () => {
  const many = Array.from({ length: 10 }, (_, i) => row(`C${i}`, "2018-08-03", i));
  const none = fake({ restatements: { columns: COLUMNS, rows: [...many, row("D", "2010-02-01")] }, company_events: new Error("company_events: Microsoft filed no 8-K with item 4.02 (restatement) between 2009-01-01 and 2026-11-04."), list_filings: new Error("list_filings: Microsoft filed no 10-K/A, 10-Q/A or 20-F/A") });
  const out = await runCauses(none, { company: "MSFT" });
  assert.deepEqual(out.rows.map((r) => [r[0], r[2]]), [["2018-08-03", "broad recast"], ["2010-02-01", "narrow change"]]);
  assert.equal(out.unavailable, undefined, "no notice filed is not a failure");
  const down = fake({ restatements: { columns: COLUMNS, rows: many }, company_events: new Error("company_events: sec.gov could not be reached"), list_filings: { columns: [], rows: [] } });
  assert.match((await runCauses(down, { company: "MSFT" })).unavailable[0], /8-K notices could not be read/);
  assert.deepEqual((await runCauses(none, { company: "MSFT", since: "2015-01-01" })).rows.map((r) => r[0]), ["2018-08-03"]);
});
