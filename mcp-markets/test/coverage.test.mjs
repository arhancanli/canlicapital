// Markets beyond US stocks, against real responses (test/fixtures, captured by
// scripts/capture-coverage-fixtures.mjs). Expected values are read off the captured data.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession, unzipFirst } from "../src/sources.mjs";
import * as Adv from "../src/advisers.mjs";
import * as Cal from "../src/calendar.mjs";
import * as CB from "../src/centralbank.mjs";
import * as E from "../src/events.mjs";
import * as F from "../src/funds.mjs";
import * as G from "../src/global.mjs";
import * as O from "../src/ownership.mjs";
import * as Pos from "../src/positioning.mjs";
import * as Pay from "../src/pay.mjs";
import * as Opt from "../src/options.mjs";
import * as P from "../src/private.mjs";
import * as Seg from "../src/segments.mjs";
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
  assert.ok(calls.every((c) => new URL(c.url).host === "query1.finance.yahoo.com"));
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

test("large_holders: Coca-Cola's 5 percent holders, without the 13Ds Coca-Cola filed about its bottlers", async () => {
  const { s } = session();
  const r = await O.largeHolders(s, { company: "21344" });
  assert.deepEqual(r.company, { cik: 21344, name: "COCA COLA CO", ticker: "KO" });
  assert.equal(r.since, "2023-10-10");
  assert.equal(r.filings, 9);
  assert.equal(r.filed_by_it_about_other_companies, 3, "its stakes in its bottlers are not holders of Coca-Cola");
  assert.deepEqual(r.rows.map((x) => x.slice(0, 8)), [
    ["Vanguard Capital Management", "investment adviser", "13G", null, "2026-03-31", "2026-04-29", 276838699, 0.0643],
    ["The Vanguard Group", "investment adviser", "13G", 10, "2026-03-13", "2026-03-26", 0, 0],
  ]);
  assert.equal(r.earlier_text_filings.count, 4);
  assert.equal(r.purposes_13d, undefined);
});

test("large_holders: across the market, the week's new 13D stakes with holder, size and purpose", async () => {
  const { s } = session();
  const r = await O.largeHolders(s, { limit: 3 });
  assert.equal(r.schedule, "13D");
  assert.deepEqual([r.since, r.until, r.total, r.shown], ["2026-10-02", "2026-10-09", 113, 3]);
  assert.deepEqual(r.rows[0].slice(0, 8), ["2026-10-09", "SCHEDULE 13D", "Vertical Data Inc.", 2033264, "Creatura Christopher", "individual", 1205004, 0.079]);
  assert.ok(r.rows.every((x) => typeof x[9] === "string" && x[9].length > 0), "each 13D states its purpose");
});

test("company_events: event names, item numbers and aliases resolve; excerpts start at what the filing says", () => {
  assert.equal(E.eventCode("earnings"), "2.02");
  assert.equal(E.eventCode("Item 4.02"), "4.02");
  assert.equal(E.eventCode("cyber"), "1.05");
  assert.equal(E.eventCode("executive change"), "5.02");
  assert.throws(() => E.eventCode("weather"), /Unknown 8-K event/);
  // Converted text can glue a heading to its title; a later "Item 1.05(a) of Form 8-K" is a reference.
  const t = "Item 1.05Material Cybersecurity Incident.\nAstrana Health detected unusual activity.\nItem 1.05(a) of Form 8-K was not determined.\nItem 9.01 Exhibits.";
  assert.equal(E.itemExcerpt(t, "1.05"), "Astrana Health detected unusual activity. Item 1.05(a) of Form 8-K was not determined.");
  const wrapped = "Item 5.02 Departure of Directors or Certain Officers; Compensatory Arrangements of Certain\nOfficers. On April 20, 2026, Apple announced a transition.";
  assert.equal(E.itemExcerpt(wrapped, "5.02"), "On April 20, 2026, Apple announced a transition.");
});

test("company_events: the month's restatements across the market, from each 8-K itself", async () => {
  const { s } = session();
  const r = await E.companyEvents(s, { event: "restatement", limit: 3 });
  assert.deepEqual(r.event, { item: "4.02", name: "restatement", meaning: "previously issued financial statements should no longer be relied on (restatement)" });
  assert.deepEqual([r.since, r.until, r.found], ["2026-09-09", "2026-10-09", 6]);
  assert.deepEqual(r.rows.map((x) => [x[0], x[5]]), [["2026-10-08", "0001493152-26-046278"], ["2026-10-02", "0001477932-26-006021"], ["2026-09-25", "0001079973-26-001283"]]);
  assert.ok(r.rows.every((x) => x[2].includes("4.02") && x[3].includes("restatement")));
  assert.match(r.rows[2][6], /ftw_8k\.htm$/, "the 8-K itself, not the auditor's letter the search also matched");
  assert.match(r.rows[2][4], /^The management of Feel the World, Inc\./);
});

test("company_events: Apple's executive changes, each in the words of the filing", async () => {
  const { s } = session();
  const r = await E.companyEvents(s, { company: "AAPL", event: "executive_change", since: "2025-01-01", limit: 3 });
  assert.equal(r.matched, 6);
  assert.deepEqual(r.rows.map((x) => x[0]), ["2026-04-20", "2026-01-02", "2025-12-05"]);
  assert.match(r.rows[0][4], /^On April 20, 2026, Apple Inc\. \("Apple"\) announced that Tim Cook will transition from his role as Chief Executive Officer to Executive Chair/);
  assert.match(r.rows[2][4], /Jennifer Newstead will become Apple's general counsel/);
});

test("private_offerings: the newest Form D raises across the market, and those that sold at least $10 million", async () => {
  const { s } = session();
  const r = await P.privateOfferings(s, { limit: 3 });
  assert.deepEqual([r.since, r.until, r.filings_in_window, r.read], ["2026-10-02", "2026-10-09", 1764, 3]);
  assert.deepEqual(r.rows[1], ["2026-10-09", "KBC Baxter LLC", "Residential", null, "WA", 7700000, 7700000, 49, "2026-09-30", ["Rule 506(b) (no general solicitation)"], false, "0002159787-26-000001"]);
  const big = await P.privateOfferings(s, { min_sold: 10000000, limit: 2 });
  assert.equal(big.read, 6);
  assert.deepEqual(big.rows.map((x) => [x[1], x[5], x[7]]), [["SOVEREIGN CULTURAL FUND I, LP", 35000000, 1], ["Barada Holdings LLC", 95676600, 103]]);
  assert.ok(big.rows.every((x) => x[5] >= 10000000));
});

test("private_offerings: a private equity fund's Form D by CIK, with its exemptions and the people behind it", async () => {
  const { s } = session();
  const r = await P.privateOfferings(s, { company: "2159753" });
  assert.equal(r.issuer.name, "Onex Partners Opportunities Fund Annex I LP");
  assert.equal(r.issuer.incorporated_in, "CAYMAN ISLANDS");
  assert.deepEqual(r.rows[0].slice(2, 9), ["Pooled Investment Fund", "Private Equity Fund", "NY", 0, "indefinite", 0, "yet to occur"]);
  assert.ok(r.rows[0][9].includes("Investment Company Act Section 3(c)(7) (qualified purchasers)"));
  assert.deepEqual(r.people[0], { name: "MATTHEW MURPHY", roles: ["Executive Officer", "Promoter"] });
});

test("short_interest: GameStop over six reports, as a share of the shares on its latest 10-Q cover", async () => {
  const { s, calls } = session();
  const r = await Pos.shortInterest(s, { symbol: "GME" });
  assert.equal(r.name, "GameStop Corp. Class A");
  assert.deepEqual(r.rows.map((x) => x[0]), ["2026-07-15", "2026-07-31", "2026-08-14", "2026-08-31", "2026-09-15", "2026-09-30"]);
  const { settlement_date, short_position, change, days_to_cover, pct_of_shares_outstanding, shares_outstanding } = r.latest;
  assert.deepEqual([settlement_date, short_position, change, days_to_cover], ["2026-09-30", 42673721, 3604595, 3.98]);
  for (let i = 1; i < r.rows.length; i++) assert.equal(r.rows[i][1] - r.rows[i - 1][1], r.rows[i][2], `FINRA's change matches the positions at ${r.rows[i][0]}`);
  assert.deepEqual(shares_outstanding, { shares: 504500990, as_of: "2026-09-03", form: "10-Q", filed: "2026-09-09" });
  assert.equal(pct_of_shares_outstanding, Math.round((42673721 / 504500990) * 1e6) / 1e6);
  assert.ok(calls.some((c) => c.method === "POST" && new URL(c.url).host === "api.finra.org"), "FINRA's filters go in a POST body");
});

test("short_interest: across the market, the longest days to cover among stocks trading over a million shares a day", async () => {
  const { s } = session();
  const r = await Pos.shortInterest(s, { limit: 5 });
  assert.deepEqual([r.settlement_date, r.ranked_by, r.min_average_daily_volume], ["2026-09-30", "days_to_cover", 1000000]);
  assert.deepEqual(r.rows.map((x) => x[0]), ["AMXOF", "CNQ", "SFBQF", "GPGI", "GLUE"]);
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i - 1][6] >= r.rows[i][6]);
  assert.ok(r.rows.every((x) => x[5] > 1000000));
});

test("futures_positioning: gold's Commitments of Traders by trader group, with managed money's place in its year", async () => {
  const { s } = session();
  const r = await Pos.futuresPositioning(s, { market: "gold" });
  assert.deepEqual(r.market, { code: "088691", name: "GOLD - COMMODITY EXCHANGE INC.", units: "(CONTRACTS OF 100 TROY OUNCES)" });
  assert.equal(r.report, "Disaggregated Futures Only");
  assert.deepEqual([r.as_of, r.open_interest, r.rows.length], ["2026-10-06", 396109, 52]);
  for (const [group, long, short, net] of r.latest.rows) assert.equal(long - short, net, group);
  assert.deepEqual(r.latest.rows.find((x) => x[0] === "managed_money"), ["managed_money", 127101, 16114, 110987, 0.2802, -9331]);
  assert.deepEqual(r.speculators, { group: "managed_money", net: 110987, range_in_window: [89752, 144747], position_in_range: 0.3861, weeks: 52 });
  assert.equal(r.stale, undefined);
});

test("futures_positioning: 10-year notes from the financial report (leveraged funds); lumber found by name, current contract first", async () => {
  const { s } = session();
  const t = await Pos.futuresPositioning(s, { market: "10 year note", weeks: 26 });
  assert.equal(t.report, "Traders in Financial Futures, Futures Only");
  assert.deepEqual(t.latest.rows.find((x) => x[0] === "leveraged_funds"), ["leveraged_funds", 510611, 2650396, -2139785, -0.3726, -103353]);
  const l = await Pos.futuresPositioning(s, { market: "lumber", weeks: 4 });
  assert.equal(l.market.code, "058644", "the contract still reported, not the larger one that stopped in 2023");
  assert.deepEqual(l.market.other_matches, [{ code: "058643", name: "RANDOM LENGTH LUMBER - CHICAGO MERCANTILE EXCHANGE" }]);
});

test("executive_pay: NVIDIA's pay-versus-performance table from its proxy XBRL, five years", async () => {
  const { s } = session();
  const r = await Pay.executivePay(s, { company: "NVDA" });
  assert.deepEqual(r.proxy, { filed: "2026-05-12", accession: "0001045810-26-000036" });
  assert.equal(r.company_selected_measure_name, "Non-GAAP Operating Income");
  assert.equal(r.rows.length, 5);
  assert.deepEqual(r.rows[0], ["2026-01-25", "Jen-Hsun Huang", 36343830, 162180936, 14422317, 57721552, 1445.67, 198.1, 120067000000, 137300000000]);
  assert.ok(r.rows.some((x) => x[3] < 0), "pay actually paid revalues equity awards and can be negative");
  assert.equal(r.check, undefined);
});

test("executive_pay: CEO pay ranked across the market, mis-scaled filings held out, mega-grants flagged to confirm", async () => {
  const { s } = session();
  const r = await Pay.executivePay(s, { limit: 6 });
  assert.equal(r.year, 2025);
  assert.deepEqual(r.rows.map((x) => x[0]), ["Opendoor Technologies Inc.", "Rivian Automotive, Inc. / DE", "CrowdStrike Holdings, Inc.", "APPLIED DIGITAL CORPORATION", "Warner Bros. Discovery, Inc.", "CHIME FINANCIAL, INC."]);
  assert.deepEqual(r.rows.map((x) => x[7]), ["very large: confirm in the filing", "very large: confirm in the filing", null, null, null, null]);
  assert.deepEqual(r.held_out.rows.map((x) => [x[0], x[2], x[3]]), [
    ["LeMaitre Vascular, Inc.", 3780990000, 911587000], ["American Outdoor Brands, Inc.", 1843433000, 672173000],
    ["U-HAUL HOLDING COMPANY", 1015838000, 618887000], ["Welltower Inc", 821090355, 136616146],
  ]);
  assert.ok(r.held_out.rows.every((x) => x[3] > Pay.SLIPPED_AVG));
});

test("executive_pay: a CEO name wrapped in HTML, and other executives' names tagged as CEO names, are read right", () => {
  const xml = `<xbrli:xbrl xmlns:xbrli="x" xmlns:ecd="e" xmlns:xbrldi="d">
    <xbrli:context id="Y"><xbrli:entity/><xbrli:period><xbrli:startDate>2024-09-29</xbrli:startDate><xbrli:endDate>2025-09-27</xbrli:endDate></xbrli:period></xbrli:context>
    <xbrli:context id="Y_ceo"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="ecd:ExecutiveCategoryAxis">ecd:PeoMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="ecd:IndividualAxis">a:CookMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2024-09-29</xbrli:startDate><xbrli:endDate>2025-09-27</xbrli:endDate></xbrli:period></xbrli:context>
    <xbrli:context id="Y_cfo"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="ecd:ExecutiveCategoryAxis">ecd:NonPeoNeoMember</xbrldi:explicitMember><xbrldi:explicitMember dimension="ecd:IndividualAxis">a:MaestriMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2024-09-29</xbrli:startDate><xbrli:endDate>2025-09-27</xbrli:endDate></xbrli:period></xbrli:context>
    <ecd:PeoName contextRef="Y_ceo"><span>Mr. Cook</span></ecd:PeoName>
    <ecd:PeoName contextRef="Y_cfo">Luca Maestri</ecd:PeoName>
    <ecd:PeoTotalCompAmt contextRef="Y">74294811</ecd:PeoTotalCompAmt>
  </xbrli:xbrl>`;
  const { rows } = Pay.parsePayTable(xml);
  assert.deepEqual(rows.map((r) => [r.year_end, r.ceo, r.ceo_reported_pay]), [["2025-09-27", "Mr. Cook", 74294811]]);
});

test("fomc: 2026's decisions from the Fed's own statements, with votes, dissenters and the September projections", async () => {
  const { s } = session();
  const r = await CB.fomc(s, {});
  assert.deepEqual(r.rows.map((x) => [x[1], x[2], x[4], x[5], x[6], x[7], x[8]]), [
    ["2026-01-28", "held", "held", 0, 3.5, 3.75, "10-2"], ["2026-03-18", "held", "held", 0, 3.5, 3.75, "11-1"],
    ["2026-04-29", "held", "held", 0, 3.5, 3.75, "8-4"], ["2026-06-17", "held", "held", 0, 3.5, 3.75, "12-0"],
    ["2026-07-29", "held", "held", 0, 3.5, 3.75, "9-3"], ["2026-09-16", "held", "raised", 25, 3.75, 4, "12-0"],
    ["2026-10-28", "scheduled", null, null, null, null, null], ["2026-12-09", "scheduled", null, null, null, null, null],
  ]);
  assert.equal(r.rows[2][9], "Stephen I. Miran; Beth M. Hammack; Neel Kashkari; Lorie K. Logan");
  assert.deepEqual(r.rows.map((x) => x[3]), [false, true, false, true, false, true, false, true], "projection meetings are starred on the calendar");
  assert.match(r.latest_statement.decision, /^The Committee decided to raise the target range for the federal funds rate by 1\/4 percentage point to 3-3\/4 to 4 percent/);
  assert.equal(r.projections.meeting, "2026-09-16");
  assert.deepEqual(r.projections.columns, ["variable", "2026", "2027", "2028", "2029", "longer_run"]);
  assert.deepEqual(r.projections.median.find((x) => x[0] === "Federal funds rate"), ["Federal funds rate", 4.1, 4.1, 3.9, 3.6, 3.2]);
  assert.deepEqual(r.projections.previous_median.find((x) => x[0] === "Federal funds rate"), ["Federal funds rate", 3.8, 3.6, 3.4, null, 3.1]);
});

test("fomc: statements parse in both forms, with grouped dissents and non-breaking hyphens", () => {
  assert.equal(CB.fedNumber("3-3/4"), 3.75);
  assert.equal(CB.fedNumber("1/4"), 0.25);
  assert.equal(CB.fedNumber("4"), 4);
  const html = "<p>In support of its goals, the Committee decided to maintain the target range for the federal funds rate at 3\u20111/2 to 3\u20113/4 percent.</p><p>Voting for the monetary policy action were Jerome H. Powell, Chair; John C. Williams, Vice Chair; Michael S. Barr; and Anna Paulson. Voting against this action were Stephen I. Miran, who preferred to lower the target range by 1/4 percentage point at this meeting; and Beth M. Hammack and Lorie K. Logan, who did not support an easing bias. For media inquiries, call.</p>";
  const s = CB.parseStatement(html);
  assert.deepEqual([s.action, s.change_bp, s.target_low, s.target_high, s.vote], ["held", 0, 3.5, 3.75, "4-3"]);
  assert.equal(s.voting_against, "Stephen I. Miran; Beth M. Hammack; Lorie K. Logan");
  assert.deepEqual(s.dissents.map((d) => d.names), [["Stephen I. Miran"], ["Beth M. Hammack", "Lorie K. Logan"]]);
});

test("index_constituents: the S&P 500 through IVV's N-PORT, weights rescaled to add to 1; the Dow says why it cannot", async () => {
  const { s } = session();
  const r = await F.indexConstituents(s, { index: "S&P 500", limit: 3 });
  assert.deepEqual(r.through, { etf: "IVV", fund: "iShares Core S&P 500 ETF", series_id: "S000004310" });
  assert.deepEqual([r.as_of, r.members, r.stock_weight_of_fund, r.top_10_weight], ["2026-06-30", 503, 0.9983, 0.3642]);
  assert.deepEqual(r.rows.map((x) => [x[0], x[5]]), [["NVIDIA Corp.", 0.075186], ["Apple, Inc.", 0.065934], ["Microsoft Corp.", 0.042989]]);
  const all = await F.indexConstituents(s, { index: "s&p 500", limit: 5000 });
  assert.ok(Math.abs(all.rows.reduce((t, x) => t + x[5], 0) - 1) < 1e-4);
  await assert.rejects(F.indexConstituents(s, { index: "Dow Jones" }), /unit investment trust, which files no N-PORT/);
});

test("off_exchange_volume: Apple's weekly dark pool and OTC volume; venue shares come from the same totals", async () => {
  const { s } = session();
  const r = await Pos.offExchangeVolume(s, { symbol: "AAPL", weeks: 6 });
  assert.equal(r.name, "Apple Inc. Common Stock");
  assert.equal(r.rows.length, 6);
  for (const [w, ats, otc, total] of r.rows) assert.ok(Math.abs(ats + otc - total) < 0.02, w);
  const pools = r.latest_week.dark_pools.rows;
  assert.ok(pools.every((p, i) => i === 0 || pools[i - 1][1] >= p[1]), "largest dark pool first");
  assert.ok(pools.reduce((t, p) => t + p[2], 0) <= 1.0001);
  assert.equal(r.latest_week.week_start, r.rows.at(-1)[0]);
});

test("segment_revenue: Apple's fiscal 2025 revenue by segment (with operating income), product and region, from its 10-K XBRL", async () => {
  const { s } = session();
  const r = await Seg.segmentRevenue(s, { company: "AAPL" });
  assert.deepEqual(r.filing, { form: "10-K", filed: "2025-10-31", period: "2025-09-27", accession: "0000320193-25-000079" });
  assert.deepEqual(r.total_revenue.values, [416161000000, 391035000000, 383285000000]);
  assert.deepEqual(r.segments.rows[0], ["Americas", 178353000000, 167045000000, 162560000000, 72480000000, 67656000000, 60508000000]);
  assert.equal(r.segments.latest_sum_vs_total, 1);
  assert.equal(r.regions.latest_sum_vs_total, 1);
  const products = new Map(r.products_and_services.rows.map((x) => [x[0], x[1]]));
  assert.equal(products.get("iPhone"), 209586000000);
  assert.equal(products.get("Wearables, Home and Accessories"), 35686000000, "the company's own label");
  assert.equal(products.get("iPhone") + products.get("Mac") + products.get("iPad") + products.get("Wearables, Home and Accessories"), products.get("Products"));
  assert.equal(r.products_and_services.latest_sum_vs_total, 1.7377, "Products sits beside its own lines, so the sum shows the overlap");
});

test("segment_revenue: labels from a label linkbase or a schema, in any attribute order, without [Member]", () => {
  const lab = `<link:label xlink:label="msft_ProductivityAndBusinessProcessesMember_lbl" xlink:role="http://www.xbrl.org/2003/role/label">Productivity And Business Processes [Member]</link:label>
    <link:label xlink:role="http://www.xbrl.org/2003/role/terseLabel" xlink:label="msft_ProductivityAndBusinessProcessesMember_lbl">Productivity and Business Processes</link:label>
    <link:label xlink:label="lab_nvda_ComputeAndNetworkingMember" xlink:role="http://www.xbrl.org/2003/role/label">Compute &amp; Networking [Member]</link:label>`;
  const labels = Seg.memberLabels(lab);
  assert.equal(labels.get("ProductivityAndBusinessProcessesMember"), "Productivity and Business Processes");
  assert.equal(labels.get("ComputeAndNetworkingMember"), "Compute & Networking");
});

test("fails_to_deliver: GameStop over two half-month files, and the largest fails by value; files read from zip", async () => {
  const { s } = session();
  const g = await Pos.failsToDeliver(s, { symbol: "GME" });
  assert.deepEqual(g.files, ["2026-09 first half", "2026-08 second half"]);
  assert.equal(g.days_with_fails, 14);
  assert.deepEqual(g.largest, { date: "2026-09-02", shares: 2570429, value: 48349769.49 });
  assert.deepEqual(g.rows[0], ["2026-08-17", 56718, 18.66, 1058357.88]);
  for (const [, shares, price, value] of g.rows) assert.equal(value, Math.round(shares * price * 100) / 100);
  const m = await Pos.failsToDeliver(s, { limit: 5 });
  assert.deepEqual(m.rows.map((x) => x[0]), ["QQQ", "SPY", "IWM", "LQD", "GME"]);
  assert.throws(() => unzipFirst(new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 1, 0, 1, 0, 46, 0, 0, 0, 200, 0, 0, 0, 0, 0])), /central directory not found/);
  assert.throws(() => unzipFirst(new Uint8Array([1, 2, 3])), /not a zip archive/);
});

test("economic_outlook: the OECD's projections, the euro area on its harmonised index, series it does not publish left empty", async () => {
  const { s, calls } = session();
  const r = await G.economicOutlook(s, { countries: ["United States", "euro area", "China", "Japan", "world"] });
  assert.deepEqual(r.outlook, { name: "Economic Outlook 119", dataflow: "DSD_EO@DF_EO 1.5" });
  assert.deepEqual(r.columns, ["area", "name", "measure", "2024", "2025", "2026", "2027"]);
  const row = (area, measure) => r.rows.find((x) => x[0] === area && x[2] === measure);
  assert.deepEqual(row("USA", "GDPV_ANNPCT"), ["USA", "United States", "GDPV_ANNPCT", 2.7932, 2.1063, 1.9501, 1.799]);
  assert.deepEqual(row("EA17", "CPIH_YTYPCT").slice(3), [2.3536, 2.1001, 2.8298, 2.4408], "the euro area reports a harmonised index");
  assert.equal(row("EA17", "CPI_YTYPCT"), undefined);
  assert.deepEqual(row("W", "CPI_YTYPCT").slice(3), [null, null, null, null]);
  assert.match(r.note, /^2026 and 2027 are the OECD's projections/);
  const oecd = calls.filter((c) => new URL(c.url).host === "sdmx.oecd.org");
  assert.equal(oecd.length, 2, "the data, then the edition: one request at a time");
});

test("economic_calendar: the next 30 days' key releases from BLS, BEA and the Fed, in Eastern time, with the Census gap said", async () => {
  const { s } = session();
  const r = await Cal.economicCalendar(s, { key_only: true });
  assert.deepEqual([r.since, r.until, r.timezone], ["2026-10-09", "2026-11-08", "US Eastern"]);
  assert.deepEqual(r.rows.map((x) => [x[0], x[1], x[3]]), [
    ["2026-10-14", "08:30", "Consumer Price Index"], ["2026-10-15", "08:30", "Producer Price Index"], ["2026-10-28", "14:00", "FOMC decision"],
    ["2026-10-29", "08:30", "GDP (Advance Estimate), 3rd Quarter 2026"], ["2026-10-29", "08:30", "Personal Income and Outlays, September 2026"],
    ["2026-10-30", "08:30", "Employment Cost Index"], ["2026-11-03", "10:00", "Job Openings and Labor Turnover Survey"],
    ["2026-11-04", "08:30", "U.S. International Trade in Goods and Services, September 2026"], ["2026-11-06", "08:30", "Employment Situation"],
  ]);
  assert.match(r.census_note, /lists releases from 2027-01-04/);
  assert.equal(r.unavailable, undefined);
});

test("economic_calendar: iCalendar lines are unfolded and unescaped, and UTC times become Eastern", () => {
  const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE-TIME:20250107T133000Z\r\nSUMMARY:Gross Domestic Product\\, 4th Quarter and Year 2024 (Advance Estima\r\n te)\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:20250110T083000\r\nSUMMARY:Employment Situation\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const ev = Cal.parseIcs(ics);
  assert.deepEqual(ev.map((e) => e.summary), ["Gross Domestic Product, 4th Quarter and Year 2024 (Advance Estimate)", "Employment Situation"]);
  assert.deepEqual(Cal.easternTime(ev[0].start), { date: "2025-01-07", time: "08:30" }, "13:30 UTC in January is 08:30 Eastern");
  assert.deepEqual(Cal.easternTime(ev[1].start), { date: "2025-01-10", time: "08:30" });
});

test("investment_advisers: firms by name from the SEC's Form ADV database, the best match in full", async () => {
  const { s } = session();
  const r = await Adv.investmentAdvisers(s, { query: "Bridgewater Associates", limit: 4 });
  assert.deepEqual(r.rows[0], [105129, "BRIDGEWATER ASSOCIATES, LP", "801-35875", "ACTIVE", false, "WESTPORT, CT, United States", 1]);
  const f = r.firm;
  assert.deepEqual([f.crd, f.name, f.sec_file_number, f.latest_adv_filed], [105129, "BRIDGEWATER ASSOCIATES, LP", "801-35875", "08/18/2026"]);
  assert.deepEqual(f.registered_with, ["SEC"]);
  assert.deepEqual(f.sec_registration, [{ jurisdiction: "SEC", status: "Approved", effective: "1/12/1990" }]);
  assert.equal(f.form_adv_pdf, "https://reports.adviserinfo.sec.gov/reports/ADV/105129/PDF/105129.pdf");
  assert.match(f.brochures[0].url, /BRCHR_VRSN_ID=\d+$/);
  assert.ok(!f.other_names.includes(f.name));
});

test("options: OSI symbols and index names read the way Cboe writes them", () => {
  assert.deepEqual(Opt.parseOsi("AAPL261012C00245000"), { root: "AAPL", expiry: "2026-10-12", type: "call", strike: 245 });
  assert.deepEqual(Opt.parseOsi("SPXW261016P05800000"), { root: "SPXW", expiry: "2026-10-16", type: "put", strike: 5800 });
  assert.equal(Opt.parseOsi("not an option"), null);
  assert.deepEqual(Opt.cboeSymbol("S&P 500"), { file: "_SPX", symbol: "SPX", index: true });
  assert.deepEqual(Opt.cboeSymbol("spy"), { file: "SPY", symbol: "SPY", index: false });
  assert.throws(() => Opt.cboeSymbol("EUR/USD"), /not a ticker or an index/);
});

test("options_chain: Apple's nearest expiration near the money, with put/call ratios, max pain and the expected move", async () => {
  const { s } = session();
  const r = await Opt.optionsChain(s, { symbol: "AAPL", window: 0.03 });
  assert.deepEqual(r.underlying, { symbol: "AAPL", price: 336.08, change_pct: -0.011229, iv30: 0.2637, as_of: "2026-10-11 01:42:41" });
  assert.equal(r.expiration, "2026-10-12");
  assert.ok(r.rows.every((x) => Math.abs(x[0] / 336.08 - 1) <= 0.03), "strikes within 3 percent");
  for (const [, , bid, ask, mid] of r.rows) if (bid > 0 && ask > 0) assert.equal(mid, Math.round(((bid + ask) / 2) * 1e4) / 1e4);
  assert.deepEqual(r.rows[0], [327.5, "call", 8.65, 10.7, 9.675, 9.09, 0.296, 0.9494, 0.0187, -0.0774, 0.0336, 245, 83]);
  assert.equal(r.summary.max_pain, 337.5);
  assert.equal(r.summary.atm_strike, 335);
  assert.deepEqual(r.summary.expected_move, { dollars: 3.985, fraction_of_price: 0.0119, from: "at-the-money straddle mid" });
  assert.equal(r.expirations.rows.length, 6);
  const off = { s: createSession({ fetchImpl: replayFetch().fetchImpl, env: { CANLI_KEYLESS_OPTIONS: "0" }, now: () => NOW, sleep: async () => {} }) };
  await assert.rejects(Opt.optionsChain(off.s, { symbol: "AAPL" }), /CANLI_KEYLESS_OPTIONS=0/);
});

test("volatility_surface: S&P 500 term structure and skew; the risk reversal is the put's IV minus the call's", async () => {
  const { s } = session();
  const r = await Opt.volatilitySurface(s, { symbol: "SPX", expirations: 6 });
  assert.equal(r.underlying.symbol, "SPX");
  assert.equal(r.term_structure.rows.length, 6);
  for (const [e, , atm, p25, c25, rr, fly] of r.term_structure.rows) {
    assert.equal(rr, Math.round((p25 - c25) * 1e4) / 1e4, e);
    assert.ok(Math.abs(fly - ((p25 + c25) / 2 - atm)) < 2e-4, e);
  }
  assert.deepEqual(r.smile.columns, ["expiration", "iv_at_0.8", "iv_at_0.9", "iv_at_0.95", "iv_at_1", "iv_at_1.05", "iv_at_1.1", "iv_at_1.2"]);
  const first = r.smile.rows[0];
  assert.ok(first[1] > first[4] && first[7] > first[4], "the smile rises away from the money");
});

test("futures_curve: the VIX futures curve from Cboe's settlements, against the VIX index", async () => {
  const { s } = session();
  const r = await Opt.futuresCurve(s, {});
  assert.equal(r.product, "VX");
  assert.equal(r.spot_index, 14.84);
  assert.deepEqual(r.rows[0], ["VX/V6", "2026-10-21", 17.1186]);
  assert.ok(r.rows.every((x, i) => i === 0 || r.rows[i - 1][1] < x[1]), "monthly contracts by expiration");
  assert.equal(r.shape.state, "contango");
  assert.equal(r.shape.front_to_second, Math.round((r.rows[1][2] - r.rows[0][2]) * 1e4) / 1e4);
  await assert.rejects(Opt.futuresCurve(s, { product: "crude oil" }), /trade on CME/);
});
