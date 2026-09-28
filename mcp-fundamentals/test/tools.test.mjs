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
  toolFindCompany,
  toolHistory,
  toolKnownAsOf,
  toolListConcepts,
  toolRestatements,
  toolVintages,
} from "../src/server.mjs";
import { CIK, EXXON, RAW, SHA, fakeFetch, files } from "./fixture.mjs";

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
  assert.deepEqual(byCol(exact).map((r) => [r.end, r.val, r.tag]), [["2021-09-30", 700, "ifrs-full:Assets"], ["2020-09-30", 600, "Assets"], ["2019-09-30", 500, "Assets"]]);
  assert.deepEqual(byCol(out(await toolHistory(s, { company: "FIX", concept: "assets" }))).map((r) => r.val), [700, 600, 500]);
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
  assert.deepEqual(out(await toolFindCompany(s, { query: "Alphabet" })).resolved, { cik: "0001652044", name: "Alphabet Inc.", match: "name" });
  assert.deepEqual(out(await toolFindCompany(s, { query: "Toyota" })).resolved, { cik: "0001094517", name: "TOYOTA MOTOR CORP/", match: "name_start" });
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
  const late = out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-11-01", ratios: true }));
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
  const early = ratioRows(out(await toolKnownAsOf(s, { company: "FIX", as_of: "2020-01-10", ratios: true })));
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
