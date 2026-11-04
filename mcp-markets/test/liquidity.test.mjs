import assert from "node:assert/strict";
import { test } from "node:test";

import { fedLiquidity, operationsByDay } from "../src/liquidity.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// Captured by scripts/capture-liquidity-fixtures.mjs: the New York Fed's operations to 2026-10-09 and a year before,
// its SOMA summary, and FRED's H.4.1 series.
const session = (fetchImpl = replayFetch().fetchImpl) => createSession({ fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
const run = (args, fetchImpl) => fedLiquidity(session(fetchImpl), args);

test("a day's operations: the reverse repo, both standing repo operations by collateral, and exercises kept apart", () => {
  const days = operationsByDay([
    { operationDate: "2026-09-30", operationType: "Repo", auctionStatus: "Results", term: "Overnight", totalAmtAccepted: 1000000, details: [{ securityType: "Treasury", amtAccepted: 1000000, percentOfferingRate: 4 }, { securityType: "Mortgage-Backed", amtAccepted: 0, percentOfferingRate: 4 }] },
    { operationDate: "2026-09-30", operationType: "Reverse Repo", auctionStatus: "Results", totalAmtAccepted: 11539000000, acceptedCpty: 18, details: [{ securityType: "Treasury", percentAwardRate: 3.75 }] },
    { operationDate: "2026-09-30", operationType: "Repo", auctionStatus: "Results", term: "Overnight", totalAmtAccepted: 1199000000, details: [{ securityType: "Treasury", amtAccepted: 1199000000, percentOfferingRate: 4 }] },
    { operationDate: "2026-09-30", operationType: "Repo", auctionStatus: "Results", term: "Term", termCalenderDays: 2, totalAmtAccepted: 67000000, note: "<p>This operation is a Small Value Exercise (SVE)</p>", details: [] },
  ]);
  assert.equal(days.length, 1);
  const d = days[0];
  assert.deepEqual([d.rrp, d.rrpRate, d.rrpCpty, d.srf, d.treasury, d.mbs, d.srfRate, d.exercises], [11.539, 3.75, 18, 1.2, 1.2, 0, 4, 0.067]);
  assert.deepEqual(d.terms, []);
});

test("the overview: each facility, the Fed's holdings and net liquidity, with changes and plain sentences", async () => {
  const r = await run({});
  assert.deepEqual(r.reverse_repo, { date: "2026-10-09", billions: 0.3, rate_pct: 3.75, counterparties: 1, previous_day_billions: 0.335, average_20_days_billions: 2.056, year_ago: { date: "2025-10-09", billions: 4.496 } });
  assert.deepEqual(r.standing_repo, { date: "2026-10-09", billions: 0.001, minimum_bid_rate_pct: 4, days_used: 15, of_days: 20, largest: { date: "2026-09-30", billions: 1.2 } });
  assert.deepEqual(r.holdings.rows[0], ["total", 6355.8, -8, -2.7, 10.2, 199]);
  assert.equal(r.holdings.per_month_13_weeks, 3.4);
  const sheet = Object.fromEntries(r.balance_sheet.rows.map((x) => [x[0], x[1]]));
  assert.equal(sheet.net_liquidity, 5729.8);
  assert.equal(r.summary[0], "The overnight reverse repo facility took $300 million on 2026-10-09 at 3.75% from 1 counterparty, against $4.5 billion a year earlier (2025-10-09).");
  assert.equal(r.summary[1], "The standing repo facility lent $1 million on 2026-10-09 (minimum bid 4%); it lent on 15 of the last 20 business days, the most $1.2 billion on 2026-09-30.");
  assert.match(r.summary[2], /^The Fed held \$6,355\.8 billion of securities on 2026-10-28; over 13 weeks its holdings rose \$10\.2 billion \(about \$3\.4 billion a month: Treasury bills \+\$57 billion, .*mortgage-backed securities −\$47\.1 billion\)\.$/);
  assert.match(r.limits[0], /rule of thumb/);
});

test("day by day at the quarter's end, holdings week by week, and net liquidity that adds up", async () => {
  const ops = await run({ view: "operations" });
  assert.equal(ops.rows.length, 20);
  assert.deepEqual(ops.rows.find((x) => x[0] === "2026-09-30"), ["2026-09-30", 11.539, 3.75, 18, 1.2, 1.2, 0, 0, 4, 0]);
  const held = await run({ view: "holdings", weeks: 2 });
  assert.deepEqual(held.columns, ["week", "total", "bills", "notes_and_bonds", "tips", "frn", "mbs", "cmbs", "agencies"]);
  assert.equal(held.rows.length, 2);
  const sheet = await run({ view: "balance_sheet" });
  for (const [, assets, , tga, rrp, net] of sheet.rows) assert.ok(Math.abs(assets - tga - rrp - net) < 0.11, `${assets} - ${tga} - ${rrp} = ${net}`);
});

test("a source that fails leaves the rest, said plainly", async () => {
  const { fetchImpl } = replayFetch();
  const r = await run({}, async (url, init) => (/fredgraph/.test(url) ? new Response("down", { status: 503 }) : fetchImpl(url, init)));
  assert.equal(r.balance_sheet, undefined);
  assert.equal(r.reverse_repo.date, "2026-10-09");
  assert.match(r.limits[0], /^Not read this time: the Fed's weekly balance sheet from FRED/);
  await assert.rejects(run({}, async () => new Response("down", { status: 503 })), /No part of the Fed's liquidity could be read/);
});
