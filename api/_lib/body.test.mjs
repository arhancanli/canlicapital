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
