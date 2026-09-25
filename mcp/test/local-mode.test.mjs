// Private local mode: the validators computed on this machine must return exactly what the API's
// own computation returns, send nothing over the network, and store no receipt. The mirrored
// source under src/local must stay byte-identical to the repository it is copied from.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LOCAL_FILES } from "../scripts/sync-local.mjs";
import { configuredLocal, createSession, toolValidateBreadth, toolValidateDeflatedSharpe, toolValidateOverfitting, toolValidateTrackRecord } from "../src/server.mjs";

const MCP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(MCP, "..");
const inRepository = existsSync(resolve(REPO, "js/dsr-core.js"));

test("src/local is a byte-for-byte mirror of the repository's validator computation", { skip: !inRepository && "installed package, no repository beside it" }, () => {
  for (const rel of LOCAL_FILES) {
    assert.ok(
      readFileSync(resolve(MCP, "src/local", rel)).equals(readFileSync(resolve(REPO, rel))),
      `${rel} differs from the repository; run node mcp/scripts/sync-local.mjs`,
    );
  }
});

function noNetwork() {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("local mode must not use the network"); };
  return { session: createSession({ base: "https://example.test", fetchImpl, local: true }), calls: () => calls };
}

const parsed = (result) => JSON.parse(result.content[0].text);

const CASES = [
  ["validate_breadth", toolValidateBreadth, "js/validate/breadth.js", { sleeve_sharpe: 0.5, average_pairwise_correlation: 0.05, sleeves: 4, target: 1.5 }],
  ["validate_track_record", toolValidateTrackRecord, "js/validate/track-record.js", { observed_sharpe_annualized: 2, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, observations: 504 }],
  ["validate_deflated_sharpe", toolValidateDeflatedSharpe, "js/validate/deflated-sharpe.js", { observed_sharpe_annualized: 2.5, observations: 1250, periods_per_year: 250, skew: -3, non_excess_kurtosis: 10, effective_independent_trials: 100, cross_trial_sharpe_sd_annualized: Math.sqrt(0.5) }],
  ["validate_overfitting", toolValidateOverfitting, "js/validate/overfitting.js", { matrix: Array.from({ length: 16 }, (_, i) => [0.01 * Math.sin(i), 0.01 * Math.cos(i), 0.002 * (i % 3)]), n_splits: 4 }],
];

for (const [tool, fn, rel, input] of CASES) {
  test(`${tool}: local mode returns the API's own computation, offline, with no receipt`, async () => {
    const { session, calls } = noNetwork();
    const out = parsed(await fn(session, input));
    assert.equal(calls(), 0);
    assert.equal(out.computed, "locally");
    assert.equal(out.receipt, null);
    assert.equal(out.error, null);
    const { compute } = await import(resolve(MCP, "src/local", rel));
    assert.deepEqual(out.data, compute(input));
  });
}

test("the deflated Sharpe computed locally is the paper's 0.9004", async () => {
  const { session } = noNetwork();
  const out = parsed(await toolValidateDeflatedSharpe(session, CASES[2][3]));
  assert.ok(Math.abs(out.data.result.deflated_sharpe_ratio - 0.9004) <= 0.00005);
});

test("an input the computation refuses comes back as a local error envelope", async () => {
  const { session, calls } = noNetwork();
  const result = await toolValidateTrackRecord(session, { observed_sharpe_annualized: 1, benchmark_sharpe_annualized: 1, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3 });
  assert.equal(result.isError, true);
  assert.equal(parsed(result).error.code, "invalid_input");
  assert.equal(calls(), 0);
});

test("CANLI_LOCAL turns local mode on only for 1 or true", () => {
  assert.equal(configuredLocal("1"), true);
  assert.equal(configuredLocal("true"), true);
  assert.equal(configuredLocal("TRUE"), true);
  assert.equal(configuredLocal("0"), false);
  assert.equal(configuredLocal(""), false);
  assert.equal(configuredLocal("${user_config.local_only}"), false);
  assert.equal(configuredLocal(undefined), false);
});
