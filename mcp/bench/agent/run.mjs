// Agent benchmark runner: gives a model the MCP server's own tools (from a real stdio launch, in
// private local mode so validations use no key and no network) and scores each task on whether the
// model called the right tool, whether its final answer matches the ground truth in tasks.mjs, the
// tokens it spent and the wall time.
//
//   node mcp/bench/agent/run.mjs --model gpt-5.4-mini --repeats 3 [--only dsr,trl] [--max-tokens 1500000]
//   node mcp/bench/agent/run.mjs --arm plain ...
//
// --arm plain is the control: the same tasks with no Canli Capital tools, only a web fetch (any
// public https URL except canlicapital.com, with the User-Agent SEC's API asks for) and a
// calculator with the normal CDF and its inverse. It measures what the tasks cost an agent without
// this server, so the saving is measured rather than asserted.
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
const ARM = arg("arm", "mcp");
if (!["mcp", "plain"].includes(ARM)) throw new Error("--arm is mcp or plain");
const MAX_TURNS = ARM === "plain" ? 12 : 8;
// The MCP arm's results are small; the plain arm reads raw public data, which is cut only at a size
// a model's context holds, so the control is not made cheaper by truncation it would not get.
const TOOL_TEXT_CAP = ARM === "plain" ? 400000 : 12000;

const SYSTEM = [
  ARM === "plain"
    ? "You are a quantitative research assistant with a web fetch tool (public APIs such as SEC EDGAR's https://data.sec.gov/api/xbrl/) and a calculator."
    : "You are a quantitative research assistant with tools from canlicapital.com.",
  "Use the tools to compute answers; do not estimate numbers yourself when a tool can compute them.",
  "End your reply with one final line of the form 'ANSWER: <value>', where value is a plain number without commas or units, or yes or no.",
].join(" ");

const ANTHROPIC = MODEL.startsWith("claude-");
const keyFile = (name) => readFileSync(resolve(homedir(), ".config/canli", name), "utf8").trim();
const openaiKey = () => keyFile("openai_benchmark_key");
const anthropicKey = () => keyFile("anthropic_benchmark_key");

// A rate-limit refusal (HTTP 429) is waited out and retried: a refused call is not a model's answer,
// and counting it as a wrong one would bias whichever arm sends more tokens a minute.
async function chat(messages, tools) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", max_completion_tokens: 4000 }),
    });
    const body = await res.json();
    if (res.status === 429 && attempt < 12) {
      const hinted = /try again in ([\d.]+)(ms|s)/.exec(body?.error?.message ?? "");
      const wait = hinted ? Number(hinted[1]) * (hinted[2] === "s" ? 1000 : 1) : 0;
      await new Promise((r) => setTimeout(r, Math.max(wait + 500, 5000 * (attempt + 1))));
      continue;
    }
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${body?.error?.message ?? "error"}`);
    return body;
  }
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
  const fetched = [];
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
        if (ARM === "plain") fetched.push(`${call.function.name} ${String(call.function.arguments).slice(0, 300)}`);
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
    // The control has none of the expected tools, so tool choice is not scored there.
    right_tool: ARM === "plain" ? null : task.tool === null ? true : calls.includes(task.tool),
    first_tool_right: ARM === "plain" ? null : task.tool === null ? true : calls[0] === task.tool,
    ...(ARM === "plain" ? { tool_calls: fetched } : {}),
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

// ---------------------------------------------------------------------------------------------
// The plain arm's two tools, behind the same callTool/close interface the MCP client has.
// ---------------------------------------------------------------------------------------------
const PLAIN_TOOLS = [
  { type: "function", function: { name: "http_get", description: "GET a public https URL and return the response body as text.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } } },
  { type: "function", function: { name: "calculate", description: "Evaluate one arithmetic expression. Numbers, + - * / ** ( ), and the functions sqrt, log, exp, abs, pow, min, max, normcdf (standard normal CDF) and norminv (its inverse).", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"], additionalProperties: false } } },
];

async function plainImports() {
  const { normalCdf, normalPpf } = await import("../../../js/dsr-core.js");
  return { normalCdf, normalPpf };
}

function plainClient() {
  const fns = plainImports();
  return {
    async callTool({ name, arguments: args }) {
      if (name === "http_get") {
        const url = new URL(String(args.url));
        if (url.protocol !== "https:") throw new Error("only https URLs");
        if (/(^|\.)canlicapital\.com$/i.test(url.hostname)) throw new Error("canlicapital.com is not available in this arm");
        const res = await fetch(url, { headers: { "User-Agent": "Canli Capital research benchmark (https://canlicapital.com)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
        const text = await res.text();
        return { content: [{ type: "text", text: res.ok ? text : `HTTP ${res.status}: ${text.slice(0, 500)}` }] };
      }
      if (name === "calculate") {
        const expression = String(args.expression);
        // Only numbers, operators, parentheses, commas and the listed function names reach eval.
        const names = expression.match(/[A-Za-z_]+/g) ?? [];
        const allowed = new Set(["sqrt", "log", "exp", "abs", "pow", "min", "max", "normcdf", "norminv", "e", "E"]);
        if (!/^[0-9A-Za-z_+\-*/().,\s]*$/.test(expression) || names.some((n) => !allowed.has(n))) throw new Error("unsupported expression");
        const { normalCdf, normalPpf } = await fns;
        const value = Function("sqrt", "log", "exp", "abs", "pow", "min", "max", "normcdf", "norminv", `"use strict"; return (${expression});`)(Math.sqrt, Math.log, Math.exp, Math.abs, Math.pow, Math.min, Math.max, normalCdf, normalPpf);
        return { content: [{ type: "text", text: String(value) }] };
      }
      throw new Error(`unknown tool ${name}`);
    },
    async close() {},
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

let client;
let tools;
let serverVersion = null;
if (ARM === "plain") {
  client = plainClient();
  tools = PLAIN_TOOLS;
} else {
  client = new Client({ name: "canli-agent-benchmark", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(MCP, "src/server.mjs")], env: { ...process.env, CANLI_LOCAL: "1", CANLI_KEY: "" } }));
  tools = toOpenAiTools((await client.listTools()).tools);
  serverVersion = client.getServerVersion()?.version;
}

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
    console.log(`${run.task.padEnd(6)} r${r} tool:${run.right_tool === null ? "n/a" : run.right_tool ? "ok" : "MISS"} answer:${run.correct ? "ok" : "WRONG"} ${run.prompt_tokens + run.completion_tokens} tok ${run.ms} ms${run.error ? ` ERROR ${run.error}` : ""}`);
  }
}
await client.close();

const summary = summarize(runs);
const out = {
  schema: "canli.mcp-agent-benchmark.v1",
  model: MODEL,
  arm: ARM,
  tool_text_cap_chars: TOOL_TEXT_CAP,
  server: ARM === "plain"
    ? { name: "none (control)", tools: "http_get (canlicapital.com blocked) and calculate" }
    : { name: "canli-validation-mcp", version: serverVersion, mode: "local (CANLI_LOCAL=1); company tool reads canlicapital.com" },
  generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  tasks: tasks.map((t) => t.id),
  repeats: REPEATS,
  summary,
  runs,
};
mkdirSync(resolve(HERE, "results"), { recursive: true });
const file = resolve(HERE, "results", `${out.generated_at.slice(0, 10)}-${MODEL}${ARM === "plain" ? "-plain" : ""}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(summary));
console.log(`wrote ${file}`);
