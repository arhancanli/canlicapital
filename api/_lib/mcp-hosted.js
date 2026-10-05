// api/_lib/mcp-hosted.js
//
// The hosted validation MCP handler, shared by /mcp (api/mcp.js: the released package, for
// everyone) and /mcp/beta (api/mcp-beta.js: the unreleased package on main, for contributor keys).
// Each endpoint passes the server module it serves and an authorize step; this file imports no
// server, so each function bundles only its own.
//
// Stateless: every POST builds a fresh server and transport, which is what a serverless function
// can honestly offer. authorize(req, env) decides, before the body is read, which key the request
// runs under ({ key, keySource }) or refuses it ({ error: { status, code, message, data? } }). The
// key is forwarded to the validation API and never echoed or logged.
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { BodyError, readJsonBody } from "./body.js";

// The largest validation request (1 MiB, see limits.js) plus room for the JSON-RPC wrapper.
export const MAX_MCP_BODY_BYTES = 1_048_576 + 65_536;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
}

function rpcError(res, status, code, message, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const error = data === undefined ? { code, message } : { code, message, data };
  res.end(`${JSON.stringify({ jsonrpc: "2.0", error, id: null })}\n`);
}

export function toolsetsParam(req) {
  const fromQuery = req.query?.toolsets;
  if (fromQuery !== undefined) return Array.isArray(fromQuery) ? fromQuery.join(",") : String(fromQuery);
  const url = typeof req.url === "string" ? new URL(req.url, "https://canlicapital.com") : null;
  return url?.searchParams.has("toolsets") ? url.searchParams.getAll("toolsets").join(",") : undefined;
}

// server: { configuredToolsets, createSession, registerAll, SERVER_INFO, SERVER_INSTRUCTIONS }, the
// exports of a validation server.mjs. serverInfo overrides how it introduces itself in initialize.
export function createValidationMcpHandler({ server, serverInfo = server.SERVER_INFO, authorize, env, fetchImpl, path }) {
  return async function handler(req, res) {
    corsHeaders(res);
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return rpcError(res, 405, -32000, "This endpoint is stateless: send MCP requests with POST. There is no server-initiated stream.");
    }
    const environment = env();
    let access;
    try { access = await authorize(req, environment); } catch { return rpcError(res, 500, -32603, "Internal error"); }
    if (access.error) return rpcError(res, access.error.status, access.error.code, access.error.message, access.error.data);
    let body;
    try { body = await readJsonBody(req, MAX_MCP_BODY_BYTES); } catch (e) {
      if (e instanceof BodyError) return rpcError(res, e.status, -32700, e.message);
      return rpcError(res, 400, -32700, "Could not read the request body");
    }
    // ?toolsets=company lists only those tools; without it, the package's default, the same list
    // npm users get. This deployment's own environment never chooses.
    let toolsets;
    try { toolsets = server.configuredToolsets(toolsetsParam(req)); } catch (e) { return rpcError(res, 400, -32602, e.message); }
    const session = server.createSession({
      toolsets,
      envKey: access.key,
      fetchImpl,
      base: environment.CANLI_API_BASE,
      hosted: { keySource: access.keySource },
    });
    const mcp = new McpServer(serverInfo, { instructions: server.SERVER_INSTRUCTIONS });
    server.registerAll(mcp, session);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); mcp.close(); });
    try {
      await mcp.connect(transport);
      // The SDK's transport speaks web Request/Response; the body is already read and bounded above.
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
