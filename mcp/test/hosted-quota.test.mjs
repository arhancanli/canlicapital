import assert from "node:assert/strict";
import test from "node:test";

import { computeLocally } from "../src/local.mjs";
import { SHARED_QUOTA_NOTE, createSession, toolAuditBacktest, toolValidateDeflatedSharpe } from "../src/server.mjs";

const INPUTS = { observed_sharpe_annualized: 1.5, observations: 730, periods_per_year: 365, skew: -0.5, non_excess_kurtosis: 5, effective_independent_trials: 229, cross_trial_sharpe_sd_annualized: 0.57 };
const refusal = (code, status) => async () => new Response(JSON.stringify({ schema: "canli.api.v1", data: {}, error: { code, message: `refused: ${code}` } }), { status });
const hosted = (keySource, fetchImpl) => createSession({ base: "https://example.test", fetchImpl, hosted: { keySource } });

test("when the shared anonymous quota is used up, the hosted endpoint still answers, without a receipt", async () => {
  const result = await toolValidateDeflatedSharpe(hosted("shared", refusal("quota_exhausted", 429)), INPUTS);
  assert.equal(result.isError, undefined);
  const envelope = result.structuredContent;
  assert.equal(envelope.computed, "hosted_without_receipt");
  assert.equal(envelope.note, SHARED_QUOTA_NOTE);
  assert.match(envelope.note, /free key/);
  assert.match(envelope.note, /CANLI_LOCAL=1/);
  assert.equal(envelope.receipt, null);
  assert.deepEqual(envelope.data, computeLocally("validate_deflated_sharpe", INPUTS).envelope.data, "the same computation the API and local mode run");
});

test("a caller's own key, or a different refusal, is reported unchanged", async () => {
  const own = await toolValidateDeflatedSharpe(hosted("caller", refusal("quota_exhausted", 429)), INPUTS);
  assert.equal(own.isError, true);
  assert.equal(own.structuredContent.error.code, "quota_exhausted");
  const invalid = await toolValidateDeflatedSharpe(hosted("shared", refusal("invalid_input", 400)), INPUTS);
  assert.equal(invalid.isError, true);
  assert.equal(invalid.structuredContent.error.code, "invalid_input");
  const unhosted = await toolValidateDeflatedSharpe(createSession({ base: "https://example.test", fetchImpl: refusal("quota_exhausted", 429) }), INPUTS);
  assert.equal(unhosted.isError, true, "the stdio server has its own key and quota; nothing to fall back from");
});

test("audit_backtest falls back per check the same way", async () => {
  const returns = Array.from({ length: 300 }, (_, i) => Math.sin(i / 7) / 100 + 0.0008);
  const result = await toolAuditBacktest(hosted("shared", refusal("quota_exhausted", 429)), { returns, periods_per_year: 252, effective_independent_trials: 20, cross_trial_sharpe_sd_annualized: 0.5 });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /hosted_without_receipt/);
  assert.doesNotMatch(result.content[0].text, /quota_exhausted/);
});
