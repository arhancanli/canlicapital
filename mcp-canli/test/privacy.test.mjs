// Privacy: the combined server's own code has no network, write, process or logging calls; only the
// packs that state network use load network code; CANLI_OFFLINE=1 runs with fetch and every
// network module poisoned and the quant and validation tools still work; paper trading is off
// unless Alpaca paper keys are set.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { enabledPacks } from "../src/packs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

test("src imports only the SDK, zod, the published packs and file, path, os, url and crypto helpers", () => {
  const allowed = /^(zod|@modelcontextprotocol\/server(\/stdio)?|node:(crypto|fs|os|path|url)|canli-[a-z-]+-mcp\/.+)$/;
  for (const f of readdirSync(SRC).filter((f) => f.endsWith(".mjs"))) {
    const text = readFileSync(path.join(SRC, f), "utf8");
    for (const m of text.matchAll(/(?:from\s+|import\()\s*"([^"]+)"/g)) if (!m[1].startsWith(".")) assert.match(m[1], allowed, `${f} imports ${m[1]}`);
    const code = text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|child_process|worker_threads|writeFile|appendFile|createWriteStream|mkdir|unlink|\beval\s*\(|new Function|console\.(log|error|warn|info)/, f);
    for (const n of (text.match(/import\s*\{([^}]*)\}\s*from\s*"node:fs"/)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) assert.ok(["closeSync", "fstatSync", "openSync", "readFileSync", "realpathSync", "statSync"].includes(n), `${f} imports ${n} from node:fs`);
    for (const m of code.matchAll(/openSync\(([^)]*)\)/g)) assert.match(m[1], /,\s*"r"\s*$/, `${f} opens a file for writing`);
  }
});

test("pack selection: paper only with Alpaca paper keys; offline keeps only the network-free packs", () => {
  assert.deepEqual(enabledPacks({}), ["quant", "validation", "fundamentals", "research", "backtest"]);
  assert.ok(enabledPacks({ ALPACA_PAPER_KEY_ID: "PK1" }).includes("paper"));
  assert.deepEqual(enabledPacks({ CANLI_OFFLINE: "1", CANLI_PACKS: "all" }), ["quant", "validation"]);
  assert.throws(() => enabledPacks({ CANLI_PACKS: "nope" }), /no pack nope/);
});

test("offline mode: tools work with the network and network packs poisoned", async (t) => {
  const csv = path.join(mkdtempSync(path.join(tmpdir(), "canli-offline-")), "prices.csv");
  writeFileSync(csv, `close\n${Array.from({ length: 300 }, (_, i) => (100 * Math.exp(0.001 * i + 0.02 * Math.sin(i / 5))).toFixed(4)).join("\n")}\n`);
  const c = new Client({ name: "offline", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(ROOT, "test/offline-guard.mjs"), path.join(SRC, "server.mjs")], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_OFFLINE: "1", CANLI_PACKS: "all" } }));
  t.after(() => c.close());
  const r = await c.callTool({ name: "run_tool", arguments: { calls: [
    { name: "sharpe_ratio", arguments: { prices: { $file: csv } } },
    { name: "strategy_stress_test", arguments: { returns: Array.from({ length: 300 }, (_, i) => 0.001 * Math.sin(i)) } },
    { name: "validate_deflated_sharpe", arguments: { observed_sharpe_annualized: 1.2, observations: 500, periods_per_year: 252, skew: 0, non_excess_kurtosis: 3, effective_independent_trials: 20, cross_trial_sharpe_sd_annualized: 0.4 } },
  ] } });
  assert.ok(!r.isError, r.content?.[0]?.text);
  for (const x of r.structuredContent.results) assert.ok(x.result && !x.error, JSON.stringify(x).slice(0, 300));
  assert.equal(typeof r.structuredContent.results[0].result.sharpe, "number");
  const off = await c.callTool({ name: "run_tool", arguments: { name: "find_company", arguments: { query: "apple" } } });
  assert.equal(off.isError, true);
  assert.match(off.content[0].text, /not enabled here/);
  const priv = JSON.parse((await c.readResource({ uri: "canli://privacy" })).contents[0].text);
  assert.deepEqual(Object.keys(priv.packs), ["quant", "validation"]);
});
