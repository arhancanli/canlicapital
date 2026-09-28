// =============================================================================
// trade-journal-core.js
// -----------------------------------------------------------------------------
// canli.trade-journal.v0 (standards/trade-journal/README.md): an append-only file of signed,
// hash-chained entries recording what a trading process decided, checked, sent and filled.
// Writing and verifying, with node:crypto only. canli-execution-mcp's journal tool uses it, and
// validation will use it to check a paper-evidence record against the journal behind it.
//
// Each line is {"entry":ENTRY,"sig":"SIG"}: ENTRY is canonical JSON, SIG is Ed25519 over ENTRY's
// exact bytes, and each entry's prev is the sha256 of the previous line's exact bytes. So a
// verifier never re-serialises a number to check a signature or the chain; it re-serialises only to
// confirm that ENTRY was written canonically.
//
// scripts/research/trade-journal/verify_journal.py is a second verifier, written in Python from the
// standard alone; the tests require both to agree on every vector and on 1,000 corrupted journals.
// =============================================================================

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

import { canonicalJson } from "../scripts/canonical-json.mjs";

export const JOURNAL_SCHEMA = "canli.trade-journal.v0";
export const KINDS = Object.freeze(["config", "decision", "check", "order", "ack", "fill", "cancel", "reconcile", "mark", "correction"]);
export const REASONS = Object.freeze(["encoding", "shape", "canonical", "version", "seq", "prev", "ts", "kind", "payload", "signature"]);

const PREFIX = '{"entry":';
const SIG_MARK = ',"sig":"';
const MEMBERS = ["kind", "payload", "prev", "seq", "ts", "v"];
const TS_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
// Ed25519 keys as DER: this fixed prefix, then the 32 raw bytes (RFC 8410).
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** A new journal key: the private key as PKCS#8 PEM (for a 0600 file) and the public key as base64. */
export function generateJournalKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privatePem: privateKey.export({ type: "pkcs8", format: "pem" }), publicKey: publicKeyBase64(publicKey) };
}

/** The raw 32-byte public key, standard base64, for any Ed25519 key object or PEM. */
export function publicKeyBase64(key) {
  const pub = typeof key === "string" ? createPublicKey(createPrivateKey(key)) : key.type === "private" ? createPublicKey(key) : key;
  return Buffer.from(pub.export({ type: "spki", format: "der" }).subarray(SPKI_PREFIX.length)).toString("base64");
}

function publicKeyFromBase64(b64) {
  const raw = Buffer.from(b64, "base64");
  if (!BASE64.test(b64) || raw.length !== 32 || raw.toString("base64") !== b64) return null;
  try {
    return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
  } catch {
    return null;
  }
}

// ASCII member names, and every number finite and below 1e15 in magnitude: the ranges in which the
// canonical form is the same in JavaScript and Python.
function valuesOk(value) {
  if (Array.isArray(value)) return value.every(valuesOk);
  if (value && typeof value === "object") return Object.entries(value).every(([k, v]) => /^[\x00-\x7f]*$/.test(k) && valuesOk(v));
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) < 1e15;
  return true;
}

const positive = (x) => typeof x === "number" && x > 0;
const has = (p, k) => Object.hasOwn(p, k);

function payloadOk(kind, p, seq) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  switch (kind) {
    case "config":
      return seq === 0 ? typeof p.journal_key === "string" && publicKeyFromBase64(p.journal_key) !== null : typeof p.limits_digest === "string" && DIGEST.test(p.limits_digest);
    case "decision":
      return has(p, "decision_id");
    case "check":
      return has(p, "decision_seq") && has(p, "limits_digest") && has(p, "result_sha256");
    case "order":
      return has(p, "client_order_id") && has(p, "symbol") && has(p, "venue") && ["buy", "sell"].includes(p.side) && positive(p.qty) && ["market", "limit"].includes(p.type);
    case "ack":
      return has(p, "client_order_id") && has(p, "status");
    case "fill":
      return has(p, "client_order_id") && has(p, "symbol") && ["buy", "sell"].includes(p.side) && positive(p.qty) && positive(p.price);
    case "cancel":
      return has(p, "client_order_id") || p.all === true;
    case "reconcile":
      return ["AGREE", "DIVERGENT", "ORPHAN", "MISSING"].includes(p.status);
    case "mark":
      return !!p.marks && typeof p.marks === "object" && !Array.isArray(p.marks) && Object.values(p.marks).every(positive) && has(p, "source");
    case "correction":
      return Number.isInteger(p.corrects_seq) && p.corrects_seq >= 0 && p.corrects_seq < seq && has(p, "reason");
    default:
      return false;
  }
}

/** The line for one entry: canonical ENTRY, signed with the journal's private key. */
export function signLine(entry, privateKey) {
  if (!valuesOk(entry)) throw new RangeError("a journal entry takes ASCII member names and finite numbers below 1e15 in magnitude");
  const bytes = canonicalJson(entry);
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  const sig = sign(null, Buffer.from(bytes, "utf8"), key).toString("base64");
  return `${PREFIX}${bytes}${SIG_MARK}${sig}"}`;
}

/** The first line of a new journal: a config entry that names the signing key. */
export function genesisLine({ privateKey, ts, payload = {} }) {
  return signLine({ v: 1, seq: 0, ts, kind: "config", payload: { ...payload, journal_key: publicKeyBase64(privateKey) }, prev: null }, privateKey);
}

/** The next line after `last` (the previous line's text, without its newline). */
export function nextLine({ last, kind, payload, ts, privateKey }) {
  const prevEntry = JSON.parse(last.slice(PREFIX.length, last.lastIndexOf(SIG_MARK)));
  if (ts < prevEntry.ts) throw new RangeError("a journal's ts cannot go backwards");
  return signLine({ v: 1, seq: prevEntry.seq + 1, ts, kind, payload, prev: sha256(Buffer.from(last, "utf8")) }, privateKey);
}

class Bad extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function checkLine(raw, n, prevLine, prevTs, key) {
  const text = raw.toString("utf8");
  if (!text.startsWith(PREFIX) || !text.endsWith('"}')) throw new Bad("shape");
  const cut = text.lastIndexOf(SIG_MARK);
  if (cut < PREFIX.length) throw new Bad("shape");
  const entryText = text.slice(PREFIX.length, cut);
  const sigText = text.slice(cut + SIG_MARK.length, -2);
  let entry;
  try {
    entry = JSON.parse(entryText);
  } catch {
    throw new Bad("shape");
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join() !== MEMBERS.join()) throw new Bad("shape");
  let canonical;
  try {
    canonical = valuesOk(entry) ? canonicalJson(entry) : null;
  } catch {
    canonical = null;
  }
  if (canonical !== entryText) throw new Bad("canonical");
  if (entry.v !== 1) throw new Bad("version");
  if (entry.seq !== n) throw new Bad("seq");
  if (entry.prev !== (n === 0 ? null : sha256(prevLine))) throw new Bad("prev");
  const ts = entry.ts;
  // The form, a year from 0001 (as in Python's datetime), and a real calendar time (JavaScript's
  // parser rolls 31 September over to 1 October, so the time must print back unchanged).
  if (typeof ts !== "string" || !TS_FORM.test(ts) || ts.startsWith("0000") || Number.isNaN(Date.parse(ts)) || new Date(ts).toISOString() !== ts) throw new Bad("ts");
  if (prevTs !== null && ts < prevTs) throw new Bad("ts");
  if (!KINDS.includes(entry.kind) || (n === 0 && entry.kind !== "config")) throw new Bad("kind");
  if (!payloadOk(entry.kind, entry.payload, n)) throw new Bad("payload");
  const signer = n === 0 ? publicKeyFromBase64(entry.payload.journal_key) : key;
  const sig = Buffer.from(sigText, "base64");
  if (!BASE64.test(sigText) || sig.length !== 64 || sig.toString("base64") !== sigText) throw new Bad("signature");
  if (!verify(null, Buffer.from(entryText, "utf8"), signer, sig)) throw new Bad("signature");
  return { ts, key: signer };
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Verify a journal's bytes: {valid, entries, first_bad_line, reason, head}, as the standard states. */
export function verifyJournal(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const fail = (n, reason) => ({ valid: false, entries: n, first_bad_line: n, reason, head: null });
  if (!bytes.length) return fail(0, "encoding");
  const lines = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0a) { lines.push(bytes.subarray(start, i)); start = i + 1; }
  }
  const endsWithNewline = start === bytes.length;
  if (!endsWithNewline) lines.push(bytes.subarray(start));
  let prevLine = null;
  let prevTs = null;
  let key = null;
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n];
    const last = n === lines.length - 1;
    try {
      utf8.decode(raw);
    } catch {
      return fail(n, "encoding");
    }
    if (raw.includes(0x0d) || raw.length === 0 || (last && !endsWithNewline)) return fail(n, "encoding");
    try {
      ({ ts: prevTs, key } = checkLine(raw, n, prevLine, prevTs, key));
    } catch (error) {
      if (error instanceof Bad) return fail(n, error.code);
      throw error;
    }
    prevLine = raw;
  }
  return { valid: true, entries: lines.length, first_bad_line: null, reason: null, head: sha256(prevLine) };
}

/** The head of a journal's text, without verifying it: the last line's hash, its seq and ts. */
export function journalHead(data) {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  const lines = text.split("\n").filter((l) => l.length);
  if (!lines.length) return null;
  const last = lines.at(-1);
  const entry = JSON.parse(last.slice(PREFIX.length, last.lastIndexOf(SIG_MARK)));
  return { seq: entry.seq, ts: entry.ts, head: sha256(Buffer.from(last, "utf8")), entries: lines.length };
}
