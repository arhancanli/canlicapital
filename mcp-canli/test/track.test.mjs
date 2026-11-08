// A track record committed before each day: only a salted hash goes in the ledger; positions for a day are entered at
// its close; the latest commit before a day counts and one made on the day is ignored; a day committed but not shown,
// a shown day that does not match, or a changed ledger stops the score; published heads are checked as anchors.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { appendRecords } from "canli-backtest-mcp/src/proof.mjs";

import { trackCommit, trackScore } from "../src/track.mjs";

const setup = (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "canli-track-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const prices = path.join(dir, "prices.csv");
  writeFileSync(prices, "date,AAA,BBB\n2026-11-02,100,50\n2026-11-03,110,50\n2026-11-04,99,55\n2026-11-05,99,55\n2026-11-06,108.9,44\n");
  return { ledger: path.join(dir, "track.jsonl"), key_file: path.join(dir, "key.pem"), prices };
};
const on = (iso) => () => new Date(iso);

test("only a salted hash goes in the ledger, and a day must be committed before it begins", (t) => {
  const { ledger, key_file } = setup(t);
  assert.throws(() => trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-03", positions: { AAA: 1 } }, { now: on("2026-11-03T08:00:00Z") }), /must be committed before that day begins \(UTC\); today is 2026-11-03/);
  assert.throws(() => trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-04", positions: { AAA: 0 } }, { now: on("2026-11-03T08:00:00Z") }), /No positions/);
  const c = trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-04", positions: { AAA: 0.6, BBB: -0.4 } }, { now: on("2026-11-03T22:00:00Z") });
  assert.match(c.commitment, /^[0-9a-f]{64}$/);
  const text = readFileSync(ledger, "utf8");
  assert.ok(!text.includes("AAA") && !text.includes("0.6"), "the positions are not in the ledger");
  assert.equal(statSync(c.reveals_file).mode & 0o777, 0o600);
  assert.ok(readFileSync(c.reveals_file, "utf8").includes("\"AAA\":0.6"));
});

test("a track is scored from each day's close on the latest commit before the day; a commit on the day is ignored", (t) => {
  const { ledger, key_file, prices } = setup(t);
  trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-03", positions: { BBB: 1 } }, { now: on("2026-11-02T20:00:00Z") });
  // Changed before the day: the later one counts.
  const head = trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-03", positions: { AAA: 1 } }, { now: on("2026-11-02T23:00:00Z") }).head;
  trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-05", positions: { AAA: 0.5, BBB: 0.5 } }, { now: on("2026-11-04T23:00:00Z") });
  // A commit made on its own day (only possible by writing the ledger directly) does not count.
  appendRecords(ledger, [{ kind: "positions_commit", body: { id: "f".repeat(64), for_day: "2026-11-06", commitment: "f".repeat(64) } }], { keyFile: key_file, now: on("2026-11-06T10:00:00Z") });
  const s = trackScore({ ledger_file: ledger, prices_file: prices, cost_bps: 10, anchors: [head] });
  // Entered at 11-03's close (110): 11-04 earns 99/110-1 less 10 bps on a turnover of 1; 11-05 earns nothing; entered
  // 11-05 at the close half and half: 11-06 earns 0.5*(108.9/99-1) + 0.5*(44/55-1) less 10 bps on a turnover of 1.
  const expected = (1 + (99 / 110 - 1) - 0.001) * 1 * (1 + 0.5 * (108.9 / 99 - 1) + 0.5 * (44 / 55 - 1) - 0.001) - 1;
  assert.deepEqual([s.days, s.first_day, s.last_day, s.commitments_counted, s.replaced_before_their_day, s.late_ignored], [3, "2026-11-04", "2026-11-06", 2, 1, 1]);
  assert.ok(Math.abs(s.total_return - expected) < 1e-6, `${s.total_return} vs ${expected}`);
  assert.equal(s.checks.ledger.anchors_checked, 1);
  assert.equal(s.caution, undefined);
  assert.match(s.checks.prices_sha256, /^[0-9a-f]{64}$/);
  assert.match(trackScore({ ledger_file: ledger, prices_file: prices }).caution, /No anchors/);
});

test("a day not shown, a shown day that does not match, or a changed ledger stops the score", (t) => {
  const { ledger, key_file, prices } = setup(t);
  trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-03", positions: { AAA: 1 } }, { now: on("2026-11-02T20:00:00Z") });
  trackCommit({ ledger_file: ledger, key_file, for_day: "2026-11-04", positions: { BBB: 1 } }, { now: on("2026-11-03T20:00:00Z") });
  const reveals = `${ledger}.reveals.jsonl`, full = readFileSync(reveals, "utf8");
  const [first, second] = full.split("\n").filter(Boolean);
  writeFileSync(reveals, `${first}\n`);
  assert.throws(() => trackScore({ ledger_file: ledger, prices_file: prices }), /1 committed day is not shown \(2026-11-04\)\. Every committed day must be shown/);
  writeFileSync(reveals, `${first}\n${second.replace("\"BBB\":1", "\"AAA\":1")}\n`);
  assert.throws(() => trackScore({ ledger_file: ledger, prices_file: prices }), /2026-11-04 do not match their commitments/);
  writeFileSync(reveals, full);
  assert.equal(trackScore({ ledger_file: ledger, prices_file: prices }).commitments_counted, 2);
  writeFileSync(ledger, readFileSync(ledger, "utf8").replace("2026-11-04", "2026-11-05"));
  assert.throws(() => trackScore({ ledger_file: ledger, prices_file: prices }), /The ledger does not hold: Line \d+ was changed/);
});
