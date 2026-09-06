import test from "node:test";
import assert from "node:assert/strict";
import { submissionPolicy } from "./submit-indexnow.mjs";

const HOUR = 3_600_000;
const nowMs = Date.parse("2026-08-23T00:00:00Z");
const accepted = {
  accepted: true,
  mode: "SUBMISSION",
  recorded_at: "2026-08-22T23:00:00Z",
  canonical_url_list_sha256: "same",
};

test("unchanged URL set inside cooldown is skipped", () => {
  assert.deepEqual(
    submissionPolicy({ previous: accepted, urlListHash: "same", nowMs, minIntervalMs: 24 * HOUR }),
    {
      submit: false,
      reason: "UNCHANGED_URL_SET_COOLDOWN",
      ageMs: HOUR,
      retryAfterMs: 23 * HOUR,
    },
  );
});

test("a changed canonical URL set bypasses cooldown", () => {
  assert.deepEqual(
    submissionPolicy({ previous: accepted, urlListHash: "new", nowMs, minIntervalMs: 24 * HOUR }),
    { submit: true, reason: "CANONICAL_URL_SET_CHANGED" },
  );
});

test("elapsed cooldown permits a daily refresh", () => {
  const previous = { ...accepted, recorded_at: "2026-08-22T00:00:00Z" };
  assert.deepEqual(
    submissionPolicy({ previous, urlListHash: "same", nowMs, minIntervalMs: 24 * HOUR }),
    { submit: true, reason: "COOLDOWN_ELAPSED", ageMs: 24 * HOUR },
  );
});

test("force bypasses cooldown", () => {
  assert.deepEqual(
    submissionPolicy({
      previous: accepted,
      urlListHash: "same",
      nowMs,
      minIntervalMs: 24 * HOUR,
      force: true,
    }),
    { submit: true, reason: "FORCED" },
  );
});

test("missing or invalid prior receipt fails toward notification", () => {
  assert.equal(submissionPolicy({ previous: null, urlListHash: "same", nowMs }).submit, true);
  assert.equal(
    submissionPolicy({ previous: { ...accepted, recorded_at: "invalid" }, urlListHash: "same", nowMs })
      .reason,
    "RECEIPT_TIME_INVALID",
  );
});
