import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkPackage, loadRules, RULES_PATH } from "./check-deposit-claims.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "deposit-claims-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the rules file loads and is seeded from the engine's blocklist", () => {
  const rules = loadRules(RULES_PATH);
  assert.ok(rules.length >= 14, "expected at least the 14 rules copied from retracted_claims.txt");
  assert.ok(rules.some((r) => r.seq === "24" && r.patternSource === "DSR 0\\.83"));
});

test("both real deposit packages pass the gate cleanly", () => {
  const rules = loadRules(RULES_PATH);
  for (const pkg of ["deposits/zenodo/paper-evidence-v0", "deposits/zenodo/notes-2026-09"]) {
    const { violations, fileCount } = checkPackage(resolve(ROOT, pkg), rules);
    assert.ok(fileCount > 0, `${pkg}: expected files to be scanned`);
    assert.deepEqual(
      violations.map((v) => `${v.rule.seq}: ${v.snippet}`),
      [],
      `${pkg} should have no violations`,
    );
  }
});

test("a bare 'Sharpe 0.68' naming a sleeve fails, and passes once the bundle and blockers are named", () => {
  const rules = loadRules(RULES_PATH);
  withTempDir((dir) => {
    const file = join(dir, "note.md");

    writeFileSync(file, "Crypto-carry's Sharpe 0.68 looks strong on paper.\n");
    const bare = checkPackage(dir, rules);
    assert.equal(bare.violations.length, 1, "a bare sleeve Sharpe must fail closed");
    assert.equal(bare.violations[0].rule.seq, "STRUCTURAL");

    writeFileSync(
      file,
      "Crypto-carry's Sharpe 0.68 looks strong on paper, but the crypto-carry bundle is " +
        "BUNDLE_INCOMPLETE with blockers OPEN_MATERIAL_REPLAY_CORRECTION and " +
        "CLEAN_ENVIRONMENT_REPLAY_NOT_COMPLETED, so it is not a claim yet.\n",
    );
    const disclosed = checkPackage(dir, rules);
    assert.deepEqual(disclosed.violations, [], "naming the bundle and blockers must clear the gate");
  });
});

test("a numeral near Sharpe/CAGR/drawdown that names no specific sleeve is not flagged", () => {
  const rules = loadRules(RULES_PATH);
  withTempDir((dir) => {
    const file = join(dir, "note.md");
    writeFileSync(
      file,
      "Take a strategy with 1,260 daily returns. It has an annualised Sharpe ratio of +1.139, " +
        "a synthetic demonstration with no strategy named.\n",
    );
    const { violations } = checkPackage(dir, rules);
    assert.deepEqual(violations, [], "a generic worked example naming no sleeve must not trip the structural rule");
  });
});

test("a seeded withdrawn-claim rule fails bare and passes inside its own retraction", () => {
  const rules = loadRules(RULES_PATH);
  withTempDir((dir) => {
    const file = join(dir, "note.md");

    writeFileSync(file, "AlphaTrend runs at DSR 0.83, our soundest sleeve.\n");
    const bare = checkPackage(dir, rules);
    assert.equal(bare.violations.length, 1);
    assert.equal(bare.violations[0].rule.seq, "24");

    writeFileSync(
      file,
      "AlphaTrend's DSR 0.83 was wrong when we wrote it and has been wrong every day since; " +
        "the withdrawn figure is preserved here only inside its own retraction.\n",
    );
    const retracted = checkPackage(dir, rules);
    assert.deepEqual(retracted.violations, []);
  });
});

test("fails closed on a missing rules file", () => {
  assert.throws(() => loadRules(resolve(ROOT, "deposits/does-not-exist.txt")), /rules file missing/);
});

test("fails closed on a scan target that does not exist", () => {
  const rules = loadRules(RULES_PATH);
  assert.throws(() => checkPackage(resolve(ROOT, "deposits/zenodo/does-not-exist"), rules));
});
