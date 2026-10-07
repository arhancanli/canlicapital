import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { GENESIS, LEDGER_LIMITS_TEXT, buildTrial, summarize, verifyChain } from "../src/ledger-core.mjs";
import { LEDGER_TOOL_DESCRIPTIONS, ledgerExport, ledgerSummary, readLedger, recordTrial } from "../src/ledger.mjs";

// A deterministic generator, so every run sees the same noise.
function noise(seed, length, mean = 0, scale = 0.01) {
  let s = seed;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return Array.from({ length }, () => mean + scale * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()));
}
const chain = (series) => {
  let prev = GENESIS;
  return series.map((returns, i) => { const t = buildTrial({ label: `v${i + 1}`, returns, periodsPerYear: 252, n: i + 1, prev, recordedAt: "2026-10-07T00:00:00Z" }); prev = t.hash; return t; });
};
const tempDir = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-ledger-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test("the best of 40 skill-less variants is not called skilled once the search is counted", () => {
  const trials = chain(Array.from({ length: 40 }, (_, i) => noise(i + 1, 504)));
  const s = summarize({ trials, periodsPerYear: 252 });
  assert.equal(s.trials, 40);
  assert.ok(s.best.sharpe_annualized > 0.8, "noise alone produced an impressive-looking best");
  assert.ok(s.expected_best_by_luck_annualized > 0.8, "luck alone is expected to reach that far");
  assert.ok(s.deflated.deflated_sharpe_ratio < 0.9, `deflated ${s.deflated.deflated_sharpe_ratio}`);
  assert.ok(s.overfitting.probability_of_backtest_overfitting > 0.2);
});

test("one variant with a real edge among noise keeps a high deflated Sharpe", () => {
  const series = Array.from({ length: 19 }, (_, i) => noise(i + 101, 1260));
  series.push(noise(999, 1260, 0.0015, 0.01)); // about 2.4 annualized
  const s = summarize({ trials: chain(series), periodsPerYear: 252 });
  assert.equal(s.best.label, "v20");
  assert.ok(s.deflated.deflated_sharpe_ratio > 0.95, `deflated ${s.deflated.deflated_sharpe_ratio}`);
});

test("the hash chain catches an edited, removed or reordered trial", () => {
  const trials = chain([noise(1, 60), noise(2, 60), noise(3, 60)]);
  assert.equal(verifyChain(trials).ok, true);
  assert.match(verifyChain([{ ...trials[0], sharpe_annualized: 9 }, ...trials.slice(1)]).reason, /changed after it was recorded/);
  assert.match(verifyChain([trials[0], trials[2]]).reason, /numbered 3/);
  assert.equal(verifyChain([trials[1], trials[0], trials[2]]).ok, false);
});

test("a ledger persists across calls, refuses another annualization and refuses a tampered file", (t) => {
  const dir = tempDir(t);
  const first = recordTrial(dir, { label: "a", sharpe_annualized: 1.2, observations: 500, periods_per_year: 252 });
  assert.match(first.ledger, /^search-[0-9a-f]{8}$/);
  recordTrial(dir, { ledger: first.ledger, label: "b", sharpe_annualized: 0.4, observations: 500 });
  const third = recordTrial(dir, { ledger: first.ledger, label: "c", returns: noise(7, 300) });
  assert.equal(third.trial, 3);
  assert.equal(ledgerSummary(dir, { ledger: first.ledger }).trials, 3);
  assert.equal(ledgerSummary(dir, { ledger: first.ledger, effective_trials: 2 }).effective_trials, 2);
  assert.throws(() => recordTrial(dir, { ledger: first.ledger, label: "d", sharpe_annualized: 1, observations: 50, periods_per_year: 12 }), /annualizes with periods_per_year 252/);
  assert.throws(() => recordTrial(dir, { label: "x", sharpe_annualized: 1, observations: 50 }), /periods_per_year is required/);
  const exported = ledgerExport(dir, { ledger: first.ledger });
  assert.equal(exported.records.length, 3);
  assert.equal(exported.chain_head, ledgerSummary(dir, { ledger: first.ledger }).chain_head);
  const file = path.join(dir, `${first.ledger}.jsonl`);
  const lines = readFileSync(file, "utf8").trim().split("\n");
  const edited = JSON.parse(lines[2]); edited.sharpe_annualized = 5;
  writeFileSync(file, [...lines.slice(0, 2), JSON.stringify(edited), ...lines.slice(3)].join("\n") + "\n");
  assert.throws(() => readLedger(dir, first.ledger), /fails its own hash chain at trial 2/);
});

test("an input must be returns or a Sharpe with its sample size, never both or neither", (t) => {
  const dir = tempDir(t);
  assert.throws(() => recordTrial(dir, { label: "x", periods_per_year: 252 }), /either returns or sharpe_annualized/);
  assert.throws(() => recordTrial(dir, { label: "x", periods_per_year: 252, returns: [0.01, 0.02], sharpe_annualized: 1, observations: 5 }), /not both/);
  assert.throws(() => recordTrial(dir, { label: "x", periods_per_year: 252, sharpe_annualized: 1 }), /observations must be an integer/);
  assert.throws(() => recordTrial(dir, { ledger: "../escape", label: "x", periods_per_year: 252, sharpe_annualized: 1, observations: 5 }), /lowercase letters/);
});

test("each description carries a sentence of the ledger's own limits verbatim", () => {
  assert.ok(LEDGER_TOOL_DESCRIPTIONS.ledger_record_trial.includes(LEDGER_LIMITS_TEXT[0]));
  assert.ok(LEDGER_TOOL_DESCRIPTIONS.ledger_summary.includes(LEDGER_LIMITS_TEXT[2]));
});

test("over stdio, CANLI_TOOLSETS=ledger lists the three ledger tools and records a trial", async (t) => {
  const dir = tempDir(t);
  const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
  const client = new Client({ name: "ledger-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env: { ...process.env, CANLI_TOOLSETS: "ledger", CANLI_KEY: "", CANLI_LEDGER_DIR: dir } }));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), ["ledger_export", "ledger_record_trial", "ledger_summary"]);
  const res = await client.callTool({ name: "ledger_record_trial", arguments: { ledger: "stdio-search", label: "a", sharpe_annualized: 1, observations: 300, periods_per_year: 252 } });
  assert.equal(res.structuredContent.ledger, "stdio-search");
  assert.equal(res.structuredContent.trials, 1);
});
