// workers/canli-mcp/src/index.mjs
//
// The hosted canli-mcp on Cloudflare Workers: the same published package and the same rules as the
// Vercel function it is meant to replace (api/mcp-canli.js). Six packs, read-only; no files, no paper
// trading, no keyless prices; nothing kept between requests; a bounded number of requests a minute per
// caller in each isolate. Paid keys are not served here yet: a request that sends one is told to use
// canlicapital.com/mcp/canli until the key store is connected.
import "./setup.mjs";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import * as canli from "canli-mcp/src/server.mjs";
import { HOSTED_NOTE, HOSTED_PACKS, MAX_BODY_BYTES, REQUESTS_PER_MINUTE, namesAFile, wait } from "./rules.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

const rpcError = (status, code, message, id = null, headers = {}) =>
  new Response(`${JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id })}\n`, { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...headers } });

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return rpcError(405, -32000, "This endpoint is stateless: send MCP requests with POST. There is no server-initiated stream.", null, { Allow: "POST, OPTIONS" });
    if (/^Bearer\s+\S/i.test(request.headers.get("Authorization") ?? "")) return rpcError(401, -32001, "Keys are served at https://canlicapital.com/mcp/canli for now. Send no key here for the free tier.");
    const length = Number(request.headers.get("Content-Length") ?? 0);
    if (length > MAX_BODY_BYTES) return rpcError(413, -32700, `The request body is over ${MAX_BODY_BYTES} bytes.`);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return rpcError(413, -32700, `The request body is over ${MAX_BODY_BYTES} bytes.`);
    let body;
    try { body = JSON.parse(text); } catch { return rpcError(400, -32700, "Could not read the request body"); }
    const caller = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const seconds = wait(caller);
    if (seconds) return rpcError(429, -32000, `Too many requests: the hosted server takes ${REQUESTS_PER_MINUTE} a minute from each caller. Try again in ${seconds} s, run the same server locally with npx canli-mcp, or use a paid key for more.`, null, { "Retry-After": String(seconds) });
    const calls = Array.isArray(body) ? body : [body];
    const named = calls.find((m) => m && typeof m === "object" && namesAFile(m.params));
    if (named) return rpcError(200, -32602, "The hosted server reads no files: a {\"$file\": ...} or path argument would read the server's disk, not yours. Pass the numbers inline, or run canli-mcp locally (npx canli-mcp), where $file reads your own files.", named.id ?? null);
    const server = new McpServer(canli.SERVER_INFO, { instructions: `${canli.instructions(HOSTED_PACKS)}${HOSTED_NOTE}` });
    canli.registerAll(server, HOSTED_PACKS, undefined, { readOnly: true });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(new Request(request.url, { method: "POST", headers: request.headers, body: text }), { parsedBody: body });
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    } finally {
      transport.close();
      server.close();
    }
  },
};
