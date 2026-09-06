// api/_lib/body.js
export class BodyError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function readJsonBody(req, maxBytes) {
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
  if (req.body !== undefined && req.body !== null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    // Vercel may pre-parse JSON. Re-serialise to enforce the byte cap on what it parsed.
    const size = Buffer.byteLength(JSON.stringify(req.body));
    if (size > maxBytes) throw new BodyError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
    if (Array.isArray(req.body)) throw new BodyError(400, "not_an_object", "Request body must be a JSON object");
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new BodyError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  const raw = typeof req.body === "string" ? req.body : Buffer.concat(chunks).toString("utf8");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new BodyError(400, "invalid_json", "Request body is not valid JSON"); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new BodyError(400, "not_an_object", "Request body must be a JSON object");
  return parsed;
}
