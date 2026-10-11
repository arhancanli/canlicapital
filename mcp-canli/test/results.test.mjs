// What run_tool sends back when a result is too large to read, or holds numbers JSON cannot print.
import assert from "node:assert/strict";
import test from "node:test";

import { RESULT_CHARS, nonFinitePaths, preview, registerAll } from "../src/server.mjs";

function handlers() {
  const h = {};
  registerAll({ registerTool: (name, _c, fn) => { h[name] = fn; }, registerResource: () => {}, registerPrompt: () => {} }, ["quant"]);
  return h;
}
const prices = Array.from({ length: 30000 }, (_, i) => 100 * Math.exp(0.0002 * i + 0.01 * Math.sin(i / 7)));

test("a result above the size limit comes back as a preview that names what it cut, and show_result pages the rest", async () => {
  const h = handlers();
  const r = await h.run_tool({ name: "convert_returns", arguments: { values: prices, from: "prices", to: "simple" } });
  assert.ok(!r.isError, r.content?.[0]?.text);
  const out = r.structuredContent;
  assert.ok(JSON.stringify(out).length < 5000, "the preview is small");
  assert.ok(out.preview_only.chars > RESULT_CHARS);
  assert.deepEqual(out.preview_only.shortened, [{ path: "values", items: 29999 }]);
  assert.equal(out.values.list_of, 29999);
  assert.equal(out.values.first.length, 5);
  assert.match(out.preview_only.note, /"name": "show_result".*"ref": "r1".*"path": "values"/);
  const page = (await h.run_tool({ name: "show_result", arguments: { ref: out.ref, path: "values", offset: 29990, limit: 50 } })).structuredContent;
  assert.equal(page.total, 29999);
  assert.equal(page.items.length, 9);
  assert.equal(page.next_offset, undefined, "the last page has no next offset");
  const one = (await h.run_tool({ name: "show_result", arguments: { ref: out.ref, path: "values.0" } })).structuredContent;
  assert.equal(typeof one.value, "number");
  const missing = await h.run_tool({ name: "show_result", arguments: { ref: "r99" } });
  assert.ok(missing.isError && /not kept/.test(missing.content[0].text));
});

test("a small result is untouched, and show_result inside a batch reads an earlier ref", async () => {
  const h = handlers();
  const r = (await h.run_tool({ name: "convert_returns", arguments: { values: prices.slice(0, 100), from: "prices", to: "simple" } })).structuredContent;
  assert.equal(r.preview_only, undefined);
  assert.equal(r.values.length, 99);
  const batch = (await h.run_tool({ calls: [{ name: "show_result", arguments: { ref: r.ref, path: "values", limit: 3 } }] })).structuredContent;
  assert.deepEqual(batch.results[0].result.items, r.values.slice(0, 3));
});

test("numbers JSON cannot print are named, not left to read as missing", async () => {
  const h = handlers();
  const r = (await h.run_tool({ name: "zero_coupon_bond", arguments: { price: 1e308, years: 5 } })).structuredContent;
  assert.deepEqual(r.non_finite_values.paths, ["modified_duration", "convexity", "dv01"]);
  assert.equal(r.non_finite_values.count, 3);
  assert.deepEqual(nonFinitePaths({ a: [1, NaN, { b: Infinity }], c: 2 }), ["a.1", "a.2.b"]);
  assert.deepEqual(preview(Array.from({ length: 41 }, (_, i) => i), "", []).first, [0, 1, 2, 3, 4]);
});
