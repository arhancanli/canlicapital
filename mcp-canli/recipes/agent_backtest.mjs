// Backtest an AI agent, with no way to peek. At each date a fresh server starts as of that date
// (canli-mcp --as-of), so its filings and prices stop there and anything it cannot hold to the date
// is off. The model picks what to hold, and the picks are scored on what happened next.
//
// The model's memory is the part no server can lock. So this also runs a leak check: with no tools,
// it asks the model which way each stock went over the next quarter. A model that beats chance on
// that, on dates inside its training, remembers the answers, and its backtest there means nothing.
//
//   MODEL_BASE_URL=http://localhost:11434/v1 MODEL_NAME=qwen3:1.7b node recipes/agent_backtest.mjs --dates 2021-03-01,2021-06-01 --symbols AAPL,MSFT,XOM
//
// Any OpenAI-compatible endpoint works. MODEL_API_KEY if it needs one. Paper only: nothing is traded.
import { writeFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const HOLD_DAYS = 91;
const command = (process.env.CANLI_MCP_COMMAND ?? "npx -y canli-mcp").split(" ");

// An OpenAI-compatible chat call, tools optional.
export function modelFrom(env = process.env, fetchImpl = fetch) {
  const base = (env.MODEL_BASE_URL ?? "http://localhost:11434/v1").replace(/\/$/, "");
  return async (messages, tools) => {
    const r = await fetchImpl(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", ...(env.MODEL_API_KEY ? { Authorization: `Bearer ${env.MODEL_API_KEY}` } : {}) }, body: JSON.stringify({ model: env.MODEL_NAME, messages, temperature: 0, ...(tools?.length ? { tools } : {}) }) });
    if (!r.ok) throw new Error(`The model answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).choices[0].message;
  };
}

// The picks, read from the model's last words: {"AAPL": 0.5, "XOM": 0.5}. Anything not on the list, or
// not a positive weight, is dropped, and what is left is scaled to one. Nothing readable holds nothing.
export function readWeights(reply, symbols) {
  const found = String(reply ?? "").match(/\{[^{}]*\}/g) ?? [];
  for (const block of found.reverse()) {
    try {
      const raw = JSON.parse(block), kept = Object.entries(raw).filter(([k, v]) => symbols.includes(k.toUpperCase()) && Number(v) > 0);
      const sum = kept.reduce((n, [, v]) => n + Number(v), 0);
      if (sum > 0) return Object.fromEntries(kept.map(([k, v]) => [k.toUpperCase(), Number(v) / sum]));
    } catch { /* the next block */ }
  }
  return {};
}

export const plusDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// One agent's turn: its tools are the server's, and the server is locked to the date.
export async function decide({ model, listTools, callTool, date, symbols, maxTurns = 8 }) {
  const tools = (await listTools()).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  const messages = [
    { role: "system", content: `Today is ${date}. You choose what to hold for the next three months from this list: ${symbols.join(", ")}. Use the tools to read what is public today. Do not use anything you remember from after ${date}. End with one line of JSON giving weights that add to 1, such as {"${symbols[0]}": 1}. This is paper only.` },
    { role: "user", content: "What do you hold, and why, in a few lines?" },
  ];
  let calls = 0;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const reply = await model(messages, tools);
    messages.push(reply);
    if (!reply.tool_calls?.length) return { weights: readWeights(reply.content, symbols), reasoning: String(reply.content ?? "").slice(0, 1500), tool_calls: calls };
    for (const c of reply.tool_calls) {
      calls += 1;
      let content;
      try { content = await callTool(c.function.name, JSON.parse(c.function.arguments || "{}")); } catch (e) { content = `Error: ${e.message}`; }
      messages.push({ role: "tool", tool_call_id: c.id, content: String(content).slice(0, 12000) });
    }
  }
  return { weights: {}, reasoning: "Ran out of turns.", tool_calls: calls };
}

export const portfolioReturn = (weights, moves) => Object.entries(weights).reduce((n, [s, w]) => n + w * (moves[s] ?? 0), 0);

// One side of a binomial test against a coin: how often a coin does at least this well.
export function coinP(hits, n) {
  let p = 0;
  const logChoose = (k) => { let x = 0; for (let i = 1; i <= k; i += 1) x += Math.log((n - k + i) / i); return x; };
  for (let k = hits; k <= n; k += 1) p += Math.exp(logChoose(k) - n * Math.LN2);
  return Math.min(1, p);
}

// With no tools: which way did each go over the next quarter? It has no way to know this except memory.
export async function leakCheck({ model, date, symbols, moves }) {
  const reply = await model([{ role: "system", content: "Answer from memory, with no tools. Give one line of JSON and nothing else." }, { role: "user", content: `For each of ${symbols.join(", ")}: over the three months after ${date}, did it rise or fall? Answer like {"${symbols[0]}": "rise"}.` }]);
  const block = String(reply.content ?? "").match(/\{[^{}]*\}/)?.[0];
  let said = {};
  try { said = JSON.parse(block ?? "{}"); } catch { /* an unreadable answer is no answer */ }
  const rows = symbols.filter((s) => /rise|fall|up|down/i.test(String(said[s] ?? "")) && moves[s] !== undefined).map((s) => ({ symbol: s, said_rise: /rise|up/i.test(said[s]), rose: moves[s] > 0 }));
  return { answered: rows.length, right: rows.filter((r) => r.said_rise === r.rose).length };
}

export function summarize(rounds) {
  const picked = rounds.filter((r) => Object.keys(r.weights).length);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const answered = rounds.reduce((n, r) => n + r.leak.answered, 0), right = rounds.reduce((n, r) => n + r.leak.right, 0);
  const p = answered ? coinP(right, answered) : null;
  return {
    rounds: rounds.length, rounds_with_picks: picked.length,
    mean_return_percent: mean(picked.map((r) => r.return * 100)), mean_equal_weight_percent: mean(picked.map((r) => r.equal_weight * 100)),
    leak_check: { answered, right, chance_of_this_by_luck: p, reading: answered < 20 ? "Too few answers to tell whether the model remembers these dates." : p < 0.05 ? "The model beats a coin on the future with no tools. It remembers these dates, so its backtest on them means little. Test it on dates after its training ended." : "No sign in this sample that the model remembers these dates. A small sample cannot rule it out." },
    limits: ["A few dates and a few stocks is a small sample: any return here could be luck. Judge it with validate_luck_trials.", "Prices are adjusted and carry no costs. Paper only."],
  };
}

async function main() {
  const flag = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
  const dates = String(flag("--dates", "")).split(",").filter(Boolean), symbols = String(flag("--symbols", "")).split(",").filter(Boolean).map((s) => s.toUpperCase());
  if (!dates.length || !symbols.length || !process.env.MODEL_NAME) { process.stderr.write("usage: MODEL_NAME=... [MODEL_BASE_URL=...] node recipes/agent_backtest.mjs --dates 2021-03-01,2021-06-01 --symbols AAPL,MSFT,XOM [--out results.json]\n"); process.exit(2); }
  const model = modelFrom();
  const connect = async (extra) => { const client = new Client({ name: "agent-backtest", version: "1" }); await client.connect(new StdioClientTransport({ command: command[0], args: [...command.slice(1), ...extra], env: { ...process.env, CANLI_PACKS: "markets,fundamentals,validation,quant" } })); return client; };
  // Scoring reads what happened next, so it runs on a server that is not locked, which the agent never touches.
  const judge = await connect([]);
  const moveOf = async (symbol, from, to) => {
    const r = await judge.callTool({ name: "run_tool", arguments: { name: "price_history", arguments: { symbol, start: from, end: to } } });
    const p = JSON.parse(r.content.find((c) => c.type === "text").text);
    return p.close?.length > 1 ? p.close.at(-1) / p.close[0] - 1 : undefined;
  };
  const rounds = [];
  for (const date of dates) {
    const seal = await connect(["--as-of", date]);
    const listTools = async () => (await seal.listTools()).tools;
    const callTool = async (name, args) => (await seal.callTool({ name, arguments: args })).content.map((c) => c.text ?? "").join("\n");
    const d = await decide({ model, listTools, callTool, date, symbols });
    await seal.close();
    const moves = Object.fromEntries((await Promise.all(symbols.map(async (s) => [s, await moveOf(s, date, plusDays(date, HOLD_DAYS))]))).filter(([, m]) => m !== undefined));
    const equal = Object.values(moves).reduce((a, b) => a + b, 0) / (Object.keys(moves).length || 1);
    rounds.push({ date, ...d, moves, return: portfolioReturn(d.weights, moves), equal_weight: equal, leak: await leakCheck({ model, date, symbols, moves }) });
    process.stderr.write(`${date}: ${JSON.stringify(d.weights)} ${d.tool_calls} tool calls\n`);
  }
  await judge.close();
  const out = { model: process.env.MODEL_NAME, symbols, rounds, summary: summarize(rounds) };
  if (flag("--out")) writeFileSync(flag("--out"), `${JSON.stringify(out, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(out.summary, null, 2)}\n`);
}
if (process.argv[1]?.endsWith("agent_backtest.mjs")) await main();
