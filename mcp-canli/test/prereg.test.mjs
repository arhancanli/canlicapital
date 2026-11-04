// Pre-registration: a hypothesis and its plan hashed with the time, the hash checkable by anyone given the text,
// kept on this machine, and named in the receipt of every later answer and of none before it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { RECEIPT_KEY } from "../src/server.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v));

test("a pre-registration is hashed, kept, and named in the receipts of the answers after it", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "prereg-"));
  const c = new Client({ name: "prereg-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const call = (name, args) => c.callTool({ name: "run_tool", arguments: { name, arguments: args } });
    const returns = Array.from({ length: 300 }, (_, i) => 0.001 + 0.01 * Math.sin(i * 1.7));
    const before = await call("sharpe_ratio", { returns });
    assert.equal(before._meta[RECEIPT_KEY].after, undefined, "nothing was registered before it");
    const reg = await call("preregister", { hypothesis: "Firms that beat guidance keep beating it the next quarter.", plan: "Guidance records 2015-2024; one-sided test at 5%.", data_until: "2014-12-31" });
    const entry = JSON.parse(reg.content[0].text);
    assert.match(entry.id, /^prereg-[0-9a-f]{8}$/);
    assert.equal(entry.sha256, createHash("sha256").update(canonical(entry.hashed)).digest("hex"), "anyone given the text can hash it again");
    assert.equal(reg._meta[RECEIPT_KEY].after, undefined, "the answer that registers it does not come after it");
    const after = await call("sharpe_ratio", { returns });
    assert.deepEqual(after._meta[RECEIPT_KEY].after, [{ id: entry.id, sha256: entry.sha256, at: entry.at }]);
    const kept = readFileSync(path.join(home, "preregistrations.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(kept.map((k) => k.sha256), [entry.sha256]);
    assert.equal(kept[0].record.hypothesis, "Firms that beat guidance keep beating it the next quarter.");
  } finally {
    await c.close();
    rmSync(home, { recursive: true, force: true });
  }
});
