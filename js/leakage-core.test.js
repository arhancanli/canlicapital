import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { LEAKAGE_LIMITS, checkLeakage, compareColumn, diagnose, planPrefixes } from "./leakage-core.js";

const zoo = JSON.parse(readFileSync(new URL("../config/research/leakage-zoo.json", import.meta.url), "utf8"));

test("the planted-leak zoo: every leak is found with its pattern, and no honest indicator is flagged", () => {
  const leaks = zoo.indicators.filter((i) => i.kind === "leak");
  const honest = zoo.indicators.filter((i) => i.kind === "honest");
  assert.ok(leaks.length >= 10 && honest.length >= 10, `${leaks.length} leaks, ${honest.length} honest`);
  for (const ind of zoo.indicators) {
    const c = checkLeakage({ cuts: zoo.cuts, columns: { [ind.name]: { full: ind.full, prefixes: ind.prefixes } } }).columns[ind.name];
    if (ind.kind === "honest") {
      assert.equal(c.verdict, "no_lookahead_found", `${ind.name} is causal and must pass`);
      for (const p of c.prefixes) assert.equal(p.changed, 0, `${ind.name} at cut ${p.cut}`);
    } else {
      assert.equal(c.verdict, "lookahead_found", `${ind.name} looks ahead and must be found`);
      if (ind.expected_pattern) assert.equal(c.pattern, ind.expected_pattern, ind.name);
    }
  }
});

test("future-row leaks report their horizon: shift(-1), shift(-5) and a centered 21-row window", () => {
  const horizon = (name) => {
    const ind = zoo.indicators.find((i) => i.name === name);
    return checkLeakage({ cuts: zoo.cuts, columns: { x: { full: ind.full, prefixes: ind.prefixes } } }).columns.x.horizon_rows;
  };
  assert.equal(horizon("future_return_1"), 1);
  assert.equal(horizon("future_return_5"), 5);
  assert.equal(horizon("centered_sma_21"), 10);
});

test("the committed zoo used the check's own cut points", () => {
  assert.deepEqual(zoo.cuts, planPrefixes(zoo.rows, { prefixes: zoo.cuts.length, seed: zoo.seed }));
});

test("a change of one millionth in one row of an honest indicator is caught (the check is not blind)", () => {
  const ind = zoo.indicators.find((i) => i.name === "ema_20");
  const prefixes = ind.prefixes.map((p) => [...p]);
  prefixes[2][100] += 1e-6 * Math.abs(prefixes[2][100]);
  const c = checkLeakage({ cuts: zoo.cuts, columns: { x: { full: ind.full, prefixes } } }).columns.x;
  assert.equal(c.verdict, "lookahead_found");
  assert.equal(c.prefixes[2].first_changed, 100);
});

test("planPrefixes: seeded, sorted, distinct, between 40% and 95% of the series; bad input refused", () => {
  const a = planPrefixes(1000, { prefixes: 8, seed: 3 });
  assert.deepEqual(a, planPrefixes(1000, { prefixes: 8, seed: 3 }));
  assert.notDeepEqual(a, planPrefixes(1000, { prefixes: 8, seed: 4 }));
  assert.equal(new Set(a).size, 8);
  assert.deepEqual([...a].sort((x, y) => x - y), a);
  assert.ok(a.every((c) => c >= 400 && c <= 950), a.join(","));
  assert.throws(() => planPrefixes(10), /observations must be an integer/);
  assert.throws(() => planPrefixes(1000, { prefixes: 1 }), /prefixes must be an integer/);
  assert.throws(() => planPrefixes(1000, { prefixes: LEAKAGE_LIMITS.max_prefixes + 1 }), /prefixes must be an integer/);
});

test("compareColumn: missing values match only missing values; a short prefix run is refused by position", () => {
  const full = [1, null, 3, 4, 5];
  assert.equal(compareColumn(full, [[1, null, 3]], [3])[0].changed, 0);
  const r = compareColumn(full, [[1, 2, 3]], [3])[0];
  assert.equal(r.changed, 1);
  assert.equal(r.first_changed, 1);
  assert.throws(() => compareColumn(full, [[1, null]], [3], { name: "sig" }), /sig\.prefixes\[0\] has 2 values; its cut is 3/);
  assert.throws(() => compareColumn([1, "x", 3], [[1, 2]], [2]), /full\[1\] is "x"/);
});

test("diagnose: nothing changed, a horizon before every cut, most rows changed, or scattered rows", () => {
  assert.equal(diagnose([{ cut: 100, changed: 0 }, { cut: 200, changed: 0 }]).verdict, "no_lookahead_found");
  const horizon = diagnose([
    { cut: 100, changed: 2, share_changed: 0.02, first_changed: 98, last_changed: 99, rows_before_cut: 2 },
    { cut: 200, changed: 2, share_changed: 0.01, first_changed: 198, last_changed: 199, rows_before_cut: 2 },
  ]);
  assert.equal(horizon.pattern, "future_rows");
  assert.equal(horizon.horizon_rows, 2);
  assert.equal(diagnose([{ cut: 100, changed: 90, share_changed: 0.9, first_changed: 0, last_changed: 99, rows_before_cut: 100 }]).pattern, "full_sample");
  assert.equal(diagnose([{ cut: 100, changed: 3, share_changed: 0.03, first_changed: 12, last_changed: 70, rows_before_cut: 88 }]).pattern, "sparse");
});

test("checkLeakage: one verdict over several columns, naming the flagged ones", () => {
  const honest = zoo.indicators.find((i) => i.name === "sma_20");
  const leak = zoo.indicators.find((i) => i.name === "global_zscore");
  const r = checkLeakage({ cuts: zoo.cuts, columns: { sma: { full: honest.full, prefixes: honest.prefixes }, z: { full: leak.full, prefixes: leak.prefixes } } });
  assert.equal(r.verdict, "lookahead_found");
  assert.deepEqual(r.flagged_columns, ["z"]);
  assert.throws(() => checkLeakage({ cuts: [10], columns: { a: { full: [1], prefixes: [[1]] } } }), /cuts must list/);
});
