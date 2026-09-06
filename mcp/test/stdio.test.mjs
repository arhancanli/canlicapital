// mcp/test/stdio.test.mjs
//
// Proves the wiring end to end, not just the handler functions: spawns the actual bin as a child
// process over real stdio, performs the MCP initialize + tools/list handshake, and calls one tool
// through the real transport. The backend is a tiny local HTTP stub standing in for
// canlicapital.com (CANLI_API_BASE points at it), so no test in this repo touches the network.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcpRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const serverEntry = path.join(mcpRoot, "src/server.mjs");

const STUB_ENVELOPE = {
  schema: "canli.api.v1",
  endpoint: "/api/v1/validate/status",
  generated_at: "2026-09-06T00:00:00Z",
  claim_class: "OBSERVED",
  capital_kind: "NOT_APPLICABLE_SERVICE_STATUS",
  canonical_human_page: "https://canlicapital.com/developers",
  limits: [
    "This verdict is about the series exactly as submitted. The service never saw the data source, its costs, survivorship, or any lookahead in how the series was built.",
    "A deflated Sharpe or overfitting probability above or below any threshold is not admission to anything and is not a forecast.",
    "The receipt is content-hashed and reproducible from the open-source core it names. It is not signed.",
    "Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, 1048576 bytes per request, 20000 observations per series, 200 variants per matrix.",
  ],
  sources: [],
  data: { service: "validation-api", store_reachable: true, stub: true },
};

function startStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(STUB_ENVELOPE));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("stdio wiring: tools/list and a real tool call round-trip over the actual transport", async (t) => {
  const stub = await startStub();
  const base = `http://127.0.0.1:${stub.address().port}`;
  t.after(() => stub.close());

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, CANLI_API_BASE: base, CANLI_KEY: "" },
    cwd: mcpRoot,
  });
  const client = new Client({ name: "stdio-handshake-test", version: "0.0.1" });
  await client.connect(transport);
  t.after(() => client.close());

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "get_key",
    "get_receipt",
    "service_status",
    "validate_breadth",
    "validate_deflated_sharpe",
    "validate_overfitting",
    "validate_paper_evidence",
  ]);
  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 0, `${tool.name} has no description`);
  }

  const result = await client.callTool({ name: "service_status", arguments: {} });
  const envelope = JSON.parse(result.content[0].text);
  assert.deepEqual(envelope, STUB_ENVELOPE);
});
