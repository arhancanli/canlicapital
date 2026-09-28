// Deterministic journals for canli.trade-journal.v0: the named vectors in standards/trade-journal/
// vectors (one valid journal and one invalid journal per failure the standard names), and 1,000
// random journals each with one byte flipped. The key is derived from a fixed seed and Ed25519
// signatures are deterministic, so every byte here is reproducible.
//
//   node scripts/research/trade-journal/corpus.mjs vectors            # rewrite the named vectors
//   node scripts/research/trade-journal/corpus.mjs corrupted <dir>    # write the 1,000 corrupted journals
import { createHash, createPrivateKey } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { genesisLine, nextLine, signLine } from "../../../js/trade-journal-core.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

/** An Ed25519 private key from a text seed (sha256 of the text is the 32-byte seed). */
export function keyFromSeed(text) {
  const seed = createHash("sha256").update(text).digest();
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
}

export const KEY = keyFromSeed("canli.trade-journal.v0 vectors");
export const OTHER_KEY = keyFromSeed("canli.trade-journal.v0 another key");

const T0 = Date.parse("2026-09-28T13:30:00.000Z");
const at = (ms) => new Date(T0 + ms).toISOString();

// A small paper-trading session, one entry of each kind.
export const SESSION = [
  ["decision", { decision_id: "d-1", strategy_id: "demo", note: "rebalance" }],
  ["check", { decision_seq: 1, limits_digest: `sha256:${"a".repeat(64)}`, result_sha256: `sha256:${"b".repeat(64)}`, accepted: 2, rejected: 0 }],
  ["order", { client_order_id: "cx-1", symbol: "AAPL", side: "buy", qty: 10, type: "limit", limit_price: 227.5, tif: "day", venue: "alpaca_paper", arrival: { bid: 227.41, ask: 227.46, mid: 227.435, feed: "iex" } }],
  ["ack", { client_order_id: "cx-1", broker_order_id: "b-9", status: "accepted" }],
  ["fill", { client_order_id: "cx-1", symbol: "AAPL", side: "buy", qty: 10, price: 227.44, fee: 0, filled_at: "2026-09-28T13:30:02.118Z" }],
  ["mark", { marks: { AAPL: 228.01 }, equity: 100005.7, source: "iex close" }],
  ["cancel", { all: true }],
  ["reconcile", { status: "AGREE", orders: 1, fills: 1 }],
  ["config", { limits_digest: `sha256:${"c".repeat(64)}` }],
  ["correction", { corrects_seq: 5, reason: "the fill price was 227.43 at the broker", replacement: { price: 227.43 } }],
];

/** Lines (without newlines) of a journal of the given entries, one second apart. */
export function journalLines(entries = SESSION, key = KEY) {
  const lines = [genesisLine({ privateKey: key, ts: at(0), payload: { limits_digest: `sha256:${"a".repeat(64)}`, software: "canli-execution-mcp" } })];
  entries.forEach(([kind, payload], i) => lines.push(nextLine({ last: lines.at(-1), kind, payload, ts: at(1000 * (i + 1)), privateKey: key })));
  return lines;
}

const text = (lines) => `${lines.join("\n")}\n`;
const entryOf = (line) => JSON.parse(line.slice('{"entry":'.length, line.lastIndexOf(',"sig":"')));
const resign = (entry, key = KEY) => signLine(entry, key);
// Replace line i's entry by a changed copy, re-signed, so the named defect is the only one.
function withEntry(lines, i, change) {
  const out = [...lines];
  const e = entryOf(out[i]);
  change(e);
  out[i] = resign(e);
  return out;
}
// Re-chain every line after i to its new predecessor, so a defect at i is not also a prev defect later.
function rechain(lines, from) {
  const out = [...lines];
  for (let i = Math.max(1, from); i < out.length; i += 1) {
    const e = entryOf(out[i]);
    e.prev = `sha256:${createHash("sha256").update(out[i - 1]).digest("hex")}`;
    out[i] = resign(e);
  }
  return out;
}

/** The named vectors: [name, bytes, expected {valid, first_bad_line, reason}, why]. */
export function vectors() {
  const L = journalLines();
  const v = [];
  const add = (name, data, first, reason, why) => v.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data), expect: first === null ? { valid: true, first_bad_line: null, reason: null } : { valid: false, first_bad_line: first, reason }, why });
  add("valid-paper-session", text(L), null, null, "A paper session with one entry of every kind; every verifier accepts it.");
  add("valid-genesis-only", text(L.slice(0, 1)), null, null, "A journal can be just its first line.");
  add("invalid-empty-file", "", 0, "encoding", "A journal has at least its first line.");
  add("invalid-no-final-newline", text(L).slice(0, -1), L.length - 1, "encoding", "Every line ends in a newline, so a truncated write is visible.");
  add("invalid-crlf", text(L).replace(/\n/g, "\r\n"), 0, "encoding", "Line ends are LF only.");
  add("invalid-blank-line", text([L[0], "", ...L.slice(1)]), 1, "encoding", "A blank line is not an entry.");
  add("invalid-not-utf8", Buffer.concat([Buffer.from(`${L[0]}\n`), Buffer.from([0xff, 0xfe]), Buffer.from(`${L[1]}\n`)]), 1, "encoding", "The file is UTF-8.");
  add("invalid-extra-line-member", text([L[0], L[1].replace(',"sig":"', ',"x":1,"sig":"'), ...L.slice(2)]), 1, "shape", "A line holds exactly entry and sig.");
  add("invalid-entry-missing-member", text(withEntry(L, 2, (e) => { delete e.ts; })), 2, "shape", "An entry has exactly its six members.");
  add("invalid-unsorted-members", text([...L.slice(0, 3), L[3].replace('{"entry":{"kind"', '{"entry":{"v":1,"kind"').replace(',"v":1}', "}"), ...L.slice(4)]), 3, "canonical", "Members are sorted, so the signed bytes are fixed.");
  add("invalid-integral-float", text([...L.slice(0, 5), L[5].replace('"qty":10,', '"qty":10.0,'), ...L.slice(6)]), 5, "canonical", "An integral number is written as digits: 10, not 10.0.");
  add("invalid-whitespace", text([...L.slice(0, 1), L[1].replace('"kind":"decision"', '"kind": "decision"'), ...L.slice(2)]), 1, "canonical", "No whitespace outside strings.");
  add("invalid-raw-non-ascii", text(withEntry(L, 1, (e) => { e.payload.note = "café"; }).map((l, i) => (i === 1 ? l.replace("caf\\u00e9", "café") : l))), 1, "canonical", "Characters above U+007F are escaped.");
  // The writer refuses 1e15, so the number is edited into a line signed with a smaller one.
  add("invalid-number-too-large", text(rechain(withEntry(L, 6, (e) => { e.payload.equity = 999999999999999; }), 7)).replace('"equity":999999999999999', '"equity":1000000000000000'), 6, "canonical", "Numbers stay below 1e15, where every language writes them the same way.");
  add("invalid-version", text(rechain(withEntry(L, 2, (e) => { e.v = 2; }), 3)), 2, "version", "v is 1.");
  add("invalid-seq-skipped", text(rechain(withEntry(L, 4, (e) => { e.seq = 5; }), 5)), 4, "seq", "seq counts lines from 0.");
  add("invalid-prev-wrong", text(withEntry(L, 3, (e) => { e.prev = `sha256:${"0".repeat(64)}`; })), 3, "prev", "prev is the hash of the line before.");
  add("invalid-dropped-line", text([...L.slice(0, 4), ...L.slice(5)]), 4, "seq", "A dropped line leaves a gap in seq.");
  add("invalid-reordered-lines", text([...L.slice(0, 3), L[4], L[3], ...L.slice(5)]), 3, "seq", "Reordered lines break seq.");
  add("invalid-inserted-line", text([...L.slice(0, 3), resign({ ...entryOf(L[3]), payload: { decision_id: "d-x" }, kind: "decision" }), ...L.slice(3)]), 4, "seq", "An inserted line shifts every seq after it.");
  add("invalid-ts-backwards", text(rechain(withEntry(L, 5, (e) => { e.ts = at(500); }), 6)), 5, "ts", "ts never goes backwards.");
  add("invalid-ts-form", text(rechain(withEntry(L, 2, (e) => { e.ts = "2026-09-28T13:30:02Z"; }), 3)), 2, "ts", "ts has milliseconds: exactly 24 characters.");
  // Later than line 0, so only the calendar check can catch them (JavaScript's parser rolls both over).
  add("invalid-ts-impossible-date", text(rechain(withEntry(L.slice(0, 2), 1, (e) => { e.ts = "2026-09-31T00:00:00.000Z"; }), 2)), 1, "ts", "ts is a real calendar time: there is no 31 September.");
  add("invalid-ts-hour-24", text(rechain(withEntry(L.slice(0, 2), 1, (e) => { e.ts = "2026-09-28T24:00:00.000Z"; }), 2)), 1, "ts", "Hours run 00 to 23.");
  // On line 0, with no earlier line to be compared with, only the form can catch it.
  add("invalid-ts-extended-year", text([resign({ ...entryOf(L[0]), ts: "+010000-01-01T00:00:00.000Z" })]), 0, "ts", "ts is exactly 24 characters, which also keeps text order equal to time order.");
  add("invalid-ts-year-zero", text([resign({ ...entryOf(L[0]), ts: "0000-01-01T00:00:00.000Z" })]), 0, "ts", "Years start at 0001.");
  add("invalid-first-line-prev", text([resign({ ...entryOf(L[0]), prev: `sha256:${"0".repeat(64)}` })]), 0, "prev", "Line 0 has no previous line: its prev is null.");
  add("invalid-unknown-kind", text(rechain(withEntry(L, 1, (e) => { e.kind = "note"; }), 2)), 1, "kind", "Only the ten kinds.");
  add("invalid-first-line-not-config", text([resign({ ...entryOf(L[1]), seq: 0, prev: null })]), 0, "kind", "Line 0 is the config that names the key.");
  add("invalid-order-without-qty", text(rechain(withEntry(L, 3, (e) => { delete e.payload.qty; }), 4)), 3, "payload", "An order states its quantity.");
  add("invalid-mark-zero-price", text(rechain(withEntry(L, 6, (e) => { e.payload.marks.AAPL = 0; }), 7)), 6, "payload", "A mark is a price above 0.");
  add("invalid-correction-of-a-later-line", text(rechain(withEntry(L, 10, (e) => { e.payload.corrects_seq = 10; }), 11)), 10, "payload", "A correction corrects an earlier line.");
  add("invalid-genesis-bad-key", text([resign({ ...entryOf(L[0]), payload: { journal_key: "not a key" } })]), 0, "payload", "Line 0 names a 32-byte Ed25519 key.");
  add("invalid-signed-by-another-key", text([L[0], resign(entryOf(L[1]), OTHER_KEY), ...L.slice(2)]), 1, "signature", "Every line is signed by the key from line 0.");
  add("invalid-edited-after-signing", text([...L.slice(0, 5), L[5].replace('"price":227.44', '"price":227.04'), ...L.slice(6)]), 5, "signature", "Changing a signed entry breaks its signature.");
  add("invalid-signature-not-64-bytes", text([L[0], L[1].replace(/,"sig":"[^"]+"}$/, ',"sig":"AAAA"}'), ...L.slice(2)]), 1, "signature", "SIG is 64 bytes of base64.");
  return v;
}

// A seeded generator, so the corrupted corpus is the same on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 1,000 random journals, each with one byte XORed by a random non-zero mask: [name, bytes, flippedLine]. */
export function corrupted(count = 1000, seed = 20261001) {
  const r = rng(seed);
  const out = [];
  for (let n = 0; n < count; n += 1) {
    const entries = Array.from({ length: 1 + Math.floor(r() * 30) }, () => SESSION[Math.floor(r() * 8)]);
    const bytes = Buffer.from(text(journalLines(entries)));
    const pos = Math.floor(r() * bytes.length);
    bytes[pos] ^= 1 + Math.floor(r() * 255);
    let line = 0;
    for (let i = 0; i < pos; i += 1) if (bytes[i] === 0x0a) line += 1;
    out.push({ name: `corrupted-${String(n).padStart(4, "0")}.jsonl`, bytes, line });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "vectors") {
    const dir = join(ROOT, "standards/trade-journal/vectors");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const all = vectors();
    for (const x of all) writeFileSync(join(dir, `${x.name}.jsonl`), x.data);
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify({ schema: "canli.trade-journal.v0", vectors: all.map((x) => ({ name: x.name, ...x.expect, why: x.why })) }, null, 2)}\n`);
    console.log(`wrote ${all.length} vectors`);
  } else if (process.argv[2] === "corrupted") {
    const dir = process.argv[3];
    mkdirSync(dir, { recursive: true });
    for (const c of corrupted()) writeFileSync(join(dir, c.name), c.bytes);
    console.log(`wrote 1000 corrupted journals to ${dir}`);
  }
}
