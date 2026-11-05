import assert from "node:assert/strict";
import { test } from "node:test";

import { stateCode, stateEconomy } from "../src/states.mjs";
import { createSession, NotFound } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-states-fixtures.mjs on 2026-11-05 (FRED's state series).
const run = (args) => stateEconomy(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("states by name or postal code, DC included", () => {
  assert.equal(stateCode("texas"), "TX");
  assert.equal(stateCode("tx"), "TX");
  assert.equal(stateCode("Washington, D.C."), "DC");
  assert.throws(() => stateCode("Puerto Rico"), NotFound);
});

test("a state beside the nation, every measure with its change on a year", async () => {
  const r = await run({ state: "Texas" });
  assert.deepEqual(r.summary, ["Texas's unemployment rate was 4.4% in 2026-09 (the US 4.2%), up 0.1 points on a year.", "Payroll jobs grew 1.1% on a year (the US 0.3%); house prices rose 1.6% (the US 3%)."]);
  assert.deepEqual(r.rows[0], ["unemployment", "unemployment rate", "2026-09", 4.4, 0.1, "points", 4.2, -0.2]);
  // The nation's real GDP is scaled from billions to the states' millions.
  assert.deepEqual(r.rows.at(-1).slice(3), [2376525.1, 1.7, "pct", 24611077, 2.1]);
});

test("every state and DC ranked", async () => {
  const r = await run({ rank: "unemployment" });
  assert.equal(r.rows.length, 51);
  assert.equal(r.summary[0], "Highest unemployment: District of Columbia (5.6%); lowest: South Dakota (2%); the US 4.2% (2026-09).");
  assert.deepEqual(r.rows[0], ["District of Columbia", "DC", "2026-09", 5.6, -1]);
  await assert.rejects(run({}), /Name a state/);
});

test("a failed US series drops its clause, and a state FRED did not return is named, not silently left out", async () => {
  const base = replayFetch().fetchImpl;
  const failing = async (url, init) => (/id=(UNRATE|PAYEMS)&|id=SDUR&/.test(url) ? new Response("down", { status: 503 }) : base(url, init));
  const session = createSession({ fetchImpl: failing, now: () => NOW, env: {}, sleep: async () => {} });
  const r = await stateEconomy(session, { state: "TX" });
  assert.deepEqual(r.summary, ["Texas's unemployment rate was 4.4% in 2026-09, up 0.1 points on a year.", "Payroll jobs grew 1.1% on a year; house prices rose 1.6% (the US 3%)."]);
  const k = await stateEconomy(session, { rank: "unemployment" });
  assert.equal(k.rows.length, 50);
  assert.equal(k.limits[0], "FRED returned nothing for South Dakota this time; it is left out of the ranking.");
});
