#!/usr/bin/env node
// canli-quant-mcp: quant finance tools computed on the caller's data, each checked against an
// independent reference in test/reference.test.mjs.
//
// Built so the catalog can grow to hundreds of tools without growing the prompt: by default the
// model sees three tools (find_tool, describe_tool, run_tool) and reaches every calculation through
// them. CANLI_TOOLSETS lists toolsets directly instead (comma-separated, or "all"). The tool list is
// byte-identical across launches, so providers can cache it.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer, ResourceTemplate, completable } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { BY_NAME, CATALOG, TOOLSETS, findTools, inputJsonSchema, runTool } from "./registry.mjs";

export const SERVER_NAME = "canli-quant-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Canli Quant",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [
    { src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
});

export const SERVER_INSTRUCTIONS = `Quant finance calculations on data you send: ${CATALOG.length} tools in ${Object.keys(TOOLSETS).length} toolsets (${Object.keys(TOOLSETS).join(", ")}). Call find_tool with what you need in plain words, then run_tool with the tool's name and arguments; describe_tool gives a tool's exact input schema when unsure. Returns are simple fractions (0.01 = 1%), oldest first. Run data_checks tools on unfamiliar data first. run_tool with receipt: true adds input and output hashes so anyone can recompute the result and compare.`;

// What each toolset's results were checked against (test/reference.test.mjs, scripts/reference/).
export const METHODS = Object.freeze({
  performance: "numpy, scipy, statsmodels and empyrical-reloaded",
  options: "QuantLib (analytic engines; finite differences for American options)",
  exotics: "QuantLib (barrier, Asian, Heston, SABR, Kirk, Margrabe, lookback and chooser engines)",
  rates: "QuantLib bonds and short-rate models; numpy and scipy for curves and swaps",
  tvm: "numpy-financial and closed forms",
  valuation: "published formulas re-derived independently",
  portfolio: "numpy closed forms, scipy SLSQP, scikit-learn Ledoit-Wolf, the HRP paper's code",
  risk: "numpy and scipy re-derivations",
  returns: "pandas resampling and closed forms",
  econometrics: "statsmodels (OLS, HAC, ADF, KPSS, cointegration, Granger, ARCH LM) and arch (GARCH, variance ratio)",
  indicators: "TA-Lib's C library, bar for bar; pandas for indicators TA-Lib lacks",
  execution: "closed forms (Almgren-Chriss kappa solved numerically), statsmodels OLS",
  sizing: "scipy and closed forms",
  crypto_fx: "closed forms and simulated pool reserves",
  strategies: "an independent pandas implementation of every recipe and of the costed engine",
  data_checks: "planted-defect tests: each check must find what was planted and stay quiet on clean data",
});

const sha256 = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function receiptFor(name, args, result) {
  return { tool: name, server: `${SERVER_NAME}@${SERVER_VERSION}`, input_sha256: sha256({ name, arguments: args ?? {} }), output_sha256: sha256(result), verify: "Run the same tool with the same arguments on this version; the output hash must match." };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const open = z.looseObject({});

const ok = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
const fail = (err) => ({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] });
const guard = (fn) => (args) => {
  try {
    return ok(fn(args));
  } catch (err) {
    return fail(err);
  }
};

export function selectedToolsets(env = process.env.CANLI_TOOLSETS) {
  const raw = String(env ?? "").trim().toLowerCase();
  if (!raw || raw === "discover") return [];
  if (raw === "all") return Object.keys(TOOLSETS);
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!TOOLSETS[n]) throw new Error(`CANLI_TOOLSETS: no toolset ${n}; toolsets are ${Object.keys(TOOLSETS).join(", ")}, all, discover`);
  return names;
}

export function registerAll(server, { toolsets = selectedToolsets() } = {}) {
  const toolsetNames = Object.keys(TOOLSETS);
  server.registerTool("find_tool", {
    title: "Find a tool",
    description: `Search the ${CATALOG.length} quant tools by what you need, e.g. "value at risk", "black scholes greeks", "max drawdown". Returns names, toolsets and one-line descriptions, best first.`,
    annotations: { title: "Find a tool", ...READ_ONLY },
    inputSchema: z.object({
      query: z.string().max(200).describe("What you need, in plain words."),
      toolset: z.enum(toolsetNames).optional().describe("Only this toolset."),
      limit: z.number().int().min(1).max(50).optional().describe("Default 8."),
    }).strict(),
    outputSchema: open,
  }, guard(({ query, toolset, limit }) => {
    const found = findTools(query, { toolset, limit });
    return { columns: ["name", "toolset", "description"], rows: found.map((t) => [t.name, t.toolset, t.description]), next: "run_tool with name and arguments; describe_tool for the input schema." };
  }));
  server.registerTool("describe_tool", {
    title: "Describe a tool",
    description: "Get one tool's full description and exact input JSON Schema before calling run_tool.",
    annotations: { title: "Describe a tool", ...READ_ONLY },
    inputSchema: z.object({ name: z.string().max(100).describe("A tool name from find_tool, e.g. value_at_risk.") }).strict(),
    outputSchema: open,
  }, guard(({ name }) => {
    const t = BY_NAME.get(name);
    if (!t) throw new Error(`No tool ${name}. find_tool searches by description.`);
    return { name: t.name, toolset: t.toolset, title: t.title, description: t.description, input_schema: inputJsonSchema(t) };
  }));
  server.registerTool("run_tool", {
    title: "Run a tool",
    description: "Run any quant tool by name with its arguments, e.g. {name: \"sharpe_ratio\", arguments: {returns: [0.01, -0.02, 0.015]}}.",
    annotations: { title: "Run a tool", ...READ_ONLY },
    inputSchema: z.object({
      name: z.string().max(100).describe("Tool name from find_tool."),
      arguments: z.record(z.string(), z.unknown()).optional().describe("The tool's arguments, as describe_tool gives them."),
      receipt: z.boolean().optional().describe("Add a calculation receipt (input and output SHA-256) so the result can be independently recomputed and compared; default false."),
    }).strict(),
    outputSchema: open,
  }, guard(({ name, arguments: args, receipt }) => {
    const result = runTool(name, args);
    return receipt ? { ...result, receipt: receiptFor(name, args, result) } : result;
  }));
  registerPrompts(server);
  registerResources(server);
  for (const toolset of toolsets) {
    for (const t of TOOLSETS[toolset].tools) {
      server.registerTool(t.name, { title: t.title, description: t.description, annotations: { title: t.title, ...READ_ONLY }, inputSchema: t.input, outputSchema: open }, guard((args) => runTool(t.name, args)));
    }
  }
}

// Workflows: each prompt names the tools to chain, in order, for a common job.
const WORKFLOWS = {
  analyze_strategy: { title: "Analyze a strategy's returns", description: "Full statistical read of a return series: quality checks, performance, risk, significance after multiple testing.", args: { returns: "The strategy's periodic returns as a JSON array (fractions).", trials: "How many variants were tried before this one (for the deflated Sharpe ratio)." },
    text: (a) => `Analyze this strategy. Returns: ${a.returns}. Variants tried: ${a.trials || "unknown, ask me"}.\n1. check_returns_series on the returns; stop and report if it finds errors.\n2. return_stats, then sharpe_ratio (with standard errors) and max_drawdown.\n3. value_at_risk and expected_shortfall at 95% and 99%.\n4. normality_test and autocorrelation; if autocorrelated, autocorrelation_adjusted_sharpe.\n5. probabilistic_sharpe_ratio, and deflated_sharpe_ratio with the number of variants tried.\n6. mean_return_test with Newey-West.\nReport the numbers in one table, then say plainly whether the evidence supports a real edge after deflation.` },
  audit_backtest: { title: "Audit a backtest for overfitting", description: "Re-run a strategy across its parameter grid and deflate the best result for the number of variants.", args: { recipe: "Strategy recipe, e.g. ma_crossover.", prices: "Prices as a JSON array." },
    text: (a) => `Audit a ${a.recipe || "ma_crossover"} backtest on these prices: ${a.prices}.\n1. check_price_series on the prices.\n2. strategy_sweep with a sensible grid (at least 3 values per parameter) and cost_bps 5 and 20.\n3. For the best variant, backtest_${a.recipe || "ma_crossover"} and report CAGR, Sharpe, drawdown, turnover and cost drag against buy and hold.\n4. Quote the deflation verdict from strategy_sweep and explain it in one paragraph.` },
  value_company: { title: "Value a company", description: "Intrinsic value from cash flows, the market's implied growth, multiples and red-flag scores.", args: { figures: "The company's figures (cash flows, balance sheet, income statement) as text or JSON." },
    text: (a) => `Value this company from these figures: ${a.figures}.\n1. check_fundamentals on the statements.\n2. wacc (CAPM cost of equity), then dcf_valuation with its sensitivity grid.\n3. reverse_dcf at the current price.\n4. enterprise_value_multiples.\n5. altman_z_score, piotroski_f_score and beneish_m_score where the figures allow.\nGive a value range, the growth the price implies, and any red flags.` },
  price_option: { title: "Price and risk an option", description: "Check quotes, back out implied volatility, price and Greeks, and a scenario grid.", args: { option: "The option: type, strike, expiry, underlying price, rates, and the market price or chain." },
    text: (a) => `Price this option: ${a.option}.\n1. If a chain is given, check_option_chain first.\n2. implied_volatility from the market price.\n3. black_scholes for price and Greeks (american_option if early exercise matters).\n4. option_scenario_grid for spot ±20% and vol ±10 points.\nSummarize fair value, Greeks and the worst scenario.` },
  test_mean_reversion: { title: "Test a spread for mean reversion", description: "Stationarity, cointegration, half-life and a costed backtest of a pair or spread.", args: { y: "First price series (JSON array).", x: "Second price series (JSON array), optional." },
    text: (a) => `Test for mean reversion. y: ${a.y}. x: ${a.x || "none (single series)"}.\n1. check_price_series on each series.\n2. With two series: cointegration_test on log prices; otherwise adf_test and kpss_test on log prices.\n3. variance_ratio_test and mean_reversion_fit on the spread.\n4. backtest_pairs_trading (or backtest_zscore_reversion) with costs.\nSay whether the statistics and the backtest agree.` },
  build_portfolio: { title: "Build a portfolio", description: "Clean estimates, several allocations side by side, and their risk.", args: { returns: "Asset returns matrix (JSON, rows are periods)." },
    text: (a) => `Build a portfolio from these asset returns: ${a.returns}.\n1. correlation_matrix and covariance_shrinkage.\n2. min_variance_portfolio, risk_parity_portfolio, hierarchical_risk_parity, max_diversification_portfolio and max_sharpe_portfolio (long-only).\n3. portfolio_risk for each.\nCompare weights, volatility and risk concentration in one table and recommend one with reasons, noting that expected-return inputs are the least reliable.` },
  analyze_trade_log: { title: "Analyze a trade log", description: "Edge, payoff, sizing and risk of ruin from a list of trade P&Ls.", args: { pnl: "Per-trade profit and loss as a JSON array." },
    text: (a) => `Analyze these trades: ${a.pnl}.\n1. trade_stats.\n2. trade_expectancy from the win rate and average win and loss.\n3. kelly_fraction (win probability and payoff) and optimal_f.\n4. drawdown_probability for the implied return and volatility.\nRecommend a risk-per-trade fraction well below full Kelly and explain why.` },
  check_dataset: { title: "Check a dataset before modeling", description: "Run the data checks that fit the data and list every problem before any model sees it.", args: { data: "The data, or a description of it (prices, bars, option chain, curve, funding, fundamentals)." },
    text: (a) => `Check this data before any analysis: ${a.data}.\nPick the matching data_checks tools (check_price_series, check_ohlc_bars, check_option_chain, check_yield_curve, check_funding_rates, check_cross_venue_prices, check_timestamps, check_returns_series, check_fundamentals, check_corporate_actions), run them, and list errors first, then warnings, with what to fix.` },
};

function registerPrompts(server) {
  const recipes = ["ma_crossover", "time_series_momentum", "breakout", "zscore_reversion", "rsi_reversion", "volatility_target", "cross_sectional_momentum", "dual_momentum", "risk_parity_rebalance", "pairs_trading"];
  for (const [name, w] of Object.entries(WORKFLOWS)) {
    const shape = Object.fromEntries(Object.entries(w.args).map(([k, d]) => [k, k === "recipe" ? completable(z.string().describe(d), (v) => recipes.filter((r) => r.startsWith(v ?? ""))) : z.string().optional().describe(d)]));
    server.registerPrompt(name, { title: w.title, description: w.description, argsSchema: z.object(shape) }, (args) => ({ messages: [{ role: "user", content: { type: "text", text: w.text(args ?? {}) } }] }));
  }
}

function registerResources(server) {
  const json = (uri, v) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(v) }] });
  server.registerResource("catalog", "canli-quant://catalog", { title: "Tool catalog", description: "Every tool: name, toolset and one-line description.", mimeType: "application/json" },
    (uri) => json(uri.href, { tools: CATALOG.length, columns: ["name", "toolset", "description"], rows: CATALOG.map((t) => [t.name, t.toolset, t.description]) }));
  server.registerResource("methods", "canli-quant://methods", { title: "Reference checks", description: "What each toolset's results are checked against in the test suite.", mimeType: "application/json" },
    (uri) => json(uri.href, { toolsets: Object.fromEntries(Object.entries(TOOLSETS).map(([k, t]) => [k, { title: t.title, tools: t.tools.length, checked_against: METHODS[k] }])) }));
  server.registerResource("tool-schema", new ResourceTemplate("canli-quant://tools/{name}", { list: undefined, complete: { name: (v) => CATALOG.map((t) => t.name).filter((n) => n.startsWith(v ?? "")).slice(0, 50) } }), { title: "Tool schema", description: "One tool's description and input JSON Schema.", mimeType: "application/json" },
    (uri, { name }) => { const t = BY_NAME.get(String(name)); if (!t) throw new Error(`No tool ${name}.`); return json(uri.href, { name: t.name, toolset: t.toolset, description: t.description, input_schema: inputJsonSchema(t) }); });
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerAll(server);
  await server.connect(new StdioServerTransport());
}
