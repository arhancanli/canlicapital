import test from "node:test";
import assert from "node:assert/strict";
import { submissionPolicy, postIndexNowBatches } from "./submit-indexnow.mjs";

test("large notifications respect 10,000-URL limit without dropping or repeating a URL", async () => {
  const urls = Array.from({ length: 20_001 }, (_, i) => `https://canlicapital.com/fixture/${i}`);
  const requests = [];
  const batches = await postIndexNowBatches({ urls, key: "fixture", keyUrl: "https://canlicapital.com/fixture.txt", fetchImpl: async (_, init) => { requests.push(JSON.parse(init.body)); return { status: 202 }; } });
  assert.deepEqual(requests.map((r) => r.urlList.length), [10_000, 10_000, 1]);
  assert.deepEqual(requests.flatMap((r) => r.urlList), urls);
  assert.deepEqual(batches.map((b) => b.offset), [0, 10_000, 20_000]);
});

test("a rejected or disconnected batch records partial progress and stops submission", async () => {
  for (const disconnected of [false, true]) {
    const progress = [];
    let requests = 0;
    await assert.rejects(postIndexNowBatches({
      urls: Array.from({ length: 20_001 }, (_, i) => `https://canlicapital.com/fixture/${i}`),
      key: "fixture", keyUrl: "https://canlicapital.com/fixture.txt", onBatch: (batch) => progress.push(batch),
      fetchImpl: async () => {
        requests++;
        if (requests === 1) return { status: 200 };
        if (disconnected) throw new Error("connection lost");
        return { status: 429, text: async () => "rate limited" };
      },
    }), disconnected ? /connection lost/ : /429/);
    assert.equal(requests, 2);
    assert.deepEqual(progress.map((p) => p.http_status), [200, disconnected ? null : 429]);
  }
});

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
