// api/mcp.js
//
// The hosted MCP endpoint (canlicapital.com/mcp): the same tools as the npm package
// canli-validation-mcp, over MCP Streamable HTTP, so a client can connect with a URL and no install.
// It registers the package's own tools, prompts and resources (mcp/src/server.mjs, registerAll) rather than a copy, so
// the hosted and local servers cannot drift apart.
//
// Stateless: every POST builds a fresh server and transport, which is what a serverless function
// can honestly offer. The key a request runs under is the caller's own ("Authorization: Bearer
// <key>") when present, otherwise a shared anonymous key (CANLI_REMOTE_MCP_KEY) with a shared
// daily quota. The caller's key is forwarded to the validation API and never echoed or logged.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSession, registerAll, SERVER_NAME, SERVER_VERSION } from "../mcp/src/server.mjs";
import { BodyError, readJsonBody } from "./_lib/body.js";
import { inProcessFetch } from "./_lib/in-process-fetch.js";

// The largest validation request (1 MiB, see api/_lib/limits.js) plus room for the JSON-RPC wrapper.
export const MAX_MCP_BODY_BYTES = 1_048_576 + 65_536;
const KEY_PATTERN = /^[A-Za-z0-9_\-.]{16,200}$/;

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
}

function rpcError(res, status, code, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null })}\n`);
}

// Which key this request runs under. A malformed Authorization header is refused rather than
// silently downgraded to the shared key, so a caller never believes their own quota is in use when
// it is not.
export function resolveKey(req, env = process.env) {
  const header = req.headers?.authorization;
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)$/i.exec(String(header).trim());
    if (!match || !KEY_PATTERN.test(match[1])) return { error: "Authorization must be 'Bearer <key>'" };
    return { key: match[1], keySource: "caller" };
  }
  const shared = env.CANLI_REMOTE_MCP_KEY;
  return shared ? { key: shared, keySource: "shared" } : { key: undefined, keySource: "none" };
}

// Validations are answered by this deployment's own API handlers in process (see
// _lib/in-process-fetch.js); tests pass their own fetchImpl.
export function createHostedHandler({ env = () => process.env, fetchImpl = inProcessFetch() } = {}) {
  return async function handler(req, res) {
    corsHeaders(res);
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return rpcError(res, 405, -32000, "This endpoint is stateless: send MCP requests with POST. There is no server-initiated stream.");
    }
    const resolved = resolveKey(req, env());
    if (resolved.error) return rpcError(res, 401, -32001, resolved.error);
    let body;
    try { body = await readJsonBody(req, MAX_MCP_BODY_BYTES); } catch (e) {
      if (e instanceof BodyError) return rpcError(res, e.status, -32700, e.message);
      return rpcError(res, 400, -32700, "Could not read the request body");
    }
    const session = createSession({
      envKey: resolved.key,
      fetchImpl,
      base: env().CANLI_API_BASE,
      hosted: { keySource: resolved.keySource },
    });
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerAll(server, session);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) rpcError(res, 500, -32603, "Internal error");
    }
  };
}

export default createHostedHandler();
