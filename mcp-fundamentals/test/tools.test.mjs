// Every tool against a companyfacts fixture whose answers are known, through the same fetch path
// the live server uses.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
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

test("period kinds: 52/53-week years are annual, 13-week quarters quarterly, YTD other; balances take their first report's kind", () => {
  assert.equal(durationKind("2018-09-30", "2019-09-28"), "annual");
  assert.equal(durationKind("2019-09-29", "2020-10-03"), "annual");
  assert.equal(durationKind("2019-09-29", "2019-12-28"), "quarterly");
  assert.equal(durationKind("2019-10-01", "2020-03-31"), "other");
  assert.equal(instantKind("10-K"), "annual");
  assert.equal(instantKind("10-K/A"), "annual");
  assert.equal(instantKind("20-F"), "annual");
  assert.equal(instantKind("10-Q"), "quarterly");
  assert.equal(instantKind("8-K"), "other");
});

test("history: first_reported, latest and as_of give the value each basis promises", async () => {
  const { s } = session();
  const first = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues" })));
  assert.deepEqual(first.map((r) => [r.end, r.val, r.changed]), [["2020-09-30", 110, false], ["2019-09-30", 100, true]]);
  const latest = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", basis: "latest" })));
  assert.deepEqual(latest.map((r) => [r.end, r.val, r.filed, r.changed]), [["2020-09-30", 110, "2020-10-29", false], ["2019-09-30", 90, "2020-10-29", true]]);
  const asOf = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", basis: "as_of", as_of: "2020-06-30" })));
  assert.deepEqual(asOf.map((r) => [r.end, r.val, r.changed]), [["2019-09-30", 100, true]], "FY2020 was not filed yet and FY2019 was not yet restated");
  const quarterly = byCol(out(await toolHistory(s, { company: "FIX", concept: "Revenues", periods: "quarterly" })));
  assert.deepEqual(quarterly.map((r) => [r.end, r.val]), [["2019-12-31", 30]]);
  const all = out(await toolHistory(s, { company: "FIX", concept: "Revenues", periods: "all" }));
  assert.equal(all.total, 4, "the six-month YTD figure appears only under all");
});

test("history: as_of needs a date; unknown concepts suggest close matches", async () => {
  const { s } = session();
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", basis: "as_of" }), /needs an as_of date/);
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenue" }), /Close matches: Revenues, SalesRevenueNet/);
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", unit: "EUR" }), /reported in USD, not EUR/);
});

test("known_as_of: values as they stood, the right revenue tag, and a flag on later restatements", async () => {
  const { s } = session();
  const before = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2019-12-31" })));
  const get = (rows, concept) => rows.find((r) => r.concept === concept);
  assert.equal(get(before, "Revenues").val, 100);
  assert.equal(get(before, "Revenues").changed_after, true);
  assert.equal(get(before, "Assets").val, 500, "the 10-K/A of 2020-01-15 was not yet filed");
  assert.equal(get(before, "Assets").changed_after, true);
  assert.equal(get(before, "EarningsPerShareDiluted").unit, "USD/shares");

  const after = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-02-01" })));
  assert.equal(get(after, "Assets").val, 520, "the amendment counts once filed");
  const sameDay = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-15", concepts: ["Assets"] })));
  assert.equal(sameDay[0].val, 520, "a filing made on the as_of date counts");
  const dayBefore = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-14", concepts: ["Assets"] })));
  assert.equal(dayBefore[0].val, 500);

  const early = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2018-12-31" }));
  assert.equal(byCol(early)[0].concept, "SalesRevenueNet", "before Revenues existed, the older revenue tag answers");
  assert.ok(early.missing.includes("Assets"));

  const q = byCol(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-02-01", periods: "quarterly", concepts: ["Revenues", "Assets"] })));
  assert.deepEqual(q.map((r) => [r.concept, r.end, r.val]), [["Revenues", "2019-12-31", 30], ["Assets", "2019-12-31", 510]]);

  await assert.rejects(toolKnownAsOf(s, { company: "FIX", as_of: "2020-02-01", concepts: ["NoSuchThing"] }), /reports no concept named NoSuchThing/);
});

test("restatements: the changed periods with first and latest values", async () => {
  const { s } = session();
  const r = out(await toolRestatements(s, { company: "FIX" }));
  assert.equal(r.changed, 2);
  const rows = byCol(r);
  assert.deepEqual(rows.map((x) => [x.concept, x.end, x.first_val, x.latest_val, x.change_pct, x.filings]), [
    ["Revenues", "2019-09-30", 100, 90, -10, 2],
    ["Assets", "2019-09-30", 500, 520, 4, 2],
  ]);
  assert.equal(out(await toolRestatements(s, { company: "FIX", min_change_pct: 5 })).changed, 1);
  assert.equal(out(await toolRestatements(s, { company: "FIX", since: "2020-01-01" })).changed, 0);
  assert.equal(out(await toolRestatements(s, { company: "FIX", concept: "Assets" })).changed, 1);
});

test("vintages: every filing of one period, oldest first", async () => {
  const { s } = session();
  const r = out(await toolVintages(s, { company: CIK, concept: "Assets", end: "2019-09-30" }));
  assert.deepEqual(byCol(r).map((x) => [x.filed, x.form, x.val]), [["2019-10-30", "10-K", 500], ["2020-01-15", "10-K/A", 520]]);
  assert.match(r.filing_url, /edgar\/data\/123456\//);
  const two = out(await toolVintages(s, { company: "FIX", concept: "Revenues", end: "2019-12-31" }));
  assert.equal(two.rows.length, 1);
  await assert.rejects(toolVintages(s, { company: "FIX", concept: "Revenues", end: "2001-01-01" }), /no Revenues period ending 2001-01-01/);
});

test("list_concepts: counts, search and taxonomy prefixes", async () => {
  const { s } = session();
  const all = out(await toolListConcepts(s, { company: "FIX" }));
  assert.equal(all.concepts, 5);
  assert.ok(byCol(all).some((r) => r.concept === "dei:EntityCommonStockSharesOutstanding"));
  const rev = byCol(out(await toolListConcepts(s, { company: "FIX", search: "revenue" })));
  assert.deepEqual(rev.map((r) => [r.concept, r.changed_periods]), [["Revenues", 1], ["SalesRevenueNet", 0]]);
  const shares = out(await toolHistory(s, { company: "FIX", concept: "dei:EntityCommonStockSharesOutstanding", periods: "all" }));
  assert.equal(shares.concept.unit, "shares");
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

test("the disk cache is keyed by hash: a second session reads the snapshot without downloading it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "canli-fundamentals-"));
  const first = fakeFetch();
  await toolListConcepts(createSession({ base: "https://example.test", fetchImpl: first.impl, cacheDir: dir }), { company: "FIX" });
  assert.deepEqual(readdirSync(dir), [`${SHA}.json.gz`]);
  const second = fakeFetch();
  await toolListConcepts(createSession({ base: "https://example.test", fetchImpl: second.impl, cacheDir: dir }), { company: "FIX" });
  assert.ok(!second.calls.some((p) => p.startsWith("/company-data/sources/")), second.calls.join(", "));
  const within = session();
  await toolListConcepts(within.s, { company: "FIX" });
  await toolHistory(within.s, { company: "FIX", concept: "Assets" });
  assert.equal(within.calls.filter((p) => p.startsWith("/company-data/")).length, 2, "one record and one snapshot per session");
});

test("inputs are validated before anything is fetched", async () => {
  const { s, calls } = session();
  await assert.rejects(toolKnownAsOf(s, { company: "FIX", as_of: "31/12/2019" }), /as_of: a date as YYYY-MM-DD/);
  await assert.rejects(toolHistory(s, { company: "FIX", concept: "Revenues", surprise: 1 }), /history:/);
  assert.deepEqual(calls, []);
});
