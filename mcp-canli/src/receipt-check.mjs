// receipt_check: an earlier answer's receipt (canlicapital.com/receipt in _meta, or the answer itself with
// receipt: true) and the receipts it was built from, their documents read again by the markets pack's
// source_check: the same, changed since, or unreachable. An answer whose documents changed may no longer hold.
import { z } from "zod";

export const receiptCheckInput = z.object({
  receipt: z.looseObject({ sources: z.array(z.looseObject({})).optional(), from: z.array(z.looseObject({})).optional() }).describe("The receipt: canlicapital.com/receipt from an answer's _meta, or the receipt an answer carries with receipt: true."),
}).strict();

export const RECEIPT_CHECK_TOOL = Object.freeze({
  name: "receipt_check", pack: "desk", toolset: "desk", title: "Check an answer's receipt against its documents now", input: receiptCheckInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "Read again the documents an earlier answer's receipt names, and those of the answers it was built from: each the same, changed since, or unreachable (the markets pack's source_check). An answer whose documents changed may no longer hold.",
  keywords: "receipt check verify sources changed since stale drift documents hash audit trail provenance",
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
  const docs = documentsOf(receipt);
  if (!docs.length) return { documents: 0, reading: "This receipt names no documents: the answer was worked out from what it was given, so nothing can have changed under it." };
  const checked = await ctx.call("source_check", { sources: docs.slice(0, 25) });
  return {
    answer: { input_sha256: receipt.input_sha256 ?? null, output_sha256: receipt.output_sha256 ?? null, at: receipt.at ?? null },
    documents: docs.length,
    ...(docs.length > 25 ? { more: `${docs.length - 25} more documents were not read: 25 at a time` } : {}),
    ...checked,
  };
}
