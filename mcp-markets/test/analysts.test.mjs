// analyst_history and market_movers against the shapes of Yahoo Finance's quote summary and screener answers
// (as read on 4 November 2026), with the free cookie and token Yahoo asks for.
import assert from "node:assert/strict";
import test from "node:test";

import { analystHistory, marketMovers } from "../src/analysts.mjs";
import { createSession } from "../src/sources.mjs";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const epoch = (d) => Date.parse(`${d}T12:00:00Z`) / 1000;
const SUMMARY = {
  upgradeDowngradeHistory: { history: [
    { epochGradeDate: epoch("2026-11-02"), firm: "Melius Research", toGrade: "Buy", fromGrade: "Buy", action: "main", priceTargetAction: "Lowers", currentPriceTarget: 315, priorPriceTarget: 420 },
    { epochGradeDate: epoch("2026-10-20"), firm: "Morgan Stanley", toGrade: "Overweight", fromGrade: "Equal-Weight", action: "up", priceTargetAction: "Raises", currentPriceTarget: 300, priorPriceTarget: 250 },
    { epochGradeDate: epoch("2026-09-01"), firm: "Small Cap Partners", toGrade: "Buy", fromGrade: "", action: "init", priceTargetAction: "Announces", currentPriceTarget: 280, priorPriceTarget: 0 },
    { epochGradeDate: epoch("2025-01-15"), firm: "Morgan Stanley", toGrade: "Equal-Weight", fromGrade: "Overweight", action: "down", priceTargetAction: "Lowers", currentPriceTarget: 150, priorPriceTarget: 170 },
  ] },
  earningsHistory: { history: [
    { epsActual: { raw: 1.62 }, epsEstimate: { raw: 1.53812 }, surprisePercent: { raw: 0.0532 }, quarter: { raw: 1769817600 }, period: "-3q" },
    { epsActual: { raw: 1.3 }, epsEstimate: { raw: 1.25647 }, surprisePercent: { raw: 0.0346 }, quarter: { raw: 1761868800 }, period: "-4q" },
  ] },
  earningsTrend: { trend: [{ period: "0q", endDate: "2026-10-31", epsTrend: { current: { raw: 2.47325 }, "7daysAgo": { raw: 2.47325 }, "30daysAgo": { raw: 2.47356 }, "60daysAgo": { raw: 2.46864 }, "90daysAgo": { raw: 2.34245 } }, epsRevisions: { upLast7days: { raw: 0 }, upLast30days: { raw: 0 }, downLast30days: { raw: 1 }, downLast7Days: { raw: 1 } } }] },
  recommendationTrend: { trend: [{ period: "0m", strongBuy: 10, buy: 49, hold: 2, sell: 1, strongSell: 0 }, { period: "-1m", strongBuy: 10, buy: 49, hold: 2, sell: 1, strongSell: 0 }] },
};
const SCREEN = { finance: { result: [{ title: "Day Losers", quotes: [{ symbol: "STVN", longName: "Stevanato Group S.p.A.", regularMarketPrice: 14.1, regularMarketChangePercent: -28.5714, regularMarketVolume: 4782255, averageDailyVolume3Month: 453026, marketCap: 3849351936, fullExchangeName: "NYSE" }] }] } };

function yahoo(body) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(String(url));
    if (new URL(url).hostname === "fc.yahoo.com") return new Response("not found", { status: 404, headers: { "set-cookie": "A3=abc; Domain=.yahoo.com; Path=/" } });
    if (String(url).includes("getcrumb")) return new Response("crumb-1");
    return new Response(JSON.stringify(body));
  };
  return { s: createSession({ fetchImpl, env: {}, now: () => NOW, sleep: async () => {} }), calls };
}

test("analyst_history: rating changes newest first within the window, surprises, revisions and monthly counts", async () => {
  const { s, calls } = yahoo({ quoteSummary: { result: [SUMMARY], error: null } });
  const h = await analystHistory(s, { symbol: "nvda" });
  assert.equal(h.symbol, "NVDA");
  assert.equal(h.since, "2026-05-08");
  assert.deepEqual(h.rating_changes.rows, [
    ["2026-11-02", "Melius Research", "maintained", "Buy", "Buy", "Lowers", 315, 420],
    ["2026-10-20", "Morgan Stanley", "upgrade", "Equal-Weight", "Overweight", "Raises", 300, 250],
    ["2026-09-01", "Small Cap Partners", "initiated", null, "Buy", "Announces", 280, null],
  ], "the 2025 downgrade is outside 180 days; an empty grade or a zero target is null");
  assert.deepEqual(h.rating_changes.summary, { upgrades: 1, downgrades: 0, initiated: 1, targets_raised: 1, targets_lowered: 1 });
  assert.deepEqual(h.earnings_surprises.rows, [["2025-10-31", 1.3, 1.25647, 3.46], ["2026-01-31", 1.62, 1.53812, 5.32]], "oldest first");
  assert.deepEqual(h.estimate_revisions.rows[0], ["0q", "2026-10-31", 2.47325, 2.47325, 2.47356, 2.46864, 2.34245, 0, 0, 1, 1]);
  assert.deepEqual(h.recommendations.rows.map((r) => r[0]), ["2026-10", "2026-11"]);
  assert.match(h.limits[0], /aggregates/);
  assert.ok(calls.some((u) => u.includes("modules=upgradeDowngradeHistory,earningsHistory,earningsTrend,recommendationTrend")));
  const ms = await analystHistory(s, { symbol: "NVDA", days: 730, firm: "morgan" });
  assert.deepEqual(ms.rating_changes.rows.map((r) => [r[0], r[2]]), [["2026-10-20", "upgrade"], ["2025-01-15", "downgrade"]]);
  const { s: missing } = yahoo({ quoteSummary: { result: null, error: { code: "Not Found" } } });
  await assert.rejects(analystHistory(missing, { symbol: "ZZZZ" }), /ZZZZ is not a symbol on Yahoo Finance/);
});

test("market_movers: a list's stocks with price, change, volume and value, and the list asked for", async () => {
  const { s, calls } = yahoo(SCREEN);
  const m = await marketMovers(s, { list: "losers", count: 5 });
  assert.equal(m.title, "Day Losers");
  assert.deepEqual(m.rows[0], ["STVN", "Stevanato Group S.p.A.", 14.1, -28.57, 4782255, 453026, 3849351936, "NYSE"]);
  assert.ok(calls.some((u) => u.includes("scrIds=day_losers&count=5")));
  const { s: empty } = yahoo({ finance: { result: [{ title: "Day Gainers", quotes: [] }] } });
  await assert.rejects(marketMovers(empty, {}), /gainers list is empty/);
});
