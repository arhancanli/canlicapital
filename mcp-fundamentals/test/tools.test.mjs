// Every tool against a companyfacts fixture whose answers are known, through the same fetch path
// the live server uses. Each case reproduces a failure the 2026-09-27 audit found in real filings.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  createSession,
  durationKind,
  instantKind,
  loadCompany,
  toolCrossSection,
  toolFindCompany,
  resolveCompany,
  toolHistory,
  toolKnownAsOf,
  toolListConcepts,
  toolRestatements,
  toolVintageDiff,
  toolVintages,
} from "../src/server.mjs";
import { CIK, EXXON, FACTS, RAW, SHA, fakeFetch, files } from "./fixture.mjs";
import { indexFacts } from "../src/server.mjs";

const session = (map, opts = {}) => {
  const f = fakeFetch(map);
  return { s: createSession({ base: "https://example.test", fetchImpl: f.impl, cacheDir: "", ...opts }), calls: f.calls };
};
const out = (r) => r.structuredContent;
const byCol = (res) => res.rows.map((row) => Object.fromEntries(res.columns.map((c, i) => [c, row[i]])));
const get = (rows, concept) => rows.find((r) => r.concept === concept);

test("inherited property names are unknown concepts, never prototype lookups", async () => {
  for (const concept of ["constructor", "__proto__", "hasOwnProperty"]) {
    const { s } = session();
    const section = out(await toolCrossSection(s, { companies: ["FIX"], concept, as_of: "2020-11-01" }));
    assert.deepEqual(section.rows, []);
    assert.equal(section.missing.length, 1);
    assert.match(section.missing[0], /reports no concept/);
    await assert.rejects(toolHistory(s, { company: "FIX", concept }), (error) => error.constructor === Error && /reports no concept/.test(error.message));
  }
});

test("period kinds: 52/53-week years annual, 12- to 17-week quarters quarterly, year-to-date other; balances take their first report's kind", () => {
  assert.equal(durationKind("2018-09-30", "2019-09-28"), "annual");
  assert.equal(durationKind("2019-09-29", "2020-10-03"), "annual");
  assert.equal(durationKind("2025-08-17", "2025-11-08"), "quarterly", "12 weeks");
  assert.equal(durationKind("2019-09-29", "2019-12-28"), "quarterly", "13 weeks");
  assert.equal(durationKind("2026-02-01", "2026-05-23"), "quarterly", "16 weeks, Kroger's Q1");
  assert.equal(durationKind("2025-05-12", "2025-09-07"), "quarterly", "17 weeks");
  assert.equal(durationKind("2026-02-01", "2026-08-15"), "other", "28-week year to date");
  assert.equal(durationKind("2019-10-01", "2020-03-31"), "other");
  assert.equal(instantKind("10-K"), "annual");
  assert.equal(instantKind("10-K/A"), "annual");
  assert.equal(instantKind("20-F"), "annual");
  assert.equal(instantKind("10-Q"), "quarterly");
  assert.equal(instantKind("6-K"), "quarterly");
  assert.equal(instantKind("8-K"), "other");
});

test("history with as_of never shows a filing made after it, whatever the basis", async () => {
  const { s } = session();
  const plain = out(await toolHistory(s, { company: "FIX", concept: "Revenues", as_of: "2020-06-30", periods: "all" }));
  assert.equal(plain.basis, "as_of", "as_of alone selects the as_of basis");
  assert.ok(byCol(plain).every((r) => r.filed <= "2020-06-30"), JSON.stringify(plain.rows));
  for (const basis of ["first_reported", "latest", "as_of"]) {
    const r = byCol(out(await toolHistory(s, { company: "FIX", concept: "revenue", basis, as_of: "2020-06-30" })));
    assert.deepEqual(r.map((x) => [x.end, x.val, x.filed]), [["2019-09-30", 100, "2019-10-30"], ["2018-09-30", 80, "2018-10-31"]], basis);
  }
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", basis: "as_of" }), /needs an as_of date/);
});

test("history with as_of: changed counts only filings made by then, so a restatement filed later is not seen", async () => {
  const { s } = session();
  // Fiscal 2019 revenue: 100 first filed 2019-10-30, restated to 90 in the 10-K of 2020-10-29.
  const fy2019 = async (as_of) => {
    const res = out(await toolHistory(s, { company: "FIX", concept: "revenue", basis: "first_reported", as_of }));
    return [byCol(res).find((r) => r.end === "2019-09-30"), res.meaning];
  };
  const [before, meaning] = await fy2019("2020-06-30");
  assert.deepEqual([before.val, before.changed], [100, false], "the restatement was not filed by then");
  assert.match(meaning, /made by as_of, reported a different value for the period\. Nothing here comes from a filing made after as_of/);
  const [after] = await fy2019("2020-11-01");
  assert.deepEqual([after.val, after.changed], [100, true], "by then it was");
  // Without as_of, changed still counts every later filing.
  const all = byCol(out(await toolHistory(s, { company: "FIX", concept: "revenue", basis: "first_reported" }))).find((r) => r.end === "2019-09-30");
  assert.deepEqual([all.val, all.changed], [100, true]);
});

test("history: latest and quarterly periods, including a 16-week quarter; prospectus figures are never vintages", async () => {
  const { s } = session();
  const latest = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", basis: "latest" })));
  assert.deepEqual(latest.map((r) => [r.end, r.val]), [["2020-09-30", 110], ["2019-09-30", 90]], "the 424B2 figure of 999 is not a vintage");
  const quarterly = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", periods: "quarterly" })));
  assert.deepEqual(quarterly.map((r) => [r.end, r.val]), [["2020-04-21", 40], ["2019-12-31", 30]]);
  const all = out(await toolHistory(s, { company: "FIX", concept: "Revenues", periods: "all" }));
  assert.equal(all.total, 5, "the six-month figure appears only under all");
});

test("history shows the other vintage beside the one asked for, and the change from a year earlier", async () => {
  const { s } = session();
  const first = byCol(out(await toolHistory(s, { company: "FIX", concept: "revenue", basis: "first_reported" })));
  const r2019 = first.find((r) => r.end === "2019-09-30");
  assert.equal(r2019.val, 100); assert.equal(r2019.latest_val, 90); assert.ok(r2019.latest_filed > r2019.filed);
  assert.equal(first.find((r) => r.end === "2020-09-30").latest_val, null, "unchanged values have no second vintage");
  assert.equal(first.find((r) => r.end === "2020-09-30").change_pct, 10);
  assert.equal(first.find((r) => r.end === "2018-09-30").change_pct, null, "no earlier year in the rows");
  const latest = byCol(out(await toolHistory(s, { company: "FIX", concept: "revenue", basis: "latest" })));
  assert.equal(latest.find((r) => r.end === "2019-09-30").first_val, 100);
  assert.equal(latest.find((r) => r.end === "2020-09-30").change_pct, 22.2222);
  const asOf = out(await toolHistory(s, { company: "FIX", concept: "revenue", as_of: "2020-06-30" }));
  assert.ok(!asOf.columns.includes("latest_val") && !asOf.columns.includes("first_val"), "as_of never shows a later value");
});

test("a plain name follows the measure across a tag change, and each value names its tag", async () => {
  const { s } = session();
  const first = out(await toolHistory(s, { company: "FIX", concept: "revenue", basis: "first_reported" }));
  assert.deepEqual(first.concept.tags, ["Revenues", "SalesRevenueNet"]);
  assert.deepEqual(byCol(first).map((r) => [r.end, r.val, r.filed, r.tag, r.changed]), [
    ["2020-09-30", 110, "2020-10-29", "Revenues", false],
    ["2019-09-30", 100, "2019-10-30", "SalesRevenueNet", true],
    ["2018-09-30", 80, "2018-10-31", "SalesRevenueNet", false],
  ]);
  const v = byCol(out(await toolVintages(s, { company: "FIX", concept: "revenue", end: "2019-09-30" })));
  assert.deepEqual(v.map((r) => [r.filed, r.val, r.tag]), [["2019-10-30", 100, "SalesRevenueNet"], ["2020-10-29", 90, "Revenues"]]);
  for (const name of ["Revenue", "revenues", "sales", "Sales"]) {
    assert.equal(out(await toolHistory(s, { company: "FIX", concept: name })).concept.name, "revenue", name);
  }
  assert.equal(out(await toolHistory(s, { company: "FIX", concept: "EPS" })).concept.name, "eps_diluted");
});

test("one filing reporting a period under two tags is not a revision: the period keeps its first tag", async () => {
  const { s } = session();
  const cash = byCol(out(await toolHistory(s, { company: "FIX", concept: "cash", basis: "latest" })));
  assert.deepEqual(cash.map((r) => [r.end, r.val, r.tag, r.changed]), [["2019-09-30", 60, "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", false]]);
  assert.equal(out(await toolRestatements(s, { company: "FIX", concept: "cash" })).changed, 0);
});

test("an XBRL tag the company stopped using points to the series that continues it", async () => {
  const { s } = session();
  const old = out(await toolHistory(s, { company: "FIX", concept: "SalesRevenueNet" }));
  assert.match(old.newer_series, /SalesRevenueNet ends 2019-09-30; .* later periods as Revenues\. Use concept "revenue"/);
  assert.equal(out(await toolHistory(s, { company: "FIX", concept: "Revenues" })).newer_series, undefined);
});

test("a tag in two taxonomies is one measure; a taxonomy prefix picks one", async () => {
  const { s } = session();
  const exact = out(await toolHistory(s, { company: "FIX", concept: "Assets", basis: "first_reported" }));
  assert.deepEqual(exact.concept.tags, ["ifrs-full:Assets", "Assets"], "the IFRS series, still reported, comes first");
  assert.deepEqual(byCol(exact).map((r) => [r.end, r.val, r.tag]), [["2021-09-30", 700, "ifrs-full:Assets"], ["2020-09-30", 600, "Assets"], ["2019-09-30", 500, "Assets"]]);
  assert.deepEqual(byCol(out(await toolHistory(s, { company: "FIX", concept: "assets", basis: "first_reported" }))).map((r) => r.val), [700, 600, 500]);
  const usgaap = out(await toolHistory(s, { company: "FIX", concept: "us-gaap:Assets" }));
  assert.deepEqual(usgaap.concept.tags, ["Assets"]);
});

test("known_as_of: values as they stood, across tag and taxonomy changes, with stale and snapshot flags", async () => {
  const { s } = session();
  const before = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2019-12-31" }));
  // Whether a filing made after as_of changed a value is given only when asked for by name: nobody knew it on as_of.
  const b = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2019-12-31", changed_after: true })));
  assert.deepEqual([before.columns.includes("changed_after"), byCol(before)], [false, b.map(({ changed_after: _later, ...known }) => known)]);
  assert.match(before.meaning, /Nothing here comes from a filing made after as_of; changed_after: true adds/);
  assert.deepEqual([get(b, "revenue").val, get(b, "revenue").tag, get(b, "revenue").changed_after], [100, "SalesRevenueNet", true]);
  assert.deepEqual([get(b, "assets").val, get(b, "assets").changed_after], [500, true], "the 10-K/A of 2020-01-15 was not yet filed");
  assert.equal(get(b, "eps_diluted").unit, "USD/shares");
  assert.equal(before.snapshot_note, undefined);

  const onTheDay = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-15", concepts: ["Assets"] })));
  assert.equal(onTheDay[0].val, 520, "a filing made on the as_of date counts");
  const dayBefore = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-14", concepts: ["Assets"] })));
  assert.equal(dayBefore[0].val, 500);

  const ifrs = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2022-01-31" })));
  assert.deepEqual([get(ifrs, "assets").val, get(ifrs, "assets").tag, get(ifrs, "assets").stale], [700, "ifrs-full:Assets", false]);
  assert.deepEqual([get(ifrs, "revenue").end, get(ifrs, "revenue").stale], ["2020-09-30", true], "revenue stopped at FY2020");

  const q = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-06-30", periods: "quarterly", concepts: ["revenue", "us-gaap:Assets"] })));
  assert.deepEqual(q.map((r) => [r.concept, r.end, r.val]), [["revenue", "2020-04-21", 40], ["Assets", "2019-12-31", 510]], "the 16-week quarter is the latest one known");

  const early = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2018-12-31" }));
  assert.equal(get(byCol(early), "revenue").val, 80);
  assert.ok(early.missing.includes("assets"));

  const late = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2027-01-01", concepts: ["revenue"] }));
  assert.match(late.snapshot_note, /after this snapshot \(fetched 2026-09-19\)/);
  await assert.rejects(toolKnownAsOf(s, { company: "FIX", as_of: "2020-02-01", concepts: ["NoSuchThing"] }), /reports no concept named NoSuchThing/);
});

test("restatements: splits, reverted values, zero first values and tag changes are told apart", async () => {
  const { s } = session();
  const r = out(await toolRestatements(s, { company: "FIX" }));
  assert.deepEqual(byCol(r).map((x) => [x.concept, x.end, x.first_val, x.latest_val, x.change_pct, x.cause]), [
    ["OperatingLeaseLiability", "2019-09-30", 0, 30, null, null],
    ["Assets", "2019-09-30", 500, 520, 4, null],
  ]);
  assert.equal(r.splits_excluded, 1);
  assert.equal(r.changed_then_reverted, 1, "LongTermDebt went 50, 51, 50");

  const withSplits = byCol(out(await toolRestatements(s, { company: "FIX", include_splits: true })));
  assert.deepEqual(withSplits.map((x) => [x.concept, x.cause]), [["OperatingLeaseLiability", null], ["EarningsPerShareDiluted", "split"], ["Assets", null]], "newest first, then the largest change");

  const min = byCol(out(await toolRestatements(s, { company: "FIX", min_change_pct: 5 })));
  assert.deepEqual(min.map((x) => x.concept), ["OperatingLeaseLiability"], "a change from zero always passes; 4% does not");

  const plain = byCol(out(await toolRestatements(s, { company: "FIX", concept: "revenue" })));
  assert.deepEqual(plain.map((x) => [x.end, x.first_val, x.latest_val, x.cause]), [["2019-09-30", 100, 90, "tag_change"]]);
  assert.equal(out(await toolRestatements(s, { company: "FIX", since: "2021-01-01" })).changed, 0);
});

test("list_concepts: plain names, folded plurals and taxonomy prefixes; filing fees are not concepts", async () => {
  const { s } = session();
  const all = out(await toolListConcepts(s, { company: "FIX" }));
  assert.equal(all.concepts, 18, "ffd:FeeRate is left out");
  assert.deepEqual(all.plain_names.revenue, ["Revenues", "SalesRevenueNet"]);
  assert.deepEqual(all.plain_names.assets, ["Assets", "ifrs-full:Assets"]);
  assert.ok(byCol(all).some((r) => r.concept === "dei:EntityCommonStockSharesOutstanding"));
  const rev = byCol(out(await toolListConcepts(s, { company: "FIX", search: "revenues" })));
  assert.deepEqual(rev.map((r) => [r.concept, r.restated_periods]), [["Revenues", 0], ["SalesRevenueNet", 0]]);
});

test("unknown names get suggestions, plain names and current tags first", async () => {
  const { s } = session();
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "RevenueFromContract" }), /Close matches: revenue, Revenues, SalesRevenueNet/);
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", unit: "EUR" }), /reported in USD, not EUR/);
});

test("a ticker held outside the reference is never read as another company's name", async () => {
  const { s } = session();
  await assert.rejects(toolListConcepts(s, { company: "META" }), /META is the SEC's ticker for Some Other Listed Plc \(CIK 0002300000\).*pass one CIK as company/);
  // Not a ticker at all: a name's first word still finds the company, and the answer says how it was read.
  assert.match((await resolveCompany(s, "STAR")).matched.note, /STAR is not a current ticker/);
  assert.doesNotMatch((await resolveCompany(s, "Star")).matched.note ?? "", /not a current ticker/);
});

test("a company outside the reference is read live from the SEC when the flagship turns that on, and the answer says so", async () => {
  const map = files();
  map["/api/xbrl/companyfacts/CIK0002200000.json"] = RAW;
  const { s, calls } = session(map, { secLive: true });
  for (const company of ["NEWCO", "Brand New"]) {
    const r = out(await toolListConcepts(s, { company }));
    assert.equal(r.company.cik, "0002200000");
    assert.match(r.company.matched.note, /outside the Canli company reference, so its figures are read live from the SEC/);
    assert.equal(r.snapshot.read_live, true);
    assert.equal(r.snapshot.sec_url, "https://data.sec.gov/api/xbrl/companyfacts/CIK0002200000.json");
  }
  assert.equal(calls.filter((c) => c.includes("companyfacts")).length, 1);
  assert.equal(out(await toolHistory(s, { company: "NEWCO", concept: "revenue" })).company.cik, "0002200000");
  assert.equal(out(await toolFindCompany(s, { query: "Brand New" })).rows.length > 0, true);
  // No SEC facts for the holder: says so. Off by default: only the reference is contacted.
  const { s: empty } = session(files(), { secLive: true });
  await assert.rejects(toolListConcepts(empty, { company: "NEWCO" }), /CIK 0002200000 is not in the Canli company reference, and the SEC has no XBRL facts for it/);
  const { s: off, calls: offCalls } = session(map);
  await assert.rejects(toolListConcepts(off, { company: "NEWCO" }), /does not cover/);
  assert.equal(offCalls.some((c) => c.includes("companyfacts")), false);
});

test("a reference snapshot older than the company's newest report gives way to the SEC's own facts when the flagship reads live, and says why", async () => {
  // The fixture's reference was captured 2026-09-19; the SEC lists a 10-Q filed since, after an 8-K.
  const list = (forms, dates) => JSON.stringify({ filings: { recent: { form: forms, filingDate: dates, accessionNumber: forms.map((_, i) => `0000123456-26-00003${i}`) } } });
  const map = files();
  map[`/submissions/CIK${CIK}.json`] = list(["8-K", "10-Q", "10-K"], ["2026-11-04", "2026-11-03", "2026-02-20"]);
  map[`/api/xbrl/companyfacts/CIK${CIK}.json`] = RAW;
  const { s } = session(map, { secLive: true });
  const r = out(await toolListConcepts(s, { company: "FIX" }));
  assert.equal(r.snapshot.read_live, true);
  assert.deepEqual(r.snapshot.newer_filing, { form: "10-Q", filed: "2026-11-03", accession: "0000123456-26-000031" });
  assert.deepEqual(r.snapshot.reference, { fetched_at: "2026-09-19T09:30:25.021Z", sha256: SHA, url: `https://example.test/company-data/sources/${SHA}.json.gz` });
  assert.match(r.snapshot.note, /captured 2026-09-19; its 10-Q filed 2026-11-03 is newer, so the SEC's own company facts were read live/);
  assert.equal(r.company.cik, CIK);
  // Nothing newer than the snapshot: the reference stands.
  const current = files();
  current[`/submissions/CIK${CIK}.json`] = list(["8-K", "10-Q"], ["2026-11-04", "2026-08-01"]);
  const { s: same, calls } = session(current, { secLive: true });
  assert.equal(out(await toolListConcepts(same, { company: "FIX" })).snapshot.read_live, undefined);
  assert.equal(calls.some((c) => c.includes("companyfacts")), false);
  // Not reading live: the SEC is never asked.
  const { s: off, calls: offCalls } = session(map);
  assert.equal(out(await toolListConcepts(off, { company: "FIX" })).snapshot.read_live, undefined);
  assert.equal(offCalls.some((c) => c.startsWith("/submissions/")), false);
});

test("a long session sees a report filed after it first read a company, and reads again a few times for figures the SEC's facts do not hold yet", async () => {
  const list = (...reports) => JSON.stringify({ filings: { recent: { form: reports.map((r) => r[0]), filingDate: reports.map((r) => r[1]), accessionNumber: reports.map((r) => r[2]) } } });
  // The SEC's company facts with one more filing: a 10-K/A that restates the year to 2020-09-30 from 110 to 112.
  const withFiling = (accn, filed) => {
    const facts = structuredClone(FACTS);
    facts.facts["us-gaap"].Revenues.units.USD.push({ start: "2019-10-01", end: "2020-09-30", val: 112, accn, fy: 2020, fp: "FY", form: "10-K/A", filed });
    return Buffer.from(JSON.stringify(facts));
  };
  let clock = Date.parse("2026-11-05T12:00:00Z");
  const map = files();
  map[`/submissions/CIK${CIK}.json`] = list(["10-Q", "2026-08-01", "0000123456-26-000020"]);
  const { s, calls } = session(map, { secLive: true, now: () => clock });
  const year = { company: "FIX", concept: "Revenues", end: "2020-09-30", start: "2019-10-01" };
  const last = async () => out(await toolVintages(s, year)).rows.at(-1);
  const count = (part) => calls.filter((c) => c.includes(part)).length;
  assert.equal((await last())[7], 110, "nothing newer than the reference: its figures stand");
  // The fixture's reference holds no figures from that older 10-Q, as a 10-K/A adding only Part III would not;
  // the reference stands against it at every check.
  clock += 16 * 60 * 1000;
  assert.equal((await last())[7], 110);
  assert.equal(count("companyfacts"), 0);
  // A restatement filed later the same session, read within fifteen minutes of the last check.
  map[`/submissions/CIK${CIK}.json`] = list(["10-K/A", "2026-11-05", "0000123456-26-000041"], ["10-Q", "2026-08-01", "0000123456-26-000020"]);
  map[`/api/xbrl/companyfacts/CIK${CIK}.json`] = withFiling("0000123456-26-000041", "2026-11-05");
  clock += 10 * 60 * 1000;
  assert.equal((await last())[7], 110, "checked at most every fifteen minutes");
  assert.equal(count("/submissions/"), 2);
  clock += 6 * 60 * 1000;
  const restated = out(await toolVintages(s, year));
  assert.deepEqual(restated.rows.at(-1).slice(2, 5), ["2026-11-05", "10-K/A", "0000123456-26-000041"]);
  assert.equal(restated.rows.at(-1)[7], 112);
  assert.equal(restated.snapshot.newer_filing.accession, "0000123456-26-000041");
  assert.equal(restated.snapshot.reference.sha256, SHA, "the reference it replaced is still named");
  assert.equal(count("companyfacts"), 1);
  // Another report the SEC's facts do not hold yet: read again at each check, four reads in all, then let be.
  map[`/submissions/CIK${CIK}.json`] = list(["10-Q", "2026-11-06", "0000123456-26-000050"], ["10-K/A", "2026-11-05", "0000123456-26-000041"]);
  for (let i = 0; i < 6; i++) {
    clock += 16 * 60 * 1000;
    assert.equal((await last())[7], 112);
  }
  assert.equal(count("companyfacts"), 1 + 4);
  // Facts that catch up within the tries are taken, and reading stops there.
  map[`/submissions/CIK${CIK}.json`] = list(["10-Q", "2026-11-07", "0000123456-26-000060"], ["10-Q", "2026-11-06", "0000123456-26-000050"]);
  clock += 16 * 60 * 1000;
  await last();
  map[`/api/xbrl/companyfacts/CIK${CIK}.json`] = withFiling("0000123456-26-000060", "2026-11-07");
  clock += 16 * 60 * 1000;
  assert.equal((await last())[2], "2026-11-07");
  for (let i = 0; i < 3; i++) { clock += 16 * 60 * 1000; await last(); }
  assert.equal(count("companyfacts"), 1 + 4 + 2);
  // A failed read keeps the figures held.
  map[`/submissions/CIK${CIK}.json`] = list(["10-Q", "2026-11-08", "0000123456-26-000070"]);
  delete map[`/api/xbrl/companyfacts/CIK${CIK}.json`];
  clock += 16 * 60 * 1000;
  assert.equal((await last())[2], "2026-11-07");
});

test("vintage_diff lists what changed between two dates, with the filing that changed it, and counts what was new", async () => {
  const { s } = session();
  const all = out(await toolVintageDiff(s, { company: "FIX", from: "2020-01-01", to: "2021-01-01", periods: "all" }));
  assert.deepEqual([all.compared, all.changed, all.first_reported_between, all.splits_excluded], [10, 2, 16, 1]);
  assert.deepEqual(byCol(all).map((r) => [r.concept, r.value_then, r.value_now, r.form, r.accn]), [
    ["OperatingLeaseLiability", 0, 30, "10-K", "0000123456-20-000020"],
    ["Assets", 500, 520, "10-K/A", "0000123456-20-000002"],
  ], "latest filing first");
  // A plain name follows its tags, so a value moved to a new tag is a change.
  const revenue = out(await toolVintageDiff(s, { company: "FIX", concept: "revenue", from: "2020-01-01", to: "2021-01-01" }));
  assert.deepEqual(revenue.rows, [["revenue", "USD", "2019-09-30", "2018-10-01", 100, "2019-10-30", 90, "2020-10-29", "10-K", "0000123456-20-000020", -10]]);
  assert.equal(revenue.first_reported_between, 1);
  // Nothing filed between two dates: nothing changed.
  const quiet = out(await toolVintageDiff(s, { company: "FIX", from: "2020-11-01", to: "2021-01-01", periods: "all" }));
  assert.equal(quiet.changed, 0);
  assert.equal(quiet.first_reported_between, 0);
  await assert.rejects(toolVintageDiff(s, { company: "FIX", from: "2021-01-01", to: "2020-01-01" }), /must be before/);
});

test("names people use reach the listed company", async () => {
  const map = files();
  map["/api/v1/company-tickers.json"] = Buffer.from(JSON.stringify({ tickers: { FIX: CIK, GOOGL: "0001652044" } }));
  const { s } = session(map);
  const google = await resolveCompany(s, "Google");
  assert.equal(google.cik, "0001652044");
  assert.equal(google.matched.by, "known_name");
});

test("companies resolve by ticker, dotted ticker or CIK; unknown ones say what to do", async () => {
  const { s } = session();
  assert.equal(out(await toolListConcepts(s, { company: "fix" })).company.cik, CIK);
  assert.equal(out(await toolListConcepts(s, { company: "123456" })).company.cik, CIK);
  await assert.rejects(toolListConcepts(s, { company: "BRK.B" }), /0001067983 is not in the Canli company reference/);
  await assert.rejects(toolListConcepts(s, { company: "ZZZZ" }), /"ZZZZ" is not a current ticker or a company name in the Canli company reference\. Former tickers are not listed: find_company searches by name/);
  // A site without the name index still answers tickers and CIKs, and says what it could not do.
  const { s: old } = session(files({ names: false }));
  assert.equal(out(await toolListConcepts(old, { company: "FIX" })).company.cik, CIK);
  await assert.rejects(toolListConcepts(old, { company: "ZZZZ" }), /not a ticker in the Canli company reference \(2 tickers\), and its name index could not be read/);
});

test("a company name resolves, and every result says how", async () => {
  const { s } = session(files({ extraCiks: [EXXON, "0001418091"] }));
  const fixture = out(await toolListConcepts(s, { company: "fixture corp." })).company;
  assert.equal(fixture.cik, CIK);
  assert.deepEqual(fixture.matched, { query: "fixture corp.", by: "name" });
  assert.equal(out(await toolListConcepts(s, { company: "Twitter" })).company.cik, "0001418091", "a company that no longer trades, by name");
  // XOM is the SEC's ticker for a new holding company the reference does not cover; the covered
  // filer with the same name is read, and the result says so.
  const xom = out(await toolKnownAsOf(s, { company: "XOM", as_of: "2020-01-01" })).company;
  assert.equal(xom.cik, EXXON);
  assert.equal(xom.matched.by, "same_name_as_ticker_holder");
  assert.match(xom.matched.note, /XOM is the SEC's ticker for ExxonMobil Holdings Corp \(CIK 0002115436\), which the Canli company reference does not cover; the covered filer with the same name was used\./);
  // A name several companies start with is never guessed: the error lists them, best first.
  await assert.rejects(toolListConcepts(s, { company: "Meta" }), /"Meta" matches 3 companies; pass one CIK as company: Meta Platforms, Inc\. \(CIK 0001326801\); Meta Materials Inc\. \(CIK 0001431959\); Metallus Inc\. \(CIK 0001598014\)\./);
  await assert.rejects(toolListConcepts(s, { company: "NEWCO" }), /NEWCO is the SEC's ticker for Brand New Holdings Inc \(CIK 0002200000\), which the Canli company reference does not cover\. "NEWCO" is not a current ticker or a company name/);
  // A ticker or CIK is read as before, with nothing added.
  assert.equal(out(await toolListConcepts(s, { company: "FIX" })).company.matched, undefined);
});

test("find_company: best match first, resolved only when one is clearly best, and where a ticker points", async () => {
  const { s } = session();
  const meta = out(await toolFindCompany(s, { query: "Meta" }));
  assert.equal(meta.resolved, undefined);
  assert.equal(meta.total, 3);
  assert.deepEqual(meta.rows.map((r) => [r[0], r[3]]), [["0001326801", "name_start"], ["0001431959", "name_start"], ["0001598014", "name_contains"]]);
  assert.equal(meta.tickers_as_of, "2026-09-19");
  const xom = out(await toolFindCompany(s, { query: "xom" }));
  assert.deepEqual(xom.resolved, { cik: EXXON, name: "Exxon Mobil Corporation", match: "same_name_as_ticker_holder" });
  assert.deepEqual(xom.ticker_holder, { ticker: "XOM", cik: "0002115436", name: "ExxonMobil Holdings Corp", in_reference: false });
  assert.equal(out(await toolFindCompany(s, { query: "FIX" })).resolved.match, "ticker");
  assert.equal(out(await toolFindCompany(s, { query: "123456" })).resolved.match, "cik");
  assert.equal(out(await toolFindCompany(s, { query: "Exxon Mobil Corp" })).resolved.match, "name");
  assert.equal(out(await toolFindCompany(s, { query: "Meta", limit: 1 })).rows.length, 1);
  // Several at the best level: the one with a current ticker is the one meant.
  assert.deepEqual(out(await toolFindCompany(s, { query: "Alphabet" })).resolved, { cik: "0001652044", name: "Alphabet Inc.", match: "name", also_matching: [{ cik: "0002100000", name: "Alphabet Holding Company, Inc.", tickers: [] }] });
  assert.deepEqual(out(await toolFindCompany(s, { query: "Toyota" })).resolved, { cik: "0001094517", name: "TOYOTA MOTOR CORP/", match: "name_start", also_matching: [{ cik: "0000834071", name: "Toyota Motor Credit Corporation", tickers: [] }] });
  assert.equal(out(await toolFindCompany(s, { query: "JPMorgan Chase" })).resolved.match, "name", "& Co drops like Inc");
  // The start of one name and no other: resolved. A word inside names is used only when it is the
  // single match at all.
  assert.equal(out(await toolFindCompany(s, { query: "Exxon" })).resolved.cik, EXXON);
  const mobil = out(await toolFindCompany(s, { query: "mobil" }));
  assert.deepEqual([mobil.total, mobil.resolved.match], [1, "name_words"]);
  assert.equal(out(await toolFindCompany(s, { query: "motor" })).resolved, undefined, "two Toyota names hold the word");
  const none = out(await toolFindCompany(s, { query: "Nothing Like It" }));
  assert.deepEqual([none.total, none.rows, none.resolved], [0, [], undefined]);
  await assert.rejects(toolFindCompany(s, { query: "" }), /find_company: query/);
});

test("a company renamed since the reference was captured is found by its new SEC name, and says so", async () => {
  const { s } = session();
  const here = out(await toolFindCompany(s, { query: "Here Group Limited" }));
  assert.deepEqual(here.resolved, { cik: "0001932770", name: "QuantaSing Group Limited", match: "name", matched_name: "Here Group Ltd" });
  assert.deepEqual(here.rows.map((r) => [r[0], r[3]]), [["0001932770", "name"], ["0000820318", "name_contains"]], "Coherent only holds the letters");
  assert.deepEqual(here.matched_by_other_name, [{ cik: "0001932770", sec_name: "Here Group Ltd" }]);
  const resolved = await resolveCompany(s, "Here Group");
  assert.equal(resolved.cik, "0001932770");
  assert.equal(resolved.matched.note, "Matched by Here Group Ltd, the name the SEC's ticker file gives CIK 0001932770; the Canli company reference names it QuantaSing Group Limited.");
  // The reference's own name still resolves, and says nothing about another name.
  const old = out(await toolFindCompany(s, { query: "QuantaSing" }));
  assert.deepEqual([old.resolved.cik, old.resolved.matched_name, old.matched_by_other_name], ["0001932770", undefined, undefined]);
  assert.equal((await resolveCompany(s, "HERE")).cik, "0001932770", "the ticker as before");
});

test("a snapshot whose hash does not match its record is refused", async () => {
  const { s } = session(files({ sha: "0".repeat(64) }));
  await assert.rejects(toolListConcepts(s, { company: "FIX" }), /does not match the SHA-256 its record publishes/);
  const { s: s2 } = session(files({ snapshot: gzipSync(Buffer.from(RAW.toString().replace("100", "999"))) }));
  await assert.rejects(toolListConcepts(s2, { company: "FIX" }), /does not match/);
});

test("the disk cache is keyed by hash, and memory keeps at most eight companies", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-fundamentals-"));
  const first = fakeFetch();
  await toolListConcepts(createSession({ base: "https://example.test", fetchImpl: first.impl, cacheDir: dir }), { company: "FIX" });
  assert.deepEqual(readdirSync(dir).sort(), [`${SHA}.json.gz`, `company-${CIK}.json`, "company-tickers.json"]);
  const second = fakeFetch();
  await toolListConcepts(createSession({ base: "https://example.test", fetchImpl: second.impl, cacheDir: dir }), { company: "FIX" });
  assert.ok(!second.calls.some((p) => p.startsWith("/company-data/sources/")), second.calls.join(", "));

  const extra = Array.from({ length: 9 }, (_, i) => String(900001 + i).padStart(10, "0"));
  const many = session(files({ extraCiks: extra }));
  for (const cik of extra) await toolListConcepts(many.s, { company: cik });
  assert.equal(many.s.companies.size, 8);
  assert.ok(!many.s.companies.has(extra[0]), "the least recently used company was evicted");
});

test("the disk cache is private: an owner-only directory and owner-only files", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "canli-fundamentals-")), "cache");
  await toolListConcepts(createSession({ base: "https://example.test", fetchImpl: fakeFetch().impl, cacheDir: dir }), { company: "FIX" });
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  const names = readdirSync(dir).sort();
  assert.deepEqual(names, [`${SHA}.json.gz`, `company-${CIK}.json`, "company-tickers.json"], "no temporary file is left behind");
  for (const name of names) assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600, name);
});

test("the ticker list and records are read from disk for six hours, then revalidated by ETag; a stale copy covers an outage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-fundamentals-"));
  const map = files();
  let down = false;
  const calls = [];
  const impl = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    const etag = `"${path.length}"`;
    calls.push([path, opts.headers?.["if-none-match"] ?? null]);
    if (down) throw new TypeError("fetch failed");
    if (opts.headers?.["if-none-match"] === etag) return new Response(null, { status: 304, headers: { etag } });
    return map[path] ? new Response(map[path], { status: 200, headers: { etag } }) : new Response("not found", { status: 404 });
  };
  const t0 = Date.parse("2026-09-27T12:00:00Z");
  const run = (now) => toolListConcepts(createSession({ base: "https://example.test", fetchImpl: impl, cacheDir: dir, now: () => now }), { company: "FIX" });
  await run(t0);
  assert.deepEqual(calls.map(([p]) => p), ["/api/v1/company-tickers.json", `/company-data/${CIK}.json`, `/company-data/sources/${SHA}.json.gz`]);
  calls.length = 0;
  await run(t0 + 5 * 3600e3);
  assert.deepEqual(calls, [], "a fresh copy costs no request");
  await run(t0 + 7 * 3600e3);
  assert.deepEqual(calls, [["/api/v1/company-tickers.json", `"${"/api/v1/company-tickers.json".length}"`], [`/company-data/${CIK}.json`, `"${`/company-data/${CIK}.json`.length}"`]], "a stale copy is revalidated, and a 304 keeps it");
  calls.length = 0;
  await run(t0 + 8 * 3600e3);
  assert.deepEqual(calls, [], "the 304 renewed the copy");
  down = true;
  assert.equal(out(await run(t0 + 30 * 3600e3)).company.cik, CIK, "a stale copy is used when the site cannot be reached");
});

test("results stay under 12,000 characters and page with offset; a scan over every concept keeps no series in memory", async () => {
  const { s } = session();
  const all = out(await toolListConcepts(s, { company: "FIX" }));
  const first = out(await toolListConcepts(s, { company: "FIX", limit: 3 }));
  assert.equal(first.rows.length, 3);
  assert.equal(first.next_offset, 3);
  const second = out(await toolListConcepts(s, { company: "FIX", limit: 3, offset: 3 }));
  assert.deepEqual(second.rows, all.rows.slice(3, 6));
  const last = out(await toolListConcepts(s, { company: "FIX", offset: all.rows.length - 1 }));
  assert.equal(last.rows.length, 1);
  assert.equal(last.next_offset, undefined);
  const e = await loadCompany(s, "FIX");
  await toolRestatements(s, { company: "FIX", periods: "all" });
  assert.equal(e.series.size, 0, "list_concepts and a full restatements scan build series without keeping them");
  await toolHistory(s, { company: "FIX", concept: "revenue" });
  assert.equal(e.series.size, 1, "a series read by name is kept");
  for (const r of [all, first, out(await toolRestatements(s, { company: "FIX", periods: "all", include_splits: true }))]) assert.ok(JSON.stringify(r).length < 12000);
});

test("inputs are validated before anything is fetched", async () => {
  const { s, calls } = session();
  await assert.rejects(toolKnownAsOf(s, { company: "FIX", as_of: "31/12/2019" }), /as_of: a date as YYYY-MM-DD/);
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", surprise: 1 }), /history:/);
  assert.deepEqual(calls, []);
});

test("known_as_of ratios: every input as filed by as_of, one period, averages across the year, and a restatement filed later is not used", async () => {
  const { s } = session();
  const ratioRows = (res) => Object.fromEntries(res.ratios.rows.map((row) => [row[0], Object.fromEntries(res.ratios.columns.map((c, i) => [c, row[i]]))]));
  // After the 2020 10-K: fiscal 2020 throughout, and the 10-K/A's restated assets (520) for the start.
  const late = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-11-01", ratios: true, changed_after: true }));
  assert.deepEqual(late.ratios.period, { start: "2019-10-01", end: "2020-09-30" });
  const r = ratioRows(late);
  assert.equal(r.gross_margin.value, 0.4);
  assert.equal(r.operating_margin.value, 0.2);
  assert.equal(r.net_margin.value, 0.1);
  assert.equal(r.return_on_equity.value, 0.2, "11 over the average of 50 and 60");
  assert.equal(r.return_on_assets.value, 0.0196429, "11 over the average of 600 and 520");
  assert.equal(r.liabilities_to_equity.value, 9);
  assert.equal(r.free_cash_flow.value, 22);
  assert.equal(r.free_cash_flow.unit, "USD");
  assert.equal(r.free_cash_flow_margin.value, 0.2);
  assert.deepEqual(r.return_on_assets.inputs.map((x) => [x[0], x[1], x[2]]), [["net_income", 11, "2020-09-30"], ["assets", 600, "2020-09-30"], ["assets", 520, "2019-09-30"]]);
  assert.equal(r.net_margin.changed_after, false);
  // Before the 10-K/A was filed (2020-01-15): fiscal 2019, and the assets as first reported (500).
  const early = ratioRows(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-10", ratios: true, changed_after: true })));
  assert.deepEqual(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-10", ratios: true })).ratios.columns, ["ratio", "value", "unit", "basis", "inputs"], "not asked for, no changed_after");
  assert.equal(early.return_on_assets.value, 0.018, "9 over 500: the restated 520 was not known yet");
  assert.match(early.return_on_assets.basis, /balance at the period's end/);
  assert.equal(early.net_margin.value, 0.09, "fiscal 2019 revenue as first reported, 100");
  assert.equal(early.net_margin.changed_after, true, "revenue for fiscal 2019 was later restated to 90");
  assert.equal(ratioRows(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-20", ratios: true }))).return_on_assets.value, round(9 / 520));
  // Quarterly: margins only where both inputs exist for the quarter; no ROE or ROA.
  const q = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-11-01", periods: "quarterly", ratios: true }));
  assert.ok(q.ratios.missing.some((m) => /annual periods only/.test(m)));
  // Without ratios, nothing is added.
  assert.equal(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-11-01" })).ratios, undefined);
});
const round = (x) => Number(x.toPrecision(6));

test("cross_section: one row per company in the order asked, each value as filed by as_of, unknowns named, nothing kept in memory", async () => {
  const extra = ["0000900001", "0000900002"];
  const { s } = session(files({ extraCiks: extra }));
  const col = (res) => (name) => res.columns.indexOf(name);
  const late = out(await toolCrossSection(s, { companies: ["0000900002", "FIX", "ZZZZ", "0000900001"], concept: "assets", as_of: "2020-11-01" }));
  const c = col(late);
  assert.deepEqual(late.rows.map((r) => r[c("company")]), ["0000900002", "FIX", "0000900001"], "the order asked, unknown left out of rows");
  assert.deepEqual(late.rows.map((r) => [r[c("end")], r[c("val")]]), [["2020-09-30", 600], ["2020-09-30", 600], ["2020-09-30", 600]]);
  assert.equal(late.missing.length, 1);
  assert.match(late.missing[0], /^ZZZZ: "ZZZZ" is not a current ticker or a company name/);
  // Before the 10-K/A (2020-01-15), the 2019 year-end assets as first reported, flagged as later changed when asked.
  assert.equal(out(await toolCrossSection(s, { companies: ["FIX"], concept: "assets", as_of: "2020-01-10" })).columns.includes("changed_after"), false);
  const early = out(await toolCrossSection(s, { companies: ["FIX"], concept: "assets", as_of: "2020-01-10", changed_after: true }));
  const e = col(early);
  assert.deepEqual([early.rows[0][e("end")], early.rows[0][e("val")], early.rows[0][e("changed_after")]], ["2019-09-30", 500, true]);
  const byName = out(await toolCrossSection(s, { companies: ["Fixture Corp"], concept: "revenue", as_of: "2020-11-01" }));
  assert.equal(byName.rows[0][col(byName)("matched_by")], "name");
  assert.equal(byName.rows[0][col(byName)("val")], 110);
  assert.equal(s.companies.size, 0, "a cross-section keeps no company index in memory");
  const none = out(await toolCrossSection(s, { companies: ["FIX"], concept: "revenue", as_of: "2010-01-01" }));
  assert.deepEqual([none.rows.length, none.missing], [0, ["FIX: no annual revenue filed by 2010-01-01"]]);
  await assert.rejects(toolCrossSection(s, { companies: Array.from({ length: 51 }, () => "FIX"), concept: "assets", as_of: "2020-01-01" }), /cross_section: companies/);
  await assert.rejects(toolCrossSection(s, { companies: [], concept: "assets", as_of: "2020-01-01" }), /cross_section: companies/);
});

test("a quarter is stale once a later fiscal year has been filed: the fourth quarter is only inside the annual report", async () => {
  const { s } = session();
  const quarter = async (asOf) => {
    const r = out(await toolKnownAsOf(s, { company: "FIX", as_of: asOf, periods: "quarterly", concepts: ["revenue"] }));
    const row = byCol(r)[0];
    return [row.end, row.stale];
  };
  // The 16-week second quarter (to 2020-04-21) is the newest quarter all year; once the fiscal 2020
  // 10-K (to 2020-09-30) is filed on 2020-10-29, the company has published a later period.
  assert.deepEqual(await quarter("2020-06-01"), ["2020-04-21", false]);
  assert.deepEqual(await quarter("2020-11-01"), ["2020-04-21", true]);
  const xs = out(await toolCrossSection(s, { companies: ["FIX"], concept: "revenue", as_of: "2020-11-01", periods: "quarterly" }));
  assert.equal(byCol(xs)[0].stale, true);
});

test("two filers with the same name: the listed one is used, and the answer names the other", async () => {
  const { s } = session();
  const r = await resolveCompany(s, "Star Equity Holdings");
  assert.equal(r.cik, "0001210708");
  assert.match(r.matched.note, /Also named "Star Equity Holdings": Star Equity Holdings, Inc\. \(CIK 0000707388, no current ticker\)\. This is STAR EQUITY HOLDINGS, INC\. \(CIK 0001210708\), the one with a current ticker; pass another CIK/);
  assert.equal((await resolveCompany(s, "Twitter")).matched.note, undefined, "a single best match carries no note");
});

test("history takes several concepts in one call, each series as a single call gives it", async () => {
  const { s } = session();
  const both = out(await toolHistory(s, { company: "FIX", concepts: ["revenue", "assets"], basis: "latest" }));
  assert.deepEqual(both.series.map((x) => x.concept.name), ["revenue", "assets"]);
  const alone = out(await toolHistory(s, { company: "FIX", concept: "assets", basis: "latest" }));
  assert.deepEqual(both.series[1].rows, alone.rows);
  assert.equal(both.company.cik, alone.company.cik);
  await assert.rejects(toolHistory(s, { company: "FIX" }), /send concept \(one measure\) or concepts/);
  // Both together mean all of them: some clients make a model fill every optional field.
  const merged = out(await toolHistory(s, { company: "FIX", concept: "assets", concepts: ["revenue", "assets"] }));
  assert.equal(merged.series.length, 2);
});

test("history says what span the data covers, so a question outside it is answered as not reported", async () => {
  const { s } = session();
  const r = out(await toolHistory(s, { company: "FIX", concept: "revenue" }));
  assert.equal(r.covers.first_end, "2018-09-30"); assert.equal(r.covers.last_end, "2020-09-30");
  assert.match(r.covers.note, /No annual value for this measure before 2018-09-30/);
});

test("history defaults to the latest value; as_of is a filing date, and a period ending on it is pointed out", async () => {
  const { s } = session();
  const r = out(await toolHistory(s, { company: "FIX", concept: "revenue" }));
  assert.equal(r.basis, "latest");
  assert.equal(byCol(r).find((x) => x.end === "2019-09-30").val, 90);
  const trap = out(await toolHistory(s, { company: "FIX", concept: "revenue", as_of: "2020-09-30" }));
  assert.match(trap.as_of_note, /A period ends on 2020-09-30, but it was filed after that date/);
  assert.equal(out(await toolHistory(s, { company: "FIX", concept: "revenue", as_of: "2020-06-30" })).as_of_note, undefined);
});

test("history lists balances an annual report carries on a date that is not a year end, apart from the yearly rows", async () => {
  const { createHash } = await import("node:crypto");
  const { FACTS, SNAPSHOT_PATH } = await import("./fixture.mjs");
  const facts = structuredClone(FACTS);
  // The 10-K for 2020 also carries the 2019-12-31 balance (an opening balance after a new standard).
  const assets = facts.facts["us-gaap"].Assets.units.USD;
  assets.push({ ...assets.find((r) => r.end === "2019-12-31"), val: 515, filed: "2020-10-29", form: "10-K", accn: "0000123456-20-000020", fy: 2020, fp: "FY" });
  const raw = Buffer.from(JSON.stringify(facts)), sha = createHash("sha256").update(raw).digest("hex");
  const map = files({ sha });
  map[SNAPSHOT_PATH] = gzipSync(raw);
  const s = createSession({ base: "https://example.test", fetchImpl: fakeFetch(map).impl, cacheDir: "" });
  const r = out(await toolHistory(s, { company: "FIX", concept: "assets" }));
  assert.deepEqual(byCol(r).map((x) => x.end), ["2021-09-30", "2020-09-30", "2019-09-30"], "year ends only in the rows");
  assert.equal(byCol(r).find((x) => x.end === "2020-09-30").change_pct, 15.3846, "change against the year end before (520), never the other date");
  assert.deepEqual(r.other_dates.rows.map((x) => [x[0], x[1], x[3]]), [["2019-12-31", 515, "10-K"]]);
  // Without an annual report carrying it, an interim balance stays out.
  assert.equal(out(await toolHistory(session().s, { company: "FIX", concept: "assets" })).other_dates, undefined);
});

test("a proxy statement's pay table is not a filing of the results: Arista's 3,511 never replaces $3.5114 billion", () => {
  const row = (val, form, filed) => ({ start: "2025-01-01", end: "2025-12-31", val, form, filed, accn: `a-${filed}`, fy: 2025, fp: "FY" });
  const index = indexFacts({ facts: { "us-gaap": { NetIncomeLoss: { units: { USD: [row(3511400000, "10-K", "2026-02-17"), row(3511, "DEF 14A", "2026-04-16")] } } } } });
  const vintages = index.get("us-gaap:NetIncomeLoss").units.USD[0].vintages;
  assert.deepEqual(vintages.map((v) => [v.val, v.form]), [[3511400000, "10-K"]]);
});

test("an 8-K does not restate a company's year: Essential Utilities' merger 8-K never replaces its $2.47 billion", () => {
  const row = (val, form, filed) => ({ start: "2025-01-01", end: "2025-12-31", val, form, filed, accn: `a-${filed}`, fy: 2025, fp: "FY" });
  const index = indexFacts({ facts: { "us-gaap": { Revenues: { units: { USD: [row(2474610000, "10-K", "2026-02-26"), row(5121000000, "8-K", "2026-03-30")] } } } } });
  const p = index.get("us-gaap:Revenues").units.USD[0];
  assert.deepEqual(p.vintages.map((v) => [v.val, v.form]), [[2474610000, "10-K"]], "the periodic report's value stands");
  assert.deepEqual(p.setApart.map((v) => [v.val, v.form, v.why]), [[5121000000, "8-K", "8-K"]], "the 8-K's value is kept apart");
  // A period only an 8-K carries keeps its 8-K value (nothing periodic to prefer).
  const only = indexFacts({ facts: { "us-gaap": { Revenues: { units: { USD: [row(5121000000, "8-K", "2026-03-30")] } } } } });
  assert.deepEqual(only.get("us-gaap:Revenues").units.USD[0].vintages.map((v) => v.form), ["8-K"]);
});

test("a pay-versus-performance table is not a restatement: Genco's 10-K/A $(4.5) million never replaces the 10-K's $4,366,000", () => {
  const row = (val, form, filed) => ({ start: "2025-01-01", end: "2025-12-31", val, form, filed, accn: `a-${filed}`, fy: 2025, fp: "FY" });
  const y24 = (val, form, filed) => ({ ...row(val, form, filed), start: "2024-01-01", end: "2024-12-31" });
  const p = indexFacts({ facts: { "us-gaap": { ProfitLoss: { units: { USD: [row(-4366000, "10-K", "2026-02-18"), row(-4500000, "10-K/A", "2026-04-30"), y24(76401000, "10-K", "2026-02-18"), y24(76500000, "10-K/A", "2026-04-30")] } } } } }).get("us-gaap:ProfitLoss").units.USD[0];
  assert.deepEqual(p.vintages.map((v) => v.val), [-4366000]);
  assert.deepEqual(p.setApart.map((v) => [v.val, v.why]), [[-4500000, "rounded repeat in an amendment"]]);
  // A real restatement stays one: Richtech's 10-K/A restated an operating loss to a round $17,200,000, but its
  // 2024 figure ($7,780,000) is not round; and a lone round value is never enough.
  const real = (val, other) => indexFacts({ facts: { "us-gaap": { OperatingIncomeLoss: { units: { USD: [row(-17944000, "10-K", "2026-01-20"), row(val, "10-K/A", "2026-08-07"), ...(other ? [y24(-7700000, "10-K", "2025-01-20"), y24(other, "10-K/A", "2026-08-07")] : [])] } } } } }).get("us-gaap:OperatingIncomeLoss").units.USD[0].vintages.map((v) => v.val);
  assert.deepEqual(real(-17200000, -7780000), [-17944000, -17200000]);
  assert.deepEqual(real(-17200000), [-17944000, -17200000]);
  assert.deepEqual(real(-6000000, -7800000), [-17944000, -6000000], "round but far from the first value");
});

test("a 10-Q does not restate a full year: Comfort Systems' $1.83 billion never replaces the 10-K's $9.1 billion", () => {
  const row = (val, form, filed) => ({ start: "2025-01-01", end: "2025-12-31", val, form, filed, accn: `a-${filed}`, fy: 2025, fp: "FY" });
  const index = indexFacts({ facts: { "us-gaap": { Revenues: { units: { USD: [row(9101641000, "10-K", "2026-02-19"), row(1831286000, "10-Q", "2026-04-23")] } } } } });
  assert.deepEqual(index.get("us-gaap:Revenues").units.USD[0].vintages.map((v) => v.val), [9101641000]);
});
