// backtest_forensics: smoothed returns, a result carried by a few days, an edge that fades and numbers too good are
// each flagged with their evidence, and clean noise is not; over stdio the search, lookahead and shape checks run
// together, the factors are skipped when asked, and the Lab's check says how to build it.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { shapeChecks } from "../src/forensics.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const noise = (n, seed, scale = 0.01, drift = 0) => { let x = seed >>> 0; return Array.from({ length: n }, () => { let u = 0; for (let k = 0; k < 6; k += 1) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; u += x / 4294967296; } return drift + (u - 3) * scale; }); };

test("each misleading shape is flagged with its evidence, and plain noise is not", () => {
  const clean = shapeChecks(noise(2000, 1, 0.01, 0.0003));
  assert.deepEqual(Object.values(clean).map((c) => c.flag), [false, false, false, false]);

  // Smoothed: each day's return is the average of the last five, as stale marks make it.
  const raw = noise(2005, 2, 0.01, 0.0004), smooth = raw.slice(4).map((_, i) => (raw[i] + raw[i + 1] + raw[i + 2] + raw[i + 3] + raw[i + 4]) / 5);
  const s = shapeChecks(smooth).smoothing_and_tails;
  assert.equal(s.flag, true);
  assert.ok(s.evidence.lag1_autocorrelation > 0.5 && s.evidence.sharpe_if_autocorrelation_removed < s.evidence.sharpe);

  // A loser except for twenty big days.
  const lumpy = noise(2000, 3, 0.01, -0.0004).map((x, i) => (i % 100 === 7 ? 0.08 : x));
  assert.equal(shapeChecks(lumpy).concentration.flag, true);
  assert.match(shapeChecks(lumpy).concentration.finding, /carry the whole result/);

  // Strong, then gone.
  const fading = [...noise(1000, 4, 0.01, 0.0015), ...noise(1000, 5, 0.01, 0)];
  assert.equal(shapeChecks(fading).decay.flag, true);

  // Too smooth to be real.
  const tooGood = noise(1000, 6, 0.002, 0.001);
  assert.equal(shapeChecks(tooGood).too_good.flag, true);
});

test("over stdio: the search, lookahead and shape checks run together; factors skipped; the Lab named", async (t) => {
  const home = mkdtempSync(path.join(tmpdir(), "canli-forensics-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const c = new Client({ name: "forensics-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  t.after(() => c.close());
  const n = 300, returns = noise(n, 7, 0.01, 0.0005);
  const dates = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10));
  const prices = [100]; for (let i = 1; i < n; i += 1) prices.push(prices[i - 1] * (1 + returns[i]));
  // Weights that know the next return: lookahead.
  const weights = prices.map((_, i) => (i + 1 < n && returns[i + 1] > 0 ? 1 : 0));
  const out = JSON.parse((await c.callTool({ name: "run_tool", arguments: { name: "backtest_forensics", arguments: { returns, dates, trials_tried: 40, variants: [noise(n, 8, 0.01), noise(n, 9, 0.01)], weights, prices, factors: false } } })).content[0].text);
  assert.equal(out.checks.search.evidence.trials_counted, 40);
  assert.equal(typeof out.checks.search.evidence.headline_p, "number", JSON.stringify(out.checks.search));
  assert.equal(out.checks.lookahead.flag, true, JSON.stringify(out.checks.lookahead).slice(0, 300));
  assert.ok(out.flags.includes("lookahead"));
  assert.match(out.checks.factor_exposure.finding, /factors: false/);
  assert.match(out.checks.originality.finding, /the Lab is not built on this machine/);
  assert.deepEqual(out.not_checked, ["factor_exposure", "originality"]);
  assert.match(out.believable_next, /track_commit/);
});
