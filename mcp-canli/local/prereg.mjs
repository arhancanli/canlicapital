// Pre-registrations kept on this machine: one JSON line each in CANLI_HOME/preregistrations.jsonl, readable only
// by its owner. The hosted server never loads this file.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function keepPreregistration(home, line) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const file = join(home, "preregistrations.jsonl");
  appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  return file;
}
