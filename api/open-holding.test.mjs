import assert from "node:assert/strict";
import test from "node:test";
import { mergeOpened } from "canli-markets-mcp/src/xray-merge.mjs";
import { CACHED, createOpenHoldingHandler } from "./open-holding.js";

function call(handler, { method = "GET", query = {} } = {}) {
  const res = { headers: {}, code: null, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return Promise.resolve(handler({ method, query, headers: { "x-forwarded-for": "198.51.100.7" } }, res)).then(() => res);
}
const fund = { kind: "fund", fund: "Fund", period: "2026-06-30", filed: "2026-08-20", positions: [["Apple Inc", 7], ["NVIDIA Corp", 6]] };

test("a holding is opened once and kept by the CDN for a day", async () => {
  let asked = null;
  const res = await call(createOpenHoldingHandler({ open: async (_, s) => { asked = s; return fund; }, session: {} }), { query: { symbol: "voo" } });
  assert.equal(asked, "VOO");
  assert.equal(res.code, 200);
  assert.equal(res.headers["Cache-Control"], CACHED);
  assert.deepEqual(res.body.opened, fund);
  assert.ok(res.body.limits.length > 0);
});

test("the page's sum of two holdings is the tool's", async () => {
  const opened = { VOO: fund, AAPL: { kind: "stock", name: "Apple Inc." } };
  const sum = mergeOpened([{ symbol: "VOO", weight: 60 }, { symbol: "AAPL", weight: 40 }], (s) => opened[s], { top: 5 });
  assert.equal(sum.rows[0][0], "Apple Inc");
  assert.equal(sum.rows[0][1], 0.442);
  assert.deepEqual(sum.funds.map((f) => f.symbol), ["VOO"]);
});

test("nothing but a plain GET with a ticker reaches the SEC", async () => {
  const handler = createOpenHoldingHandler({ open: async () => assert.fail("not to be opened"), session: {} });
  assert.equal((await call(handler, { method: "POST", query: { symbol: "VOO" } })).code, 405);
  for (const symbol of ["", "../etc", "VOO VTI", "A".repeat(21), "<script>", ["VOO", "VTI"]]) {
    const res = await call(handler, { query: { symbol } });
    assert.equal(res.code, 400, String(symbol));
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
});

test("failures and passing answers are not kept", async () => {
  const failed = await call(createOpenHoldingHandler({ open: async () => { throw new Error("SEC down"); }, session: {} }), { query: { symbol: "VOO" } });
  assert.equal(failed.code, 502);
  assert.equal(failed.headers["Cache-Control"], "no-store");
  assert.ok(!JSON.stringify(failed.body).includes("SEC down"));
  const unnamed = await call(createOpenHoldingHandler({ open: async (_, s) => ({ kind: "stock", name: s }), session: {} }), { query: { symbol: "ZZZZ" } });
  assert.match(unnamed.headers["Cache-Control"], /s-maxage=300/);
});

test("one caller is held to a limit", async () => {
  let n = 0;
  const handler = createOpenHoldingHandler({ open: async () => fund, session: {}, limiter: () => (n++ ? 30 : 0) });
  assert.equal((await call(handler, { query: { symbol: "VOO" } })).code, 200);
  const held = await call(handler, { query: { symbol: "VOO" } });
  assert.equal(held.code, 429);
  assert.equal(held.headers["Retry-After"], "30");
});
