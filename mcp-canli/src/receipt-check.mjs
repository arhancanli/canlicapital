// receipt_check: an earlier answer's receipt (canlicapital.com/receipt in _meta, or the answer itself with
// receipt: true) and the receipts it was built from, their documents read again by the markets pack's
// source_check: the same, changed since, or unreachable. An answer whose documents changed may no longer hold.
// A receipt from the hosted server carries its signature, which is checked here offline, and the root of its answer's
// values, against which a proof that one value is in the answer is checked without the rest of it.
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";

import { keyIdFor, KEYS_URL } from "canli-validation-mcp/src/local/js/receipt-statement.js";
import { canonicalJson } from "canli-validation-mcp/src/local/scripts/canonical-json.mjs";
import { z } from "zod";

import { checkValue } from "./answer-tree.mjs";

// The hosted server (canlicapital.com/mcp/canli) signs each answer's receipt with a key canlicapital.com publishes:
// Ed25519 over the canonical JSON of {schema, receipt}, the receipt as sent in JSON without its signature (the site's
// api/_lib/answer-receipts.js, whose tests check that this reads every receipt as it does). The keys are the
// published ones, bundled with the validation pack; a local server holds no key, so its receipts are not signed.
export const ANSWER_SIGNATURE_SCHEMA = "canli.answer-receipt-signature.v1";
const PUBLISHED_KEYS = JSON.parse(readFileSync(new URL(import.meta.resolve("canli-validation-mcp/src/receipt-keys.json")), "utf8")).keys;

export function checkAnswerSignature(receipt, keys = PUBLISHED_KEYS) {
  const signature = receipt?.signature;
  const checks = { signed: typeof signature?.value === "string", key_published: false, signature_valid: false };
  const key = signature ? keys.find((k) => k.key_id === signature.key_id && k.alg === "Ed25519") : undefined;
  checks.key_published = Boolean(key);
  if (key && checks.signed && signature.schema === ANSWER_SIGNATURE_SCHEMA && keyIdFor(Buffer.from(key.x, "base64url")) === key.key_id) {
    const { signature: _, ...rest } = JSON.parse(JSON.stringify(receipt));
    const statement = canonicalJson({ schema: ANSWER_SIGNATURE_SCHEMA, receipt: rest });
    const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" });
    checks.signature_valid = verify(null, Buffer.from(statement, "utf8"), publicKey, Buffer.from(signature.value, "base64url"));
  }
  return { valid: checks.signed && checks.key_published && checks.signature_valid, checks, key_id: signature?.key_id ?? null };
}

// The post-quantum signature (ML-DSA-65, FIPS 204) a server can put beside the Ed25519 one, under signature_pq: over
// the receipt without either signature, so it still holds if Ed25519 is broken one day. The Ed25519 signature is made
// after it and covers it, so a reader that knows only Ed25519 still checks such a receipt whole. Its keys are published
// beside the Ed25519 ones, as JWK (kty AKP) under the same key id rule.
export const PQ_SIGNATURE_FIELD = "signature_pq";
// ML-DSA is in Node.js from 24.7: an older Node.js reads a post-quantum signature but cannot check it, and says so
// rather than calling it wrong. Asked once, the first time a receipt carries one.
let pqCheckable;
export function canCheckPq() {
  if (pqCheckable === undefined) {
    try {
      generateKeyPairSync("ml-dsa-65");
      pqCheckable = true;
    } catch {
      pqCheckable = false;
    }
  }
  return pqCheckable;
}

export function checkAnswerSignaturePq(receipt, keys = PUBLISHED_KEYS) {
  const signature = receipt?.[PQ_SIGNATURE_FIELD];
  const checks = { signed: typeof signature?.value === "string", key_published: false, signature_valid: false };
  const key = signature ? keys.find((k) => k.key_id === signature.key_id && k.alg === "ML-DSA-65") : undefined;
  checks.key_published = Boolean(key);
  if (key && checks.signed && signature.schema === ANSWER_SIGNATURE_SCHEMA && typeof key.pub === "string" && keyIdFor(Buffer.from(key.pub, "base64url")) === key.key_id) {
    if (!canCheckPq()) return { valid: false, checks, key_id: signature.key_id ?? null, checkable: false };
    const { signature: _ed, [PQ_SIGNATURE_FIELD]: _pq, ...rest } = JSON.parse(JSON.stringify(receipt));
    const statement = canonicalJson({ schema: ANSWER_SIGNATURE_SCHEMA, receipt: rest });
    try {
      const publicKey = createPublicKey({ key: { kty: "AKP", alg: "ML-DSA-65", pub: key.pub }, format: "jwk" });
      checks.signature_valid = verify(null, Buffer.from(statement, "utf8"), publicKey, Buffer.from(signature.value, "base64url"));
    } catch {
      checks.signature_valid = false;
    }
  }
  return { valid: checks.signed && checks.key_published && checks.signature_valid, checks, key_id: signature?.key_id ?? null };
}

function signatureOf(receipt) {
  const checked = checkAnswerSignature(receipt);
  const reading = !checked.checks.signed
    ? "Not signed: the hosted server (canlicapital.com/mcp/canli) signs its receipts; a local server holds no key, so its receipts are not."
    : checked.valid
      ? `Signed with canlicapital.com's published key ${checked.key_id}${typeof receipt.endpoint === "string" ? ` by ${receipt.endpoint}` : ""}: nothing in this receipt has changed since.`
      : checked.checks.key_published
        ? "The signature does not match this receipt: something in it changed after it was signed, or the signature is not for it."
        : `Not signed with a key canlicapital.com publishes (this server's copy; the list is at ${KEYS_URL}).`;
  if (!receipt?.[PQ_SIGNATURE_FIELD]) return { ...checked, reading };
  const pq = checkAnswerSignaturePq(receipt);
  const pqReading = pq.checkable === false
    ? `Also signed post-quantum (ML-DSA-65) with canlicapital.com's published key ${pq.key_id}, but this Node.js (${process.version}) cannot check ML-DSA signatures; Node.js 24.7 or later can.`
    : pq.valid
    ? `Also signed post-quantum (ML-DSA-65) with canlicapital.com's published key ${pq.key_id}: the receipt holds even if Ed25519 is broken one day.`
    : pq.checks.key_published
      ? "The post-quantum signature does not match this receipt: something in it changed after it was signed, or the signature is not for it."
      : `The post-quantum signature is not with a key canlicapital.com publishes (this server's copy; the list is at ${KEYS_URL}).`;
  return { ...checked, reading, post_quantum: { ...pq, reading: pqReading } };
}

export const receiptCheckInput = z.object({
  receipt: z.looseObject({ sources: z.array(z.looseObject({})).optional(), from: z.array(z.looseObject({})).optional() }).describe("The receipt: canlicapital.com/receipt from an answer's _meta, or the receipt an answer carries with receipt: true."),
  proofs: z.array(z.looseObject({})).min(1).max(20).optional().describe("Proofs run_tool gave with prove, each checked against the receipt's output_root."),
}).strict();

export const RECEIPT_CHECK_TOOL = Object.freeze({
  name: "receipt_check", pack: "desk", toolset: "desk", title: "Check an answer's receipt against its documents now", input: receiptCheckInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "Read again the documents an earlier answer's receipt names, and those of the answers it was built from: each the same, changed since, or unreachable (the markets pack's source_check). An answer whose documents changed may no longer hold. A receipt the hosted server signed has its signature checked offline against the keys canlicapital.com publishes, and proofs from run_tool's prove are checked against its output_root: each value is in the signed answer or not, without the rest of the answer.",
  keywords: "receipt check verify sources changed since stale drift documents hash audit trail provenance signature signed proof prove value merkle",
  args: "receipt: object, proofs?: array",
});

// Proofs that values are in the answer (answer-tree.mjs), each checked against the root and the count of values the
// receipt carries. That the receipt is the server's is for its signature; a receipt with no root proves nothing.
export function proofsOf(receipt, proofs, signature) {
  if (typeof receipt.output_root !== "string" || !Number.isInteger(receipt.output_values)) {
    return { in_answer: 0, of: proofs.length, reading: "This receipt carries no output_root, so no value can be checked against it: only a receipt the hosted server signs carries one (run_tool with prove gives both)." };
  }
  const rows = proofs.map((proof) => {
    const checked = checkValue(proof, { root: receipt.output_root, values: receipt.output_values });
    return checked.ok ? { pointer: checked.pointer, value: checked.value, in_answer: true } : { pointer: typeof proof.pointer === "string" ? proof.pointer : null, in_answer: false, problem: checked.problem };
  });
  const n = rows.length, held = rows.filter((r) => r.in_answer).length, bad = n - held;
  const said = !bad ? (n === 1 ? "The value is in the answer this receipt names." : `All ${n} values are in the answer this receipt names.`)
    : n === 1 ? "The value is not in the answer this receipt names: its row says why."
      : `${bad} of ${n} values ${bad === 1 ? "is" : "are"} not in the answer this receipt names (each row says why)${held ? `; the other ${held === 1 ? "one is" : `${held} are`}` : ""}.`;
  const whose = !held ? "" : signature.valid
    ? ` The receipt is signed with canlicapital.com's published key, so the server's answer held ${held === 1 ? "that value" : "those values"}.`
    : ` The receipt is not shown to be the server's (see signature), so this does not show the server gave ${held === 1 ? "it" : "them"}.`;
  return { in_answer: held, of: n, rows, reading: said + whose };
}

// The documents of a receipt and of every receipt it was built from that is written out, once each, at most 25.
export function documentsOf(receipt) {
  const seen = new Map();
  const walk = (r, depth) => {
    for (const s of Array.isArray(r?.sources) ? r.sources : []) {
      if (typeof s?.url !== "string" || seen.has(s.url)) continue;
      seen.set(s.url, { url: s.url, ...(typeof s.sha256 === "string" ? { sha256: s.sha256 } : {}), ...(typeof s.sha256_16 === "string" ? { sha256_16: s.sha256_16 } : {}), ...(typeof s.retrieved_at === "string" ? { retrieved_at: s.retrieved_at } : {}) });
    }
    if (depth < 6) for (const p of Array.isArray(r?.from) ? r.from : []) walk(p, depth + 1);
  };
  walk(receipt, 0);
  return [...seen.values()];
}

export async function runReceiptCheck(ctx, args) {
  const { receipt, proofs } = receiptCheckInput.parse(args ?? {});
  const signature = signatureOf(receipt);
  const proved = proofs ? { proofs: proofsOf(receipt, proofs, signature) } : {};
  const docs = documentsOf(receipt);
  if (!docs.length) return { signature, ...proved, documents: 0, reading: "This receipt names no documents: the answer was worked out from what it was given, so nothing can have changed under it." };
  const checked = await ctx.call("source_check", { sources: docs.slice(0, 25) });
  return {
    answer: { input_sha256: receipt.input_sha256 ?? null, output_sha256: receipt.output_sha256 ?? null, at: receipt.at ?? null },
    signature,
    ...proved,
    documents: docs.length,
    ...(docs.length > 25 ? { more: `${docs.length - 25} more documents were not read: 25 at a time` } : {}),
    ...checked,
  };
}
