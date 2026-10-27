// The breadth lab: effective bets on series with known structure, and a book on a synthetic panel
// checked for lookahead, sleeve count and the netting of trades.
import assert from "node:assert/strict";
import test from "node:test";

import { effectiveBets, runBreadth, signalCatalog, SIGNALS } from "../src/breadth.mjs";

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = (r) => () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const days = (n) => { const out = []; const d = new Date(Date.UTC(2010, 0, 4)); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; };

test("effective bets: n for independent series, 1 for copies, and a sign flip is the same idea", () => {
  const dates = days(1500), z = normal(rng(7));
  const indep = Array.from({ length: 6 }, () => Float64Array.from(dates, () => 0.01 * z()));
  assert.ok(Math.abs(effectiveBets(dates, indep).effective_bets - 6) < 0.3, JSON.stringify(effectiveBets(dates, indep)));
  const base = indep[0];
  const copies = [base, base.map((v) => -v), base.map((v) => 2 * v), base];
  assert.equal(effectiveBets(dates, copies).effective_bets, 1);
  const fam = effectiveBets(dates, [...indep, ...copies], ["a", "b", "c", "d", "e", "f", "g", "g", "g", "g"]);
  assert.equal(fam.families, 7);
  assert.equal(fam.ideas, 6, "family g copies family a: one idea; the other five stay apart");
  const merged = effectiveBets(dates, [indep[0], indep[0].map((v, i) => v + 0.001 * z()), indep[1]], ["x", "y", "z"]);
  assert.deepEqual(merged.idea_members.map((m) => m.sort()), [["x", "y"], ["z"]]);
});

function panel(nNames = 48, nDays = 900, seed = 3) {
  const dates = days(nDays), z = normal(rng(seed)), tickers = Array.from({ length: nNames }, (_, i) => `T${i}`);
  const prices = {}, groups = {}, dollarVolume = {};
  const market = Array.from(dates, () => 0.01 * z());
  tickers.forEach((t, k) => {
    let p = 50 + k, prev = 0;
    prices[t] = Float64Array.from(dates, (_, i) => { const r = 0.9 * market[i] + 0.015 * z() - 0.05 * prev; prev = r; p *= 1 + r; return p; });
    dollarVolume[t] = Float64Array.from(dates, () => 2e7 * (1 + k / 10) * Math.exp(0.3 * z()));
    groups[t] = `G${k % 4}`;
  });
  return { dates, tickers, prices, groups, dollarVolume };
}

test("a breadth book: one sleeve per signal and group, netted trades cost less, and no figure looks ahead", () => {
  const p = panel();
  const signals = ["mom_6_1", "rev_1m", "rev_1w", "lowvol_63", "max_21", "amihud_63"];
  const r = runBreadth({ ...p, signals, minNames: 8 });
  assert.equal(r.sleeves, signals.length * 4);
  assert.ok(r.book.netting_ratio < 1, `netting ratio ${r.book.netting_ratio}`);
  assert.ok(r.book.cost_per_year_netted < r.book.cost_per_year_standalone);
  assert.equal(r.effective_bets.families, signals.length);
  assert.equal(r.specs.length, r.sleeves); assert.match(r.specs[0].spec_sha256, /^[0-9a-f]{64}$/);
  // Change every price from day k on: nothing before day k may move.
  const k = 700, bumped = { ...p, prices: Object.fromEntries(p.tickers.map((t) => [t, p.prices[t].map((v, i) => (i >= k ? v * (1 + 0.3 * Math.sin(i)) : v))])) };
  const s = runBreadth({ ...bumped, signals, minNames: 8 });
  for (let j = 0; j < r.series.returns.length; j += 1) for (let i = 0; i < k; i += 1) {
    const a = r.series.returns[j][i], b = s.series.returns[j][i];
    assert.ok((Number.isNaN(a) && Number.isNaN(b)) || a === b, `${r.series.ids[j]} day ${i}: ${a} vs ${b}`);
  }
});

test("the catalog: every signal named, sourced and marked for its data", () => {
  const cat = signalCatalog();
  assert.equal(cat.length, Object.keys(SIGNALS).length);
  assert.ok(cat.every((s) => s.reference.length > 20 && ["price", "volume"].includes(s.needs)));
  assert.throws(() => runBreadth({ ...panel(12, 300), signals: ["amihud_63"], dollarVolume: null }), /needs dollar_volume_file/);
  assert.throws(() => runBreadth({ ...panel(12, 300), signals: ["nope"] }), /unknown signal/);
});
