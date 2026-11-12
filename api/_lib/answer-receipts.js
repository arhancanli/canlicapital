// api/_lib/answer-receipts.js
//
// A signature on every answer's receipt from the hosted canli-mcp (canlicapital.com/mcp/canli). canli-mcp puts a
// receipt beside each run_tool answer, in MCP's _meta under "canlicapital.com/receipt": the server and pack versions,
// the SHA-256 of what was asked and of the whole result, the documents it was read from (each URL with its SHA-256
// and retrieval time) and when it answered. A local install holds no key, so its receipts stay unsigned. Here each
// one is signed with the Ed25519 key that signs the validation receipts (CANLI_RECEIPT_SIGNING_KEY,
// api/_lib/receipt-signature.js), whose public half is published at /.well-known/canli-receipt-keys.json, so anyone
// holding a receipt can check offline that canlicapital.com issued it and that nothing in it has changed.
//
// The bytes signed are the canonical JSON (scripts/canonical-json.mjs) of {schema, receipt}: the receipt as it is
// sent, in JSON, without its own signature. The schema is not the validation receipts' one, so a signature on one
// kind of receipt never passes as the other's. Without the key (a preview or a local run) the signature is null.
//
// With CANLI_RECEIPT_PQ_SIGNING_KEY (base64 of an ML-DSA-65 PKCS#8 DER private key) each receipt is also signed post-
// quantum (FIPS 204), under signature_pq, over the receipt without either signature; the Ed25519 signature is made after
// it and covers it, so a reader that knows only Ed25519 checks the whole (canli-mcp's receipt-check.mjs reads both).
// ML-DSA signatures are randomized, so a receipt that already carries a valid one from this key keeps it: the receipt a
// model reads in the answer and the one here stay the same bytes. Set the key only once canli-mcp signs post-quantum
// itself (receipts.signPq), or the two would differ.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

import { keyIdFor } from "../../js/receipt-statement.js";
import { canonicalJson } from "../../scripts/canonical-json.mjs";
import { signingKey } from "./receipt-signature.js";

export const ANSWER_RECEIPT_KEY = "canlicapital.com/receipt";
export const ANSWER_SIGNATURE_SCHEMA = "canli.answer-receipt-signature.v1";

// The receipt as a client receives it (JSON drops what JSON cannot hold), without its signature.
export function answerStatement(receipt) {
  const { signature, ...rest } = JSON.parse(JSON.stringify(receipt));
  return canonicalJson({ schema: ANSWER_SIGNATURE_SCHEMA, receipt: rest });
}

export const ANSWER_PQ_FIELD = "signature_pq";

// ML-DSA is in Node.js from 24.7. The site runs on Node.js 22.x until it moves, and there a key that is set is left
// unused (receipts carry Ed25519 alone) rather than failing every answer. Asked once.
let pqSupported;
export function canSignPq() {
  if (pqSupported === undefined) {
    try {
      generateKeyPairSync("ml-dsa-65");
      pqSupported = true;
    } catch {
      pqSupported = false;
    }
  }
  return pqSupported;
}

let pqCached;
export function pqSigningKey(env = process.env) {
  const encoded = env.CANLI_RECEIPT_PQ_SIGNING_KEY;
  if (!encoded || !canSignPq()) return null;
  if (pqCached?.encoded === encoded) return pqCached;
  const privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" });
  if (privateKey.asymmetricKeyType !== "ml-dsa-65") throw new Error("CANLI_RECEIPT_PQ_SIGNING_KEY is not an ML-DSA-65 key");
  const pub = createPublicKey(privateKey).export({ format: "jwk" }).pub;
  pqCached = { encoded, privateKey, pub, key_id: keyIdFor(Buffer.from(pub, "base64url")) };
  return pqCached;
}

// What the post-quantum signature covers: the receipt as a client receives it, without either signature.
export function answerPqStatement(receipt) {
  const { signature: _ed, [ANSWER_PQ_FIELD]: _pq, ...rest } = JSON.parse(JSON.stringify(receipt));
  return canonicalJson({ schema: ANSWER_SIGNATURE_SCHEMA, receipt: rest });
}

export function signAnswerReceiptPq(receipt, env = process.env) {
  const key = pqSigningKey(env);
  if (!key) return null;
  const value = sign(null, Buffer.from(answerPqStatement(receipt), "utf8"), key.privateKey).toString("base64url");
  return { alg: "ML-DSA-65", schema: ANSWER_SIGNATURE_SCHEMA, key_id: key.key_id, value };
}

// Checks a receipt's post-quantum signature against the published keys (JWK, kty AKP).
export function verifyAnswerReceiptPq(receipt, keys) {
  const signature = receipt?.[ANSWER_PQ_FIELD];
  const checks = { signed: typeof signature?.value === "string", key_published: false, signature_valid: false };
  const key = signature ? (keys ?? []).find((k) => k.key_id === signature.key_id && k.alg === "ML-DSA-65") : undefined;
  checks.key_published = Boolean(key);
  if (key && checks.signed && signature.schema === ANSWER_SIGNATURE_SCHEMA && typeof key.pub === "string" && keyIdFor(Buffer.from(key.pub, "base64url")) === key.key_id) {
    try {
      const publicKey = createPublicKey({ key: { kty: "AKP", alg: "ML-DSA-65", pub: key.pub }, format: "jwk" });
      checks.signature_valid = verify(null, Buffer.from(answerPqStatement(receipt), "utf8"), publicKey, Buffer.from(signature.value, "base64url"));
    } catch {
      checks.signature_valid = false;
    }
  }
  return { valid: checks.signed && checks.key_published && checks.signature_valid, checks, key_id: signature?.key_id ?? null };
}

// The post-quantum signature a receipt should carry here: the one it has, if this key made it and it still holds, else
// a new one; null without the key.
function pqFor(issued, env) {
  const key = pqSigningKey(env);
  if (!key) return null;
  const held = issued[ANSWER_PQ_FIELD];
  if (held && verifyAnswerReceiptPq(issued, [{ key_id: key.key_id, alg: "ML-DSA-65", pub: key.pub }]).valid) return held;
  return signAnswerReceiptPq(issued, env);
}

export function signAnswerReceipt(receipt, env = process.env) {
  const key = signingKey(env);
  if (!key) return null;
  const value = sign(null, Buffer.from(answerStatement(receipt), "utf8"), key.privateKey).toString("base64url");
  return { alg: "Ed25519", schema: ANSWER_SIGNATURE_SCHEMA, key_id: key.key_id, value };
}

// Checks a receipt against the published keys (the `keys` of canli-receipt-keys.json), and says which check failed.
export function verifyAnswerReceipt(receipt, keys) {
  const signature = receipt?.signature;
  const checks = { signed: typeof signature?.value === "string", key_published: false, signature_valid: false };
  const key = signature ? (keys ?? []).find((k) => k.key_id === signature.key_id && k.alg === "Ed25519") : undefined;
  checks.key_published = Boolean(key);
  if (key && checks.signed && signature.schema === ANSWER_SIGNATURE_SCHEMA && keyIdFor(Buffer.from(key.x, "base64url")) === key.key_id) {
    const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" });
    checks.signature_valid = verify(null, Buffer.from(answerStatement(receipt), "utf8"), publicKey, Buffer.from(signature.value, "base64url"));
  }
  return { valid: checks.signed && checks.key_published && checks.signature_valid, checks, key_id: signature?.key_id ?? null };
}

// Every tool registered on this server from now on returns its receipt naming the endpoint that issued it, signed.
// The server is built for one request (api/_lib/mcp-stateless.js), so this changes no other request's server.
export function signReceiptsOf(server, { endpoint, env = process.env }) {
  const register = server.registerTool.bind(server);
  server.registerTool = (name, config, handler) => register(name, config, async (...args) => {
    const result = await handler(...args);
    const receipt = result?._meta?.[ANSWER_RECEIPT_KEY];
    if (!receipt || typeof receipt !== "object") return result;
    const issued = { ...receipt, endpoint };
    const pq = pqFor(issued, env);
    const { [ANSWER_PQ_FIELD]: _held, ...plain } = issued;
    const withPq = pq ? { ...plain, [ANSWER_PQ_FIELD]: pq } : plain;
    return { ...result, _meta: { ...result._meta, [ANSWER_RECEIPT_KEY]: { ...withPq, signature: signAnswerReceipt(withPq, env) } } };
  });
  return server;
}
