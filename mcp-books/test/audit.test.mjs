// Canli Audit: Benford's law on amounts that follow it and on amounts that cannot, and journal-entry tests on
// the fixture month plus a duplicated purchase just under a 5,000 approval limit and an entry with no memo.
import assert from "node:assert/strict";
import test from "node:test";

import { benford, journalTests } from "../src/audit.mjs";
import { post, reverse } from "../src/ledger.mjs";
import { month, seqsOf } from "./fixture.mjs";

test("Benford's law: amounts spread over whole decades conform, amounts that all start with 5 do not", () => {
  const spread = benford(Array.from({ length: 2000 }, (_, i) => Math.round(1000 * 10 ** (i / 250))));
  assert.equal(spread.band, "close conformity");
  assert.equal(spread.enough, true);
  const narrow = benford(Array.from({ length: 1000 }, (_, i) => 5000 + (i % 900)));
  assert.equal(narrow.band, "nonconformity");
  assert.deepEqual([benford([]).n, benford([]).band], [0, "no amounts"]);
  assert.equal(benford([1, 2, 3]).enough, false);
});

test("journal-entry tests point at the entries worth a look", () => {
  const book = month();
  const purchase = { date: "2026-01-20", memo: "Supplies", lines: [{ account: "6300", debit: "4990" }, { account: "1000", credit: "4990" }] };
  post(book, purchase);
  post(book, purchase);
  post(book, { date: "2026-01-21", lines: [{ account: "6200", debit: "120" }, { account: "1000", credit: "120" }] });
  const [rent] = seqsOf(book, "January rent");
  reverse(book, rent, { date: "2026-01-22" });
  const t = journalTests(book, { limit: "5000" });
  assert.deepEqual(t.weekend, seqsOf(book, "Invoice 1, with VAT at 5%"), "10 January 2026 is a Saturday");
  assert.deepEqual(t.round, [...seqsOf(book, "Share capital paid in"), rent]);
  assert.deepEqual(t.duplicates, [seqsOf(book, "Supplies")]);
  assert.deepEqual(t.nearLimit, seqsOf(book, "Supplies"));
  assert.equal(t.noMemo.length, 1);
  assert.deepEqual(t.reversed, [rent]);
  assert.equal(t.entries, 6, "the reversal itself is not tested again");
});
