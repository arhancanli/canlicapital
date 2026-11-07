// receipt_check: an earlier answer's receipt (canlicapital.com/receipt in _meta, or the answer itself with
// receipt: true) and the receipts it was built from, their documents read again by the markets pack's
// source_check: the same, changed since, or unreachable. An answer whose documents changed may no longer hold.
// A receipt from the hosted server carries its signature, which is checked here offline.
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

import { keyIdFor, KEYS_URL } from "canli-validation-mcp/src/local/js/receipt-statement.js";
import { canonicalJson } from "canli-validation-mcp/src/local/scripts/canonical-json.mjs";
import { z } from "zod";

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

function signatureOf(receipt) {
  const checked = checkAnswerSignature(receipt);
  const reading = !checked.checks.signed
    ? "Not signed: the hosted server (canlicapital.com/mcp/canli) signs the receipt in an answer's _meta; a local server's receipts, and the copy an answer carries with receipt: true, are not."
    : checked.valid
      ? `Signed with canlicapital.com's published key ${checked.key_id}${typeof receipt.endpoint === "string" ? ` by ${receipt.endpoint}` : ""}: nothing in this receipt has changed since.`
      : checked.checks.key_published
        ? "The signature does not match this receipt: something in it changed after it was signed, or the signature is not for it."
        : `Not signed with a key canlicapital.com publishes (this server's copy; the list is at ${KEYS_URL}).`;
  return { ...checked, reading };
}

export const receiptCheckInput = z.object({
  receipt: z.looseObject({ sources: z.array(z.looseObject({})).optional(), from: z.array(z.looseObject({})).optional() }).describe("The receipt: canlicapital.com/receipt from an answer's _meta, or the receipt an answer carries with receipt: true."),
}).strict();

export const RECEIPT_CHECK_TOOL = Object.freeze({
  name: "receipt_check", pack: "desk", toolset: "desk", title: "Check an answer's receipt against its documents now", input: receiptCheckInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "Read again the documents an earlier answer's receipt names, and those of the answers it was built from: each the same, changed since, or unreachable (the markets pack's source_check). An answer whose documents changed may no longer hold. A receipt the hosted server signed (in an answer's _meta) has its signature checked offline against the keys canlicapital.com publishes.",
  keywords: "receipt check verify sources changed since stale drift documents hash audit trail provenance signature signed",
  args: "receipt: object",
});

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
  const { receipt } = receiptCheckInput.parse(args ?? {});
  const signature = signatureOf(receipt);
  const docs = documentsOf(receipt);
  if (!docs.length) return { signature, documents: 0, reading: "This receipt names no documents: the answer was worked out from what it was given, so nothing can have changed under it." };
  const checked = await ctx.call("source_check", { sources: docs.slice(0, 25) });
  return {
    answer: { input_sha256: receipt.input_sha256 ?? null, output_sha256: receipt.output_sha256 ?? null, at: receipt.at ?? null },
    signature,
    documents: docs.length,
    ...(docs.length > 25 ? { more: `${docs.length - 25} more documents were not read: 25 at a time` } : {}),
    ...checked,
  };
}
