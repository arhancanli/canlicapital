// journal: reads a canli.trade-journal.v0 file and reports on it. head is quick (the first and last
// lines, not checked); verify checks every line's chain, signature and form, offline. It returns
// verdicts and hashes. export reconstructs one account/window and may write a private export
// artifact. Local only; the source journal is never modified or uploaded.
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import { journalHead, verifyJournal } from "./core/js/trade-journal-core.js";
import { exportJournal, signJournalExport } from "./core/js/trade-journal-export-core.js";
import { MAX_JOURNAL_BYTES, MAX_RECORD_BYTES, readBoundedFile } from "./core/js/journal-files.js";
import { exportDigest, INLINE_EXPORT_BYTES, storeExport } from "./journal-export-file.mjs";
import { z } from "zod";

export { MAX_JOURNAL_BYTES };

export const journalInput = z.object({
  action: z.enum(["head", "verify", "export"]),
  file: z.string().min(1).max(1000).optional(),
  from: z.number().int().min(0).max(99999).optional(),
  to: z.number().int().min(0).max(99999).optional(),
  strategy_id: z.string().min(1).max(256).optional(),
  session_id: z.string().min(1).max(256).optional(),
  publish_url: z.string().min(1).max(2000).optional(),
  sign: z.boolean().optional(),
}).strict();

export const JOURNAL_JSON = Object.freeze({
  type: "object",
  properties: {
    action: { type: "string", enum: ["head", "verify", "export"] },
    file: { type: "string" },
    from: { type: "integer", minimum: 0, maximum: 99999 },
    to: { type: "integer", minimum: 0, maximum: 99999 },
    strategy_id: { type: "string" },
    session_id: { type: "string" },
    publish_url: { type: "string", description: "Unfetched HTTPS source" },
    sign: { type: "boolean", description: "Use matching 0600 journal.key" },
  },
  required: ["action"],
  additionalProperties: false,
});

export const JOURNAL_DESCRIPTION = "head unverified; verify integrity; export paper-evidence.v0 from account.v0. Large exports yield record_file. Signing is self-attested.";

export const JOURNAL_OUTPUT = z.looseObject({
  file: z.string().optional(),
  exists: z.boolean().optional(),
  head: z.string().nullable().optional(),
  valid: z.boolean().optional(),
  first_bad_line: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
}).describe("head/verify report integrity. export returns an inline record or a private record_file with artifact_sha256; source journal bytes are not returned.");

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

function readJournalFile(path) {
  try {
    return readBoundedFile(path, { maxBytes: MAX_JOURNAL_BYTES });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const fingerprint = (keyB64) => `sha256:${createHash("sha256").update(Buffer.from(keyB64, "base64")).digest("hex").slice(0, 16)}`;

/** Read-only head/verify, or an explicitly requested export of a reconstructed account. */
export function runJournal(input, { home, now = () => new Date() }) {
  if (input.action !== "export" && Object.keys(input).some(k => !["action", "file"].includes(k))) throw new Error('journal: export parameters require action export');
  const path = input.file ? resolve(input.file) : journalPath(home);
  const data = readJournalFile(path);
  if (!data) return { action: input.action, file: path, exists: false, limits: JOURNAL_LIMITS };
  if (input.action === "export") {
    const { from, to, strategy_id, session_id, publish_url } = input;
    let bundle = exportJournal(data, { from, to, strategy_id, session_id, publish_url, generated_at: now().toISOString() });
    if (input.sign) {
      const key = readBoundedFile(join(home, 'journal.key'), { maxBytes: 16 * 1024, privateFile: true });
      try { bundle = signJournalExport(bundle, key); } finally { key.fill(0); }
    }
    const bytes = Buffer.from(JSON.stringify(bundle) + '\n');
    if (bytes.length > MAX_RECORD_BYTES) throw new Error(`journal export exceeds ${MAX_RECORD_BYTES} bytes; select a smaller window`);
    const summary = { action: 'export', file: path, exists: true, artifact_bytes: bytes.length, artifact_sha256: exportDigest(bytes), limits: [...JOURNAL_LIMITS, ...bundle.record.claim_maturity.does_not_establish] };
    if (bytes.length <= INLINE_EXPORT_BYTES) return { ...summary, inline: true, ...bundle };
    return { ...summary, inline: false, record_file: storeExport(home, bytes), journal_sha256: bundle.journal_sha256, head: bundle.head, entry_range: bundle.entry_range, metrics: bundle.metrics, signed: bundle.record.provenance.signed };
  }
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
