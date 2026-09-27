// Real clients list tools first and then validate each structured result against the output schema
// they were given. This test does the same, over the real stdio transport, so a missing or closed
// schema (additionalProperties: false) fails here instead of in Claude Code or Cursor.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));

test("every tool lists an open output schema, and results validate against it after listing", async () => {
  const client = new Client({ name: "output-schemas", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, CANLI_LOCAL: "1" } }));
  try {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      assert.ok(tool.outputSchema, `${tool.name} has no output schema`);
      assert.doesNotMatch(JSON.stringify(tool.outputSchema), /"additionalProperties":false/, `${tool.name} publishes a closed output schema`);
    }
    const matrix = Array.from({ length: 64 }, (_, t) => Array.from({ length: 6 }, (_, j) => Math.sin(((t + 1) * (j + 2)) / 9) / 100));
    const returns = Array.from({ length: 300 }, (_, i) => Math.sin(i / 7) / 100 + 0.0008);
    const calls = [
      ["validate_deflated_sharpe", { observed_sharpe_annualized: 1.5, observations: 730, periods_per_year: 365, skew: -0.5, non_excess_kurtosis: 5, effective_independent_trials: 229, cross_trial_sharpe_sd_annualized: 0.57 }],
      ["validate_overfitting", { matrix }],
      ["validate_haircut_sharpe", { observed_sharpe_annualized: 1.5, periods_per_year: 252, observations: 1260, tests: 50 }],
      ["validate_breadth", { sleeve_sharpe: 0.8, average_pairwise_correlation: 0.2, sleeves: 10 }],
      ["audit_backtest", { returns, periods_per_year: 252, effective_independent_trials: 20, cross_trial_sharpe_sd_annualized: 0.5 }],
      ["get_key", {}],
    ];
    for (const [name, args] of calls) {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, `${name} failed: ${result.content?.[0]?.text?.slice(0, 200)}`);
      assert.ok(result.structuredContent, `${name} returned no structured content`);
    }
  } finally {
    await client.close();
  }
});
