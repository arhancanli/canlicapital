import assert from "node:assert/strict";
import { test } from "node:test";

import { chain, compactDates, compare, countryList, findCountry, findMeasure, jsonStat, moves, onAYear, period, sdmxSeries, worldSeries } from "../src/official.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

// The calls these tests make are captured in fixtures by scripts/capture-world-fixtures.mjs (test/world-calls.json).
const run = async (args) => {
  const { fetchImpl, calls } = replayFetch();
  const r = await worldSeries(createSession({ fetchImpl, now: () => NOW, env: {}, sleep: async () => {} }), args);
  return { r, calls };
};

test("every publisher's period is written one way", () => {
  const cases = { "2026-M08": "2026-08", "2026M09": "2026-09", "2026K3": "2026-Q3", "2026-Q1": "2026-Q1", "01/08/2026": "2026-08-01", "04-Nov-2026": "2026-11-04", "2026 SEP": "2026-09", "2026 Q2": "2026-Q2", "20261029": "2026-10-29", "202609": "2026-09", "2026-11-04T00:00:00": "2026-11-04", "2025": "2025" };
  for (const [raw, want] of Object.entries(cases)) assert.equal(period(raw), want, raw);
  assert.deepEqual(compactDates([["2026-01-01", 1], ["2026-04-01", 2]]), [["2026-Q1", 1], ["2026-Q2", 2]]);
  assert.deepEqual(compactDates([["2026-08-01", 1], ["2026-09-01", 2]]), [["2026-08", 1], ["2026-09", 2]]);
  assert.deepEqual(compactDates([["2025-01-01", 1], ["2026-01-01", 2]]), [["2025", 1], ["2026", 2]]);
  assert.deepEqual(compactDates([["2026-11-03", 1], ["2026-11-04", 2]]), [["2026-11-03", 1], ["2026-11-04", 2]]);
  assert.deepEqual(onAYear([["2025-Q3", 100], ["2026-Q2", 103], ["2026-Q3", 102]]), [["2026-Q3", 2]]);
});

test("measures and countries by the words people use; groups open into their members", () => {
  const words = { inflation: "inflation", cpi: "inflation", "core cpi": "core_inflation", "underlying inflation": "core_inflation", "jobless rate": "unemployment", "10-year bond yield": "ten_year_yield", "interest rate": "policy_rate", selic: "policy_rate", "bank rate": "policy_rate", "real gdp": "gdp_growth", fx: "exchange_rate", "house prices": "house_prices", happiness: null };
  for (const [q, want] of Object.entries(words)) assert.equal(findMeasure(q), want, q);
  assert.equal(findCountry("britain").code, "GB");
  assert.equal(findCountry("KOR").code, "KR");
  assert.equal(findCountry("Türkiye").code, "TR");
  assert.equal(countryList(["G7"]).countries.length, 7);
  assert.deepEqual(countryList(["UK", "united kingdom", "Atlantis"]).countries.map((c) => c.code), ["GB"]);
  assert.deepEqual(countryList(["Atlantis"]).unknown, ["Atlantis"]);
  assert.equal(countryList(["G20"]).countries.length, 20);
});

test("each country's own publisher first, then the EU's, the OECD's, then the IMF's or BIS's", () => {
  const c = (q) => findCountry(q);
  assert.deepEqual(chain("inflation", c("Brazil")).map((l) => l.s), ["bcb:13522", "imf:CPI/BRA.CPI._T.YOY_PCH_PA_PT.M"]);
  assert.deepEqual(chain("inflation", c("euro area")).map((l) => l.s), ["eurostat:prc_hicp_minr?geo=EA&unit=RCH_A&coicop18=TOTAL"]);
  // A euro member's policy rate and currency are the euro area's, said so.
  const de = chain("policy_rate", c("Germany"));
  assert.deepEqual(de.map((l) => l.s), ["ecb:FM/D.U2.EUR.4F.KR.DFR.LEV", "bis:WS_CBPOL/D.XM"]);
  assert.match(de[0].by, /Germany uses the euro/);
  assert.deepEqual(chain("gdp_growth", c("Japan")).map((l) => l.s[0] === "i" ? l.s : [l.s].flat()[0].split("/")[0]), ["oecd:OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_G20,1.1", "imf:QNEA"]);
  // The IMF's quarterly volume series for China follows nominal GDP, so China is left to the OECD.
  assert.equal(chain("gdp_growth", c("China")).length, 1);
  assert.deepEqual(chain("core_inflation", c("Japan")), []);
});

test("SDMX and JSON-stat answers become one series, or say which part of the key to give", () => {
  const bbk = "﻿DATAFLOW;BBK_STD_FREQ;TIME_PERIOD;OBS_VALUE;BBK_DIFF\nBBK:BBSIS(1.0);D;2026-11-03;3.3;\nBBK:BBSIS(1.0);D;2026-11-04;3.35;\n";
  assert.deepEqual(sdmxSeries(bbk).rows, [["2026-11-03", 3.3], ["2026-11-04", 3.35]]);
  const two = "FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE\nD,KR,2026-10-08,3\nD,JP,2026-10-08,1.25\n";
  assert.throws(() => sdmxSeries(two), /matched 2 series/);
  assert.deepEqual([...sdmxSeries(two, { byArea: true }).keys()], ["KR", "JP"]);
  const js = { id: ["geo", "time"], size: [2, 2], dimension: { geo: { category: { index: { DE: 0, FR: 1 } } }, time: { category: { index: { "2026-08": 0, "2026-09": 1 } } } }, value: { 0: 4.1, 1: 4.1, 3: 7.7 } };
  assert.deepEqual(jsonStat(js).map((s) => [s.key.geo, s.rows]), [["DE", [["2026-08", 4.1], ["2026-09", 4.1]]], ["FR", [["2026-09", 7.7]]]]);
});

test("a policy rate's moves; quotes turned over and daily rates averaged before two publishers are compared", () => {
  assert.deepEqual(moves([["2026-01-01", 4], ["2026-02-01", 4], ["2026-03-01", 3.75], ["2026-04-01", 3.75]]), [{ date: "2026-03-01", from: 4, to: 3.75 }]);
  const a = { rows: [["2026-09-01", 0.7], ["2026-09-30", 0.72]], spec: { inverse: true, quote: "US dollars per Australian dollar" } };
  const b = { code: "imf:ER/AUS.XDC_USD.PA_RT.M", rows: [["2026-09", 1 / 0.71]], spec: { by: "IMF" } };
  const r = compare(a, b, { tolerance: 0.005, relative: true, monthly: "average" });
  assert.equal(r.period, "2026-09");
  assert.equal(r.difference, 0);
  assert.equal(r.agree, true);
  assert.match(r.compared_as, /turned over/);
  assert.match(r.aligned, /average/);
});

test("US inflation from the BLS's own index, checked against the IMF's: the same to 0.0001 points", async () => {
  const { r, calls } = await run({ country: "United States", measure: "inflation", check: true });
  assert.equal(calls.length, 2);
  assert.equal(r.series.id, "fred:CPIAUCNS");
  assert.match(r.series.computed, /change on a year/);
  assert.deepEqual(r.latest, { period: "2026-09", value: 3.7377 });
  assert.deepEqual(r.year_ago, { period: "2025-09", value: 3.0127 });
  assert.equal(r.rows.length, 13);
  assert.deepEqual({ period: r.check.period, other: r.check.other_value, agree: r.check.agree }, { period: "2026-09", other: 3.737685, agree: true });
});

test("Canada's jobless rate from Statistics Canada; the IMF's lags seven months and is not seasonally adjusted", async () => {
  const { r } = await run({ country: "Canada", measure: "jobless rate", check: true });
  assert.equal(r.measure, "unemployment");
  assert.equal(r.series.publisher, "Statistics Canada");
  assert.deepEqual(r.latest, { period: "2026-09", value: 6.5 });
  assert.equal(r.check.other.latest.period, "2026-02");
  assert.equal(r.check.agree, false);
  assert.equal(r.check.difference, 0.158);
  assert.match(r.check.reading, /seasonally adjusted/);
});

test("exchange rates: the RBA's dollars per Australian dollar against the IMF's Australian dollars per dollar; the Bank of Japan's daily rate against a monthly average", async () => {
  const au = (await run({ country: "Australia", measure: "exchange rate", check: true })).r;
  assert.equal(au.series.quote, "US dollars per Australian dollar");
  assert.deepEqual(au.latest, { period: "2026-11-04", value: 0.6972 });
  assert.deepEqual(au.year_ago, { period: "2025-11-04", value: 0.6532 });
  assert.equal(au.check.difference, 0);
  assert.match(au.check.compared_as, /turned over/);
  const jp = (await run({ country: "Japan", measure: "exchange rate", check: true })).r;
  assert.equal(jp.series.publisher, "Bank of Japan");
  assert.deepEqual(jp.latest, { period: "2026-10-30", value: 157.82 });
  assert.equal(jp.check.value, 156.355263);
  assert.equal(jp.check.difference_pct, 0.051);
  assert.equal(jp.check.agree, true);
});

test("Norway's change on a year from Statistics Norway's own index matches the IMF's", async () => {
  const { r, calls } = await run({ country: "Norway", measure: "inflation", check: true });
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  assert.deepEqual(r.latest, { period: "2026-09", value: 3.3797 });
  assert.equal(r.check.difference, 0.000022);
});

test("policy rates with their moves: Bank Rate from the Bank of England, the Selic from Brazil's central bank", async () => {
  const uk = (await run({ country: "UK", measure: "bank rate" })).r;
  assert.equal(uk.series.id, "boe:IUDBEDR");
  assert.deepEqual(uk.latest, { period: "2026-10-09", value: 3.75 });
  assert.deepEqual(uk.year_ago, { period: "2025-10-09", value: 4 });
  assert.deepEqual(uk.changes, [{ date: "2025-08-07", from: 4.25, to: 4 }, { date: "2025-12-18", from: 4, to: 3.75 }]);
  const br = (await run({ country: "Brazil", measure: "selic", check: true })).r;
  assert.equal(br.changes.length, 5);
  assert.deepEqual(br.changes.at(-1), { date: "2026-09-17", from: 14, to: 13.75 });
  assert.equal(br.check.agree, true);
});

test("core inflation for the euro area from Eurostat's new ECOICOP 2 index", async () => {
  const { r } = await run({ country: "euro area", measure: "core inflation" });
  assert.equal(r.series.id, "eurostat:prc_hicp_minr?geo=EA&unit=RCH_A&coicop18=TOT_X_NRG_FOOD");
  assert.deepEqual(r.latest, { period: "2026-10", value: 2.5 });
});

test("the G20's inflation, each from its own publisher, in nine requests rather than twenty", async () => {
  const { r, calls } = await run({ countries: ["G20"], measure: "inflation" });
  assert.equal(calls.length, 9);
  assert.equal(r.rows.length, 20);
  const by = Object.fromEntries(r.rows.map((x) => [x[0], x]));
  assert.deepEqual(by.China.slice(1, 3), ["2026-09", 0.899931]);
  assert.equal(by.China[5], "imf:CPI/CHN.CPI._T.YOY_PCH_PA_PT.M");
  assert.equal(by["United Kingdom"][4], "Office for National Statistics");
  assert.equal(by.Brazil[5], "bcb:13522");
  assert.deepEqual(by["Euro area"].slice(1, 3), ["2026-10", 4]);
  assert.equal(r.not_found, undefined);
});

test("every euro member's 10-year yield in two requests; the G20's growth with Russia's last figure marked stale", async () => {
  const ten = await run({ countries: ["euro area members"], measure: "10 year bond yield" });
  assert.equal(ten.calls.length, 2);
  assert.equal(ten.r.rows.length, 21);
  assert.deepEqual(ten.r.rows.find((x) => x[0] === "Greece").slice(1, 3), ["2026-09", 4.22]);
  assert.equal(ten.r.rows.find((x) => x[0] === "Germany")[4], "Deutsche Bundesbank");
  const gdp = await run({ countries: ["G20"], measure: "gdp growth" });
  assert.equal(gdp.calls.length, 8);
  assert.deepEqual(gdp.r.rows.find((x) => x[0] === "China").slice(1, 3), ["2026-Q3", 4.5]);
  assert.deepEqual(gdp.r.stale, ["Russia: latest 2021-Q3"]);
});

test("euro members' policy rate falls back to the BIS's euro area series when the ECB does not answer, read once for all three", async () => {
  const { r, calls } = await run({ countries: ["G7"], measure: "policy rate" });
  assert.equal(calls.filter((c) => c.url.includes("WS_CBPOL/D.XM")).length, 1);
  const fr = r.rows.find((x) => x[0] === "France");
  assert.deepEqual(fr.slice(1, 3), ["2026-10-27", 2.5]);
  assert.match(fr[4], /France uses the euro/);
  assert.deepEqual(r.rows.find((x) => x[0] === "United States").slice(1, 3), ["2026-11-04", 4]);
});

test("any series by its publisher's own code", async () => {
  const boj = (await run({ series: "boj:FM01/STRDCLUCON", periods: 3 })).r;
  assert.equal(boj.series.title, "Call Rate, Uncollateralized Overnight, Average (Daily)");
  assert.deepEqual(boj.year_ago, { period: "2025-10-30", value: 0.476 });
  const sc = (await run({ series: "statcan:2062815", start: "2026-01" })).r;
  assert.deepEqual(sc.rows.map((x) => x[0]), ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.match(sc.series.title, /Unemployment rate/);
  const imf = (await run({ series: "imf:CPI/IND.CPI._T.YOY_PCH_PA_PT.M", periods: 3 })).r;
  assert.deepEqual(imf.latest, { period: "2026-07", value: 4.441219 });
});

test("what cannot be answered says what to give instead", async () => {
  await assert.rejects(run({ series: "nonsense:1" }), /Name the publisher before the code/);
  await assert.rejects(run({ country: "US", measure: "happiness" }), /not a measure read here/);
  await assert.rejects(run({ country: "Atlantis", measure: "inflation" }), /No country matched Atlantis/);
  await assert.rejects(run({ country: "Japan", measure: "core inflation" }), /core inflation is read for the US, Canada, the UK and the EU/);
  await assert.rejects(run({ series: "fred:UNRATE", country: "US" }), /either series/);
});
