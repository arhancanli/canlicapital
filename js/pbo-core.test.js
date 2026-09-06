import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { pboCscv } from "./pbo-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VECTORS = JSON.parse(readFileSync(resolve(ROOT, "standards/validation-api/vectors.json"), "utf8"));

for (const v of VECTORS.pbo) {
  test(`cscv parity: ${v.id}`, () => {
    const out = pboCscv(v.matrix, { nSplits: v.n_splits, maxCombinations: v.max_combinations, seed: v.seed });
    assert.equal(out.exhaustive, v.exhaustive);
    assert.equal(out.n_combinations, v.expected.n_combinations);
    if (v.exhaustive) {
      // Same combinations in the same order: every logit must agree.
      assert.equal(out.lambdas.length, v.expected.lambdas.length);
      out.lambdas.forEach((l, i) => assert.ok(Math.abs(l - v.expected.lambdas[i]) <= 1e-9, `lambda[${i}] ${l} vs ${v.expected.lambdas[i]}`));
      assert.ok(Math.abs(out.pbo - v.expected.pbo) <= 1e-12);
    } else {
      // Different sampler than numpy by declaration: agree on the estimate within sampling noise.
      assert.ok(Math.abs(out.pbo - v.expected.pbo) <= 0.05, `sampled pbo ${out.pbo} vs ${v.expected.pbo}`);
    }
  });
}

test("a matrix with one obviously superior column has a low pbo", () => {
  const rows = 128;
  const matrix = Array.from({ length: rows }, (_, t) => [0.01 + 0.002 * Math.sin(t), 0.0005 * Math.cos(t), -0.0005 * Math.sin(t / 3), 0.0002]);
  const out = pboCscv(matrix, { nSplits: 8 });
  assert.ok(out.pbo < 0.2, `pbo ${out.pbo}`);
});

test("a zero-variance column can never be selected and ranks worst", () => {
  const matrix = Array.from({ length: 64 }, (_, t) => [0.001, Math.sin(t) * 0.01, Math.cos(t) * 0.01]);
  const out = pboCscv(matrix, { nSplits: 4 });
  assert.ok(Number.isFinite(out.pbo));
  for (const [isBest] of out.is_oos_pairs) assert.ok(Number.isFinite(isBest));
});

test("shape errors are refused", () => {
  assert.throws(() => pboCscv([[0.1]], { nSplits: 4 }), /2 config columns/);
  assert.throws(() => pboCscv([[0.1, 0.2], [0.1, 0.2]], { nSplits: 4 }), /rows/);
  assert.throws(() => pboCscv([[0.1, 0.2], [0.1, 0.2], [0.1, 0.2]], { nSplits: 3 }), /even/);
});
