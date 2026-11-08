// receipt_check: a receipt's documents and those of the receipts it was built from, once each, read again by the
// markets pack's source_check; a receipt that names no documents says nothing can have changed under it.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { keyIdFor } from "canli-validation-mcp/src/local/js/receipt-statement.js";
import { canonicalJson } from "canli-validation-mcp/src/local/scripts/canonical-json.mjs";

import { answerRoot, checkValue, proveValue, valuesOf } from "../src/answer-tree.mjs";
import { ANSWER_SIGNATURE_SCHEMA, checkAnswerSignature, documentsOf, receiptCheckInput, runReceiptCheck } from "../src/receipt-check.mjs";
import { RECEIPT_KEY, registerAll } from "../src/server.mjs";

const doc = (url, extra = {}) => ({ url, sha256_16: "0123456789abcdef", retrieved_at: "2026-11-04T06:00:00.000Z", ...extra });

test("a receipt's documents and its parents', once each", () => {
  const receipt = { input_sha256: "a".repeat(64), output_sha256: "b".repeat(64), at: "2026-11-04T08:00:00.000Z", sources: [doc("https://www.sec.gov/a.htm")], from: [{ ref: "r1", sources: [doc("https://www.sec.gov/a.htm"), doc("https://canlicapital.com/company-data/sources/x.json.gz", { sha256: "c".repeat(64), sha256_16: undefined })], from: [{ ref: "r0", input_sha256: "d".repeat(64) }] }] };
  assert.deepEqual(documentsOf(receipt).map((d) => d.url), ["https://www.sec.gov/a.htm", "https://canlicapital.com/company-data/sources/x.json.gz"]);
  assert.equal(documentsOf(receipt)[1].sha256, "c".repeat(64));
});

test("the documents go to source_check; none means nothing can have changed", async () => {
  const calls = [];
  const ctx = { call: async (name, args) => { calls.push([name, args]); return { same: 1, changed: 0, not_checked: 0, rows: [] }; } };
  const out = await runReceiptCheck(ctx, { receipt: { output_sha256: "b".repeat(64), sources: [doc("https://www.sec.gov/a.htm")] } });
  assert.deepEqual(calls, [["source_check", { sources: [doc("https://www.sec.gov/a.htm")] }]]);
  assert.equal(out.same, 1);
  assert.equal(out.answer.output_sha256, "b".repeat(64));
  const none = await runReceiptCheck(ctx, { receipt: { sources: [] } });
  assert.match(none.reading, /names no documents/);
  assert.equal(calls.length, 1);
});

// A key as canli-receipt-keys.json publishes one, and a receipt signed with it the way the hosted server signs: Ed25519
// over the canonical JSON of {schema, receipt}, the receipt without its signature.
function receiptKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  return { privateKey, published: { key_id: keyIdFor(Buffer.from(x, "base64url")), alg: "Ed25519", x, status: "active" } };
}
const signedWith = (key, receipt) => ({ ...receipt, signature: { alg: "Ed25519", schema: ANSWER_SIGNATURE_SCHEMA, key_id: key.published.key_id, value: sign(null, Buffer.from(canonicalJson({ schema: ANSWER_SIGNATURE_SCHEMA, receipt }), "utf8"), key.privateKey).toString("base64url") } });
const HOSTED = { server: "canli-mcp@0.21.0", packs: { markets: "0.16.0" }, input_sha256: "a".repeat(64), output_sha256: "b".repeat(64), sources: [doc("https://www.sec.gov/a.htm", { title: "Société Générale, 20-F" })], at: "2026-11-07T19:00:00.000Z", endpoint: "canlicapital.com/mcp/canli" };

test("a hosted receipt's signature is checked offline against the published keys, and any change to the receipt fails it", () => {
  const key = receiptKey();
  const receipt = signedWith(key, HOSTED);
  assert.deepEqual(checkAnswerSignature(receipt, [key.published]), { valid: true, checks: { signed: true, key_published: true, signature_valid: true }, key_id: key.published.key_id });
  // Kept in another key order, or read through the tool's input, it is the same receipt.
  assert.equal(checkAnswerSignature(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(receipt).reverse()))), [key.published]).valid, true);
  assert.equal(checkAnswerSignature(receiptCheckInput.parse({ receipt }).receipt, [key.published]).valid, true);
  // A field JSON leaves out (undefined) was never sent, so it was never signed.
  assert.equal(checkAnswerSignature({ ...receipt, dropped: undefined }, [key.published]).valid, true);

  const holds = (edit) => checkAnswerSignature({ ...receipt, ...edit }, [key.published]).checks.signature_valid;
  assert.equal(holds({ output_sha256: "0".repeat(64) }), false, "another answer");
  assert.equal(holds({ at: "2026-01-01T00:00:00.000Z" }), false, "another time");
  assert.equal(holds({ endpoint: "example.com/mcp" }), false, "another endpoint");
  assert.equal(holds({ sources: [] }), false, "a document dropped");
  assert.equal(holds({ signature: { ...receipt.signature, schema: "canli.receipt-signature.v1" } }), false, "a validation receipt's schema");
  assert.equal(holds({ signature: { ...receipt.signature, value: "bm90IGEgc2lnbmF0dXJl" } }), false, "not a signature");
  assert.deepEqual(checkAnswerSignature(receipt, [receiptKey().published]).checks, { signed: true, key_published: false, signature_valid: false }, "a key canlicapital.com does not publish");
  assert.equal(checkAnswerSignature(receipt, [{ ...receiptKey().published, key_id: key.published.key_id }]).checks.signature_valid, false, "a published entry whose key is not its key id");
  const renamed = { ...receipt, signature: { ...receipt.signature, key_id: "0".repeat(16) } };
  assert.equal(checkAnswerSignature(renamed, [{ ...key.published, key_id: "0".repeat(16) }]).valid, false, "the right key listed under an id that is not its own");
  for (const unsigned of [HOSTED, { ...HOSTED, signature: null }]) assert.deepEqual(checkAnswerSignature(unsigned, [key.published]), { valid: false, checks: { signed: false, key_published: false, signature_valid: false }, key_id: null });
});

test("receipt_check reads the signature with the keys canlicapital.com publishes, beside the documents", async () => {
  const ctx = { call: async () => ({ same: 1, changed: 0, not_checked: 0, rows: [] }) };
  const local = await runReceiptCheck(ctx, { receipt: HOSTED });
  assert.equal(local.signature.valid, false);
  assert.match(local.signature.reading, /^Not signed: the hosted server .* signs its receipts; a local server holds no key/);
  assert.equal(local.same, 1);
  // Signed, but not with a published key: a test key is not one of them.
  const other = await runReceiptCheck(ctx, { receipt: signedWith(receiptKey(), HOSTED) });
  assert.deepEqual(other.signature.checks, { signed: true, key_published: false, signature_valid: false });
  assert.match(other.signature.reading, /^Not signed with a key canlicapital\.com publishes .*canli-receipt-keys\.json/);
  // The published key is bundled: a receipt naming it whose signature does not match is caught as changed, with no
  // documents to read as well.
  const forged = await runReceiptCheck(ctx, { receipt: { output_sha256: "b".repeat(64), sources: [], endpoint: "canlicapital.com/mcp/canli", signature: { alg: "Ed25519", schema: ANSWER_SIGNATURE_SCHEMA, key_id: "269d381734732ea6", value: "A".repeat(86) } } });
  assert.deepEqual(forged.signature.checks, { signed: true, key_published: true, signature_valid: false });
  assert.match(forged.signature.reading, /^The signature does not match this receipt/);
  assert.equal(forged.documents, 0);
});

test("a server that signs its receipts puts the whole signed receipt in the answer, which receipt_check reads as signed", async () => {
  const key = receiptKey();
  const handlers = (options) => {
    const h = {};
    registerAll({ registerTool: (name, _c, fn) => { h[name] = fn; }, registerResource: () => {}, registerPrompt: () => {} }, ["quant"], undefined, options);
    return h;
  };
  const call = { name: "return_stats", arguments: { returns: [0.01, -0.02, 0.015, 0.003, -0.004, 0.012] }, receipt: true };
  const signing = await handlers({ readOnly: true, receipts: { endpoint: "example.org/mcp", sign: (receipt) => signedWith(key, receipt).signature } }).run_tool(call);
  const meta = signing._meta[RECEIPT_KEY];
  assert.equal(meta.endpoint, "example.org/mcp");
  assert.deepEqual(signing.structuredContent.receipt, meta, "the receipt in the answer is the signed one in _meta");
  const read = JSON.parse(signing.content[0].text).receipt;
  assert.deepEqual(read, meta, "and it is in the text the model reads");
  assert.equal(checkAnswerSignature(read, [key.published]).valid, true);
  // The signed receipt carries the root of the tree over the output's values. With digits the answer shows the output
  // as hashed (the same bytes as output_sha256), so the root rebuilt from it is the receipt's, and one value proved
  // from it checks against the receipt.
  const exact = await handlers({ readOnly: true, receipts: { endpoint: "example.org/mcp", sign: (receipt) => signedWith(key, receipt).signature } }).run_tool({ ...call, digits: 10 });
  const head = exact._meta[RECEIPT_KEY];
  const { receipt: _r, ref: _ref, ...result } = exact.structuredContent;
  const output = [{ name: call.name, result }];
  assert.equal(createHash("sha256").update(JSON.stringify(output)).digest("hex"), head.output_sha256, "the output as hashed");
  assert.deepEqual({ root: head.output_root, values: head.output_values }, answerRoot(output));
  const [pointer] = valuesOf(output).find(([p, v]) => p.startsWith("/0/result/") && typeof v === "number");
  assert.equal(checkValue(proveValue(output, pointer), { root: head.output_root, values: head.output_values }).ok, true);
  assert.equal(checkAnswerSignature(head, [key.published]).valid, true);
  assert.equal(checkAnswerSignature({ ...head, output_root: "0".repeat(64) }, [key.published]).valid, false, "the root is under the signature");
  // A server that signs nothing keeps the short receipt in the answer, and its _meta receipt names no endpoint.
  const plain = await handlers({ readOnly: true }).run_tool(call);
  assert.deepEqual(Object.keys(plain.structuredContent.receipt).sort(), ["input_sha256", "output_sha256", "packs", "server", "sources"]);
  assert.deepEqual([plain._meta[RECEIPT_KEY].endpoint, plain._meta[RECEIPT_KEY].signature, plain._meta[RECEIPT_KEY].output_root], [undefined, undefined, undefined]);
  assert.equal(plain._meta[RECEIPT_KEY].output_sha256, meta.output_sha256, "signing changes nothing that was answered");
});
