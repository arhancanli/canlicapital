// The deflated Sharpe variants must match López de Prado and Porcu's own reference values before their Null Zoo
// numbers mean anything: the exact moments of the maximum of 20 standard normals, and the stylized sizes at K = 20
// with V known (6.126% for the Gaussian location-scale form, 4.320% for the Gumbel one, 5% exactly for the complete
// search distribution). The committed results must then hold the reference test at its level.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { xoshiro } from "../xoshiro.mjs";
import { DSR_DESIGN, DSR_TESTS, MAX20, cellSeed, runCell, study, variantP } from "./dsr-variants.mjs";

const RESULTS = JSON.parse(readFileSync(new URL("../../../../config/research/null-zoo-v1-dsr-variants.json", import.meta.url), "utf8"));

test("the maximum of 20 standard normals: the paper's exact mean and standard deviation", () => {
  assert.ok(Math.abs(MAX20.mean - 1.867475) < 2e-6, `mean ${MAX20.mean}`);
  assert.ok(Math.abs(MAX20.sd - 0.525068) < 2e-6, `sd ${MAX20.sd}`);
});

test("each variant's cutoff is the one the paper prints", () => {
  // At the cutoff the p-value is the level: mu + 1.6448536 sigma (Gaussian), mu + 1.8657985 sigma (Gumbel), 2.799211 (EO).
  assert.ok(Math.abs(variantP(MAX20.mean + 1.6448536 * MAX20.sd, 1, 20).ls_phi - 0.05) < 1e-6);
  assert.ok(Math.abs(variantP(MAX20.mean + 1.8657985 * MAX20.sd, 1, 20).ls_gumbel - 0.05) < 1e-6);
  assert.ok(Math.abs(variantP(2.799211, 1, 20).eo - 0.05) < 1e-6);
});

test("stylized sizes at K = 20 with V known match the paper within Monte Carlo error", () => {
  const r = xoshiro(11), n = 60000;
  const hits = { ls_phi: 0, ls_gumbel: 0, eo: 0 };
  for (let i = 0; i < n; i++) {
    let max = -Infinity;
    for (let k = 0; k < 20; k++) max = Math.max(max, r.gauss());
    const p = variantP(max, 1, 20);
    for (const key of Object.keys(hits)) if (p[key] <= 0.05) hits[key]++;
  }
  const expect = { ls_phi: 0.06126, ls_gumbel: 0.043201, eo: 0.05 };
  for (const [key, want] of Object.entries(expect)) {
    const se = Math.sqrt((want * (1 - want)) / n);
    assert.ok(Math.abs(hits[key] / n - want) < 4 * se, `${key}: ${hits[key] / n} against ${want}`);
  }
});

test("a cell is reproducible from its seed", () => {
  const a = runCell("iid_normal", 2, 30, cellSeed(DSR_DESIGN, 0, 2));
  assert.deepEqual(a, runCell("iid_normal", 2, 30, cellSeed(DSR_DESIGN, 0, 2)));
});

test("committed results: the script's layout and seeds, and the reference test at its level on iid returns", () => {
  const small = study(2);
  assert.deepEqual(Object.keys(small), Object.keys(RESULTS));
  assert.deepEqual(small.cells.map((c) => [c.family, c.skill, c.seed]), RESULTS.cells.map((c) => [c.family, c.skill, c.seed]));
  assert.deepEqual(RESULTS.tests, DSR_TESTS);
  assert.equal(RESULTS.reps_per_cell, 10000);
  const iid = RESULTS.cells.find((c) => c.family === "iid_normal" && c.skill === 0);
  assert.ok(Math.abs(iid.rate.luck_trials["0.05"] - 0.05) < 0.0088, `luck_trials ${iid.rate.luck_trials["0.05"]}`);
  assert.ok(Math.abs(iid.rate.dsr_eo_vb["0.05"] - 0.05) < 0.0088, `dsr_eo_vb ${iid.rate.dsr_eo_vb["0.05"]}`);
});
