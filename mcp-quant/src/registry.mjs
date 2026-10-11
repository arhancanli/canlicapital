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
export function runTool(name, args, { digits = 10 } = {}) {
  const tool = BY_NAME.get(name);
  if (!tool) throw new Error(`No tool ${name}. Use find_tool to search the ${CATALOG.length} tools.`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ");
    throw new Error(`${name}: ${issues}. describe_tool ${name} gives the exact input schema.`);
  }
  return compact(tool.run(parsed.data), digits);
}

// Search: BM25 over each tool's name, title, keywords and description (field-weighted), with light
// stemming, stop words and a few finance abbreviations expanded, so plain-language requests find
// the right tool in one call.
const STOP = new Set("a an and are as at be by can do does for from get how i in is it me my of on or our the this to what which with you your want need using use show find give compute calculate".split(" "));
const ABBREV = { cvar: "expected shortfall conditional", es: "expected shortfall", var: "value risk", npv: "net present value", irr: "internal rate return", ytm: "yield maturity", dcf: "discounted cash flow", pnl: "profit loss", vol: "volatility", iv: "implied volatility", rv: "realized variance", hmm: "markov regime", pbo: "probability backtest overfitting", dsr: "deflated sharpe", ml: "machine learning", cv: "cross validation", etf: "etfs", fx: "currency", otm: "out money" };
export const stem = (w) => w.length <= 3 ? w : w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "").replace(/(istic|ility|ation|ion|ity|al|ness|ic)$/, "") || w;
const tokens = (s) => String(s ?? "").toLowerCase().replace(/[-_/]/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).flatMap((w) => (ABBREV[w] ? [w, ...ABBREV[w].split(" ")] : [w])).map(stem);
const FIELDS = [["name", 3], ["title", 2.5], ["keywords", 2], ["description", 1]];
const INDEX = (() => {
  const docs = CATALOG.map((t) => Object.fromEntries(FIELDS.map(([f]) => [f, tokens(f === "name" ? t.name.replace(/_/g, " ") : t[f])])));
  const avg = Object.fromEntries(FIELDS.map(([f]) => [f, docs.reduce((s, d) => s + d[f].length, 0) / docs.length]));
  const df = new Map();
  for (const d of docs) for (const w of new Set(FIELDS.flatMap(([f]) => d[f]))) df.set(w, (df.get(w) ?? 0) + 1);
  return { docs, avg, df, n: docs.length };
})();

// Ranks tools by BM25F relevance to the query; ties go to the shorter name.
export function findTools(query, { toolset, limit = 8 } = {}) {
  const q = [...new Set(tokens(query))], { docs, avg, df, n } = INDEX, k1 = 1.2, b = 0.75;
  const scored = [];
  CATALOG.forEach((t, i) => {
    if (toolset && t.toolset !== toolset) return;
    let s = 0;
    for (const w of q) {
      let tf = 0;
      for (const [f, wt] of FIELDS) { const d = docs[i][f]; let c = 0; for (const x of d) if (x === w) c++; tf += wt * c / (1 - b + b * d.length / (avg[f] || 1)); }
      if (tf > 0) s += Math.log(1 + (n - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5)) * tf * (k1 + 1) / (tf + k1);
    }
    const plain = String(query).toLowerCase(), raw = plain.split(/[^a-z0-9]+/).filter(Boolean), nw = t.name.split("_");
    // Phrase bonus: the longest run of the tool name's words appearing in order in the query.
    let run = 0;
    for (let i = 0; i < raw.length; i++) for (let j = 0; j < nw.length; j++) { let k = 0; while (raw[i + k] && nw[j + k] && raw[i + k] === nw[j + k]) k++; run = Math.max(run, k); }
    if (run >= 2) s += 2 * run;
    if (q.length && (t.name.replace(/_/g, " ") === plain.trim() || new RegExp(`(^|[^a-z_])${t.name}([^a-z_]|$)`).test(plain))) s += 100;
    if (s > 0 || q.length === 0) scored.push([s, t]);
  });
  scored.sort((a, b2) => b2[0] - a[0] || a[1].name.length - b2[1].name.length || a[1].name.localeCompare(b2[1].name));
  return scored.slice(0, limit).map(([, t]) => t);
}

export function inputJsonSchema(tool) {
  const s = z.toJSONSchema(tool.input, { io: "input" });
  delete s.$schema;
  return s;
}
