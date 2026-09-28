// js/receipt-statement.js
// What a canlicapital.com receipt signature covers, and how to check one. Shared by the API, which
// signs (api/_lib/receipt-signature.js), and by the MCP package, which verifies offline
// (mcp/src/local mirrors this file byte for byte), so the two cannot disagree about the bytes signed.
//
// The statement is the canonical JSON of the receipt's content: its id, the validator's endpoint,
// the sha256 of the input, the sha256 of the output, and the sha256 of every source file that
// computed it. The id is itself the first 24 hex characters of sha256 over the canonical JSON of
// {endpoint, input_sha256, output, bindings}, so the signature ties the result to the exact code.
import { createHash, createPublicKey, verify } from "node:crypto";

import { canonicalJson } from "../scripts/canonical-json.mjs";

export const SIGNATURE_SCHEMA = "canli.receipt-signature.v1";
export const KEYS_URL = "https://canlicapital.com/.well-known/canli-receipt-keys.json";

const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");

export function outputSha256(output) {
  return `sha256:${sha256Hex(canonicalJson(output))}`;
}

export function receiptId({ endpoint, input_sha256, output, bindings }) {
  return sha256Hex(canonicalJson({ endpoint, input_sha256, output, bindings })).slice(0, 24);
}

export function receiptStatement({ id, endpoint, input_sha256, output_sha256, bindings }) {
  return canonicalJson({ schema: SIGNATURE_SCHEMA, id, endpoint, input_sha256, output_sha256, bindings });
}

// The key id is derived from the key: the first 16 hex characters of sha256 over its 32 raw bytes.
export function keyIdFor(rawPublicKey) {
  return sha256Hex(rawPublicKey).slice(0, 16);
}

// Checks a stored receipt end to end: its output hashes to output_sha256, its content hashes to its
// id, its signature verifies over the statement, and the signing key is one canlicapital.com
// publishes. Returns every check so a caller can see which one failed.
export function verifyReceipt({ id, endpoint, input_sha256, output, bindings, signature }, keys) {
  const checks = { id_matches_content: false, signature_valid: false, key_published: false };
  const computedOutputSha = outputSha256(output);
  checks.id_matches_content = receiptId({ endpoint, input_sha256, output, bindings }) === id;
  const key = signature ? (keys ?? []).find((k) => k.key_id === signature.key_id && k.alg === "Ed25519") : undefined;
  checks.key_published = Boolean(key);
  if (key && signature?.value && signature.schema === SIGNATURE_SCHEMA) {
    const raw = Buffer.from(key.x, "base64url");
    if (keyIdFor(raw) === key.key_id) {
      const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" });
      const statement = receiptStatement({ id, endpoint, input_sha256, output_sha256: computedOutputSha, bindings });
      checks.signature_valid = verify(null, Buffer.from(statement, "utf8"), publicKey, Buffer.from(signature.value, "base64url"));
    }
  }
  return { valid: checks.id_matches_content && checks.signature_valid && checks.key_published, checks, output_sha256: computedOutputSha, key_id: signature?.key_id ?? null };
}
