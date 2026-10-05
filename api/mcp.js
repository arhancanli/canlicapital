// api/mcp.js
//
// The hosted MCP endpoint (canlicapital.com/mcp): the same tools as the npm package
// canli-validation-mcp, over MCP Streamable HTTP, so a client can connect with a URL and no install.
// It registers the released package's own tools, prompts and resources (registerAll) rather than a
// copy, so the hosted and local servers cannot drift apart. The transport handling is shared with
// the contributor beta endpoint (_lib/mcp-hosted.js); this file chooses the server and the key.
//
// Stateless: every POST builds a fresh server and transport. The key a request runs under is the
// caller's own ("Authorization: Bearer <key>") when present, otherwise a shared anonymous key
// (CANLI_REMOTE_MCP_KEY) with a shared daily quota. The caller's key is forwarded to the validation
// API and never echoed or logged.
import { configuredToolsets, createSession, registerAll, SERVER_INFO, SERVER_INSTRUCTIONS } from "../mcp-released/validation/src/server.mjs";
import { inProcessFetch } from "./_lib/in-process-fetch.js";
import { createValidationMcpHandler, MAX_MCP_BODY_BYTES, toolsetsParam } from "./_lib/mcp-hosted.js";

export { MAX_MCP_BODY_BYTES, toolsetsParam };

const RELEASED = Object.freeze({ configuredToolsets, createSession, registerAll, SERVER_INFO, SERVER_INSTRUCTIONS });
const KEY_PATTERN = /^[A-Za-z0-9_\-.]{16,200}$/;

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
  return createValidationMcpHandler({
    server: RELEASED,
    env,
    fetchImpl,
    path: "/mcp",
    authorize: (req, environment) => {
      const resolved = resolveKey(req, environment);
      return resolved.error ? { error: { status: 401, code: -32001, message: resolved.error } } : resolved;
    },
  });
}

export default createHostedHandler();
