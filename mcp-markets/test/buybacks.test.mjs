// buybacks on Apple's, Microsoft's and JPMorgan's real company facts (scripts/capture-buybacks-fixtures.mjs),
// checked against what their 10-Ks say in words, and its rules on facts whose figures are known.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { buybacks, buybacksFromFacts, buybacksInput } from "../src/buybacks.mjs";
import { OUTPUT_SCHEMAS } from "../src/server.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const DIR = new URL("./fixtures/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const gunzip = (file) => gunzipSync(readFileSync(new URL(file, DIR))).toString("utf8");
// Apple's facts in the manifest are cut to other tools' tags (r094), so its buyback tags come from their own file.
const APPLE = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json";
const session = () => createSession({ fetchImpl: replayFetch({ [APPLE]: gunzip("buybacks/CIK0000320193.json.gz") }).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });
// A filing's words, its tags taken out.
const words = (url) => gunzip(MANIFEST[url]).replace(/<[^>]+>/g, " ").replace(/&#160;|&nbsp;/g, " ").replace(/\s+/g, " ");
const row = (r, period) => { const x = r.rows.find((y) => y[0] === period); return x && Object.fromEntries(r.columns.map((c, i) => [c, x[i]])); };

test("Apple: each fiscal year as its 10-K reported it, with the average price, and its 10-K says the same in words", async () => {
  const r = await buybacks(session(), { company: "AAPL", periods: 3 });
  assert.equal(r.company.cik, 320193);
  assert.deepEqual(r.rows.map((x) => x[0]), ["FY2026", "FY2025", "FY2024"]);
  assert.deepEqual(row(r, "FY2025"), {
    period: "FY2025", start: "2024-09-29", end: "2025-09-27", cash_spent: 90711000000, shares_repurchased: 402000000, value_repurchased: 89300000000, average_price: 222.14,
    authorized: null, remaining_authorized: null, shares_outstanding: 14773260000, share_count_change: -343526000, share_count_change_pct: -0.0227, filing: "0000320193-25-000079", from: null,
  });
  const fy26 = row(r, "FY2026");
  assert.deepEqual([fy26.cash_spent, fy26.shares_repurchased, fy26.value_repurchased, fy26.average_price, fy26.shares_outstanding, fy26.share_count_change], [86390000000, 297000000, 85800000000, 288.89, 14532259000, -241001000]);
  // The 2025 10-K: the note's sentence, the cash flow line and the share count table (in thousands).
  const text = words("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm");
  assert.match(text, /During 2025, the Company repurchased 402 million shares of its common stock for \$ 89\.3 billion/);
  assert.match(text, /Repurchases of common stock \( 90,711 \)/);
  assert.match(text, /Common stock outstanding, beginning balances 15,116,786 .* Common stock outstanding, ending balances 14,773,260 /);
  assert.deepEqual(r.tags, { cash_spent: ["PaymentsForRepurchaseOfCommonStock"], shares_repurchased: ["StockRepurchasedAndRetiredDuringPeriodShares"], value_repurchased: ["StockRepurchasedAndRetiredDuringPeriodValue"], authorized: null, remaining_authorized: null, shares_outstanding: ["CommonStockSharesOutstanding"] });
  // Its program's size stopped being tagged in 2022, and what remained of it never was.
  assert.ok(r.not_tagged.includes("authorized: last tagged as of 2021-12-25 (StockRepurchaseProgramAuthorizedAmount1, 10-Q 0000320193-22-000007 filed 2022-01-28)."), r.not_tagged.join("\n"));
  assert.ok(r.not_tagged.some((s) => s.startsWith("remaining_authorized: never tagged")));
  assert.equal(r.year_to_date, undefined, "the 10-K is the newest report");
  assert.deepEqual(r.filings.rows.find((x) => x[0] === "0000320193-25-000079"), ["0000320193-25-000079", "10-K", "2025-10-31", "2025-09-27", "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.htm"]);
  assert.equal(r.source, APPLE);
  assert.ok(OUTPUT_SCHEMAS.buybacks.safeParse(r).success);
  assert.ok(r.limits.includes("Not investment advice."));
});

test("Apple: quarters from year-to-date figures, adding up to the year, and a split between two reports scaled", async () => {
  const r = await buybacks(session(), { company: "AAPL", quarterly: true, periods: 40 });
  assert.equal(r.rows.length, 40);
  const q1 = row(r, "Q1 FY2026"), q2 = row(r, "Q2 FY2026");
  assert.deepEqual([q1.cash_spent, q1.shares_repurchased, q1.value_repurchased, q1.average_price, q1.from], [24701000000, 93000000, 25000000000, 268.82, null], "the first quarter is its own 10-Q's");
  assert.deepEqual([q2.start, q2.end, q2.cash_spent, q2.shares_repurchased, q2.value_repurchased, q2.average_price], ["2025-12-28", "2026-03-28", 12288000000, 42000000, 11000000000, 261.9], "six months less three");
  assert.deepEqual(q2.from, { "cash_spent, shares_repurchased, value_repurchased, share_count_change": "0000320193-26-000013 less 0000320193-26-000006" });
  const year = ["Q1", "Q2", "Q3", "Q4"].map((q) => row(r, `${q} FY2026`));
  for (const [k, total] of [["cash_spent", 86390000000], ["shares_repurchased", 297000000], ["value_repurchased", 85800000000]]) assert.equal(year.reduce((s, x) => s + x[k], 0), total, k);
  // Apple split 4 for 1 in August 2020: the third quarter's 10-Q counts the year to date in old shares.
  const q4 = row(r, "Q4 FY2020");
  assert.deepEqual([q4.shares_repurchased, q4.value_repurchased, q4.average_price, q4.share_count_change], [171400000, 18000000000, 105.02, -158993000], "917 million less 186.4 million times 4");
  assert.equal(q4.from["shares_repurchased, share_count_change"], "0000320193-20-000096 less 0000320193-20-000062 times 4 (a stock split between the two)");
  assert.ok(OUTPUT_SCHEMAS.buybacks.safeParse(r).success);
});

test("Microsoft: cash and shares but no value tagged, so no average price; what its program has left is only in the text", async () => {
  const r = await buybacks(session(), { company: "MSFT", periods: 2 });
  const fy = row(r, "FY2026");
  assert.deepEqual([fy.cash_spent, fy.shares_repurchased, fy.value_repurchased, fy.average_price, fy.shares_outstanding, fy.share_count_change, fy.filing], [22271000000, 36000000, null, null, 7427000000, -7000000, "0001193125-26-323660"]);
  assert.deepEqual([r.year_to_date.period, r.year_to_date.start, r.year_to_date.end, r.year_to_date.cash_spent, r.year_to_date.filing], ["Q1 FY2027 year to date", "2026-07-01", "2026-09-30", 4379000000, "0001193125-26-436133"]);
  assert.ok(r.not_tagged.includes("value_repurchased: last tagged for the period ending 2018-06-30 (StockRepurchasedDuringPeriodValue, 10-K 0001564590-18-019062 filed 2018-08-03)."), r.not_tagged.join("\n"));
  assert.ok(r.not_tagged.includes("remaining_authorized: last tagged as of 2016-09-30 (StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1, 10-Q 0001193125-16-742796 filed 2016-10-20)."));
  assert.ok(r.not_tagged.some((s) => s.startsWith("average_price: no period shown")));
  // The 10-K: the same cash and shares, the program's balance in words, and why cash over shares is no
  // price (the cash includes $5.6 billion of shares withheld for employees' taxes).
  const text = words("https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm");
  assert.match(text, /Common stock repurchased \( 22,271 \)/);
  assert.match(text, /Balance, beginning of year 7,434 7,434 7,432 Issued 29 31 34 Repurchased \( 36 \) \( 31 \) \( 32 \) Balance, end of year 7,427/);
  assert.match(text, /As of June 30, 2026, \$ 40\.6 billion remained of this \$ 60\.0 billion share repurchase program/);
  assert.match(text, /excludes shares repurchased to settle employee tax withholding related to the vesting of stock awards of \$ 5\.6 billion/);
  const quarters = await buybacks(session(), { company: "MSFT", quarterly: true, periods: 4 });
  assert.deepEqual(quarters.rows.map((x) => [x[0], x[3], x[13]]), [
    ["Q1 FY2027", 4379000000, null],
    ["Q4 FY2026", 4579000000, { "cash_spent, share_count_change": "0001193125-26-323660 less 0001193125-26-191507" }],
    ["Q3 FY2026", 4627000000, { share_count_change: "0001193125-26-191507 less 0001193125-26-027207" }],
    ["Q2 FY2026", 7415000000, { share_count_change: "0001193125-26-027207 less 0001193125-25-256321" }],
  ], "a quarter its 10-Q tags for three months is read as tagged; the fourth is the year less nine months");
});

test("JPMorgan: a bank's count from issued less treasury shares, and program amounts as of the dates it tagged them", async () => {
  const r = await buybacks(session(), { company: "19617", periods: 8 });
  assert.deepEqual(r.rows.map((x) => x[0]), ["FY2025", "FY2024", "FY2023", "FY2022", "FY2021", "FY2020", "FY2019", "FY2018"]);
  const fy25 = row(r, "FY2025"), fy19 = row(r, "FY2019");
  assert.deepEqual([fy25.cash_spent, fy25.shares_repurchased, fy25.shares_outstanding, fy25.share_count_change], [31591000000, null, 2696200000, -101400000]);
  assert.deepEqual([fy19.authorized, fy19.remaining_authorized, fy19.from], [29400000000, 15600000000, { authorized: "as of 2019-06-27" }]);
  // Its 10-Qs tag shares issued and held in treasury, not shares outstanding: 4,104,933,895 less 1,449,324,386.
  assert.deepEqual([r.year_to_date.cash_spent, r.year_to_date.shares_outstanding, r.year_to_date.share_count_change], [16222000000, 2655609509, -40663067]);
  assert.deepEqual(r.tags.shares_outstanding, ["CommonStockSharesOutstanding", "CommonStockSharesIssued less TreasuryStockCommonShares"]);
  assert.ok(r.not_tagged.includes("shares_repurchased: last tagged for the period ending 2011-12-31 (TreasuryStockSharesAcquired, 10-K 0000019617-13-000221 filed 2013-02-28)."), r.not_tagged.join("\n"));
  const q = await buybacks(session(), { company: "19617", quarterly: true, periods: 4 });
  assert.deepEqual(q.rows.map((x) => [x[0], x[3]]), [["Q3 FY2026", 1109000000], ["Q2 FY2026", 6788000000], ["Q1 FY2026", 8325000000], ["Q4 FY2025", 8264000000]], "nine months less six, six less three, three, and the year less nine months");
  assert.ok(OUTPUT_SCHEMAS.buybacks.safeParse(q).success);
});

// Facts whose figures are known.
const fact = (accn, filed, fp, form, end, val, start) => ({ ...(start ? { start } : {}), end, val, accn, fy: 2025, fp, form, filed });
const tagged = (unit, rows) => ({ units: { [unit]: rows } });
const K25 = ["0000000001-26-000001", "2026-02-10", "FY", "10-K"];

test("an average price only from one tag pair, and a later report's different figure listed, not mixed in", () => {
  const cf = { entityName: "Example Corp", facts: { "us-gaap": {
    NetCashProvidedByUsedInOperatingActivities: tagged("USD", [fact(...K25, "2025-12-31", 500, "2025-01-01")]),
    PaymentsForRepurchaseOfCommonStock: tagged("USD", [fact(...K25, "2025-12-31", 120, "2025-01-01"), fact("0000000001-27-000001", "2027-02-10", "FY", "10-K", "2025-12-31", 125, "2025-01-01")]),
    StockRepurchasedDuringPeriodShares: tagged("shares", [fact(...K25, "2025-12-31", 10, "2025-01-01")]),
    TreasuryStockValueAcquiredCostMethod: tagged("USD", [fact(...K25, "2025-12-31", 100, "2025-01-01")]),
  } } };
  const r = buybacksFromFacts(cf, { entity: { cik: 1 } });
  const fy = row(r, "FY2025");
  assert.deepEqual([fy.cash_spent, fy.shares_repurchased, fy.value_repurchased, fy.average_price], [120, 10, 100, null], "shares and value from different pairs make no price");
  assert.deepEqual(r.revised.rows, [["FY2025", "cash_spent", 120, 125, "0000000001-27-000001"]]);
  cf.facts["us-gaap"].StockRepurchasedDuringPeriodValue = tagged("USD", [fact(...K25, "2025-12-31", 110, "2025-01-01")]);
  assert.equal(row(buybacksFromFacts(cf, { entity: { cik: 1 } }), "FY2025").average_price, 11);
});

test("a quarter worked out across a 3-for-2 split counts the earlier report's shares in new shares", () => {
  const q1 = ["0000000003-25-000001", "2025-05-01", "Q1", "10-Q"], q2 = ["0000000003-25-000002", "2025-08-01", "Q2", "10-Q"];
  const cf = { entityName: "Split Co", facts: { "us-gaap": {
    NetCashProvidedByUsedInOperatingActivities: tagged("USD", [fact(...q1, "2025-03-31", 50, "2025-01-01"), fact(...q2, "2025-06-30", 90, "2025-01-01")]),
    StockRepurchasedDuringPeriodShares: tagged("shares", [fact(...q1, "2025-03-31", 10, "2025-01-01"), fact(...q2, "2025-06-30", 33, "2025-01-01")]),
    StockRepurchasedDuringPeriodValue: tagged("USD", [fact(...q1, "2025-03-31", 1000, "2025-01-01"), fact(...q2, "2025-06-30", 1800, "2025-01-01")]),
    // The second report gives the year-end count in new shares: 1,500 where the first gave 1,000.
    CommonStockSharesOutstanding: tagged("shares", [fact(...q1, "2024-12-31", 1000), fact(...q1, "2025-03-31", 990), fact(...q2, "2024-12-31", 1500), fact(...q2, "2025-06-30", 1460)]),
  } } };
  const q = row(buybacksFromFacts(cf, { quarterly: true }), "Q2 FY2025");
  assert.deepEqual([q.start, q.shares_repurchased, q.value_repurchased, q.average_price, q.share_count_change], ["2025-04-01", 18, 800, 44.44, -25], "33 less 10 times 1.5; 1,460 less 990 times 1.5");
  assert.deepEqual(q.from, { "shares_repurchased, share_count_change": "0000000003-25-000002 less 0000000003-25-000001 times 1.5 (a stock split between the two)", value_repurchased: "0000000003-25-000002 less 0000000003-25-000001" });
});

test("errors say what is missing and where to look", async () => {
  const spine = { NetCashProvidedByUsedInOperatingActivities: tagged("USD", [fact(...K25, "2025-12-31", 500, "2025-01-01")]) };
  assert.throws(() => buybacksFromFacts({ entityName: "No Buybacks Inc", facts: { "us-gaap": spine } }, { entity: { cik: 2 } }), /No Buybacks Inc \(CIK 2\) tags no share repurchases .* read_filing with find "repurchase"/);
  assert.throws(() => buybacksFromFacts({ entityName: "Abroad plc", facts: { "ifrs-full": { Assets: tagged("EUR", [fact(...K25, "2025-12-31", 9)]) } } }), /IFRS.*shareholder_returns/);
  const yearly = { ...spine, PaymentsForRepurchaseOfCommonStock: tagged("USD", [fact(...K25, "2025-12-31", 120, "2025-01-01")]) };
  assert.throws(() => buybacksFromFacts({ entityName: "Yearly Ltd", facts: { "us-gaap": yearly } }, { quarterly: true }), /no quarterly reports .* ask for years/);
  for (const bad of [{ company: "MSFT", periods: 0 }, { company: "MSFT", periods: 41 }, { company: "MSFT", periods: 1.5 }, { company: "MSFT", quarterly: "yes" }, { company: "MSFT", years: 5 }, { company: "" }]) assert.equal(buybacksInput.safeParse(bad).success, false, JSON.stringify(bad));
  await assert.rejects(buybacks(session(), { company: "MSFT", periods: 0 }), /periods/);
});
