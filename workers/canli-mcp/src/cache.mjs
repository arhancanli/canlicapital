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
// The fundamentals and validation packs read canlicapital.com's company reference instead, and keep no copy
// on the hosted server, so those reads are cached here by address (withCache): a company's SEC snapshot,
// named by its SHA-256 and checked against it on every read, for a year; a company's record and the ticker
// and name lists for six hours, as long as the fundamentals pack keeps its own copies. Neither pack stamps
// these reads with the time they were made: a snapshot carries the time it was taken from the SEC.
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

const HOUR = 3600;
export const RULES = [
  { seconds: 365 * 24 * HOUR, pattern: /^https:\/\/canlicapital\.com\/company-data\/sources\/[0-9a-f]{64}\.json(?:\.gz)?$/ },
  { seconds: 6 * HOUR, pattern: /^https:\/\/canlicapital\.com\/(?:company-data\/\d{10}\.json|api\/v1\/company-(?:tickers|names)\.json)$/ },
];

// How long a read of `url` is kept by withCache, in seconds; 0 when it is not.
export const ttlFor = (url) => RULES.find((rule) => rule.pattern.test(url))?.seconds ?? 0;

// Where an entry lives in the cache: under the host serving this request.
function place(key, cacheOf) {
  const scope = requestScope.getStore();
  const cache = scope?.origin ? cacheOf() : null;
  return cache && { scope, cache, request: new Request(`${scope.origin}/.canli-cache/${createHash("sha256").update(key).digest("hex")}`) };
}

const defaultCache = () => globalThis.caches?.default ?? null;

// fetchImpl with the cache in front of the GETs that RULES name. A request that revalidates (If-None-Match)
// or asks for a range goes straight through; only an answer of 200 is kept, with its type and ETag.
export function withCache(fetchImpl, cacheOf = defaultCache) {
  return async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input instanceof URL ? input.href : input);
    const method = String(init.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? request?.headers);
    const seconds = method === "GET" && !headers.has("If-None-Match") && !headers.has("Range") ? ttlFor(url) : 0;
    const at = seconds ? place(`GET ${url}`, cacheOf) : null;
    if (!at) return fetchImpl(input, init);
    const copy = await at.cache.match(at.request).catch(() => undefined);
    if (copy) {
      at.scope.hit++;
      return copy;
    }
    at.scope.miss++;
    const response = await fetchImpl(input, init);
    if (response.status === 200) {
      const kept = new Headers({ "Cache-Control": `public, max-age=${seconds}` });
      for (const name of ["Content-Type", "ETag", "Last-Modified"]) if (response.headers.has(name)) kept.set(name, response.headers.get(name));
      at.scope.waitUntil?.(at.cache.put(at.request, new Response(response.clone().body, { status: 200, headers: kept })).catch(() => {}));
    }
    return response;
  };
}

// The pack's disk cache, read and written in Cloudflare's cache under the serving host.
export function edgeDisk({ cacheOf = defaultCache, now = () => Date.now() } = {}) {
  return {
    async read(key) {
      const at = place(key, cacheOf);
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
      const at = place(key, cacheOf);
      if (!at || typeof entry?.text !== "string" || entry.text.length > MAX_TEXT_CHARS) return;
      const headers = { "Cache-Control": `public, max-age=${KEEP_SECONDS}`, "Content-Type": "text/plain; charset=utf-8", "X-Canli-At": String(entry.at), "X-Canli-Record": encodeURIComponent(JSON.stringify(entry.record ?? null)) };
      at.scope.waitUntil?.(at.cache.put(at.request, new Response(entry.text, { headers })).catch(() => {}));
    },
  };
}
