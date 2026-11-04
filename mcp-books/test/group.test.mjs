// Canli Close group consolidation: a US holding company and its German subsidiary in one set of statements in
// US dollars, the loan between them eliminated, and a Dubai company whose dirham is pegged to the dollar. The
// rates are round numbers made up for the tests, written the ways the ECB publishes them.
import assert from "node:assert/strict";
import test from "node:test";

import { smallBusiness } from "../src/chart.mjs";
import { consolidate, readEcbRates } from "../src/group.mjs";
import { openBook, post, reverse } from "../src/ledger.mjs";
import { month } from "./fixture.mjs";

test("the ECB's rates read the same from its Data Portal CSV, its history CSV and its XML", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<Cube>
		<Cube time='2026-01-30'>
			<Cube currency='USD' rate='1.20'/>
			<Cube currency='GBP' rate='0.85'/>
		</Cube>
		<Cube time='2026-01-02'>
			<Cube currency='USD' rate='1.10'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;
  const portal = "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS\nEXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-01-30,0.85,A\nEXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.10,A\nEXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-30,1.20,A\nEXR.M.USD.EUR.SP00.A,M,USD,EUR,SP00,A,2026-01,1.15,A\n";
  const history = "Date,USD,BGN,GBP,\n2026-01-30,1.20,N/A,0.85,\n2026-01-02,1.10,N/A,N/A,\n";
  const expected = { USD: [["2026-01-02", "1.10"], ["2026-01-30", "1.20"]], GBP: [["2026-01-30", "0.85"]] };
  for (const text of [xml, portal, history]) assert.deepEqual(readEcbRates(text), expected);
  assert.deepEqual(readEcbRates("Date, USD, GBP, \n30 January 2026, 1.20, 0.85, \n"), { USD: [["2026-01-30", "1.20"]], GBP: [["2026-01-30", "0.85"]] });
  assert.throws(() => readEcbRates("date,description,amount\n2026-01-02,Fee,5\n"), /No ECB euro reference rates/);
  assert.throws(() => readEcbRates("Date,USD\n2026-01-02,abc\n"), /"abc" is not a rate/);
  assert.throws(() => readEcbRates("<Cube time='2026-01-02'><Cube currency='USD' rate='1.10'/><Cube currency='USD' rate='1.11'/></Cube>"), /two rates on 2026-01-02/);
});

const RATES = readEcbRates("Date,USD,\n2026-01-30,1.20,\n2026-01-15,1.15,\n2026-01-09,1.12,\n2026-01-02,1.10,\n");

function group() {
  const holdings = openBook({ name: "Example Holdings Inc", currency: "USD", accounts: [...smallBusiness(), { code: "1300", name: "Due from group companies", type: "asset" }, { code: "1600", name: "Investment in subsidiaries", type: "asset" }] });
  post(holdings, { date: "2026-01-02", memo: "Share capital paid in", lines: [{ account: "1000", debit: "100000" }, { account: "3000", credit: "100000" }] });
  post(holdings, { date: "2026-01-02", memo: "Example GmbH founded: EUR 10,000 at 1.10", lines: [{ account: "1600", debit: "11000" }, { account: "1000", credit: "11000" }] });
  post(holdings, { date: "2026-01-15", memo: "Loan to Example GmbH: EUR 5,000 at 1.15", lines: [{ account: "1300", debit: "5750" }, { account: "1000", credit: "5750" }] });
  const gmbh = openBook({ name: "Example GmbH", currency: "EUR", accounts: [...smallBusiness(), { code: "2400", name: "Due to group companies", type: "liability" }] });
  post(gmbh, { date: "2026-01-02", memo: "Share capital from Example Holdings", lines: [{ account: "1000", debit: "10000" }, { account: "3000", credit: "10000" }] });
  post(gmbh, { date: "2026-01-15", memo: "Loan from Example Holdings", lines: [{ account: "1000", debit: "5000" }, { account: "2400", credit: "5000" }] });
  post(gmbh, { date: "2026-01-15", memo: "Sale", lines: [{ account: "1000", debit: "2000" }, { account: "4000", credit: "2000" }] });
  const twice = post(gmbh, { date: "2026-01-15", memo: "Sale, posted twice by mistake", lines: [{ account: "1000", debit: "2000" }, { account: "4000", credit: "2000" }] });
  reverse(gmbh, twice.seq, { date: "2026-01-30" });
  post(gmbh, { date: "2026-01-30", memo: "January rent", lines: [{ account: "6100", debit: "1000" }, { account: "1000", credit: "1000" }] });
  return { holdings, gmbh };
}

const ELIMINATE = [
  { name: "Investment in Example GmbH", lines: [{ company: "Example Holdings Inc", account: "1600" }, { company: "Example GmbH", account: "3000" }] },
  { name: "Loan to Example GmbH", lines: [{ company: "Example Holdings Inc", account: "1300" }, { company: "Example GmbH", account: "2400" }] },
];

test("a group in two currencies: closing rate for assets and liabilities, entry-date rates for the rest, the loan between them eliminated", () => {
  const { holdings, gmbh } = group();
  const companies = [{ name: "Example Holdings Inc", book: holdings }, { name: "Example GmbH", book: gmbh }];
  const out = consolidate(companies, { currency: "USD", asOf: "2026-01-31", from: "2026-01-01", rates: RATES, eliminate: ELIMINATE });

  // Saturday 31 January has no ECB rate, so Friday's is the closing rate. The subsidiary's net assets, EUR 11,000,
  // are worth USD 13,200 at it; USD 11,000 went in at 1.10 and USD 1,100 was earned at the rates of the day,
  // which leaves USD 1,100 to the translation reserve. The reversed sale cancels at the rate of the sale.
  assert.deepEqual(out.companies, [
    { name: "Example Holdings Inc", currency: "USD", closingRate: null, translationDifference: 0 },
    { name: "Example GmbH", currency: "EUR", closingRate: { published: "2026-01-30", perEuro: { EUR: "1", USD: "1.20" } }, translationDifference: 110000 },
  ]);
  // The investment meets the share capital it paid for; the EUR loan, still at USD 5,750 in the parent's books, is
  // USD 6,000 at the closing rate, and the USD 250 between them is shown, not hidden.
  assert.deepEqual(out.eliminations.map((e) => [e.name, e.lines.map((l) => l.amount), e.difference]), [
    ["Investment in Example GmbH", [1100000, -1100000], 0],
    ["Loan to Example GmbH", [575000, -600000], -25000],
  ]);
  assert.deepEqual(out.trialBalance.rows.map((r) => [r.code, r.name, r.debit, r.credit]), [
    ["1000", "Cash at bank", 10245000, 0],
    ["3000", "Share capital", 0, 10000000],
    ["4000", "Sales", 0, 230000],
    ["6100", "Rent", 120000, 0],
    [null, "Currency translation reserve", 0, 110000],
    [null, "Intercompany difference", 0, 25000],
  ]);
  assert.deepEqual([out.trialBalance.debit, out.trialBalance.credit, out.trialBalance.balanced], [10365000, 10365000, true]);
  assert.deepEqual([out.incomeStatement.totalIncome, out.incomeStatement.totalExpenses, out.incomeStatement.netIncome], [230000, 120000, 110000]);
  const bs = out.balanceSheet;
  assert.deepEqual([bs.totalAssets, bs.totalEquity, bs.translationReserve, bs.intercompanyDifference, bs.earningsToDate, bs.totalLiabilitiesAndEquity, bs.balanced], [10245000, 10000000, 110000, 25000, 110000, 10245000, true]);

  // Once the parent carries the loan at the closing rate too, the two sides agree and nothing is left over.
  post(holdings, { date: "2026-01-31", memo: "Loan to Example GmbH at the closing rate 1.20", lines: [{ account: "1300", debit: "250" }, { account: "4100", credit: "250" }] });
  const after = consolidate(companies, { currency: "USD", asOf: "2026-01-31", from: "2026-01-01", rates: RATES, eliminate: ELIMINATE });
  assert.deepEqual([after.eliminations[1].difference, after.balanceSheet.intercompanyDifference, after.incomeStatement.netIncome, after.trialBalance.balanced], [0, 0, 135000, true]);
  assert.ok(!after.trialBalance.rows.some((r) => r.name === "Intercompany difference"));
});

test("a pegged currency moves with its base, a group in one currency needs no rates, and what cannot be done is refused", () => {
  const book = month();
  const companies = [{ name: "Example Trading LLC", book }];
  assert.throws(() => consolidate(companies, { currency: "USD", asOf: "2026-01-31", rates: RATES }), /no AED\. The ECB does not publish every currency/);
  const pegs = { AED: { base: "USD", rate: "3.6725" } };
  const out = consolidate(companies, { currency: "USD", asOf: "2026-01-31", rates: RATES, pegs });
  // AED 3.6725 to the dollar on every date, so nothing is left to the reserve but the roundings: one cent.
  assert.deepEqual(out.companies[0].closingRate, { published: "2026-01-30", perEuro: { AED: "4.407", USD: "1.20" } });
  assert.equal(out.companies[0].translationDifference, 1);
  assert.deepEqual(out.balanceSheet.equity, [{ code: "3000", name: "Share capital", amount: 1361470 }]);
  assert.ok(out.trialBalance.balanced && out.balanceSheet.balanced);

  assert.throws(() => consolidate(companies, { currency: "USD", asOf: "2026-01-31", rates: RATES, pegs: { ...pegs, USD: { base: "EUR", rate: "1.1" } } }), /publishes USD, so it takes no peg/);
  assert.throws(() => consolidate(companies, { currency: "USD", asOf: "2026-03-31", rates: RATES, pegs }), /no USD rate on 2026-03-31 or in the 7 days before it/);

  assert.throws(() => consolidate(companies, { currency: "EUR", asOf: "2026-01-31", pegs }), /needs the ECB's euro reference rates \(rates_file\), and none were given/);

  const twins = [{ name: "Example Trading LLC", book }, { name: "Example Trading 2 LLC", book: month() }];
  const same = consolidate(twins, { currency: "AED", asOf: "2026-01-31" });
  assert.deepEqual([same.trialBalance.rows[0].debit, same.trialBalance.balanced, same.balanceSheet.translationReserve], [9400000, true, 0]);
  assert.throws(() => consolidate([twins[0], { ...twins[1], map: { 1100: "2100" } }], { currency: "AED", asOf: "2026-01-31" }), /Group account 2100 would be liability in Example Trading LLC and asset in Example Trading 2 LLC/);
  assert.throws(() => consolidate(twins, { currency: "AED", asOf: "2026-01-31", eliminate: [{ name: "Loan", lines: [{ company: "Nobody", account: "1000" }, { company: "Example Trading LLC", account: "1000" }] }] }), /names Nobody/);
  assert.throws(() => consolidate(twins, { currency: "AED", asOf: "2026-01-31", eliminate: [{ name: "Loan", lines: [{ company: "Example Trading LLC", account: "1100" }] }] }), /at least two lines/);
  const reused = [{ company: "Example Trading LLC", account: "1100" }, { company: "Example Trading 2 LLC", account: "2100" }];
  assert.throws(() => consolidate(twins, { currency: "AED", asOf: "2026-01-31", eliminate: [{ name: "A", lines: reused }, { name: "B", lines: reused }] }), /account 1100 is in two eliminations/);
});
