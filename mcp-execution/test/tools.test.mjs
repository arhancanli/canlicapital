// check_orders as the local server runs it: the core's verdicts and costs, the trader's limits file
// (which a call can only tighten), the kill switch, the digest that binds a check to its limits,
// and the fields that say what was and was not checked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkOrders } from "../src/core/js/pretrade-core.js";
import { canonicalJson } from "../src/core/scripts/canonical-json.mjs";
import { CHECK_LIMITS, COLUMNS, limitsDigest, runCheckOrders } from "../src/check-orders.mjs";
import { configuredToolsets, createSession, registerResources, registerTools, SERVER_INSTRUCTIONS, toolCheckOrders } from "../src/server.mjs";

const NOW = () => new Date("2026-09-28T14:30:00Z");
function session(files = {}) {
  const home = mkdtempSync(join(tmpdir(), "canli-exec-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(home, name), typeof body === "string" ? body : JSON.stringify(body));
  return { home, ...createSession({ home, toolsets: ["plan"], now: NOW }) };
}
const call = async (s, args) => (await toolCheckOrders(s, args)).structuredContent;
const row = (out, i = 0) => Object.fromEntries(out.columns.map((c, j) => [c, out.rows[i][j]]));

const MARKET = { AAPL: { price: 100, bid: 99.99, ask: 100.01, adv_usd: 5e9, daily_vol: 0.015, as_of: "2026-09-28T14:29:30Z" }, MSFT: { price: 400, bid: 399.9, ask: 400.1, adv_usd: 8e9, daily_vol: 0.012, as_of: "2026-09-28T14:29:00Z" } };
const BASE = { asset_class: "us_equity", market: MARKET };
const buy = (extra = {}) => ({ symbol: "AAPL", side: "buy", qty: 100, ...extra });

test("the verdicts and costs are the core's, rounded to 0.001 bp and to the cent", async () => {
  const orders = [buy({ qty: 1e5 }), { symbol: "MSFT", side: "sell", qty: 500, type: "limit", limit_price: 399 }, { symbol: "ZZZ", side: "buy", qty: 1 }];
  const fees = { per_share_usd: 0.005, min_usd: 1, sell_fee_rate: 0.0000278, as_of: "2026-09-01", source_url: "https://example.test/fees" };
  const out = await call(session(), { ...BASE, orders, fees });
  const core = checkOrders({ orders, market: MARKET, limits: {}, fees, as_of: out.as_of });
  assert.deepEqual(out.columns, COLUMNS);
  core.rows.forEach((r, i) => {
    const got = row(out, i);
    assert.equal(got.accepted, r.accepted);
    assert.deepEqual(got.reasons, r.reasons);
    for (const k of ["commission_bps", "half_spread_bps", "impact_bps_low", "impact_bps_base", "impact_bps_high", "total_bps_base"]) {
      if (r.cost?.[k] == null) assert.equal(got[k], null, k);
      else assert.ok(Math.abs(got[k] - r.cost[k]) <= 0.0005, `${k}: ${got[k]} vs ${r.cost[k]}`);
    }
  });
  assert.deepEqual(row(out, 2).reasons, ["inputs_missing"]);
  assert.equal(out.accepted + out.rejected, 3);
  assert.deepEqual(out.limits, CHECK_LIMITS);
  assert.equal(out.as_of, "2026-09-28T14:30:00.000Z", "as_of defaults to the time of the check");
});

test("the limits file is the ceiling: a call tightens it, never loosens it", async () => {
  const s = session({ "limits.json": { max_order_notional: 5000, allowed_symbols: ["MSFT", "AAPL"] } });
  const loose = await call(s, { ...BASE, orders: [buy({ qty: 100 })], limits: { max_order_notional: 1e9, allowed_symbols: ["AAPL", "TSLA"] } });
  assert.deepEqual(row(loose).reasons, ["order_notional_cap"], "the request's 1e9 cap cannot replace the file's 5,000");
  assert.deepEqual(loose.effective_limits, { max_order_notional: 5000, allowed_symbols: ["AAPL"] });
  assert.equal(loose.limits_file, join(s.home, "limits.json"));
  const tight = await call(s, { ...BASE, orders: [buy({ qty: 10 })], limits: { max_order_notional: 500 } });
  assert.deepEqual(row(tight).reasons, ["order_notional_cap"], "a request can tighten below the file");
});

// A seeded generator so the property test is the same on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test("10,000 random cases: a looser request changes no verdict (tighten-only property)", () => {
  const r = rng(20260928);
  const symbols = ["AAPL", "MSFT"];
  const numeric = ["max_position_frac", "max_gross", "max_net", "max_adv_frac", "price_collar_frac", "max_order_notional", "max_daily_notional"];
  let rejectedSomewhere = 0;
  for (let n = 0; n < 10000; n += 1) {
    const file = {};
    for (const k of numeric) if (r() < 0.6) file[k] = k.startsWith("max_order") || k.startsWith("max_daily") ? 1e3 + r() * 1e5 : r() * (k === "price_collar_frac" ? 0.05 : k === "max_adv_frac" ? 0.00002 : 1.5);
    if (r() < 0.3) file.allowed_symbols = r() < 0.5 ? ["AAPL"] : symbols;
    const looser = {};
    for (const [k, v] of Object.entries(file)) looser[k] = Array.isArray(v) ? [...v, "TSLA", "MSFT"] : v * (1 + r() * 3) + r();
    const orders = Array.from({ length: 1 + Math.floor(r() * 4) }, () => {
      const symbol = symbols[Math.floor(r() * 2)];
      const px = MARKET[symbol].price;
      return r() < 0.5 ? { symbol, side: r() < 0.5 ? "buy" : "sell", qty: 1 + Math.floor(r() * 400) } : { symbol, side: r() < 0.5 ? "buy" : "sell", qty: 1 + Math.floor(r() * 400), type: "limit", limit_price: px * (0.95 + r() * 0.1), reduce_only: r() < 0.2 };
    });
    const account = { equity: 5e4 + r() * 1e5, positions: { AAPL: Math.floor(r() * 600) - 300, MSFT: Math.floor(r() * 200) - 100 } };
    const input = { ...BASE, orders, account, as_of: "2026-09-28T14:30:00Z" };
    const plain = runCheckOrders(input, { baseLimits: file, kill: { engaged: false } });
    const asked = runCheckOrders({ ...input, limits: looser }, { baseLimits: file, kill: { engaged: false } });
    assert.deepEqual(asked.rows.map((x) => [x[3], x[4]]), plain.rows.map((x) => [x[3], x[4]]), `case ${n}`);
    assert.equal(asked.limits_digest, plain.limits_digest, `case ${n}: the effective limits are the file's`);
    if (plain.rejected) rejectedSomewhere += 1;
  }
  assert.ok(rejectedSomewhere > 2000, `the cases exercise rejections (${rejectedSomewhere})`);
});

test("an invalid or unreadable limits file refuses instead of running without it", async () => {
  await assert.rejects(call(session({ "limits.json": "{ not json" }), { ...BASE, orders: [buy()] }), /could not be read as JSON .*checks refuse rather than run without it/);
  await assert.rejects(call(session({ "limits.json": { max_gross: -1 } }), { ...BASE, orders: [buy()] }), /limits file .* is not valid .*max_gross/);
  await assert.rejects(call(session({ "limits.json": { max_leverage: 3 } }), { ...BASE, orders: [buy()] }), /is not valid/);
});

test("the kill switch file rejects every order, reduce-only included, and is read on every call", async () => {
  const s = session();
  const args = { ...BASE, orders: [buy(), { symbol: "AAPL", side: "sell", qty: 10, reduce_only: true }], account: { equity: 1e6, positions: { AAPL: 100 } } };
  assert.equal((await call(s, args)).kill_switch, "clear");
  writeFileSync(join(s.home, "KILL"), "");
  const killed = await call(s, args);
  assert.equal(killed.kill_switch, "engaged");
  assert.deepEqual(killed.rows.map((x) => x[4]), [["kill_switch_engaged"], ["kill_switch_engaged"]]);
  rmSync(join(s.home, "KILL"));
  assert.equal((await call(s, args)).rejected, 0);
});

test("limits_digest is sha256 of the effective limits in canonical JSON, whatever order the keys came in", async () => {
  const a = await call(session(), { ...BASE, orders: [buy()], limits: { max_gross: 1, allowed_symbols: ["MSFT", "AAPL"] } });
  const b = await call(session(), { ...BASE, orders: [buy()], limits: { allowed_symbols: ["AAPL", "MSFT"], max_gross: 1 } });
  assert.equal(a.limits_digest, b.limits_digest);
  assert.equal(a.limits_digest, `sha256:${createHash("sha256").update(canonicalJson({ allowed_symbols: ["AAPL", "MSFT"], max_gross: 1 })).digest("hex")}`);
  assert.notEqual(a.limits_digest, (await call(session(), { ...BASE, orders: [buy()], limits: { max_gross: 0.9 } })).limits_digest);
  assert.equal(limitsDigest({}), `sha256:${createHash("sha256").update("{}").digest("hex")}`);
});

test("the limits resource reports the file, its digest and the kill switch, and matches the tool", async () => {
  const s = session({ "limits.json": { allowed_symbols: ["MSFT", "AAPL"], max_gross: 1 } });
  let read;
  registerResources({ registerResource: (_n, _u, _m, fn) => { read = fn; } }, s);
  const body = JSON.parse((await read(new URL("execution://limits"))).contents[0].text);
  assert.equal(body.exists, true);
  assert.equal(body.kill_switch, "clear");
  assert.equal(body.limits_digest, (await call(s, { ...BASE, orders: [buy()] })).limits_digest);
});

test("checks_applied and checks_skipped say what ran: no account means no position caps, and says so", async () => {
  const out = await call(session(), { ...BASE, orders: [buy()], limits: { max_position_frac: 0.1, max_order_notional: 1e6 } });
  assert.ok(out.checks_applied.includes("order_notional_cap"));
  assert.ok(!out.checks_applied.includes("position_cap"));
  assert.match(out.checks_skipped.find((c) => c.check === "position_cap").reason, /no account given/);
  const withBook = await call(session(), { ...BASE, orders: [buy()], limits: { max_position_frac: 0.1, max_gross: 1 }, account: { equity: 1e6, positions: {} } });
  for (const c of ["position_cap", "gross_cap", "reduce_only_integrity", "systemic_breach", "kill_switch"]) assert.ok(withBook.checks_applied.includes(c), c);
});

test("fees: the source and its age are reported; a stale or unsourced schedule is warned; crypto takes no US sell fees", async () => {
  const stale = await call(session(), { ...BASE, orders: [buy()], fees: { commission_bps: 1, as_of: "2026-05-01" } });
  assert.deepEqual(stale.fee_sources, [{ source_url: null, as_of: "2026-05-01", stale: true }]);
  assert.ok(stale.warnings.some((w) => /150 days before as_of/.test(w)));
  assert.ok(stale.warnings.some((w) => /no source_url/.test(w)));
  const none = await call(session(), { ...BASE, orders: [buy()] });
  assert.deepEqual(none.fee_sources, []);
  assert.ok(none.not_modelled.includes("commission: no fee schedule given"));
  await assert.rejects(call(session(), { asset_class: "crypto_spot", market: { BTCUSD: { price: 60000 } }, orders: [{ symbol: "BTCUSD", side: "sell", qty: 0.1 }], fees: { commission_bps: 15, sell_fee_rate: 0.0000278, as_of: "2026-09-01" } }), /US equity regulatory fees/);
});

test("at the open: the overnight gap is a timing risk from the stated overnight_vol, or not modelled", async () => {
  const market = { AAPL: { ...MARKET.AAPL, overnight_vol: 0.008 }, MSFT: MARKET.MSFT };
  const out = await call(session(), { asset_class: "us_equity", market, execution: "at_open", orders: [buy({ qty: 1000 }), { symbol: "MSFT", side: "buy", qty: 10 }] });
  assert.deepEqual(out.timing_risk, [{ symbol: "AAPL", sd_bps: 80, sd_usd: 800 }]);
  assert.ok(out.not_modelled.includes("timing risk at the open: no overnight_vol for MSFT"));
  assert.equal((await call(session(), { ...BASE, orders: [buy()] })).timing_risk, undefined);
});

test("a walked book is reported beside the modelled cost", async () => {
  const market = { AAPL: { ...MARKET.AAPL, book: { asks: [[100.01, 100], [100.05, 100]] } } };
  const out = await call(session(), { asset_class: "us_equity", market, orders: [buy({ qty: 250 })] });
  assert.deepEqual(out.walked_book, [{ symbol: "AAPL", vwap: 100.03, filled_qty: 200, levels_used: 2, book_exhausted: true }]);
});

test("malformed calls are refused with the field named", async () => {
  await assert.rejects(call(session(), { ...BASE, orders: [] }), /orders/);
  await assert.rejects(call(session(), { ...BASE, orders: [buy({ qty: -1 })] }), /orders\.0\.qty/);
  await assert.rejects(call(session(), { ...BASE, orders: [buy()], venue: "live" }), /Unrecognized key/);
  await assert.rejects(call(session(), { market: MARKET, orders: [buy()] }), /asset_class/);
  await assert.rejects(call(session(), { ...BASE, orders: Array.from({ length: 201 }, () => buy()) }), /orders/);
});

test("toolsets: plan and journal by default; an unknown name is refused", () => {
  assert.deepEqual(configuredToolsets(undefined), ["plan", "journal"]);
  assert.deepEqual(configuredToolsets("all"), ["plan", "journal"]);
  assert.deepEqual(configuredToolsets("journal"), ["journal"]);
  assert.throws(() => configuredToolsets("plan,broker"), /Unknown toolset broker/);
  const names = [];
  registerTools({ registerTool: (n) => names.push(n) }, createSession({ toolsets: ["plan"] }));
  assert.deepEqual(names, ["size_position", "check_orders"]);
});

test("no output, description or instruction uses advice words", async () => {
  const { CHECK_ORDERS_DESCRIPTION, HOSTED_CHECK_ORDERS_DESCRIPTION } = await import("../src/check-orders.mjs");
  const { HOSTED_INSTRUCTIONS } = await import("../src/hosted.mjs");
  const outputs = [
    await call(session(), { ...BASE, orders: [buy(), buy({ symbol: "ZZZ" })], limits: { max_gross: 0.001 }, account: { equity: 1e3, positions: { AAPL: 5 } } }),
    await call(session(), { ...BASE, orders: [buy()], execution: "at_open", fees: { commission_bps: 1, as_of: "2025-01-01" } }),
  ];
  for (const text of [...outputs.map((o) => JSON.stringify(o)), CHECK_ORDERS_DESCRIPTION, HOSTED_CHECK_ORDERS_DESCRIPTION, SERVER_INSTRUCTIONS, HOSTED_INSTRUCTIONS]) {
    assert.doesNotMatch(text, /\b(should|recommend\w*|READY|eligible|Kelly|optimal)\b/i);
  }
});

test("a 1-order result stays compact", async () => {
  const out = await toolCheckOrders(session(), { ...BASE, orders: [buy()], fees: { commission_bps: 1, as_of: "2026-09-01", source_url: "https://example.test/f" }, limits: { max_order_notional: 1e6 } });
  assert.ok(out.content[0].text.length < 2200, `${out.content[0].text.length} characters`);
});
