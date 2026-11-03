// Canli Close on the fixture month: a bank statement matched to the books (rent cleared two days late, a bank
// fee the books did not have yet), what moved from January to February, and the checklist before locking.
import assert from "node:assert/strict";
import test from "node:test";

import { checklist, parseCsv, readStatement, reconcile, variance } from "../src/close.mjs";
import { lock, post } from "../src/ledger.mjs";
import { month } from "./fixture.mjs";

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
