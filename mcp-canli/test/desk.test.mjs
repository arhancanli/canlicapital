import assert from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { runBrief, runSwarm } from "../src/desk.mjs";
import { compare, fromStatement } from "../src/triangulate.mjs";
import { EPISODES, regress, rng, runWorlds, simulate } from "../src/worlds.mjs";

const at = (v, path) => path.split(".").reduce((x, k) => x?.[k], v);
function context(call) {
  const kept = new Map();
  let n = 0;
  return { call, at, hosted: false, keep: (r) => { const ref = `r${++n}`; kept.set(ref, r); return ref; }, get: (ref) => kept.get(ref), toolFor: async () => ({ input: z.object({ company: z.string() }), annotations: {} }) };
}

test("brief: a failed worker costs only its part, flags name their evidence, and full answers stay under refs", async () => {
  const answers = {
    company_report: { company: { ticker: "X", name: "X Corp", industry: "Software" }, financials: { columns: ["fiscal_year_end", "revenue", "operating_margin", "net_income", "operating_cash_flow"], rows: [["2024-12-31", 100, 0.4, 20, 30], ["2025-12-31", 110, 0.2, 20, 5]] }, market: { price: 10, market_cap: 1000 } },
    debt_profile: { debt: { total: 50 }, net_debt: 40, cash_and_equivalents: 10, maturities: { next_12_months: 30 }, cost_and_cover: { interest_coverage: 1.5 } },
  };
  const r = await runBrief(context(async (name) => { if (!answers[name]) throw new Error(`${name} failed`); return answers[name]; }), { company: "X", seconds: 5 });
  assert.equal(r.company.ticker, "X");
  const flags = r.flags.rows.map((f) => f[1]).join(" | ");
  assert.match(flags, /Operating margin fell from 40\.0% to 20\.0%/);
  assert.match(flags, /under half of net income/);
  assert.match(flags, /covers interest only 1\.5 times/);
  assert.equal(r.flags.rows[0][0], "high", "the most serious comes first");
  const row = (w) => r.workers.rows.find((x) => x[0] === w);
  assert.equal(row("report")[3], "ok");
  assert.ok(row("report")[4], "a ref to the full answer");
  assert.equal(row("segments")[3], "failed");
});

test("brief: a bank gets no free-cash-flow or debt reading", async () => {
  const answers = {
    company_report: { company: { ticker: "B", industry: "National Commercial Banks" }, financials: { columns: ["fiscal_year_end", "net_income", "operating_cash_flow", "free_cash_flow"], rows: [["2025-12-31", 50, -100, -100]] }, market: { price: 1, fcf_yield: -0.2 } },
    debt_profile: { debt: { total: 5 }, cash_and_equivalents: 1, maturities: { next_12_months: 9 }, cost_and_cover: {} },
  };
  const r = await runBrief(context(async (name) => { if (!answers[name]) throw new Error("none"); return answers[name]; }), { company: "B", seconds: 5 });
  assert.equal(r.debt, undefined);
  assert.equal(r.market.fcf_yield, undefined);
  assert.equal(r.flags.rows.length, 0);
  assert.match(r.financial_company, /left out/);
});

test("brief: a slow worker is named and does not hold the digest past the limit", async () => {
  const r = await runBrief(context((name) => (name === "company_report" ? new Promise(() => {}) : Promise.resolve({}))), { company: "X", seconds: 5 });
  assert.equal(r.workers.rows.find((x) => x[0] === "report")[3], "still running");
  assert.ok(r.elapsed_ms < 8000);
});

test("swarm: one table from many workers, ranked, with failures listed and medians", async () => {
  const r = await runSwarm(context(async (_, a) => { if (a.company === "BAD") throw new Error("no such company"); return { score: { v: { A: 1, B: 3, C: 2 }[a.company] } }; }), { tool: "t", companies: ["A", "B", "C", "BAD"], argument: "company", fields: ["score.v"], sort_by: "score.v" });
  assert.deepEqual(r.rows, [["B", 3], ["C", 2], ["A", 1]]);
  assert.equal(r.median["score.v"], 2);
  assert.equal(r.failed, 1);
  assert.equal(r.unfinished, 0);
});

test("swarm: refuses to nest, and refuses a tool that changes an account", async () => {
  await assert.rejects(runSwarm(context(async () => ({})), { tool: "swarm", companies: ["A"] }), /cannot run swarm/);
  const c = context(async () => ({}));
  c.toolFor = async () => ({ annotations: { destructiveHint: true } });
  await assert.rejects(runSwarm(c, { tool: "send_paper_orders", companies: ["A"], argument: "company" }), /read-only/);
});

test("swarm: an unfinished run hands back resume, and resuming loses and repeats nothing", async () => {
  const seen = [];
  const slow = (ms) => async (_, a) => { seen.push(a.company); await new Promise((r) => setTimeout(r, ms)); return { v: 1 }; };
  const names = Array.from({ length: 60 }, (_, i) => `C${i}`);
  const c = context(slow(1500));
  const first = await runSwarm(c, { tool: "t", companies: names, argument: "company", fields: ["v"], concurrency: 2, seconds: 5 });
  assert.ok(first.unfinished > 0 && first.resume);
  c.call = slow(1);
  const next = await runSwarm(c, { resume: first.resume, limit: 100 });
  assert.equal(next.unfinished, 0);
  assert.equal(next.finished, 60);
  assert.equal(new Set(next.rows.map((r) => r[0])).size, 60);
});

// Markets with known links: SPY drifts up with noise, XLF moves 1.5 times SPY.
function market(days = 1500, seed = 7) {
  const r = rng(seed), out = [];
  for (let t = 0; t < days; t += 1) { const m = 0.0004 + 0.01 * (r() - 0.5) * 2; out.push([m, 1.5 * m, m, 0, 0, 0, 0, 0]); }
  return out;
}

test("regress recovers a known link", () => {
  const r = rng(5), X = Array.from({ length: 800 }, () => [0.01 * (r() - 0.5), 0.01 * (r() - 0.5)]), y = X.map((x) => 0.5 * x[0] - 1.2 * x[1]);
  const b = regress(X, y);
  assert.ok(Math.abs(b[0] - 0.5) < 0.01 && Math.abs(b[1] + 1.2) < 0.01, String(b));
});

test("simulate: the same seed gives the same worlds; a crisis lowers the tail; a holding with no market link ignores it", () => {
  const factorDays = market(), n = factorDays.length, zero = new Float64Array(n);
  const shared = { factorDays, weights: [1], betas: [[1, 0, 0, 0, 0, 0, 0, 0]], residuals: [zero], worlds: 400, horizon: 252 };
  const crash = { path: Array.from({ length: 40 }, () => [-0.02, -0.03, -0.02, 0, 0, 0, 0, 0]) };
  const calm = simulate({ ...shared, shocks: [], seed: 1 }), again = simulate({ ...shared, shocks: [], seed: 1 }), hit = simulate({ ...shared, shocks: [crash], seed: 1 });
  assert.deepEqual(Array.from(calm.totals), Array.from(again.totals));
  const p5 = (run) => Float64Array.from(run.totals).sort()[20];
  assert.ok(p5(hit) < p5(calm) - 0.2, "a crisis takes the tail well below the calm worlds");
  const cash = simulate({ ...shared, betas: [[0, 0, 0, 0, 0, 0, 0, 0]], shocks: [crash], seed: 1 });
  assert.ok(Math.max(...cash.totals.map(Math.abs)) < 1e-9, "no link to the markets, no effect");
});

test("stress_worlds: combined crises hurt more than one alone; bad inputs are refused by name", async () => {
  const dates = [], close = [];
  let v = 100;
  const r = rng(3);
  for (let d = Date.parse("2007-04-11"); d < Date.parse("2026-10-01"); d += 86400000) {
    const day = new Date(d);
    if (day.getUTCDay() % 6 === 0) continue;
    const iso = day.toISOString().slice(0, 10);
    let drift = 0.0003;
    if (iso >= EPISODES.bank_crisis.from && iso <= EPISODES.bank_crisis.to) drift = -0.004;
    if (iso >= EPISODES.compute_bust.from && iso <= EPISODES.compute_bust.to) drift = -0.003;
    v *= 1 + drift + 0.008 * (r() - 0.5);
    dates.push(iso); close.push(v);
  }
  const c = context(async (_, a) => { if (a.symbol === "NOPE") throw new Error("no such symbol"); return { dates, close }; });
  const out = await runWorlds(c, { holdings: [{ symbol: "SPY", weight: 1 }], scenarios: ["bank_crisis", "compute_bust", "bank_crisis+compute_bust"], worlds: 500, horizon_days: 252 });
  const tail = Object.fromEntries(out.rows.map((x) => [x[0], x[4]]));
  assert.ok(tail["bank_crisis+compute_bust"] < tail.bank_crisis);
  assert.ok(tail.bank_crisis < tail["no crisis added"]);
  assert.ok(out.fit.rows[0][2] > 0.9);
  await assert.rejects(runWorlds(c, { holdings: [{ symbol: "NOPE", weight: 1 }] }), /NOPE had none/);
  await assert.rejects(runWorlds(c, { holdings: [{ symbol: "SPY", weight: 1 }], scenarios: ["aliens"] }), /no scenario "aliens"/);
  await assert.rejects(runWorlds(c, { holdings: [{ symbol: "SPY", weight: 1 }], custom: [{ name: "x", moves: { MOON: -0.5 }, days: 5 }] }), /not MOON/);
});

test("triangulate: rounding agrees, scales and signs are named, and the parent's statement ends where a registrant's begins", () => {
  assert.equal(compare(47941000000, 47941200000, { scale: 1e6 }), "agree");
  assert.equal(compare(3.04, 3.05, { perShare: true }), "agree");
  assert.equal(compare(3511400000, 3511), "apart by a factor of 1,000,000");
  assert.equal(compare(100, -100), "opposite signs");
  assert.match(compare(100, 60), /apart by 40/);
  assert.equal(compare(null, 5), null);
  const table = { columns: ["line", "concept", "12 months to 2025-12-31"], money_scale: 1e6, rows: [["Revenue", "us-gaap:Revenues", 29553], ["Net income", "us-gaap:NetIncomeLoss", 4341], ["Revenue", "us-gaap:Revenues", 19331], ["Net income", "us-gaap:NetIncomeLoss", 440]] };
  const m = { statement: "income", tags: ["us-gaap:NetIncomeLoss"] };
  assert.equal(fromStatement(table, m).value, 4341e6);
  const only = { ...table, rows: [["Revenue", "us-gaap:Revenues", 29553], ["Profit", "us-gaap:ProfitLoss", 1758], ["Revenue", "us-gaap:Revenues", 19331], ["Net income", "us-gaap:NetIncomeLoss", 440]] };
  assert.equal(fromStatement(only, m), null, "a subsidiary's line is not the parent's");
});
