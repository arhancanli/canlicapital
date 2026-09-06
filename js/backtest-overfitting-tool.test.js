import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseMatrix, pboCscv, summarize } from "./backtest-overfitting-tool.js";
import { canonicalJson } from "../scripts/canonical-json.mjs";

const contract = JSON.parse(
  readFileSync(new URL("../public/glassbox/backtest_overfitting_calculator_contract.json", import.meta.url)),
);

test("the published worked example reproduces its own computed result", () => {
  const w = contract.worked_example;
  const result = pboCscv(w.matrix, { nSplits: w.n_splits, maxCombinations: w.max_combinations, seed: w.seed });
  assert.equal(result.exhaustive, w.computed.exhaustive);
  assert.equal(result.n_combinations, w.computed.n_combinations);
  assert.equal(result.block_length, w.computed.block_length);
  assert.ok(Math.abs(result.pbo - w.computed.pbo) < 1e-12);
});

test("parseMatrix reads comma-separated rows and rejects ragged ones", () => {
  assert.deepEqual(parseMatrix("1, 2, 3\n4, 5, 6"), [[1, 2, 3], [4, 5, 6]]);
  assert.throws(() => parseMatrix("1, 2\n3"), /Row 2 has 1 values, row 1 has 2/);
  assert.throws(() => parseMatrix("1, x\n3, 4"), /not a number/);
  assert.throws(() => parseMatrix("   \n  "), /at least one row/);
});

test("summarize agrees with the API's plain reading and sampler description", () => {
  const w = contract.worked_example;
  const result = pboCscv(w.matrix, { nSplits: w.n_splits, maxCombinations: w.max_combinations, seed: w.seed });
  const summary = summarize(result, w.seed);
  assert.ok(summary.plainReading.includes(`${result.n_combinations}`));
  assert.equal(summary.sampler, "all combinations enumerated in lexicographic order");
  assert.ok(summary.meanIsSharpe >= summary.meanOosSharpe || summary.degraded > 0);
});

test("the calculator contract's content hash reproduces from its own payload", () => {
  const payload = { ...contract };
  delete payload.content_hash;
  const observed = `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
  assert.equal(observed, contract.content_hash);
});
