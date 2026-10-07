// Every reference case: the server's result must match an independent computation (numpy, scipy,
// statsmodels, empyrical; scripts/reference/) within the case's relative tolerance.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { runTool } from "../src/registry.mjs";

const DIR = new URL("./fixtures/", import.meta.url);

function close(got, want, tol, where) {
  if (Array.isArray(want)) {
    assert.ok(Array.isArray(got), `${where}: expected an array`);
    assert.equal(got.length, want.length, `${where}: length`);
    want.forEach((w, i) => close(got[i], w, tol, `${where}[${i}]`));
    return;
  }
  assert.equal(typeof got, "number", `${where}: got ${JSON.stringify(got)}`);
  const err = Math.abs(got - want) / Math.max(Math.abs(want), 1e-6);
  assert.ok(err <= tol, `${where}: got ${got}, reference ${want}, error ${err.toExponential(2)} > ${tol}`);
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const { cases } = JSON.parse(readFileSync(new URL(file, DIR), "utf8"));
  test(`${file}: ${cases.length} cases match the reference`, () => {
    cases.forEach((c, i) => {
      const out = runTool(c.tool, c.args);
      for (const [k, v] of Object.entries(c.expect)) close(out[k], v, Math.max(c.tol, 1e-9), `${file}#${i} ${c.tool}.${k}`);
    });
  });
}
