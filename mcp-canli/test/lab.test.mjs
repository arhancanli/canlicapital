// The Lab: French's zipped tables read (first table, missing days dropped, RF left out); each strategy's positions use
// only information to the close before and earn from the next close, with costs; a strategy is its number, rebuilt
// exactly; and originality_check finds a Lab strategy's own returns as its nearest, ranks a series among those covering
// the same months, while lab_search filters and the effective number is reported.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { firstTable, finishBuild, buildShard, loadSeries, prepare, runDaily, runMonthly, unzipFirst, VARIANTS, variantOf } from "../local/lab.mjs";
import { openLab, runLabSearch, runLabStatus, runLabStrategy, runOriginality, toMonthly } from "../src/lab.mjs";

// A zip of one stored (uncompressed) file, as French's are read.
function zipOf(name, text) {
  const data = Buffer.from(text, "latin1"), fname = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(0, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(fname.length, 28); cd.writeUInt32LE(0, 42);
  const cdAt = 30 + fname.length + data.length, eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + fname.length, 12); eocd.writeUInt32LE(cdAt, 16);
  return Buffer.concat([local, fname, data, cd, fname, eocd]);
}
function days(n, from = Date.UTC(1990, 0, 2)) {
  const out = [];
  for (let t = from; out.length < n; t += 86400000) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(Number(d.toISOString().slice(0, 10).replace(/-/g, ""))); }
  return out;
}
function frenchCsv(columns, dates, gen) {
  const rows = dates.map((d, i) => `${d},${columns.map((c, j) => gen(i, j).toFixed(2)).join(",")}`);
  return `This file was created for a test.\n\n  Average Value Weighted Returns -- Daily\n,${columns.join(",")}\n${rows.join("\n")}\n\n  Average Equal Weighted Returns -- Daily\n,${columns.join(",")}\n${rows[0]}\n`;
}
const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };

test("French's tables: the first one, percents as fractions, missing days ending a series' start, RF left out", () => {
  const text = frenchCsv(["A", "B"], [19260701, 19260702], (i, j) => (j === 0 && i === 0 ? -99.99 : 1.5));
  assert.equal(unzipFirst(zipOf("x.CSV", text)), text);
  const t = firstTable(text);
  assert.deepEqual([t.columns, t.dates, Number.isNaN(t.rows[0][0]), t.rows[1][1]], [["A", "B"], [19260701, 19260702], true, 0.015]);
});

test("a strategy is its number: positions from the close before, next-close entry, monthly rebalancing, costs", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-lab-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = path.join(dir, "raw"), out = path.join(dir, "v1");
  mkdirSync(raw);
  const d = days(5400), r1 = rng(3), r2 = rng(9);
  writeFileSync(path.join(raw, "Two_Portfolios_daily_CSV.zip"), zipOf("Two.CSV", frenchCsv(["Lo", "Hi"], d, (i, j) => (j === 0 ? r1() * 2 + 0.03 : i < 10 ? -99.99 : r2() * 3 + 0.02))));
  writeFileSync(path.join(raw, "F-F_Factors_daily_CSV.zip"), zipOf("F.CSV", frenchCsv(["Mkt-RF", "RF"], d, (i) => Math.sin(i / 40) * 0.8 + r1())));
  const { series, data } = loadSeries(raw);
  assert.deepEqual(series.map((s) => [s.id, s.r.length]), [["F-F_Factors_daily:Mkt-RF", 5400], ["Two_Portfolios_daily:Lo", 5400], ["Two_Portfolios_daily:Hi", 5390]]);
  assert.equal(data.length, 2);

  // tsmom against a direct reading of its rule; monthly rebalancing changes position only in a new month.
  const s = series[0], c = prepare(s);
  const daily = runDaily({ family: "tsmom", lookback: 21, skip: 0, mode: "long_short", rebalance: "daily" }, c, s);
  let pos = 0;
  for (let i = 21; i + 1 < s.r.length; i += 1) {
    let cum = 0; for (let k = i - 21; k < i; k += 1) cum += Math.log1p(s.r[k]);
    const want = cum > 0 ? 1 : cum < 0 ? -1 : 0, cost = Math.abs(want - pos) * 0.0005; pos = want;
    assert.ok(Math.abs(daily.ret[i + 1] - (want * s.r[i + 1] - cost)) < 1e-12, `day ${i + 1}`);
  }
  // On a series without a trend, a 21-day rule flips often; held a month at a time it changes at most monthly.
  const noisy = series[1], cn = prepare(noisy), rule = { family: "tsmom", lookback: 21, skip: 0, mode: "long_short" };
  const [everyDay, everyMonth] = ["daily", "monthly"].map((rebalance) => runDaily({ ...rule, rebalance }, cn, noisy).turnover);
  assert.ok(everyMonth < everyDay / 3, `${everyMonth} vs ${everyDay}`);

  for (const i of [0, 1, 2]) buildShard({ series, out, shard: { index: i, of: 3 } });
  const manifest = finishBuild({ out, series, data, of: 3 });
  assert.equal(manifest.strategies, 3 * VARIANTS);
  assert.ok(manifest.effective.participation_ratio > 1 && manifest.effective.participation_ratio < manifest.effective.sample);
  const lab = openLab(out);
  const id = 2 * VARIANTS + 7, spec = lab.spec(id);
  assert.deepEqual({ ...spec, id: undefined, series: undefined, lag_days: undefined, cost_bps: undefined }, { ...variantOf(7), id: undefined, series: undefined, lag_days: undefined, cost_bps: undefined });
  assert.equal(spec.series, "Two_Portfolios_daily:Hi");
  const again = runMonthly(variantOf(7), prepare(series[2]), series[2]);
  const shown = runLabStrategy(lab, { id });
  assert.deepEqual(shown.monthly.returns, again.values.map((x) => Math.round(x * 10000) / 10000));
  assert.ok(Math.abs(shown.stats.sharpe - again.stats.sharpe) < 1e-3);
  assert.equal(runLabStatus(out).strategies, 3 * VARIANTS);
  assert.equal(runLabStatus(path.join(dir, "none")).built, false);

  // A Lab strategy's own daily returns: it is its own nearest, with a correlation of one.
  const rebuilt = runDaily(variantOf(7), prepare(series[2]), series[2]);
  const dates = [], returns = [];
  series[2].dates.forEach((dd, i) => { if (rebuilt.live[i]) { const x = String(dd); dates.push(`${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6)}`); returns.push(rebuilt.ret[i]); } });
  const o = runOriginality(lab, { returns, dates, nearest: 3 });
  assert.equal(o.nearest.rows[0][0], id);
  assert.ok(o.nearest.rows[0][1] > 0.9999);
  assert.ok(o.near_copies.at_least_0_9 >= 1 && o.rank.against > 100 && o.rank.percentile >= 0 && o.rank.percentile <= 100);
  assert.match(o.reading, /Lab strategies covering the same months/);
  assert.throws(() => toMonthly([0.1, 0.2], ["2020-01", "2020-02"]), /at least 24/);

  const found = runLabSearch(lab, { family: "vol_target", series: "Lo", sort: "sharpe", limit: 5 });
  assert.equal(found.matched, 80);
  assert.ok(found.rows.every((row) => row[1].startsWith("vol_target") && row[1].endsWith("Two_Portfolios_daily:Lo")));
  assert.ok(found.rows[0][2] >= found.rows.at(-1)[2]);
  const apart = runLabSearch(lab, { uncorrelated_with: { returns, dates }, max_abs_corr: 0.1, limit: 200 });
  assert.ok(apart.rows.every((row) => Math.abs(row.at(-1)) <= 0.1) && apart.matched > 0);
});
