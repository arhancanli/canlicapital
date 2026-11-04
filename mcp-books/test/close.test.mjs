// Canli Close on the fixture month: a bank statement matched to the books (rent cleared two days late, a bank
// fee the books did not have yet), what moved from January to February, and the checklist before locking.
import assert from "node:assert/strict";
import test from "node:test";

import { bankEntries, checklist, entryChecks, parseCsv, readStatement, reconcile, variance } from "../src/close.mjs";
import { addAccount, lock, post } from "../src/ledger.mjs";
import { month, seqsOf } from "./fixture.mjs";

const csv = 'date,description,amount\n2026-01-02,Capital from shareholders,"50,000.00"\n2026-01-17,Landlord,-3000\n2026-01-31,Bank fee,(25.00)\n';
const fee = { date: "2026-01-31", memo: "Bank fee", lines: [{ account: "6500", debit: "25" }, { account: "1000", credit: "25" }] };

test("a statement is read exactly, and lines that read two ways are refused", () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n1,2,3'), [["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
  assert.deepEqual(readStatement(csv, "AED").map((l) => l.amount), [5000000, -300000, -2500]);
  assert.deepEqual(readStatement("date,description,in,out\n2026-01-03,Sale,100,\n2026-01-04,Fee,,2.5\n", "USD").map((l) => l.amount), [10000, -250]);
  assert.throws(() => readStatement("date,description,amount\n03/01/2026,Fee,5\n", "AED"), /written 2026-01-31/);
  assert.throws(() => readStatement('date,description,amount\n2026-01-03,Fee,"1,5"\n', "AED"), /not a plain amount/);
  assert.throws(() => readStatement("date,memo,amount\n2026-01-03,Fee,5\n", "AED"), /"description"/);
});

test("the bank is matched to the books, and what is left over is named", () => {
  const book = month();
  const rec = reconcile(book, readStatement(csv, "AED"));
  assert.deepEqual(rec.matched.map((m) => [m.description, m.days]), [["Capital from shareholders", 0], ["Landlord", 2]]);
  assert.deepEqual(rec.unmatchedStatement.map((l) => l.description), ["Bank fee"]);
  assert.deepEqual([rec.unmatchedBooks.length, rec.difference, rec.reconciled], [0, -2500, false]);
  post(book, fee);
  const again = reconcile(book, readStatement(csv, "AED"));
  assert.deepEqual([again.reconciled, again.difference], [true, 0]);
  assert.throws(() => reconcile(book, [], { account: "9999" }), /no account 9999/);
});

test("bank lines the books do not have become entries by rule; the rest is named, and nothing posts twice", () => {
  const book = month();
  const statement = readStatement(`${csv}2026-01-31,Card sale STRIPE,980.00\n2026-01-31,Transfer 88213,-120\n2026-01-31,Interest,0\n`, "AED");
  const rules = [{ contains: "BANK FEE", account: "6500" }, { contains: "stripe", account: "4000", direction: "in" }, { contains: "transfer", account: "1100", direction: "in" }];
  const out = bankEntries(book, statement, { rules });
  assert.equal(out.alreadyInBooks, 2);
  assert.deepEqual(out.entries.map((e) => [e.memo, e.rule, e.lines]), [
    ["Bank fee", 1, [{ account: "6500", debit: "25.00" }, { account: "1000", credit: "25.00" }]],
    ["Card sale STRIPE", 2, [{ account: "1000", debit: "980.00" }, { account: "4000", credit: "980.00" }]],
  ]);
  assert.deepEqual(out.unassigned.map((l) => l.description), ["Transfer 88213"], "money out does not fit a rule for money in, and is not guessed");
  for (const e of out.entries) post(book, e);
  const again = bankEntries(book, statement, { rules });
  assert.deepEqual([again.entries.length, again.alreadyInBooks, again.unassigned.length], [0, 4, 1]);
  assert.throws(() => bankEntries(book, statement, { rules: [{ contains: "fee", account: "9999" }] }), /Rule 1: there is no account 9999/);
  assert.throws(() => bankEntries(book, statement, { rules: [{ contains: "fee", account: "1000" }] }), /own account 1000/);

  const closed = month();
  lock(closed, "2026-01-31");
  assert.deepEqual(bankEntries(closed, statement, { rules }).locked.map((l) => l.description), ["Bank fee", "Card sale STRIPE", "Transfer 88213"]);

  // A card account: a positive line is a charge, which raises what the company owes.
  const card = month();
  addAccount(card, { code: "2050", name: "Company card", type: "liability" });
  const charge = bankEntries(card, readStatement("date,description,amount\n2026-01-20,Figma subscription,45\n", "AED"), { account: "2050", rules: [{ contains: "subscription", account: "6300" }] });
  assert.deepEqual(charge.entries[0].lines, [{ account: "6300", debit: "45.00" }, { account: "2050", credit: "45.00" }]);
});

test("what moved between two months, with the entries that moved it", () => {
  const book = month();
  post(book, { date: "2026-02-15", memo: "February rent, new lease", lines: [{ account: "6100", debit: "3540" }, { account: "1000", credit: "3540" }] });
  const v = variance(book, { priorFrom: "2026-01-01", priorTo: "2026-01-31", from: "2026-02-01", to: "2026-02-28" });
  const rent = v.rows.find((r) => r.code === "6100");
  assert.deepEqual([rent.prior, rent.current, rent.change, rent.pct], [300000, 354000, 54000, 18]);
  assert.equal(rent.drivers[0].memo, "February rent, new lease");
  assert.equal(v.rows[0].code, "1000", "the largest change comes first");
  assert.equal(v.rows.find((r) => r.code === "4000").pct, -100);
});

test("the checklist says what is left before the month is locked", () => {
  const book = month();
  const first = checklist(book, { through: "2026-01-31" });
  assert.equal(first.readyToLock, false);
  assert.deepEqual(first.items.filter((i) => !i.done).map((i) => i.item), ["The bank is reconciled", "The month is locked through 2026-01-31"]);
  post(book, fee);
  const rec = reconcile(book, readStatement(csv, "AED"));
  assert.equal(checklist(book, { through: "2026-01-31", reconciliation: rec }).readyToLock, true);
  lock(book, "2026-01-31");
  assert.ok(checklist(book, { through: "2026-01-31", reconciliation: rec }).items.every((i) => i.done));
});

test("continuous close: an entry is checked as it is posted, against the journal tests and the bank statement", () => {
  const book = month();
  const statement = readStatement("date,description,amount\n2026-01-02,Capital,50000\n2026-01-17,Landlord,-3000\n", "AED");
  // January rent: a round amount, and its cash line came in on the statement two days later.
  const [rent] = seqsOf(book, "January rent");
  const onRent = entryChecks(book, rent, { statement });
  assert.deepEqual([onRent.flags, onRent.bank.matched], [["round"], { line: 2, date: "2026-01-17", description: "Landlord", days: 2 }]);
  // A bank fee on Saturday 31 January with no memo: nothing on the statement for it yet.
  const fee = post(book, { date: "2026-01-31", lines: [{ account: "6500", debit: "25" }, { account: "1000", credit: "25" }] });
  const onFee = entryChecks(book, fee.seq, { statement });
  assert.deepEqual([onFee.flags, onFee.bank.cash, onFee.bank.matched, onFee.bank.unmatchedBooks, onFee.bank.difference, onFee.bank.reconciled], [["weekend", "no_memo"], true, null, 1, 2500, false]);
  // The same entry posted again is named against the first.
  const again = post(book, { date: "2026-01-31", lines: [{ account: "6500", debit: "25" }, { account: "1000", credit: "25" }] });
  assert.deepEqual([entryChecks(book, again.seq).flags, entryChecks(book, again.seq).sameAs], [["weekend", "duplicate", "no_memo"], [fee.seq]]);
  // An accrual just under a 5,000 approval limit touches no cash, so it waits for no statement line.
  const accrual = post(book, { date: "2026-01-30", memo: "Audit fee accrued", lines: [{ account: "6500", debit: "4990" }, { account: "2000", credit: "4990" }] });
  const onAccrual = entryChecks(book, accrual.seq, { statement, limit: "5000" });
  assert.deepEqual([onAccrual.flags, onAccrual.bank.cash, onAccrual.bank.matched], [["near_limit"], false, null]);
  assert.equal(entryChecks(book, accrual.seq).bank, undefined, "without a statement there is no bank part");
});
