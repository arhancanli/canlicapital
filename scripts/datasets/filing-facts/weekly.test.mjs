import test from "node:test";
import assert from "node:assert/strict";

import { companyReference } from "../../lib/company-reference.mjs";
import { checkItem } from "./check.mjs";
import { annualFilings, dailyIndexUrl, firstReported, isoWeek, newFacts, weekOf, weeklyItemsForCompany } from "./weekly.mjs";

// Example Corp, fiscal years ending 30 September. Each annual report gives its year and the year before
// (both year-end balances, both years' flows); the FY2026 report was filed on 2026-10-28, in 2026-W44.
const VALUES = { Revenues: [800, 900, 1000, 1100, 1250], NetIncomeLoss: [80, 90, 100, 110, 140], Assets: [5000, 5200, 5400, 5600, 6000], Liabilities: [3000, 3100, 3200, 3300, 3500] };
const REPORTS = { 2023: "2023-11-20", 2024: "2024-11-20", 2025: "2025-11-20", 2026: "2026-10-28" };
const INSTANT = new Set(["Assets", "Liabilities"]);
const period = (tag, year) => (INSTANT.has(tag) ? { end: `${year}-09-30` } : { start: `${year - 1}-10-01`, end: `${year}-09-30` });

function source(extra = {}) {
  const facts = {};
  for (const [tag, vals] of Object.entries(VALUES)) {
    const rows = [];
    for (const [y, filed] of Object.entries(REPORTS)) {
      for (const year of [Number(y) - 1, Number(y)]) {
        rows.push({ ...period(tag, year), val: vals[year - 2022], accn: `0000000001-${y.slice(2)}-000010`, fy: Number(y), fp: "FY", form: "10-K", filed });
      }
    }
    facts[tag] = { units: { USD: [...rows, ...(extra[tag] ?? [])] } };
  }
  return { cik: 1, entityName: "Example Corp", facts: { "us-gaap": facts } };
}

const W44 = isoWeek("2026-W44");
const build = (src) => companyReference(JSON.stringify(src), { fetchedAt: "2026-11-05T09:00:00Z", expectedCik: "0000000001" });
const run = (src, window = W44, perCompany = 8) => weeklyItemsForCompany(build(src), src, window, { perCompany, seed: 20261105, week: "2026-W44" });

test("ISO weeks: Monday to Sunday, the year of the week's Thursday, and only weeks that exist", () => {
  assert.deepEqual(W44, { start: "2026-10-26", end: "2026-11-01", weekdays: ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"] });
  assert.equal(isoWeek("2026-W01").start, "2025-12-29");
  assert.equal(isoWeek("2026-W53").start, "2026-12-28", "2026 begins on a Thursday, so it has 53 weeks");
  assert.throws(() => isoWeek("2025-W53"), /not an ISO week/);
  assert.throws(() => isoWeek("2026-W00"), /not an ISO week/);
  assert.throws(() => isoWeek("2026-44"), /looks like/);
  assert.equal(weekOf(Date.UTC(2026, 10, 5)), "2026-W45");
  assert.equal(dailyIndexUrl("2026-10-28"), "https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261028.idx");
});

test("the daily form index gives each original annual report, not amendments or other forms", () => {
  const index = [
    "Form Type   Company Name                                                  CIK         Date Filed  File Name",
    "---------------------------------------------------------------------------------------------------------------------------------------------",
    "10-K             EXAMPLE CORP                                                  1           20261028    edgar/data/1/0000000001-26-000010.txt",
    "10-K/A           AMENDED CO INC                                                22          20261028    edgar/data/22/0000000022-26-000003.txt",
    "10-Q             QUARTERLY HOLDINGS                                            333         20261028    edgar/data/333/0000000333-26-000044.txt",
    "20-F             FOREIGN ISSUER PLC                                            4444        20261028    edgar/data/4444/0000004444-26-000001.txt",
    "SC 13D           SOME FUND LP                                                  55555       20261028    edgar/data/55555/0000055555-26-000002.txt",
    "40-F             CANADA  MINES LTD                                             666666      20261029    edgar/data/666666/0000666666-26-000005.txt",
  ].join("\n");
  assert.deepEqual(annualFilings(index), [
    { form: "10-K", name: "EXAMPLE CORP", cik: "0000000001", filed: "2026-10-28", accn: "0000000001-26-000010" },
    { form: "20-F", name: "FOREIGN ISSUER PLC", cik: "0000004444", filed: "2026-10-28", accn: "0000004444-26-000001" },
    { form: "40-F", name: "CANADA  MINES LTD", cik: "0000666666", filed: "2026-10-29", accn: "0000666666-26-000005" },
  ]);
});

test("first reported: the earliest filing of the same concept, unit and period, in any form", () => {
  const first = firstReported({ facts: { "us-gaap": { Assets: { units: { USD: [
    { end: "2026-09-30", val: 6000, accn: "0000000001-26-000010", fp: "FY", form: "10-K", filed: "2026-10-28" },
    { end: "2026-09-30", val: 6000, accn: "0000000001-26-000009", fp: "Q4", form: "8-K", filed: "2026-10-20" },
  ] } } } } });
  assert.equal(first.get("us-gaap|Assets|USD||2026-09-30"), "2026-10-20");
});

test("every item cites a figure first reported in the week, passes the checker and reproduces exactly", () => {
  const src = source();
  const { items, rejected } = run(src);
  assert.equal(rejected, 0);
  assert.ok(items.length >= 4, `${items.length} items`);
  assert.deepEqual(new Set(items.map((i) => i.template)), new Set(["lookup", "change", "ratio", "net_assets"]), "no unanswerable items");
  const record = build(src);
  for (const item of items) {
    assert.deepEqual(checkItem(item, record), [], item.question);
    assert.equal(item.split, "week-2026-W44");
    assert.ok(item.fresh.length >= 1);
    for (const f of item.fresh) assert.ok(f.first_reported >= W44.start && f.first_reported <= W44.end);
    assert.ok(item.facts.some((f) => f.end === "2026-09-30"), `${item.question} cites FY2026`);
    assert.ok(item.facts.every((f) => f.filed <= W44.end));
  }
  const change = items.find((i) => i.template === "change");
  assert.deepEqual(change.facts.map((f) => f.end), ["2025-09-30", "2026-09-30"], "the base is the year before the new one");
  assert.deepEqual(run(src).items, items, "deterministic given the seed");
});

test("a figure re-reported as a comparative is not new, and a week with no new figure gives no items", () => {
  const items = run(source()).items;
  assert.ok(items.every((i) => !(i.template === "lookup" && i.facts[0].end !== "2026-09-30")), "a lookup of FY2025, re-reported in the FY2026 report, is never asked");
  assert.deepEqual(run(source(), isoWeek("2026-W40")).items, []);
});

test("a figure re-filed after the week is not cited, so the set never depends on a later filing", () => {
  const amended = source({ Revenues: [{ ...period("Revenues", 2026), val: 1250, accn: "0000000001-26-000020", fy: 2026, fp: "FY", form: "10-K/A", filed: "2026-11-03" }] });
  const { items } = run(amended);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.facts.every((f) => f.filed <= W44.end && f.concept !== "Revenues")));
  const record = build(source());
  const item = run(source()).items[0];
  assert.deepEqual(newFacts({ ...item, facts: item.facts.map((f) => ({ ...f, filed: "2026-11-03" })) }, record, firstReported(source()), W44), []);
});
