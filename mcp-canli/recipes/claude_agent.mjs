// The three steps with the Claude Agent SDK. npm i @anthropic-ai/claude-agent-sdk, then:
// node claude_agent.mjs "Should AAPL be bought on a 50/200 moving-average rule?"
// Credentials as for Claude Code. CANLI_MODEL chooses the model.
import { readFileSync } from "node:fs";

import { query } from "@anthropic-ai/claude-agent-sdk";

const task = process.argv[2] ?? "Test a 50/200 moving-average rule on AAPL.";
const [command, ...args] = (process.env.CANLI_MCP_COMMAND ?? "npx -y canli-mcp").split(" ");
const system = readFileSync(new URL("./prompt.txt", import.meta.url), "utf8");

for await (const message of query({
  prompt: task,
  options: {
    model: process.env.CANLI_MODEL ?? "claude-opus-5-5",
    systemPrompt: system,
    mcpServers: { canli: { command, args, env: { ...process.env, CANLI_PACKS: "markets,fundamentals,validation,backtest,quant", CANLI_POLICY: '{"orders":"off"}' } } },
    // Only the server's tools: no shell or file tools, so nothing this agent reads can make it run anything else.
    allowedTools: ["mcp__canli__find_tool", "mcp__canli__describe_tool", "mcp__canli__run_tool"],
    disallowedTools: ["Bash", "Write", "Edit", "WebFetch", "WebSearch", "Task"],
    maxTurns: 30,
  },
})) {
  if (message.type === "result") { console.log(message.subtype === "success" ? message.result : `Stopped: ${message.subtype}`); process.exitCode = message.subtype === "success" ? 0 : 1; }
}
