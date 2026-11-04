// mcp-books/src/sign.mjs
//
// A book's head signed with ML-DSA-65 (FIPS 204), a post-quantum signature Node's crypto module makes and
// checks itself. The signature covers the book's name, its record count, its head hash and the root of the Merkle
// tree over its records (proof.mjs), so it pins the whole history: a book cut short or rewritten no longer
// matches, records added later need a new signature (at each month's close, say), and a single record can be
// proved against the signature without the book. Keys stay with whoever owns the books; nothing here stores one.
import { generateKeyPairSync, sign, verify as checkSignature } from "node:crypto";

import { state, verify } from "./ledger.mjs";
import { bookRoot, checkInclusion } from "./proof.mjs";

export const ALGORITHM = "ml-dsa-65";

export function newSigningKeys() {
  const { publicKey, privateKey } = generateKeyPairSync(ALGORITHM);
  return { publicKey: publicKey.export({ type: "spki", format: "pem" }), privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) };
}

const statement = ({ book, records, head, root }) => Buffer.from(JSON.stringify({ algorithm: ALGORITHM, book, records, head, root }));

export function signHead(book, privateKey) {
  const checked = verify(book);
  if (!checked.ok) throw new Error(`The book does not verify (record ${checked.at}: ${checked.problem}), so its head is not signed`);
  const fields = { book: state(book).name, records: checked.records, head: checked.head, root: bookRoot(book).root };
  return { algorithm: ALGORITHM, ...fields, signature: sign(null, statement(fields), privateKey).toString("base64") };
}

// The signature alone, for someone who holds a proof but not the book.
export function checkSignedHead(signed, publicKey) {
  if (signed?.algorithm !== ALGORITHM) return { ok: false, problem: `the signature is ${signed?.algorithm}, not ${ALGORITHM}` };
  const good = checkSignature(null, statement(signed), publicKey, Buffer.from(String(signed.signature), "base64"));
  return good ? { ok: true, book: signed.book, records: signed.records, head: signed.head, root: signed.root } : { ok: false, problem: "the signature does not match this key" };
}

export function checkHead(book, signed, publicKey) {
  const checked = verify(book);
  if (!checked.ok) return { ok: false, problem: `record ${checked.at}: ${checked.problem}` };
  if (checked.records !== signed?.records || checked.head !== signed?.head || bookRoot(book).root !== signed?.root || state(book).name !== signed?.book) {
    return { ok: false, problem: `the signature covers ${signed?.records} records and the book now has ${checked.records}, with a different head` };
  }
  const good = checkSignedHead(signed, publicKey);
  return good.ok ? { ok: true, records: checked.records, head: checked.head } : good;
}

// A proof from proveRecord checked against the owner's signature: the signature must be good, the proof must be for
// the records it covers, and the record's path must lead to the root it signed.
export function checkProof(proof, signed, publicKey) {
  const good = checkSignedHead(signed, publicKey);
  if (!good.ok) return good;
  if (proof?.size !== signed.records || proof?.root !== signed.root) return { ok: false, problem: `the proof is for ${proof?.size} records and the signature covers ${signed.records}` };
  const included = checkInclusion(proof);
  return included.ok ? { ok: true, book: signed.book, seq: proof.record.seq, records: signed.records } : included;
}
