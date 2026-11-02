import assert from "node:assert/strict";
import test from "node:test";

import { coinP, decide, leakCheck, plusDays, portfolioReturn, readWeights, summarize } from "../recipes/agent_backtest.mjs";
import { chatWith, promptFor, readOrders } from "../recipes/exchange_agents.mjs";

test("weights: the last readable block, on the list and positive, scaled to one", () => {
  assert.deepEqual(readWeights('I like these. {"AAPL": 2, "XOM": 2, "TSLA": 5, "MSFT": -1}', ["AAPL", "XOM", "MSFT"]), { AAPL: 0.5, XOM: 0.5 });
  assert.deepEqual(readWeights("no idea", ["AAPL"]), {});
  assert.deepEqual(readWeights('{"nope": 1} then {"aapl": 1}', ["AAPL"]), { AAPL: 1 });
});

test("an agent's turn: it calls the server's tools, and its answer is read", async () => {
  const replies = [{ tool_calls: [{ id: "1", function: { name: "run_tool", arguments: '{"name":"price_history"}' } }] }, { content: 'Holding Apple. {"AAPL": 1}' }];
  const seen = [];
  const out = await decide({ model: async (messages) => { seen.push(messages.at(-1)); return replies.shift(); }, listTools: async () => [{ name: "run_tool", description: "d", inputSchema: {} }], callTool: async () => "prices", date: "2021-03-01", symbols: ["AAPL"] });
  assert.deepEqual(out.weights, { AAPL: 1 });
  assert.equal(out.tool_calls, 1);
  assert.equal(seen[1].content, "prices");
});

test("an agent that never settles holds nothing", async () => {
  const out = await decide({ model: async () => ({ tool_calls: [{ id: "1", function: { name: "x", arguments: "{}" } }] }), listTools: async () => [], callTool: async () => "y", date: "2021-03-01", symbols: ["AAPL"], maxTurns: 2 });
  assert.deepEqual(out.weights, {});
});

test("the coin: exact, and the leak check reads memory against what happened", async () => {
  assert.equal(coinP(1, 1), 0.5);
  assert.ok(Math.abs(coinP(8, 10) - 56 / 1024) < 1e-9);
  const r = await leakCheck({ model: async () => ({ content: '{"AAPL":"rise","XOM":"fall","MSFT":"rise"}' }), date: "2021-03-01", symbols: ["AAPL", "XOM", "MSFT"], moves: { AAPL: 0.1, XOM: 0.2, MSFT: 0.1 } });
  assert.deepEqual(r, { answered: 3, right: 2 });
});

test("the summary says when a model remembers", () => {
  const leak = (answered, right) => ({ date: "x", weights: { A: 1 }, return: 0.1, equal_weight: 0.05, leak: { answered, right } });
  assert.match(summarize([leak(10, 7)]).leak_check.reading, /Too few/);
  assert.match(summarize([leak(40, 32)]).leak_check.reading, /remembers these dates/);
  assert.match(summarize([leak(40, 21)]).leak_check.reading, /No sign/);
  assert.equal(summarize([leak(40, 21)]).mean_return_percent, 10);
});

test("returns and dates", () => {
  assert.equal(portfolioReturn({ A: 0.5, B: 0.5 }, { A: 0.1, B: -0.1 }), 0);
  assert.equal(plusDays("2021-03-01", 91), "2021-05-31");
});

test("exchange orders: anything unreadable is a pass, and the prompt carries the rules and no other agent", () => {
  assert.deepEqual(readOrders('Selling. [{"type":"market","asset":"ART1","side":"sell","quantity":5}]'), [{ type: "market", asset: "ART1", side: "sell", quantity: 5 }]);
  assert.deepEqual(readOrders("no thanks"), []);
  assert.deepEqual(readOrders("[broken"), []);
  const view = { step: 3, rules: "Positions may reach 2 times equity.", market: [], recent_trades: [], you: { cash: 1 }, waiting_for: ["someone-else"] };
  const p = promptFor("You manage risk.", view);
  assert.match(p[0].content, /You manage risk.*made-up money.*2 times equity/s);
  assert.ok(!p[1].content.includes("someone-else"));
});

test("where a request goes and which key it carries come only from the environment", async () => {
  const calls = [];
  const env = { ACME_BASE_URL: "https://example.test/v1/", ACME_API_KEY: "secret" };
  const chat = chatWith({ name: "a", provider: "ACME", model: "m", base_url: "https://evil.example", key_env: "ACME_API_KEY" }, env, async (url, init) => { calls.push([url, init.headers.Authorization]); return { ok: true, json: async () => ({ choices: [{ message: { content: "[]" } }] }) }; });
  assert.equal(await chat([]), "[]");
  assert.deepEqual(calls[0], ["https://example.test/v1/chat/completions", "Bearer secret"], "the list's own base_url is ignored");
  assert.throws(() => chatWith({ name: "a", provider: "AWS_SECRET/x" }, env), /provider must be a name/);
  assert.throws(() => chatWith({ name: "a", provider: "OTHER" }, env), /set OTHER_BASE_URL/);
});

test("the patient call waits past a slow start, and reports errors and status", async () => {
  const { createServer } = await import("node:http");
  const { patientFetch } = await import("../recipes/model_call.mjs");
  const server = createServer((req, res) => { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => setTimeout(() => { res.statusCode = b === "bad" ? 500 : 200; res.end(JSON.stringify({ got: b })); }, 50)); });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  const r = await patientFetch(url, { body: "hello" });
  assert.equal(r.ok, true);
  assert.deepEqual(await r.json(), { got: "hello" });
  assert.equal((await patientFetch(url, { body: "bad" })).status, 500);
  await assert.rejects(patientFetch(url, { body: "x", timeoutMs: 5 }), /did not answer/);
  server.close();
});
