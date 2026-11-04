// `canli-mcp gui` and `canli-mcp serve`: loopback only, the token required, requests from web pages
// refused, and the tools reachable over each way in.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import WebSocket from "ws";

import { startGui } from "../local/gui.mjs";
import { startServe, WebSocketTransport } from "../local/serve.mjs";
import { registerAll, SERVER_INFO } from "../src/server.mjs";

test("only local/ listens: it binds the loopback address, imports what it needs and nothing else", () => {
  for (const f of readdirSync(LOCAL).filter((x) => x.endsWith(".mjs"))) {
    const text = readFileSync(new URL(f, LOCAL), "utf8");
    // commands.mjs is the one place anything starts, and only what a person asked for on the command line
    // or named as an upstream server in their own upstreams file (through the MCP SDK's stdio client).
    const execs = f === "commands.mjs";
    for (const m of text.matchAll(/(?:from\s+|import\()\s*"([^"]+)"/g)) if (!m[1].startsWith(".")) assert.match(m[1], execs ? /^(node:child_process|@modelcontextprotocol\/client\/stdio)$/ : /^(ws|@modelcontextprotocol\/client|@modelcontextprotocol\/server|node:(crypto|fs|http|path))$/, `${f} imports ${m[1]}`);
    for (const m of text.matchAll(/\.listen\(([^)]*)\)/g)) assert.equal(m[1].split(",")[1]?.trim(), '"127.0.0.1"', `${f} binds only the loopback address`);
    assert.doesNotMatch(text, execs ? /worker_threads|\beval\s*\(|new Function/ : /child_process|worker_threads|\beval\s*\(|new Function/, f);
  }
});

const makeServer = async () => { const s = new McpServer(SERVER_INFO, {}); registerAll(s, ["quant", "validation"]); return s; };
const LOCAL = new URL("../local/", import.meta.url);
const raw = (port, path, { method = "GET", headers = {}, body } = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body });

test("the browser page needs its token, and its calls are limited to search, describe and run", async (t) => {
  const gui = await startGui({ makeServer });
  t.after(() => gui.close());
  const token = new URL(gui.url).searchParams.get("token");
  assert.equal((await raw(gui.port, "/")).status, 401);
  assert.equal((await raw(gui.port, "/?token=wrong")).status, 401);
  const page = await raw(gui.port, `/?token=${token}`);
  assert.equal(page.status, 200);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'nonce-/);
  const html = await page.text();
  assert.ok(html.includes(token) && !html.includes("__TOKEN__") && !html.includes("__NONCE__"));
  const view = await raw(gui.port, "/view");
  assert.match(view.headers.get("content-security-policy"), /default-src 'none'/);
  assert.doesNotMatch(view.headers.get("content-security-policy"), /connect-src/, "the viewer has no network");
  assert.doesNotMatch(await view.text(), /__TOKEN__/);
  const post = (headers, body) => raw(gui.port, "/call", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({}, { name: "find_tool", arguments: { query: "sharpe" } })).status, 401);
  assert.equal((await post({ "x-canli-token": token, origin: "https://evil.example" }, { name: "find_tool", arguments: { query: "sharpe" } })).status, 403);
  assert.equal((await post({ "x-canli-token": token }, { name: "something_else" })).status, 403);
  const found = await (await post({ "x-canli-token": token }, { name: "find_tool", arguments: { query: "deflated sharpe", limit: 3 } })).json();
  assert.ok(found.structuredContent.rows.length > 0);
  const ran = await (await post({ "x-canli-token": token }, { name: "run_tool", arguments: { name: "validate_deflated_sharpe", arguments: { observed_sharpe_annualized: 1.8, observations: 1000, periods_per_year: 252, skew: -0.2, non_excess_kurtosis: 4, effective_independent_trials: 40, cross_trial_sharpe_sd_annualized: 0.5 } } })).json();
  assert.ok(!ran.isError);
  assert.ok(ran.structuredContent.data.result.deflated_sharpe_ratio > 0.9);
});

test("a request naming another host is refused, so a rebinding page cannot reach either server", async (t) => {
  const gui = await startGui({ makeServer });
  const serve = await startServe({ makeServer, websocket: false });
  t.after(async () => { await gui.close(); await serve.close(); });
  const asEvil = (port, path) => new Promise((resolve, reject) => {
    import("node:http").then(({ request }) => {
      const req = request({ host: "127.0.0.1", port, path, headers: { host: "evil.example", authorization: `Bearer ${serve.token}` } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject); req.end();
    });
  });
  assert.equal(await asEvil(gui.port, "/view"), 403);
  assert.equal(await asEvil(serve.port, "/mcp"), 403);
});

test("serve over Streamable HTTP: token required, and a real client lists and runs tools", async (t) => {
  const serve = await startServe({ makeServer, websocket: false, token: "secret-token" });
  t.after(() => serve.close());
  assert.equal((await fetch(serve.http, { method: "POST" })).status, 401);
  assert.equal((await fetch(serve.http, { method: "POST", headers: { authorization: "Bearer nope" } })).status, 401);
  assert.equal((await fetch(serve.http, { method: "POST", headers: { authorization: "Bearer secret-token", origin: "https://evil.example" } })).status, 403);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(serve.http), { requestInit: { headers: { authorization: "Bearer secret-token" } } }));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.ok(tools.some((x) => x.name === "run_tool"));
  const r = await client.callTool({ name: "find_tool", arguments: { query: "sharpe" } });
  assert.ok(r.structuredContent.rows.length > 0);
});

test("serve over WebSocket: refused without the token, and a real client lists and runs tools", async (t) => {
  const serve = await startServe({ makeServer, token: "secret-token" });
  t.after(() => serve.close());
  const refused = new WebSocket(serve.ws);
  assert.equal(await new Promise((ok) => { refused.on("unexpected-response", (_, res) => ok(res.statusCode)); refused.on("error", () => ok("error")); }), 401);
  const fromPage = new WebSocket(serve.ws, { headers: { authorization: "Bearer secret-token", origin: "https://evil.example" } });
  assert.equal(await new Promise((ok) => { fromPage.on("unexpected-response", (_, res) => ok(res.statusCode)); fromPage.on("error", () => ok("error")); }), 403);
  const socket = new WebSocket(serve.ws, { headers: { authorization: "Bearer secret-token" } });
  await new Promise((ok, fail) => { socket.once("open", ok); socket.once("error", fail); });
  const client = new Client({ name: "t", version: "0" });
  await client.connect(new WebSocketTransport(socket));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.ok(tools.some((x) => x.name === "run_tool"));
  const r = await client.callTool({ name: "describe_tool", arguments: { name: "validate_deflated_sharpe" } });
  assert.equal(r.structuredContent.name, "validate_deflated_sharpe");
});
