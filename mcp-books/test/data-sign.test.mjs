// Canli Data packs a table with its card and checksum; a book's head signed with ML-DSA-65 pins its history.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { packDataset } from "../src/data.mjs";
import { post } from "../src/ledger.mjs";
import { checkHead, newSigningKeys, signHead } from "../src/sign.mjs";
import { month } from "./fixture.mjs";

const spec = {
  name: "example-notes",
  title: "Example notes",
  description: "Two rows to show the format.",
  source: "https://canlicapital.com",
  license: "cc0-1.0",
  columns: [{ name: "date", description: "The day" }, { name: "note", description: "Free text, with | and commas" }],
  rows: [{ date: "2026-01-02", note: 'He said "hi", twice' }, { date: "2026-01-03", note: "plain" }],
};

test("a dataset is packed with its card, its checksum and its source", () => {
  const pack = packDataset(spec);
  assert.equal(pack.csv, 'date,note\n2026-01-02,"He said ""hi"", twice"\n2026-01-03,plain\n');
  assert.equal(pack.sha256, createHash("sha256").update(pack.csv).digest("hex"));
  assert.match(pack.card, /^---\nlicense: cc0-1\.0\n/);
  assert.ok(pack.card.includes(`2 rows in data.csv, SHA-256 ${pack.sha256}.`));
  assert.ok(pack.card.includes("| note | Free text, with \\| and commas |"));
  assert.throws(() => packDataset({ ...spec, rows: [{ date: "2026-01-04" }] }), /Row 1 has no note/);
  assert.throws(() => packDataset({ ...spec, source: "" }), /source/);
  assert.throws(() => packDataset({ ...spec, name: "Example Notes" }), /dataset id/);
});

test("a head signed with ML-DSA-65 checks out, and stops checking out when the book changes", () => {
  const book = month();
  const keys = newSigningKeys();
  const signed = signHead(book, keys.privateKey);
  assert.equal(signed.algorithm, "ml-dsa-65");
  assert.equal(checkHead(book, signed, keys.publicKey).ok, true);
  assert.equal(checkHead(book, signed, newSigningKeys().publicKey).ok, false, "another key does not pass");
  const flipped = { ...signed, signature: `${signed.signature[0] === "A" ? "B" : "A"}${signed.signature.slice(1)}` };
  assert.match(checkHead(book, flipped, keys.publicKey).problem, /does not match/);
  post(book, { date: "2026-01-31", memo: "Bank fee", lines: [{ account: "6500", debit: "25" }, { account: "1000", credit: "25" }] });
  assert.match(checkHead(book, signed, keys.publicKey).problem, /now has/);
});
