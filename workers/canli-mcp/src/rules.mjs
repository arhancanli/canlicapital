// workers/canli-mcp/src/rules.mjs
//
// The hosted server's rules, the same as api/mcp-canli.js: which packs, the free tier's limits, the
// note added to the instructions, the file check and the per-caller minute. Kept apart from index.mjs,
// whose only export must be the request handler.
export const HOSTED_PACKS = ["quant", "validation", "fundamentals", "research", "backtest", "markets"];
export const REQUESTS_PER_MINUTE = 60;
export const MAX_BODY_BYTES = 1_048_576;
export const HOSTED_NOTE = " This is the hosted server (canlicapital.com/mcp/canli), and it keeps nothing between requests: chain tools inside one run_tool call ({\"calls\": [...]}, where {\"$result\": 0} passes the first call's output on); refs such as \"r1\" do not carry over. File arguments, paper trading and prices need the local server: npx canli-mcp.";

// Whether a request's arguments name a file anywhere, as api/mcp-canli.js decides it.
const PATH_ARGUMENT = /^(?:file|files)$|_(?:file|files|dir)$/;
export function namesAFile(value, depth = 0) {
  if (value === null || typeof value !== "object") return false;
  if (depth > 64) return true;
  if (!Array.isArray(value)) {
    if (Object.hasOwn(value, "$file")) return true;
    if (Object.entries(value).some(([k, v]) => PATH_ARGUMENT.test(k) && v !== null && v !== undefined && typeof v !== "number" && typeof v !== "boolean")) return true;
  }
  return Object.values(value).some((v) => namesAFile(v, depth + 1));
}

// A sliding minute per caller in this isolate; returns the seconds to wait, or 0.
const seen = new Map();
export function wait(caller, now = Date.now()) {
  const recent = (seen.get(caller) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= REQUESTS_PER_MINUTE) {
    seen.set(caller, recent);
    return Math.max(1, Math.ceil((recent[0] + 60_000 - now) / 1000));
  }
  recent.push(now);
  seen.set(caller, recent);
  if (seen.size > 50_000) seen.delete(seen.keys().next().value);
  return 0;
}

