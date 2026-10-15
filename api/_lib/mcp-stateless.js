// api/_lib/mcp-stateless.js
//
// A stateless MCP endpoint for one of the read-only servers of the Canli MCP family (fundamentals,
// research): every POST builds a fresh server over the package's own tools, so the hosted server
// and the npm package cannot drift apart, and clients that only take a URL (claude.ai connectors,
// ChatGPT, Cursor) can use them with no install. These servers read public files only, so there
// is no key and no quota here; the session passed in (its caches) lives as long as the function
// instance.
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { BodyError, readJsonBody } from "./body.js";

// Read-only tool calls are small: a ticker, a concept, a date or a slug.
export const MAX_READ_ONLY_MCP_BODY_BYTES = 65_536;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
}

function rpcError(res, status, code, message, id = null) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id })}\n`);
}

// `screen(body, req)` may refuse a request before any tool sees it: it returns
// { status, code, message, headers?, id? } to refuse, or nothing to let it through.
export function createStatelessMcpHandler({ serverInfo, instructions, register, path, maxBodyBytes = MAX_READ_ONLY_MCP_BODY_BYTES, screen }) {
  return async function handler(req, res) {
    corsHeaders(res);
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return rpcError(res, 405, -32000, "This endpoint is stateless: send MCP requests with POST. There is no server-initiated stream.");
    }
    let body;
    try { body = await readJsonBody(req, maxBodyBytes); } catch (e) {
      if (e instanceof BodyError) return rpcError(res, e.status, -32700, e.message);
      return rpcError(res, 400, -32700, "Could not read the request body");
    }
    const refusal = screen ? screen(body, req) : null;
    if (refusal) {
      for (const [name, value] of Object.entries(refusal.headers ?? {})) res.setHeader(name, value);
      return rpcError(res, refusal.status, refusal.code, refusal.message, refusal.id ?? null);
    }
    const server = new McpServer(serverInfo, instructions ? { instructions } : undefined);
    register(server);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
      const request = new Request(`https://${req.headers.host ?? "canlicapital.com"}${req.url ?? path}`, { method: "POST", headers, body: JSON.stringify(body) });
      const response = await transport.handleRequest(request, { parsedBody: body });
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent) rpcError(res, 500, -32603, "Internal error");
    }
  };
}
