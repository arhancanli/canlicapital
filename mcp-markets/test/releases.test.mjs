// earnings_release on real results releases and the ones before them
// (scripts/capture-analyst-fixtures.mjs): Lululemon's second quarter of 2026 (a revenue decline
// guided and missed, EPS beaten), NVIDIA's second quarter of fiscal 2027 (plus or minus guidance)
// and Walmart's second quarter of fiscal 2027 (guidance tables).
import assert from "node:assert/strict";
import test from "node:test";

import { earningsRelease } from "../src/releases.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
const col = (block, name) => block.columns.indexOf(name);
const rows = (block, measure, unit) => block.rows.filter((r) => r[0] === measure && (!unit || r[col(block, "unit")] === unit));

test("Lululemon: the release, its guidance, and last quarter's guidance against these results", async () => {
  const r = await earningsRelease(session(), { company: "1397187", accession: "0001397187-26-000126" });
  assert.equal(r.release.headline, "LULULEMON ATHLETICA INC. ANNOUNCES SECOND QUARTER FISCAL 2026 RESULTS");
  assert.equal(r.release.document, "lulu-20260802xex991.htm");
  const g = r.guidance;
  const [quarterRev] = rows(g, "revenue", "USD billion");
  assert.deepEqual(quarterRev.slice(1, 7), [null, "third quarter of 2026", 2.29, 2.32, 2.305, "USD billion"]);
  assert.deepEqual(rows(g, "revenue", "%")[0].slice(3, 6), [-11, -10, -10.5], "a decline of 10% to 11% is negative growth");
  assert.deepEqual(rows(g, "eps").map((x) => [x[col(g, "period")], x[3], x[4]]), [["third quarter of 2026", 0.93, 0.98], ["2026", 9.48, 9.73]]);
  const c = r.previous_guidance_vs_results;
  assert.equal(c.previous_release.accession, "0001397187-26-000077");
  assert.deepEqual(c.quarter, { quarter: 2, year: 2026 });
  const at = (m, u) => c.rows.find((x) => x[0] === m && x[col(c, "unit")] === u);
  assert.deepEqual(at("revenue", "%").slice(4, 12), [-3, -2, -4, -1, -2, -100, -200, "below the range"]);
  assert.match(at("revenue", "USD billion")[col(c, "position")], /^not placed: the result is stated to 1 decimal/);
  assert.deepEqual(at("eps", "USD per share").slice(4, 7), [1.76, 1.81, 2.92]);
  assert.equal(at("eps", "USD per share")[col(c, "position")], "above the range");
  assert.ok(!c.rows.some((x) => x[col(c, "guided_low")] === 10.95), "the year's guidance is not set against a quarter");
});

test("NVIDIA: plus-or-minus guidance as ranges, and the quarter's revenue above its guided range", async () => {
  const r = await earningsRelease(session(), { company: "NVDA", accession: "0001045810-26-000073" });
  const g = r.guidance;
  assert.deepEqual(rows(g, "revenue", "USD billion")[0].slice(2, 7), ["third quarter of fiscal 2027", 105.84, 110.16, 108, "USD billion"]);
  assert.equal(rows(g, "revenue", "USD billion")[0][col(g, "width_pct_of_mid")], 4);
  const c = r.previous_guidance_vs_results;
  const rev = c.rows.find((x) => x[0] === "revenue");
  assert.deepEqual(rev.slice(4, 7), [89.18, 92.82, 96.2]);
  assert.equal(rev[col(c, "position")], "above the range");
  assert.ok(c.rows.filter((x) => x[0] === "gross_margin").every((x) => x[col(c, "position")] === "within the range"));
  // The company's results first; Data Center's under its name; each change says what it is measured against.
  const res = r.results, at = (name) => col(res, name);
  assert.deepEqual(res.rows.slice(0, 3).map((x) => [x[0], x[1], x[at("versus")], x[at("section")]]), [["revenue", 96.2, null, null], ["revenue", 106, "year over year", null], ["revenue", 18, "quarter over quarter", null]]);
  assert.deepEqual(res.rows.filter((x) => x[at("section")] === "Data Center").map((x) => [x[1], x[at("unit")], x[at("versus")]]), [[89, "USD billion", null], [117, "%", "year over year"], [18, "%", "quarter over quarter"]]);
});

test("Walmart: guidance tables, and last quarter's table guidance against this quarter", async () => {
  const r = await earningsRelease(session(), { company: "104169", accession: "0000104169-26-000145" });
  const g = r.guidance;
  const eps = g.rows.filter((x) => x[0] === "eps").map((x) => [x[col(g, "period")], x[3], x[4]]);
  assert.deepEqual(eps, [["Q3", 0.62, 0.64], ["FY27", 2.8, 2.87], ["Fiscal year 2027", 2.75, 2.85]], "the quarter, the year as raised (stated once though the text and the table both give it), the year as first given");
  const c = r.previous_guidance_vs_results;
  const beat = c.rows.find((x) => x[0] === "eps");
  assert.deepEqual(beat.slice(1, 7), ["adjusted", "Second quarter", "USD per share", 0.72, 0.74, 0.81]);
  const cc = c.rows.find((x) => x[0] === "revenue" && x[1] === "constant currency");
  assert.deepEqual(cc.slice(4, 12), [4, 5, 5.1, 1.1, 0.1, 110, 10, "above the range"]);
  assert.ok(r.tables.rows.length > 5);
  // The gross profit rate's change is the margin's; impacts, boilerplate and headwinds are not results.
  const res = r.results, at = (name) => col(res, name);
  const all = (await earningsRelease(session(), { company: "104169", accession: "0000104169-26-000145", max_lines: 40 })).results.rows;
  assert.ok(all.some((x) => x[0] === "gross_margin" && x[1] === 96 && x[at("unit")] === "bps" && x[at("change")] === "change"));
  assert.ok(!all.some((x) => x[1] === 713 || x[1] === 0.1 || x[at("unit")] === "bps" && x[1] === 80), "not the About section's revenue, a currency impact or a headwind");
  assert.deepEqual(all.filter((x) => /eCommerce/.test(x[at("section")] ?? "")).map((x) => [x[1], x[at("section")]]), [[23, "eCommerce"], [24, "Walmart U.S. eCommerce"], [19, "Walmart International eCommerce"], [26, "Sam's Club U.S. eCommerce"]]);
});

test("compare false skips the previous release; an accession that is not a results release is refused", async () => {
  const r = await earningsRelease(session(), { company: "NVDA", accession: "0001045810-26-000073", compare: false });
  assert.equal(r.previous_guidance_vs_results, undefined);
  await assert.rejects(earningsRelease(session(), { company: "NVDA", accession: "0001045810-26-999999" }), (err) => err instanceof NotFound && /not one of NVIDIA/.test(err.message));
});
