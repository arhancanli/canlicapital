import assert from "node:assert/strict";
import { test } from "node:test";

import { moneyMarkets } from "../src/money-markets.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-money-fixtures.mjs on 2026-11-05: the OFR's repo series to 3 November and money market
// funds to September, FRED's IORB and RRPONTSYAWARD, and the New York Fed's dealer positions to 21 October.
const round1 = (x) => Math.round(x * 10) / 10;
const run = (args, fetchImpl = replayFetch().fetchImpl) => moneyMarkets(createSession({ fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);

test("repo by segment against the Fed's rates, what money funds hold, and dealers' Treasury positions", async () => {
  const r = await run({});
  // SOFR and its volume as the New York Fed's own API gives them for 3 November (3.97%, $3,260 billion).
  assert.equal(r.summary[0], "SOFR was 3.97% on 2026-11-03 on $3.26 trillion of trades, 7 bp above the Fed's interest on reserves (3.90%) and 22 bp above its overnight reverse repo rate (3.75%); it was above interest on reserves on 8 of the last 20 sessions.");
  assert.deepEqual(r.repo.rows[0].slice(2), ["2026-11-03", 3.97, 3260, 9, -16, 7, 22]);
  assert.equal(r.summary[3], "Primary dealers were net long $425.6 billion of Treasuries on 2026-10-21, TIPS included ($392.3 billion without them), down $45.2 billion on four weeks and up $43.5 billion on a year; bills $81.2 billion.");
  // The holdings add up to the total and the repo counterparties to repo, as the OFR publishes them.
  const f = r.money_funds;
  assert.ok(Math.abs(f.rows.reduce((s, x) => s + x[2], 0) - f.total_billions) < 0.2);
  assert.ok(Math.abs(f.repo_counterparties.rows.reduce((s, x) => s + x[2], 0) - f.rows.find((x) => x[0] === "repo")[2]) < 0.2);
  assert.match(r.summary[2], /^US money market funds held \$8\.40 trillion at the end of 2026-09/);
  // The New York Fed's total, named as leaving out TIPS, is the other buckets and the TIPS buckets together.
  assert.deepEqual([r.dealers.total_billions, r.dealers.without_tips_billions, r.dealers.tips_billions], [425.6, 392.3, 33.3]);
  assert.equal(round1(r.dealers.without_tips_billions + r.dealers.tips_billions), r.dealers.total_billions);
});

test("one part with its history: repo day by day, money funds month by month, dealers week by week", async () => {
  const repo = await run({ part: "repo", periods: 2 });
  assert.deepEqual(repo.history.rows, [["2026-11-02", 3.95, 3.92, 3.92, 3.93, 3.99, 3.96, 3.9, 3.75, 3268], ["2026-11-03", 3.97, 3.95, 3.95, null, null, 3.98, 3.9, 3.75, 3260]]);
  const funds = await run({ part: "money_funds", periods: 2 });
  assert.deepEqual(funds.history.rows.at(-1), ["2026-09", 8396.8, 3484, 2871.5, 1194.3, 495.2, 351.8, 6.1]);
  const dealers = await run({ part: "dealers", periods: 2 });
  assert.deepEqual(dealers.history.rows.map((x) => x.slice(0, 3)), [["2026-10-14", 443.5, 98.7], ["2026-10-21", 425.6, 81.2]]);
});

test("a source that is down leaves the others in the overview, and is named when its part is asked for", async () => {
  const base = replayFetch().fetchImpl;
  const down = async (url, init) => (/markets\.newyorkfed\.org\/api\/pd\//.test(url) ? new Response("down", { status: 503 }) : base(url, init));
  const r = await run({}, down);
  assert.equal(r.dealers, undefined);
  assert.equal(r.summary.length, 3);
  const ofrDown = async (url, init) => (/data\.financialresearch\.gov/.test(url) ? new Response("down", { status: 503 }) : base(url, init));
  await assert.rejects(run({ part: "money_funds" }, ofrDown), /HTTP 503/);
  await assert.rejects(run({ part: "dealers" }, down), /The New York Fed's primary dealer statistics came back empty/);
  // FRED down: SOFR is still said, without the Fed's rates rather than with made-up ones.
  const fredDown = async (url, init) => (/fred\.stlouisfed\.org/.test(url) ? new Response("down", { status: 503 }) : base(url, init));
  const f = await run({}, fredDown);
  assert.equal(f.summary[0], "SOFR was 3.97% on 2026-11-03 on $3.26 trillion of trades.");
  assert.deepEqual(f.repo.fed, { iorb_pct: null, on_rrp_pct: null, as_of: "2026-11-03" });
});
