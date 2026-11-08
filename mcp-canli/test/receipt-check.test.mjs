// receipt_check: a receipt's documents and those of the receipts it was built from, once each, read again by the
// markets pack's source_check; a receipt that names no documents says nothing can have changed under it.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { keyIdFor } from "canli-validation-mcp/src/local/js/receipt-statement.js";
import { canonicalJson } from "canli-validation-mcp/src/local/scripts/canonical-json.mjs";

import { answerRoot, checkValue, proveValue, valuesOf } from "../src/answer-tree.mjs";
import { ANSWER_SIGNATURE_SCHEMA, checkAnswerSignature, documentsOf, proofsOf, receiptCheckInput, runReceiptCheck } from "../src/receipt-check.mjs";
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

// run_tool and the rest as a server registers them, with the input schema each is listed with.
const handlers = (options) => {
  const h = {};
  registerAll({ registerTool: (name, config, fn) => { h[name] = Object.assign(fn, { input: config.inputSchema }); }, registerResource: () => {}, registerPrompt: () => {} }, ["quant"], undefined, options);
  return h;
};

test("a server that signs its receipts puts the whole signed receipt in the answer, which receipt_check reads as signed", async () => {
  const key = receiptKey();
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

test("prove: each value named comes with its path to the signed receipt's root, and receipt_check checks it against that receipt", async () => {
  const key = receiptKey();
  const signing = handlers({ readOnly: true, receipts: { endpoint: "example.org/mcp", sign: (receipt) => signedWith(key, receipt).signature } });
  const local = handlers({ readOnly: true });
  // Listed only where the server signs: a local server holds no key, so a proof from it would prove nothing.
  assert.equal("prove" in signing.run_tool.input.shape, true);
  assert.equal("prove" in local.run_tool.input.shape, false);
  const returns = [0.01, -0.02, 0.015, 0.003, -0.004, 0.012];
  const calls = [{ name: "return_stats", arguments: { returns } }, { name: "return_stats", arguments: { returns: returns.slice(1) } }];
  const out = (await signing.run_tool({ calls, prove: ["/1/result/sharpe", "/0/result", "/1/result/mean"] })).structuredContent;
  const { receipt } = out;
  assert.equal(checkAnswerSignature(receipt, [key.published]).valid, true, "prove brings the signed receipt with it");
  assert.equal((await signing.run_tool({ calls, receipt: true })).structuredContent.receipt.output_root, receipt.output_root, "proving changes nothing that was answered");
  const [proof, whole, missing] = out.proofs;
  assert.deepEqual([proof.pointer, proof.root, proof.values], ["/1/result/sharpe", receipt.output_root, receipt.output_values]);
  assert.equal(checkValue(proof, { root: receipt.output_root, values: receipt.output_values }).ok, true);
  // The value as hashed, in full, where the answer shows it to six significant figures.
  assert.equal(out.results[1].result.sharpe, Number(proof.value.toPrecision(6)));
  assert.match(whole.error, /^\/0\/result holds more than one value: prove one of them, such as \/0\/result\//);
  assert.match(missing.error, /^The answer has no value at "\/1\/result\/mean": give a JSON Pointer to one value, such as \/1\/result\//);
  // One call alone is answered flat, but its output, and so its pointers, are a batch of one.
  const one = (await signing.run_tool({ ...calls[0], prove: ["/0/result/sharpe"] })).structuredContent;
  assert.equal(checkValue(one.proofs[0], { root: one.receipt.output_root, values: one.receipt.output_values }).ok, true);
  assert.equal(one.sharpe, Number(one.proofs[0].value.toPrecision(6)));

  // receipt_check: the proof against the receipt, offline, beside its signature (a test key is not a published one).
  const ctx = { call: async () => { throw new Error("the receipt names no documents to read"); } };
  const checked = await runReceiptCheck(ctx, { receipt, proofs: [proof] });
  assert.deepEqual(checked.proofs.rows, [{ pointer: "/1/result/sharpe", value: proof.value, in_answer: true }]);
  assert.equal(checked.proofs.reading, "The value is in the answer this receipt names. The receipt is not shown to be the server's (see signature), so this does not show the server gave it.");
  assert.equal(proofsOf(receipt, [proof], { valid: true }).reading, "The value is in the answer this receipt names. The receipt is signed with canlicapital.com's published key, so the server's answer held that value.");
  const problems = (proofs, r = receipt) => proofsOf(r, proofs, { valid: true }).rows.map((row) => row.problem ?? "in the answer");
  assert.deepEqual(problems([{ ...proof, value: proof.value * 2 }]), ["the path does not lead to the root"], "another value");
  assert.deepEqual(problems([{ ...proof, pointer: "/0/result/sharpe" }]), ["the path does not lead to the root"], "the value moved to another call");
  assert.deepEqual(problems([proof], { ...receipt, output_root: "0".repeat(64) }), ["the proof's root is not the receipt's"], "another answer's receipt");
  assert.deepEqual(problems([proof], { ...receipt, output_values: receipt.output_values + 1 }), [`the proof is for ${proof.values} values, the receipt for ${proof.values + 1}`]);
  assert.equal(proofsOf(receipt, [proof, { ...proof, value: 0 }], { valid: true }).reading, "1 of 2 values is not in the answer this receipt names (each row says why); the other one is. The receipt is signed with canlicapital.com's published key, so the server's answer held that value.");
  assert.equal(proofsOf(receipt, [{ ...proof, value: 0 }, { ...proof, value: 1 }], { valid: true }).reading, "2 of 2 values are not in the answer this receipt names (each row says why).");
  // A receipt with no root, as a local server's: nothing to check a value against.
  const plain = (await local.run_tool({ calls, receipt: true })).structuredContent.receipt;
  assert.match((await runReceiptCheck(ctx, { receipt: plain, proofs: [proof] })).proofs.reading, /^This receipt carries no output_root, so no value can be checked against it/);

  // A local server refuses prove before running anything, also when it comes inside a call's arguments.
  for (const asked of [{ calls, prove: ["/1/result/sharpe"] }, { name: "return_stats", arguments: { returns, prove: ["/0/result/sharpe"] } }]) {
    const refused = await local.run_tool(asked);
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /^prove needs a signed receipt: a proof is checked against the root the receipt carries, and this server holds no key/);
  }
});
