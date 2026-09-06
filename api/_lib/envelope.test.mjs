import assert from "node:assert/strict";
import test from "node:test";

import { canonical, contentId } from "./canonical.js";
import { envelope, errorEnvelope, quotaHeaders } from "./envelope.js";

test("canonical JSON sorts keys and contentId is stable across key order", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
  assert.equal(contentId({ b: 1, a: 2 }), contentId({ a: 2, b: 1 }));
  assert.match(contentId({ a: 1 }), /^[0-9a-f]{24}$/);
});

test("an envelope refuses to exist without limits", () => {
  assert.throws(() => envelope({ endpoint: "validate/x", limits: [], sources: [], data: {} }), /declares no limits/);
});

test("the envelope carries the required fields and the user-data claim class", () => {
  const e = envelope({ endpoint: "validate/breadth", limits: ["a"], sources: [{ path: "js/breadth-core.js", sha256: "sha256:00", url: "https://canlicapital.com/js/breadth-core.js" }], data: { x: 1 } });
  assert.equal(e.schema, "canli.api.v1");
  assert.equal(e.endpoint, "/api/v1/validate/breadth");
  assert.equal(e.claim_class, "USER_SUBMITTED_SCENARIO");
  assert.equal(e.capital_kind, "NOT_APPLICABLE_USER_SUBMITTED");
  assert.match(e.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.deepEqual(e.data, { x: 1 });
});

test("an error envelope has empty data and a coded error, and still has limits", () => {
  const e = errorEnvelope({ endpoint: "validate/breadth", code: "unauthorized", message: "no key", limits: ["a"] });
  assert.deepEqual(e.data, {});
  assert.deepEqual(e.error, { code: "unauthorized", message: "no key" });
  assert.equal(e.limits[0], "a");
});

test("quota headers are strings", () => {
  const h = quotaHeaders({ limit: 1000, remaining: 999, resetIso: "2026-09-06T00:00:00Z" });
  assert.deepEqual(h, { "X-RateLimit-Limit": "1000", "X-RateLimit-Remaining": "999", "X-RateLimit-Reset": "2026-09-06T00:00:00Z" });
});
