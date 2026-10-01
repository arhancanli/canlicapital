// Scores a model on filing-facts items: closed-book, or with canli-validation-mcp's company tool
// (CANLI_TOOLSETS=company, so the model sees one tool). A stratified sample with a fixed seed; the
// model ends with "ANSWER: <value>" and is scored against the item's recomputed answer.
//   node scripts/datasets/filing-facts/eval.mjs <items.jsonl> <out.json> --arm closed|mcp [--per-template 30] [--model gpt-5.4-mini]
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mulberry32 } from "./generate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const isEntry = () => {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
};

export const SCORING_VERSION = "canli.filing-facts-scoring.v1";
const ABSENCE = /^(?:not reported|not available|no data|does not report|not disclosed|unavailable)[.!]?$/i;
const NUMERIC = /^(\$\s*)?([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(USD|EUR|CAD|GBP|JPY|CHF|AUD|%)?$/i;

// Tolerances: a number within 0.1% relative (a filing states values to the unit, a model may round
// the last digits of a billion-dollar figure), a percent within 0.05 points, a ratio within 0.0005.
export function scoreAnswer(item, text) {
  const line = String(text ?? "").trim().split(/\r?\n/).reverse().find((l) => /^\s*ANSWER:/i.test(l));
  if (!line) return { answered: false, correct: false, parsed: null };
  const raw = line.replace(/^\s*ANSWER:\s*/i, "").trim();
  if (!raw) return { answered: false, correct: false, parsed: null };
  if (ABSENCE.test(raw)) return { answered: true, correct: item.answer.kind === "not_reported", parsed: raw };
  const match = NUMERIC.exec(raw);
  const { kind, unit } = item.answer;
  const value = match ? Number(match[2].replaceAll(",", "")) : NaN;
  if (!Number.isFinite(value)) return { answered: true, correct: false, parsed: raw };
  // Any finite numeric claim on an absence question is an invented number, including units.
  if (kind === "not_reported") return { answered: true, correct: false, parsed: value };
  const suffix = match[3]?.toUpperCase();
  if ((match[1] && (kind !== "number" || unit !== "USD")) ||
    (suffix === "%" && kind !== "percent") ||
    (suffix && suffix !== "%" && (kind !== "number" || suffix !== unit))) {
    return { answered: true, correct: false, parsed: value };
  }
  const truth = item.answer.value;
  const ok = item.answer.kind === "number" ? Math.abs(value - truth) <= Math.max(Math.abs(truth) * 0.001, 0.005)
    : item.answer.kind === "percent" ? Math.abs(value - truth) <= 0.05
      : Math.abs(value - truth) <= 0.0005;
  return { answered: true, correct: ok, parsed: value };
}

const abstained = (r) => typeof r.parsed === "string" && ABSENCE.test(r.parsed);

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
  if (!Number.isSafeInteger(perTemplate) || perTemplate < 1) throw new RangeError("per-template must be a positive safe integer");
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError("seed must be an unsigned 32-bit integer");
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
  const { Client } = await import(resolve(HERE, "../../../mcp/node_modules/@modelcontextprotocol/client/dist/index.mjs"));
  const { StdioClientTransport } = await import(resolve(HERE, "../../../mcp/node_modules/@modelcontextprotocol/client/dist/stdio.mjs"));
  const client = new Client({ name: "filing-facts-eval", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(HERE, "../../../mcp/src/server.mjs")], env: { ...process.env, CANLI_TOOLSETS: "company", CANLI_KEY: "" } }));
  const tools = (await client.listTools()).tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: (({ $schema, ...p }) => p)(t.inputSchema) } }));
  return { client, tools, server_info: client.getServerVersion() ?? null };
}

export async function runItem(item, { model, arm, mcp, request = chat }) {
  const messages = [{ role: "system", content: arm === "mcp" ? SYSTEM_MCP : SYSTEM_CLOSED }, { role: "user", content: item.question }];
  let tokens = 0, final = null, calls = 0, error = null;
  const providerResponses = [], toolTrace = [];
  try {
    for (let turn = 0; turn < 6; turn++) {
      const out = await request(model, messages, arm === "mcp" ? mcp.tools : undefined);
      tokens += (out.usage?.prompt_tokens ?? 0) + (out.usage?.completion_tokens ?? 0);
      providerResponses.push({ response_id: out.id ?? null, model: out.model ?? null, usage: out.usage ?? null });
      const message = out.choices[0].message;
      messages.push(message);
      if (!message.tool_calls?.length) { final = message.content; break; }
      for (const call of message.tool_calls) {
        calls++;
        let text;
        try { text = (await mcp.client.callTool({ name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") })).content.map((c) => c.text ?? "").join("\n"); }
        catch (e) { text = `Tool error: ${e.message}`; }
        const suppliedText = text.slice(0, 20000);
        toolTrace.push({ tool_call_id: call.id, name: call.function.name, arguments: call.function.arguments,
          response_text: suppliedText, truncated: suppliedText.length !== text.length });
        messages.push({ role: "tool", tool_call_id: call.id, content: suppliedText });
      }
    }
    if (final === null) error = "No final response within the six-turn limit";
  } catch (e) { error = e.message; }
  return { id: item.id, response_text: final, tokens, tool_calls: calls, error,
    provider_responses: providerResponses, tool_trace: toolTrace };
}

if (isEntry()) {
  const [itemsFile, outFile] = process.argv.slice(2);
  if (!itemsFile || !outFile) throw new RangeError("usage: eval.mjs items.jsonl out.json --arm closed|mcp [--per-template 30] [--seed 20260926] [--model gpt-5.4-mini]");
  const model = arg("model", "gpt-5.4-mini"), arm = arg("arm", "closed"), perTemplate = Number(arg("per-template", "30")), seed = Number(arg("seed", "20260926"));
  if (!["closed", "mcp"].includes(arm) || !model?.trim()) throw new RangeError("arm must be closed or mcp and model must be nonempty");
  const { CAPTURE_SCHEMA, evaluateCapture, readDataset } = await import("./evidence.mjs");
  const bytes = readFileSync(itemsFile), dataset = readDataset(bytes);
  const sample = stratifiedSample(dataset.items, perTemplate, seed);
  // Refuse an existing output before any API calls; published historical records stay immutable.
  const output = openSync(outFile, "wx", 0o600);
  const startedAt = new Date().toISOString();
  let mcp = null;
  try {
    mcp = arm === "mcp" ? await mcpClient() : null;
    const runs = [];
    const queue = [...sample];
    await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) runs.push(await runItem(queue.shift(), { model, arm, mcp })); }));
    const capture = { schema: CAPTURE_SCHEMA, provider: "openai", model, arm,
      recorded_at: startedAt, completed_at: new Date().toISOString(), dataset_sha256: dataset.sha256,
      sampling: { method: "stratified", seed, per_template: perTemplate, item_ids: sample.map((item) => item.id) },
      system_prompt: arm === "mcp" ? SYSTEM_MCP : SYSTEM_CLOSED,
      ...(mcp ? { tool_contract: { server_info: mcp.server_info, tools: mcp.tools } } : {}), runs };
    const evidence = evaluateCapture(bytes, capture);
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify(evidence.summary));
  } finally {
    closeSync(output);
    if (mcp) await mcp.client.close();
  }
}
