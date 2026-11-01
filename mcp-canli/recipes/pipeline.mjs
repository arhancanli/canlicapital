// The three steps as plain code, no model: check a company's revenue against its filing, test a
// moving-average rule on its prices against luck, and write an order file only if that clears a floor
// you can read below. Usage: node pipeline.mjs AAPL [out.json]
import { writeFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const symbol = (process.argv[2] ?? "AAPL").toUpperCase(), out = process.argv[3] ?? "orders.json";
const [command, ...args] = (process.env.CANLI_MCP_COMMAND ?? "npx -y canli-mcp").split(" ");
const transport = new StdioClientTransport({ command, args, env: { ...process.env, CANLI_PACKS: "markets,fundamentals,validation,quant", CANLI_POLICY: '{"orders":"off"}' } });
const client = new Client({ name: "canli-recipe", version: "1" });
await client.connect(transport);
const run = async (name, a) => {
  const r = await client.callTool({ name: "run_tool", arguments: { name, arguments: a } });
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
  return r.structuredContent;
};

try {
  // 1. Data: a figure is used only if its filing confirms it.
  const history = await run("history", { company: symbol, concept: "revenue" });
  const at = (k) => history.columns.indexOf(k), latest = history.rows?.[0];
  if (latest) {
    const value = latest[at("val")], year = String(latest[at("end")]).slice(0, 4);
    const check = await run("verify_claims", { company: symbol, claims: [{ measure: "revenue", period: `fiscal ${year}`, value }] });
    console.log(`1. Data: revenue of ${value.toLocaleString("en-US")} for the year ending ${latest[at("end")]} is ${check.rows[0][check.columns.indexOf("verdict")]} against the filing.`);
  } else console.log("1. Data: no annual revenue found to check; going on with prices alone.");

  // 2. Risk: every variant tried counts against the best of them.
  const start = `${new Date().getUTCFullYear() - 5}-01-01`;
  const prices = await run("price_history", { symbol, start });
  const closes = prices.close ?? [];
  if (closes.length < 300) throw new Error(`only ${closes.length} prices for ${symbol}`);
  const grid = [[10, 50], [20, 50], [20, 100], [50, 100], [50, 200]], results = [];
  for (const [fast, slow] of grid) results.push({ fast, slow, ...(await run("backtest_ma_crossover", { prices: closes, fast, slow, long_only: true })) });
  const best = results.reduce((a, b) => ((b.sharpe ?? -9) > (a.sharpe ?? -9) ? b : a));
  const spread = Math.sqrt(results.reduce((n, r) => n + (r.sharpe - results.reduce((m, x) => m + x.sharpe, 0) / results.length) ** 2, 0) / (results.length - 1)) || 0.01;
  const luck = await run("validate_deflated_sharpe", { observed_sharpe_annualized: best.sharpe, observations: closes.length - 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, effective_independent_trials: grid.length, cross_trial_sharpe_sd_annualized: spread });
  const probability = (luck.data ?? luck).result.deflated_sharpe_ratio;
  console.log(`2. Risk: the best of ${grid.length} rules, ${best.fast}/${best.slow}, has a Sharpe of ${best.sharpe.toFixed(2)}. Probability it beats luck: ${(100 * probability).toFixed(1)}%.`);

  // 3. Orders: a draft for a person, only above the floor. The floor is this recipe's choice, not an approval.
  const FLOOR = 0.95;
  if (probability < FLOOR) { console.log(`3. Orders: none. ${(100 * probability).toFixed(1)}% is under this recipe's floor of ${100 * FLOOR}%.`); process.exitCode = 0; }
  else {
    const intent = { schema: "canli.order-intent.v1", reason: `${best.fast}/${best.slow} moving-average rule on ${symbol}, probability ${probability.toFixed(3)} against ${grid.length} tries`, orders: [{ symbol, side: "buy", quantity: 1, type: "market", time_in_force: "day" }] };
    writeFileSync(out, `${JSON.stringify(intent, null, 2)}\n`);
    console.log(`3. Orders: wrote ${out}. Nothing was sent. Read it before you do anything with it.`);
  }
} finally { await client.close(); }
