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
  toolHistory,
  toolKnownAsOf,
  toolListConcepts,
  toolRestatements,
  toolVintages,
} from "../src/server.mjs";
import { CIK, RAW, SHA, fakeFetch, files } from "./fixture.mjs";

const session = (map) => {
  const f = fakeFetch(map);
  return { s: createSession({ base: "https://example.test", fetchImpl: f.impl, cacheDir: "" }), calls: f.calls };
};
const out = (r) => r.structuredContent;
const byCol = (res) => res.rows.map((row) => Object.fromEntries(res.columns.map((c, i) => [c, row[i]])));
const get = (rows, concept) => rows.find((r) => r.concept === concept);

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

test("history: latest and quarterly periods, including a 16-week quarter; prospectus figures are never vintages", async () => {
  const { s } = session();
  const latest = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", basis: "latest" })));
  assert.deepEqual(latest.map((r) => [r.end, r.val]), [["2020-09-30", 110], ["2019-09-30", 90]], "the 424B2 figure of 999 is not a vintage");
  const quarterly = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", periods: "quarterly" })));
  assert.deepEqual(quarterly.map((r) => [r.end, r.val]), [["2020-04-21", 40], ["2019-12-31", 30]]);
  const all = out(await toolHistory(s, { company: "FIX", concept: "Revenues", periods: "all" }));
  assert.equal(all.total, 5, "the six-month figure appears only under all");
});

test("a plain name follows the measure across a tag change, and each value names its tag", async () => {
  const { s } = session();
  const first = out(await toolHistory(s, { company: "FIX", concept: "revenue" }));
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
  const exact = out(await toolHistory(s, { company: "FIX", concept: "Assets" }));
  assert.deepEqual(exact.concept.tags, ["ifrs-full:Assets", "Assets"], "the IFRS series, still reported, comes first");
  assert.deepEqual(byCol(exact).map((r) => [r.end, r.val, r.tag]), [["2021-09-30", 700, "ifrs-full:Assets"], ["2019-09-30", 500, "Assets"]]);
  assert.deepEqual(byCol(out(await toolHistory(s, { company: "FIX", concept: "assets" }))).map((r) => r.val), [700, 500]);
  const usgaap = out(await toolHistory(s, { company: "FIX", concept: "us-gaap:Assets" }));
  assert.deepEqual(usgaap.concept.tags, ["Assets"]);
});

test("known_as_of: values as they stood, across tag and taxonomy changes, with stale and snapshot flags", async () => {
  const { s } = session();
  const before = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2019-12-31" }));
  const b = byCol(before);
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
  assert.equal(all.concepts, 11, "ffd:FeeRate is left out");
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

test("companies resolve by ticker, dotted ticker or CIK; unknown ones say what to do", async () => {
  const { s } = session();
  assert.equal(out(await toolListConcepts(s, { company: "fix" })).company.cik, CIK);
  assert.equal(out(await toolListConcepts(s, { company: "123456" })).company.cik, CIK);
  await assert.rejects(toolListConcepts(s, { company: "BRK.B" }), /0001067983 is not in the Canli company reference/);
  await assert.rejects(toolListConcepts(s, { company: "ZZZZ" }), /not a ticker in the Canli company reference \(2 tickers\)/);
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
  assert.deepEqual(readdirSync(dir), [`${SHA}.json.gz`]);
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
  assert.equal(statSync(join(dir, `${SHA}.json.gz`)).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir), [`${SHA}.json.gz`], "no temporary file is left behind");
});

test("inputs are validated before anything is fetched", async () => {
  const { s, calls } = session();
  await assert.rejects(toolKnownAsOf(s, { company: "FIX", as_of: "31/12/2019" }), /as_of: a date as YYYY-MM-DD/);
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", surprise: 1 }), /history:/);
  assert.deepEqual(calls, []);
});
