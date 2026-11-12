// The record of what was sent from this machine: a line before each order goes out and a line after.
// A line with no result after it means nobody knows whether that order reached the broker, so it is
// never sent again without a person saying they checked. Each line carries the hash of the one before.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { canonical, sha256 } from "./util.mjs";

export function openJournal(home) {
  const file = join(home, "broker-journal.jsonl");
  const read = () => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return {
    file,
    add(entry) {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      const lines = read(), body = { ...entry, prev: lines.at(-1)?.hash ?? null };
      appendFileSync(file, `${JSON.stringify({ ...body, hash: sha256(canonical(body)) })}\n`, { mode: 0o600 });
    },
    // Where each order of this file stands: sent, failed, or unknown (started and never finished).
    state(intentHash, broker, mode) {
      const out = new Map();
      for (const l of read()) if (l.intent === intentHash && l.broker === broker && l.mode === mode) out.set(l.index, l.event === "sending" ? "unknown" : l.event);
      return out;
    },
    // Everything that went out on a day, across all brokers, since the cap is on the person's money. An
    // order whose outcome is unknown counts: it may well have gone through.
    spentOn(day, mode) {
      const last = new Map();
      for (const l of read()) if (l.mode === mode && String(l.at).startsWith(day)) last.set(`${l.broker}|${l.intent}|${l.index}`, l);
      return [...last.values()].filter((l) => l.event === "sent" || l.event === "sending").reduce((n, l) => n + (l.value_usd ?? 0), 0);
    },
  };
}
