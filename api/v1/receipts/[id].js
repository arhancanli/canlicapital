// api/v1/receipts/[id].js
import { envelope, errorEnvelope, send } from "../../_lib/envelope.js";
import { defaultStore } from "../../_lib/handler.js";
import { LIMITS_TEXT } from "../../_lib/limits.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return send(res, 405, errorEnvelope({ endpoint: "receipts", code: "method_not_allowed", message: "Use GET", limits: LIMITS_TEXT })); }
  const id = String(req.query?.id ?? "");
  if (!/^[0-9a-f]{24}$/.test(id)) return send(res, 400, errorEnvelope({ endpoint: "receipts", code: "invalid_id", message: "A receipt id is 24 hex characters", limits: LIMITS_TEXT }));
  let row;
  try { row = await defaultStore().getReceipt(id); } catch (e) { console.error("[validation-api] receipt read failed", e.status ?? "", e.message); return send(res, 503, errorEnvelope({ endpoint: "receipts", code: "store_unavailable", message: "The receipt store is unavailable", limits: LIMITS_TEXT })); }
  if (!row) return send(res, 404, errorEnvelope({ endpoint: "receipts", code: "not_found", message: "No receipt with that id", limits: LIMITS_TEXT }));
  const sources = Object.entries(row.bindings).map(([path, sha256]) => ({ path, sha256 }));
  return send(res, 200, envelope({ endpoint: `receipts/${id}`, limits: LIMITS_TEXT, sources, data: { id: row.id, endpoint: `/api/v1/${row.endpoint}`, input_sha256: row.input_sha256, output: row.output, bindings: row.bindings, created_at: row.created_at, how_to_reproduce: "Fetch each source at the sha256 listed, run its compute over the input that hashes to input_sha256, and canonical-hash the output. The id is the first 24 hex characters of sha256 over the canonical JSON of {endpoint, input_sha256, output, bindings}." } }), { cacheControl: "public, max-age=31536000, immutable" });
}
