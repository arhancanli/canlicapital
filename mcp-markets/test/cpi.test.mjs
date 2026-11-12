import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPONENTS, inflationBreakdown } from "../src/cpi.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-cpi-fixtures.mjs on 2026-11-05 (FRED's CPI series to September 2026).
const run = (args) => inflationBreakdown(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("each component on the month, over three months and on a year; the headline as the BLS states it", async () => {
  const r = await run({});
  assert.equal(r.month, "2026-09");
  // All items 3.74% and core 2.56% on a year: FRED's CPIAUCNS gives 3.7377%, the Cleveland Fed's file 3.7377% and 2.5644%.
  assert.deepEqual(r.summary, [
    "In 2026-09 consumer prices rose 0.65% on the month (seasonally adjusted) and were up 3.74% on a year (3.4% the month before); core prices rose 0.33% on the month and were up 2.56% on a year (2.45% the month before).",
    "On a year: shelter 3.22%, core goods 0.74%, core services 3.15%, energy 20.45%, food 2.48%.",
    "Fastest on a year: gasoline (34.17%); slowest: used cars (-1.46%).",
  ]);
  assert.equal(r.rows.length, COMPONENTS.length);
  assert.deepEqual(r.rows.find((x) => x[0] === "shelter"), ["shelter", "shelter", 0.39, 3.2, 3.22, 3.04]);
  assert.deepEqual(r.headline_and_core.rows.at(-1), ["2026-09", 0.65, 3.74, 0.33, 2.56]);
  assert.equal(r.headline_and_core.rows.length, 13);
});

test("a falling month says fell, and a month with no index a year earlier says so instead of a null", async () => {
  const base = replayFetch().fetchImpl;
  // September 2026 made a falling month, and September 2025 blanked as October 2025 is (the BLS published none).
  const tweak = async (url, init) => {
    const res = await base(url, init);
    if (!/CPIAUCSL|CPIAUCNS|CPILFENS/.test(url)) return res;
    let text = await res.text();
    if (/CPIAUCSL/.test(url)) text = text.replace(/\n2026-09-01,[0-9.]+/, "\n2026-09-01,333.000");
    if (/CPIAUCNS|CPILFENS/.test(url)) text = text.replace(/\n2025-09-01,[0-9.]+/, "\n2025-09-01,");
    return new Response(text, { status: 200 });
  };
  const r = await inflationBreakdown(createSession({ fetchImpl: tweak, now: () => NOW, env: {}, sleep: async () => {} }), {});
  assert.equal(r.summary[0], "In 2026-09 consumer prices fell 0.34% on the month (seasonally adjusted), with no index a year earlier for the change on a year; core prices rose 0.33% on the month, with no index a year earlier for the change on a year.");
});
