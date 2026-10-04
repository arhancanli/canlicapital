// What placebo_test ships must be derived, never typed: the committed evaluation is exactly what
// evaluate.mjs derives from the committed run and pre-registration, the run used the pre-registered
// design and shares no seed with the pilot, and the tool's default method is the one selected.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PLACEBO_DEFAULT_METHOD } from "../../../../js/placebo-core.js";
import { evaluate } from "./evaluate.mjs";
import { DESIGN_V1, chunkSeed, jobList } from "./run.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));
const RUN = "config/research/placebo-v1.json";
const PREREG = "config/research/placebo-v1-prereg.json";
const EVALUATION = "config/research/placebo-v1-evaluation.json";

test(`${EVALUATION} is exactly what evaluate.mjs derives from ${RUN}`, () => {
  const derived = { ...evaluate(json(RUN), json(PREREG)), prereg: PREREG };
  assert.equal(read(EVALUATION), `${JSON.stringify(derived, null, 1)}\n`);
});

test("placebo_test's default method is the one the pre-registered rule selected", () => {
  assert.equal(PLACEBO_DEFAULT_METHOD, json(EVALUATION).selected);
});

test("the run used the pre-registered design, and shares no seed with the pilot", () => {
  const { design } = json(RUN);
  const prereg = json(PREREG);
  assert.equal(design.baseSeed, prereg.design.base_seed);
  assert.equal(design.null_tests, prereg.design.null_tests_per_cell);
  assert.equal(design.power_tests, prereg.design.power_tests_per_cell);
  assert.equal(design.placebos, prereg.design.placebos);
  assert.equal(design.observations, prereg.design.observations);
  assert.deepEqual(design.methods, prereg.candidates);
  const seeds = (baseSeed, nullTests, powerTests) => new Set(jobList(nullTests, powerTests, { ...DESIGN_V1, baseSeed }).map((j) => chunkSeed({ ...DESIGN_V1, baseSeed }, j.cell, j.chunk)));
  const pilot = json("config/research/placebo-v1-pilot.json").design;
  const used = seeds(design.baseSeed, design.null_tests, design.power_tests);
  for (const s of seeds(pilot.baseSeed, pilot.null_tests, pilot.power_tests)) assert.ok(!used.has(s), `seed ${s} is in both the pilot and the run`);
});
