// Placebo study v2, round 2: the timing pilot, run before the registration on simulated data only.
// Seeds differ from the registered ones; the shapes for the power study are synthetic (round 1's
// iid_normal design, garch_const for volatility management, with each claim's series and months), not the real data's.
//   node pilot.mjs <prereg1> <prereg2> > pilot.json
import { readFileSync } from "node:fs";
import { calibCells, calibChunk, effectJob, powerCells, powerChunk } from "./run2.mjs";
import { shapeParams } from "./sim2.mjs";
import { simulatePanel, xoshiro } from "../v2/sim.mjs";
import { monthsBetween } from "./tests.mjs";

const [p1, p2] = process.argv.slice(2);
const pre1 = JSON.parse(readFileSync(p1, "utf8"));
const pre2 = JSON.parse(readFileSync(p2, "utf8"));
const pilot1 = { ...pre1, simulation: { ...pre1.simulation, base_seed: 99 } };
const pilot2 = { ...pre2, power: { ...pre2.power, base_seed: 98, calibration: { ...pre2.power.calibration, seed: 97 } } };
const out = { schema: "canli.placebo-study.v2r2-pilot", note: "timings in seconds on the shared machine; simulated data only; seeds 99, 98, 97", calib: [], effects: [], power: [] };
const clock = () => process.hrtime.bigint();
const secs = (a) => Number(clock() - a) / 1e9;

for (const cell of calibCells(pilot1, pilot2).filter((c) => c.family === "garch_const" || c.family === "garch_zero")) {
  const t = clock();
  calibChunk(pilot1, pilot2, cell, 0, 2);
  out.calib.push({ claim: cell.claim, family: cell.family, tests: 2, seconds_per_test: secs(t) / 2 });
}
const specOf = (n) => pre1.claims[n] ?? pre2.claims[n];
const shapes = {};
for (const name of pre2.power.claims) {
  const s = specOf(name);
  const vm = s.pipeline === "vol_managed";
  shapes[name] = shapeParams(simulatePanel(vm ? "garch_const" : "iid_normal", s.series.length, monthsBetween(s.sample_start, s.sample_end), xoshiro(96)), { useVariance: vm });
}
const strengths = {};
for (const name of pre2.power.claims) {
  const t = clock();
  const e = effectJob(pilot1, pilot2, shapes, name, 0.3);
  strengths[`${name}|0.3`] = e.strength;
  out.effects.push({ ...e, seconds: secs(t) });
}
for (const cell of powerCells(pilot2).filter((c) => c.effect === 0.3)) {
  const t = clock();
  const r = powerChunk(pilot1, pilot2, shapes, strengths, cell, 0, 1);
  out.power.push({ claim: cell.claim, window: cell.window, tests: 1, seconds_per_test: secs(t), unreachable: !!r.unreachable });
}
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
