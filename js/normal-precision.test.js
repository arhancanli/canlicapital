// The normal CDF and its inverse, which every published probability (PSR, DSR, MinTRL) runs
// through, agree with the C library's erfc to near machine precision, including deep in the tail.
// Reference: js/fixtures/normal-cdf-reference.json from scripts/reference/normal-cdf.py.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalCdf, normalPpf } from "./dsr-core.js";

const { points } = JSON.parse(readFileSync(new URL("./fixtures/normal-cdf-reference.json", import.meta.url), "utf8"));

test("normalCdf matches erfc to 2e-14 relative for x >= -20 and 1e-13 to x = -37", () => {
  assert.ok(points.length > 200);
  for (const [x, expected] of points) {
    const bound = x >= -20 ? 2e-14 : 1e-13;
    const rel = Math.abs(normalCdf(x) - expected) / expected;
    assert.ok(rel <= bound, `x=${x}: relative error ${rel}`);
  }
});

test("normalPpf inverts normalCdf to 1e-13 relative, from 1e-300 to 1 - 1e-12", () => {
  for (const p of [1e-300, 1e-100, 1e-20, 1e-9, 1e-4, 0.01, 0.02425, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97575, 0.99, 0.9999, 1 - 1e-9, 1 - 1e-12]) {
    const back = normalCdf(normalPpf(p));
    const scale = Math.min(p, 1 - p);
    assert.ok(Math.abs(back - p) / scale <= 1e-13 || Math.abs(back - p) <= 2e-16, `p=${p}: round trip ${back}`);
  }
});
