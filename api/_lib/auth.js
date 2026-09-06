// api/_lib/auth.js
import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "ck_live_";

export function generateKey() {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export const hashKey = (key) => createHash("sha256").update(key).digest("hex");

export function bearerKey(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(String(header).trim());
  if (!m || !m[1].startsWith(KEY_PREFIX)) return null;
  return m[1];
}

export function clientHash(req, salt, now = new Date()) {
  const forwarded = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  const ip = forwarded || String(req.headers?.["x-real-ip"] ?? "") || "unknown";
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}|${day}|${ip}`).digest("hex");
}
