// portfolio_rules against SEC's ticker, fund and cover-page data and FINRA's short interest volume, in the shapes
// those sources answer (read 6 November 2026), with made-up companies so every figure can be checked by hand.
import assert from "node:assert/strict";
import test from "node:test";

import { portfolioRules } from "../src/portfolio-rules.mjs";
import { createSession } from "../src/sources.mjs";

const TICKERS = {
  0: { cik_str: 1, ticker: "AAA", title: "Alpha Corp" },
  1: { cik_str: 2, ticker: "BBB", title: "Beta Inc" },
  2: { cik_str: 1652044, ticker: "GOOGL", title: "Alphabet Inc." },
  3: { cik_str: 1652044, ticker: "GOOG", title: "Alphabet Inc." },
};
const FUNDS = { fields: ["cik", "seriesId", "classId", "symbol"], data: [[1100663, "S000004347", "C000012066", "IVV"]] };
const COVER = { 1: 100_000_000, 2: 10_000_000, 1652044: 12_000_000_000 };
const VOLUME = { AAA: 1_000_000, BBB: 50_000, GOOGL: 30_000_000 };

function sources(env = {}) {
  const calls = [];
  const json = (body) => new Response(JSON.stringify(body));
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u === "https://www.sec.gov/files/company_tickers.json") return json(TICKERS);
    if (u === "https://www.sec.gov/files/company_tickers_mf.json") return json(FUNDS);
    let m = u.match(/companyconcept\/CIK(\d{10})\/dei\/EntityCommonStockSharesOutstanding\.json$/);
    if (m) {
      const shares = COVER[Number(m[1])];
      return shares ? json({ units: { shares: [{ end: "2026-07-31", val: shares, form: "10-Q", filed: "2026-08-05" }, { end: "2026-01-31", val: shares * 0.9, form: "10-K", filed: "2026-02-20" }] } }) : new Response("not found", { status: 404 });
    }
    m = u.match(/submissions\/CIK(\d{10})\.json$/);
    if (m) return json({ cik: m[1], filings: { recent: { form: ["10-Q", "10-K"], accessionNumber: ["0000000001-26-000002", "0000000001-26-000001"], primaryDocument: ["q.htm", "k.htm"] } } });
    if (u.endsWith("/partitions/group/otcMarket/name/consolidatedShortInterest")) return json({ availablePartitions: [{ partitions: ["2026-10-15"] }, { partitions: ["2026-10-31"] }] });
    if (u.endsWith("/data/group/otcMarket/name/consolidatedShortInterest") && init.method === "POST") {
      const symbol = JSON.parse(init.body).compareFilters[0].fieldValue;
      return json(VOLUME[symbol] ? [{ settlementDate: "2026-10-15", averageDailyVolumeQuantity: VOLUME[symbol] * 2 }, { settlementDate: "2026-10-31", averageDailyVolumeQuantity: VOLUME[symbol] }] : []);
    }
    return new Response(`not served: ${u}`, { status: 404 });
  };
  return { s: createSession({ fetchImpl, env, now: () => Date.parse("2026-11-06T12:00:00Z"), sleep: async () => {} }), calls };
}
const row = (r, symbol) => Object.fromEntries(r.holdings.columns.map((c, i) => [c, r.holdings.rows.find((x) => x[0] === symbol)[i]]));

test("portfolio_rules: who crosses 5% and 10% of a class, the 13F line, concentration, and both diversification tests failing", async () => {
  const { s, calls } = sources();
  const r = await portfolioRules(s, {
    holdings: [
      { symbol: "AAA", shares: 6_000_000, value: 600_000_000 },
      { symbol: "bbb", shares: 1_100_000, value: 50_000_000 },
      { symbol: "IVV", shares: 150_000, value: 100_000_000 },
      { symbol: "GOOGL", shares: 1_000, price: 300 },
    ],
    cash: 50_000_000,
  });
  // Shares over the latest cover page (31 July, not January's), as a percentage of the class.
  assert.deepEqual([row(r, "AAA").pct_of_class, row(r, "AAA").class_as_of, row(r, "BBB").pct_of_class, row(r, "IVV").pct_of_class], [6, "2026-07-31", 11, null]);
  assert.deepEqual([r.lines[0].crossed_by, r.lines[1].crossed_by], [["AAA", "BBB"], ["BBB"]]);
  assert.match(r.lines[0].then, /five business days/);
  assert.deepEqual([r.lines[2].value, r.lines[2].crossed], [750_300_000, true]);
  // Days to exit at 20% of FINRA's latest average daily volume: 6,000,000 / (0.2 x 1,000,000).
  assert.deepEqual([row(r, "AAA").days_to_exit, row(r, "AAA").average_daily_volume, row(r, "IVV").days_to_exit], [30, 1_000_000, null]);
  assert.equal(row(r, "AAA").pct_of_total_assets, 74.97);
  const w = [600, 100, 50, 0.3].map((v) => v / 750.3);
  assert.equal(r.concentration.hhi, Math.round(w.reduce((t, x) => t + x * x, 0) * 1e4) / 1e4);
  assert.deepEqual([r.concentration.largest, r.concentration.issuers, r.concentration.total_assets], [{ symbols: ["AAA"], pct_of_invested: 79.97 }, 4, 800_300_000]);
  // Qualifying: cash 50, the fund 100, Alphabet 0.3 (BBB is 6.25% of assets): 150.3 of 800.3.
  assert.deepEqual([r.diversification.diversified_fund_75_5_10.qualifying_pct, r.diversification.diversified_fund_75_5_10.passes], [18.78, false]);
  assert.deepEqual([r.diversification.regulated_investment_company.over_25_pct, r.diversification.regulated_investment_company.passes], [["AAA"], false]);
  assert.ok(r.caveats.some((c) => /^GOOGL: the company lists more than one class/.test(c)));
  assert.ok(r.caveats.some((c) => /^IVV: a fund in the SEC's fund file/.test(c)));
  assert.ok(!calls.some((u) => /yahoo/.test(u)), "values were given, so no price is fetched");
  assert.ok(!calls.some((u) => /CIK0001100663/.test(u)), "a fund's trust cover page is not read");
});

test("portfolio_rules: small positions and cash pass both diversification tests and stay under the 13F line", async () => {
  const { s } = sources();
  const r = await portfolioRules(s, { holdings: [{ symbol: "AAA", shares: 300_000, value: 30_000_000 }, { symbol: "2", shares: 50_000, value: 20_000_000 }], cash: 950_000_000 });
  assert.deepEqual([row(r, "AAA").pct_of_class, row(r, "BBB").pct_of_class], [0.3, 0.5]);
  assert.deepEqual([r.lines[0].crossed_by, r.lines[2].crossed], [[], false]);
  assert.deepEqual([r.diversification.diversified_fund_75_5_10.passes, r.diversification.regulated_investment_company.passes], [true, true]);
  assert.equal(r.diversification.diversified_fund_75_5_10.qualifying_pct, 100);
});

test("portfolio_rules: where prices are off and no value is given, it says what to give and leaves the value tests empty", async () => {
  const { s, calls } = sources({ CANLI_KEYLESS_PRICES: "0" });
  const r = await portfolioRules(s, { holdings: [{ symbol: "BBB", shares: 600_000 }] });
  assert.deepEqual([row(r, "BBB").pct_of_class, row(r, "BBB").value, r.lines[0].crossed_by], [6, null, ["BBB"]]);
  assert.deepEqual([r.lines[2].value, r.lines[2].crossed, r.concentration, r.diversification], [null, null, null, null]);
  assert.ok(r.caveats.some((c) => /^BBB: no value \(Keyless prices are off/.test(c) && /Give value or price/.test(c)), r.caveats.join(" | "));
  assert.ok(!calls.some((u) => /yahoo/.test(u)));
});

test("portfolio_rules: a ticker in neither SEC file is named, not guessed at", async () => {
  const { s } = sources();
  const r = await portfolioRules(s, { holdings: [{ symbol: "ZZZZ", shares: 10, value: 1000 }, { symbol: "AAA", shares: 10, value: 1000 }] });
  assert.deepEqual([row(r, "ZZZZ").cik, row(r, "ZZZZ").pct_of_class], [null, null]);
  assert.ok(r.caveats.some((c) => /^ZZZZ: not a ticker or CIK in the SEC's list/.test(c)));
  await assert.rejects(portfolioRules(s, { holdings: [] }), /holdings/);
});
