// Over stdio: nine tools, byte-stable across launches, read-only and open-world; a real call;
// errors as results, not crashes.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const HERE = path.dirname(fileURLToPath(import.meta.url));
async function connect() {
  const c = new Client({ name: "stdio-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(HERE, "replay-preload.mjs"), path.join(HERE, "../src/server.mjs")], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } }));
  return c;
}

test("forty-eight tools, byte-identical across launches, all read-only", async () => {
  const lists = [];
  for (let i = 0; i < 2; i++) { const c = await connect(); lists.push(JSON.stringify(await c.listTools())); await c.close(); }
  assert.equal(lists[0], lists[1]);
  const tools = JSON.parse(lists[0]).tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), ["company_events", "company_profile", "company_report", "crypto_fundamentals", "earnings_calendar", "earnings_release", "economic_calendar", "economic_outlook", "economic_series", "european_filings", "event_study", "executive_pay", "explain_move", "fails_to_deliver", "federal_debt", "filing_diff", "filing_tables", "financial_statements", "fomc", "fund_holdings", "fund_portfolio", "futures_curve", "futures_positioning", "index_constituents", "insider_trades", "investment_advisers", "large_holders", "latest_filings", "list_filings", "mentions_trend", "news", "off_exchange_volume", "options_chain", "portfolio_xray", "prediction_markets", "price_history", "private_offerings", "read_filing", "reference_rates", "screen_companies", "search_filings", "segment_revenue", "short_interest", "treasury_auctions", "treasury_yields", "verify_claims", "volatility_surface", "world_economy"]);
  for (const t of tools) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.openWorldHint, true, t.name);
    assert.ok(t.description.length < 520, `${t.name} description ${t.description.length}`);
    assert.ok(t.outputSchema, t.name);
  }
});

test("a real call over stdio returns structured content that matches its text", async (t) => {
  const c = await connect(); t.after(() => c.close());
  const r = await c.callTool({ name: "fund_holdings", arguments: { manager: "Berkshire Hathaway", top: 3, compare: false } });
  assert.ok(!r.isError, r.content?.[0]?.text);
  assert.equal(r.structuredContent.total_value, 299253556246);
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
});

test("bad input and an unknown symbol come back as tool errors that say what to do", async (t) => {
  const c = await connect(); t.after(() => c.close());
  const bad = await c.callTool({ name: "read_filing", arguments: { company: "AAPL", section: "1A", max_chars: 5 } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /max_chars/);
  const unknown = await c.callTool({ name: "price_history", arguments: { symbol: "ZZZZNOPE", start: "2026-01-01", end: "2026-02-01" } });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /no prices for ZZZZNOPE/);
});

// Every tool this release adds, over stdio on the captured responses: the server checks each result
// against the tool's output schema, so a mismatch fails here, not for a user. Arguments pin the dates
// the fixtures were captured for (the spawned server runs on the real clock).
const NEW_TOOL_CALLS = [
  ["financial_statements", { company: "MSFT", filings: 2 }],
  ["financial_statements", { company: "NVDA", statement: "income", filings: 2, fiscal_year: 2025 }],
  ["filing_tables", { company: "909832", find: "paid members", filings: 3 }],
  ["filing_tables", { company: "MSFT", find: "geographic revenue" }],
  ["earnings_release", { company: "1397187", accession: "0001397187-26-000126" }],
  ["earnings_release", { company: "104169", accession: "0000104169-26-000145" }],
  ["reference_rates", { rate: "sofr", start: "2026-09-01", end: "2026-10-08" }],
  ["reference_rates", { rate: "ecb_deposit", start: "2026-01-01", end: "2026-10-08" }],
  ["european_filings", { company: "724500Y6DUVHQD6OXN27", year: 2025 }],
  ["prediction_markets", { query: "recession", limit: 3 }],
  ["crypto_fundamentals", { stablecoin: "USDC" }],
  ["verify_claims", { company: "AAPL", text: "In fiscal 2025 Apple had revenue of $391.0 billion and net income of $93.7 billion. Diluted EPS was $6.08. Operating income was $133.1 million." }],
  ["earnings_calendar", { company: "AAPL" }],
  ["earnings_calendar", { since: "2026-09-14", until: "2026-09-18" }],
  ["price_history", { symbol: "EUR/USD", start: "2026-09-01", end: "2026-10-08" }],
  ["world_economy", { indicator: "inflation", countries: ["United States", "euro area", "China", "Japan", "turkey"] }],
  ["economic_outlook", { countries: ["United States", "euro area", "China", "Japan", "world"] }],
  ["treasury_auctions", { security: "10-year", limit: 6, since: "2026-04-12", until: "2026-10-09" }],
  ["federal_debt", { start: "2025-10-09", end: "2026-10-09" }],
  ["fund_portfolio", { fund: "IVV", top: 3 }],
  ["index_constituents", { index: "S&P 500", limit: 3 }],
  ["large_holders", { company: "21344" }],
  ["company_events", { company: "AAPL", event: "executive_change", since: "2025-01-01", limit: 3 }],
  ["private_offerings", { company: "2159753" }],
  ["short_interest", { symbol: "GME" }],
  ["futures_positioning", { market: "gold" }],
  ["fails_to_deliver", { symbol: "GME" }],
  ["executive_pay", { company: "NVDA" }],
  ["segment_revenue", { company: "AAPL" }],
  ["fomc", { year: 2026 }],
  ["economic_calendar", { since: "2026-10-12", until: "2026-10-16" }],
  ["investment_advisers", { query: "Bridgewater Associates", limit: 4 }],
  ["options_chain", { symbol: "AAPL", window: 0.03 }],
  ["volatility_surface", { symbol: "SPX", expirations: 6 }],
  ["futures_curve", {}],
];
test("every tool this release adds answers over stdio within its output schema", async (t) => {
  const c = await connect(); t.after(() => c.close());
  for (const [name, args] of NEW_TOOL_CALLS) {
    const r = await c.callTool({ name, arguments: args });
    assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
    assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent, name);
    assert.ok(r.structuredContent.evidence?.documents > 0, `${name} names the documents behind it`);
  }
});
