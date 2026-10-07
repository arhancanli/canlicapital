import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync } from "node:crypto";

import { keyIdFor, outputSha256, verifyReceipt } from "../../js/receipt-statement.js";
import { dataReceipt, withDataReceipts } from "./data-receipts.js";

function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  return { env: { CANLI_RECEIPT_SIGNING_KEY: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") }, keys: [{ alg: "Ed25519", key_id: keyIdFor(Buffer.from(x, "base64url")), x }] };
}

test("every structured answer gets a receipt that verifies offline against the published key", async () => {
  const { env, keys } = testKey();
  const registered = {};
  const fake = { registerTool: (name, config, handler) => { registered[name] = handler; }, other: () => "passes through" };
  const wrapped = withDataReceipts(fake, { path: "/mcp/fundamentals", serverName: "canli-fundamentals-mcp", serverVersion: "0.5.0", env });
  assert.equal(wrapped.other(), "passes through");
  wrapped.registerTool("known_as_of", {}, async () => ({ content: [{ type: "text", text: "{}" }], structuredContent: { as_of: "2024-01-02", rows: [[1]], snapshot: { sha256: "abc" } } }));
  const res = await registered.known_as_of({ company: "AAPL", as_of: "2024-01-02" });
  const { receipt, ...output } = res.structuredContent;
  assert.equal(receipt.bindings.snapshot_sha256, "abc");
  assert.equal(receipt.output_sha256, outputSha256(output));
  assert.deepEqual(JSON.parse(res.content[0].text).receipt.id, receipt.id);
  const checked = verifyReceipt({ id: receipt.id, endpoint: receipt.endpoint, input_sha256: receipt.input_sha256, output, bindings: receipt.bindings, signature: receipt.signature }, keys);
  assert.equal(checked.valid, true, JSON.stringify(checked.checks));
});

test("a changed answer, a changed call or an unpublished key fails verification", () => {
  const { env, keys } = testKey();
  const output = { val: 1 };
  const r = dataReceipt({ endpoint: "/mcp/research/get_paper", tool: "get_paper", args: { slug: "a" }, output, bindings: { server: "s@1", snapshot_sha256: null } }, env);
  const base = { id: r.id, endpoint: r.endpoint, input_sha256: r.input_sha256, bindings: r.bindings, signature: r.signature };
  assert.equal(verifyReceipt({ ...base, output }, keys).valid, true);
  assert.equal(verifyReceipt({ ...base, output: { val: 2 } }, keys).valid, false);
  assert.notEqual(dataReceipt({ endpoint: r.endpoint, tool: "get_paper", args: { slug: "b" }, output, bindings: r.bindings }, env).input_sha256, r.input_sha256);
  assert.equal(verifyReceipt({ ...base, output }, testKey().keys).valid, false);
});

test("errors and unstructured results pass through unchanged, and no key means signature null", async () => {
  const registered = {};
  const wrapped = withDataReceipts({ registerTool: (n, c, h) => { registered[n] = h; } }, { path: "/p", serverName: "s", serverVersion: "1", env: {} });
  wrapped.registerTool("e", {}, async () => ({ isError: true, content: [{ type: "text", text: "bad" }] }));
  wrapped.registerTool("t", {}, async () => ({ content: [{ type: "text", text: "plain" }] }));
  wrapped.registerTool("s", {}, async () => ({ content: [{ type: "text", text: "{}" }], structuredContent: { a: 1 } }));
  assert.equal((await registered.e({})).structuredContent, undefined);
  assert.equal((await registered.t({})).content[0].text, "plain");
  assert.equal((await registered.s({})).structuredContent.receipt.signature, null);
});
