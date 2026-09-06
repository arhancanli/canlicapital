// api/_lib/canonical.js
import { createHash } from "node:crypto";
import { canonicalJson } from "../../scripts/canonical-json.mjs";

export const canonical = (value) => canonicalJson(value);
export const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");
export const contentId = (payload) => sha256Hex(canonical(payload)).slice(0, 24);
