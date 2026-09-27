// Real clients list tools first and then validate each structured result against the listed output
// schema. This test does the same over the real stdio transport, reading the public site.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));

test("every tool lists an open output schema", async () => {
  const client = new Client({ name: "output-schemas", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER] }));
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    for (const tool of tools) {
      assert.ok(tool.outputSchema, `${tool.name} has no output schema`);
      assert.doesNotMatch(JSON.stringify(tool.outputSchema), /"additionalProperties":false/, `${tool.name} publishes a closed output schema`);
    }
  } finally {
    await client.close();
  }
});
