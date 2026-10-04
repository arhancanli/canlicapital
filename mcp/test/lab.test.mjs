// The lab tools end to end, over the real stdio transport: each tool with inline numbers and with a
// file on this machine, the hosted endpoint's refusal to read files, the boundary sentence every
// description and result carries, and the code-generation resources an agent reads before writing
// code (exact schemas, the strategy spec, examples that compile in Python and JavaScript).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("the tool list and canli://schemas carry the same lean schemas, and zod still validates", async (t) => {
  const client = await connect(t, { CANLI_LOCAL: "1", CANLI_TOOLSETS: "all" });
  const { tools } = await client.listTools();
  assert.doesNotMatch(JSON.stringify(tools), /9007199254740991|"propertyNames":\{"type":"string"\}|"additionalProperties":\{\}/);
  for (const tool of tools) {
    const served = JSON.parse((await client.readResource({ uri: `canli://schemas/${tool.name}` })).contents[0].text);
    assert.deepEqual(served.input_schema, tool.inputSchema, tool.name);
    assert.deepEqual(served.output_schema, tool.outputSchema, tool.name);
  }
  const refused = await client.callTool({ name: "check_leakage", arguments: { action: "plan", observations: 252.5 } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /observations/);
});

test("every example's arguments are valid input for its tool", () => {
  const catalog = registerTools(new McpServer({ name: "t", version: "0" }), createSession());
  const placeholders = new Set(["verify_receipt"]);
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

test("check_leakage: a plan, the caller's reruns on each prefix, and a compare that finds shift(-2) but passes a trailing average", async () => {
  const { toolCheckLeakage } = await import("../src/lab.mjs");
  const session = { hosted: false };
  const plan = JSON.parse((await toolCheckLeakage(session, { action: "plan", observations: 400, prefixes: 4, seed: 11 })).content[0].text);
  assert.equal(plan.cuts.length, 4);
  assert.equal(plan.seed, 11);
  const prices = Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 7) * 5 + i * 0.05);
  // Each "signal" is the caller's own code, run on whatever rows it is given.
  const trailingMean = (xs) => xs.map((_, i) => (i < 9 ? null : xs.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10));
  const forwardReturn = (xs) => xs.map((x, i) => (i + 2 < xs.length ? xs[i + 2] / x - 1 : null));
  const run = (fn) => ({ full: fn(prices), prefixes: plan.cuts.map((c) => fn(prices.slice(0, c))) });
  const out = JSON.parse((await toolCheckLeakage(session, { action: "compare", cuts: plan.cuts, columns: { sma10: run(trailingMean), fwd2: run(forwardReturn) } })).content[0].text);
  assert.equal(out.verdict, "lookahead_found");
  assert.deepEqual(out.flagged_columns, ["fwd2"]);
  assert.equal(out.columns.fwd2.pattern, "future_rows");
  assert.equal(out.columns.fwd2.horizon_rows, 2);
  assert.equal(out.columns.sma10.verdict, "no_lookahead_found");
  assert.match(out.plain_reading, /Lookahead in 1 of 2 columns \(fwd2\)/);
  assert.ok(out.limits.length >= 2);
  assert.match(out.source.input_sha256, /^[0-9a-f]{64}$/, "the result names exactly what it compared");
  const sma = run(trailingMean);
  const again = JSON.parse((await toolCheckLeakage(session, { action: "compare", cuts: plan.cuts, columns: { sma10: sma } })).content[0].text);
  sma.full[0] = 1;
  const edited = JSON.parse((await toolCheckLeakage(session, { action: "compare", cuts: plan.cuts, columns: { sma10: sma } })).content[0].text);
  assert.notEqual(again.source.input_sha256, edited.source.input_sha256);
});

test("check_leakage: columns_file reads what a Python script wrote, NaN included, and never echoes a wrong file", async (t) => {
  const { toolCheckLeakage } = await import("../src/lab.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "leakage-file-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cuts = [120, 150];
  const prices = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 5) * 4 + i * 0.1);
  const lagged = (xs) => xs.map((x, i) => (i < 3 ? Number.NaN : x / xs[i - 3] - 1));
  const leaked = (xs) => xs.map((x, i) => (i + 1 < xs.length ? xs[i + 1] / x - 1 : Number.NaN));
  const run = (fn) => ({ full: fn(prices), prefixes: cuts.map((c) => fn(prices.slice(0, c))) });
  const columns = { mom3: run(lagged), fwd1: run(leaked) };
  // As json.dump writes it: NaN for a missing value.
  const file = path.join(dir, "columns.json");
  writeFileSync(file, JSON.stringify({ cuts, columns }, (_, v) => (Number.isNaN(v) ? "__NAN__" : v)).replaceAll('"__NAN__"', "NaN"));
  const fromFile = JSON.parse((await toolCheckLeakage({}, { action: "compare", columns_file: file })).content[0].text);
  assert.deepEqual(fromFile.flagged_columns, ["fwd1"]);
  assert.equal(fromFile.columns.fwd1.horizon_rows, 1);
  assert.equal(fromFile.source.columns_file, file);
  const nulls = (c) => ({ full: c.full.map((v) => (Number.isNaN(v) ? null : v)), prefixes: c.prefixes.map((r) => r.map((v) => (Number.isNaN(v) ? null : v))) });
  const inline = JSON.parse((await toolCheckLeakage({}, { action: "compare", cuts, columns: { mom3: nulls(columns.mom3), fwd1: nulls(columns.fwd1) } })).content[0].text);
  assert.deepEqual(inline.columns, fromFile.columns);
  assert.equal(inline.source.input_sha256, fromFile.source.input_sha256, "the same numbers, the same digest");

  await assert.rejects(() => toolCheckLeakage({ hosted: { keySource: "shared" } }, { action: "compare", columns_file: file }), /hosted endpoint cannot read files/);
  await assert.rejects(() => toolCheckLeakage({}, { action: "compare", columns_file: file, columns: {} }), /send columns or columns_file, not both/);
  await assert.rejects(() => toolCheckLeakage({}, { action: "compare", columns_file: file, cuts: [120, 151] }), /cuts sent differ/);
  const secret = path.join(dir, "secret.json");
  writeFileSync(secret, JSON.stringify({ columns: { api_token: "hunter2-value" } }));
  await assert.rejects(() => toolCheckLeakage({}, { action: "compare", cuts, columns_file: secret }), (error) => /column 1 is not/.test(error.message) && !/hunter2|api_token/.test(error.message));
  writeFileSync(secret, "password=hunter2-value");
  await assert.rejects(() => toolCheckLeakage({}, { action: "compare", cuts, columns_file: secret }), (error) => /does not parse as JSON/.test(error.message) && !/hunter2/.test(error.message));
  writeFileSync(secret, JSON.stringify({ columns: { x: { full: ["hunter2-value"], prefixes: [[], []] } } }));
  await assert.rejects(() => toolCheckLeakage({}, { action: "compare", cuts, columns_file: secret }), (error) => /column 1, full\[0\] is not a finite number or null/.test(error.message) && !/hunter2/.test(error.message));
});

test("placebo_test: plan writes the real panel and reordered placebos side by side; compare ranks the real result", async (t) => {
  const { toolPlaceboTest } = await import("../src/lab.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "placebo-in-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // As pandas writes it: an unnamed index, a date column, then three assets.
  const rows = 80;
  const assets = [walk(rows, 1), walk(rows, 2).map((p) => p * 2), walk(rows, 3).map((p) => p / 3)];
  const dates = Array.from({ length: rows }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
  const file = path.join(dir, "prices.csv");
  writeFileSync(file, [",date,AAA,BBB,CCC", ...dates.map((d, i) => `${i},${d},${assets.map((a) => a[i]).join(",")}`)].join("\n"));
  const plan = JSON.parse((await toolPlaceboTest({}, { action: "plan", data_file: file, seed: 7 })).content[0].text);
  t.after(() => rmSync(plan.dir, { recursive: true, force: true }));
  assert.equal(plan.method, "permute");
  assert.equal(plan.real, "real.csv");
  assert.equal(plan.files.length, 19);
  assert.deepEqual(plan.source.skipped_row_counter_columns, [1]);
  assert.equal(plan.source.date_column_position, 2);
  const read = (name) => readFileSync(path.join(plan.dir, name), "utf8").trim().split("\n").map((line) => line.split(","));
  const real = read("real.csv");
  assert.deepEqual(real[0], ["date", "AAA", "BBB", "CCC"]);
  for (const name of plan.files) {
    const placebo = read(name);
    assert.deepEqual(placebo.map((r) => r[0]), real.map((r) => r[0]), "the header and dates stay in order");
    assert.deepEqual(placebo[1], real[1], "every column starts at its real first price");
    for (let c = 1; c <= 3; c++) assert.ok(Math.abs(Number(placebo[rows][c]) / Number(real[rows][c]) - 1) < 1e-9, "and a permutation ends at its real last price");
  }
  const again = JSON.parse((await toolPlaceboTest({}, { action: "plan", data_file: file, seed: 7 })).content[0].text);
  t.after(() => rmSync(again.dir, { recursive: true, force: true }));
  assert.notEqual(again.dir, plan.dir, "every plan writes to a new folder");
  assert.equal(readFileSync(path.join(again.dir, "placebo_001.csv"), "utf8"), readFileSync(path.join(plan.dir, "placebo_001.csv"), "utf8"), "the same seed gives the same placebos");
  assert.equal(again.source.input_sha256, plan.source.input_sha256);

  const results = Array.from({ length: 19 }, (_, k) => k / 10);
  const won = JSON.parse((await toolPlaceboTest({}, { action: "compare", real: 2.5, placebo_results: results })).content[0].text);
  assert.equal(won.verdict, "beats_placebos");
  assert.equal(won.p_value, 0.05);
  assert.match(won.plain_reading, /beat all 19 placebos: p = 0.05, the smallest 19 placebos can give; 99 placebos give a finer p/);
  const lost = JSON.parse((await toolPlaceboTest({}, { action: "compare", real: 0.95, placebo_results: results })).content[0].text);
  assert.equal(lost.verdict, "within_placebo_range");
  assert.equal(lost.as_good_as_real, 9);
  assert.equal(lost.p_value, 0.5);
  const drawdown = JSON.parse((await toolPlaceboTest({}, { action: "compare", real: -0.1, placebo_results: results, lower_is_better: true })).content[0].text);
  assert.equal(drawdown.p_value, 0.05);
});

test("placebo_test: a JSON series gives JSON placebos; the hosted endpoint writes nothing and returns small placebos inline", async (t) => {
  const { toolPlaceboTest } = await import("../src/lab.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "placebo-json-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "series.json");
  writeFileSync(file, JSON.stringify(walk(50, 4)));
  const plan = JSON.parse((await toolPlaceboTest({}, { action: "plan", data_file: file, placebos: 29 })).content[0].text);
  t.after(() => rmSync(plan.dir, { recursive: true, force: true }));
  assert.equal(plan.real, "real.json");
  assert.equal(plan.files.length, 29);
  const placebo = JSON.parse(readFileSync(path.join(plan.dir, plan.files[0]), "utf8"));
  assert.equal(placebo.length, 50);
  assert.ok(Number.isInteger(plan.seed), "a plan with no seed gets a fresh one, and says which");

  const hosted = { hosted: { keySource: "shared" } };
  await assert.rejects(() => toolPlaceboTest(hosted, { action: "plan", data_file: file }), /hosted endpoint cannot read files/);
  const inline = JSON.parse((await toolPlaceboTest(hosted, { action: "plan", columns: { spy: walk(60, 5) }, seed: 3 })).content[0].text);
  assert.equal(inline.dir, undefined);
  assert.equal(inline.placebo_columns.length, 19);
  assert.equal(inline.placebo_columns[0].spy.length, 60);
  await assert.rejects(() => toolPlaceboTest(hosted, { action: "plan", columns: { a: walk(3000, 6), b: walk(3000, 7) } }), /returns at most 50000 placebo numbers/);
  await assert.rejects(() => toolPlaceboTest({}, { action: "plan" }), /plan needs exactly one of data_file or columns/);
  await assert.rejects(() => toolPlaceboTest({}, { action: "compare", real: 1 }), /compare needs real and placebo_results/);
});

test("check_leakage: a plan with no seed picks a fresh one, and compare refuses a run of the wrong length", async () => {
  const { toolCheckLeakage } = await import("../src/lab.mjs");
  const a = JSON.parse((await toolCheckLeakage({}, { action: "plan", observations: 1000 })).content[0].text);
  const b = JSON.parse((await toolCheckLeakage({}, { action: "plan", observations: 1000 })).content[0].text);
  assert.ok(Number.isInteger(a.seed) && Number.isInteger(b.seed));
  assert.notDeepEqual([a.seed, a.cuts], [b.seed, b.cuts], "two plans without a seed differ");
  await assert.rejects(() => toolCheckLeakage({}, { action: "compare", cuts: [50, 60], columns: { x: { full: Array(100).fill(1), prefixes: [Array(50).fill(1), Array(59).fill(1)] } } }), /prefixes\[1\] has 59 values; its cut is 60/);
  await assert.rejects(() => toolCheckLeakage({}, { action: "plan" }), /plan needs observations/);
});
