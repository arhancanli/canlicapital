// Scores a model on filing-facts items: closed-book, or with canli-validation-mcp's company tool
// (CANLI_TOOLSETS=company, so the model sees one tool). A stratified sample with a fixed seed; the
// model ends with "ANSWER: <value>" and is scored against the item's recomputed answer.
//   node scripts/datasets/filing-facts/eval.mjs <items.jsonl> <out.json> --arm closed|mcp [--per-template 30] [--model gpt-5.4-mini]
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mulberry32 } from "./generate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

// Tolerances: a number within 0.1% relative (a filing states values to the unit, a model may round
// the last digits of a billion-dollar figure), a percent within 0.05 points, a ratio within 0.0005.
export function scoreAnswer(item, text) {
  const line = String(text ?? "").trim().split("\n").reverse().find((l) => /ANSWER:/i.test(l));
  if (!line) return { answered: false, correct: false, parsed: null };
  const raw = line.replace(/.*ANSWER:\s*/i, "").trim();
  if (item.answer.kind === "not_reported") {
    const said = /not reported|not available|no data|does not report|not disclosed|unavailable/i.test(raw);
    return { answered: true, correct: said, parsed: raw };
  }
  const value = Number(raw.replace(/[,$%\s]/g, "").replace(/USD|EUR|CAD/gi, ""));
  if (!Number.isFinite(value)) return { answered: true, correct: false, parsed: raw };
  const truth = item.answer.value;
  const ok = item.answer.kind === "number" ? Math.abs(value - truth) <= Math.max(Math.abs(truth) * 0.001, 0.005)
    : item.answer.kind === "percent" ? Math.abs(value - truth) <= 0.05
      : Math.abs(value - truth) <= 0.0005;
  return { answered: true, correct: ok, parsed: value };
}

const abstained = (r) => typeof r.parsed === "string" && /not reported|not available|no data|does not report|not disclosed|unavailable/i.test(r.parsed);

// Accuracy alone rewards a model that abstains on everything (it scores on the unanswerable items),
// so every run also reports how it behaves on each kind of item: on answerable items, how often it
// is right, how often it abstains, and how often a number it gives is wrong; on unanswerable items,
// how often it abstains and how often it invents a number.
export function behaviour(runs) {
  const answerable = runs.filter((r) => r.template !== "unanswerable");
  const unanswerable = runs.filter((r) => r.template === "unanswerable");
  const numeric = answerable.filter((r) => typeof r.parsed === "number");
  const rate = (xs, n) => (n ? xs.length / n : null);
  return {
    answerable: answerable.length,
    answerable_accuracy: rate(answerable.filter((r) => r.correct), answerable.length),
    answerable_abstention: rate(answerable.filter(abstained), answerable.length),
    numbers_given: numeric.length,
    numbers_wrong: rate(numeric.filter((r) => !r.correct), numeric.length),
    unanswerable: unanswerable.length,
    unanswerable_abstention: rate(unanswerable.filter(abstained), unanswerable.length),
    unanswerable_invented_number: rate(unanswerable.filter((r) => typeof r.parsed === "number"), unanswerable.length),
  };
}

export function stratifiedSample(items, perTemplate, seed) {
  const rng = mulberry32(seed);
  const byTemplate = new Map();
  for (const item of items) { if (!byTemplate.has(item.template)) byTemplate.set(item.template, []); byTemplate.get(item.template).push(item); }
  const out = [];
  for (const [, list] of [...byTemplate].sort(([a], [b]) => a.localeCompare(b))) {
    const pool = [...list];
    for (let i = 0; i < perTemplate && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

const SYSTEM_CLOSED = "You are a financial analyst. Answer from what you know. End with one final line 'ANSWER: <value>': a plain number without commas, units or percent signs (a percent as its number, e.g. 12.34), or 'not reported' if the data does not exist.";
const SYSTEM_MCP = "You are a financial analyst with a tool that returns a company's SEC-reported financial history (XBRL facts with filing accession numbers). Use it; do not guess numbers. End with one final line 'ANSWER: <value>': a plain number without commas, units or percent signs (a percent as its number, e.g. 12.34), or 'not reported' if the filings do not report it.";

async function chat(model, messages, tools) {
  const key = readFileSync(resolve(homedir(), ".config/canli/openai_benchmark_key"), "utf8").trim();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, ...(tools ? { tools, tool_choice: "auto" } : {}), max_completion_tokens: 3000 }),
    });
    const body = await res.json();
    if (res.status === 429 && attempt < 12) { await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${body?.error?.message ?? "error"}`);
    return body;
  }
}

async function mcpClient() {
  const { Client } = await import(resolve(HERE, "../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js"));
  const { StdioClientTransport } = await import(resolve(HERE, "../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js"));
  const client = new Client({ name: "filing-facts-eval", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(HERE, "../../../mcp/src/server.mjs")], env: { ...process.env, CANLI_TOOLSETS: "company", CANLI_KEY: "" } }));
  const tools = (await client.listTools()).tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: (({ $schema, ...p }) => p)(t.inputSchema) } }));
  return { client, tools };
}

async function runItem(item, { model, arm, mcp }) {
  const messages = [{ role: "system", content: arm === "mcp" ? SYSTEM_MCP : SYSTEM_CLOSED }, { role: "user", content: item.question }];
  let tokens = 0, final = null, calls = 0, error = null;
  try {
    for (let turn = 0; turn < 6; turn++) {
      const out = await chat(model, messages, arm === "mcp" ? mcp.tools : undefined);
      tokens += (out.usage?.prompt_tokens ?? 0) + (out.usage?.completion_tokens ?? 0);
      const message = out.choices[0].message;
      messages.push(message);
      if (!message.tool_calls?.length) { final = message.content; break; }
      for (const call of message.tool_calls) {
        calls++;
        let text;
        try { text = (await mcp.client.callTool({ name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") })).content.map((c) => c.text ?? "").join("\n"); }
        catch (e) { text = `Tool error: ${e.message}`; }
        messages.push({ role: "tool", tool_call_id: call.id, content: text.slice(0, 20000) });
      }
    }
  } catch (e) { error = e.message; }
  return { id: item.id, template: item.template, ...scoreAnswer(item, final), expected: item.answer.value ?? "not reported", tokens, tool_calls: calls, error };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [itemsFile, outFile] = process.argv.slice(2);
  const model = arg("model", "gpt-5.4-mini"), arm = arg("arm", "closed"), perTemplate = Number(arg("per-template", "30"));
  const items = readFileSync(itemsFile, "utf8").trim().split("\n").map(JSON.parse);
  const sample = stratifiedSample(items, perTemplate, 20260926);
  const mcp = arm === "mcp" ? await mcpClient() : null;
  const runs = [];
  const queue = [...sample];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) runs.push(await runItem(queue.shift(), { model, arm, mcp })); }));
  if (mcp) await mcp.client.close();
  const by = {};
  for (const r of runs) { const s = (by[r.template] ??= { n: 0, correct: 0, tokens: 0 }); s.n++; s.correct += r.correct ? 1 : 0; s.tokens += r.tokens; }
  const summary = { model, arm, items: runs.length, accuracy: runs.filter((r) => r.correct).length / runs.length, behaviour: behaviour(runs), errors: runs.filter((r) => r.error).length, mean_tokens: Math.round(runs.reduce((a, r) => a + r.tokens, 0) / runs.length), by_template: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.n, accuracy: v.correct / v.n, mean_tokens: Math.round(v.tokens / v.n) }])) };
  writeFileSync(outFile, JSON.stringify({ summary, runs }, null, 1));
  console.log(JSON.stringify(summary));
}
