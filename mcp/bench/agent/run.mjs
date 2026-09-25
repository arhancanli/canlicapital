// Agent benchmark runner: gives a model the MCP server's own tools (from a real stdio launch, in
// private local mode so validations use no key and no network) and scores each task on whether the
// model called the right tool, whether its final answer matches the ground truth in tasks.mjs, the
// tokens it spent and the wall time.
//
//   node mcp/bench/agent/run.mjs --model gpt-5.4-mini --repeats 3 [--only dsr,trl] [--max-tokens 1500000]
//
// Models named claude-* go to the Anthropic Messages API, everything else to OpenAI Chat Completions.
// Keys are read from ~/.config/canli/openai_benchmark_key and ~/.config/canli/anthropic_benchmark_key
// and never printed. Results go to mcp/bench/agent/results/<date>-<model>.json with a summary.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveCompanyTruth, score, TASKS } from "./tasks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, "../..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const MODEL = arg("model", "gpt-5.4-mini");
const REPEATS = Number(arg("repeats", "1"));
const ONLY = arg("only", "").split(",").filter(Boolean);
const MAX_TOKENS = Number(arg("max-tokens", "1500000"));
const MAX_TURNS = 8;
const TOOL_TEXT_CAP = 12000;

const SYSTEM = [
  "You are a quantitative research assistant with tools from canlicapital.com.",
  "Use the tools to compute answers; do not estimate numbers yourself when a tool can compute them.",
  "End your reply with one final line of the form 'ANSWER: <value>', where value is a plain number without commas or units, or yes or no.",
].join(" ");

const ANTHROPIC = MODEL.startsWith("claude-");
const keyFile = (name) => readFileSync(resolve(homedir(), ".config/canli", name), "utf8").trim();
const openaiKey = () => keyFile("openai_benchmark_key");
const anthropicKey = () => keyFile("anthropic_benchmark_key");

async function chat(messages, tools) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", max_completion_tokens: 4000 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${body?.error?.message ?? "error"}`);
  return body;
}

// One Anthropic Messages call, returned in the Chat Completions shape runTask reads, so the loop
// and the scoring are identical for every provider. `messages` stays in the OpenAI shape.
async function claude(messages, tools) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const converted = [];
  for (const m of messages) {
    if (m.role === "user") converted.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      const content = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.tool_calls ?? []) content.push({ type: "tool_use", id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments || "{}") });
      converted.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content };
      const last = converted[converted.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else converted.push({ role: "user", content: [block] });
    }
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey(), "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: converted,
      tools: tools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })),
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${body?.error?.message ?? "error"}`);
  const text = body.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const calls = body.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }));
  const u = body.usage ?? {};
  return {
    usage: {
      prompt_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      completion_tokens: u.output_tokens ?? 0,
      prompt_tokens_details: { cached_tokens: u.cache_read_input_tokens ?? 0 },
    },
    choices: [{ message: { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) } }],
  };
}

function toOpenAiTools(mcpTools) {
  return mcpTools.map((t) => {
    const { $schema, ...parameters } = t.inputSchema ?? { type: "object", properties: {} };
    return { type: "function", function: { name: t.name, description: t.description, parameters } };
  });
}

async function runTask(client, tools, task) {
  const started = Date.now();
  const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: task.prompt }];
  const calls = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 };
  let final = null;
  let turns = 0;
  let error = null;
  try {
    while (turns < MAX_TURNS) {
      turns += 1;
      const out = await (ANTHROPIC ? claude : chat)(messages, tools);
      usage.prompt_tokens += out.usage?.prompt_tokens ?? 0;
      usage.completion_tokens += out.usage?.completion_tokens ?? 0;
      usage.cached_tokens += out.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const message = out.choices[0].message;
      messages.push(message);
      if (!message.tool_calls?.length) { final = message.content ?? ""; break; }
      for (const call of message.tool_calls) {
        calls.push(call.function.name);
        let text;
        try {
          const result = await client.callTool({ name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") });
          text = result.content?.map((c) => c.text ?? "").join("\n") ?? "";
        } catch (e) {
          text = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: text.slice(0, TOOL_TEXT_CAP) });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const graded = score(task, final);
  return {
    task: task.id,
    expected_tool: task.tool,
    tools_called: calls,
    right_tool: task.tool === null ? true : calls.includes(task.tool),
    first_tool_right: task.tool === null ? true : calls[0] === task.tool,
    expected: task.expected,
    answer: graded.parsed,
    answered: graded.answered,
    correct: graded.correct,
    turns,
    ...usage,
    ms: Date.now() - started,
    error,
  };
}

function summarize(runs) {
  const n = runs.length;
  const pct = (k) => Math.round((1000 * runs.filter((r) => r[k]).length) / n) / 10;
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
  return {
    runs: n,
    answer_accuracy_pct: pct("correct"),
    right_tool_pct: pct("right_tool"),
    first_tool_right_pct: pct("first_tool_right"),
    errors: runs.filter((r) => r.error).length,
    median_total_tokens: median(runs.map((r) => r.prompt_tokens + r.completion_tokens)),
    mean_total_tokens: Math.round(runs.reduce((a, r) => a + r.prompt_tokens + r.completion_tokens, 0) / n),
    median_ms: median(runs.map((r) => r.ms)),
    total_tokens: runs.reduce((a, r) => a + r.prompt_tokens + r.completion_tokens, 0),
  };
}

const client = new Client({ name: "canli-agent-benchmark", version: "1" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(MCP, "src/server.mjs")], env: { ...process.env, CANLI_LOCAL: "1", CANLI_KEY: "" } }));
const tools = toOpenAiTools((await client.listTools()).tools);
const serverVersion = client.getServerVersion()?.version;

let tasks = TASKS.filter((t) => !ONLY.length || ONLY.some((p) => t.id.startsWith(p)));
tasks = await Promise.all(tasks.map((t) => (t.company ? resolveCompanyTruth(t) : t)));

const runs = [];
let spent = 0;
outer: for (let r = 0; r < REPEATS; r++) {
  for (const task of tasks) {
    if (spent >= MAX_TOKENS) { console.log(`stopping: token cap ${MAX_TOKENS} reached`); break outer; }
    const run = await runTask(client, tools, task);
    run.repeat = r;
    runs.push(run);
    spent += run.prompt_tokens + run.completion_tokens;
    console.log(`${run.task.padEnd(6)} r${r} tool:${run.right_tool ? "ok" : "MISS"} answer:${run.correct ? "ok" : "WRONG"} ${run.prompt_tokens + run.completion_tokens} tok ${run.ms} ms${run.error ? ` ERROR ${run.error}` : ""}`);
  }
}
await client.close();

const summary = summarize(runs);
const out = {
  schema: "canli.mcp-agent-benchmark.v1",
  model: MODEL,
  server: { name: "canli-validation-mcp", version: serverVersion, mode: "local (CANLI_LOCAL=1); company tool reads canlicapital.com" },
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  tasks: tasks.map((t) => t.id),
  repeats: REPEATS,
  summary,
  runs,
};
mkdirSync(resolve(HERE, "results"), { recursive: true });
const file = resolve(HERE, "results", `${out.generated_at.slice(0, 10)}-${MODEL}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(summary));
console.log(`wrote ${file}`);
