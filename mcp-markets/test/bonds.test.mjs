// bond_offerings: term sheet layouts and fee tables written by hand, and real issuers' term sheets, fee tables and
// EDGAR searches captured by scripts/capture-bond-fixtures.mjs, replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { bondOfferings, feeTable, isoDate, money, parseTermSheet, spreadBp, yieldFromPrice } from "../src/bonds.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = (extra) => createSession({ fetchImpl: replayFetch(extra).fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
const table = (rows) => `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
const fields = (sheet) => sheet.tranches.map((t) => [t.title ?? t.short, t.f.principal, t.f.maturity, t.f.coupon]);
const col = (r, name) => r.offerings.columns.indexOf(name);
const row = (r, title, priced) => r.offerings.rows.find((x) => x[col(r, "security")] === title && (!priced || x[0] === priced));

test("dates, amounts and spreads as term sheets write them", () => {
  assert.deepEqual([isoDate("May 12, 2028"), isoDate("12 May 2028"), isoDate("June 2, 2026 (T+3)"), isoDate("5/12/2028")], ["2028-05-12", "2028-05-12", "2026-06-02", "2028-05-12"]);
  assert.deepEqual(money("$750 million"), { amount: 750000000, currency: "USD" });
  assert.deepEqual(money("C$1,250,000,000"), { amount: 1250000000, currency: "CAD" });
  assert.deepEqual(money("€1,000,000,000"), { amount: 1000000000, currency: "EUR" });
  assert.deepEqual([spreadBp("T + 40 bps"), spreadBp("+60 basis points"), spreadBp("0.25%")], [40, 60, 25]);
});

test("a yield recomputed from its price, a short first coupon paid for its days", () => {
  assert.equal(yieldFromPrice(99.804, 4, "2025-05-12", "2028-05-12"), 4.07, "Apple's 4.000% notes due 2028 at 99.804");
  assert.equal(yieldFromPrice(99.916, 8, "2026-11-04", "2037-02-04"), 8.015, "Oracle's 8.000% notes due February 2037, settled in November");
});

test("term sheet layouts: a block per tranche, one cell per field, a name to each value, columns", () => {
  const blocks = parseTermSheet(`<p>4.000% Notes due 2028 (“2028 Notes”)</p>${table([["Principal Amount:", "$1,500,000,000"], ["Maturity:", "May 12, 2028"], ["Coupon:", "4.000%"]])}
    <p>4.200% Notes due 2030 (“2030 Notes”)</p>${table([["Principal Amount:", "$1,000,000,000"], ["Maturity:", "May 12, 2030"], ["Coupon:", "4.200%"]])}${table([["Trade Date:", "May 5, 2025"]])}`);
  assert.deepEqual(fields(blocks), [["4.000% Notes due 2028", "$1,500,000,000", "May 12, 2028", "4.000%"], ["4.200% Notes due 2030", "$1,000,000,000", "May 12, 2030", "4.200%"]]);
  assert.equal(blocks.deal.trade_date, "May 5, 2025");

  const inCell = parseTermSheet(table([
    ["Title:", "<p>4.600% Notes due 2029 (the \"2029 Notes\")</p><p>4.800% Notes due 2031 (the \"2031 Notes\")</p>"],
    ["Size:", "<p>2029 Notes: $3,500,000,000</p><p>2031 Notes: $4,250,000,000</p>"],
    ["Maturity Date:", "2029 Notes: July 9, 2029 2031 Notes: July 9, 2031"],
  ]));
  assert.deepEqual(fields(inCell).map((x) => x.slice(0, 3)), [["4.600% Notes due 2029", "$3,500,000,000", "July 9, 2029"], ["4.800% Notes due 2031", "$4,250,000,000", "July 9, 2031"]]);

  // Each tranche's name in a cell of its own, the next tranches on rows with an empty label (Microsoft, 2017).
  const named = parseTermSheet(table([
    ["Title of Securities:", "", "1.850% Notes due 2020 (the \"2020 Notes\") 2.400% Notes due 2022 (the \"2022 Notes\")"],
    ["Aggregate Principal Amount Offered:", "", "2020 Notes:", "", "$1,500,000,000"], ["", "", "2022 Notes:", "", "$1,750,000,000"],
    ["Maturity Date:", "", "2020 Notes:", "", "February 6, 2020"], ["", "", "2022 Notes:", "", "February 6, 2022"],
  ]));
  assert.deepEqual(fields(named).map((x) => x.slice(0, 3)), [["1.850% Notes due 2020", "$1,500,000,000", "February 6, 2020"], ["2.400% Notes due 2022", "$1,750,000,000", "February 6, 2022"]]);

  const columns = parseTermSheet(table([["", "2028 Notes", "2030 Notes"], ["Principal Amount:", "$500,000,000", "$750,000,000"], ["Coupon:", "4.25%", "4.50%"], ["Maturity:", "June 1, 2028", "June 1, 2030"]]));
  assert.deepEqual(fields(columns), [["2028 Notes", "$500,000,000", "June 1, 2028", "4.25%"], ["2030 Notes", "$750,000,000", "June 1, 2030", "4.50%"]]);
});

test("fee tables: dollars or a count of $1,000 notes, the note named inside a generic title", () => {
  const xml = `<ffd:OfferingSctyTp contextRef="o1">Other</ffd:OfferingSctyTp><ffd:OfferingSctyTitl contextRef="o1">Debt Securities (4.500% Notes due 2029)</ffd:OfferingSctyTitl>
    <ffd:AmtSctiesRegd contextRef="o1" unitRef="Shares">750000</ffd:AmtSctiesRegd><ffd:MaxAggtOfferingPric contextRef="o1" unitRef="USD">748957500.00</ffd:MaxAggtOfferingPric>
    <ffd:OfferingSctyTp contextRef="o2">Debt</ffd:OfferingSctyTp><ffd:OfferingSctyTitl contextRef="o2">4.000% Notes due 2028</ffd:OfferingSctyTitl>
    <ffd:AmtSctiesRegd contextRef="o2" unitRef="USD">1500000000</ffd:AmtSctiesRegd><ffd:MaxAggtOfferingPric contextRef="o2" unitRef="USD">1497060000</ffd:MaxAggtOfferingPric>`;
  assert.deepEqual(feeTable(xml).rows.map((r) => [r.title, r.amount, r.price_pct]), [["4.500% Notes due 2029", 750000000, 99.861], ["4.000% Notes due 2028", 1500000000, 99.804]]);
});

test("figures that disagree with their tranche's own title are left out, not shown wrong", async () => {
  const efts = (q, forms) => `https://efts.sec.gov/LATEST/search-index?${new URLSearchParams({ q, forms, ciks: "0000999999", dateRange: "custom", startdt: "2025-10-09", enddt: "2026-10-09" })}`;
  const sheet = `<p>4.000% Notes due 2028 ("2028 Notes")</p>${table([["Principal Amount:", "$1,000,000,000"], ["Maturity:", "May 12, 2028"], ["Coupon:", "4.000%"], ["Price to Public:", "99.804%"]])}
    <p>4.200% Notes due 2030 ("2030 Notes")</p>${table([["Principal Amount:", "$1,000,000,000"], ["Maturity:", "May 12, 2028"], ["Coupon:", "4.000%"], ["Price to Public:", "99.804%"]])}${table([["Trade Date:", "March 2, 2026"], ["Settlement Date:", "March 9, 2026"]])}`;
  const r = await bondOfferings(session({
    [efts("\"Benchmark Treasury\" OR \"Mid-Swap\" OR \"Mid-Swaps\" OR \"Pricing Term Sheet\"", "FWP")]: { hits: { total: { value: 1 }, hits: [{ _id: "0000999999-26-000001:sheet.htm", _source: { form: "FWP", file_date: "2026-03-02", file_type: "FWP" } }] } },
    "https://www.sec.gov/Archives/edgar/data/999999/000099999926000001/sheet.htm": sheet,
    [efts("\"Notes due\" OR \"Debentures due\" OR \"Bonds due\"", "424B2,424B3,424B5")]: { hits: { total: { value: 0 }, hits: [] } },
  }), { company: "999999", years: 1 });
  assert.deepEqual(row(r, "4.000% Notes due 2028").slice(col(r, "amount"), col(r, "amount") + 1), [1000000000]);
  const wrong = row(r, "4.200% Notes due 2030");
  assert.deepEqual([wrong[col(r, "amount")], wrong[col(r, "coupon_pct")], wrong[col(r, "maturity")], wrong[col(r, "from")]], [null, 4.2, "2030", "term sheet title"]);
  assert.match(r.checks.figures_left_out[0], /^4\.200% Notes due 2030/);
});

test("Apple since 2019: eight deals, a euro deal over mid-swaps, the 2025 deal confirmed by its fee table, every check passing", async () => {
  const r = await bondOfferings(session(), { company: "AAPL", years: 7, deals: 8 });
  assert.equal(r.deals.rows.length, 8);
  assert.equal(r.offerings.rows.length, 33);
  const euro = row(r, "0.000% Notes due 2025");
  assert.deepEqual(["currency", "amount", "yield_pct", "spread_bp", "benchmark", "benchmark_yield_pct", "isin"].map((k) => euro[col(r, k)]), ["EUR", 1000000000, 0.032, 15, "mid-swaps", -0.118, "XS2079716853"]);
  const notes = row(r, "4.000% Notes due 2028", "2025-05-05");
  assert.deepEqual(["amount", "price_pct", "yield_pct", "spread_bp", "benchmark_yield_pct", "cusip", "from"].map((k) => notes[col(r, k)]), [1500000000, 99.804, 4.07, 25, 3.82, "037833EY2", "term sheet, fee table"]);
  assert.equal(row(r, "4.000% Notes due 2028", "2023-05-08")[col(r, "cusip")], "037833ET3", "a CUSIP written with a space, or read from its ISIN");
  assert.deepEqual([r.checks.yields_checked, r.checks.spreads_checked], [31, 33]);
  assert.deepEqual([...r.checks.yield_gaps, ...r.checks.spread_gaps, ...r.checks.fee_table_gaps, ...r.checks.figures_left_out], []);
  assert.deepEqual(r.by_year.rows.find((y) => y[0] === 2019), [2019, "EUR", 1, 2, 2000000000, 0.25, 9, 22.5]);
  assert.equal(typeof r.source, "string");
});

test("Microsoft, January 2017: seven tranches whose names sit in cells of their own, $17 billion", async () => {
  const r = await bondOfferings(session(), { company: "MSFT", years: 10, deals: 2 });
  const deal = r.offerings.rows.filter((x) => x[0] === "2017-01-30");
  assert.equal(deal.length, 7);
  assert.equal(deal.reduce((s, x) => s + x[col(r, "amount")], 0), 17000000000);
  assert.equal(new Set(deal.map((x) => x[col(r, "cusip")])).size, 7);
  assert.deepEqual(["amount", "maturity", "price_pct", "yield_pct", "spread_bp"].map((k) => row(r, "4.250% Notes due 2047")[col(r, k)]), [3000000000, "2047-02-06", 99.731, 4.266, 115]);
  assert.equal(r.checks.yields_checked, 7);
});

test("Amazon: sterling over gilts, Canadian dollars over the named benchmark bond, floating notes over SOFR", async () => {
  const r = await bondOfferings(session(), { company: "1018724", years: 2, deals: 3 });
  assert.deepEqual(["currency", "yield_pct", "spread_bp", "benchmark_yield_pct", "cusip", "isin"].map((k) => row(r, "5.200% Notes due 2029")[col(r, k)]), ["GBP", 5.211, 53, 4.681, "023135EK8", "XS3504677348"]);
  assert.deepEqual(["currency", "spread_bp", "benchmark_yield_pct", "cusip"].map((k) => row(r, "3.400% Notes due 2029")[col(r, k)]), ["CAD", 43.4, 2.989, "023135DU7"]);
  assert.deepEqual(["kind", "coupon", "spread_bp", "benchmark"].map((k) => row(r, "Floating Rate Notes due 2029")[col(r, k)]), ["floating", "Compounded SOFR + 58 bp", 58, "Compounded SOFR"]);
  assert.deepEqual(r.deals.rows.map((d) => d[4]), [{ GBP: 4250000000 }, { USD: 25000000000 }, { CAD: 14000000000 }]);
  assert.equal(r.checks.spreads_checked, 16);
  assert.deepEqual([...r.checks.yield_gaps, ...r.checks.spread_gaps], []);
});

test("JPMorgan: a term sheet for each tranche grouped into one deal; fixed-to-floating, reset and reopened notes", async () => {
  const r = await bondOfferings(session(), { company: "19617", years: 1, deals: 5 });
  const july = r.deals.rows.find((d) => d[0] === "2026-07-15");
  assert.equal(july[6].length, 4, "four term sheets, one deal");
  assert.deepEqual(["kind", "coupon_pct", "coupon"].map((k) => row(r, "Fixed-to-Floating Rate Notes due 2032")[col(r, k)]), ["fixed-to-floating", 5.041, "then Compounded SOFR + 101.5 bp"]);
  assert.deepEqual(["kind", "coupon_pct", "coupon", "yield_pct"].map((k) => row(r, "Fixed-Rate Reset Subordinated Notes due 2041")[col(r, k)]), ["fixed-reset", 5.803, "then Treasury + 125 bp", 5.803]);
  const reopened = r.offerings.rows.find((x) => x[col(r, "reopening")] === true);
  assert.deepEqual(["security", "amount"].map((k) => reopened[col(r, k)]), ["Fixed-to-Floating Rate Notes due 2030", 500000000]);
});

test("Toyota Motor Credit: notes priced with no term sheet come from fee tables, counted in $1,000 notes", async () => {
  const r = await bondOfferings(session(), { company: "Toyota Motor Credit", years: 1, deals: 3 });
  assert.deepEqual(["amount", "price_pct", "from"].map((k) => row(r, "4.500% Medium-Term Notes, Series B due July 9, 2029")[col(r, k)]), [750000000, 99.861, "term sheet, fee table"]);
  assert.deepEqual(r.checks.fee_table_gaps, [], "750,000 notes of $1,000 agree with the term sheet's $750,000,000");
  const fee = r.offerings.rows.find((x) => x[0] === "2026-10-06");
  assert.deepEqual(["security", "amount", "maturity", "from"].map((k) => fee[col(r, k)]), ["Floating Rate Notes due 2027", 2250000000, "2027", "fee table"]);
});

test("Oracle: an equity term sheet is counted apart; a short first coupon checks out", async () => {
  const r = await bondOfferings(session(), { company: "1341439", years: 1, deals: 3 });
  assert.equal(r.term_sheets.for_shares_or_convertibles, 1);
  assert.equal(row(r, "5.350% Notes Due 2033")[col(r, "maturity")], "2033-05-04");
  assert.deepEqual([r.checks.yields_checked, r.checks.yield_gaps], [7, []]);
});

test("a company with no registered bonds is told so, with the likely reasons", async () => {
  await assert.rejects(bondOfferings(session(), { company: "TSLA" }), /No registered bond offerings found for Tesla, Inc\..*Rule 144A/);
});
