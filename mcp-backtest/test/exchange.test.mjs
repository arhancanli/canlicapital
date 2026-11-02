import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { agentConsensus, independentViews } from "../src/consensus.mjs";
import { findDiversifiers } from "../src/diversifiers.mjs";
import { createExchange, exchangeJoin, exchangeNew, exchangeOrders, exchangeReport, exchangeRun, exchangeStep, exchangeView, report, stepExchange } from "../src/exchange.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "exchange-"));
const totals = (s) => ({ cash: Object.values(s.agents).reduce((n, a) => n + a.cash, 0), shares: Object.values(s.agents).reduce((n, a) => n + Object.values(a.holdings).reduce((x, y) => x + y, 0), 0) });

test("money and shares are conserved through a whole market, shocks and forced selling included", () => {
  const s = createExchange({ seed: 3, assets: 2, leverage: 4, personas: { levered_long: 10 }, shocks: [{ step: 50, kind: "value", percent: -30 }, { step: 50, kind: "liquidity", steps: 10 }] });
  const before = totals(s);
  for (let i = 0; i < 300; i += 1) stepExchange(s);
  const after = totals(s);
  assert.ok(Math.abs(after.cash - before.cash) < 1e-4, `cash ${before.cash} ${after.cash}`);
  assert.equal(after.shares, before.shares);
  assert.ok(s.tape_count > 100);
});

test("the same seed gives the same tape, and another seed does not", () => {
  const run = (seed) => exchangeRun({ seed, steps: 200, shocks: [{ step: 100, kind: "block_sale", quantity: 2000 }] }).tape_hash;
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
});

test("the book goes by price, then time, and trades at the resting price", () => {
  const d = dir(), f = join(d, "x.json");
  exchangeNew({ exchange_file: f, seed: 1, personas: { market_maker: 0, value: 0, momentum: 0, noise: 0, deleverager: 0, stop_loss: 0, levered_long: 0 } });
  const a = exchangeJoin({ exchange_file: f, agent: "alice" }), b = exchangeJoin({ exchange_file: f, agent: "bob" }), c = exchangeJoin({ exchange_file: f, agent: "carol" });
  const last = exchangeView({ exchange_file: f, agent: "alice", token: a.token }).market[0].last;
  exchangeOrders({ exchange_file: f, agent: "alice", token: a.token, orders: [{ type: "limit", asset: "ART1", side: "sell", quantity: 10, price: last + 2 }] });
  exchangeOrders({ exchange_file: f, agent: "bob", token: b.token, orders: [{ type: "limit", asset: "ART1", side: "sell", quantity: 10, price: last + 1 }] });
  exchangeOrders({ exchange_file: f, agent: "carol", token: c.token, orders: [] });
  exchangeStep({ exchange_file: f });
  const seen = exchangeView({ exchange_file: f, agent: "carol", token: c.token });
  assert.equal(seen.market[0].asks[0][0], Math.round((last + 1) * 100) / 100, "best price on top");
  exchangeOrders({ exchange_file: f, agent: "alice", token: a.token, orders: [] });
  exchangeOrders({ exchange_file: f, agent: "bob", token: b.token, orders: [] });
  exchangeOrders({ exchange_file: f, agent: "carol", token: c.token, orders: [{ type: "market", asset: "ART1", side: "buy", quantity: 15 }] });
  exchangeStep({ exchange_file: f });
  const after = exchangeView({ exchange_file: f, agent: "carol", token: c.token });
  assert.equal(after.recent_trades[0].quantity, 10);
  assert.equal(after.recent_trades[0].price, Math.round((last + 1) * 100) / 100, "the resting order's price");
  assert.equal(after.recent_trades[1].quantity, 5, "what is left goes to the next price");
  assert.equal(after.recent_trades[1].price, Math.round((last + 2) * 100) / 100);
  assert.ok(!JSON.stringify(after.recent_trades).includes("alice"), "no names on the public tape");
  rmSync(d, { recursive: true, force: true });
});

test("an agent cannot act as another, and nobody moves time on the others", () => {
  const d = dir(), f = join(d, "x.json");
  exchangeNew({ exchange_file: f, seed: 1 });
  const a = exchangeJoin({ exchange_file: f, agent: "claude-analyst", about: "Claude, analyst brief" }), b = exchangeJoin({ exchange_file: f, agent: "gpt-risk", about: "GPT, risk brief" });
  assert.throws(() => exchangeOrders({ exchange_file: f, agent: "gpt-risk", token: a.token, orders: [] }), /not gpt-risk's/);
  assert.throws(() => exchangeView({ exchange_file: f, agent: "claude-analyst", token: b.token }), /not claude-analyst's/);
  assert.throws(() => exchangeJoin({ exchange_file: f, agent: "gpt-risk" }), /already/);
  assert.throws(() => exchangeJoin({ exchange_file: f, agent: "market_maker-0" }), /already/, "nor take a persona's name");
  exchangeOrders({ exchange_file: f, agent: "claude-analyst", token: a.token, orders: [] });
  assert.throws(() => exchangeStep({ exchange_file: f }), /Still waiting for gpt-risk/);
  exchangeStep({ exchange_file: f, force: true });
  const r = exchangeReport({ exchange_file: f });
  assert.equal(r.steps, 1);
  assert.equal(r.who.rows.find((x) => x[0] === "gpt-risk")[6], "GPT, risk brief");
  rmSync(d, { recursive: true, force: true });
});

test("an agent cannot see what it should not: no other positions, no true value", () => {
  const d = dir(), f = join(d, "x.json");
  exchangeNew({ exchange_file: f, seed: 1 });
  const a = exchangeJoin({ exchange_file: f, agent: "alice" });
  exchangeOrders({ exchange_file: f, agent: "alice", token: a.token, orders: [] });
  exchangeStep({ exchange_file: f });
  const v = JSON.stringify(exchangeView({ exchange_file: f, agent: "alice", token: a.token }));
  assert.ok(!v.includes("market_maker-0") && !v.includes("value\":") && !v.includes("holdings\":{\"ART1\":0"));
  rmSync(d, { recursive: true, force: true });
});

test("orders past the leverage limit are refused, and trades that only shrink a position are not", () => {
  const s = createExchange({ seed: 1, personas: { market_maker: 4, value: 0, momentum: 0, noise: 0, deleverager: 0, stop_loss: 0, levered_long: 0 }, leverage: 1 });
  s.agents.me = { cash: 1000, holdings: { ART1: 0 }, persona: "agent", forced: 0, trades: 0, start: 1000 };
  s.joined.push("me");
  for (let i = 0; i < 3; i += 1) stepExchange(s);
  s.pending.me = [{ type: "market", asset: "ART1", side: "buy", quantity: 1000 }];
  stepExchange(s);
  assert.equal(s.agents.me.holdings.ART1, 0);
  assert.equal(s.rejected, 1);
  s.agents.me.holdings.ART1 = 5; s.pending.me = [{ type: "market", asset: "ART1", side: "sell", quantity: 2 }];
  stepExchange(s);
  assert.equal(s.agents.me.holdings.ART1, 3);
});

test("more leverage turns the same shock into more forced selling and a deeper fall, across seeds", () => {
  const shocks = [{ step: 150, kind: "value", percent: -20 }, { step: 150, kind: "liquidity", steps: 15 }];
  const summary = (leverage, personas) => {
    let forced = 0, fall = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) { const r = exchangeRun({ seed, steps: 300, shocks, leverage, personas }); forced += r.cascades.forced_share_of_volume_percent; fall += r.assets[0].worst_fall_percent; }
    return { forced: forced / 6, fall: fall / 6 };
  };
  const calm = summary(1, { levered_long: 0, deleverager: 0, stop_loss: 0, momentum: 0 });
  const wild = summary(4, { levered_long: 12, deleverager: 8, stop_loss: 6, momentum: 6 });
  assert.equal(calm.forced, 0);
  assert.ok(wild.forced > 1, `forced ${wild.forced}`);
  assert.ok(wild.fall < calm.fall, `falls ${wild.fall} ${calm.fall}`);
});

test("a block sale comes from someone who holds the block, and hits the book", () => {
  const r = exchangeRun({ seed: 2, steps: 60, shocks: [{ step: 30, kind: "block_sale", quantity: 5000 }] });
  assert.ok(r.who.rows.some((x) => x[0] === "block_seller"));
});

test("the report's hash matches a replay of the file's run", () => {
  const d = dir(), f = join(d, "x.json");
  exchangeNew({ exchange_file: f, seed: 9 });
  exchangeStep({ exchange_file: f, steps: 40 });
  const s = createExchange({ seed: 9 });
  for (let i = 0; i < 40; i += 1) stepExchange(s);
  assert.equal(exchangeReport({ exchange_file: f }).tape_hash, report(s).tape_hash);
  assert.ok(!existsSync(`${f}.lock`), "the lock is released");
  rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
test("independent views: k for unrelated series, about one for copies", () => {
  const a = [1, -1, 1, -1, 1, -1, 1, -1], b = [1, 1, -1, -1, 1, 1, -1, -1], c = [1, 1, 1, 1, -1, -1, -1, -1];
  assert.equal(independentViews([a, b, c]), 3);
  assert.equal(independentViews([a, a, a]), 1);
});

test("five copies of one model count as one view; separate ones as more", () => {
  const qs = Array.from({ length: 20 }, (_, i) => `q${i}`);
  const outcomes = qs.map((q, i) => ({ question: q, happened: i % 2 === 0 }));
  const noisy = (seed) => qs.map((q, i) => ({ question: q, probability: Math.min(0.95, Math.max(0.05, (i % 2 === 0 ? 0.7 : 0.3) + 0.2 * Math.sin((i + 1) * seed * 1.7))) }));
  const open = { question: "open", probability: 0.8 };
  const copies = agentConsensus({ agents: Array.from({ length: 5 }, (_, i) => ({ name: `copy${i}`, forecasts: [...noisy(1), open] })), outcomes });
  assert.equal(copies.independent_views, 1);
  assert.match(copies.reading, /about 1 independent view/);
  assert.match(copies.reading, /shared thinking/);
  const separate = agentConsensus({ agents: [1, 2.3, 3.1, 4.7, 5.9].map((seed, i) => ({ name: `model${i}`, forecasts: [...noisy(seed), open] })), outcomes });
  assert.ok(separate.independent_views > 2, String(separate.independent_views));
  assert.equal(copies.combined.rows[0][0], "open");
  assert.equal(copies.combined.rows[0][2], 0.8);
});

test("a better record earns more weight, and a question without every agent still combines", () => {
  const qs = Array.from({ length: 12 }, (_, i) => `q${i}`);
  const outcomes = qs.map((q, i) => ({ question: q, happened: i % 3 === 0 }));
  const good = qs.map((q, i) => ({ question: q, probability: i % 3 === 0 ? 0.9 : 0.1 })), bad = qs.map((q, i) => ({ question: q, probability: i % 3 === 0 ? 0.3 : 0.7 }));
  const r = agentConsensus({ agents: [{ name: "good", forecasts: [...good, { question: "x", probability: 0.9 }] }, { name: "bad", forecasts: [...bad, { question: "x", probability: 0.1 }, { question: "y", probability: 0.4 }] }], outcomes });
  const w = Object.fromEntries(r.records.rows.map((x) => [x[0], x[4]]));
  assert.ok(w.good > w.bad);
  const x = r.combined.rows.find((row) => row[0] === "x");
  assert.ok(x[2] > 0.5, "leans to the better record");
  assert.equal(r.combined.rows.find((row) => row[0] === "y")[1], 1);
});

// ---------------------------------------------------------------------------------------------
test("find_diversifiers ranks by bets added and worst days, not by return", () => {
  const d = dir(), book = join(d, "book.csv"), cand = join(d, "cand.csv");
  const days = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
  const w = (i, k) => Math.sin(i * k) * 0.01;
  const mk = days.map((_, i) => w(i, 0.7));
  writeFileSync(book, `date,core\n${days.map((x, i) => `${x},${mk[i]}`).join("\n")}\n`);
  // Same bet with a high return; something unrelated with a modest one; something that gains when the book loses.
  writeFileSync(cand, `date,same_bet,unrelated,hedge\n${days.map((x, i) => `${x},${mk[i] * 1.1 + 0.003},${w(i, 2.3) + 0.0001},${-mk[i] + w(i, 3.1) * 0.2}`).join("\n")}\n`);
  const r = findDiversifiers({ book_file: book, candidates_file: cand });
  const names = r.rows.map((x) => x[0]);
  assert.equal(names.at(-1), "same_bet", "the highest return comes last: it is the same bet");
  assert.ok(r.rows.find((x) => x[0] === "unrelated")[5] > 0.5);
  assert.match(r.limits[0], /3 candidates were compared/);
  rmSync(d, { recursive: true, force: true });
});

test("a file that is not an exchange is refused without quoting it", () => {
  const d = dir(), f = join(d, "private.txt");
  writeFileSync(f, "the secret in this file");
  assert.throws(() => exchangeReport({ exchange_file: f }), (e) => /not an agent exchange file/.test(e.message) && !e.message.includes("secret"));
  rmSync(d, { recursive: true, force: true });
});

test("one call cannot run an enormous market", () => {
  assert.throws(() => exchangeRun({ steps: 20000, assets: 10, personas: { noise: 200 } }), /agent-steps/);
});

test("with several assets, a market maker keeps quoting all of them", () => {
  const s = createExchange({ seed: 4, assets: 3, personas: { market_maker: 4, value: 0, momentum: 0, noise: 0, deleverager: 0, stop_loss: 0, levered_long: 0 } });
  stepExchange(s);
  for (const a of s.assets) assert.ok(s.books[a.id].bids.length > 0 && s.books[a.id].asks.length > 0, a.id);
});

test("a book has a depth limit", () => {
  const s = createExchange({ seed: 1, personas: { market_maker: 0, value: 0, momentum: 0, noise: 0, deleverager: 0, stop_loss: 0, levered_long: 0 } });
  s.agents.me = { cash: 1e12, holdings: { ART1: 1e9 }, persona: "agent", forced: 0, trades: 0, start: 1e12 };
  s.joined.push("me");
  for (let i = 0; i < 45; i += 1) { s.pending.me = Array.from({ length: 50 }, (_, j) => ({ type: "limit", asset: "ART1", side: "sell", quantity: 1, price: s.assets[0].last + 1 + i + j / 100 })); stepExchange(s); }
  assert.equal(s.books.ART1.asks.length, 2000);
  assert.ok(s.rejected >= 250);
});

test("a path with a null byte is refused by name", async () => {
  const { diversifiersInput } = await import("../src/diversifiers.mjs");
  assert.equal(diversifiersInput.safeParse({ book_file: "\u0000", candidates_file: "a.csv" }).success, false);
  assert.throws(() => exchangeNew({ exchange_file: "\u0000" }), /a file path/);
});

