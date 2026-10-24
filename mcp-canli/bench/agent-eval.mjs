// Agent eval: the same tasks, answered by the same model, with (A) the six Canli servers as they
// install separately or (B) canli-mcp. Counts correctness, tokens, turns and time per task.
import { readFileSync, writeFileSync } from "node:fs";

import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const MODEL = process.argv[2] ?? "gpt-5.4-mini";
const REPS = Number(process.argv[3] ?? 2);
const ONLY = process.argv[4];
const openai = new OpenAI({ apiKey: readFileSync(`${process.env.HOME}/.config/canli/openai_benchmark_key`, "utf8").trim() });
const ALL = "/private/tmp/claude-501/-Users-arhancanli/34e20b1c-dcbf-43fa-a932-e14c28f2ae69/scratchpad/all/node_modules";
const CANLI = "/Users/arhancanli/canlicapital-canli-20261008/mcp-canli/src/server.mjs";
const env = { PATH: process.env.PATH, HOME: process.env.HOME };
const ARMS = {
  separate: [
    ["quant", `${ALL}/canli-quant-mcp/src/server.mjs`, {}],
    ["validation", `${ALL}/canli-validation-mcp/src/server.mjs`, { CANLI_LOCAL: "1" }],
    ["fundamentals", `${ALL}/canli-fundamentals-mcp/src/server.mjs`, {}],
    ["research", `${ALL}/canli-research-mcp/src/server.mjs`, {}],
    ["backtest", `${ALL}/canli-backtest-mcp/src/server.mjs`, {}],
  ],
  combined: [["canli", CANLI, {}]],
};
const TASKS = JSON.parse(readFileSync(new URL("./tasks.json", import.meta.url), "utf8"));

async function connectArm(arm) {
  const clients = [], tools = [], route = new Map();
  for (const [key, entry, extra] of ARMS[arm]) {
    const c = new Client({ name: "eval", version: "0" });
    await c.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { ...env, ...extra } }));
    clients.push(c);
    const instr = c.getInstructions?.() ?? "";
    for (const t of (await c.listTools()).tools) {
      const name = arm === "separate" ? `${key}__${t.name}` : t.name;
      route.set(name, [c, t.name]);
      tools.push({ name, description: t.description ?? "", input_schema: t.inputSchema });
    }
    if (instr) tools.instructions = `${tools.instructions ?? ""}\n[${key}] ${instr}`;
  }
  return { clients, tools, route };
}

const SYSTEM = "You are a quantitative finance assistant with tools. Always compute with the tools rather than by hand. When you have the result, finish with a line 'ANSWER: <number>'.";

async function runTask(arm, ctx, task) {
  const system = `${SYSTEM}${ctx.tools.instructions ? `\n\nServer instructions:${ctx.tools.instructions}` : ""}`;
  const messages = [{ role: "system", content: system }, { role: "user", content: task.prompt }];
  const tools = ctx.tools.map(({ name, description, input_schema }) => ({ type: "function", function: { name, description: description.slice(0, 1024), parameters: input_schema } }));
  let input = 0, output = 0, turns = 0, calls = 0;
  const t0 = Date.now(), trace = [];
  for (; turns < 12; turns++) {
    const r = await openai.chat.completions.create({ model: MODEL, messages, tools });
    input += r.usage.prompt_tokens; output += r.usage.completion_tokens;
    const msg = r.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      const text = msg.content ?? "";
      const m = text.match(/ANSWER:\s*\$?(-?[\d.,]+(?:e-?\d+)?)\s*(%)?/i);
      let val = m ? Number(m[1].replace(/,/g, "")) : NaN;
      if (m && m[2]) val /= 100;
      return { arm, task: task.id, answer: val, correct: grade(task, val), input, output, turns: turns + 1, calls, seconds: (Date.now() - t0) / 1000, trace, final: text.slice(-400) };
    }
    for (const u of msg.tool_calls) {
      calls++;
      const [c, name] = ctx.route.get(u.function.name) ?? [];
      let content;
      if (!c) content = `No tool ${u.function.name}.`;
      else {
        try { const out = await c.callTool({ name, arguments: JSON.parse(u.function.arguments || "{}") }); content = out.content?.map((x) => x.text ?? "").join("\n") || JSON.stringify(out.structuredContent); if (out.isError) content = `ERROR: ${content}`; }
        catch (e) { content = `ERROR: ${e.message}`; }
      }
      trace.push(`${u.function.name} ${u.function.arguments.slice(0, 300)} => ${content.slice(0, 400)}`);
      messages.push({ role: "tool", tool_call_id: u.id, content: content.slice(0, 60000) });
    }
  }
  return { arm, task: task.id, answer: NaN, correct: false, input, output, turns, calls, seconds: (Date.now() - t0) / 1000, note: "turn cap", trace };
}

function grade(task, v) {
  if (!Number.isFinite(v)) return false;
  return task.truth.some((t) => Math.abs(Math.abs(v) - Math.abs(t)) <= Math.max(task.abs ?? 0, Math.abs(t) * (task.rel ?? 0.01)));
}

const rows = [];
for (const arm of (process.argv[5] ?? "separate,combined").split(",")) {
  const ctx = await connectArm(arm);
  for (const task of TASKS) {
    if (ONLY && !ONLY.split(",").includes(task.id)) continue;
    for (let rep = 0; rep < REPS; rep++) {
      try { const r = await runTask(arm, ctx, task); rows.push(r); console.log(JSON.stringify(r)); }
      catch (e) { console.log(JSON.stringify({ arm, task: task.id, error: e.message })); rows.push({ arm, task: task.id, error: e.message }); }
    }
  }
  for (const c of ctx.clients) await c.close();
}
writeFileSync(`results-${MODEL}-${Date.now()}.json`, JSON.stringify(rows));
for (const arm of ["separate", "combined"]) {
  const r = rows.filter((x) => x.arm === arm && !x.error);
  const sum = (k) => r.reduce((s, x) => s + x[k], 0);
  console.log(`${arm}: correct ${r.filter((x) => x.correct).length}/${r.length}, tokens/task ${Math.round((sum("input") + sum("output")) / r.length)}, turns/task ${(sum("turns") / r.length).toFixed(1)}, seconds/task ${(sum("seconds") / r.length).toFixed(1)}`);
}
