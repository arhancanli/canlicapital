import assert from "node:assert/strict";
import test from "node:test";

import { bearerKey, clientHash, generateKey, hashKey } from "./auth.js";

test("keys have the declared shape and never repeat", () => {
  const a = generateKey();
  const b = generateKey();
  assert.match(a, /^ck_live_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.match(hashKey(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashKey(a), hashKey(b));
});

test("bearer parsing accepts only our prefix", () => {
  assert.equal(bearerKey({ headers: { authorization: "Bearer ck_live_abc" } }), "ck_live_abc");
  assert.equal(bearerKey({ headers: { authorization: "Bearer sk_other" } }), null);
  assert.equal(bearerKey({ headers: {} }), null);
});

test("client hash uses the first forwarded ip, the day and the salt, and never the raw ip", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } };
  const h = clientHash(req, "salt", new Date("2026-09-05T10:00:00Z"));
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes("203.0.113.9"));
  assert.notEqual(h, clientHash(req, "salt", new Date("2026-09-06T10:00:00Z")));
  assert.notEqual(h, clientHash(req, "other", new Date("2026-09-05T10:00:00Z")));
});
