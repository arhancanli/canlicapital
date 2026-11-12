// Upstream MCP servers: names made plain, tools that change things kept off, keys read from the
// environment and never written out, and over stdio, another server's tools found, run, batched,
// described and held to the time machine like a pack's, with what was left off said in canli://privacy.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { upstreamCommand } from "../local/upstream.mjs";
import { changesThings, expand, plainName, readUpstreams, whereIs } from "../src/upstreams.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "../src/server.mjs");
const FIXTURE = path.join(HERE, "fixtures/upstream-server.mjs");

test("names become plain, tools that act are told from tools that read, and keys stay in the environment", () => {
  assert.equal(plainName("getNewsHeadlines"), "get_news_headlines");
  assert.equal(plainName("TIME_SERIES_DAILY"), "time_series_daily");
  assert.equal(plainName("get-quote.v2"), "get_quote_v2");
  assert.equal(plainName("10k_search"), "t_10k_search");
  assert.equal(changesThings({}, "place_order"), true);
  assert.equal(changesThings({}, "cancel_all_orders"), true);
  assert.equal(changesThings({}, "alpaca_order"), true);
  assert.equal(changesThings({}, "get_orders"), false, "listing orders reads");
  assert.equal(changesThings({}, "list_trades"), false, "a market's trades are data");
  assert.equal(changesThings({}, "income_statement"), false);
  assert.equal(changesThings({ annotations: { readOnlyHint: true } }, "submit_report"), false, "a tool's own annotations decide");
  assert.equal(changesThings({ annotations: { destructiveHint: true } }, "get_quote"), true);
  assert.equal(expand("Bearer ${K}", { K: "abc" }), "Bearer abc");
  assert.throws(() => expand("Bearer ${MISSING_KEY}", {}), /^Error: MISSING_KEY is not set$/);
  assert.equal(whereIs({ url: "https://mcp.example.com/mcp?apikey=${KEY}" }), "mcp.example.com");
  assert.equal(whereIs({ command: "npx", args: ["-y", "server", "--key", "${KEY}"] }), "npx -y server --key …");
  assert.throws(() => readUpstreams({ CANLI_UPSTREAMS: '{"Bad":{"url":"https://x"}}' }), /2-24 lowercase letters/);
  assert.throws(() => readUpstreams({ CANLI_UPSTREAMS: '{"two":{"url":"https://x","command":"node"}}' }), /a url or a command, not both/);
  assert.throws(() => readUpstreams({ CANLI_UPSTREAMS: '{"ftp":{"url":"ftp://x"}}' }), /https:\/\//);
  assert.throws(() => readUpstreams({ CANLI_UPSTREAMS: '{"odd":{"url":"https://x","colour":"red"}}' }), /colour|Unrecognized/i);
  assert.deepEqual(readUpstreams({}, mkdtempSync(path.join(tmpdir(), "canli-up-"))), [], "no file, no servers");
});

test("canli-mcp upstream add, list and remove keep an owner-only file and warn about a key written out", () => {
  const home = mkdtempSync(path.join(tmpdir(), "canli-up-"));
  const a = upstreamCommand(home, ["add", "vendor", "https://mcp.example.com/mcp", "--header", "Authorization: Bearer ${VENDOR_KEY}"]);
  assert.equal(a.added, "vendor");
  assert.equal(a.warnings, undefined, "a key written as ${NAME} is not a warning");
  assert.equal(statSync(path.join(home, "upstreams.json")).mode & 0o777, 0o600);
  const b = upstreamCommand(home, ["add", "local", "--env", "TOKEN=abcdefghijklmnopqrstuvwxyz123456", "--", "node", "server.mjs"]);
  assert.match(b.warnings[0], /TOKEN is written out in full/);
  assert.deepEqual(upstreamCommand(home, ["list"]).servers.map((s) => [s.name, s.where]), [["vendor", "mcp.example.com"], ["local", "node server.mjs"]]);
  const saved = JSON.parse(readFileSync(path.join(home, "upstreams.json"), "utf8"));
  assert.deepEqual(saved.vendor, { headers: { Authorization: "Bearer ${VENDOR_KEY}" }, url: "https://mcp.example.com/mcp" });
  upstreamCommand(home, ["remove", "local"]);
  assert.deepEqual(upstreamCommand(home, ["list"]).servers.map((s) => s.name), ["vendor"]);
  assert.throws(() => upstreamCommand(home, ["add", "BadName", "https://x"]), /lowercase letters/);
  assert.throws(() => upstreamCommand(home, ["add", "nothing"]), /nothing is not a preset \(coingecko, .*\): give its url, or -- and its command/);
});

test("presets: a vendor's own server by its name alone, with the variables it needs named and never a key written out", () => {
  const home = mkdtempSync(path.join(tmpdir(), "canli-up-"));
  const fmp = upstreamCommand(home, ["add", "fmp"]);
  assert.deepEqual(fmp.set_first, ["FMP_API_KEY"]);
  assert.match(fmp.next, /^Set FMP_API_KEY in canli-mcp's environment, then restart/);
  assert.equal(fmp.where, "financialmodelingprep.com");
  const gecko = upstreamCommand(home, ["add", "coingecko"]);
  assert.equal(gecko.set_first, undefined, "keyless");
  const whales = upstreamCommand(home, ["add", "unusualwhales", "--tools", "get_*"]);
  assert.deepEqual(whales.set_first, ["UW_API_KEY"]);
  const saved = JSON.parse(readFileSync(path.join(home, "upstreams.json"), "utf8"));
  assert.deepEqual(saved.fmp, { url: "https://financialmodelingprep.com/mcp?apikey=${FMP_API_KEY}" });
  assert.deepEqual(saved.unusualwhales, { tools: ["get_*"], url: "https://api.unusualwhales.com/api/mcp", headers: { Authorization: "Bearer ${UW_API_KEY}" } });
  assert.equal(JSON.stringify(saved).includes("about"), false, "the description stays out of the file");
  const own = upstreamCommand(home, ["add", "coinpaprika", "https://example.com/mcp"]);
  assert.equal(own.where, "example.com", "an address given wins over the preset");
  const list = upstreamCommand(home, ["presets"]).presets;
  assert.deepEqual(list.find((p) => p.name === "alphavantage").needs, ["ALPHAVANTAGE_API_KEY"]);
  assert.deepEqual(list.find((p) => p.name === "kalshi").needs, []);
});

async function connect(upstreams, extra = {}) {
  const c = new Client({ name: "upstream-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: mkdtempSync(path.join(tmpdir(), "canli-home-")), CANLI_PACKS: "quant", CANLI_UPSTREAMS: JSON.stringify(upstreams), ...extra } }));
  const run = async (args) => { const r = await c.callTool({ name: "run_tool", arguments: args }); return { error: r.isError ? r.content[0].text : null, body: r.isError ? null : r.structuredContent ?? JSON.parse(r.content[0].text) }; };
  const privacy = async () => JSON.parse((await c.readResource({ uri: "canli://privacy" })).contents[0].text);
  return { c, run, privacy };
}

test("over stdio: another server's tools are found, run, batched and described, and the ones that act stay off", async () => {
  const { c, run, privacy } = await connect({ demo: { command: process.execPath, args: [FIXTURE] } });
  try {
    const found = (await run({ name: "find_tool", arguments: { query: "latest quote for a stock symbol" } })).body;
    assert.ok(found.rows.some((r) => r[0] === "get_quote" && r[1] === "demo"), JSON.stringify(found.rows));
    assert.equal((await run({ name: "get_quote", arguments: { symbol: "AAPL" } })).body.price, 101.5);
    const news = (await run({ name: "get_news_headlines", arguments: { topic: "rates" } })).body;
    assert.equal(news.topic, "rates");
    assert.ok(news.caution, "text from another server is scanned for words addressed to a model");
    const batch = (await run({ calls: [{ name: "demo_history", arguments: { symbol: "AAPL", days: 4 } }, { name: "return_stats", arguments: { returns: [0.01, -0.02, 0.03, 0.01] } }] })).body;
    assert.deepEqual(batch.results[0].result.closes, [100, 101, 102, 103], "a name already taken here gets the server's name in front");
    assert.ok(batch.results[1].result, "and runs in a batch beside a pack's tool");
    assert.equal((await run({ name: "submit_report", arguments: { symbol: "AAPL" } })).body.report, "about AAPL", "its own read-only annotation lets it in");
    const described = (await run({ name: "describe_tool", arguments: { name: "demo_history" } })).body;
    assert.deepEqual(Object.keys(described.input_schema.properties).sort(), ["days", "symbol"]);
    assert.match((await run({ name: "place_order", arguments: { symbol: "AAPL", qty: 1 } })).error, /No tool place_order/);
    assert.match((await run({ name: "fail_always", arguments: {} })).error, /upstream says no/);
    assert.match((await run({ name: "get_quote", arguments: { symbol: "AAPL" }, as_of: "2020-01-02" })).error, /cannot be held to 2020-01-02/);
    const p = (await privacy()).packs.demo;
    assert.equal(p.upstream, `${process.execPath} ${FIXTURE}`);
    assert.equal(p.tools, 5);
    assert.deepEqual(p.off_because_they_change_things, ["place_order"]);
  } finally {
    await c.close();
  }
});

test("over stdio: a server marked write offers its order tool alone, never inside a batch, and one that never answers is a pack with no tools", async () => {
  const { c, run, privacy } = await connect({ demo: { command: process.execPath, args: [FIXTURE], write: true, tools: ["get_*", "place_order"] }, dead: { command: process.execPath, args: ["-e", "process.exit(3)"] } });
  try {
    const run1 = await run({ name: "place_order", arguments: { symbol: "AAPL", qty: 2 } });
    assert.deepEqual(run1.body.placed, { symbol: "AAPL", qty: 2 });
    assert.equal((await run({ name: "describe_tool", arguments: { name: "place_order" } })).body.destructive, true);
    const batch = await c.callTool({ name: "run_tool", arguments: { calls: [{ name: "get_quote", arguments: { symbol: "A" } }, { name: "place_order", arguments: { symbol: "A", qty: 1 } }] } });
    assert.equal(batch.isError, true, batch.content[0].text);
    assert.match((await run({ name: "demo_history", arguments: { symbol: "A" } })).error, /No tool demo_history/, "only the tools named in tools");
    const tools = (await c.listTools()).tools;
    assert.equal(tools.find((t) => t.name === "run_tool").annotations.destructiveHint, true);
    const dead = (await privacy()).packs.dead;
    assert.equal(dead.tools, 0);
    assert.ok(dead.error, "why it has no tools");
  } finally {
    await c.close();
  }
});
