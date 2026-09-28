// journal: reads a canli.trade-journal.v0 file and reports on it. head is quick (the first and last
// lines, not checked); verify checks every line's chain, signature and form, offline. It returns
// verdicts and hashes, never the file's contents. Local only; nothing here writes the journal.
import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { journalHead, verifyJournal } from "./core/js/trade-journal-core.js";
import { z } from "zod";

export const MAX_JOURNAL_BYTES = 256 * 1024 * 1024;

export const journalInput = z.object({
  action: z.enum(["head", "verify"]),
  file: z.string().min(1).max(1000).optional(),
}).strict();

export const JOURNAL_JSON = Object.freeze({
  type: "object",
  properties: {
    action: { type: "string", enum: ["head", "verify"] },
    file: { type: "string", description: "a journal file to read instead of your own" },
  },
  required: ["action"],
});

export const JOURNAL_DESCRIPTION = "Reads a trade journal (canli.trade-journal.v0: signed, hash-chained entries). head gives its last hash, entry count and signing key quickly; verify checks every line offline and names the first line that fails, and why.";

export const JOURNAL_OUTPUT = z.looseObject({
  file: z.string().optional(),
  exists: z.boolean().optional(),
  head: z.string().nullable().optional(),
  valid: z.boolean().optional(),
  first_bad_line: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
}).describe("head is the sha256 of the last line; valid, first_bad_line and reason come from verify.");

export const JOURNAL_LIMITS = Object.freeze([
  "A valid journal shows its key holder wrote these entries in this order and has not changed them since. It does not show when they were written or that no other journal exists.",
]);

const REASON_TEXT = Object.freeze({
  encoding: "not UTF-8, a carriage return, a blank line, or no final newline",
  shape: "not {\"entry\":...,\"sig\":\"...\"} with exactly the six entry members",
  canonical: "the entry is not written in canonical form",
  version: "v is not 1",
  seq: "seq is not the line number: a line was dropped, inserted or moved",
  prev: "prev does not chain to the line before",
  ts: "ts is malformed, not a real time, or earlier than the line before",
  kind: "an unknown kind, or line 0 is not config",
  payload: "the payload lacks a member its kind requires",
  signature: "the signature does not verify with the key from line 0",
});

export function journalPath(home) {
  return join(home, "journal.jsonl");
}

// One open file descriptor for the size check and the read, so the file cannot change between them.
function readJournalFile(path) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    if (fstatSync(fd).size > MAX_JOURNAL_BYTES) throw new Error(`journal: ${path} is larger than ${MAX_JOURNAL_BYTES} bytes`);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

const fingerprint = (keyB64) => `sha256:${createHash("sha256").update(Buffer.from(keyB64, "base64")).digest("hex").slice(0, 16)}`;

/** head or verify, for the trader's journal in `home` or for `file`. */
export function runJournal(input, { home }) {
  const path = input.file ? resolve(input.file) : journalPath(home);
  const data = readJournalFile(path);
  if (!data) return { action: input.action, file: path, exists: false, limits: JOURNAL_LIMITS };
  if (input.action === "verify") {
    const r = verifyJournal(data);
    return { action: "verify", file: path, exists: true, valid: r.valid, entries: r.entries, head: r.head, first_bad_line: r.first_bad_line, reason: r.reason, ...(r.reason ? { reason_text: REASON_TEXT[r.reason] } : {}), limits: JOURNAL_LIMITS };
  }
  let head;
  let first;
  try {
    head = journalHead(data);
    const firstLine = data.toString("utf8").split("\n", 1)[0];
    first = JSON.parse(firstLine.slice(9, firstLine.lastIndexOf(',"sig":"')));
  } catch {
    return { action: "head", file: path, exists: true, head: null, note: "the file does not read as a journal; run verify for the first line that fails", limits: JOURNAL_LIMITS };
  }
  return {
    action: "head",
    file: path,
    exists: true,
    head: head.head,
    entries: head.entries,
    last_seq: head.seq,
    first_ts: first.ts,
    last_ts: head.ts,
    key_fingerprint: typeof first.payload?.journal_key === "string" ? fingerprint(first.payload.journal_key) : null,
    verified: false,
    note: "head reads the first and last lines only; verify checks every line",
    limits: JOURNAL_LIMITS,
  };
}
