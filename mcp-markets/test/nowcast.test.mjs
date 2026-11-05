import assert from "node:assert/strict";
import { test } from "node:test";

import { inflationNowcast, nowcastFile } from "../src/nowcast.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-nowcast-fixtures.mjs on 2026-11-04: the Cleveland Fed's files, their last sixteen periods.
const run = (args) => inflationNowcast(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("a chart's dates come from each point, past the release markers that hold no point, into the next year", () => {
  const chart = {
    chart: { subcaption: "2026-12", _comment: "2027-01-14 00:00" },
    categories: [{ category: [{ label: "12/30" }, { label: "CPI Nov", vline: "true" }, { label: "12/31" }, { label: "01/13" }] }],
    dataset: [
      { seriesname: "CPI Inflation", data: [{ value: "0.2", tooltext: "CPI Inflation{br}12/30{br}0.2{br}" }, { value: "0.25", tooltext: "CPI Inflation{br}12/31{br}0.25{br}" }, { value: "" }] },
      { seriesname: "Actual CPI Inflation", data: [{ value: "" }, { value: "" }, { value: "0.31", tooltext: "Actual CPI Inflation{br}01/13{br}0.31{br}" }] },
    ],
  };
  const out = JSON.parse(nowcastFile(JSON.stringify([chart])));
  assert.equal(out.updated, "2027-01-14");
  assert.deepEqual(out.periods[0], { period: "2026-12", dates: ["2026-12-30", "2026-12-31"], path: { cpi: [0.2, 0.25] }, actual: { cpi: { value: 0.31, date: "2027-01-13" } } });
});

test("the months and the quarter not yet published, and the last month published beside its nowcast", async () => {
  const r = await run({});
  assert.equal(r.updated, "2026-11-04");
  assert.equal(r.summary[0], "The Cleveland Fed's nowcast for 2026-10, not yet published: CPI 0.24% on the month and 3.74% on a year; core CPI 0.21% on the month and 2.48% on a year; PCE 0.27% on the month and 3.77% on a year; core PCE 0.26% on the month and 3.2% on a year.");
  assert.equal(r.summary.at(-1), "2026-Q4 at an annualized rate, not yet published: CPI 4.31%, core CPI 3.02%, PCE 3.99%, core PCE 3.33%.");
  // September's CPI as published on 14 October (FRED's CPIAUCNS gives 3.7377% on a year), PCE on 29 October.
  assert.deepEqual(r.months.rows.slice(0, 3), [["2026-09", "cpi", 0.53, 3.6, 0.65, 3.74, "2026-10-14"], ["2026-09", "core_cpi", 0.2, 2.39, 0.33, 2.56, "2026-10-14"], ["2026-09", "pce", 0.47, 3.6, 0.49, 3.65, "2026-10-29"]]);
  assert.deepEqual([...new Set(r.months.rows.map((x) => x[0]))], ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(r.quarters.rows[0], ["2026-Q4", "cpi", 4.31, null]);
});

test("the nowcast's record against what was published, and one month day by day", async () => {
  const rec = await run({ record: true, measure: "cpi" });
  assert.equal(rec.rows.length, 12);
  assert.deepEqual(rec.rows.at(-1), ["2026-09", "cpi", 0.53, 0.65, -0.12, 3.6, 3.74, -0.14, "2026-10-14"]);
  assert.equal(rec.mean_absolute_miss.cpi.months, 12);
  const path = await run({ month: "2026-10", measure: "cpi" });
  assert.deepEqual(path.columns, ["date", "cpi_month_pct", "cpi_year_pct"]);
  assert.deepEqual(path.rows.find((x) => x[0] === "2026-10-14"), ["2026-10-14", 0.28, 3.78]);
  assert.deepEqual(path.published, { cpi: null });
  await assert.rejects(run({ month: "2013-01" }), /2013-01 is not among them/);
});

test("source_check reading the same file leaves the nowcast's cached form alone", async () => {
  const { sourceCheck } = await import("../src/source-check.mjs");
  const session = createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
  const first = await inflationNowcast(session, {});
  await sourceCheck(session, { sources: [{ url: "https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_month.json", sha256: "0".repeat(64) }] });
  assert.deepEqual((await inflationNowcast(session, {})).summary, first.summary);
});

test("a quarter whose CPI is out and PCE is not names only what is pending, beside the next quarter", async () => {
  const base = replayFetch().fetchImpl;
  // 2026-Q3 as it stood between its last CPI release and the PCE release: the published PCE figures blanked.
  const tweak = async (url, init) => {
    const res = await base(url, init);
    if (!/nowcast_quarter/.test(url)) return res;
    const charts = JSON.parse((await res.text()).replace(/^\uFEFF/, ""));
    for (const s of charts.find((c) => c.chart.subcaption === "2026:Q3").dataset) if (/^Actual (Core )?PCE/.test(s.seriesname)) for (const x of s.data) x.value = "";
    return new Response(JSON.stringify(charts), { status: 200 });
  };
  const r = await inflationNowcast(createSession({ fetchImpl: tweak, now: () => NOW, env: {}, sleep: async () => {} }), {});
  const quarters = r.summary.filter((s) => /annualized/.test(s));
  assert.equal(quarters.length, 2);
  assert.match(quarters[0], /^2026-Q3 at an annualized rate, not yet published: PCE [\d.]+%, core PCE [\d.]+%\.$/);
  assert.match(quarters[1], /^2026-Q4 at an annualized rate, not yet published: CPI 4\.31%/);
});
