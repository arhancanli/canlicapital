import assert from "node:assert/strict";
import { test } from "node:test";

import { countryCode, jobPostings, seriesFile } from "../src/jobs.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-jobs-fixtures.mjs on 2026-11-04 (Indeed's files to 2026-10-30), trimmed as it says.
const run = (args) => jobPostings(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("countries by code or name, and a long file kept as each series' recent days", () => {
  assert.equal(countryCode("uk"), "GB");
  assert.equal(countryCode("Germany"), "DE");
  assert.equal(countryCode("eurozone"), "EA");
  assert.throws(() => countryCode("Japan"), NotFound);
  const csv = "date,jobcountry,indeed_job_postings_index_SA,indeed_job_postings_index_NSA,variable\n2024-10-01,US,100,99,total postings\n2026-10-30,US,103.79,101,total postings\n2026-10-30,US,99.03,97,new postings\n";
  assert.deepEqual(JSON.parse(seriesFile(csv, { key: "variable", value: "indeed_job_postings_index_SA" })), { "total postings": [["2026-10-30", 103.79]], "new postings": [["2026-10-30", 99.03]] });
  assert.deepEqual(JSON.parse(seriesFile(csv, { key: "variable", value: "indeed_job_postings_index_SA", span: 0 }))["total postings"].length, 2);
});

test("a country's postings against February 2020, their changes and their peak (FRED's IHLIDXUS agrees: 103.79)", async () => {
  const r = await run({});
  assert.equal(r.summary[0], "Job postings on Indeed in the United States stood at 103.79% of their 1 February 2020 level on 2026-10-30 (seasonally adjusted), up 3.21 points on a year (3.2%) and down 0.05 in four weeks; their peak was 161.15 on 2022-03-31.");
  assert.deepEqual(r.latest, { total: 103.79, new_postings: 99.03 });
  assert.deepEqual(r.peak, { date: "2022-03-31", index: 161.15, below_peak_pct: -35.6 });
  assert.equal(r.rows.length, 13);
  assert.deepEqual(r.rows.at(-1), ["2026-10-30", 103.79, 99.03]);
  assert.match(r.limits[0], /Indeed Hiring Lab.*CC BY 4\.0/);
});

test("sectors ranked by their change on a year, states by code, and every economy side by side", async () => {
  const sec = await run({ by: "sector" });
  assert.deepEqual(sec.rows[0], ["Mechanical Engineering", "2026-10-30", 171.68, 3.7, 53.14, 44.8]);
  assert.deepEqual(sec.rows.at(-1), ["Dental", "2026-10-30", 118.1, 1.14, -17.37, -12.8]);
  const reg = await run({ by: "region" });
  assert.equal(reg.rows.length, 51);
  assert.deepEqual(reg.rows[0], ["NE", "2026-10-30", 122.75, 0.7, 12.76, 11.6]);
  const all = await run({ country: "all" });
  assert.equal(all.rows.length, 11);
  assert.deepEqual(all.rows[0], ["Australia", "AU", "2026-10-30", 150.39, 1.33, 0.9]);
  await assert.rejects(run({ country: "IT", by: "region" }), /regional postings for/);
});

test("the ranking's words follow the signs when every sector moved the same way", async () => {
  const base = replayFetch().fetchImpl;
  // Every sector's index a year back set far above today, so all fell on the year.
  const fell = async (url, init) => {
    const res = await base(url, init);
    if (!/job_postings_by_sector_US/.test(url)) return res;
    const [head, ...lines] = (await res.text()).trim().split("\n");
    const last = lines.reduce((m, l) => (l.slice(0, 10) > m ? l.slice(0, 10) : m), "");
    return new Response([head, ...lines.map((l) => (l.slice(0, 10) === last ? l : l.replace(/,([\d.]+),total postings/, ",500,total postings")))].join("\n"), { status: 200 });
  };
  const r = await jobPostings(createSession({ fetchImpl: fell, now: () => NOW, env: {}, sleep: async () => {} }), { by: "sector" });
  assert.match(r.summary[0], /postings fell least on a year \(-[\d.]+%.*fell most \(-[\d.]+%/);
});
