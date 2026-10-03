// The lab tools end to end, over the real stdio transport: each tool with inline numbers and with a
// file on this machine, the hosted endpoint's refusal to read files, the boundary sentence every
// description and result carries, and the code-generation resources an agent reads before writing
// code (exact schemas, the strategy spec, examples that compile in Python and JavaScript).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpServer } from "@modelcontextprotocol/server";

import { EXAMPLE_ARGS, EXAMPLE_LANGUAGES, LAB_TOOLS, exampleCode, toolBacktestStrategy } from "../src/lab.mjs";
import { LAB_BOUNDARY, LAB_TOOL_DESCRIPTIONS } from "../src/lab-schemas.mjs";
import { createSession, registerTools } from "../src/server.mjs";

const SERVER = fileURLToPath(new URL("../src/server.mjs", import.meta.url));

function walk(n, seed = 1) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const prices = [100];
  for (let i = 1; i < n; i += 1) prices.push(prices.at(-1) * Math.exp(0.0003 + 0.011 * (Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next()))));
  return prices;
}

async function connect(t, env = {}) {
  const client = new Client({ name: "lab-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, CANLI_KEY: "", ...env } }));
  t.after(() => client.close());
  return client;
}

const call = async (client, name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name}: ${result.content?.[0]?.text?.slice(0, 300)}`);
  return result.structuredContent;
};

test("every lab description carries, verbatim, the boundary sentence its result attaches", async (t) => {
  const client = await connect(t, { CANLI_LOCAL: "1" });
  const { tools } = await client.listTools();
  for (const name of LAB_TOOLS) {
    const tool = tools.find((x) => x.name === name);
    assert.ok(tool, `${name} is listed`);
    assert.ok(tool.description.includes(LAB_BOUNDARY[name]), `${name} description carries its boundary sentence`);
    assert.equal(tool.description, LAB_TOOL_DESCRIPTIONS[name]);
  }
  const prices = walk(800, 3);
  const results = {
    backtest_strategy: await call(client, "backtest_strategy", { family: "momentum", grid: { lookback: [20, 60, 120] }, prices }),
    summarize_series: await call(client, "summarize_series", { prices }),
    stress_test: await call(client, "stress_test", { returns: prices.slice(1).map((p, i) => p / prices[i] - 1), paths: 200 }),
    check_feasibility: await call(client, "check_feasibility", EXAMPLE_ARGS.check_feasibility),
  };
  for (const [name, result] of Object.entries(results)) assert.ok(result.limits.includes(LAB_BOUNDARY[name]), `${name} result carries the same sentence`);
});

test("backtest_strategy over stdio: the grid count drives the validation, and the input is fingerprinted", async (t) => {
  const client = await connect(t);
  const prices = walk(1200, 5);
  const out = await call(client, "backtest_strategy", { family: "sma_cross", grid: { fast: [10, 20, 50], slow: [100, 200] }, prices, cost_bps: 5 });
  assert.equal(out.variants.count, 6);
  assert.equal(out.validation.trials_counted, 6);
  assert.ok(out.validation.deflated_sharpe.probability >= 0 && out.validation.deflated_sharpe.probability <= 1);
  assert.match(out.source.input_sha256, /^[0-9a-f]{64}$/);
  assert.match(out.source.computed, /no receipt/);
  const again = await call(client, "backtest_strategy", { family: "sma_cross", grid: { fast: [10, 20, 50], slow: [100, 200] }, prices, cost_bps: 5 });
  assert.deepEqual(again, out, "the same call returns the same result");
});

test("files: a dated CSV is read on this machine, its dates label the result, and only numbers and dates are used", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-lab-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const prices = walk(600, 9);
  const dates = prices.map((_, i) => new Date(Date.UTC(2023, 0, 2) + i * 86400000).toISOString().slice(0, 10));
  const csv = path.join(dir, "prices.csv");
  writeFileSync(csv, ["date,close", ...prices.map((p, i) => `${dates[i]},${p}`)].join("\n"));
  const client = await connect(t, { CANLI_LOCAL: "1" });
  const summary = await call(client, "summarize_series", { series_file: csv, name: "Walk" });
  assert.equal(summary.source.date_column_position, 1);
  assert.equal(summary.source.column_position, 2);
  assert.equal(summary.span.first, dates[0]);
  assert.match(summary.text, new RegExp(`^Walk: 599 daily returns, ${dates[0]} to ${dates.at(-1)}`));
  const bt = await call(client, "backtest_strategy", { family: "breakout", grid: { lookback: [20, 55] }, prices_file: csv });
  assert.equal(bt.window.last_date, dates.at(-1));
  const returnsCsv = path.join(dir, "returns.csv");
  writeFileSync(returnsCsv, prices.slice(1).map((p, i) => String(p / prices[i] - 1)).join("\n"));
  const stress = await call(client, "stress_test", { returns_file: returnsCsv, paths: 150 });
  assert.equal(stress.observations, 599);
});

test("the hosted endpoint refuses to read files, and says what to send instead", async () => {
  const session = createSession({ hosted: { keySource: "shared" }, toolsets: ["lab"] });
  await assert.rejects(() => toolBacktestStrategy(session, { family: "buy_and_hold", prices_file: "/etc/hosts" }), /hosted endpoint cannot read files on your machine; send prices as numbers/);
});

test("exactly one source: inline numbers or a file, never both and never neither", async () => {
  const session = createSession({ toolsets: ["lab"] });
  await assert.rejects(() => toolBacktestStrategy(session, { family: "buy_and_hold" }), /send exactly one of prices or prices_file/);
  await assert.rejects(() => toolBacktestStrategy(session, { family: "buy_and_hold", prices: walk(100), prices_file: "x.csv" }), /send exactly one of prices or prices_file/);
});

test("code resources: exact schemas, the strategy spec, completions, and the live OpenAPI document", async (t) => {
  const client = await connect(t, { CANLI_LOCAL: "1" });
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map((r) => r.uriTemplate).sort(), ["canli://examples/{language}/{tool}", "canli://schemas/{tool}"]);
  const schema = JSON.parse((await client.readResource({ uri: "canli://schemas/backtest_strategy" })).contents[0].text);
  assert.deepEqual(schema.input_schema.properties.family.enum, ["buy_and_hold", "sma_cross", "momentum", "mean_reversion", "breakout"]);
  assert.ok(schema.output_schema);
  const spec = JSON.parse((await client.readResource({ uri: "canli://strategy-spec" })).contents[0].text);
  assert.equal(spec.oneOf.length, 5);
  assert.deepEqual(spec.oneOf.find((f) => f.title === "sma_cross").properties.grid.required, ["fast", "slow"]);
  const done = await client.complete({ ref: { type: "ref/resource", uri: "canli://schemas/{tool}" }, argument: { name: "tool", value: "valid" } });
  assert.ok(done.completion.values.length >= 8 && done.completion.values.every((v) => v.startsWith("valid")));
  const python = (await client.readResource({ uri: "canli://examples/python/check_feasibility" })).contents[0].text;
  assert.match(python, /session\.call_tool\("check_feasibility"/);
});

test("every example's arguments are valid input for its tool", () => {
  const catalog = registerTools(new McpServer({ name: "t", version: "0" }), createSession());
  const placeholders = new Set(["get_receipt", "verify_receipt"]);
  for (const [tool, entry] of Object.entries(catalog)) {
    assert.ok(EXAMPLE_ARGS[tool], `${tool} has example arguments`);
    if (placeholders.has(tool)) continue;
    const args = Object.fromEntries(Object.entries(EXAMPLE_ARGS[tool]).filter(([k]) => !k.endsWith("_note")));
    const parsed = entry.inputSchema.safeParse(args);
    assert.equal(parsed.success, true, `${tool}: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

test("every generated Python and JavaScript example compiles", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-examples-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tools = Object.keys(EXAMPLE_ARGS);
  const pyChecks = tools.map((tool) => `ast.parse(${JSON.stringify(exampleCode("python", tool))})`).join("\n");
  execFileSync("python3", ["-c", `import ast\n${pyChecks}\nprint("ok")`], { stdio: "pipe" });
  for (const tool of tools) {
    const file = path.join(dir, `${tool}.mjs`);
    writeFileSync(file, exampleCode("javascript", tool));
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    const curl = exampleCode("curl", tool);
    assert.ok(curl.includes("curl -sS https://canlicapital.com/mcp") || curl.includes("reads a file on your machine"), tool);
  }
  assert.deepEqual([...EXAMPLE_LANGUAGES], ["python", "javascript", "curl"]);
});
