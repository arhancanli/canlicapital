import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { BodyError, readJsonBody } from "./body.js";

const req = (text, headers = {}) => Object.assign(Readable.from([Buffer.from(text)]), { headers: { "content-length": String(Buffer.byteLength(text)), ...headers } });

test("parses an object body", async () => {
  assert.deepEqual(await readJsonBody(req('{"a":1}'), 1024), { a: 1 });
});

test("refuses a declared oversize body before reading it", async () => {
  await assert.rejects(readJsonBody(req("{}", { "content-length": "5000" }), 1024), (e) => e instanceof BodyError && e.status === 413);
});

test("refuses an undeclared oversize body while reading it", async () => {
  const big = `{"a":"${"x".repeat(2000)}"}`;
  await assert.rejects(readJsonBody(req(big, { "content-length": undefined }), 1024), (e) => e.status === 413);
});

test("refuses malformed JSON and non-object roots", async () => {
  await assert.rejects(readJsonBody(req("{not json"), 1024), (e) => e.status === 400 && e.code === "invalid_json");
  await assert.rejects(readJsonBody(req("[1,2]"), 1024), (e) => e.status === 400 && e.code === "not_an_object");
});

test("an empty body is still invalid_json by default, but valid when allowEmpty is set", async () => {
  await assert.rejects(readJsonBody(req(""), 1024), (e) => e.status === 400 && e.code === "invalid_json");
  assert.deepEqual(await readJsonBody(req(""), 1024, { allowEmpty: true }), {});
  assert.deepEqual(await readJsonBody(req("   "), 1024, { allowEmpty: true }), {});
});

test("allowEmpty does not weaken malformed-but-nonempty bodies", async () => {
  await assert.rejects(readJsonBody(req("{not json"), 1024, { allowEmpty: true }), (e) => e.status === 400 && e.code === "invalid_json");
});

test("a Vercel pre-parse failure (body getter throws on malformed JSON) is invalid_json, not unreadable", async () => {
  // Production caught this: Vercel's Node runtime parses application/json bodies lazily and
  // throws on first access when the JSON is malformed, before our own parser ever runs. The
  // handler mapped that generic throw to 400 unreadable_body; the contract says invalid_json.
  const throwing = Object.assign(Readable.from([]), { headers: { "content-length": "9" } });
  Object.defineProperty(throwing, "body", { get() { throw new Error("Invalid JSON"); } });
  await assert.rejects(readJsonBody(throwing, 1024, { allowEmpty: true }), (e) => e instanceof BodyError && e.status === 400 && e.code === "invalid_json");
});
