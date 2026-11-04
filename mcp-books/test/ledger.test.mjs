// Canli Books' core on a small Dubai company's first month: share capital paid in, a sale with VAT,
// rent, a mistake fixed by a reversing entry, a locked month, and book files edited by hand that verify()
// catches, including a full rewrite that only the kept head hash gives away.
import assert from "node:assert/strict";
import test from "node:test";

import { smallBusiness } from "../src/chart.mjs";
import { addAccount, balanceSheet, explain, fromJsonl, fromMinor, hashRecord, incomeStatement, lock, openBook, post, reverse, toJsonl, toMinor, trialBalance, verify } from "../src/ledger.mjs";

const month = () => {
  const book = openBook({ name: "Example Trading LLC", currency: "aed", accounts: smallBusiness() });
  post(book, { date: "2026-01-02", memo: "Share capital paid in", lines: [{ account: "1000", debit: "50000" }, { account: "3000", credit: "50000" }] });
  post(book, { date: "2026-01-10", memo: "Invoice 1, with VAT at 5%", lines: [{ account: "1100", debit: "1050" }, { account: "4000", credit: "1000.00" }, { account: "2100", credit: "50" }] });
  post(book, { date: "2026-01-15", memo: "January rent", lines: [{ account: "6100", debit: "3000" }, { account: "1000", credit: "3000" }] });
  return book;
};
const entry = (book, memo) => book.records.find((r) => r.memo === memo);
const rent = [{ account: "6100", debit: "10" }, { account: "1000", credit: "10" }];

test("amounts are read exactly or refused", () => {
  assert.equal(toMinor("1234.56", "USD"), 123456);
  assert.equal(toMinor("1234.5", "AED"), 123450);
  assert.equal(toMinor(7, "USD"), 700);
  assert.equal(toMinor("100", "JPY"), 100);
  assert.equal(toMinor("1.234", "KWD"), 1234);
  assert.throws(() => toMinor("1.2345", "KWD"), /3 decimal places/);
  assert.throws(() => toMinor("100.5", "JPY"), /0 decimal places/);
  assert.throws(() => toMinor("1,234.56", "USD"), /plain amount/);
  assert.throws(() => toMinor("-5", "USD"), /plain amount/);
  assert.throws(() => toMinor(0.1 + 0.2, "USD"), /2 decimal places/, "a float that is not what it looks like is refused");
  assert.equal(fromMinor(-123456, "USD"), "-1234.56");
  assert.equal(fromMinor(5, "USD"), "0.05");
  assert.equal(fromMinor(1234, "KWD"), "1.234");
  assert.equal(fromMinor(100, "JPY"), "100");
});

test("accounts are unique and typed, and the currency is a real code", () => {
  const book = month();
  assert.throws(() => addAccount(book, { code: "1000", name: "Cash", type: "asset" }), /already exists/);
  assert.throws(() => addAccount(book, { code: "7000", name: "Fees", type: "revenue" }), /must be one of/);
  assert.throws(() => openBook({ currency: "DIRHAM" }), /three-letter code/);
  assert.equal(book.records[0].currency, "AED");
});

test("an entry must balance, name real accounts, and give a debit or a credit on each line", () => {
  const book = month();
  assert.throws(() => post(book, { date: "2026-01-20", lines: [{ account: "6100", debit: "10" }, { account: "1000", credit: "9.99" }] }), /differ by 0\.01/);
  assert.throws(() => post(book, { date: "2026-01-20", lines: [{ account: "9999", debit: "10" }, { account: "1000", credit: "10" }] }), /no account 9999/);
  assert.throws(() => post(book, { date: "2026-01-20", lines: [{ account: "6100", debit: "10", credit: "10" }, { account: "1000", credit: "10" }] }), /not both or neither/);
  assert.throws(() => post(book, { date: "2026-01-20", lines: [{ account: "6100", debit: "10" }] }), /at least two lines/);
  assert.throws(() => post(book, { date: "2026-01-20", lines: [{ account: "6100", debit: "0" }, { account: "1000", credit: "0" }] }), /more than zero/);
  assert.throws(() => post(book, { date: "2026-02-30", lines: rent }), /not a real date/);
  assert.throws(() => post(book, { lines: rent }), /needs a date/);
  assert.equal(book.records.filter((r) => r.kind === "entry").length, 3, "nothing refused was written");
});

test("trial balance, income statement and balance sheet agree", () => {
  const book = month();
  const tb = trialBalance(book);
  assert.equal(tb.balanced, true);
  assert.equal(tb.debit, 5105000);
  assert.deepEqual(tb.rows.map((r) => [r.code, r.debit, r.credit]), [["1000", 4700000, 0], ["1100", 105000, 0], ["2100", 0, 5000], ["3000", 0, 5000000], ["4000", 0, 100000], ["6100", 300000, 0]]);
  const is = incomeStatement(book, { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual([is.totalIncome, is.totalExpenses, is.netIncome], [100000, 300000, -200000]);
  assert.equal(incomeStatement(book, { from: "2026-01-11" }).totalIncome, 0, "the sale on the 10th is outside the range");
  const bs = balanceSheet(book, { asOf: "2026-01-31" });
  assert.deepEqual([bs.totalAssets, bs.totalLiabilities, bs.totalEquity, bs.earningsToDate], [4805000, 5000, 5000000, -200000]);
  assert.equal(bs.totalLiabilitiesAndEquity, bs.totalAssets);
  assert.equal(bs.balanced, true);
  assert.equal(balanceSheet(book, { asOf: "2026-01-05" }).totalAssets, 5000000, "only the capital is in by the 5th");
});

test("a mistake is fixed by a reversing entry, never by an edit", () => {
  const book = month();
  const original = entry(book, "January rent");
  const fix = reverse(book, original.seq, { date: "2026-01-16", memo: "Rent belongs to February" });
  assert.equal(fix.reverses, original.seq);
  assert.deepEqual(fix.lines, [{ account: "6100", credit: 300000 }, { account: "1000", debit: 300000 }]);
  assert.equal(incomeStatement(book).netIncome, 100000);
  assert.ok(book.records.includes(original), "the original entry is still in the book");
  assert.throws(() => reverse(book, original.seq, { date: "2026-01-17" }), /already been reversed/);
  assert.throws(() => reverse(book, 999), /no entry 999/);
  const cash = explain(book, "1000");
  const capital = entry(book, "Share capital paid in");
  assert.deepEqual(cash.rows.map((r) => [r.seq, r.change, r.balance]), [[capital.seq, 5000000, 5000000], [original.seq, -300000, 4700000], [fix.seq, 300000, 5000000]]);
  assert.equal(cash.closing, 5000000);
  const later = explain(book, "1000", { from: "2026-01-15" });
  assert.equal(later.opening, 5000000);
  assert.equal(later.rows.length, 2);
});

test("a locked month takes no new entries, and a lock only moves forward", () => {
  const book = month();
  lock(book, "2026-01-31");
  assert.throws(() => post(book, { date: "2026-01-20", lines: rent }), /locked through 2026-01-31/);
  const original = entry(book, "January rent");
  assert.throws(() => reverse(book, original.seq), /locked through/, "a reversal dated in the closed month is refused");
  reverse(book, original.seq, { date: "2026-02-01" });
  assert.throws(() => lock(book, "2026-01-15"), /only moves forward/);
  assert.throws(() => lock(book, "2026-01-31"), /only moves forward/);
  assert.equal(verify(book).ok, true);
});

test("the book file round-trips, and edits to it show in verify()", () => {
  const book = month();
  const text = toJsonl(book);
  const again = fromJsonl(text);
  const checked = verify(again);
  assert.equal(checked.ok, true);
  assert.equal(checked.records, book.records.length);
  assert.deepEqual(trialBalance(again), trialBalance(book));

  // An amount changed by hand: the record no longer matches its hash.
  const lines = text.trim().split("\n");
  const i = lines.findIndex((line) => line.includes("January rent"));
  const edited = verify(fromJsonl(lines.with(i, lines[i].replaceAll("300000", "30000")).join("\n")));
  assert.deepEqual([edited.ok, edited.at], [false, i + 1]);
  assert.match(edited.problem, /hash/);

  // A record removed from the middle: the one after it no longer follows on.
  const removed = verify(fromJsonl(lines.toSpliced(lines.findIndex((line) => line.includes("Invoice 1")), 1).join("\n")));
  assert.equal(removed.ok, false);
  assert.match(removed.problem, /numbered|point/);

  // The last record cut off: what is left is a whole chain, so only the kept head hash shows it.
  const cut = verify(fromJsonl(lines.slice(0, -1).join("\n")));
  assert.equal(cut.ok, true);
  assert.notEqual(cut.head, checked.head);

  // A rewrite that recomputes every hash: an unbalanced entry is still caught by the checks...
  const rehash = (records) => {
    let prev = "";
    return records.map((record) => {
      const copy = { ...record, prev };
      copy.hash = hashRecord(copy);
      prev = copy.hash;
      return copy;
    });
  };
  const sale = book.records.findIndex((r) => r.memo === "Invoice 1, with VAT at 5%");
  const unbalanced = book.records.map((r, j) => (j === sale ? { ...r, lines: r.lines.map((l) => (l.account === "4000" ? { ...l, credit: 90000 } : l)) } : r));
  const caught = verify({ records: rehash(unbalanced) });
  assert.deepEqual([caught.ok, caught.at], [false, sale + 1]);
  assert.match(caught.problem, /differ by 100\.00/);

  // ...and a balanced rewrite passes the checks, but its head hash differs from the one that was kept.
  const smaller = book.records.map((r) => (r.memo === "January rent" ? { ...r, lines: r.lines.map((l) => ({ ...l, [l.debit ? "debit" : "credit"]: 30000 })) } : r));
  const forged = verify({ records: rehash(smaller) });
  assert.equal(forged.ok, true);
  assert.notEqual(forged.head, checked.head);
});
