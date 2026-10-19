// One question, one model, one arm's tools: the agent loop, with its tokens, dollars and a trace of the
// tool calls. The same system prompt, turn limit, tool-result cap and temperature for every arm; only
// the tools differ ("none" has no tools, so the model answers from what it knows). The prompt follows
// Vals' own harness (github.com/vals-ai/finance-agent, finance_agent/prompt.py): answer as of the set's
// date, show the reasoning and calculations, two decimal places, sources at the end.
import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { ARMS } from "../arms.mjs";
import { costOf } from "./prices.mjs";

export const RESULT_CAP = 30000;
const key = (name) => readFileSync(`${process.env.HOME}/.config/canli/${name}`, "utf8").trim();

// claude-* on the Anthropic API, others on OpenAI; "mock" answers from the item's mock_answer after one
// tool call, to check the loop, the MCP plumbing and the grading without keys or spend.
export function modelClient(model) {
  if (model === "mock") return { kind: "mock", model };
  if (model.startsWith("claude-")) return { kind: "anthropic", model, api: new Anthropic({ maxRetries: 8, apiKey: key("anthropic_benchmark_key") }) };
  return { kind: "openai", model, api: new OpenAI({ maxRetries: 8, apiKey: key("openai_benchmark_key") }) };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

export function systemPrompt(item, ctx) {
  const tools = ctx.tools.length > 0;
  return [
    tools ? "You are a financial agent. You are given a question and you need to answer it using the tools provided." : "You are a financial agent. You are given a question and you need to answer it. You have no tools: answer from what you know.",
    "You will not be able to interact with the user or ask for clarification.",
    item.asOf ? `Answer as if the current date is ${longDate(item.asOf)}: use only information published by then.` : null,
    tools ? "Get every figure from the tools, not from memory." : null,
    "Include the reasoning, calculations and figures behind your answer. Give calculated answers to at least two decimal places, and round only the final answer.",
    "End with the sources you used, each with its name and URL.",
  ].filter(Boolean).join("\n") + (ctx.instructions ? `\n\nServer instructions:${ctx.instructions}` : "");
}

// OpenAI requires an object schema; some servers send none or a bare one.
function params(schema) {
  const s = schema && typeof schema === "object" ? { ...schema } : {};
  delete s.$schema;
  if (s.type !== "object") return { type: "object", properties: {} };
  if (!s.properties) s.properties = {};
  return s;
}

export async function connectArm(arm) {
  const ctx = { arm, clients: [], tools: [], claudeTools: [], route: new Map(), instructions: "" };
  if (arm === "none") return ctx;
  if (!ARMS[arm]) throw new Error(`Unknown arm ${arm}: none, ${Object.keys(ARMS).join(", ")}.`);
  for (const [name, command, args, env] of ARMS[arm]) {
    const c = new Client({ name: "canli-external-bench", version: "0" });
    await c.connect(new StdioClientTransport({ command, args, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stderr: "ignore" }));
    ctx.clients.push(c);
    const instr = c.getInstructions?.() ?? "";
    if (instr) ctx.instructions += `\n[${name}] ${instr}`;
    for (const t of (await c.listTools()).tools) {
      const full = (ARMS[arm].length > 1 ? `${name}__${t.name}` : t.name).slice(0, 64);
      ctx.route.set(full, [c, t.name]);
      ctx.tools.push({ type: "function", function: { name: full, description: (t.description ?? "").slice(0, 1024), parameters: params(t.inputSchema) } });
      ctx.claudeTools.push({ name: full, description: (t.description ?? "").slice(0, 1024), input_schema: params(t.inputSchema) });
    }
  }
  return ctx;
}

export async function closeArm(ctx) {
  for (const c of ctx.clients) await c.close().catch(() => {});
}

// One tool call through its MCP server: the text the model sees, capped.
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

const STOP = { turns: "turn limit", cost: "question cost cap", time: "time limit" };

// The loop for any of the three clients. Returns the final answer text (null when the loop stopped
// first), with usage { input, cache_read, cache_write, output }, dollars and a trace of tool calls.
export async function answer(client, ctx, item, { maxTurns = 50, maxQuestionUsd = 3, timeoutMs = 20 * 60000, env = process.env } = {}) {
  const t0 = Date.now(), trace = [];
  const usage = { input: 0, cache_read: 0, cache_write: 0, output: 0 };
  let turns = 0, calls = 0, errors = 0, mockUsd = 0;
  const cost = () => (client.kind === "mock" ? mockUsd : costOf(client.model, usage, env));
  const done = (text, stopped = null) => ({ answer: text, stopped, turns, calls, errors, usage, cost_usd: Number(cost().toFixed(6)), seconds: (Date.now() - t0) / 1000, trace });
  const system = systemPrompt(item, ctx);
  const messages = client.kind === "openai" ? [{ role: "system", content: system }, { role: "user", content: item.question }] : [{ role: "user", content: item.question }];
  for (; turns < maxTurns; turns++) {
    if (cost() > maxQuestionUsd) return done(null, STOP.cost);
    if (Date.now() - t0 > timeoutMs) return done(null, STOP.time);
    if (client.kind === "mock") {
      // One call to the arm's first tool, then the item's prepared answer; MOCK_COST_USD is charged
      // per answer so the budget guard can be tested.
      if (turns === 0 && ctx.tools.length) {
        calls++;
        const { text, error } = await callTool(ctx, ctx.tools[0].function.name, {});
        if (error) errors++;
        trace.push([ctx.tools[0].function.name, "{}", text.slice(0, 300)]);
        continue;
      }
      mockUsd = Number(env.MOCK_COST_USD ?? 0);
      turns++;
      return done(item.mock_answer ?? "No answer.");
    }
    if (client.kind === "anthropic") {
      const r = await client.api.messages.create({ model: client.model, max_tokens: 16000, temperature: 0, system, ...(ctx.claudeTools.length ? { tools: ctx.claudeTools } : {}), messages, cache_control: { type: "ephemeral" } });
      const u = r.usage ?? {};
      usage.input += u.input_tokens ?? 0; usage.cache_read += u.cache_read_input_tokens ?? 0; usage.cache_write += u.cache_creation_input_tokens ?? 0; usage.output += u.output_tokens ?? 0;
      messages.push({ role: "assistant", content: r.content });
      if (r.stop_reason === "pause_turn") continue;
      const uses = r.content.filter((b) => b.type === "tool_use");
      if (!uses.length || r.stop_reason === "end_turn") { turns++; return done(r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")); }
      const results = [];
      for (const b of uses) {
        calls++;
        const { text, error } = await callTool(ctx, b.name, b.input);
        if (error) errors++;
        trace.push([b.name, JSON.stringify(b.input).slice(0, 300), text.slice(0, 300)]);
        results.push({ type: "tool_result", tool_use_id: b.id, content: text, ...(error ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    // OpenAI chat completions; reasoning models take no temperature.
    const r = await client.api.chat.completions.create({ model: client.model, messages, ...(ctx.tools.length ? { tools: ctx.tools } : {}) });
    const cached = r.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    usage.input += (r.usage?.prompt_tokens ?? 0) - cached; usage.cache_read += cached; usage.output += r.usage?.completion_tokens ?? 0;
    const msg = r.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) { turns++; return done(msg.content ?? ""); }
    for (const tc of msg.tool_calls) {
      calls++;
      let args;
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = null; }
      const { text, error } = args === null ? { text: "Error: arguments are not valid JSON", error: true } : await callTool(ctx, tc.function.name, args);
      if (error) errors++;
      trace.push([tc.function.name, (tc.function.arguments ?? "").slice(0, 300), text.slice(0, 300)]);
      messages.push({ role: "tool", tool_call_id: tc.id, content: text });
    }
  }
  return done(null, STOP.turns);
}
