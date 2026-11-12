import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assemble, blocksOf, choose, cpcv, splitsOf, trainMask } from "../src/cpcv.mjs";

const tempDir = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-cpcv-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
function panelFile(dir, { trials = 30, days = 1500, edge = {}, seed = 11 } = {}) {
  let s = seed;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  const names = Array.from({ length: trials }, (_, i) => `t${i}`);
  const rows = ["date," + names.join(",")];
  const d = new Date(Date.UTC(2015, 0, 1));
  for (let k = 0; k < days; ) {
    if (d.getUTCDay() % 6) { rows.push(`${d.toISOString().slice(0, 10)},${names.map((n) => (0.01 * g() + (edge[n] ?? 0)).toFixed(6)).join(",")}`); k += 1; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const f = path.join(dir, "trials.csv");
  writeFileSync(f, rows.join("\n") + "\n");
  return f;
}

test("the counts are the ones the method states: C(N,k) splits, C(N-1,k-1) paths", () => {
  assert.equal(choose(10, 2), 45);
  assert.equal(splitsOf(6, 2).length, 15);
  const fake = splitsOf(6, 2).map((test, s) => ({ s, pieces: test.map((g) => [g, [g * 100 + s]]) }));
  const paths = assemble(fake, 6);
  assert.equal(paths.length, choose(5, 1));
  for (const p of paths) assert.deepEqual(p.map((x) => Math.floor(x / 100)), [0, 1, 2, 3, 4, 5], "each path holds every block once, in order");
});

test("blocks cover every day once, and purge and embargo clear the edges of the test block", () => {
  const blocks = blocksOf(103, 5);
  assert.equal(blocks[0][0], 0);
  assert.equal(blocks.at(-1)[1], 102);
  for (let i = 1; i < 5; i += 1) assert.equal(blocks[i][0], blocks[i - 1][1] + 1);
  const m = trainMask(103, blocks, [2], 3, 4), [a, b] = blocks[2];
  for (let t = a - 3; t <= b + 4; t += 1) assert.equal(m[t], 0, `day ${t} must not train`);
  assert.equal(m[a - 4], 1);
  assert.equal(m[b + 5], 1);
});

test("a search over pure noise looks good in sample and has nothing out of sample", (t) => {
  const r = cpcv({ returns_file: panelFile(tempDir(t)) });
  assert.equal(r.splits, 45);
  assert.equal(r.paths, 9);
  assert.ok(r.in_sample_sharpe_median > 0.7, `in sample ${r.in_sample_sharpe_median}`);
  assert.ok(Math.abs(r.out_of_sample_sharpe.median) < 0.7, `out of sample ${r.out_of_sample_sharpe.median}`);
  assert.ok(r.out_of_sample_sharpe.median < r.in_sample_sharpe_median - 0.3);
  assert.ok(r.distinct_trials_chosen > 1);
  assert.ok(r.plain_reading.includes("9 paths"));
});

test("a trial with a real edge is found, and holds up out of sample", (t) => {
  const r = cpcv({ returns_file: panelFile(tempDir(t), { edge: { t7: 0.0015 } }) });
  assert.equal(r.most_chosen[0].trial, "t7");
  assert.ok(r.out_of_sample_sharpe.median > 1, `${r.out_of_sample_sharpe.median}`);
  assert.equal(r.out_of_sample_sharpe.share_of_paths_at_or_below_zero, 0);
});

test("shards run apart merge to exactly the whole, and bad merges are refused", (t) => {
  const dir = tempDir(t), file = panelFile(dir, { trials: 8, days: 400 });
  const whole = cpcv({ returns_file: file, groups: 6, test_groups: 2 });
  const shard = (index, f = file) => { const out = path.join(dir, `s${index}-${path.basename(f)}.json`); cpcv({ returns_file: f, groups: 6, test_groups: 2, shard: { index, of: 3 }, out_file: out }); return out; };
  const files = [0, 1, 2].map((i) => shard(i));
  const merged = cpcv({ merge_files: files });
  assert.deepEqual(merged.path_sharpes, whole.path_sharpes);
  assert.equal(merged.merged_from, 3);
  assert.throws(() => cpcv({ merge_files: [files[0], files[1]] }), /missing splits/);
  assert.throws(() => cpcv({ merge_files: [files[0], files[0], files[1], files[2]] }), /two shards/);
  const other = path.join(dir, "other.csv");
  writeFileSync(other, "date,a,b\n" + Array.from({ length: 60 }, (_, i) => `2020-01-${String(i % 28 + 1).padStart(2, "0")}`).map((d, i) => `${2000 + i}-01-01,0.01,${(i % 3) / 100}`).join("\n") + "\n");
  assert.throws(() => cpcv({ merge_files: [files[0], shard(1, other), files[2]] }), /same run|not a shard/);
});

test("bad settings are refused with the reason", (t) => {
  const dir = tempDir(t), f = panelFile(dir, { trials: 3, days: 100 });
  assert.throws(() => cpcv({ returns_file: f, groups: 5, test_groups: 5 }), /fewer than groups/);
  assert.throws(() => cpcv({ returns_file: f, groups: 30, test_groups: 15 }), /splits; the most/);
  const one = path.join(dir, "one.csv");
  writeFileSync(one, "date,a\n2020-01-01,0.1\n2020-01-02,0.1\n");
  assert.throws(() => cpcv({ returns_file: one }), /at least two trials/);
  assert.throws(() => cpcv({}), /needs returns_file/);
});
