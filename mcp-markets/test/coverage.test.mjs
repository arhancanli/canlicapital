// Markets beyond US stocks, against real responses (test/fixtures, captured by
// scripts/capture-coverage-fixtures.mjs). Expected values are read off the captured data.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import * as T from "../src/tools.mjs";
import { NOW, replayFetch } from "./replay.mjs";

function session(env = {}) {
  const r = replayFetch();
  return { s: createSession({ fetchImpl: r.fetchImpl, env, now: () => NOW, sleep: async () => {} }), calls: r.calls };
}
const window = { start: "2026-09-01", end: "2026-10-08" };

test("resolveSymbol: names and pairs become Yahoo codes; US share classes and foreign suffixes stay apart", () => {
  const cases = {
    AAPL: ["AAPL", true], "brk.b": ["BRK.B", true], "BRK-B": ["BRK.B", true], BTC: ["BTC", true],
    "SAP.DE": ["SAP.DE", false], "7203.T": ["7203.T", false], "0700.HK": ["0700.HK", false], "SHEL.L": ["SHEL.L", false],
    "EUR/USD": ["EURUSD=X", false], eurusd: ["EURUSD=X", false], "USD/JPY": ["USDJPY=X", false],
    gold: ["GC=F", false], "Crude Oil": ["CL=F", false], "S&P 500": ["^GSPC", false], "10-year yield": ["^TNX", false],
    bitcoin: ["BTC-USD", false], "BTC/USD": ["BTC-USD", false], "ETH-USD": ["ETH-USD", false], "DX-Y.NYB": ["DX-Y.NYB", false],
  };
  for (const [q, [symbol, us]] of Object.entries(cases)) {
    const r = T.resolveSymbol(q);
    assert.equal(r.symbol, symbol, q);
    assert.equal(r.us_listed, us, q);
  }
  assert.equal(T.yahooChartUrl("BRK.B", "2026-01-01", "2026-01-02").split("/chart/")[1].split("?")[0], "BRK-B");
  assert.equal(T.yahooChartUrl("SAP.DE", "2026-01-01", "2026-01-02").split("/chart/")[1].split("?")[0], "SAP.DE");
});

test("price_history: a currency pair, by its plain name, ends on the day asked for", async () => {
  const { s } = session();
  const r = await T.priceHistory(s, { symbol: "EUR/USD", ...window });
  assert.equal(r.symbol, "EURUSD=X");
  assert.equal(r.resolved_from, "EUR/USD");
  assert.equal(r.asset_class, "currency");
  assert.equal(r.currency, "USD");
  assert.equal(r.end, "2026-10-08", "the bar Yahoo stamps 2026-10-09 is after the window");
  assert.equal(r.close.at(-1), 1.1201);
  assert.equal(r.close[0], 1.1618);
  assert.match(r.notes[0], /US dollars per euro/);
  assert.deepEqual(r.dividends, []);
});

test("price_history: crude oil futures, the S&P 500 index and bitcoin, each with what its price means", async () => {
  const { s } = session();
  const oil = await T.priceHistory(s, { symbol: "crude oil", ...window });
  assert.equal(oil.symbol, "CL=F");
  assert.equal(oil.asset_class, "future");
  assert.equal(oil.close.at(-1), 91.49);
  assert.match(oil.notes[0], /front-month/);
  const spx = await T.priceHistory(s, { symbol: "S&P 500", ...window });
  assert.equal(spx.symbol, "^GSPC");
  assert.equal(spx.asset_class, "index");
  assert.equal(spx.close.at(-1), 7765.3599);
  assert.equal(spx.change.total_return, Math.round((7765.35986328125 / 7631.47021484375 - 1) * 1e8) / 1e8);
  const btc = await T.priceHistory(s, { symbol: "bitcoin", ...window });
  assert.equal(btc.symbol, "BTC-USD");
  assert.equal(btc.asset_class, "cryptocurrency");
  assert.equal(btc.count, 38, "crypto trades every day, weekends included");
});

test("price_history: stocks listed abroad keep their market suffix; London prices are flagged as pence", async () => {
  const { s } = session();
  const shel = await T.priceHistory(s, { symbol: "SHEL.L", ...window });
  assert.equal(shel.currency, "GBp");
  assert.equal(shel.close.at(-1), 3780.5);
  assert.ok(shel.notes.some((n) => /divide by 100 for pounds/.test(n)));
  const sap = await T.priceHistory(s, { symbol: "sap.de", ...window });
  assert.equal(sap.symbol, "SAP.DE");
  assert.equal(sap.currency, "EUR");
  assert.equal(sap.asset_class, "equity");
  assert.equal(sap.notes, undefined);
});

test("price_history: with Alpaca keys, other markets still come from Yahoo; with keyless prices off they say why", async () => {
  const keys = { ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "secret" };
  const { s, calls } = session(keys);
  const r = await T.priceHistory(s, { symbol: "EUR/USD", ...window });
  assert.equal(r.source, "Yahoo Finance chart data (no key)");
  assert.ok(calls.every((c) => !String(c.url).includes("alpaca")));
  const off = session({ ...keys, CANLI_KEYLESS_PRICES: "0" });
  await assert.rejects(T.priceHistory(off.s, { symbol: "gold", ...window }), /GC=F is not a US-listed stock.*CANLI_KEYLESS_PRICES=0/);
});
