// Records the views shown on canlicapital.com/mcp-servers: runs each demo through the flagship over
// stdio, exactly as a chat would (run_tool with view: true), and writes what the page plays back:
// public/demos/canli-mcp/view.txt (the view itself), one JSON file per demo with the result, and
// <demo>-calls.json with the follow-up calls its controls make (a market tile's chart, a chain's other expirations, the
// backtest's S&P 500 line). Run from mcp-canli: node bench/record-site-demos.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { PROMPTS } from "../src/prompts.mjs";
import { viewHtml } from "../src/view.mjs";

const OUT = resolve(import.meta.dirname, "../../public/demos/canli-mcp");
const version = JSON.parse(await (await import("node:fs/promises")).readFile(resolve(import.meta.dirname, "../package.json"), "utf8")).version;
// Declared as a host that draws views, so the model's side gets the summaries a chat would.
const c = new Client({ name: "site-demo-recorder", version: "0" }, { capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(import.meta.dirname, "../src/server.mjs")], env: process.env }));
const run = async (input) => {
  const r = await c.callTool({ name: "run_tool", arguments: input });
  if (r.isError) throw new Error(`${JSON.stringify(input).slice(0, 120)}: ${r.content?.[0]?.text}`);
  return r;
};
const daysBefore = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const resultOf = (r) => { const s = r.structuredContent; return s && Array.isArray(s.results) ? s.results.at(-1).result : s; };

const DEMOS = [
  { id: "market", input: { name: "market_overview", arguments: {}, view: true } },
  { id: "curve", input: { calls: PROMPTS.yield_curve.calls(), view: true } },
  { id: "compare", input: { calls: PROMPTS.compare_stocks.calls({ tickers: "SPY, AAPL, NVDA, GLD, TLT" }), view: true } },
  { id: "statements", input: { calls: PROMPTS.statement_charts.calls({ ticker: "AAPL" }), view: true } },
  { id: "surface", input: { calls: PROMPTS.volatility_surface.calls({ ticker: "SPY" }), view: true } },
  { id: "chart", input: { calls: PROMPTS.stock_chart.calls({ ticker: "NVDA" }), view: true } },
  { id: "backtest", input: { calls: PROMPTS.strategy_lab.calls({ ticker: "SPY" }), return: "last", view: true } },
];

mkdirSync(OUT, { recursive: true });
// As text, not a page of the site: the demo frames it with srcdoc.
writeFileSync(resolve(OUT, "view.txt"), viewHtml());
const index = [];
for (const d of DEMOS) {
  const t0 = Date.now(), r = await run(d.input), follow = [];
  const res = resultOf(r);
  // What the controls ask for: each market tile's chart, the chain's next expirations, SPY beside a backtest.
  if (d.id === "market") for (const g of Object.values(res)) if (Array.isArray(g) && Array.isArray(g[0])) for (const row of g) follow.push({ name: "price_history", arguments: { symbol: row[0], start: daysBefore(730) } });
  if (d.id === "chart") { const chain = r.structuredContent.results.at(-1).result; for (const e of (chain.expirations?.rows ?? []).slice(1, 6).map((x) => x[0])) follow.push({ name: "options_chain", arguments: { symbol: "NVDA", expiration: e } }); }
  if (d.id === "backtest") follow.push({ name: "price_history", arguments: { symbol: "SPY", start: "2010-01-01" } });
  const answers = [];
  for (const f of follow) { try { answers.push({ call: f, result: (await run({ ...f, digits: 6, view: true })).structuredContent }); } catch (err) { process.stderr.write(`skip ${f.arguments.symbol ?? ""}: ${err.message.slice(0, 100)}\n`); } }
  // The follow-ups load only when a control first asks for one.
  writeFileSync(resolve(OUT, `${d.id}.json`), JSON.stringify({ version, recorded: new Date().toISOString(), input: d.input, result: r, answers: answers.length }));
  if (answers.length) writeFileSync(resolve(OUT, `${d.id}-calls.json`), JSON.stringify(answers));
  index.push({ id: d.id, model_chars: r.content[0].text.length, view_chars: JSON.stringify(r.structuredContent).length, answers: answers.length, ms: Date.now() - t0 });
  process.stdout.write(`${d.id}: model ${r.content[0].text.length} chars, view ${JSON.stringify(r.structuredContent).length}, ${answers.length} follow-ups\n`);
}
writeFileSync(resolve(OUT, "index.json"), JSON.stringify({ version, recorded: new Date().toISOString().slice(0, 10), demos: index }, null, 1));
await c.close();
