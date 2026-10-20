// Arguments that cannot be a file path or a factor are refused as such, not crashed on. Found by
// canli-mcp's bench/robustness.mjs: a NUL character in prices_file reached readFileSync, which
// throws a TypeError; "constructor" read Object's constructor out of the factor table.
import assert from "node:assert/strict";
import test from "node:test";

import { factorNeeds } from "../src/pit.mjs";
import { backtestInput, pitInput } from "../src/server.mjs";

test("a NUL character in a file path fails validation with a reason", () => {
  for (const [schema, args, field] of [
    [backtestInput, { prices_file: "prices\u0000.csv", signal_file: "signal.csv" }, "prices_file"],
    [backtestInput, { prices_file: "prices.csv", signal_file: "\u0000" }, "signal_file"],
    [pitInput, { factor: "roa", tickers: ["AAPL"], start: "2020-01-01", end: "2024-12-31", out_file: "a\u0000b.csv" }, "out_file"],
  ]) {
    const r = schema.safeParse(args);
    assert.equal(r.success, false, field);
    assert.match(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), new RegExp(`${field}: a file path cannot contain a NUL character`));
  }
  assert.equal(backtestInput.safeParse({ prices_file: "prices.csv", signal_file: "signal.csv" }).success, true);
});

test("a factor name that is a built-in property is an unknown factor", () => {
  for (const f of ["constructor", "__proto__", "toString"]) assert.throws(() => factorNeeds(f), /unknown factor/, f);
  assert.ok(Array.isArray(factorNeeds("roa")));
});
