// Rival benchmark: the same questions, model, system prompt, turn limit and tool-result cap for
// every arm; only the MCP servers differ. Appends one JSON line per run to results.jsonl, so an
// interrupted run resumes where it stopped.
//   node run.mjs [model] [reps] [arm,arm,...]
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { execSync } from "node:child_process";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { ARMS } from "./arms.mjs";

const MODEL = process.argv[2] ?? "gpt-5.4-mini";
const REPS = Number(process.argv[3] ?? 2);
const ONLY = process.argv[4]?.split(",");
const OUT = new URL(process.env.OUT ?? "./results.jsonl", import.meta.url);
// SET=fresh runs the held-out questions (tasks_fresh.json, truth_fresh.json).
const SUFFIX = process.env.SET ? `_${process.env.SET}` : "";
const TASKS = JSON.parse(readFileSync(new URL(`./tasks${SUFFIX}.json`, import.meta.url), "utf8")).filter((t) => !process.env.TASKS || process.env.TASKS.split(",").includes(t.id));
const TRUTH = JSON.parse(readFileSync(new URL(`./truth${SUFFIX}.json`, import.meta.url), "utf8"));
// claude-* models run on the Anthropic API, others on OpenAI; the same tools, prompt and limits.
const CLAUDE = MODEL.startsWith("claude-");
const key = (name) => readFileSync(`${process.env.HOME}/.config/canli/${name}`, "utf8").trim();
// MOCK_LLM=1 replaces the model with one that calls the arm's first tool once, then answers: it
// checks the loop, the MCP plumbing and the scoring without spending anything.
const MOCK = process.env.MOCK_LLM === "1";
let mockStep = 0;
const mockOpenAI = { chat: { completions: { create: async ({ tools }) => (mockStep++ % 2 === 0
  ? { usage: { prompt_tokens: 10, completion_tokens: 1 }, choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: tools[0].function.name, arguments: "{}" } }] } }] }
  : { usage: { prompt_tokens: 10, completion_tokens: 1 }, choices: [{ message: { role: "assistant", content: "ANSWER: 1" } }] }) } } };
const mockAnthropic = { messages: { create: async ({ tools }) => (mockStep++ % 2 === 0
  ? { stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 1 }, content: [{ type: "tool_use", id: "t1", name: tools[0].name, input: {} }] }
  : { stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 1 }, content: [{ type: "text", text: "ANSWER: 1" }] }) } };
const openai = CLAUDE ? null : MOCK ? mockOpenAI : new OpenAI({ maxRetries: 8, apiKey: key("openai_benchmark_key") });
const anthropic = !CLAUDE ? null : MOCK ? mockAnthropic : new Anthropic({ maxRetries: 8, apiKey: key("anthropic_benchmark_key") });
const RESULT_CAP = 30000;
const MAX_TURNS = 12;
const SYSTEM = "You are a financial research assistant with tools. Today is 2026-10-09. Get every figure from the tools, not from memory, and compute with the tools where you can. When you have the result, finish with one line 'ANSWER: <number>' in the units the question asks for.";

// Finished runs are skipped on a resume; runs the harness could not finish are tried again.
// Read without checking first: a check and a later append are two looks at a file that can change in between.
const prior = (() => { try { return readFileSync(OUT, "utf8"); } catch { return ""; } })();
const done = new Set(prior.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.harness_error).map((r) => `${r.model}|${r.arm}|${r.task}|${r.rep}`));
// BUDGET_TOKENS with BUDGET_FILE caps the tokens (input plus output) spent across processes in one
// night, so an unattended run stays inside the free daily allowance: exit 4 when it is reached.
const BUDGET = Number(process.env.BUDGET_TOKENS ?? 0), BUDGET_FILE = process.env.BUDGET_FILE;
const used = () => { try { return Number(readFileSync(BUDGET_FILE, "utf8")) || 0; } catch { return 0; } };
// An account without credit fails every request; stop instead of recording failures.
const outOfCredit = (err) => /no credits remaining|insufficient_quota|exceeded your current quota|credit balance is too low/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);

// OpenAI requires an object schema; some servers send none or a bare one.
function params(schema) {
  const s = schema && typeof schema === "object" ? { ...schema } : {};
  delete s.$schema;
  if (s.type !== "object") return { type: "object", properties: {} };
  if (!s.properties) s.properties = {};
  return s;
}

async function connectArm(arm) {
  const clients = [], tools = [], claudeTools = [], route = new Map();
  let instructions = "";
  for (const [key, command, args, env] of ARMS[arm]) {
    const c = new Client({ name: "rival-bench", version: "0" });
    await c.connect(new StdioClientTransport({ command, args, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stderr: "ignore" }));
    clients.push(c);
    const instr = c.getInstructions?.() ?? "";
    if (instr) instructions += `\n[${key}] ${instr}`;
    for (const t of (await c.listTools()).tools) {
      const name = ARMS[arm].length > 1 ? `${key}__${t.name}` : t.name;
      route.set(name, [c, t.name]);
      tools.push({ type: "function", function: { name: name.slice(0, 64), description: (t.description ?? "").slice(0, 1024), parameters: params(t.inputSchema) } });
      claudeTools.push({ name: name.slice(0, 64), description: (t.description ?? "").slice(0, 1024), input_schema: params(t.inputSchema) });
    }
  }
  return { clients, tools, claudeTools, route, instructions };
}

const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
export function parseAnswer(text) {
  const m = String(text).match(/ANSWER:\s*\$?\s*(-?[\d,]*\.?\d+(?:e-?\d+)?)\s*(%|thousand|million|billion|trillion)?/i);
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ""));
  if (m[2] && SCALE[m[2].toLowerCase()]) v *= SCALE[m[2].toLowerCase()];
  return Number.isFinite(v) ? v : null;
}
export function grade(task, value) {
  if (value == null) return false;
  const truth = TRUTH[task.truth];
  const v = task.absval ? Math.abs(value) : value, t = task.absval ? Math.abs(truth) : truth;
  if (task.abs !== undefined) return Math.abs(v - t) <= task.abs + 1e-12;
  if (!task.rel) return v === t;
  return Math.abs(v - t) <= task.rel * Math.abs(t);
}

// Runs one tool call through its MCP server; returns the text the model sees (capped).
async function callTool(ctx, name, args) {
  let text, error = false;
  const target = ctx.route.get(name);
  try {
    if (!target) throw new Error(`no tool ${name}`);
    const res = await target[0].callTool({ name: target[1], arguments: args ?? {} }, undefined, { timeout: 180000 });
    text = (res.content ?? []).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n") || JSON.stringify(res.structuredContent ?? {});
    error = Boolean(res.isError);
  } catch (err) {
    error = true;
    text = `Error: ${err.message}`;
  }
  if (text.length > RESULT_CAP) text = `${text.slice(0, RESULT_CAP)}\n[truncated: ${text.length} characters in all]`;
  return { text, error };
}

// The Anthropic Messages API loop: tool_use blocks in, one user message of tool_result blocks out.
async function runTaskClaude(ctx, task) {
  const system = SYSTEM + (ctx.instructions ? `\n\nServer instructions:${ctx.instructions}` : "");
  const messages = [{ role: "user", content: task.prompt }];
  let input = 0, cached = 0, output = 0, calls = 0, errors = 0, turns = 0;
  const t0 = Date.now(), trace = [];
  for (; turns < MAX_TURNS; turns++) {
    const r = await anthropic.messages.create({ model: MODEL, max_tokens: 16000, system, tools: ctx.claudeTools, messages, cache_control: { type: "ephemeral" } });
    const u = r.usage ?? {};
    input += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    cached += u.cache_read_input_tokens ?? 0; output += u.output_tokens ?? 0;
    messages.push({ role: "assistant", content: r.content });
    if (r.stop_reason === "pause_turn") continue;
    const uses = r.content.filter((b) => b.type === "tool_use");
    if (!uses.length || r.stop_reason === "end_turn") {
      const text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const value = parseAnswer(text);
      return { value, correct: grade(task, value), final: text.slice(-400), input, cached, output, turns: turns + 1, calls, errors, seconds: (Date.now() - t0) / 1000, trace };
    }
    const results = [];
    for (const b of uses) {
      calls++;
      const { text, error } = await callTool(ctx, b.name, b.input);
      if (error) errors++;
      trace.push([b.name, JSON.stringify(b.input).slice(0, 300), text.slice(0, 200)]);
      results.push({ type: "tool_result", tool_use_id: b.id, content: text, ...(error ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { value: null, correct: false, final: "turn limit", input, cached, output, turns, calls, errors, seconds: (Date.now() - t0) / 1000, trace };
}

async function runTask(ctx, task) {
  if (CLAUDE) return runTaskClaude(ctx, task);
  const system = SYSTEM + (ctx.instructions ? `\n\nServer instructions:${ctx.instructions}` : "");
  const messages = [{ role: "system", content: system }, { role: "user", content: task.prompt }];
  let input = 0, cached = 0, output = 0, calls = 0, errors = 0, turns = 0;
  const t0 = Date.now(), trace = [];
  for (; turns < MAX_TURNS; turns++) {
    const r = await openai.chat.completions.create({ model: MODEL, messages, tools: ctx.tools });
    input += r.usage.prompt_tokens; cached += r.usage.prompt_tokens_details?.cached_tokens ?? 0; output += r.usage.completion_tokens;
    const msg = r.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      const value = parseAnswer(msg.content ?? "");
      return { value, correct: grade(task, value), final: (msg.content ?? "").slice(-400), input, cached, output, turns: turns + 1, calls, errors, seconds: (Date.now() - t0) / 1000, trace };
    }
    for (const tc of msg.tool_calls) {
      calls++;
      let args;
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = null; }
      const { text, error } = args === null ? { text: "Error: arguments are not valid JSON", error: true } : await callTool(ctx, tc.function.name, args);
      if (error) errors++;
      trace.push([tc.function.name, tc.function.arguments.slice(0, 300), text.slice(0, 200)]);
      messages.push({ role: "tool", tool_call_id: tc.id, content: text });
    }
  }
  return { value: null, correct: false, final: "turn limit", input, cached, output, turns, calls, errors, seconds: (Date.now() - t0) / 1000, trace };
}

// Which code our arms ran: the commits of canli-mcp and the canli-markets-mcp it links to.
const head = (dir) => { try { return execSync(`git -C "${dir}" rev-parse --short HEAD`, { encoding: "utf8" }).trim() + (execSync(`git -C "${dir}" status --porcelain -- src package.json`, { encoding: "utf8" }).trim() ? "+dirty" : ""); } catch { return null; } };
const CODE = { canli_mcp: head(new URL("../..", import.meta.url).pathname), markets: head(new URL("../../node_modules/canli-markets-mcp/", import.meta.url).pathname) };

for (const arm of Object.keys(ARMS).filter((a) => !ONLY || ONLY.includes(a))) {
  const todo = TASKS.flatMap((task) => Array.from({ length: REPS }, (_, rep) => [task, rep])).filter(([task, rep]) => !done.has(`${MODEL}|${arm}|${task.id}|${rep}`));
  if (!todo.length) continue;
  const t0 = Date.now();
  const ctx = await connectArm(arm);
  console.log(`ARM ${arm}: ${ctx.tools.length} tools, connected in ${Date.now() - t0} ms; ${todo.length} runs`);
  for (const [task, rep] of todo) {
    if (BUDGET && BUDGET_FILE && used() >= BUDGET) { console.log(`BUDGET_REACHED ${used()} of ${BUDGET} tokens`); for (const c of ctx.clients) await c.close().catch(() => {}); process.exit(4); }
    let r;
    try { r = await runTask(ctx, task); } catch (err) {
      if (outOfCredit(err)) { console.log(`OUT_OF_CREDIT at ${arm} ${task.id} #${rep}: ${err.message}`); for (const c of ctx.clients) await c.close().catch(() => {}); process.exit(3); }
      r = { value: null, correct: false, final: `harness error: ${err.message}`, harness_error: true };
    }
    appendFileSync(OUT, `${JSON.stringify({ model: MODEL, arm, task: task.id, cat: task.cat, rep, truth: TRUTH[task.truth], ...(arm.startsWith("canli") ? { code: CODE } : {}), ...r })}\n`);
    if (BUDGET_FILE) writeFileSync(BUDGET_FILE, String(used() + (r.input ?? 0) + (r.output ?? 0)));
    console.log(`${arm} ${task.id} #${rep}: ${r.correct ? "OK " : "BAD"} ${r.value} (truth ${TRUTH[task.truth]}) ${r.turns ?? "-"}t ${r.input ?? "-"}in ${r.seconds ?? "-"}s`);
  }
  for (const c of ctx.clients) await c.close().catch(() => {});
}
console.log("RUN_DONE");
