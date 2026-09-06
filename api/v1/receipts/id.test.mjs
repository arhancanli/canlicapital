// api/v1/receipts/id.test.mjs
// Tests GET /api/v1/receipts/{id} at ./[id].js: the badge_url and embed_markdown fields the
// receipt badge feature adds. Named without brackets (see badge.test.mjs's header comment for why)
// while importing the bracketed file directly, which ES module resolution treats as a literal
// path with no shell glob involved.
import assert from "node:assert/strict";
import test from "node:test";

import { createReceiptHandler } from "./[id].js";

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

const ID = "8f21a0c3b1d2aaaaaaaaaaaa";
const ROW = {
  id: ID,
  endpoint: "validate/deflated-sharpe",
  input_sha256: "sha256:aa",
  output: { derived_inputs: { observations: 730 } },
  bindings: { "js/dsr-core.js": "sha256:bb" },
  created_at: "2026-09-06T00:00:00Z",
};

test("a stored receipt's response carries badge_url and embed_markdown matching the published embed snippet", async () => {
  const res = makeRes();
  await createReceiptHandler({ store: fakeStore(ROW) })(makeReq(ID), res);
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.data.badge_url, `https://canlicapital.com/api/v1/receipts/${ID}/badge.svg`);
  assert.equal(
    body.data.embed_markdown,
    `[![Canli receipt](https://canlicapital.com/api/v1/receipts/${ID}/badge.svg)](https://canlicapital.com/api/v1/receipts/${ID})`,
  );
});

test("embed_markdown round-trips the id: the id can be recovered from the markdown alone", async () => {
  const res = makeRes();
  await createReceiptHandler({ store: fakeStore(ROW) })(makeReq(ID), res);
  const body = res.json();
  const fromBadge = /receipts\/([0-9a-f]{24})\/badge\.svg/.exec(body.data.embed_markdown)?.[1];
  const fromLink = /\]\(https:\/\/canlicapital\.com\/api\/v1\/receipts\/([0-9a-f]{24})\)$/.exec(body.data.embed_markdown)?.[1];
  assert.equal(fromBadge, ID);
  assert.equal(fromLink, ID);
  assert.equal(body.data.id, ID);
});

test("an unknown id returns 404 with no badge_url or embed_markdown leaked", async () => {
  const res = makeRes();
  await createReceiptHandler({ store: fakeStore(null) })(makeReq("0".repeat(24)), res);
  assert.equal(res.statusCode, 404);
  const body = res.json();
  assert.equal(body.data.badge_url, undefined);
  assert.equal(body.data.embed_markdown, undefined);
});

test("a malformed id is rejected 400 before the store is called", async () => {
  let called = false;
  const res = makeRes();
  await createReceiptHandler({ store: { getReceipt: async () => { called = true; } } })(makeReq("not-hex"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});
