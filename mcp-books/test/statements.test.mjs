// Statements handed to a lender's agent: signed together with the book's head, checked with the public key alone,
// refused when a figure or the key is wrong, still good when the file comes back with its keys in another order,
// and any entry behind them provable against the head signed inside.
import assert from "node:assert/strict";
import { sign } from "node:crypto";
import test from "node:test";

import { canonical } from "../src/ledger.mjs";
import { proveRecord } from "../src/proof.mjs";
import { checkProof, checkStatements, newSigningKeys, signStatements } from "../src/sign.mjs";
import { month, seqsOf } from "./fixture.mjs";

const reverseKeys = (v) => (Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v);

test("statements signed with the book's head check with the public key alone, and nothing in them can change", () => {
  const book = month();
  const keys = newSigningKeys();
  const pkg = signStatements(book, { from: "2026-01-01", to: "2026-01-31" }, keys.privateKey);
  assert.deepEqual([pkg.income_statement.netIncome, pkg.balance_sheet.totalAssets, pkg.balance_sheet.asOf], [-200000, 4805000, "2026-01-31"]);
  const checked = checkStatements(pkg, keys.publicKey);
  assert.deepEqual([checked.ok, checked.adds_up, checked.book, checked.records, checked.period], [true, true, "Example Trading LLC", book.records.length, { from: "2026-01-01", to: "2026-01-31", as_of: "2026-01-31" }]);
  assert.equal(checkStatements(reverseKeys(JSON.parse(JSON.stringify(pkg))), keys.publicKey).ok, true, "another program's key order does not matter");
  const forged = structuredClone(pkg);
  forged.income_statement.netIncome = 900000;
  assert.match(checkStatements(forged, keys.publicKey).problem, /changed after it was signed/);
  const swapped = structuredClone(pkg);
  swapped.signed_head.records += 1;
  assert.equal(checkStatements(swapped, keys.publicKey).ok, false, "the head inside is covered too");
  assert.match(checkStatements(pkg, newSigningKeys().publicKey).problem, /does not match this key/);
  assert.match(checkStatements({ kind: "something else" }, keys.publicKey).problem, /not a canli\.statements\.v1 package/);
  // A file signed as it is whose own figures do not add up (a program with an arithmetic slip, say) checks as
  // signed and says it does not add up.
  const { algorithm, signature: _signature, ...fields } = structuredClone(pkg);
  fields.income_statement.netIncome += 100;
  const slip = { algorithm, ...fields, signature: sign(null, Buffer.from(canonical(fields)), keys.privateKey).toString("base64") };
  assert.deepEqual([checkStatements(slip, keys.publicKey).ok, checkStatements(slip, keys.publicKey).adds_up], [true, false]);
  const sheet = structuredClone(pkg);
  delete sheet.signature;
  const { algorithm: _a, ...rest } = sheet;
  rest.balance_sheet.totalAssets += 1;
  assert.equal(checkStatements({ algorithm, ...rest, signature: sign(null, Buffer.from(canonical(rest)), keys.privateKey).toString("base64") }, keys.publicKey).adds_up, false, "a balance sheet that does not balance");
  // The rent behind the expenses, shown to the lender as a proof against the head in the same package.
  const [rent] = seqsOf(book, "January rent");
  assert.equal(checkProof(proveRecord(book, rent, pkg.records), pkg.signed_head, keys.publicKey).ok, true);
});
