// api/mcp-research.js
//
// The hosted canli-research-mcp (canlicapital.com/mcp/research): the npm package's own tools over
// MCP Streamable HTTP, reading the same static research files. One session per warm function
// instance, so its short file cache serves repeat requests.
import { createSession, registerTools, SERVER_INFO } from "../mcp-research/src/server.mjs";
import { createStatelessMcpHandler } from "./_lib/mcp-stateless.js";

export function createResearchHandler({ session = createSession() } = {}) {
  return createStatelessMcpHandler({ serverInfo: SERVER_INFO, register: (server) => registerTools(server, session), path: "/mcp/research" });
}

export default createResearchHandler();
