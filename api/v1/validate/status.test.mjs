import assert from "node:assert/strict";
import test from "node:test";

import { createStatusHandler } from "./status.js";

function makeReq(method = "GET") {
  return { method };
}
function makeRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (s) => { res.body = s ?? ""; };
  res.json = () => JSON.parse(res.body);
  return res;
}
function fakeStore({ pingOk = true, usage = null, usageThrows = null } = {}) {
  return {
    ping: async () => { if (!pingOk) throw new Error("store down"); return true; },
    usageSummary: async () => { if (usageThrows) throw usageThrows; return usage; },
  };
}

test("a healthy store returns usage and usage_available true, unchanged store_reachable semantics", async () => {
  const usage = { validations_today: 3, validations_total: 90, keys_issued_today: 1, as_of_utc_day: "2026-09-06" };
  const res = makeRes();
  await createStatusHandler({ store: fakeStore({ usage }) })(makeReq(), res);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.store_reachable, true);
  assert.deepEqual(body.data.usage, usage);
  assert.equal(body.data.usage_available, true);
});

test("a missing usage_summary function (migration not applied) gives usage null, never a 5xx", async () => {
  const res = makeRes();
  const missing = Object.assign(new Error("Could not find the function"), { status: 404 });
  await createStatusHandler({ store: fakeStore({ usageThrows: missing }) })(makeReq(), res);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.store_reachable, true);
  assert.equal(body.data.usage, null);
  assert.equal(body.data.usage_available, false);
});

test("a network error fetching usage still gives usage null and does not change store_reachable", async () => {
  const res = makeRes();
  await createStatusHandler({ store: fakeStore({ usageThrows: new TypeError("fetch failed") }) })(makeReq(), res);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.usage, null);
  assert.equal(body.data.usage_available, false);
});

test("an unreachable store keeps the existing 503 store_reachable behavior and still reports usage null", async () => {
  const res = makeRes();
  await createStatusHandler({ store: fakeStore({ pingOk: false, usageThrows: new Error("down") }) })(makeReq(), res);
  assert.equal(res.statusCode, 503);
  const body = res.json();
  assert.equal(body.data.store_reachable, false);
  assert.equal(body.data.usage, null);
  assert.equal(body.data.usage_available, false);
});

// usage_summary_v2 (supabase/migrations/20260906_usage_summary_v2.sql) adds two aggregate maps.
// The status handler does not know their shape; it passes through whatever the store returns, so
// this test proves that passthrough rather than re-asserting the RPC's own SQL.
test("the two new usage maps pass through to data.usage unchanged, whenever the store carries them", async () => {
  const usage = {
    validations_today: 3, validations_total: 90, keys_issued_today: 2, as_of_utc_day: "2026-09-06",
    keys_by_source_host_today: { "github.com": 1, unknown: 1 },
    keys_by_label_today: { "quickstart-curl": 1, "developers-page": 1 },
  };
  const res = makeRes();
  await createStatusHandler({ store: fakeStore({ usage }) })(makeReq(), res);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.data.usage.keys_by_source_host_today, usage.keys_by_source_host_today);
  assert.deepEqual(body.data.usage.keys_by_label_today, usage.keys_by_label_today);
});

test("GET only", async () => {
  const res = makeRes();
  await createStatusHandler({ store: fakeStore() })({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
});
