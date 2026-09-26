// Private local mode: the validators computed on this machine from src/local, a byte-for-byte
// mirror of the API's own computation (see scripts/sync-local.mjs). Nothing is sent to
// canlicapital.com and no receipt is stored, so the result names no receipt id.
import { LIMITS_TEXT } from "./local/api/_lib/limits.js";
import { compute as breadth } from "./local/js/validate/breadth.js";
import { compute as deflatedSharpe } from "./local/js/validate/deflated-sharpe.js";
import { compute as overfitting } from "./local/js/validate/overfitting.js";
import { compute as paperEvidence } from "./local/js/validate/paper-evidence.js";
import { compute as trackRecord } from "./local/js/validate/track-record.js";
import { compute as backtestLength } from "./local/js/validate/backtest-length.js";

export const LOCAL_VALIDATORS = Object.freeze({
  validate_deflated_sharpe: { endpoint: "validate/deflated-sharpe", compute: deflatedSharpe },
  validate_overfitting: { endpoint: "validate/overfitting", compute: overfitting },
  validate_paper_evidence: { endpoint: "validate/paper-evidence", compute: paperEvidence },
  validate_breadth: { endpoint: "validate/breadth", compute: breadth },
  validate_track_record: { endpoint: "validate/track-record", compute: trackRecord },
  validate_backtest_length: { endpoint: "validate/backtest-length", compute: backtestLength },
});

const NOTE = "Computed on this machine in local mode. Nothing was sent to canlicapital.com and no receipt was stored.";

export function computeLocally(tool, body, now = () => new Date()) {
  const validator = LOCAL_VALIDATORS[tool];
  if (!validator) throw new Error(`${tool} has no local computation`);
  const base = {
    schema: "canli.local.v1",
    endpoint: validator.endpoint,
    computed: "locally",
    generated_at: now().toISOString().replace(/\.\d{3}Z$/, "Z"),
    note: NOTE,
    limits: LIMITS_TEXT,
    receipt: null,
  };
  try {
    return { envelope: { ...base, data: validator.compute(body), error: null }, failed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { envelope: { ...base, data: null, error: { code: "invalid_input", message } }, failed: true };
  }
}
