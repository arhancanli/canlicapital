// api/v1/receipts/[id]/badge.js
// GET /api/v1/receipts/{id}/badge.svg (reached through the vercel.json rewrite for the .svg
// suffix; see vercel.json). Returns an SVG showing only the formula version and the receipt id
// prefix, from the stored receipt's own fields. An unknown id, a malformed id, and a store failure
// all degrade to the same plain grey "receipt not found" badge with 404: a badge embedded in a
// README must never leak an internal error or imply a verdict it cannot support.
import { errorEnvelope, send } from "../../../_lib/envelope.js";
import { defaultStore } from "../../../_lib/handler.js";
import { LIMITS_TEXT } from "../../../_lib/limits.js";
import { renderNotFoundBadge, renderReceiptBadge } from "../../../_lib/badge.js";

const BADGE_CACHE_CONTROL = "public, max-age=86400";

function sendSvg(res, status, svg) {
  res.statusCode = status;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", BADGE_CACHE_CONTROL);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(svg);
}

export function createBadgeHandler({ store } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return send(res, 405, errorEnvelope({ endpoint: "receipts/badge", code: "method_not_allowed", message: "Use GET", limits: LIMITS_TEXT }));
    }
    const id = String(req.query?.id ?? "");
    if (!/^[0-9a-f]{24}$/.test(id)) return sendSvg(res, 404, renderNotFoundBadge());
    const activeStore = store ?? defaultStore();
    let row;
    try {
      row = await activeStore.getReceipt(id);
    } catch (e) {
      console.error("[validation-api] badge receipt read failed", e.status ?? "", e.message);
      return sendSvg(res, 404, renderNotFoundBadge());
    }
    if (!row) return sendSvg(res, 404, renderNotFoundBadge());
    return sendSvg(res, 200, renderReceiptBadge({ id: row.id, endpoint: row.endpoint, output: row.output }));
  };
}

export default createBadgeHandler();
