// digits trims fractions only: a count, a share amount or a large dollar total is never changed.
import assert from "node:assert/strict";
import test from "node:test";

import { compact, sig } from "../src/math.mjs";

test("sig and compact keep whole numbers and integer parts exact", () => {
  assert.equal(sig(227917808, 4), 227917808);
  assert.equal(sig(299253556246, 10), 299253556246);
  assert.equal(sig(1234567.89, 4), 1234568);
  assert.equal(sig(0.940123456, 4), 0.9401);
  assert.equal(sig(-0.0001234567, 3), -0.000123);
  assert.deepEqual(compact({ nobs: 1439, p: 0.4973123, rows: [[1067983, 1.23456789]] }, 4), { nobs: 1439, p: 0.4973, rows: [[1067983, 1.235]] });
});
