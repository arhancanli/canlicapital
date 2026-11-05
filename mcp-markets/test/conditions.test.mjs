import assert from "node:assert/strict";
import { test } from "node:test";

import { ebpFile, financialConditions, ofrFile, standing } from "../src/conditions.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-conditions-fixtures.mjs on 2026-11-05: the OFR's file (kept from 2022), the Fed Board's
// excess bond premium file and FRED's series (Moody's Baa spread and the VIX kept from 2000).
const run = (args, fetchImpl = replayFetch().fetchImpl) => financialConditions(createSession({ fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("the OFR's and the Fed Board's files read by their column names, and refused when those change", () => {
  const ofr = JSON.parse(ofrFile("Date,OFR FSI,Credit,Equity valuation,Safe assets,Funding,Volatility,United States,Other advanced economies,Emerging markets\n2026-11-02,-1.472,-0.83,-0.468,-0.291,-0.114,0.231,-0.876,-0.107,-0.489\n"));
  assert.deepEqual(ofr, [["2026-11-02", -1.472, -0.83, -0.468, -0.291, -0.114, 0.231, -0.876, -0.107, -0.489]]);
  assert.throws(() => ofrFile("Date,FSI\n2026-11-02,1\n"), /no longer has the columns/);
  assert.deepEqual(JSON.parse(ebpFile("date,gz_spread,ebp,est_prob\n2026-09-01,0.926,-0.392,0.0912\n2026-10-01,,,\n")), [["2026-09-01", 0.926, -0.392, 0.0912], ["2026-10-01", null, null, null]]);
});

test("a reading's place in its own history, and when it was last lower or higher", () => {
  const rows = [["2020-01-01", 5], ["2021-01-01", 1], ["2022-01-01", 4], ["2023-01-01", 3], ["2024-01-01", 2]];
  assert.deepEqual(standing(rows), { date: "2024-01-01", value: 2, from: "2020-01-01", percentile: 40, below_pct: 20, above_pct: 60, side: "lowest", since: "2021-01-01" });
  const top = standing([...rows, ["2025-01-01", 6]]);
  assert.deepEqual([top.side, top.since], ["highest", null]);
});

test("every measure with its changes and its place in its own history; the OFR's index by category and region", async () => {
  const r = await run({});
  assert.equal(r.summary[0], "The OFR's Financial Stress Index was -1.47 on 2026-11-02 (0 is average stress), lower than on 51% of days since 2022; by category, credit -0.83, equity valuation -0.47, safe assets -0.29, funding -0.11, volatility +0.23 (the categories add up to the index).");
  // Each set of parts adds up to the index, as the OFR builds it.
  for (const parts of [r.ofr.categories, r.ofr.regions]) assert.ok(Math.abs(Object.values(parts).reduce((s, x) => s + x, 0) - r.ofr.index) < 0.002);
  assert.equal(r.rows.length, 18);
  const row = (k) => r.rows.find((x) => x[0] === k);
  // The changes agree with a separate reading of FRED's files (the VIX at 17.52 a week earlier); the percentile is
  // within the fixture's history, from 2000.
  assert.deepEqual(row("vix").slice(3), ["2026-11-03", 20.83, 3.31, 5.52, 3.66, 66, "2000-01-03", null]);
  // A monthly index has no change on a week.
  assert.deepEqual(row("kcfsi").slice(3), ["2026-09-01", -0.986, null, -0.042, -0.15, 1, "1990-02-01", "the lowest since 2014-06-01"]);
  assert.equal(r.summary[2], "Corporate bonds paid over Treasuries on 2026-11-03 (ICE BofA, option-adjusted), with the change on a year: investment grade 0.93 points (+0.1), BBB 1.16 (+0.12), high yield 3.4 (+0.36), CCC and lower 13.16 (+4.31).");
  assert.match(r.limits.join(" "), /internal use only/);
});

test("one measure's history: the OFR's categories each day, or the Fed Board's spread, premium and recession chance each month", async () => {
  const ofr = await run({ measure: "ofr_fsi", start: "2026-10-28" });
  assert.equal(ofr.rows.length, 4);
  assert.deepEqual(ofr.rows.at(-1), ["2026-11-02", -1.472, -0.83, -0.468, -0.291, -0.114, 0.231, -0.876, -0.107, -0.489]);
  const ebp = await run({ measure: "excess_bond_premium", periods: 3 });
  assert.deepEqual(ebp.rows, [["2026-07", 0.842, -0.31, 10.9], ["2026-08", 0.879, -0.225, 13], ["2026-09", 0.926, -0.392, 9.1]]);
  assert.equal(ebp.latest.most_extreme_since, "the lowest since 2024-12-01");
  const hy = await run({ measure: "high_yield", periods: 2 });
  assert.deepEqual([hy.columns, hy.rows.at(-1)], [["date", "high_yield"], ["2026-11-03", 3.4]]);
});

test("a source that is down leaves the others standing in the overview, and is named when asked for alone", async () => {
  const base = replayFetch().fetchImpl;
  const down = async (url, init) => (/financialresearch/.test(url) ? new Response("down", { status: 503 }) : base(url, init));
  const r = await run({}, down);
  assert.equal(r.rows.length, 17);
  assert.equal(r.ofr, undefined);
  assert.match(r.summary[0], /^The Chicago Fed's NFCI/);
  await assert.rejects(run({ measure: "ofr_fsi" }, down), /HTTP 503/);
});
