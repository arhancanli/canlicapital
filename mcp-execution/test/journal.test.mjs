// journal as the local server runs it: head and verify on the trader's own journal or a named file,
// verdicts and hashes only (never the file's contents), and the lean schema clients see.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { genesisLine, nextLine } from "../src/core/js/trade-journal-core.js";
import { JOURNAL_DESCRIPTION, JOURNAL_JSON, journalInput } from "../src/journal.mjs";
import { createSession, registerResources, toolJournal } from "../src/server.mjs";
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ed25519");
function journalText(n = 3) {
  const lines = [genesisLine({ privateKey, ts: "2026-09-28T14:00:00.000Z" })];
  for (let i = 1; i < n; i += 1) lines.push(nextLine({ last: lines.at(-1), kind: "decision", payload: { decision_id: `d-${i}`, note: "secret strategy note" }, ts: "2026-09-28T14:00:01.000Z", privateKey }));
  return `${lines.join("\n")}\n`;
}
function home(journal) {
  const dir = mkdtempSync(join(tmpdir(), "canli-journal-"));
  if (journal !== undefined) writeFileSync(join(dir, "journal.jsonl"), journal);
  return dir;
}
const run = async (dir, args) => (await toolJournal(createSession({ home: dir, toolsets: ["journal"] }), args)).structuredContent;

test("verify: a sound journal is valid, with its head; a changed byte names the line", async () => {
  const text = journalText(4);
  const ok = await run(home(text), { action: "verify" });
  assert.deepEqual([ok.valid, ok.entries, ok.first_bad_line], [true, 4, null]);
  const broken = text.replace("d-2", "d-9");
  const bad = await run(home(broken), { action: "verify" });
  assert.deepEqual([bad.valid, bad.first_bad_line, bad.reason], [false, 2, "signature"]);
  assert.match(bad.reason_text, /does not verify/);
});

test("head: the last hash, count, times and key fingerprint, marked as not verified", async () => {
  const dir = home(journalText(3));
  const h = await run(dir, { action: "head" });
  const v = await run(dir, { action: "verify" });
  assert.equal(h.head, v.head);
  assert.deepEqual([h.entries, h.last_seq, h.first_ts, h.last_ts, h.verified], [3, 2, "2026-09-28T14:00:00.000Z", "2026-09-28T14:00:01.000Z", false]);
  assert.match(h.key_fingerprint, /^sha256:[0-9a-f]{16}$/);
  let read;
  registerResources({ registerResource: (name, _u, _m, fn) => { if (name === "journal-head") read = fn; } }, createSession({ home: dir, toolsets: ["journal"] }));
  assert.equal(JSON.parse((await read(new URL("execution://journal/head"))).contents[0].text).head, h.head);
});

test("a named file is read instead of your own; a missing journal says so; contents never come back", async () => {
  const other = join(home(), "theirs.jsonl");
  writeFileSync(other, journalText(2));
  const out = await run(home(), { action: "verify", file: other });
  assert.deepEqual([out.file, out.valid], [other, true]);
  const none = await run(home(), { action: "head" });
  assert.deepEqual([none.exists, none.head], [false, undefined]);
  for (const r of [out, await run(home(journalText(3)), { action: "head" })]) assert.doesNotMatch(JSON.stringify(r), /secret strategy note|decision_id/);
  await assert.rejects(run(home(), { action: "append" }), /action/);
});

test("the advertised schema names the export fields and remains bounded", async () => {
  const { z } = await import("zod");
  const json = z.toJSONSchema(journalInput, { io: "input" });
  assert.deepEqual(Object.keys(JOURNAL_JSON.properties).sort(), Object.keys(json.properties).sort());
  assert.deepEqual(JOURNAL_JSON.properties.action.enum, json.properties.action.enum);
  assert.deepEqual(JOURNAL_JSON.required, json.required);
  const chars = JOURNAL_DESCRIPTION.length + JSON.stringify(JOURNAL_JSON).length;
  // The old 500-character head/verify shape did not include account export. This draft bound
  // is not the original 150-token journal release target; measured token gates stay open.
  assert.ok(chars < 1000, `${chars} characters`);
  assert.doesNotMatch(JOURNAL_DESCRIPTION, /\b(should|recommend\w*|READY|eligible|Kelly|optimal)\b/i);
});
