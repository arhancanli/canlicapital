// The public-record tools, world yields and dividends: real responses trimmed and replayed, plus the
// refusals: a mistyped identifier, a name that does not fully match, a redirect to an unknown host.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { bankFinancials } from "../src/banks.mjs";
import { dividendHistory, growthStreak } from "../src/dividends.mjs";
import { cusipValid, identifierKind, isinValid, legalEntity, leiValid, securityIdentifiers } from "../src/identifiers.mjs";
import { consumerComplaints, csvRows, enforcementActions, federalRules, keyWords, namesMatch, parseFeed, productRecalls, sanctionsCheck } from "../src/records.mjs";
import { createSession, getEncodedText } from "../src/sources.mjs";
import { boeCurve, creditCycle, creditRows, ecbCurve, mofCurve, worldYields } from "../src/world.mjs";

const NOW = Date.parse("2026-10-30T08:00:00Z");
const fixture = (name) => readFileSync(new URL(`./fixtures/records/${name}`, import.meta.url), "utf8");
// Answers by the first rule whose pattern the URL matches; anything else is a 404.
const session = (rules) => createSession({
  env: {}, now: () => NOW, sleep: async () => {},
  fetchImpl: async (url) => {
    for (const [re, body] of rules) if (re.test(url)) return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
    return new Response("not found", { status: 404 });
  },
});

test("names match only when every word is there, whole", () => {
  assert.deepEqual(keyWords("Apple Inc."), ["apple"]);
  assert.equal(namesMatch("Newell Brands, Inc. and Michael B. Polk", "Newell Brands"), true);
  assert.equal(namesMatch("Newell Rubbermaid", "Newell Brands"), false);
  assert.equal(namesMatch("Pineapple Express", "Apple Inc."), false, "a word inside a word is not the word");
});

test("enforcement_actions: both feeds, filtered by name, and what the feeds reach", async () => {
  assert.equal(parseFeed(fixture("admin.xml"))[0].respondents.length > 0, true);
  const s = session([[/litigation-releases\/rss/, fixture("lit.xml")], [/administrative-proceedings\/rss/, fixture("admin.xml")]]);
  const all = await enforcementActions(s, {});
  assert.equal(all.matched, 6);
  assert.ok(all.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0])));
  assert.ok(all.rows.some((r) => r[1] === "litigation release") && all.rows.some((r) => r[1] === "administrative proceeding"));
  const one = await enforcementActions(s, { company: "Newell Brands" });
  assert.equal(one.matched, 1);
  assert.equal(one.rows[0][3], "34-106773");
  const none = await enforcementActions(s, { company: "Berkshire Hathaway" });
  assert.deepEqual([none.matched, none.rows], [0, []]);
  assert.ok(none.feeds_reach_back_to && /feeds_reach_back_to/.test(none.limits[0]));
});

const CFPB_AGG = (n) => ({ hits: { total: { value: n } }, _meta: { last_indexed: "2026-10-29T12:00:00-05:00" }, aggregations: {
  company: { company: { buckets: [{ key: "WELLS FARGO & COMPANY", doc_count: n }, { key: "ACME BANK", doc_count: 3 }] } },
  product: { product: { buckets: [{ key: "Mortgage", doc_count: 60 }] } }, issue: { issue: { buckets: [{ key: "Trouble", doc_count: 50 }] } },
  timely: { timely: { buckets: [{ key: "Yes", doc_count: 90 }, { key: "No", doc_count: 10 }] } }, company_response: { company_response: { buckets: [{ key: "Closed with explanation", doc_count: 80 }] } },
} });
test("consumer_complaints: a whole-word company, in-time share, and the limit on comparing counts", async () => {
  const s = session([[/date_received_min/, CFPB_AGG(25)], [/consumerfinance\.gov/, CFPB_AGG(100)]]);
  const r = await consumerComplaints(s, { company: "Wells Fargo" });
  assert.equal(r.company, "WELLS FARGO & COMPANY");
  assert.deepEqual([r.complaints, r.last_12_months, r.answered_in_time_pct], [100, 25, 90]);
  assert.match(r.limits[0], /not adjusted/);
  await assert.rejects(consumerComplaints(s, { company: "Nonexistent Bank" }), /no company with every word/);
});

test("product_recalls: FDA firm recalls with classes, a kind with none is zero, and a vehicle", async () => {
  const s = session([[/drug\/enforcement\.json.*count=/, fixture("fda-count.json")], [/drug\/enforcement\.json/, fixture("fda.json")],
    [/recallsByVehicle/, { results: [{ ReportReceivedDate: "10/02/2023", NHTSACampaignNumber: "23V070000", Component: "POWER TRAIN", Summary: "s", Consequence: "c" }] }]]);
  const r = await productRecalls(s, { company: "Pfizer", vehicle: { make: "ford", model: "f-150", year: 2023 } });
  assert.ok(r.fda.totals.drug >= 1);
  assert.equal(r.fda.totals.device, 0);
  assert.ok(r.fda.classes.drug.some(([c]) => c === "Class I"));
  assert.ok(r.fda.rows.every((x) => x[0] === "drug" && /pfizer/i.test(x[6])));
  assert.deepEqual(r.nhtsa.rows[0].slice(0, 2), ["2023-10-02", "23V070000"]);
  await assert.rejects(productRecalls(s, {}), /Name a company or a vehicle/);
});

const SDN = '36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- \r\n306,"BANCO NACIONAL DE CUBA",-0- ,"CUBA",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"a.k.a. \'BNC\'."\r\n35096,"PUTIN, Vladimir Vladimirovich","individual","RUSSIA-EO14024",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"DOB 07 Oct 1952"\r\n\x1a';
const ALT = '35096,99,"aka","PUTIN, Vladimir",-0- \r\n17018,12,"aka","SBERBANK ROSSII",-0- \r\n\x1a';
test("sanctions_check: whole words in any order, aliases, and an empty answer that is not called clearance", async () => {
  assert.deepEqual(csvRows('1,"a, b",-0- \r\n2,"c ""d""",e\r\n')[0], ["1", "a, b", "-0-"]);
  const s = session([[/SDN\.CSV/, SDN], [/ALT\.CSV/, ALT]]);
  const hit = await sanctionsCheck(s, { name: "Vladimir Putin" });
  assert.deepEqual(hit.rows[0].slice(0, 3), [35096, "PUTIN, Vladimir Vladimirovich", "individual"]);
  assert.equal(hit.rows[0][4], "PUTIN, Vladimir");
  assert.deepEqual((await sanctionsCheck(s, { name: "Banco Nacional de Cuba" })).rows[0].slice(0, 4), [306, "BANCO NACIONAL DE CUBA", "entity", "CUBA"]);
  const none = await sanctionsCheck(s, { name: "Banco de Cuba Invented" });
  assert.equal(none.matched, 0);
  assert.equal(none.list_entries_read, 3);
  assert.match(none.limits.join(" "), /no match is not clearance/);
});

test("the one redirect allowed goes to the named host only; evidence never holds the signed address", async () => {
  const run = (location) => {
    const fetchImpl = async (url) => (url.includes("list.test") ? new Response(null, { status: 302, headers: { location } }) : new Response("ok", { status: 200 }));
    const s = createSession({ env: {}, now: () => NOW, sleep: async () => {}, fetchImpl });
    return getEncodedText(s, "https://list.test/file.csv", { redirectHost: /^store\.test$/ });
  };
  assert.equal(await run("https://store.test/x?signature=1"), "ok");
  await assert.rejects(run("https://evil.test/x"), /unexpected host/);
  await assert.rejects(run("http://store.test/x"), /unexpected host/);
});

test("federal_rules: fields read, unknown agency refused", async () => {
  const s = session([[/federalregister\.gov/, fixture("fedreg.json")]]);
  const r = await federalRules(s, { query: "climate disclosure", agency: "sec" });
  assert.ok(r.matched >= 2);
  assert.ok(r.rows.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && x[7].startsWith("https://www.federalregister.gov/")));
  await assert.rejects(federalRules(s, { agency: "constructor" }), /No agency/);
  await assert.rejects(federalRules(s, {}), /words to find or an agency/);
});

test("bank_financials: failures by year and state go to the FDIC as filters", async () => {
  const urls = [];
  const s = createSession({ env: {}, now: () => NOW, sleep: async () => {}, fetchImpl: async (url) => { urls.push(url); return new Response(fixture("fdic.json"), { status: 200 }); } });
  const r = await bankFinancials(s, { failures_year: 2023, failures_state: "ca" });
  assert.equal(r.matched, 5);
  assert.match(decodeURIComponent(urls[0]).replace(/\+/g, " "), /filters=FAILYR:2023 AND PSTALP:CA/);
  assert.ok(r.failures.rows.some((x) => x[0] === "FIRST REPUBLIC BANK"));
});

test("identifiers: check digits, kinds, and a mistyped one refused before any request", async () => {
  assert.equal(isinValid("US0378331005"), true);
  assert.equal(isinValid("US0378331006"), false);
  assert.equal(cusipValid("037833100"), true);
  assert.equal(cusipValid("037833101"), false);
  assert.equal(leiValid("HWUPKR0MPOU8FGXBT394"), true);
  assert.equal(leiValid("HWUPKR0MPOU8FGXBT395"), false);
  assert.deepEqual(["AAPL", "US0378331005", "037833100", "BBG000B9XRY4", "2046251"].map(identifierKind), ["TICKER", "ID_ISIN", "ID_CUSIP", "ID_BB_GLOBAL", "ID_SEDOL"]);
  let calls = 0;
  const counting = createSession({ env: {}, now: () => NOW, fetchImpl: async () => { calls++; return new Response("[]"); } });
  await assert.rejects(securityIdentifiers(counting, { id: "US0378331006" }), /check digit is wrong/);
  assert.equal(calls, 0);
  const r = await securityIdentifiers(session([[/openfigi/, fixture("figi.json")]]), { id: "us0378331005" });
  assert.deepEqual(r.rows[0].slice(0, 3), ["BBG000B9XRY4", "APPLE INC", "AAPL"]);
  await assert.rejects(securityIdentifiers(session([[/openfigi/, [{ warning: "No identifier found." }]]]), { id: "AAPL" }), /no security for AAPL/);
});

test("legal_entity: the exact name first, its parents and children; a partial name refused", async () => {
  const s = session([[/ultimate-children/, fixture("lei-children.json")], [/lei-records\?/, fixture("lei-search.json")]]);
  const r = await legalEntity(s, { name: "Apple Inc." });
  assert.deepEqual([r.lei, r.legal_name, r.jurisdiction, r.entity_status], ["HWUPKR0MPOU8FGXBT394", "Apple Inc.", "US-CA", "ACTIVE"]);
  assert.equal(r.ultimate_parent, null);
  assert.ok(r.ultimate_children >= 1);
  assert.ok(r.former_names.includes("Apple Computer, Inc."));
  await assert.rejects(legalEntity(s, { name: "Apple Banana Holdings" }), /no entity with every word/);
  await assert.rejects(legalEntity(s, { lei: "HWUPKR0MPOU8FGXBT395" }), /not a valid LEI/);
});

test("world curves parse each source's format, and one that fails leaves the others", async () => {
  const euro = ecbCurve(fixture("ecb.csv"));
  assert.ok(euro.yields["10Y"] > 0 && euro.yields["2Y"] > 0 && /^\d{4}-\d{2}-\d{2}$/.test(euro.as_of));
  const jp = mofCurve("Interest Rate (October 2026),,,(Unit : %)\nDate,1Y,2Y,10Y\n2026/10/1,1.668,1.939,3.092\n2026/10/29,1.677,1.901,2.876\n,,,\n\"  If you cannot download\"\n");
  assert.deepEqual([jp.as_of, jp.yields["10Y"]], ["2026-10-29", 2.876]);
  const uk = boeCurve("DATE,IUDSNZC,IUDMNZC,IUDLNZC\n01 Oct 2026,4.9,5.424,5.7\n28 Oct 2026,4.964,5.322,5.78\n");
  assert.deepEqual([uk.as_of, uk.yields["10Y"], uk.yields["20Y"]], ["2026-10-28", 5.322, 5.78]);
  const s = session([[/data-api\.ecb/, fixture("ecb.csv")], [/bankofcanada/, fixture("boc.json")]]);
  const r = await worldYields(s, { countries: ["euro", "canada", "japan"] });
  assert.deepEqual(r.columns, ["maturity", "euro", "canada"]);
  assert.ok(r.curves.japan.error, "the failed curve says so");
  assert.ok(r.rows.find((x) => x[0] === "10Y").slice(1).every((v) => v > 0));
});

test("credit_cycle: ratio, trend and gap by quarter; a country with none is named", async () => {
  const rows = creditRows(fixture("bis.csv"));
  assert.ok(rows.every((x) => x.credit_to_gdp_pct != null && x.gap_pct_points != null));
  const r = await creditCycle(session([[/WS_CREDIT_GAP/, fixture("bis.csv")]]), { countries: ["us", "CN", "XX"], quarters: 2 });
  assert.deepEqual(r.latest.rows.map((x) => x[0]), ["US", "CN"]);
  assert.deepEqual(r.missing, ["XX"]);
  const row = r.latest.rows[0];
  assert.ok(Math.abs(row[2] - row[3] - row[4]) < 0.01, "the gap is the ratio less its trend");
});

test("dividend_history: Apple's two splits, split-adjusted payments, and a streak that stops at a gap", async () => {
  assert.equal(growthStreak({ 2021: 1, 2022: 2, 2023: 3, 2025: 4 }, 2025), 0, "a missing year ends it");
  assert.equal(growthStreak({ 2021: 1, 2022: 2, 2023: 3 }, 2023), 2);
  const r = await dividendHistory(session([[/finance\.yahoo\.com/, fixture("yahoo-aapl.json")]]), { symbol: "aapl", years: 15 });
  assert.equal(r.symbol, "AAPL");
  assert.deepEqual(r.splits.rows, [["2020-08-31", "4:1"], ["2014-06-09", "7:1"]]);
  assert.equal(r.rows.at(-1)[0] <= r.rows[0][0], true);
  assert.equal(r.by_year.rows.find(([y]) => y === 2012)[1], 0.189286);
  assert.ok(r.trailing_yield_pct > 0);
  assert.match(r.limits[0], /adjusted for later splits/);
});
