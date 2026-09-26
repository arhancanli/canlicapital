// Receipt signatures: signed on issue and on read with the same bytes, verifiable against the
// published key, and broken by any change to the output, the id or the key.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { keyIdFor, outputSha256, receiptId, verifyReceipt } from "../../js/receipt-statement.js";
import { signReceipt } from "./receipt-signature.js";

function testKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  return {
    env: { CANLI_RECEIPT_SIGNING_KEY: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") },
    published: { key_id: keyIdFor(Buffer.from(x, "base64url")), alg: "Ed25519", x, status: "active" },
  };
}

const OUTPUT = { ceiling: 2.236, plain_reading: "R" };
const BINDINGS = { "js/breadth-core.js": "sha256:aa", "js/validate/breadth.js": "sha256:bb" };
function receiptFor(env) {
  const content = { endpoint: "validate/breadth", input_sha256: "sha256:in", output: OUTPUT, bindings: BINDINGS };
  const id = receiptId(content);
  const signature = signReceipt({ id, endpoint: content.endpoint, input_sha256: content.input_sha256, output_sha256: outputSha256(OUTPUT), bindings: BINDINGS }, env);
  return { id, ...content, signature };
}

test("a signed receipt verifies against the published key, and signing is deterministic", () => {
  const key = testKey();
  const receipt = receiptFor(key.env);
  assert.deepEqual(verifyReceipt(receipt, [key.published]).checks, { id_matches_content: true, signature_valid: true, key_published: true });
  assert.equal(verifyReceipt(receipt, [key.published]).valid, true);
  assert.equal(receiptFor(key.env).signature.value, receipt.signature.value);
  assert.equal(receipt.signature.key_id, key.published.key_id);
});

test("changing the output, the id, the bindings or the key breaks verification", () => {
  const key = testKey();
  const receipt = receiptFor(key.env);
  const other = testKey();
  const cases = {
    output: { ...receipt, output: { ...OUTPUT, ceiling: 9 } },
    id: { ...receipt, id: "0".repeat(24) },
    bindings: { ...receipt, bindings: { ...BINDINGS, "js/breadth-core.js": "sha256:zz" } },
    signature: { ...receipt, signature: { ...receipt.signature, value: receiptFor(other.env).signature.value } },
  };
  for (const [name, tampered] of Object.entries(cases)) assert.equal(verifyReceipt(tampered, [key.published]).valid, false, name);
  assert.equal(verifyReceipt(receipt, [other.published]).checks.key_published, false);
  const forged = { ...other.published, key_id: key.published.key_id };
  assert.equal(verifyReceipt(receipt, [forged]).valid, false, "a key whose id does not match its bytes is refused");
});

test("without a signing key a receipt carries no signature instead of failing", () => {
  assert.equal(signReceipt({ id: "a".repeat(24), endpoint: "validate/breadth", input_sha256: "x", output_sha256: "y", bindings: {} }, {}), null);
  const receipt = receiptFor({});
  assert.equal(receipt.signature, null);
  assert.equal(verifyReceipt(receipt, []).valid, false);
});

test("the published key file is well formed, its key ids match their bytes, and the MCP package bundles the same file", () => {
  const published = readFileSync(new URL("../../public/.well-known/canli-receipt-keys.json", import.meta.url), "utf8");
  const bundled = readFileSync(new URL("../../mcp/src/receipt-keys.json", import.meta.url), "utf8");
  assert.equal(bundled, published);
  const { keys } = JSON.parse(published);
  assert.ok(keys.length >= 1);
  for (const k of keys) {
    assert.equal(k.alg, "Ed25519");
    assert.equal(keyIdFor(Buffer.from(k.x, "base64url")), k.key_id);
    assert.equal(Buffer.from(k.x, "base64url").length, 32);
  }
});
