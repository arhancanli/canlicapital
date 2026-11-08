// beat_probability: the model's numbers are the validation file's; with no record it is the base rate, and each own
// quarter moves it by the stated weight; guidance_record's rows are read for the measure asked, each quarter once,
// oldest first, and filed_before is passed on so the model can be read as it stood then.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { BEAT_MODEL, beatFrom, runBeat } from "../src/beat.mjs";

const VALIDATION = new URL("../../config/research/beat-probability-v1/validation.json", import.meta.url);

test("the model's base rates and validation are the validation file's", { skip: !existsSync(VALIDATION) && "installed package, no repository beside it" }, () => {
  const v = JSON.parse(readFileSync(VALIDATION, "utf8"));
  assert.equal(v.k, BEAT_MODEL.k);
  for (const m of ["eps", "revenue"]) {
    assert.deepEqual(v.measures[m].base_rate_all, BEAT_MODEL.base[m]);
    for (const key of ["quarters_scored", "companies", "brier", "gain_over_base_rate"]) assert.deepEqual(v.measures[m][key], BEAT_MODEL.validation[m][key], `${m} ${key}`);
  }
});

test("no record gives the base rate; each own quarter counts against four at the base rate", () => {
  const none = beatFrom([], "eps"), total = 318 + 136 + 41;
  assert.ok(Math.abs(none.above - 319 / (total + 3)) < 1e-12);
  assert.equal(none.weight_on_own_record, 0);
  const four = beatFrom(Array(4).fill("above the range"), "eps");
  assert.ok(Math.abs(four.above - (4 + 4 * none.above) / 8) < 1e-12);
  assert.ok(Math.abs(four.above + four.within + four.below - 1) < 1e-12);
  assert.equal(four.weight_on_own_record, 0.5);
  assert.ok(beatFrom(Array(4).fill("below the range"), "revenue").below > 0.5);
});

test("guidance_record's rows: the measure asked, each quarter once, oldest first, as of a date", async () => {
  const calls = [];
  const columns = ["quarter", "filed", "measure", "basis", "unit", "guided_low", "guided_high", "actual", "position", "url"];
  const rows = [
    ["Q3 2026", "2026-10-20", "eps", "", "USD", 1, 1.1, 1.2, "above the range", "u"],
    ["Q1 2026", "2026-04-20", "eps", "", "USD", 1, 1.1, 1.05, "within the range", "u"],
    ["Q3 2026", "2026-10-20", "eps", "GAAP", "USD", 0.9, 1, 1.2, "above the range", "u"],
    ["Q2 2026", "2026-07-20", "revenue", "", "USD billion", 5, 6, 7, "above the range", "u"],
    ["Q2 2026", "2026-07-20", "eps", "", "USD", 1, 1.1, 0.9, "below the range", "u"],
  ];
  const out = await runBeat({ call: async (name, args) => { calls.push([name, args]); return { company: "EXAMPLE CO", columns, rows }; } }, { company: "EXM", filed_before: "2026-11-01" });
  assert.deepEqual(calls, [["guidance_record", { company: "EXM", measure: "eps", quarters: 12, filed_before: "2026-11-01" }]]);
  assert.deepEqual(out.quarters.rows.map((r) => [r[0], r[5]]), [["Q1 2026", "within the range"], ["Q2 2026", "below the range"], ["Q3 2026", "above the range"]]);
  assert.deepEqual(out.from.own_record, { above: 1, within: 1, below: 1 });
  assert.ok(Math.abs(out.next_quarter.above_range + out.next_quarter.within_range + out.next_quarter.below_range - 1) < 0.002);
  assert.match(out.reading, /landed above its EPS range in 1 of its 3 guided quarters/);
  assert.equal(out.as_of, "2026-11-01");
  assert.equal(out.model.validation.companies, 56);
  const none = await runBeat({ call: async () => ({ company: "NVIDIA CORP", columns, rows: [] }) }, { company: "NVDA" });
  assert.match(none.reading, /No guided EPS range was found .* market's base rate alone/);
});
