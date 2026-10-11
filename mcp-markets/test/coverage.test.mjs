// Markets beyond US stocks, against real responses (test/fixtures, captured by
// scripts/capture-coverage-fixtures.mjs). Expected values are read off the captured data.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../src/sources.mjs";
import * as F from "../src/funds.mjs";
import * as G from "../src/global.mjs";
import * as T from "../src/tools.mjs";
import { NOW, replayFetch } from "./replay.mjs";

function session(env = {}) {
  const r = replayFetch();
  return { s: createSession({ fetchImpl: r.fetchImpl, env, now: () => NOW, sleep: async () => {} }), calls: r.calls };
}
const window = { start: "2026-09-01", end: "2026-10-08" };

test("resolveSymbol: names and pairs become Yahoo codes; US share classes and foreign suffixes stay apart", () => {
  const cases = {
    AAPL: ["AAPL", true], "brk.b": ["BRK.B", true], "BRK-B": ["BRK.B", true], BTC: ["BTC", true],
    "SAP.DE": ["SAP.DE", false], "7203.T": ["7203.T", false], "0700.HK": ["0700.HK", false], "SHEL.L": ["SHEL.L", false],
    "EUR/USD": ["EURUSD=X", false], eurusd: ["EURUSD=X", false], "USD/JPY": ["USDJPY=X", false],
    gold: ["GC=F", false], "Crude Oil": ["CL=F", false], "S&P 500": ["^GSPC", false], "10-year yield": ["^TNX", false],
    bitcoin: ["BTC-USD", false], "BTC/USD": ["BTC-USD", false], "ETH-USD": ["ETH-USD", false], "DX-Y.NYB": ["DX-Y.NYB", false],
  };
  for (const [q, [symbol, us]] of Object.entries(cases)) {
    const r = T.resolveSymbol(q);
    assert.equal(r.symbol, symbol, q);
    assert.equal(r.us_listed, us, q);
  }
  assert.equal(T.yahooChartUrl("BRK.B", "2026-01-01", "2026-01-02").split("/chart/")[1].split("?")[0], "BRK-B");
  assert.equal(T.yahooChartUrl("SAP.DE", "2026-01-01", "2026-01-02").split("/chart/")[1].split("?")[0], "SAP.DE");
});

test("price_history: a currency pair, by its plain name, ends on the day asked for", async () => {
  const { s } = session();
  const r = await T.priceHistory(s, { symbol: "EUR/USD", ...window });
  assert.equal(r.symbol, "EURUSD=X");
  assert.equal(r.resolved_from, "EUR/USD");
  assert.equal(r.asset_class, "currency");
  assert.equal(r.currency, "USD");
  assert.equal(r.end, "2026-10-08", "the bar Yahoo stamps 2026-10-09 is after the window");
  assert.equal(r.close.at(-1), 1.1201);
  assert.equal(r.close[0], 1.1618);
  assert.match(r.notes[0], /US dollars per euro/);
  assert.deepEqual(r.dividends, []);
});

test("price_history: crude oil futures, the S&P 500 index and bitcoin, each with what its price means", async () => {
  const { s } = session();
  const oil = await T.priceHistory(s, { symbol: "crude oil", ...window });
  assert.equal(oil.symbol, "CL=F");
  assert.equal(oil.asset_class, "future");
  assert.equal(oil.close.at(-1), 91.49);
  assert.match(oil.notes[0], /front-month/);
  const spx = await T.priceHistory(s, { symbol: "S&P 500", ...window });
  assert.equal(spx.symbol, "^GSPC");
  assert.equal(spx.asset_class, "index");
  assert.equal(spx.close.at(-1), 7765.3599);
  assert.equal(spx.change.total_return, Math.round((7765.35986328125 / 7631.47021484375 - 1) * 1e8) / 1e8);
  const btc = await T.priceHistory(s, { symbol: "bitcoin", ...window });
  assert.equal(btc.symbol, "BTC-USD");
  assert.equal(btc.asset_class, "cryptocurrency");
  assert.equal(btc.count, 38, "crypto trades every day, weekends included");
});

test("price_history: stocks listed abroad keep their market suffix; London prices are flagged as pence", async () => {
  const { s } = session();
  const shel = await T.priceHistory(s, { symbol: "SHEL.L", ...window });
  assert.equal(shel.currency, "GBp");
  assert.equal(shel.close.at(-1), 3780.5);
  assert.ok(shel.notes.some((n) => /divide by 100 for pounds/.test(n)));
  const sap = await T.priceHistory(s, { symbol: "sap.de", ...window });
  assert.equal(sap.symbol, "SAP.DE");
  assert.equal(sap.currency, "EUR");
  assert.equal(sap.asset_class, "equity");
  assert.equal(sap.notes, undefined);
});

test("price_history: with Alpaca keys, other markets still come from Yahoo; with keyless prices off they say why", async () => {
  const keys = { ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "secret" };
  const { s, calls } = session(keys);
  const r = await T.priceHistory(s, { symbol: "EUR/USD", ...window });
  assert.equal(r.source, "Yahoo Finance chart data (no key)");
  assert.ok(calls.every((c) => !String(c.url).includes("alpaca")));
  const off = session({ ...keys, CANLI_KEYLESS_PRICES: "0" });
  await assert.rejects(T.priceHistory(off.s, { symbol: "gold", ...window }), /GC=F is not a US-listed stock.*CANLI_KEYLESS_PRICES=0/);
});

test("world_economy: inflation by plain words for countries named as people say them, with each one's latest year", async () => {
  const { s } = session();
  const r = await G.worldEconomy(s, { indicator: "inflation", countries: ["United States", "euro area", "China", "Japan", "turkey"] });
  assert.equal(r.indicator.id, "FP.CPI.TOTL.ZG");
  assert.equal(r.indicator.name, "Inflation, consumer prices (annual %)");
  assert.equal(r.matched_from, "inflation");
  assert.deepEqual(r.columns, ["year", "USA", "EMU", "CHN", "JPN", "TUR"]);
  assert.deepEqual(r.latest.rows.map((x) => x.slice(0, 3)), [["USA", "United States", 2024], ["EMU", "Euro area", 2025], ["CHN", "China", 2025], ["JPN", "Japan", 2025], ["TUR", "Turkiye", 2025]]);
  assert.equal(r.latest.rows[4][3], 34.88117);
  assert.deepEqual(r.rows[0], [2016, 1.261583, 0.14881, 2.000002, -0.127259, 7.775134]);
  assert.equal(r.rows.at(-1)[1], null, "the US 2025 figure is not yet published");
  assert.match(r.source, /locations=US-XC-CN-JP-TR$/);
});

test("world_economy: a place the World Bank does not cover says so", async () => {
  const { s } = session();
  await assert.rejects(G.worldEconomy(s, { indicator: "inflation", countries: ["Taiwan"] }), /not a World Bank member/);
  await assert.rejects(G.worldEconomy(s, { indicator: "favourite colour", countries: ["US"] }), /No common indicator/);
});

test("treasury_auctions: the 10-year includes its reopenings; bidder shares add up to the competitive amount", async () => {
  const { s } = session();
  const r = await G.treasuryAuctions(s, { security: "10-year", limit: 6 });
  assert.equal(r.rate_is, "yield, percent");
  assert.deepEqual(r.rows.map((x) => x[0]), ["2026-10-07", "2026-09-09", "2026-08-12", "2026-07-08", "2026-06-10", "2026-05-12"]);
  assert.equal(r.rows[0][1], "9-Year 10-Month Note (reopening)");
  assert.equal(r.rows[2][1], "10-Year Note");
  const [, , cusip, high, coupon, btc, offering, accepted, indirect, direct, dealer, hm] = r.rows[0];
  assert.deepEqual([cusip, high, coupon, btc, offering, accepted, hm], ["91282CRF0", 5.3, 4.625, 2.77, 39000000000, 39926321900, 4.5]);
  for (const x of r.rows) assert.ok(Math.abs(x[8] + x[9] + x[10] - 1) <= 0.0002, `${x[0]} shares ${x[8]} + ${x[9]} + ${x[10]}`);
  assert.deepEqual([indirect, direct, dealer], [0.8034, 0.1712, 0.0254]);
  assert.deepEqual(r.averages, { bid_to_cover: 2.595, indirect_share: 0.7665, over_auctions: 6 });
});

test("treasury_auctions: bills clear at their investment rate; upcoming auctions come soonest first, after today", async () => {
  const { s } = session();
  const b = await G.treasuryAuctions(s, { security: "13-week bill", limit: 3 });
  assert.equal(b.rate_is, "investment rate (bond-equivalent yield), percent");
  assert.deepEqual(b.rows[0].slice(0, 6), ["2026-10-05", "13-Week Bill (reopening)", "912797VS3", 4.149, null, 2.51]);
  const u = await G.treasuryAuctions(s, { upcoming: true, limit: 5 });
  assert.equal(u.upcoming, true);
  assert.ok(u.rows.every((x) => x[0] > "2026-10-09"));
  assert.deepEqual(u.rows[0].slice(0, 4), ["2026-10-13", "6-Week Bill (reopening)", "912797SU2", 95000000000]);
  assert.throws(() => G.parseSecurity("apples"), /names no Treasury security/);
});

test("federal_debt: a year of Debt to the Penny; held by the public plus intragovernmental is the total, to the cent", async () => {
  const { s } = session();
  const r = await G.federalDebt(s, {});
  assert.deepEqual(r.latest, { date: "2026-10-08", total: 40305316210829.72, held_by_public: 32454086117711.32, intragovernmental: 7851230093118.4 });
  assert.equal(r.frequency, "daily");
  assert.equal(r.rows.length, 251);
  for (const [d, total, pub, intra] of r.rows) assert.ok(Math.abs(pub + intra - total) < 0.011, d);
  assert.deepEqual(r.change, { from: "2025-10-09", to: "2026-10-08", total: 2421385798367.33, total_pct: 0.063916 });
  assert.equal(r.average_interest_rates.month, "2026-09-30");
  assert.deepEqual(r.average_interest_rates.rows.find((x) => x[1] === "Total Marketable"), ["Marketable", "Total Marketable", 3.518]);
});

test("fund_portfolio: IVV's N-PORT, its largest positions, exposures, returns, flows and changes since the quarter before", async () => {
  const { s } = session();
  const r = await F.fundPortfolio(s, { fund: "IVV", top: 3 });
  assert.deepEqual(r.fund, { name: "iShares Core S&P 500 ETF", ticker: "IVV", series_id: "S000004310", class_id: "C000012040", registrant: "iShares Trust", registrant_cik: 1100663 });
  assert.deepEqual([r.period, r.filed, r.accession, r.net_assets, r.positions], ["2026-06-30", "2026-08-25", "0002071691-26-019760", 888128937468.17, 508]);
  assert.equal(r.weights_add_to, 1.0012);
  assert.deepEqual(r.rows.map((x) => [x[0], x[2], x[5]]), [["NVIDIA Corp.", "67066G104", 0.075059], ["Apple, Inc.", "037833100", 0.065823], ["Microsoft Corp.", "594918104", 0.042917]]);
  assert.deepEqual(r.exposure.asset_category.rows[0], ["EC", "equity, common", 0.9983]);
  assert.deepEqual(r.exposure.country.rows[0], ["US", 0.9717]);
  assert.deepEqual(r.monthly_returns.rows, [["2026-04", 0.104916], ["2026-05", 0.052632], ["2026-06", -0.009562]]);
  for (const [m, sales, reinvest, redeem, net] of r.flows.rows) assert.ok(Math.abs(sales + reinvest - redeem - net) < 0.011, m);
  assert.deepEqual(r.flows.rows[2], ["2026-06", 114335801883.95, 0, 70740612095.5, 43595189788.45]);
  assert.equal(r.changes_since.period, "2026-03-31");
  assert.deepEqual(r.changes_since.counts, { new: 10, exited: 9, added: 490, reduced: 6 });
  assert.deepEqual(r.changes_since.rows[0].slice(0, 3), ["new", "Marvell Technology, Inc.", "573874104"]);
  assert.equal(r.bonds, undefined, "an equity fund has no bond profile");
  assert.match(r.source, /0002071691-26-019760-index\.htm$/);
});

test("fund_portfolio: TLT, a Treasury bond fund, with its coupon and maturity profile", async () => {
  const { s } = session();
  const r = await F.fundPortfolio(s, { fund: "tlt", top: 2 });
  assert.equal(r.fund.name, "iShares 20+ Year Treasury Bond ETF");
  assert.equal(r.period, "2026-05-31", "TLT's fiscal quarters end in February, May, August and November");
  assert.deepEqual(r.exposure.issuer_category.rows[0], ["UST", "US Treasury", 0.9822]);
  assert.equal(r.bonds.bonds, 46);
  assert.equal(r.bonds.weighted_coupon_pct, 3.489);
  assert.equal(r.bonds.weighted_years_to_maturity, 26.01);
  assert.deepEqual(r.bonds.maturity.rows.at(-1), ["20 years and over", 0.9682]);
  assert.deepEqual(r.rows[0].slice(0, 6), ["United States of America", "U.S. Treasury Bonds", "912810TT5", "US912810TT51", 1964434087.09, 0.045785]);
});

test("fund_portfolio: SPY, a unit investment trust, and an unknown ticker each say why there is no N-PORT", async () => {
  const tickers = { 0: { cik_str: 884394, ticker: "SPY", title: "SPDR S&P 500 ETF TRUST" } };
  const r = replayFetch({ "https://www.sec.gov/files/company_tickers.json": tickers });
  const s = createSession({ fetchImpl: r.fetchImpl, now: () => NOW, sleep: async () => {} });
  await assert.rejects(F.fundPortfolio(s, { fund: "SPY" }), /SPY \(SPDR S&P 500 ETF TRUST\) files no Form N-PORT: unit investment trusts/);
  await assert.rejects(F.fundPortfolio(s, { fund: "ZZZZZ" }), /No US mutual fund or ETF has the ticker ZZZZZ/);
});
