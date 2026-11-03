// mcp-books/src/sign.mjs
//
// A book's head signed with ML-DSA-65 (FIPS 204), a post-quantum signature Node's crypto module makes and
// checks itself. The signature covers the book's name, its record count and its head hash, so it pins the
// whole history: a book cut short or rewritten no longer matches, and records added later need a new
// signature (at each month's close, say). Keys stay with whoever owns the books; nothing here stores one.
import { generateKeyPairSync, sign, verify as checkSignature } from "node:crypto";

import { state, verify } from "./ledger.mjs";

export const ALGORITHM = "ml-dsa-65";

export function newSigningKeys() {
  const { publicKey, privateKey } = generateKeyPairSync(ALGORITHM);
  return { publicKey: publicKey.export({ type: "spki", format: "pem" }), privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) };
}

const statement = (book, checked) => Buffer.from(JSON.stringify({ algorithm: ALGORITHM, book: state(book).name, records: checked.records, head: checked.head }));

export function signHead(book, privateKey) {
  const checked = verify(book);
  if (!checked.ok) throw new Error(`The book does not verify (record ${checked.at}: ${checked.problem}), so its head is not signed`);
  return { algorithm: ALGORITHM, records: checked.records, head: checked.head, signature: sign(null, statement(book, checked), privateKey).toString("base64") };
}

export function checkHead(book, signed, publicKey) {
  const checked = verify(book);
  if (!checked.ok) return { ok: false, problem: `record ${checked.at}: ${checked.problem}` };
  if (signed?.algorithm !== ALGORITHM) return { ok: false, problem: `the signature is ${signed?.algorithm}, not ${ALGORITHM}` };
  if (checked.records !== signed.records || checked.head !== signed.head) return { ok: false, problem: `the signature covers ${signed.records} records and the book now has ${checked.records}, with a different head` };
  const good = checkSignature(null, statement(book, checked), publicKey, Buffer.from(String(signed.signature), "base64"));
  return good ? { ok: true, records: checked.records, head: checked.head } : { ok: false, problem: "the signature does not match this key" };
}
