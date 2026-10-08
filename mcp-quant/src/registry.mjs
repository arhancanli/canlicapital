// Every tool in one catalog, grouped into toolsets. A tool is
//   { name, toolset, title, description, keywords, input (strict zod object), run(args) -> object }
// and runs the same way whether it is listed directly or reached through run_tool.
import { z } from "zod";

import { compact } from "./math.mjs";
import { ECONOMETRICS as ECON_PLUS, OPTIONS as OPTIONS_PLUS, RATES as RATES_PLUS, RISK as RISK_PLUS } from "./tools/analytics.mjs";
import { TOOLS as CRYPTO_FX } from "./tools/cryptofx.mjs";
import { TOOLS as DATA_CHECKS } from "./tools/datachecks.mjs";
import { TOOLS as ECONOMETRICS } from "./tools/econometrics.mjs";
import { TOOLS as EXECUTION } from "./tools/execution.mjs";
import { TOOLS as EXOTICS } from "./tools/exotics.mjs";
import { TOOLS as INDICATORS } from "./tools/indicators.mjs";
import { TOOLS as LABELING } from "./tools/labeling.mjs";
import { TOOLS as OPTIONS } from "./tools/options.mjs";
import { TOOLS as PERFORMANCE } from "./tools/performance.mjs";
import { TOOLS as PORTFOLIO } from "./tools/portfolio.mjs";
import { TOOLS as RATES } from "./tools/rates.mjs";
import { TOOLS as RETURNS } from "./tools/returns.mjs";
import { TOOLS as RISK } from "./tools/risk.mjs";
import { TOOLS as SIZING } from "./tools/sizing.mjs";
import { TOOLS as SLEEVES } from "./tools/sleeves.mjs";
import { TOOLS as STRATEGIES } from "./tools/strategies.mjs";
import { TOOLS as TVM } from "./tools/tvm.mjs";
import { TOOLS as VALUATION } from "./tools/valuation.mjs";

export const TOOLSETS = Object.freeze({
  performance: { title: "Performance and risk", tools: PERFORMANCE },
  options: { title: "Options and derivatives", tools: [...OPTIONS, ...OPTIONS_PLUS] },
  indicators: { title: "Technical indicators", tools: INDICATORS },
  econometrics: { title: "Statistics and econometrics", tools: [...ECONOMETRICS, ...ECON_PLUS] },
  exotics: { title: "Exotic options and volatility models", tools: EXOTICS },
  rates: { title: "Fixed income and rates", tools: [...RATES, ...RATES_PLUS] },
  risk: { title: "Portfolio risk and stress", tools: [...RISK, ...RISK_PLUS] },
  returns: { title: "Returns transforms and attribution", tools: RETURNS },
  portfolio: { title: "Portfolio construction and risk", tools: PORTFOLIO },
  execution: { title: "Execution and microstructure", tools: EXECUTION },
  sizing: { title: "Position sizing and trade risk", tools: SIZING },
  crypto_fx: { title: "Crypto and FX", tools: CRYPTO_FX },
  strategies: { title: "Strategy backtests", tools: STRATEGIES },
  sleeves: { title: "Strategy sleeve library", tools: SLEEVES },
  data_checks: { title: "Data quality checks", tools: DATA_CHECKS },
  labeling: { title: "Data annotation and ML labels", tools: LABELING },
  tvm: { title: "Time value and corporate finance", tools: TVM },
  valuation: { title: "Valuation and fundamental scores", tools: VALUATION },
});

export const CATALOG = Object.freeze(Object.entries(TOOLSETS).flatMap(([toolset, t]) => t.tools.map((tool) => Object.freeze({ ...tool, toolset }))));
export const BY_NAME = new Map(CATALOG.map((t) => [t.name, t]));

if (BY_NAME.size !== CATALOG.length) throw new Error("Duplicate tool name in the catalog");

// Runs one tool on raw arguments: validates, computes, rounds. Throws an Error whose message says
// what to fix; callers turn it into an MCP error result.
export function runTool(name, args) {
  const tool = BY_NAME.get(name);
  if (!tool) throw new Error(`No tool ${name}. Use find_tool to search the ${CATALOG.length} tools.`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ");
    throw new Error(`${name}: ${issues}. describe_tool ${name} gives the exact input schema.`);
  }
  return compact(tool.run(parsed.data));
}

const words = (s) => String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

// Ranks tools by how well their name, title, keywords and description match the query words.
export function findTools(query, { toolset, limit = 8 } = {}) {
  const q = words(query);
  const scored = [];
  for (const t of CATALOG) {
    if (toolset && t.toolset !== toolset) continue;
    const name = words(t.name.replace(/_/g, " ")), title = words(t.title), kw = words(t.keywords), desc = words(t.description);
    let s = 0;
    for (const w of q) {
      if (t.name === w || t.name.includes(w)) s += 4;
      if (name.includes(w)) s += 3;
      if (title.some((x) => x.startsWith(w))) s += 2;
      if (kw.some((x) => x.startsWith(w))) s += 2;
      if (desc.some((x) => x.startsWith(w))) s += 1;
    }
    if (s > 0 || q.length === 0) scored.push([s, t]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, t]) => t);
}

export function inputJsonSchema(tool) {
  const s = z.toJSONSchema(tool.input, { io: "input" });
  delete s.$schema;
  return s;
}
