// api/mcp-fundamentals.js
//
// The hosted canli-fundamentals-mcp (canlicapital.com/mcp/fundamentals): the npm package's own tools
// over MCP Streamable HTTP. One session per warm function instance, so its company cache and the
// hash-named snapshot cache in /tmp serve repeat requests; every snapshot is still checked against
// its SHA-256 before use.
import { createSession, registerTools, SERVER_INFO } from "../mcp-fundamentals/src/server.mjs";
import { createStatelessMcpHandler } from "./_lib/mcp-stateless.js";

export function createFundamentalsHandler({ session = createSession({ cacheDir: "/tmp/canli-fundamentals" }) } = {}) {
  return createStatelessMcpHandler({ serverInfo: SERVER_INFO, register: (server) => registerTools(server, session), path: "/mcp/fundamentals" });
}

export default createFundamentalsHandler();
