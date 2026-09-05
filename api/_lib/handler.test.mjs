import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { validatorHandler } from "./handler.js";

function makeReq(body, { key = "ck_live_" + "a".repeat(43), method = "POST" } = {}) {
  const text = JSON.stringify(body);
  const req = Readable.from([Buffer.from(text)]);
  req.method = method;
  req.headers = { "content-length": String(Buffer.byteLength(text)), authorization: key ? `Bearer ${key}` : undefined, "x-forwarded-for": "203.0.113.1" };
  return req;
}
function makeRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s ?? ""; };
  res.json = () => JSON.parse(res.body);
  return res;
}
function fakeStore({ remaining = 999, saveFails = false } = {}) {
  const saved = [];
  return {
    saved,
    consumeQuota: async () => ({ remaining }),
    saveReceipt: async (r) => { if (saveFails) throw new Error("db down"); saved.push(r); },
  };
}
const handler = (store) => validatorHandler({ endpoint: "validate/breadth", sourcesPaths: ["js/breadth-core.js"], store, compute: (body) => { if (typeof body.x !== "number") throw new RangeError("x must be a number"); return { doubled: body.x * 2 }; } });

test("a valid call returns the envelope, the receipt and quota headers", async () => {
  const store = fakeStore();
  const res = makeRes();
  await handler(store)(makeReq({ x: 2 }), res);
  assert.equal(res.statusCode, 200, res.body);
  const e = res.json();
  assert.equal(e.data.doubled, 4);
  assert.match(e.receipt.id, /^[0-9a-f]{24}$/);
  assert.equal(e.receipt.url, `https://canlicapital.com/api/v1/receipts/${e.receipt.id}`);
  assert.equal(res.headers["X-RateLimit-Remaining"], "999");
  assert.equal(e.sources[0].path, "js/breadth-core.js");
  assert.ok(e.limits.length >= 4);
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].id, e.receipt.id);
});

test("the receipt id is a function of input and output, not of time", async () => {
  const store = fakeStore();
  const a = makeRes(); const b = makeRes();
  await handler(store)(makeReq({ x: 2 }), a);
  await handler(store)(makeReq({ x: 2 }), b);
  assert.equal(a.json().receipt.id, b.json().receipt.id);
});

test("no key is 401, an unknown key is 401, an exhausted key is 429 with Retry-After", async () => {
  let res = makeRes();
  await handler(fakeStore())(makeReq({ x: 2 }, { key: null }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "unauthorized");
  res = makeRes();
  await handler(fakeStore({ remaining: -2 }))(makeReq({ x: 2 }), res);
  assert.equal(res.statusCode, 401);
  res = makeRes();
  await handler(fakeStore({ remaining: -1 }))(makeReq({ x: 2 }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().error.code, "quota_exhausted");
  assert.match(res.headers["Retry-After"], /^\d+$/);
});

test("compute errors are 422 with the message, never a 500", async () => {
  const res = makeRes();
  await handler(fakeStore())(makeReq({ x: "no" }), res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "invalid_input");
  assert.match(res.json().error.message, /x must be a number/);
});

test("a store that cannot save the receipt does not hide the verdict", async () => {
  const res = makeRes();
  await handler(fakeStore({ saveFails: true }))(makeReq({ x: 2 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().data.receipt_stored, false);
});

test("GET is 405 and OPTIONS is 204", async () => {
  let res = makeRes();
  await handler(fakeStore())(makeReq({}, { method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  res = makeRes();
  await handler(fakeStore())(makeReq({}, { method: "OPTIONS" }), res);
  assert.equal(res.statusCode, 204);
});
