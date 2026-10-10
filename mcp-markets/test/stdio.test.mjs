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

test("thirteen tools, byte-identical across launches, all read-only", async () => {
  const lists = [];
  for (let i = 0; i < 2; i++) { const c = await connect(); lists.push(JSON.stringify(await c.listTools())); await c.close(); }
  assert.equal(lists[0], lists[1]);
  const tools = JSON.parse(lists[0]).tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), ["company_profile", "company_report", "economic_series", "event_study", "fund_holdings", "insider_trades", "list_filings", "mentions_trend", "price_history", "read_filing", "screen_companies", "search_filings", "treasury_yields"]);
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
