// Rival benchmark: the same questions, model, system prompt, turn limit and tool-result cap for
// every arm; only the MCP servers differ. Appends one JSON line per run to results.jsonl, so an
// interrupted run resumes where it stopped.
//   node run.mjs [model] [reps] [arm,arm,...]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { execSync } from "node:child_process";

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
const openai = new OpenAI({ maxRetries: 8, apiKey: readFileSync(`${process.env.HOME}/.config/canli/openai_benchmark_key`, "utf8").trim() });
const RESULT_CAP = 30000;
const MAX_TURNS = 12;
const SYSTEM = "You are a financial research assistant with tools. Today is 2026-10-09. Get every figure from the tools, not from memory, and compute with the tools where you can. When you have the result, finish with one line 'ANSWER: <number>' in the units the question asks for.";

// Finished runs are skipped on a resume; runs the harness could not finish are tried again.
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.harness_error).map((r) => `${r.model}|${r.arm}|${r.task}|${r.rep}`) : []);
// BUDGET_TOKENS with BUDGET_FILE caps the tokens (input plus output) spent across processes in one
// night, so an unattended run stays inside the free daily allowance: exit 4 when it is reached.
const BUDGET = Number(process.env.BUDGET_TOKENS ?? 0), BUDGET_FILE = process.env.BUDGET_FILE;
const used = () => { try { return Number(readFileSync(BUDGET_FILE, "utf8")) || 0; } catch { return 0; } };
// An account without credit fails every request; stop instead of recording failures.
const outOfCredit = (err) => /no credits remaining|insufficient_quota|exceeded your current quota/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);

// OpenAI requires an object schema; some servers send none or a bare one.
function params(schema) {
  const s = schema && typeof schema === "object" ? { ...schema } : {};
  delete s.$schema;
  if (s.type !== "object") return { type: "object", properties: {} };
  if (!s.properties) s.properties = {};
  return s;
}

async function connectArm(arm) {
  const clients = [], tools = [], route = new Map();
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
    }
  }
  return { clients, tools, route, instructions };
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

async function runTask(ctx, task) {
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
      let text;
      const target = ctx.route.get(tc.function.name);
      try {
        if (!target) throw new Error(`no tool ${tc.function.name}`);
        const res = await target[0].callTool({ name: target[1], arguments: JSON.parse(tc.function.arguments || "{}") }, undefined, { timeout: 180000 });
        text = (res.content ?? []).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n") || JSON.stringify(res.structuredContent ?? {});
        if (res.isError) errors++;
      } catch (err) {
        errors++;
        text = `Error: ${err.message}`;
      }
      if (text.length > RESULT_CAP) text = `${text.slice(0, RESULT_CAP)}\n[truncated: ${text.length} characters in all]`;
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
