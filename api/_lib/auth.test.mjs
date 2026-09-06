import assert from "node:assert/strict";
import test from "node:test";

import { bearerKey, clientHash, generateKey, hashKey, refererHost } from "./auth.js";

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

// refererHost records where a key was issued from without any tracking parameter: the HOST only,
// lowercase, never the path or query, and null rather than a guess when the header is missing or
// cannot be parsed as an absolute URL.
test("refererHost strips the path and query, keeping only the lowercase host", () => {
  assert.equal(refererHost({ headers: { referer: "https://Example.COM/docs/quickstart?utm=1" } }), "example.com");
  assert.equal(refererHost({ headers: { referer: "http://sub.EXAMPLE.com:8080/a/b" } }), "sub.example.com:8080");
});

test("refererHost returns null when the header is missing", () => {
  assert.equal(refererHost({ headers: {} }), null);
  assert.equal(refererHost({ headers: { referer: "" } }), null);
});

test("refererHost returns null on a malformed or relative referer rather than guessing", () => {
  assert.equal(refererHost({ headers: { referer: "/relative/path" } }), null);
  assert.equal(refererHost({ headers: { referer: "not a url" } }), null);
  assert.equal(refererHost({ headers: { referer: "http://" } }), null);
});

test("refererHost also reads the historical 'referrer' spelling", () => {
  assert.equal(refererHost({ headers: { referrer: "https://Other.example/" } }), "other.example");
});
