// mcp/src/lab.mjs
//
// The lab: four tools that compute in this process, on stdio and on the hosted endpoint alike,
// from src/local (mirrored byte for byte from the canlicapital repository by
// scripts/sync-local.mjs). Nothing is sent to an API and no receipt is stored; files are read only
// by the server on the user's own machine, and only their numbers (and ISO dates) are used.
//
//   backtest_strategy   a rule-based strategy over every parameter set in a grid, validated with
//                       the number of variants actually run
//   summarize_series    a long series in about a hundred words an agent can reason over
//   stress_test         resampled histories and named scenarios, with a fragility share
//   check_feasibility   broker limits, day-trading rules, market impact, crowding and capacity
//
// Also here: the code-generation resources (every tool's exact JSON Schemas, the strategy spec,
// runnable client examples, the API's OpenAPI document) and the lab's guided prompts.
import { createHash } from "node:crypto";
import { ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { BACKTEST_LIMITS, BACKTEST_LIMITS_TEXT, FAMILIES, runBacktest } from "./local/js/backtest-core.js";
import { FEASIBILITY_LIMITS_TEXT, checkFeasibility } from "./local/js/feasibility-core.js";
import { SUMMARY_LIMITS_TEXT, summarizeSeries } from "./local/js/series-summary-core.js";
import { STRESS_LIMITS_TEXT, stressTest } from "./local/js/stress-core.js";
import { LAB_TOOL_DESCRIPTIONS, backtestInput, backtestOutput, feasibilityInput, feasibilityOutput, stressInput, stressOutput, summarizeInput, summaryOutput } from "./lab-schemas.mjs";
import { readSeriesWithDates } from "./series-file.mjs";

export const LAB_TOOLS = Object.freeze(["backtest_strategy", "summarize_series", "stress_test", "check_feasibility"]);

// Same shape as every other tool's result: the object as text, and as structured content.
const labText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

function parse(schema, args, tool) {
  const result = schema.safeParse(args ?? {});
  if (result.success) return result.data;
  throw new Error(`${tool}: ${result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
}

// The series a tool works on: inline, or from a file on this machine. Exactly one of the two.
function readInput(session, tool, { inline, file, column, inlineName, fileName }) {
  if ((inline === undefined) === (file === undefined)) throw new Error(`${tool}: send exactly one of ${inlineName} or ${fileName}`);
  if (file === undefined) return { values: inline, dates: undefined, source: {} };
  if (session.hosted) throw new Error(`${tool}: the hosted endpoint cannot read files on your machine; send ${inlineName} as numbers, or run the server locally with npx -y canli-validation-mcp.`);
  const read = readSeriesWithDates(file, column);
  return {
    values: read.values,
    dates: read.dates ?? undefined,
    source: { [fileName]: file, column_position: read.column, ...(read.date_column ? { date_column_position: read.date_column } : {}), ...(read.skipped.length ? { skipped_row_counter_columns: read.skipped } : {}) },
  };
}

// The digest of exactly the numbers a result was computed from, so a result can be tied to its input.
const digest = (values) => createHash("sha256").update(JSON.stringify(values)).digest("hex");

// Labels are echoed into results, so each is cut to a date-and-time length; a label is never a
// channel for long text.
const labels = (values) => values?.map((value) => String(value).slice(0, 40));

export async function toolBacktestStrategy(session, args) {
  const input = parse(backtestInput, args, "backtest_strategy");
  const { values, dates, source } = readInput(session, "backtest_strategy", { inline: input.prices, file: input.prices_file, column: input.prices_column, inlineName: "prices", fileName: "prices_file" });
  const result = runBacktest({ prices: values, family: input.family, grid: input.grid ?? {}, periods_per_year: input.periods_per_year ?? 252, cost_bps: input.cost_bps ?? 5, allow_short: input.allow_short ?? false, dates: labels(input.dates) ?? dates });
  return labText({ ...result, limits: BACKTEST_LIMITS_TEXT, source: { ...source, prices: values.length, input_sha256: digest(values), computed: "locally, in the MCP server process; no receipt" } });
}

export async function toolSummarizeSeries(session, args) {
  const input = parse(summarizeInput, args, "summarize_series");
  const inline = input.prices ?? input.returns;
  if (input.prices !== undefined && input.returns !== undefined) throw new Error("summarize_series: send prices or returns, not both");
  const { values, dates, source } = readInput(session, "summarize_series", { inline, file: input.series_file, column: input.series_column, inlineName: "prices (or returns)", fileName: "series_file" });
  const kind = input.series_file !== undefined ? (input.series_kind ?? "prices") : input.prices !== undefined ? "prices" : "returns";
  const result = summarizeSeries({ [kind]: values, dates: labels(input.dates) ?? dates, periods_per_year: input.periods_per_year ?? 252, benchmark_returns: input.benchmark_returns, name: input.name?.slice(0, 80) });
  return labText({ ...result, limits: SUMMARY_LIMITS_TEXT, source: { ...source, kind, values: values.length, input_sha256: digest(values) } });
}

export async function toolStressTest(session, args) {
  const input = parse(stressInput, args, "stress_test");
  const { values, source } = readInput(session, "stress_test", { inline: input.returns, file: input.returns_file, column: input.returns_column, inlineName: "returns", fileName: "returns_file" });
  const result = stressTest({ ...input, returns: values });
  return labText({ ...result, limits: STRESS_LIMITS_TEXT, source: { ...source, returns: values.length, input_sha256: digest(values) } });
}

export async function toolCheckFeasibility(session, args) {
  const input = parse(feasibilityInput, args, "check_feasibility");
  return labText({ ...checkFeasibility(input), limits: FEASIBILITY_LIMITS_TEXT });
}

// The lab computes locally and changes nothing anywhere: read-only, closed world, idempotent.
const LAB_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function labToolSpecs(session) {
  const spec = (name, title, input, output, handler) => [name, { title, annotations: { title, ...LAB_ANNOTATIONS }, description: LAB_TOOL_DESCRIPTIONS[name], inputSchema: input, outputSchema: output }, (args) => handler(session, args)];
  return [
    spec("backtest_strategy", "Backtest a rule over a parameter grid, validated", backtestInput, backtestOutput, toolBacktestStrategy),
    spec("summarize_series", "Summarize a price or return series", summarizeInput, summaryOutput, toolSummarizeSeries),
    spec("stress_test", "Stress-test a strategy's returns", stressInput, stressOutput, toolStressTest),
    spec("check_feasibility", "Check a plan against broker limits and impact", feasibilityInput, feasibilityOutput, toolCheckFeasibility),
  ];
}

// ---------------------------------------------------------------------------------------------
// Code-generation resources. An agent writing code against these tools reads the exact schemas
// and a working call instead of guessing argument names.
// ---------------------------------------------------------------------------------------------

// One small, valid call per tool: the arguments every generated example sends.
export const EXAMPLE_ARGS = Object.freeze({
  get_key: {},
  validate_deflated_sharpe: { observed_sharpe_annualized: 1.5, observations: 730, periods_per_year: 365, skew: -0.5, non_excess_kurtosis: 5, effective_independent_trials: 229, cross_trial_sharpe_sd_annualized: 0.57 },
  validate_overfitting: { matrix_note: "every variant's returns, one row per period, one column per variant", matrix: [[0.01, 0.012], [-0.004, -0.002], [0.006, 0.001], [0.002, 0.004], [-0.01, -0.008], [0.007, 0.009], [0.003, -0.001], [0.0, 0.002], [0.005, 0.004], [-0.003, -0.005], [0.008, 0.006], [0.001, 0.003], [-0.002, 0.0], [0.004, 0.002], [0.006, 0.007], [-0.006, -0.004]] },
  validate_reality_check: { matrix_file: "variants.csv" },
  validate_paper_evidence: { record_file: "paper_record.json" },
  validate_breadth: { sleeve_sharpe: 0.8, average_pairwise_correlation: 0.2, sleeves: 10 },
  validate_track_record: { observed_sharpe_annualized: 1.2, periods_per_year: 252, skew: -0.3, non_excess_kurtosis: 4 },
  validate_backtest_length: { target_sharpe_annualized: 1, effective_independent_trials: 50 },
  validate_haircut_sharpe: { observed_sharpe_annualized: 1.5, periods_per_year: 252, observations: 1260, tests: 50 },
  validate_luck_trials: { observed_sharpe_annualized: 1.5, periods_per_year: 252, observations: 1260 },
  audit_backtest: { returns_file: "backtest_returns.csv", periods_per_year: 252, effective_independent_trials: 20, cross_trial_sharpe_sd_annualized: 0.5 },
  get_receipt: { id: "0123456789abcdef01234567" },
  verify_receipt: { id: "0123456789abcdef01234567" },
  service_status: {},
  company_financial_history: { ticker: "AAPL", concept: "Assets", limit: 8 },
  backtest_strategy: { family: "sma_cross", grid: { fast: [10, 20, 50], slow: [100, 200] }, prices_file: "prices.csv", cost_bps: 5 },
  summarize_series: { series_file: "prices.csv", series_kind: "prices", name: "My asset" },
  stress_test: { returns_file: "strategy_returns.csv", drawdown_limit: 0.2, paths: 1000, seed: 42 },
  check_feasibility: { broker: "alpaca", asset_class: "us_equity", account: "margin", capital_usd: 250000, orders_per_rebalance: 40, rebalances_per_year: 52, turnover_per_year: 8, adv_usd: 20000000, daily_volatility: 0.02, copies: 1, expected_gross_return: 0.12, spread_and_fees_bps: 3 },
});

const usesFile = (args) => Object.keys(args).some((k) => k.endsWith("_file"));
const cleanArgs = (args) => Object.fromEntries(Object.entries(args).filter(([k]) => !k.endsWith("_note")));

export function exampleCode(language, tool) {
  const args = cleanArgs(EXAMPLE_ARGS[tool] ?? {});
  const json = JSON.stringify(args, null, 2);
  const fileNote = usesFile(args) ? "Point the *_file argument at your own CSV; the local server reads it, the hosted endpoint cannot." : "";
  if (language === "python") {
    return [
      "# pip install mcp",
      "# Runs the server on this machine (Node.js 20.10+). CANLI_LOCAL=1 computes everything locally, no key.",
      fileNote ? `# ${fileNote}` : null,
      "import asyncio",
      "from mcp import ClientSession, StdioServerParameters",
      "from mcp.client.stdio import stdio_client",
      "",
      'SERVER = StdioServerParameters(command="npx", args=["-y", "canli-validation-mcp"], env={"CANLI_LOCAL": "1"})',
      "",
      "async def main():",
      "    async with stdio_client(SERVER) as (read, write):",
      "        async with ClientSession(read, write) as session:",
      "            await session.initialize()",
      `            result = await session.call_tool("${tool}", ${json.replace(/\n/g, "\n            ").replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None")})`,
      "            print(result.structuredContent)",
      "",
      "asyncio.run(main())",
      "",
    ].filter((line) => line !== null).join("\n");
  }
  if (language === "javascript") {
    return [
      "// npm install @modelcontextprotocol/sdk",
      "// Runs the server on this machine (Node.js 20.10+). CANLI_LOCAL=1 computes everything locally, no key.",
      fileNote ? `// ${fileNote}` : null,
      'import { Client } from "@modelcontextprotocol/sdk/client/index.js";',
      'import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";',
      "",
      'const client = new Client({ name: "example", version: "1.0.0" });',
      'await client.connect(new StdioClientTransport({ command: "npx", args: ["-y", "canli-validation-mcp"], env: { ...process.env, CANLI_LOCAL: "1" } }));',
      `const result = await client.callTool({ name: "${tool}", arguments: ${json} });`,
      "console.log(result.structuredContent);",
      "await client.close();",
      "",
    ].filter((line) => line !== null).join("\n");
  }
  if (language === "curl") {
    if (usesFile(args)) {
      return `# ${tool} reads a file on your machine, which the hosted endpoint cannot do.\n# Use the python or javascript example, or send the numbers inline (see canli://schemas/${tool}).\n`;
    }
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
    return [
      "# The hosted endpoint: no install, no key needed for a first call. Tools added since the last",
      "# release appear here once that release is pinned; locally they are available at once.",
      "curl -sS https://canlicapital.com/mcp \\",
      "  -H 'content-type: application/json' \\",
      "  -H 'accept: application/json, text/event-stream' \\",
      `  -d '${body.replace(/'/g, "'\\''")}'`,
      "",
    ].join("\n");
  }
  throw new Error(`No example language ${language}; choose python, javascript or curl`);
}

export const EXAMPLE_LANGUAGES = Object.freeze(["python", "javascript", "curl"]);

// Every strategy family as a machine-readable spec: its parameters, their bounds and its rule.
export function strategySpec() {
  const param = { type: "array", items: { type: "number" }, minItems: 1, maxItems: 60 };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "backtest_strategy family and grid",
    description: "Pick a family and give each of its parameters a list of values; every valid combination is run (at most 200), positions are decided at each close from prices up to that close, and trade the next period's return.",
    oneOf: Object.entries(FAMILIES).map(([family, spec]) => ({
      title: family,
      description: spec.describe,
      type: "object",
      required: ["family", ...(spec.params.length ? ["grid"] : [])],
      properties: {
        family: { const: family },
        ...(spec.params.length ? { grid: { type: "object", additionalProperties: false, required: spec.params.filter((p) => p !== "skip"), properties: Object.fromEntries(spec.params.map((p) => [p, param])) } } : {}),
      },
    })),
    limits: { max_prices: BACKTEST_LIMITS.max_prices, max_variants: BACKTEST_LIMITS.max_variants, max_parameter_value: BACKTEST_LIMITS.max_parameter_value },
  };
}

// catalog: { toolName: { description, inputSchema, outputSchema } } for every tool the server can list.
export function registerCodeResources(server, session, catalog) {
  const names = Object.keys(catalog).sort();
  const complete = (list) => (value) => list.filter((n) => n.startsWith(value ?? ""));
  server.registerResource(
    "tool-schema",
    new ResourceTemplate("canli://schemas/{tool}", { list: undefined, complete: { tool: complete(names) } }),
    { title: "A tool's exact JSON Schemas", description: "Input and output JSON Schema and the description of one tool, for writing code against it.", mimeType: "application/json" },
    (uri, { tool }) => {
      const entry = catalog[tool];
      if (!entry) throw new Error(`No tool ${tool}; tools are ${names.join(", ")}`);
      const body = { tool, description: entry.description, input_schema: z.toJSONSchema(entry.inputSchema, { io: "input" }), output_schema: z.toJSONSchema(entry.outputSchema, { io: "output" }) };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body, null, 2) }] };
    },
  );
  server.registerResource(
    "example",
    new ResourceTemplate("canli://examples/{language}/{tool}", { list: undefined, complete: { language: complete([...EXAMPLE_LANGUAGES]), tool: complete(names) } }),
    { title: "A working call, in Python, JavaScript or curl", description: "Runnable client code calling one tool with valid example arguments.", mimeType: "text/plain" },
    (uri, { language, tool }) => {
      if (!catalog[tool]) throw new Error(`No tool ${tool}; tools are ${names.join(", ")}`);
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: exampleCode(language, tool) }] };
    },
  );
  server.registerResource(
    "strategy-spec",
    "canli://strategy-spec",
    { title: "Strategy families and their parameters", description: "JSON Schema of backtest_strategy's families, parameters and rules.", mimeType: "application/json" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(strategySpec(), null, 2) }] }),
  );
  server.registerResource(
    "openapi",
    "canli://openapi",
    { title: "The validation API's OpenAPI 3.1 document", description: "Generated from the endpoints that exist; fetched from canlicapital.com when read.", mimeType: "application/json" },
    async (uri) => {
      const signal = AbortSignal.timeout(session.timeoutMs);
      let res;
      try {
        res = await session.fetchImpl(`${session.base}/api/v1/openapi`, { headers: { Accept: "application/json" }, signal, redirect: "error" });
      } catch {
        throw new Error(`canli://openapi: could not reach ${session.base}/api/v1/openapi; it is also published at https://canlicapital.com/api/v1/openapi`);
      }
      if (!res.ok) throw new Error(`canli://openapi: ${session.base}/api/v1/openapi returned HTTP ${res.status}`);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: await res.text() }] };
    },
  );
}

// Guided workflows for the lab. The prompt only writes the instructions; the tools do the work.
export function registerLabPrompts(server) {
  const prompt = (name, title, description, argsSchema, lines) => server.registerPrompt(name, { title, description, argsSchema }, (args) => ({
    messages: [{ role: "user", content: { type: "text", text: lines(args).filter(Boolean).join("\n") } }],
  }));
  prompt(
    "backtest_and_validate",
    "Backtest a rule and check whether the best variant is luck",
    "Run a strategy family over a parameter grid on your prices, then read the deflated Sharpe and overfitting probability that count every variant run.",
    { prices_file: z.string().describe("Path to a CSV of prices on this machine"), family: z.string().optional().describe("sma_cross, momentum, mean_reversion, breakout or buy_and_hold") },
    ({ prices_file, family }) => [
      `Backtest ${family ?? "a sensible rule for this asset"} on the prices in ${prices_file} with backtest_strategy, over a small grid of parameters (read canli://strategy-spec for each family's parameters).`,
      "Report the best variant's Sharpe, drawdown and turnover next to buy and hold, then the deflated Sharpe and the probability of backtest overfitting, which count every variant the call ran.",
      "Say plainly whether the best variant is distinguishable from luck, and quote the limits sentences the result carries.",
    ],
  );
  prompt(
    "stress_my_strategy",
    "How fragile is this strategy?",
    "Resampled histories and named crash, volatility, repeat and outage scenarios for a strategy's returns.",
    { returns_file: z.string().describe("Path to a CSV of the strategy's returns"), drawdown_limit: z.string().optional().describe("The drawdown you could not live with, such as 0.2") },
    ({ returns_file, drawdown_limit }) => [
      `Run stress_test on ${returns_file}${drawdown_limit ? ` with drawdown_limit ${drawdown_limit}` : ""}.`,
      "Explain the fragility share, the 5th-percentile drawdown and which named scenarios break the limit, and what change (lower leverage, a stop, more diversification) would address each.",
      "Say that these are frequencies under stated rules, not forecasts.",
    ],
  );
  prompt(
    "production_check",
    "Will this plan survive a real broker?",
    "Order-rate and minimum-order limits, 2026 day-trading rules, market impact, crowding and capacity for a trading plan.",
    { plan: z.string().describe("Capital, broker, how many orders per rebalance, how often, turnover, and what it trades") },
    ({ plan }) => [
      `Here is the plan: ${plan}.`,
      "Ask me for any of check_feasibility's required inputs you cannot infer (average daily dollar volume and daily volatility of a typical holding), then run it.",
      "List each blocking or warning finding with the change that fixes it, and say when the broker facts were checked.",
    ],
  );
  prompt(
    "summarize_market_series",
    "Read a long series in a hundred words",
    "Summarize a price or return file instead of reading its rows.",
    { series_file: z.string().describe("Path to a CSV of prices or returns"), kind: z.string().optional().describe("prices or returns; default prices") },
    ({ series_file, kind }) => [
      `Call summarize_series on ${series_file} (series_kind ${kind ?? "prices"}) and reason from its text and fields instead of reading the file's rows.`,
      "Point out anything in the data check (stale prices, jumps) that should be fixed before the series is backtested.",
    ],
  );
}
