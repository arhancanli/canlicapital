// api/open-holding.js
//
// What one holding is, for the look-through page: a fund's positions from its latest SEC report, or a
// stock's name. Public data and the same answer for everyone, so the CDN keeps each one for a day and
// most visits never reach this function or the SEC. The page adds the holdings up itself with the
// server's own arithmetic (xray-merge.mjs), so only tickers leave a visitor's browser, never amounts.
import { createSession } from "canli-markets-mcp/src/sources.mjs";
import { openHolding, XRAY_LIMITS } from "canli-markets-mcp/src/xray.mjs";
import { slidingMinute } from "./_lib/limiter.js";

export const SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
// A fund's report comes once a quarter, and is filed up to 60 days after it ends.
export const CACHED = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
// A name the SEC would not give may be a passing failure, so it is not kept for long.
const NOT_NAMED = "public, max-age=60, s-maxage=300";

// Asked for one at a time, up to 25 for a portfolio.
const callerOf = (req) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

export function createOpenHoldingHandler({ open = openHolding, session = createSession(), limiter = slidingMinute({ perMinute: 120 }) } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); res.setHeader("Cache-Control", "no-store"); return res.status(405).end(); }
    const symbol = String(req.query?.symbol ?? "").toUpperCase();
    if (!SYMBOL.test(symbol)) { res.setHeader("Cache-Control", "no-store"); return res.status(400).json({ error: "symbol: a ticker such as VOO or AAPL" }); }
    const wait = limiter(callerOf(req));
    if (wait) { res.setHeader("Cache-Control", "no-store"); res.setHeader("Retry-After", String(wait)); return res.status(429).json({ error: "Too many requests in a minute." }); }
    try {
      const opened = await open(session, symbol);
      res.setHeader("Cache-Control", opened.kind === "stock" && opened.name === symbol ? NOT_NAMED : CACHED);
      return res.status(200).json({ symbol, opened, limits: XRAY_LIMITS });
    } catch {
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: `Could not read ${symbol} from the SEC just now.` });
    }
  };
}

export default createOpenHoldingHandler();
