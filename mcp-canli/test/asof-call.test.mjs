// One run_tool call as of a past date: a tool that reads the world and cannot be held to the date is refused for that
// call in words for a call; a malformed or future date is refused; a calculation runs as before; a tool of the server's
// own that cannot be held is refused; and under a server-wide date, a call cannot ask for a later one. Every
// refusal comes before a tool runs, so nothing here reaches the network.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const base = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "" };
async function connect(env = {}) {
  const c = new Client({ name: "asof-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { ...base, ...env } }));
  return c;
}
const prices = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(0.0005 * i + 0.01 * Math.sin(i)));

test("one call as of a past date: tools that cannot be held to it are refused for that call, calculations run", async () => {
  const c = await connect();
  try {
    const run = (name, args, extra = {}) => c.callTool({ name: "run_tool", arguments: { name, arguments: args, ...extra } });
    const refused = await run("market_overview", {}, { as_of: "2020-03-02" });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /^market_overview cannot be held to 2020-03-02, so it cannot answer as of that date/);
    assert.match((await run("market_overview", {}, { as_of: "03/02/2020" })).content[0].text, /must be YYYY-MM-DD, not 03\/02\/2020/);
    assert.match((await run("market_overview", {}, { as_of: "2999-01-01" })).content[0].text, /2999-01-01 is in the future/);
    const asOf = await run("sharpe_ratio", { prices }, { as_of: "2020-03-02" });
    const now = await run("sharpe_ratio", { prices });
    assert.equal(asOf.isError, undefined);
    const strip = (r) => { const { ref: _ref, ...rest } = JSON.parse(r.content[0].text); return rest; };
    assert.deepEqual(strip(asOf), strip(now), "a calculation on what it is given is the same on any date");
    assert.equal((await run("find_tool", { query: "treasury yields" }, { as_of: "2020-03-02" })).isError, undefined);
    assert.match((await run("my_week", {}, { as_of: "2020-03-02" })).content[0].text, /^my_week cannot be held to 2020-03-02/);
  } finally {
    await c.close();
  }
});

test("under a server-wide date, a call cannot ask for a later one", async () => {
  const c = await connect({ CANLI_AS_OF: "2019-06-03" });
  try {
    const r = await c.callTool({ name: "run_tool", arguments: { name: "market_overview", arguments: {}, as_of: "2024-01-02" } });
    assert.match(r.content[0].text, /^market_overview cannot be held to 2019-06-03, so it is off in this run/);
  } finally {
    await c.close();
  }
});

test("a desk tool's own calls are held to the call's date: swarm under as_of, and under a holdout", async () => {
  const c = await connect();
  try {
    const swarm = async (extra = {}) => JSON.parse((await c.callTool({ name: "run_tool", arguments: { name: "swarm", arguments: { tool: "latest_price", companies: ["AAPL", "MSFT"], argument: "symbol" }, ...extra } })).content[0].text);
    const dated = await swarm({ as_of: "2020-01-02" });
    assert.equal(dated.failed, 2);
    assert.ok(dated.failures.rows.every(([, error]) => /latest_price cannot be held to 2020-01-02/.test(error)), JSON.stringify(dated.failures.rows));
    await c.callTool({ name: "run_tool", arguments: { name: "holdout_set", arguments: { from: "2024-01-01" } } });
    const held = await swarm();
    assert.ok(held.failures.rows.every(([, error]) => /cannot be held to 2023-12-31, so it is off while the holdout from 2024-01-01 is set/.test(error)), JSON.stringify(held.failures.rows));
  } finally {
    await c.close();
  }
});
