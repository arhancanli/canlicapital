// workers/canli-mcp/src/cache.mjs
//
// The edge cache. On a user's own machine the markets pack keeps the public data it reads in a disk cache
// (canli-markets-mcp/src/disk-cache.mjs), fresh for as long as each kind of document stays the same: a
// filing 30 days, company facts 6 hours, a company's list of filings 15 minutes. Each copy keeps the
// evidence of its first read: the SHA-256 of what came back and when. A Worker has no disk, so build.mjs
// gives the pack this cache instead, holding the same entries in Cloudflare's cache (caches.default, in
// the data centre serving the request). A copy read from it keeps that first evidence, so a figure still
// says when the SEC served it, not when the cache did. Outside a request, under Node or without a cache,
// nothing is kept and every read goes to the source.
//
// Each request counts the copies it found fresh, found stale and did not find (index.mjs reports them in
// the X-Canli-Cache header), and hands its writes to waitUntil, so a write never holds up an answer.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { freshFor } from "canli-markets-mcp/src/disk-cache.mjs";

// The request being served: { origin, hit, stale, miss, waitUntil }.
export const requestScope = new AsyncLocalStorage();

// Kept past their freshness: the pack answers from an older copy when a source is down, and says how old.
const KEEP_SECONDS = 30 * 86_400;
const MAX_TEXT_CHARS = 64 * 1024 * 1024;

// The pack's disk cache, read and written in Cloudflare's cache under the serving host.
export function edgeDisk({ cacheOf = () => globalThis.caches?.default ?? null, now = () => Date.now() } = {}) {
  const place = (key) => {
    const scope = requestScope.getStore();
    const cache = scope?.origin ? cacheOf() : null;
    return cache && { scope, cache, request: new Request(`${scope.origin}/.canli-cache/${createHash("sha256").update(key).digest("hex")}`) };
  };
  return {
    async read(key) {
      const at = place(key);
      if (!at) return null;
      try {
        const copy = await at.cache.match(at.request);
        if (!copy) {
          at.scope.miss++;
          return null;
        }
        const entry = { at: Number(copy.headers.get("X-Canli-At")), record: JSON.parse(decodeURIComponent(copy.headers.get("X-Canli-Record"))), text: await copy.text() };
        if (now() - entry.at < freshFor(key)) at.scope.hit++;
        else at.scope.stale++;
        return entry;
      } catch {
        at.scope.miss++;
        return null;
      }
    },
    async write(key, entry) {
      const at = place(key);
      if (!at || typeof entry?.text !== "string" || entry.text.length > MAX_TEXT_CHARS) return;
      const headers = { "Cache-Control": `public, max-age=${KEEP_SECONDS}`, "Content-Type": "text/plain; charset=utf-8", "X-Canli-At": String(entry.at), "X-Canli-Record": encodeURIComponent(JSON.stringify(entry.record ?? null)) };
      at.scope.waitUntil?.(at.cache.put(at.request, new Response(entry.text, { headers })).catch(() => {}));
    },
  };
}
