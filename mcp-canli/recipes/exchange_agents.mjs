// Different AI models trading against each other in a paper exchange, each through its own server, so
// each sees only what the protocol shows it. Give each agent its own model and brief; scripted traders
// fill out the market, and a shock arrives partway through. Made-up assets and money.
//
//   node recipes/exchange_agents.mjs agents.json --steps 40
//
// agents.json is a list: [{"name": "claude-analyst", "brief": "You are a fundamental analyst.", "base_url": "https://api.anthropic.com/v1", "model": "claude-haiku-5-5", "key_env": "ANTHROPIC_API_KEY"},
//                         {"name": "gpt-risk", "brief": "You manage risk and hate drawdowns.", "base_url": "https://api.openai.com/v1", "model": "...", "key_env": "OPENAI_API_KEY"}]
// Any OpenAI-compatible endpoint works, including a local model. Keys come from your environment.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const command = (process.env.CANLI_MCP_COMMAND ?? "npx -y canli-mcp").split(" ");

// Orders from a model's last words. Anything unreadable or malformed is a pass, so one confused model
// cannot stop the market, and the exchange refuses what the rules do not allow.
export function readOrders(reply) {
  const text = String(reply ?? "");
  const start = text.lastIndexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const orders = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(orders) ? orders.filter((o) => o && typeof o === "object").slice(0, 10) : [];
  } catch { return []; }
}

export const promptFor = (brief, view) => [
  { role: "system", content: `${brief} You trade in a paper exchange with made-up assets and made-up money. ${view.rules} Reply with a JSON list of orders for this step and nothing else: {"type":"limit","asset":"ART1","side":"buy","quantity":10,"price":50.5}, {"type":"market","asset":"ART1","side":"sell","quantity":10} or {"type":"cancel"}. An empty list [] passes.` },
  { role: "user", content: JSON.stringify({ step: view.step, market: view.market, recent_trades: view.recent_trades, you: view.you }) },
];

export function chatWith(agent, env = process.env, fetchImpl = fetch) {
  return async (messages) => {
    const key = agent.key_env ? env[agent.key_env] : undefined;
    const r = await fetchImpl(`${agent.base_url.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: agent.model, messages, temperature: 0.2, max_tokens: 400 }) });
    if (!r.ok) throw new Error(`${agent.name}'s model answered ${r.status}`);
    return (await r.json()).choices[0].message.content;
  };
}

async function main() {
  const flag = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
  const file = process.argv[2];
  if (!file || file.startsWith("--")) { process.stderr.write("usage: node recipes/exchange_agents.mjs agents.json [--steps 40] [--seed 1] [--shock-step 20]\n"); process.exit(2); }
  const agents = JSON.parse(readFileSync(file, "utf8")), steps = Number(flag("--steps", 40)), shockAt = Number(flag("--shock-step", Math.floor(steps / 2)));
  const exchange_file = join(mkdtempSync(join(tmpdir(), "exchange-")), "exchange.json");
  const connect = async () => { const c = new Client({ name: "exchange-agent", version: "1" }); await c.connect(new StdioClientTransport({ command: command[0], args: command.slice(1), env: { ...process.env, CANLI_PACKS: "backtest" } })); return c; };
  const run = async (client, name, args) => {
    const r = await client.callTool({ name: "run_tool", arguments: { name, arguments: args } });
    const text = r.content.find((c) => c.type === "text")?.text ?? "";
    if (r.isError) throw new Error(text);
    return JSON.parse(text);
  };
  const house = await connect();
  await run(house, "exchange_new", { exchange_file, seed: Number(flag("--seed", 1)), shocks: [{ step: shockAt, kind: "value", percent: -15 }, { step: shockAt, kind: "liquidity", steps: 5 }] });
  const players = [];
  for (const a of agents) {
    const client = await connect();
    const { token } = await run(client, "exchange_join", { exchange_file, agent: a.name, about: a.brief.slice(0, 200) });
    players.push({ ...a, client, token, chat: chatWith(a) });
  }
  for (let step = 1; step <= steps; step += 1) {
    await Promise.all(players.map(async (p) => {
      let orders = [];
      try {
        const view = await run(p.client, "exchange_view", { exchange_file, agent: p.name, token: p.token });
        orders = readOrders(await p.chat(promptFor(p.brief, view)));
        await run(p.client, "exchange_orders", { exchange_file, agent: p.name, token: p.token, orders });
      } catch (e) {
        process.stderr.write(`step ${step}, ${p.name}: ${String(e.message).slice(0, 160)}; passing\n`);
        await run(p.client, "exchange_orders", { exchange_file, agent: p.name, token: p.token, orders: [] });
      }
    }));
    await run(house, "exchange_step", { exchange_file });
  }
  process.stdout.write(`${JSON.stringify(await run(house, "exchange_report", { exchange_file }), null, 2)}\n`);
  for (const p of players) await p.client.close();
  await house.close();
}
if (process.argv[1]?.endsWith("exchange_agents.mjs")) await main();
