// The study's machinery: its output does not depend on the number of workers, its pipelines never
// look ahead, and its markets have the properties the pre-registration states.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { xoshiro } from "../../null-zoo/xoshiro.mjs";
import { ASSETS, DRIFT, VOL, crossSection, singleAsset } from "./markets.mjs";
import { PIPELINES, WARMUP } from "./pipelines.mjs";

const RUN = resolve(dirname(fileURLToPath(import.meta.url)), "run.mjs");

test("the run is byte-identical with one worker or three", () => {
  const run = (workers) => execFileSync(process.execPath, [RUN, "3", "2", String(workers)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const one = run(1);
  assert.equal(run(3), one);
  const parsed = JSON.parse(one);
  assert.ok(parsed.cells.every((c) => c.tests === (c.kind === "null" ? 3 : 2)));
  assert.ok(parsed.cells.every((c) => Object.values(c.rank_counts).every((counts) => counts.reduce((a, b) => a + b, 0) === c.tests)));
});

test("no pipeline looks ahead: changing one day's returns moves no earlier rule return", () => {
  const r = xoshiro(3);
  for (const [name, { assets, rules }] of Object.entries(PIPELINES)) {
    const columns = assets === "single" ? singleAsset("iid_normal", "flat", 600, r) : crossSection("iid_normal", "flat", 600, r);
    const day = 450;
    const changed = columns.map((c) => c.map((v, t) => (t === day ? v + 0.05 : v)));
    const before = rules(columns), after = rules(changed);
    for (let k = 0; k < before.length; k++) {
      for (let t = 0; t < day - WARMUP; t++) assert.equal(after[k][t], before[k][t], `${name} rule ${k} day ${t + WARMUP}`);
    }
  }
});

test("null markets have the means and volatility the pre-registration states", () => {
  const r = xoshiro(11);
  const moments = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) };
  };
  const flat = moments(singleAsset("garch", "flat", 200000, r)[0]);
  assert.ok(Math.abs(flat.mean) < 0.0001 && Math.abs(flat.sd / VOL - 1) < 0.05, JSON.stringify(flat));
  const drift = moments(singleAsset("iid_normal", "drift", 200000, r)[0]);
  assert.ok(Math.abs(drift.mean - DRIFT) < 0.0001, JSON.stringify(drift));
  const panel = crossSection("student_t4", "flat", 20000, r);
  assert.equal(panel.length, ASSETS);
  const corr = (a, b) => {
    const ma = moments(a), mb = moments(b);
    return a.reduce((s, v, t) => s + (v - ma.mean) * (b[t] - mb.mean), 0) / a.length / ma.sd / mb.sd;
  };
  assert.ok(Math.abs(corr(panel[0], panel[1]) - 0.3) < 0.05);
});
