// api/_lib/data-receipts.js
//
// Signed receipts on the hosted data servers' answers (canlicapital.com/mcp/fundamentals and
// /mcp/research). Every successful tool result gets a `receipt`: the sha256 of the exact call
// (tool and arguments), the sha256 of the exact answer, the server and the SEC snapshot it was read
// from, an id over all of it, and an Ed25519 signature by the key published at
// /.well-known/canli-receipt-keys.json. Same statement, same signer and same check as the validation
// receipts (js/receipt-statement.js), so one verifier covers both. Nothing is stored: a receipt
// travels with its answer and verifies offline. Without a signing key (previews, local runs) the
// receipt carries signature: null.
import { KEYS_URL, outputSha256, receiptId } from "../../js/receipt-statement.js";
import { signReceipt } from "./receipt-signature.js";

export const DATA_RECEIPT_NOTE = "To verify: drop `receipt` from this result; outputSha256 of what remains must equal receipt.output_sha256, and verifyReceipt (js/receipt-statement.js) with output = that remainder must pass against the keys at " + KEYS_URL + ".";

export function dataReceipt({ endpoint, tool, args, output, bindings }, env = process.env) {
  const input_sha256 = outputSha256({ tool, arguments: args ?? {} });
  const id = receiptId({ endpoint, input_sha256, output, bindings });
  const output_sha256 = outputSha256(output);
  return { id, endpoint, input_sha256, output_sha256, bindings, signature: signReceipt({ id, endpoint, input_sha256, output_sha256, bindings }, env), verify: DATA_RECEIPT_NOTE };
}

// The SEC snapshot an answer was read from, when the result names one.
const snapshotOf = (output) => output?.snapshot?.sha256 ?? output?.snapshot?.source_sha256 ?? null;

// Wraps a server so every tool it registers returns its result with a receipt attached.
export function withDataReceipts(server, { path, serverName, serverVersion, env = process.env }) {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== "registerTool") return Reflect.get(target, prop, receiver);
      return (name, config, handler) => target.registerTool(name, config, async (args, extra) => {
        const result = await handler(args, extra);
        const output = result?.structuredContent;
        if (result?.isError || !output || typeof output !== "object" || Array.isArray(output)) return result;
        const receipt = dataReceipt({ endpoint: `${path}/${name}`, tool: name, args, output, bindings: { server: `${serverName}@${serverVersion}`, snapshot_sha256: snapshotOf(output) } }, env);
        const withReceipt = { ...output, receipt };
        const content = (result.content ?? []).map((c, i) => (i === 0 && c.type === "text" ? { ...c, text: JSON.stringify(withReceipt) } : c));
        return { ...result, content, structuredContent: withReceipt };
      });
    },
  });
}
