// api/v1/keys.test.mjs
// The bug this file guards against: a body.js parse error that is not a 413 used to fall through
// to `body = {}`, so a shell-quoting typo in the request body still issued a key. Malformed JSON
// must be a 400 with the envelope's invalid_json error, and it must never reach the store: an
// issued key is not refundable, so the fix is proven by asserting the store was not called, not
// only by the status code.
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import handler, { validateBody } from "./keys.js";

function makeReq(rawBody, headers = {}) {
  const text = rawBody ?? "";
  const req = Readable.from([Buffer.from(text)]);
  req.method = "POST";
  req.headers = { "content-length": String(Buffer.byteLength(text)), ...headers };
  return req;
}

function makeRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s ?? ""; };
  res.json = () => JSON.parse(res.body);
  return res;
}

const ORIGINAL_FETCH = globalThis.fetch;
test.beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.API_CLIENT_SALT = "test-salt";
});
test.afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

test("malformed JSON is rejected 400 invalid_json and never reaches the store", async () => {
  let storeCalled = false;
  globalThis.fetch = async () => { storeCalled = true; throw new Error("the store must not be called"); };
  const res = makeRes();
  await handler(makeReq("{not json"), res);
  assert.equal(res.statusCode, 400, res.body);
  const body = res.json();
  assert.equal(body.error.code, "invalid_json");
  assert.equal(storeCalled, false, "a malformed body must not consume a key issuance");
  assert.equal(body.data.key, undefined);
});

test("a non-object JSON root (an array) is rejected 400 and never reaches the store", async () => {
  let storeCalled = false;
  globalThis.fetch = async () => { storeCalled = true; throw new Error("the store must not be called"); };
  const res = makeRes();
  await handler(makeReq("[1,2,3]"), res);
  assert.equal(res.statusCode, 400, res.body);
  assert.equal(res.json().error.code, "not_an_object");
  assert.equal(storeCalled, false);
});

test("an empty body still issues a key with label null", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ issued: true, remaining: 4 }), text: async () => "" };
  };
  const res = makeRes();
  await handler(makeReq(""), res);
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().data.label, null);
  assert.ok(calls.length > 0, "a valid empty body must still issue a key");
});

test("no content-length header and an empty stream also issues a key", async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ issued: true, remaining: 4 }), text: async () => "" });
  const res = makeRes();
  const req = Readable.from([]);
  req.method = "POST";
  req.headers = {};
  await handler(req, res);
  assert.equal(res.statusCode, 201, res.body);
});

test("validateBody accepts a missing label and rejects nothing by type coercion", () => {
  assert.deepEqual(validateBody({}), { label: null });
  assert.deepEqual(validateBody({ label: "abc" }), { label: "abc" });
  assert.deepEqual(validateBody({ label: 5 }), { label: null });
});

// Source attribution without a tracking parameter: the Referer header's host, lowercase, path and
// query stripped, reaches the store's issue_key call. This is the store CALL SHAPE test the launch
// kit plan asks for; it never touches a live database, only the fetch stub keys.test.mjs already
// uses for the rest of this handler.
test("a Referer header's host reaches the store as p_source_host, path and query stripped", async () => {
  let sentHost;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/rpc/issue_key")) sentHost = JSON.parse(init.body).p_source_host;
    return { ok: true, status: 200, json: async () => ({ issued: true, remaining: 4 }), text: async () => "" };
  };
  const res = makeRes();
  await handler(makeReq("", { referer: "https://GitHub.com/some/repo?tab=readme" }), res);
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(sentHost, "github.com");
});

test("no Referer header reaches the store as a null source host, not a guess", async () => {
  let sentHost = "unset";
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/rpc/issue_key")) sentHost = JSON.parse(init.body).p_source_host;
    return { ok: true, status: 200, json: async () => ({ issued: true, remaining: 4 }), text: async () => "" };
  };
  const res = makeRes();
  await handler(makeReq(""), res);
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(sentHost, null);
});
