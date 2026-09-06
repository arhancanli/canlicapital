// api/v1/receipts/badge.test.mjs
// Tests the GET /api/v1/receipts/{id}/badge.svg handler at ./[id]/badge.js. This file lives one
// level up from the [id] directory (not inside it, and not itself named with brackets) so that
// `npm run verify`'s test file list, which names test files literally in a shell command, never
// has to pass a bracket-glob path to the shell. See package.json's "verify" script.
import assert from "node:assert/strict";
import test from "node:test";

import { createBadgeHandler } from "./[id]/badge.js";

function makeReq(id, method = "GET") {
  return { method, query: { id } };
}
function makeRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s ?? ""; };
  res.json = () => JSON.parse(res.body);
  return res;
}
function fakeStore(row) {
  return { getReceipt: async (id) => (row && row.id === id ? row : null) };
}

const FOUND_ID = "8f21a0c3b1d2aaaaaaaaaaaa";

test("a stored receipt returns a 200 SVG badge with a day-long cache, and sets no cookie", async () => {
  const row = { id: FOUND_ID, endpoint: "validate/deflated-sharpe", output: { derived_inputs: { observations: 730 } } };
  const res = makeRes();
  await createBadgeHandler({ store: fakeStore(row) })(makeReq(FOUND_ID), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /image\/svg\+xml/);
  assert.equal(res.headers["Cache-Control"], "public, max-age=86400");
  assert.equal(res.headers["Set-Cookie"], undefined, "a badge fetch must never set a cookie");
  assert.match(res.body, /DSR v1/);
  assert.match(res.body, /8f21a0c3b1d2/);
});

test("an unknown id returns a plain grey 404 badge, not a JSON error", async () => {
  const res = makeRes();
  await createBadgeHandler({ store: fakeStore(null) })(makeReq("0".repeat(24)), res);
  assert.equal(res.statusCode, 404);
  assert.match(res.headers["Content-Type"], /image\/svg\+xml/);
  assert.match(res.body, /receipt not found/i);
});

test("a malformed id is treated as unknown: 404 grey badge, the store is never called", async () => {
  let called = false;
  const res = makeRes();
  await createBadgeHandler({ store: { getReceipt: async () => { called = true; } } })(makeReq("not-hex-at-all"), res);
  assert.equal(res.statusCode, 404);
  assert.equal(called, false);
});

test("a store failure degrades to the same 404 grey badge rather than leaking an error", async () => {
  const res = makeRes();
  await createBadgeHandler({ store: { getReceipt: async () => { throw new Error("store down"); } } })(makeReq("a".repeat(24)), res);
  assert.equal(res.statusCode, 404);
  assert.match(res.headers["Content-Type"], /image\/svg\+xml/);
  assert.match(res.body, /receipt not found/i);
});

test("a non-GET method gets the JSON envelope, not an SVG", async () => {
  const res = makeRes();
  await createBadgeHandler({ store: fakeStore(null) })(makeReq(FOUND_ID, "POST"), res);
  assert.equal(res.statusCode, 405);
  assert.match(res.headers["Content-Type"], /application\/json/);
  assert.equal(res.json().error.code, "method_not_allowed");
});
