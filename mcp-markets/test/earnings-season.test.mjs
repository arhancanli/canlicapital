import assert from "node:assert/strict";
import { test } from "node:test";

import { earningsSeason, seasonStart, surprise, tally } from "../src/earnings-season.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "./replay.mjs";

// Captured by scripts/capture-season-fixtures.mjs on a clock fixed at 2026-11-05 02:00 UTC: Nasdaq's earnings calendar
// for 27 October to 4 November (kept to the S&P 500's members) and SPY's holdings of 3 November.
const CLOCK = Date.parse("2026-11-05T02:00:00Z");
const run = (args) => earningsSeason(createSession({ fetchImpl: replayFetch().fetchImpl, now: () => CLOCK, env: {}, sleep: async () => {} }), args);

test("a surprise over the estimate's size, a season's tally, and the season's first day", () => {
  // Coupang on 3 November: -$0.18 against -$0.23, a 21.74% surprise as Nasdaq shows it.
  assert.equal(Math.round(surprise(-0.18, -0.23) * 100) / 100, 21.74);
  assert.equal(surprise(1, 0), null);
  const t = tally([{ eps: 2, consensus: 1.5, surprise: 33.3 }, { eps: 1, consensus: 1, surprise: 0 }, { eps: 0.5, consensus: 1, surprise: -50 }, { eps: 0.06, consensus: 0.02, surprise: 200 }, { eps: 1, consensus: null, surprise: null }]);
  assert.deepEqual(t, { reported: 5, with_consensus: 4, beat: 2, matched: 1, missed: 1, beat_pct: 50, missed_pct: 25, median_surprise_pct: 0 });
  assert.deepEqual(["2026-11-05", "2026-02-10", "2026-12-31", "2026-07-01"].map(seasonStart), ["2026-10-01", "2026-01-01", "2026-10-01", "2026-07-01"]);
});

test("the S&P 500's reports in a window: beats and misses, the largest companies, share classes counted once", async () => {
  const r = await run({ since: "2026-10-27", until: "2026-11-04", list: 3 });
  assert.equal(r.summary[0], "Of the S&P 500's 500 companies, 223 reported results between 2026-10-27 and 2026-11-03: 83.3% beat the consensus EPS estimate, 2.7% matched it and 14% missed (of 221 with an estimate); the median surprise was +5.7%.");
  assert.deepEqual([r.members, r.companies], [503, 500]);
  // Alphabet's two classes are one company, with both classes' weight.
  assert.deepEqual(r.rows.map((x) => [x[2], x[5], x[6], x[7], x[9]]), [["AAPL", 2.05, 1.98, 3.5, 0.0743], ["MSFT", 4.89, 4.71, 3.8, 0.0593], ["GOOGL", 2.12, 2.94, -27.9, 0.0455]]);
  // 4 November's reports are listed on Nasdaq's calendar without figures yet.
  assert.equal(r.tally.listed_without_figures, 43);
  assert.match(r.summary[2], /^43 more were listed to report by 2026-11-04 with no figures on Nasdaq's calendar yet: MCD, QCOM/);
  assert.deepEqual(r.largest_misses.rows[0], ["MGM", "MGM RESORTS INTERNATIONAL", "2026-10-28", -0.11, 0.15, -173.3]);
});

test("windows backwards or longer than a season are refused", async () => {
  await assert.rejects(run({ since: "2026-11-04", until: "2026-10-27" }), /is after until/);
  await assert.rejects(run({ since: "2026-08-01", until: "2026-11-04" }), /at most 70 days/);
});

test("named companies: each one's result or status first, a share class finding its company, and a non-member refused", async () => {
  const r = await run({ since: "2026-10-27", until: "2026-11-04", symbols: ["AAPL", "GOOG", "MCD", "nvda"] });
  assert.deepEqual(r.summary.slice(0, 4), [
    "AAPL reported on 2026-11-02: EPS 2.05 against a consensus of 1.98, beat by 3.5%.",
    "GOOGL reported on 2026-10-28: EPS 2.12 against a consensus of 2.94, missed by 27.9%.",
    "MCD is listed for 2026-11-04 (before the open) with a consensus of 3.36; Nasdaq has no figures for it yet.",
    "NVDA has no report on Nasdaq's calendar between 2026-10-27 and 2026-11-04.",
  ]);
  assert.deepEqual(r.rows.map((x) => x[2]), ["GOOGL", "AAPL"]);
  assert.match(r.summary[4], /^Of the S&P 500's 500 companies, 223 reported/);
  await assert.rejects(run({ since: "2026-10-27", until: "2026-11-04", symbols: ["SAP"] }), /SAP is not in SPY's holdings/);
});
