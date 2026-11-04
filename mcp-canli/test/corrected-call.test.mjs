// An argument a model got nearly right gets the key it most likely meant, and, when renaming fixes the call, the
// exact call to make: by spelling (retruns), by the names models reach for (start_date for start), never by
// guessing a key that is not close, and never echoing what was read from a file.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("a nearly right argument gets the corrected call", async () => {
  const c = new Client({ name: "corrected-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const error = async (name, args) => { const r = await c.callTool({ name: "run_tool", arguments: { name, arguments: args } }); assert.equal(r.isError, true); return r.content[0].text; };
    const returns = [0.01, -0.02, 0.03, 0.01, 0, 0.02];
    assert.match(await error("sharpe_ratio", { retruns: returns }), /retruns is returns: the call is \{"name":"sharpe_ratio","arguments":\{"returns":\[0\.01,-0\.02,0\.03,0\.01,0,0\.02\]\}\}\./);
    assert.match(await error("sharpe_ratio", { returns, periods_per_yr: 12 }), /periods_per_yr is periods_per_year: the call is/);
    assert.doesNotMatch(await error("sharpe_ratio", { values: returns }), / is /, "nothing close: no guess");
    const long = Array.from({ length: 400 }, (_, i) => 0.001 * Math.sin(i));
    assert.match(await error("sharpe_ratio", { retruns: long }), /retruns is returns, and with that the call checks\./, "a long call is not echoed");
    // Read from a file: the error shows the call as sent, with its $file, not the file's contents.
    const csv = path.join(mkdtempSync(path.join(tmpdir(), "corrected-")), "r.csv");
    writeFileSync(csv, `r\n${returns.join("\n")}\n`);
    const fromFile = await error("sharpe_ratio", { retruns: { $file: csv, column: "r" } });
    assert.match(fromFile, /retruns is returns: the call is \{"name":"sharpe_ratio","arguments":\{"returns":\{"\$file":/, "checked with the file read, shown as sent");
    assert.doesNotMatch(fromFile, /0\.03/, "nothing read from the file comes back");
  } finally {
    await c.close();
  }
});
