// Provable entries: every record of a book proves against the Merkle root of the records up to any point, nothing
// altered ever does, the tree of the first n records stays put as the book grows, and a proof checks against the
// owner's ML-DSA-65 signature without the book.
import assert from "node:assert/strict";
import test from "node:test";

import { hashRecord, post, reverse } from "../src/ledger.mjs";
import { bookRoot, checkInclusion, proveRecord } from "../src/proof.mjs";
import { checkHead, checkProof, newSigningKeys, signHead } from "../src/sign.mjs";
import { month, seqsOf } from "./fixture.mjs";

function grown(sales) {
  const book = month();
  for (let i = 1; i <= sales; i++) post(book, { date: "2026-02-02", memo: `Sale ${i}`, lines: [{ account: "1100", debit: String(100 + i) }, { account: "4000", credit: String(100 + i) }] });
  return book;
}

test("every record proves among the first n records of its book, for every n, and an altered one never does", () => {
  const book = grown(10);
  const n = book.records.length;
  for (let size = 1; size <= n; size++) {
    for (let seq = 1; seq <= size; seq++) {
      const proof = proveRecord(book, seq, size);
      assert.equal(checkInclusion(proof).ok, true, `record ${seq} of ${size}`);
      assert.ok(proof.path.length <= Math.ceil(Math.log2(size)), `record ${seq} of ${size}: ${proof.path.length} hashes`);
    }
  }
  const rent = seqsOf(book, "January rent")[0];
  const proof = proveRecord(book, rent);
  const altered = (change) => {
    const copy = structuredClone(proof);
    change(copy);
    return checkInclusion(copy);
  };
  assert.match(altered((p) => (p.record.lines[0].debit += 1)).problem, /does not match its own hash/);
  assert.match(altered((p) => {
    p.record.memo = "January rent, lower";
    p.record.hash = hashRecord(p.record);
  }).problem, /does not lead to the root/, "a record rewritten with a fresh hash is not the one in the book");
  assert.match(altered((p) => (p.record = proveRecord(book, rent - 1).record)).problem, /does not lead to the root/, "another record of the same book does not take its place");
  assert.match(altered((p) => (p.path[0] = `${p.path[0][0] === "0" ? "1" : "0"}${p.path[0].slice(1)}`)).problem, /does not lead to the root/);
  // The size and the root are tied together by the owner's signature (checkProof), as a signed tree head ties them in
  // Certificate Transparency; on its own a proof only refuses a size that cannot hold the record.
  assert.match(altered((p) => (p.size = rent - 1)).problem, /cannot be among/);
  assert.equal(altered((p) => p.path.push(p.path[0])).ok, false);
  assert.throws(() => proveRecord(book, n + 1), /no record/);
  assert.throws(() => proveRecord(book, 1, n + 1), /from 1 to/);
});

test("the tree of a book's first n records does not change as the book grows, so an old proof still checks", () => {
  const book = grown(3);
  const before = bookRoot(book);
  const old = proveRecord(book, seqsOf(book, "Sale 2")[0]);
  post(book, { date: "2026-02-03", memo: "Sale 4", lines: [{ account: "1100", debit: "50" }, { account: "4000", credit: "50" }] });
  reverse(book, seqsOf(book, "Sale 4")[0], { date: "2026-02-04" });
  assert.equal(bookRoot(book, before.size).root, before.root);
  assert.notEqual(bookRoot(book).root, before.root);
  assert.equal(checkInclusion(old).ok, true);
  assert.deepEqual(proveRecord(book, old.record.seq, before.size), old);
});

test("a proof checks against the owner's signature alone, and only for the records it signed", () => {
  const book = grown(2);
  const keys = newSigningKeys();
  const signed = signHead(book, keys.privateKey);
  assert.deepEqual([signed.book, signed.records, signed.root], ["Example Trading LLC", book.records.length, bookRoot(book).root]);
  assert.equal(checkHead(book, signed, keys.publicKey).ok, true);
  const rent = seqsOf(book, "January rent")[0];
  const proof = proveRecord(book, rent, signed.records);
  assert.deepEqual(checkProof(proof, signed, keys.publicKey), { ok: true, book: "Example Trading LLC", seq: rent, records: signed.records });
  assert.match(checkProof(proof, signed, newSigningKeys().publicKey).problem, /does not match this key/);
  assert.match(checkProof(proof, { ...signed, root: bookRoot(grown(1)).root }, keys.publicKey).problem, /does not match this key/, "the root is signed");

  // Records added after signing: the old proof still checks; one for the larger book needs a new signature.
  post(book, { date: "2026-02-05", memo: "Sale 3", lines: [{ account: "1100", debit: "75" }, { account: "4000", credit: "75" }] });
  assert.equal(checkProof(proveRecord(book, rent, signed.records), signed, keys.publicKey).ok, true);
  assert.match(checkProof(proveRecord(book, rent), signed, keys.publicKey).problem, /signature covers/);
  assert.equal(checkHead(book, signed, keys.publicKey).ok, false);
});

test("a book of a thousand records proves an entry with ten hashes", () => {
  const book = grown(1000 - month().records.length);
  assert.equal(book.records.length, 1000);
  const proof = proveRecord(book, 500);
  assert.equal(proof.path.length, 10);
  assert.equal(checkInclusion(proof).ok, true);
});
