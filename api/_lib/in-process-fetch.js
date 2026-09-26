// api/_lib/in-process-fetch.js
//
// The hosted MCP endpoint (api/mcp.js) runs in the same deployment as the validation API. Its
// validation calls used to leave the function, cross the internet back to canlicapital.com and start
// a second function: an extra network round trip (about 100 ms from the Frankfurt region) and a
// second billed invocation for every validation. This fetch hands those calls to the API's own route
// handlers in this process instead, so key checks, quotas, receipts and envelopes are the same code
// with the same results. Every other request (company files, receipts, status) goes to `fallback`.
import backtestLength from "../v1/validate/backtest-length.js";
import breadth from "../v1/validate/breadth.js";
import haircutSharpe from "../v1/validate/haircut-sharpe.js";
import deflatedSharpe from "../v1/validate/deflated-sharpe.js";
import overfitting from "../v1/validate/overfitting.js";
import paperEvidence from "../v1/validate/paper-evidence.js";
import trackRecord from "../v1/validate/track-record.js";

export const IN_PROCESS_ROUTES = Object.freeze({
  "/api/v1/validate/backtest-length": backtestLength,
  "/api/v1/validate/breadth": breadth,
  "/api/v1/validate/deflated-sharpe": deflatedSharpe,
  "/api/v1/validate/haircut-sharpe": haircutSharpe,
  "/api/v1/validate/overfitting": overfitting,
  "/api/v1/validate/paper-evidence": paperEvidence,
  "/api/v1/validate/track-record": trackRecord,
});

// A request the route handler reads like Vercel's: lower-case headers and a body it parses itself
// (the same byte cap and invalid-JSON handling as over the network).
function toRequest(init) {
  const headers = {};
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v);
  const raw = Buffer.from(init.body ?? "", "utf8");
  headers["content-length"] = String(raw.length);
  return {
    method: String(init.method ?? "GET").toUpperCase(),
    headers,
    body: undefined,
    async *[Symbol.asyncIterator]() { if (raw.length) yield raw; },
  };
}

function toResponseSink() {
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    end(chunk = "") { finish(new Response(String(chunk), { status: res.statusCode, headers })); },
  };
  return { res, done };
}

export function inProcessFetch({ fallback = globalThis.fetch, routes = IN_PROCESS_ROUTES } = {}) {
  return async function fetchInProcess(url, init = {}) {
    const route = String(init.method ?? "GET").toUpperCase() === "POST" ? routes[new URL(url).pathname] : undefined;
    if (!route) return fallback(url, init);
    const signal = init.signal;
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const { res, done } = toResponseSink();
    const handled = Promise.resolve(route(toRequest(init), res)).then(() => done);
    if (!signal) return handled;
    // The caller's deadline still applies, as it did to the network request.
    return Promise.race([
      handled,
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")), { once: true })),
    ]);
  };
}
