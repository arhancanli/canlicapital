// export_result: a kept table written to CANLI_HOME/exports as CSV (or anything as JSON) with its receipt beside
// it, never over an existing file and never outside that folder; the model reads where the file is, not the rows.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { toCsv } from "../local/export.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("tables become CSV with quoting; anything else is refused", () => {
  assert.equal(toCsv({ columns: ["a", "b"], rows: [[1, "x, y"], [null, { k: 1 }]] }), "a,b\n1,\"x, y\"\n,\"{\"\"k\"\":1}\"");
  assert.equal(toCsv([{ a: 1 }, { b: 2 }]), "a,b\n1,\n,2");
  assert.throws(() => toCsv({ n: 1 }), /Only a table/);
});

test("over stdio: a kept table to a file with its receipt, not twice, not elsewhere", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "export-"));
  const c = new Client({ name: "export-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const call = async (name, args) => { const r = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text); };
    const listed = await call("list_sleeves", { family: "breakout", limit: 5 });
    const out = await call("export_result", { ref: listed.ref, name: "trend-sleeves.csv" });
    assert.equal(out.file, path.join(home, "exports", "trend-sleeves.csv"));
    const text = readFileSync(out.file, "utf8");
    assert.equal(text.split("\n")[0], "id,family,data,rule");
    assert.equal(out.lines, 6, "a header and five rows");
    const receipt = JSON.parse(readFileSync(out.receipt_file, "utf8"));
    assert.equal(receipt.sha256, createHash("sha256").update(text).digest("hex"));
    assert.match(receipt.from.output_sha256, /^[0-9a-f]{64}$/, "the receipt of the answer it came from");
    assert.match((await call("export_result", { ref: listed.ref, name: "trend-sleeves.csv" })).error, /already exists/);
    assert.match((await call("export_result", { ref: listed.ref, name: "../escape.csv" })).error, /plain file name/);
    assert.ok((await call("export_result", { ref: listed.ref, path: "families", name: "families.json" })).file.endsWith("families.json"));
  } finally {
    await c.close();
    rmSync(home, { recursive: true, force: true });
  }
});
