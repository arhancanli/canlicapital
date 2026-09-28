// js/trade-journal-core.test.js
// The trade journal against its standard (standards/trade-journal/README.md): the named vectors, a
// second verifier written in Python from the standard alone (its verdicts recorded by
// scripts/research/trade-journal/verify_journal.py --record), and 1,000 journals each with one
// byte flipped, which must fail at the line that holds the flipped byte.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { corrupted, journalLines, KEY, vectors } from "../scripts/research/trade-journal/corpus.mjs";
import { generateJournalKey, genesisLine, journalHead, nextLine, REASONS, signLine, verifyJournal } from "./trade-journal-core.js";

const VECTORS = new URL("../standards/trade-journal/vectors/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("manifest.json", VECTORS), "utf8"));
const PYTHON = JSON.parse(gunzipSync(readFileSync(new URL("../mcp-execution/test/fixtures/trade-journal-python-verdicts.json.gz", import.meta.url))).toString("utf8"));
const verdict = (r) => [r.valid, r.first_bad_line, r.reason];

test("every named vector gets its stated verdict, here and from the Python verifier", () => {
  const files = readdirSync(VECTORS).filter((f) => f.endsWith(".jsonl")).sort();
  assert.deepEqual(files, MANIFEST.vectors.map((v) => `${v.name}.jsonl`).sort(), "the manifest lists every vector file");
  for (const v of MANIFEST.vectors) {
    const want = [v.valid, v.first_bad_line, v.reason];
    assert.deepEqual(verdict(verifyJournal(readFileSync(new URL(`${v.name}.jsonl`, VECTORS)))), want, v.name);
    assert.deepEqual(verdict(PYTHON.vectors[`${v.name}.jsonl`]), want, `${v.name} (Python)`);
  }
  const reasons = new Set(MANIFEST.vectors.map((v) => v.reason).filter(Boolean));
  assert.deepEqual([...reasons].sort(), [...REASONS].sort(), "a vector exercises every reason code");
});

test("the vector files are exactly what the corpus script writes", () => {
  for (const v of vectors()) assert.ok(readFileSync(new URL(`${v.name}.jsonl`, VECTORS)).equals(v.data), `${v.name}: run node scripts/research/trade-journal/corpus.mjs vectors`);
});

test("1,000 journals with one flipped byte: each fails at that line, and both verifiers agree", () => {
  const all = corrupted();
  assert.equal(Object.keys(PYTHON.corrupted).length, 1000);
  const reasons = {};
  for (const c of all) {
    const js = verifyJournal(c.bytes);
    assert.equal(js.valid, false, c.name);
    assert.equal(js.first_bad_line, c.line, `${c.name}: the flipped byte is on line ${c.line}`);
    assert.deepEqual(verdict(js), verdict(PYTHON.corrupted[c.name]), `${c.name}: JavaScript and Python differ`);
    reasons[js.reason] = (reasons[js.reason] ?? 0) + 1;
  }
  for (const r of ["encoding", "shape", "signature", "prev", "ts", "payload"]) assert.ok(reasons[r] > 0, `the corpus reaches ${r}`);
});

test("a journal written here verifies; the head is the last line's hash", () => {
  const { privatePem, publicKey } = generateJournalKey();
  const lines = [genesisLine({ privateKey: privatePem, ts: "2026-09-28T14:00:00.000Z", payload: { limits_digest: `sha256:${"1".repeat(64)}` } })];
  lines.push(nextLine({ last: lines[0], kind: "decision", payload: { decision_id: "d", note: "café \u007f" }, ts: "2026-09-28T14:00:00.000Z", privateKey: privatePem }));
  lines.push(nextLine({ last: lines[1], kind: "mark", payload: { marks: { BTCUSD: 61234.5 }, source: "test" }, ts: "2026-09-28T14:00:01.500Z", privateKey: privatePem }));
  const data = Buffer.from(`${lines.join("\n")}\n`);
  const out = verifyJournal(data);
  assert.deepEqual(verdict(out), [true, null, null]);
  assert.equal(out.entries, 3);
  assert.equal(out.head, journalHead(data).head);
  assert.equal(JSON.parse(lines[0].slice(9, lines[0].lastIndexOf(',"sig":"'))).payload.journal_key, publicKey);
  assert.ok(lines[1].includes("\\u007f") && lines[1].includes("\\u00e9"), "DEL and accents are escaped as Python escapes them");
});

test("the writer refuses what the standard does not allow", () => {
  const [first] = journalLines([]);
  assert.throws(() => nextLine({ last: first, kind: "decision", payload: { decision_id: "d" }, ts: "2026-09-28T13:29:59.000Z", privateKey: KEY }), /cannot go backwards/);
  assert.throws(() => signLine({ v: 1, seq: 1, ts: "2026-09-28T13:30:00.000Z", kind: "mark", payload: { marks: { X: 1e15 }, source: "s" }, prev: null }, KEY), /below 1e15/);
  assert.throws(() => signLine({ v: 1, seq: 1, ts: "2026-09-28T13:30:00.000Z", kind: "decision", payload: { ["décision_id"]: 1 }, prev: null }, KEY), /ASCII member names/);
});
