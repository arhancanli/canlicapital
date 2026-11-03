// workers/canli-mcp/src/setup.mjs
//
// Imported first, before any package.
// - Workers refuse fetch called as another object's method (the packs keep it as session.fetchImpl
//   and call it that way: "Illegal invocation"), so fetch is bound to the global object here.
// - A request with no User-Agent gets one, as Node's fetch always sends.
// - FRED, reached from Cloudflare, refuses the markets pack's bare "canli-markets-mcp" (HTTP 520,
//   measured 2026-11-03) and serves the same name with a contact link. Treasury holds requests whose
//   User-Agent carries a link, so only FRED gets it. The markets pack should make the same choice.
// - The markets pack reads CANLI_KEYLESS_PRICES when it first loads: off, price tools say that prices
//   need a key instead of fetching Yahoo's data.
const nativeFetch = globalThis.fetch.bind(globalThis);
const FRED = /^https:\/\/(?:fred|api)\.stlouisfed\.org\//;
globalThis.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has("User-Agent")) headers.set("User-Agent", "canli-mcp (+https://canlicapital.com)");
  else if (FRED.test(url) && headers.get("User-Agent") === "canli-markets-mcp") headers.set("User-Agent", "canli-markets-mcp (+https://canlicapital.com)");
  return nativeFetch(input, { ...init, headers });
};
process.env.CANLI_KEYLESS_PRICES = "0";
