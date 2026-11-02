import assert from "node:assert/strict";
import test from "node:test";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { attentionInput, pageAttention, shippingActivity } from "../src/alt.mjs";
import { loadFloats, saveFloats } from "../src/disk-cache.mjs";
import { latestFilings } from "../src/latest.mjs";
import { annualPartOf, buildIndex, filingMemory, fuse, linkToMeasure, mentionTest, paragraphsOf, permutationP, score, spearman, stem, tokens } from "../src/memory.mjs";
import { filingSentiment, INSTALL_HINT, modelsInstalled, sentencesOf } from "../src/models.mjs";
import { episodes, summarize, whatHappenedNext } from "../src/nextmove.mjs";
import { guidanceRecord, reading, summarizeRecord } from "../src/promises.mjs";
import { createSession } from "../src/sources.mjs";
import { latestPrice } from "../src/tools.mjs";

const json = (x) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
const text = (x) => new Response(x, { status: 200 });
const sessionFor = (route, over = {}) => {
  const seen = [];
  const s = createSession({ env: {}, now: () => Date.parse("2026-11-02T12:00:00Z"), sleep: async () => {}, ...over, fetchImpl: async (url, init) => { seen.push(String(url)); const r = await route(String(url), init); if (!r) return new Response("nope", { status: 404 }); return r; } });
  s.seen = seen;
  return s;
};

const LONG = "Our supply chain depends on contract manufacturers in Vietnam and Thailand, and a disruption there could reduce our gross margin materially in any given year.";
const OTHER = "We compete with many companies in every market we serve, and the markets for our products are highly competitive across all of our regions today.";
const html = (...ps) => `<html><body><p>Item 1A. Risk Factors</p>${ps.map((p) => `<p>${p}</p>`).join("")}<table><tr><td>Revenue</td><td>100</td><td>200</td></tr></table></body></html>`;
const K = (year, body) => ({ accession: `0000000001-${String(year).slice(2)}-000001`, year, body });
const REPORTS = [K(2024, html(LONG, LONG, OTHER)), K(2023, html(LONG, OTHER)), K(2022, html(OTHER, OTHER))];
const edgar = (extra = () => null) => (url) => {
  if (/company_tickers/.test(url)) return json({ fields: ["cik", "name", "ticker", "exchange"], data: [[1, "Acme Corp", "ACME", "NYSE"]], 0: { cik_str: 1, ticker: "ACME", title: "Acme Corp" } });
  if (/submissions\/CIK0000000001\.json/.test(url)) return json({ cik: "1", name: "Acme Corp", tickers: ["ACME"], filings: { recent: { accessionNumber: REPORTS.map((r) => r.accession), filingDate: REPORTS.map((r) => `${r.year + 1}-02-15`), reportDate: REPORTS.map((r) => `${r.year}-12-31`), form: REPORTS.map(() => "10-K"), primaryDocument: REPORTS.map((r) => `k${r.year}.htm`) }, files: [] } });
  for (const r of REPORTS) if (url.endsWith(`k${r.year}.htm`)) return text(r.body);
  return extra(url);
};

test("words: stems, stop words and phrases across plurals", () => {
  assert.equal(stem("vulnerabilities"), "vulnerability");
  assert.equal(stem("tariffs"), "tariff");
  assert.equal(stem("business"), "business");
  assert.deepEqual(tokens("the supply chains of our suppliers"), ["supply", "chain", "supplier"]);
});

test("paragraphs: prose kept with its item, table rows and short lines left out", () => {
  const ps = paragraphsOf(`Item 1A. Risk Factors\n${LONG}\nToo short.\nRevenue | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1100 | 1200 | 1300 | 1400\nItem 7. Management's Discussion\n${OTHER}`);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].section, "1A");
  assert.equal(ps[1].section, "7");
});

test("a pre-2001 filing: one text file, hard-wrapped, with its annual report in an exhibit", () => {
  const wrapped = Array.from({ length: 60 }, (_, i) => `This line of the old filing talks about matters number ${i} at length`).join("\n");
  const sub = `<SEC-DOCUMENT>\n<DOCUMENT>\n<TYPE>10-K\n<TEXT>\n${wrapped}\n\nSecond paragraph of this filing talks about the company and its supply chain and its many suppliers and the rest of it at some length here.\n</TEXT>\n</DOCUMENT>\n<DOCUMENT>\n<TYPE>EX-27\n<TEXT>\n<NAME>FINANCIAL DATA\n</TEXT>\n</DOCUMENT>\n</SEC-DOCUMENT>`;
  const part = annualPartOf(sub);
  assert.ok(!part.includes("FINANCIAL DATA"), "only the annual report's documents");
  const ps = paragraphsOf(part);
  assert.equal(ps.length >= 2, true);
  assert.match(ps.at(-1).text, /Second paragraph/);
});

test("ranking: BM25 prefers the paragraph about the subject, and supplied words lift the company's own wording", () => {
  const paragraphs = [{ text: LONG }, { text: OTHER }, { text: "Southeast Asia is a region of the world with many countries in it, and we have some customers there as well as elsewhere." }];
  const index = buildIndex(paragraphs);
  const plain = score(index, "supply chain problems in Southeast Asia");
  assert.ok(plain[1] === 0, "nothing in common");
  const helped = score(index, "supply chain problems in Southeast Asia", ["Vietnam", "Thailand", "contract manufacturer"]);
  assert.ok(helped[0] > plain[0]);
  assert.ok(helped[0] > helped[2]);
});

test("what counts as a mention is spelled out: groups, or most of the rarer words", () => {
  const index = buildIndex([{ text: LONG }, { text: OTHER }]);
  const norm = (t) => ` ${(t.toLowerCase().match(/[a-z][a-z0-9&'-]*|\d[\d.,]*%?/g) ?? []).map(stem).join(" ")} `;
  const groups = mentionTest(index, "x", [["supply chain"], ["Vietnam", "Malaysia"]]);
  assert.equal(groups(norm(LONG)), true);
  assert.equal(groups(norm(OTHER)), false);
  assert.equal(groups(norm("Our supply chains run through Malaysia, where we have long had many of our main suppliers and factories today.")), true, "a plural still matches");
  const phrase = mentionTest(index, "\"gross margin\"");
  assert.equal(phrase(norm(LONG)), true);
  assert.equal(phrase(norm(OTHER)), false);
});

test("two rankings fuse by position, so a passage high in either rises", () => {
  const out = fuse(Float64Array.from([3, 2, 0]), Float64Array.from([0.1, 0.2, 0.9]));
  assert.ok(out[1] > out[2], "second in words and second in meaning beats first in meaning alone");
  assert.ok(out[2] > 0);
});

test("the link to a measure: Spearman, a seeded test against chance, and no figure from too few points", () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(permutationP([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]), permutationP([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]), "the same every time");
  assert.ok(permutationP([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]) < 0.01);
  const few = linkToMeasure([{ period: "2020-12-31", per_10000: 1 }, { period: "2021-12-31", per_10000: 2 }], new Map([["2020-12-31", 0.5], ["2021-12-31", 0.4]]), "gross_margin");
  assert.equal(few.rows[0][2], null);
  assert.equal(few.dips.rows.length, 1, "a fall of a point or more is a dip");
  assert.deepEqual(few.dips.rows[0].slice(0, 3), ["2021-12-31", 0.5, 0.4]);
});

test("filing_memory end to end: yearly counts, passages with links, and nothing dated after filed_before", async () => {
  const s = sessionFor(edgar());
  const r = await filingMemory(s, { company: "ACME", query: "supply chain problems", also: ["Vietnam"], all_of: [["supply chain"], ["Vietnam", "Thailand"]] });
  assert.equal(r.company.name, "Acme Corp");
  assert.equal(r.reports_read, 3);
  assert.deepEqual(r.rows.map((x) => x[4]), [2, 1, 0], "mentions by year, newest first");
  assert.equal(r.passages.rows[0][3], true);
  assert.match(r.passages.rows[0][5], /contract manufacturers in Vietnam/);
  assert.match(r.passages.rows[0][6], /k2024\.htm$/);
  assert.equal(r.semantic, undefined);
  const before = await filingMemory(s, { company: "ACME", query: "supply chain", filed_before: "2024-12-31" });
  assert.deepEqual(before.rows.map((x) => x[0]), ["2024-02-15", "2023-02-15"]);
  const second = s.seen.length;
  await filingMemory(s, { company: "ACME", query: "competitive" });
  assert.equal(s.seen.length, second, "already read reports are not fetched again");
});

test("filing_memory: semantic ranks by meaning when a model is there, and says so when none is", async () => {
  const s = sessionFor(edgar());
  const off = await filingMemory(s, { company: "ACME", query: "supply chain", semantic: true });
  assert.equal(off.semantic.status, "not installed");
  assert.match(off.semantic.how, /canli-mcp models install/);
  // A stand-in model: each text's vector points along whether it mentions competition.
  s.embedder = async (texts) => { const out = new Float32Array(texts.length * 384); texts.forEach((t, i) => { out[i * 384] = /compet/i.test(t) || /rivals/i.test(t) ? 1 : 0; out[i * 384 + 1] = /compet/i.test(t) || /rivals/i.test(t) ? 0 : 1; }); return { data: out }; };
  const on = await filingMemory(s, { company: "ACME", query: "rivals", semantic: true, limit: 3 });
  assert.equal(on.semantic.status, "used");
  assert.match(on.passages.rows[0][5], /compete with many companies/, "no word in common, found by meaning");
  assert.equal(on.rows.every((x) => x[4] === 0), true, "the counts stay by words");
});

test("filing_memory: a margin series from the company's own facts", async () => {
  const fact = (end, val) => ({ start: `${end.slice(0, 4)}-01-01`, end, val, form: "10-K", filed: `${Number(end.slice(0, 4)) + 1}-02-15`, fy: Number(end.slice(0, 4)), fp: "FY" });
  const s = sessionFor(edgar((url) => (/companyfacts/.test(url) ? json({ entityName: "Acme", facts: { "us-gaap": { Assets: { units: { USD: [{ end: "2024-12-31", val: 1, form: "10-K", filed: "2025-02-15" }] } }, Revenues: { units: { USD: [fact("2022-12-31", 100), fact("2023-12-31", 100), fact("2024-12-31", 100)] } }, GrossProfit: { units: { USD: [fact("2022-12-31", 50), fact("2023-12-31", 48), fact("2024-12-31", 44)] } } } } }) : null)));
  const r = await filingMemory(s, { company: "ACME", query: "supply chain", all_of: [["supply chain"]], correlate_with: "gross_margin" });
  assert.deepEqual(r.link.series.rows.map((x) => x[1]), [0.5, 0.48, 0.44]);
  assert.equal(r.link.dips.rows.length, 2);
  assert.match(r.limits.join(" "), /handful of points/);
});

test("sentiment: sentences, and a plain answer when the model is not installed", async () => {
  assert.deepEqual(sentencesOf("Net sales rose a lot this year. Short one. Costs were flat for all of the year! Revenue | one | two | three is a table row."), ["Net sales rose a lot this year.", "Costs were flat for all of the year!"]);
  assert.equal(modelsInstalled({ VERCEL: "1" }), false);
  await assert.rejects(filingSentiment(sessionFor(() => null, { env: { CANLI_CACHE_DIR: "/nonexistent" } }), { text: "Net sales rose a lot this year, and margins did too." }), (e) => e.message === INSTALL_HINT);
});

test("sentiment: counts, net tone and the model's licence, from a stand-in model", async () => {
  const s = sessionFor(() => null);
  s.sentimentModel = async (xs) => xs.map((t) => ({ label: /fell|cut/.test(t) ? "negative" : /rose/.test(t) ? "positive" : "neutral", score: 0.9 }));
  const r = await filingSentiment(s, { text: "Revenue fell sharply in all regions this year. The company cut its full year guidance again. Net sales rose in one small region only. The meeting will be held on the fifth of May." });
  assert.deepEqual([r.positive, r.negative, r.neutral, r.net_tone], [1, 2, 1, -0.25]);
  assert.match(r.model_license, /not for commercial use/);
  assert.match(r.limits.join(" "), /tone, not truth/);
});

const CHOKE = (date, name = "Suez Canal", id = "chokepoint1", n = 40) => ({ attributes: { date, portid: id, portname: name, n_total: n, n_tanker: 10, n_container: 15, n_dry_bulk: 5, capacity: 1000 } });
test("shipping: the service's first refusal of a query is tried again, and all chokepoints compare with a year ago in two queries", async () => {
  let refused = 0, queries = 0;
  const s = sessionFor((url) => {
    if (!/Daily_Chokepoints_Data/.test(url)) return null;
    queries += 1;
    const where = decodeURIComponent(url);
    if (where.includes("DATE '2026-10-04'") && refused === 0) { refused += 1; queries -= 1; return json({ error: { code: 400, message: "Cannot perform query. Invalid query parameters." } }); }
    if (where.includes("DATE '2026-10-04'")) return json({ features: [CHOKE("2026-10-25", "Suez Canal", "chokepoint1", 50), CHOKE("2026-10-25", "Malacca Strait", "chokepoint5", 200), CHOKE("2026-10-01", "Malacca Strait", "chokepoint5", 999)] });
    return json({ features: [CHOKE("2025-10-26", "Suez Canal", "chokepoint1", 40), CHOKE("2025-10-26", "Malacca Strait", "chokepoint5", 200)] });
  });
  const r = await shippingActivity(s, {});
  assert.equal(refused, 1);
  assert.equal(queries, 2);
  assert.equal(r.period.to, "2026-10-25");
  assert.equal(r.rows[0][0], "Malacca Strait");
  assert.equal(r.rows[0][1], 200, "older days in the month are not in the seven");
  assert.equal(r.rows.find((x) => x[0] === "Suez Canal")[5], 25, "fifty against forty");
  assert.match(r.limits[0], /turns its signal off/);
});

test("shipping: one chokepoint by week in one query, by part of its name, and a wrong name lists the right ones", async () => {
  let queries = 0;
  const s = sessionFor((url) => {
    queries += 1;
    const where = decodeURIComponent(url);
    if (where.includes("LIKE '%hormuz%'")) return json({ features: [CHOKE("2026-10-25", "Strait of Hormuz", "chokepoint6", 3), CHOKE("2026-10-24", "Strait of Hormuz", "chokepoint6", 4)] });
    if (where.includes("LIKE")) { assert.ok(!where.includes("1=1") && !where.includes("' OR"), where); return json({ features: [] }); }
    if (where.includes("date = DATE")) return json({ features: [CHOKE("2026-10-19"), CHOKE("2026-10-19", "Strait of Hormuz", "chokepoint6", 3)] });
    return null;
  });
  const r = await shippingActivity(s, { chokepoint: "hormuz" });
  assert.equal(queries, 1);
  assert.equal(r.chokepoint, "Strait of Hormuz");
  assert.equal(r.latest_data, "2026-10-25");
  assert.equal(r.rows[0][2], 7);
  await assert.rejects(shippingActivity(s, { chokepoint: "atlantis" }), /Suez Canal, Strait of Hormuz/);
  await assert.rejects(shippingActivity(s, { chokepoint: "' OR 1=1 --" }), /Suez Canal/, "only letters, spaces and hyphens reach the query");
});

test("attention: the article's title comes back, with the last week against normal", async () => {
  const s = sessionFor((url) => {
    if (/search\/title/.test(url)) return json({ pages: [{ key: "Nvidia", title: "Nvidia" }] });
    if (/pageviews/.test(url)) return json({ items: Array.from({ length: 30 }, (_, i) => ({ timestamp: `202610${String(i + 1).padStart(2, "0")}00`, views: i >= 23 ? 2000 : 1000 })) });
    return null;
  });
  const r = await pageAttention(s, attentionInput.parse({ topic: "Nvidia Corp", days: 30 }));
  assert.equal(r.article, "Nvidia");
  assert.equal(r.summary.median_views_a_day, 1000);
  assert.equal(r.summary.last_7_against_median, 2);
});

test("latest price: read from the chart header, with its time, and never older than a few seconds", async () => {
  let price = 100, reads = 0;
  let clock = Date.parse("2026-11-02T15:00:00Z");
  const s = sessionFor((url) => { reads += 1; assert.match(url, /range=1d/); return json({ chart: { result: [{ meta: { regularMarketPrice: price, previousClose: 90, regularMarketTime: 1793000000, currency: "USD" } }] } }); }, { now: () => clock });
  const a = await latestPrice(s, { symbol: "NVDA" });
  assert.deepEqual([a.price, a.change_percent, a.currency], [100, 11.111, "USD"]);
  price = 101; clock += 30000;
  assert.equal((await latestPrice(s, { symbol: "NVDA" })).price, 101, "the ten-minute cache does not hold a price");
  assert.equal(reads, 2);
});

test("the filings feed is read again on each poll, not held for ten minutes", async () => {
  let clock = Date.parse("2026-11-02T15:00:00Z"), reads = 0;
  const feed = (acc) => `<feed><entry><title>8-K - ACME (0000000001) (Filer)</title><link href="https://www.sec.gov/x"/><summary>&lt;b&gt;Filed:&lt;/b&gt; 2026-11-02 &lt;b&gt;AccNo:&lt;/b&gt; ${acc} &lt;b&gt;Size:&lt;/b&gt; 1 KB</summary><updated>2026-11-02T10:00:00-05:00</updated></entry></feed>`;
  const s = sessionFor((url) => { if (/getcurrent/.test(url)) { reads += 1; return text(/start=0|start=/.test(url) && !/start=100/.test(url) ? feed("0000000001-26-00000" + reads) : "<feed></feed>"); } return null; }, { now: () => clock });
  await latestFilings(s, { forms: ["8-K"] });
  const first = reads;
  clock += 60000;
  await latestFilings(s, { forms: ["8-K"] });
  assert.ok(reads > first, "polled again after a minute");
});

const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));
test("episodes: first day of each, counted once within the gap", () => {
  const close = [...series(300, () => 100), 89, 88, 87, ...series(100, () => 95), 80];
  const e = episodes(close, { condition: "fell", percent: 10, days: 21, gap: 63 });
  assert.deepEqual(e, [300, 403]);
  assert.deepEqual(episodes([...series(300, (i) => 100 + i), 500, 300], { condition: "below_high", percent: 30, gap: 1 }), [301]);
  assert.deepEqual(episodes([...series(260, () => 100), 101, 100, 102], { condition: "new_high", gap: 1 }), [260, 262]);
});

test("the summary sets each horizon beside all days", () => {
  const close = series(400, (i) => 100 + i);
  const [row] = summarize(close, [10, 20], [10]);
  assert.equal(row[1], 2);
  assert.equal(row[3], 100);
  assert.ok(row[6] > 0);
  assert.equal(summarize(close, [395], [10])[0][1], 0, "too near the end to look ahead");
});

test("what_happened_next: cases, comparison, and it needs a percent", async () => {
  const dates = series(800, (i) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
  const close = series(800, (i) => (i === 400 ? 80 : 100 + (i % 7)));
  const s = sessionFor((url) => (/finance\/chart/.test(url) ? json({ chart: { result: [{ meta: { currency: "USD" }, timestamp: dates.map((d) => Date.parse(d) / 1000), indicators: { quote: [{ open: close, high: close, low: close, close, volume: close }], adjclose: [{ adjclose: close }] } }] } }) : null));
  await assert.rejects(whatHappenedNext(s, { condition: "fell" }), /needs percent/);
  const r = await whatHappenedNext(s, { symbol: "ACME", condition: "fell", percent: 15, days: 21 });
  assert.equal(r.episodes_found, 1);
  assert.equal(r.episodes.rows[0][0], dates[400]);
  assert.equal(r.summary.rows.length, 4);
  assert.match(r.limits[0], /not a forecast and not advice/);
});

test("vectors go to their own folder and come back, and a wrong length or name is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "vectors-")), env = { CANLI_CACHE_DIR: dir };
  const v = Float32Array.from([0.5, -0.25, 1, 0]);
  assert.equal(loadFloats(env, "v1-a", 4), null, "nothing yet");
  saveFloats(env, "v1-a", v);
  assert.deepEqual([...loadFloats(env, "v1-a", 4)], [...v]);
  assert.equal(loadFloats(env, "v1-a", 5), null, "a change in how a report is split reads as missing");
  assert.throws(() => saveFloats(env, "../../evil", v), /Not a vector file name/);
  rmSync(dir, { recursive: true, force: true });
});

test("guidance record: it walks back through the releases and tallies each measure against its own range", async () => {
  const COLS = ["measure", "basis", "period_guided", "unit", "guided_low", "guided_high", "actual", "position"];
  const pages = [
    { filed: "2026-08-26", q: 2, position: "above the range", actual: 96 },
    { filed: "2026-05-20", q: 1, position: "above the range", actual: 80 },
    { filed: "2026-02-20", q: 4, position: "within the range", actual: 65 },
    { filed: "2025-11-20", q: 3, position: "below the range", actual: 50 },
  ];
  const asked = [];
  const release = async (_s, a) => {
    asked.push(a.filed_before ?? null);
    const p = pages[asked.length - 1];
    return { company: { name: "Acme" }, release: { filed: p.filed, url: `https://www.sec.gov/${p.q}` }, previous_guidance_vs_results: { quarter: { quarter: p.q, year: 2027 }, columns: COLS, rows: [["revenue", null, "next", "USD billion", 60, 70, p.actual, p.position], ["gross_margin", "GAAP", "next", "%", null, null, 70, "no range"]] } };
  };
  const r = await guidanceRecord({}, { company: "ACME", quarters: 4 }, { release });
  assert.deepEqual(asked, [null, "2026-08-25", "2026-05-19", "2026-02-19"], "each step goes to the release before");
  assert.deepEqual(r.record.rows[0].slice(0, 7), ["revenue", null, "USD billion", 4, 2, 1, 1]);
  assert.equal(r.record.rows[0][7], "Q3 2027");
  assert.match(r.reading, /Over 4 guided quarters, Acme's revenue came in above its own range 2 times, within it 1 and below it 1/);
  assert.equal(r.guided_lines_matched, 4, "a line with no range does not count");
  assert.equal(r.rows[0][5], 60);
});

test("guidance record: a release with no guidance shows nothing, and always beating is called what it may be", () => {
  assert.match(reading("Acme", null), /Too few/);
  const beats = summarizeRecord(Array.from({ length: 8 }, (_, i) => ({ quarter: `Q${i}`, measure: "revenue", unit: "USD", position: "above the range" })));
  assert.match(reading("Acme", beats[0]), /may simply set it low/);
  const misses = summarizeRecord(Array.from({ length: 4 }, (_, i) => ({ quarter: `Q${i}`, measure: "eps", unit: "USD", position: i < 2 ? "below the range" : "within the range" })));
  assert.match(reading("Acme", misses[0]), /fell short 2 times: Q0, Q1/);
});

test("a filing whose listed document is gone is read from the whole submission", async () => {
  const body = `<DOCUMENT>\n<TYPE>10-K\n<TEXT>\n${LONG}\n\n${OTHER}\n</TEXT>\n</DOCUMENT>`;
  const s = sessionFor((url) => {
    if (/company_tickers/.test(url)) return json({ 0: { cik_str: 1, ticker: "ACME", title: "Acme Corp" } });
    if (/submissions\/CIK0000000001\.json/.test(url)) return json({ cik: "1", name: "Acme Corp", tickers: ["ACME"], filings: { recent: { accessionNumber: ["0000000001-01-000001"], filingDate: ["2001-03-07"], reportDate: ["2000-12-31"], form: ["10-K"], primaryDocument: ["0001.txt"] }, files: [] } });
    if (url.endsWith("/0000000001-01-000001.txt")) return text(body);
    return null;
  });
  const r = await filingMemory(s, { company: "ACME", query: "supply chain" });
  assert.equal(r.not_read, undefined);
  assert.equal(r.rows[0][4], 1);
});

test("a filing built to slow the tag stripper does not, and leaves no bracket", () => {
  const nasty = `<DOCUMENT>\n<TYPE>10-K\n<TEXT>\n${"<a".repeat(200000)}${">".repeat(200000)} plain words\n</TEXT>\n</DOCUMENT>`;
  const began = Date.now();
  const out = annualPartOf(nasty);
  assert.ok(Date.now() - began < 5000);
  assert.ok(!/[<>]/.test(out));
  assert.match(out, /plain words/);
});
