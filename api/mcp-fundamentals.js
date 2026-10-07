// api/mcp-fundamentals.js
//
// The hosted canli-fundamentals-mcp (canlicapital.com/mcp/fundamentals): the npm package's own tools
// over MCP Streamable HTTP. One session per warm function instance, so its company cache and the
// hash-named snapshot cache in a private temp directory serve repeat requests; every snapshot is
// still checked against its SHA-256 before use.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSession, registerTools, SERVER_INFO, SERVER_INSTRUCTIONS } from "../mcp-released/fundamentals/src/server.mjs";
import { withDataReceipts } from "./_lib/data-receipts.js";
import { createStatelessMcpHandler } from "./_lib/mcp-stateless.js";

// A private cache directory per function instance (mkdtemp: unique name, owner-only), never a
// fixed path in the shared temp directory.
const privateCacheDir = () => mkdtempSync(join(tmpdir(), "canli-fundamentals-"));

export function createFundamentalsHandler({ session = createSession({ cacheDir: privateCacheDir() }) } = {}) {
  return createStatelessMcpHandler({ serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS, register: (server) => registerTools(withDataReceipts(server, { path: "/mcp/fundamentals", serverName: SERVER_INFO.name, serverVersion: SERVER_INFO.version }), session), path: "/mcp/fundamentals" });
}

export default createFundamentalsHandler();
