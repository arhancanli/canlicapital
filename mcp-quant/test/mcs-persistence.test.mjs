// model_confidence_set says how persistent the models' loss differences are, and warns when they are persistent
// enough that the set drops models more often than its confidence (the size study in the README).
import assert from "node:assert/strict";
import test from "node:test";

import { runTool } from "../src/registry.mjs";

// Four equally good models whose losses are 1 + an AR(1) of coefficient phi, seeded.
function losses(phi, T = 400, M = 4) {
  let seed = 11;
  const u = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
  const e = Array.from({ length: M }, normal), rows = [];
  for (let t = 0; t < T + 100; t++) {
    for (let i = 0; i < M; i++) e[i] = phi * e[i] + Math.sqrt(1 - phi * phi) * normal();
    if (t >= 100) rows.push(e.map((x) => 1 + x));
  }
  return rows;
}

test("model_confidence_set measures the loss differences' persistence and warns when it is high", () => {
  const strong = runTool("model_confidence_set", { losses: losses(0.9), reps: 200 });
  assert.ok(strong.persistence.lag1_autocorrelation_max > 0.8 && strong.persistence.lag1_autocorrelation_median > 0.8, JSON.stringify(strong.persistence));
  assert.match(strong.note, /Here the loss differences are persistent \(first-order autocorrelation up to 0\.\d\d\): in the size study, with the default block, the 90% set dropped/);
  const none = runTool("model_confidence_set", { losses: losses(0), reps: 200 });
  assert.ok(Math.abs(none.persistence.lag1_autocorrelation_max) < 0.3, JSON.stringify(none.persistence));
  assert.doesNotMatch(none.note, /Here the loss differences are persistent/);
  assert.ok(none.persistence.lag1_autocorrelation_median < none.persistence.lag1_autocorrelation_max, "the median of four models' estimates, below their largest");
  // A persistent shock every model shares (a volatile market) leaves their differences unpersistent: no warning.
  let draw = 29;
  const own = () => ((draw = (draw * 16807) % 2147483647) / 2147483647 - 0.5);
  const common = losses(0.9).map((row) => row.map(() => row[0] + own()));
  const shared = runTool("model_confidence_set", { losses: common, reps: 200 });
  assert.ok(shared.persistence.lag1_autocorrelation_max < 0.3, JSON.stringify(shared.persistence));
  assert.doesNotMatch(shared.note, /Here the loss differences are persistent/);
});
