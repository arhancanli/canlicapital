// The replay gate against a local stand-in server: an answer, a tool that declines, Cloudflare's CPU-limit page,
// a 429 waited out, an event stream, a call that never answers, and the verdict against a reference run.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { callOnce, judge } from "./replay.mjs";

const result = (id, text, isError = false) => JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) } });

test("each kind of answer is told apart, and the gate holds the candidate to the reference", async () => {
  let throttled = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { id, params: outer } = JSON.parse(body);
    assert.equal(outer.name, "run_tool", "recorded calls go through run_tool");
    const params = outer.arguments;
    const send = (status, type, text, headers = {}) => res.writeHead(status, { "Content-Type": type, ...headers }).end(text);
    if (params.name === "ok") return send(200, "application/json", result(id, "AAPL revenue 391.0 billion"));
    if (params.name === "declines") return send(200, "application/json", result(id, "Prices are off on this server", true));
    if (params.name === "cpu") return send(503, "text/plain", "error code: 1102");
    if (params.name === "cpu-page") return send(503, "text/html", "<html><title>Worker exceeded resource limits | example.workers.dev</title><span>Error 1102</span></html>");
    if (params.name === "down") return send(503, "text/plain", "upstream unavailable");
    if (params.name === "busy" && throttled++ === 0) return send(429, "application/json", "{}", { "Retry-After": "2" });
    if (params.name === "busy") return send(200, "application/json", result(id, "after the wait"));
    if (params.name === "stream") return send(200, "text/event-stream", `event: message\ndata: ${result(id, "streamed")}\n\n`);
    if (params.name === "rpc") return send(200, "application/json", JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown tool" } }));
    if (params.name === "cached") return send(200, "application/json", result(id, "from the SEC, partly cached"), { "X-Canli-Cache": "hit=2 stale=0 miss=1" });
    // "silent" never answers
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const slept = [];
  const call = (name, extra = {}) => callOnce(url, { name, arguments: {} }, { sleep: async (ms) => slept.push(ms), ...extra });
  try {
    assert.deepEqual([(await call("ok")).isError, (await call("ok")).text], [false, "AAPL revenue 391.0 billion"]);
    assert.equal((await call("declines")).isError, true);
    assert.equal((await call("cpu")).failed, "Cloudflare error 1102 (CPU limit)");
    assert.equal((await call("cpu-page")).failed, "Cloudflare error 1102 (CPU limit)", "the HTML error page too");
    assert.deepEqual([(await call("down")).failed, (await call("down")).body], ["HTTP 503", "upstream unavailable"], "any other failure keeps the start of its body");
    const busy = await call("busy");
    assert.deepEqual([busy.text, slept], ["after the wait", [2000]], "a 429 is waited out as Retry-After asks");
    assert.equal((await call("stream")).text, "streamed");
    assert.match((await call("rpc")).failed, /JSON-RPC error -32602/);
    assert.equal((await call("silent", { timeoutMs: 300 })).failed, "no answer in 0.3 s");
    assert.deepEqual([(await call("cached")).cache, (await call("ok")).cache], ["hit=2 stale=0 miss=1", undefined], "the Worker's cache count is kept");

    const reference = [{ name: "a", ms: 900, isError: true }, { name: "b", ms: 800, isError: false }, { name: "c", failed: "HTTP 500" }, { name: "d", ms: 700, isError: false }];
    const candidate = [{ name: "a", ms: 300, isError: true, bytes: 10, cache: "hit=0 stale=1 miss=3" }, { name: "b", ms: 200, isError: true, bytes: 10 }, { name: "c", ms: 100, isError: false, bytes: 10, cache: "hit=2 stale=0 miss=0" }, { name: "d", failed: "Cloudflare error 1102 (CPU limit)" }];
    const verdict = judge(candidate, reference);
    assert.deepEqual(verdict.failed, [{ name: "b", problem: "declines here but answers on the reference" }, { name: "d", problem: "Cloudflare error 1102 (CPU limit)" }]);
    assert.deepEqual([verdict.calls, verdict.passed, verdict.ok, verdict.ms.p50, verdict.bytes, verdict.cache], [4, 2, false, 200, 30, { hit: 2, stale: 1, miss: 3 }]);
    assert.equal(judge(candidate.slice(0, 1), reference.slice(0, 1)).ok, true, "declining as the reference declines passes");
    assert.equal(judge([{ name: "x", ms: 1, isError: false, bytes: 1 }]).cache, null, "no count from a server that sends none");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
