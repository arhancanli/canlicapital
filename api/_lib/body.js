// api/_lib/body.js
export class BodyError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function readJsonBody(req, maxBytes, { allowEmpty = false } = {}) {
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
  // Vercel's Node runtime parses application/json bodies lazily and THROWS on first access when
  // the JSON is malformed, before our parser below ever runs. Read the property once, inside a
  // try, so that failure is the contract's invalid_json and not a generic unreadable_body.
  // Found by the production smoke on 2026-09-06; the unit tests could not see it.
  let preParsed;
  try { preParsed = req.body; } catch { throw new BodyError(400, "invalid_json", "Request body is not valid JSON"); }
  if (preParsed !== undefined && preParsed !== null && typeof preParsed === "object" && !Buffer.isBuffer(preParsed)) {
    // Vercel may pre-parse JSON. Re-serialise to enforce the byte cap on what it parsed.
    const size = Buffer.byteLength(JSON.stringify(preParsed));
    if (size > maxBytes) throw new BodyError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
    if (Array.isArray(preParsed)) throw new BodyError(400, "not_an_object", "Request body must be a JSON object");
    return preParsed;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new BodyError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  const raw = typeof preParsed === "string" ? preParsed : Buffer.concat(chunks).toString("utf8");
  if (allowEmpty && raw.trim() === "") return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new BodyError(400, "invalid_json", "Request body is not valid JSON"); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new BodyError(400, "not_an_object", "Request body must be a JSON object");
  return parsed;
}
