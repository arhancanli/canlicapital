// mcp-books/src/proof.mjs
//
// Provable entries: one record of a book shown to a lender, an auditor or a buyer with a short proof that it is in
// the book, without handing over the book. The record hashes are the leaves of a Merkle tree built the way
// Certificate Transparency builds its logs (RFC 9162: SHA-256, 0x00 before a leaf, 0x01 before two children), so
// the tree of a book's first n records never changes as the book grows. A proof is the record and about log2(n)
// hashes, twenty for a million records, and those hashes say nothing about the other records. The root is what
// the owner signs (sign.mjs), so a proof can be checked against the signature alone.
import { createHash } from "node:crypto";

import { hashRecord, verify } from "./ledger.mjs";

const sha = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const leaf = (recordHash) => sha(Buffer.from([0]), Buffer.from(recordHash, "hex"));
const node = (left, right) => sha(Buffer.from([1]), left, right);

// The largest power of two smaller than n (n >= 2).
function split(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function root(leaves) {
  if (leaves.length === 1) return leaves[0];
  const k = split(leaves.length);
  return node(root(leaves.slice(0, k)), root(leaves.slice(k)));
}

// The sibling hashes from leaf m up to the root (RFC 9162, section 2.1.3.1).
function path(m, leaves) {
  if (leaves.length === 1) return [];
  const k = split(leaves.length);
  return m < k ? [...path(m, leaves.slice(0, k)), root(leaves.slice(k))] : [...path(m - k, leaves.slice(k)), root(leaves.slice(0, k))];
}

function firstRecords(book, size) {
  const n = book.records.length;
  if (!Number.isInteger(size) || size < 1 || size > n) throw new Error(`The size must be a whole number from 1 to ${n}, the records in this book`);
  return book.records.slice(0, size).map((r) => leaf(r.hash));
}

// The root of the tree over the book's first `size` records (all of them by default).
export function bookRoot(book, size = book.records.length) {
  return { size, root: root(firstRecords(book, size)).toString("hex") };
}

// A proof that record `seq` is among the book's first `size` records.
export function proveRecord(book, seq, size = book.records.length) {
  const checked = verify(book);
  if (!checked.ok) throw new Error(`The book does not verify (record ${checked.at}: ${checked.problem}), so nothing in it is proved`);
  const leaves = firstRecords(book, size);
  if (!Number.isInteger(seq) || seq < 1 || seq > size) throw new Error(`There is no record ${seq} among the first ${size}`);
  return { record: book.records[seq - 1], size, path: path(seq - 1, leaves).map((h) => h.toString("hex")), root: root(leaves).toString("hex") };
}

// Checks a proof on its own (RFC 9162, section 2.1.3.2): the record must match its hash, sit where its number says,
// and its path must lead to the root. Whether that root is the owner's is for the signature (sign.mjs).
export function checkInclusion(proof) {
  const { record, size, path: hashes, root: expected } = proof ?? {};
  if (!record || typeof record !== "object" || hashRecord(record) !== record.hash) return { ok: false, problem: "the record does not match its own hash" };
  const index = record.seq - 1;
  if (!Number.isInteger(size) || !Number.isInteger(index) || index < 0 || index >= size) return { ok: false, problem: `record ${record.seq} cannot be among ${size} records` };
  if (!Array.isArray(hashes) || hashes.some((h) => !/^[0-9a-f]{64}$/.test(h))) return { ok: false, problem: "the path is not a list of SHA-256 hashes" };
  let fn = index;
  let sn = size - 1;
  let r = leaf(record.hash);
  for (const h of hashes) {
    if (sn === 0) return { ok: false, problem: "the path is longer than the tree" };
    const p = Buffer.from(h, "hex");
    if (fn % 2 === 1 || fn === sn) {
      r = node(p, r);
      while (fn % 2 === 0 && fn !== 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else r = node(r, p);
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  if (sn !== 0 || r.toString("hex") !== expected) return { ok: false, problem: "the path does not lead to the root" };
  return { ok: true, seq: record.seq, size, root: expected };
}
