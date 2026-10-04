// api/mcp-research.js
//
// The hosted canli-research-mcp (canlicapital.com/mcp/research): the npm package's own tools over
// MCP Streamable HTTP, reading the same static research files. One session per warm function
// instance, so its short file cache serves repeat requests.
import * as released from "../mcp-released/research/src/server.mjs";
import { createStatelessMcpHandler } from "./_lib/mcp-stateless.js";

export function createResearchHandler({ session = released.createSession() } = {}) {
  // A release with prompts and resources exports registerAll; an older one only its tools.
  const register = released.registerAll ?? released.registerTools;
  return createStatelessMcpHandler({ serverInfo: released.SERVER_INFO, instructions: released.SERVER_INSTRUCTIONS, register: (server) => register(server, session), path: "/mcp/research" });
}

export default createResearchHandler();
