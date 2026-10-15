// api/mcp-canli.js
//
// The hosted canli-mcp (canlicapital.com/mcp/canli): the published flagship, the exact npm release
// pinned in package.json, over MCP Streamable HTTP for clients that take only a URL (claude.ai
// connectors, ChatGPT, Cursor). It serves the packs that read public data or compute: quant,
// validation, fundamentals, research, backtest and markets. Three things stay with a local install
// (npx canli-mcp), and the server's instructions say so:
// - files: a {"$file": ...} argument reads the disk, and here the disk is the server's, so a request
//   that names one is refused before any tool sees it;
// - paper trading, which needs the user's own broker keys;
// - prices: the keyless source is Yahoo's chart data, for personal use under Yahoo's terms.
// Nothing is kept between requests (each builds a fresh server), so one caller never sees another's
// results. Each caller gets a bounded number of requests a minute in a function instance, so one
// client cannot crowd out the rest or push SEC's request limit.
import * as canli from "canli-mcp/src/server.mjs";
import { createStatelessMcpHandler } from "./_lib/mcp-stateless.js";

// The markets pack reads this when it first loads, on the first request; with it off, price tools
// say that prices need a key instead of fetching Yahoo's data.
process.env.CANLI_KEYLESS_PRICES = "0";

export const HOSTED_PACKS = ["quant", "validation", "fundamentals", "research", "backtest", "markets"];
// Series go inline here (there are no files): a megabyte holds about 50,000 numbers.
export const MAX_FLAGSHIP_BODY_BYTES = 1_048_576;
export const REQUESTS_PER_MINUTE = 60;
export const HOSTED_NOTE = " This is the hosted server (canlicapital.com/mcp/canli), and it keeps nothing between requests: chain tools inside one run_tool call ({\"calls\": [...]}, where {\"$result\": 0} passes the first call's output on); refs such as \"r1\" do not carry over. File arguments, paper trading and prices need the local server: npx canli-mcp.";

// Whether a request's arguments name a file anywhere ({"$file": ...}), however deeply nested.
export function namesAFile(value, depth = 0) {
  if (depth > 64 || value === null || typeof value !== "object") return false;
  if (!Array.isArray(value) && Object.hasOwn(value, "$file")) return true;
  return Object.values(value).some((v) => namesAFile(v, depth + 1));
}

// A sliding minute per caller in this function instance; the oldest callers are forgotten past
// maxCallers. Returns the seconds to wait, or 0 to go ahead.
export function createLimiter({ perMinute = REQUESTS_PER_MINUTE, now = () => Date.now(), maxCallers = 10_000 } = {}) {
  const seen = new Map();
  return (key) => {
    const t = now();
    const recent = (seen.get(key) ?? []).filter((x) => t - x < 60_000);
    seen.delete(key);
    if (recent.length >= perMinute) {
      seen.set(key, recent);
      return Math.max(1, Math.ceil((60_000 - (t - recent[0])) / 1000));
    }
    recent.push(t);
    seen.set(key, recent);
    if (seen.size > maxCallers) seen.delete(seen.keys().next().value);
    return 0;
  };
}

// The caller: the first address of the X-Forwarded-For header Vercel sets, else the socket's.
const callerOf = (req) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

export function createCanliHandler({ limiter = createLimiter() } = {}) {
  const screen = (body, req) => {
    const wait = limiter(callerOf(req));
    if (wait) return { status: 429, code: -32000, message: `Too many requests: the hosted server takes ${REQUESTS_PER_MINUTE} a minute from each caller. Try again in ${wait} s, or run the same server locally with npx canli-mcp.`, headers: { "Retry-After": String(wait) } };
    const calls = Array.isArray(body) ? body : [body];
    const named = calls.find((m) => m && typeof m === "object" && namesAFile(m.params));
    if (named) return { status: 200, code: -32602, id: named.id ?? null, message: "The hosted server reads no files: a {\"$file\": ...} argument would read the server's disk, not yours. Pass the numbers inline, or run canli-mcp locally (npx canli-mcp), where $file reads your own files." };
    return null;
  };
  return createStatelessMcpHandler({
    serverInfo: canli.SERVER_INFO,
    instructions: `${canli.instructions(HOSTED_PACKS)}${HOSTED_NOTE}`,
    register: (server) => canli.registerAll(server, HOSTED_PACKS),
    path: "/mcp/canli",
    maxBodyBytes: MAX_FLAGSHIP_BODY_BYTES,
    screen,
  });
}

export default createCanliHandler();
