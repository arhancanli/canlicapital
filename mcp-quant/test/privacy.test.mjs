// Privacy: the server computes on what it is sent and nothing else. These tests hold the code to
// that: no network, file-writing, process, worker or dynamic-code APIs anywhere in src; the only
// environment variable read is CANLI_TOOLSETS; nothing is logged; and the server runs under Node's
// permission model with reads limited to its own package directory and writes, child processes and
// workers denied.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const files = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const sources = files(SRC).filter((f) => f.endsWith(".mjs")).map((f) => [path.relative(ROOT, f), readFileSync(f, "utf8")]);

test("src imports only zod, the MCP server SDK and three node modules for its own files and hashes", () => {
  const allowed = new Set(["zod", "@modelcontextprotocol/server", "@modelcontextprotocol/server/stdio", "node:crypto", "node:fs", "node:url"]);
  for (const [f, text] of sources) {
    for (const m of text.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gms)) if (!m[1].startsWith(".")) assert.ok(allowed.has(m[1]), `${f} imports ${m[1]}`);
    const fsNames = text.match(/import\s*\{([^}]*)\}\s*from\s*"node:fs"/);
    if (fsNames) for (const n of fsNames[1].split(",").map((s) => s.trim())) assert.ok(["readFileSync", "realpathSync"].includes(n), `${f} imports ${n} from node:fs`);
  }
});

test("no network, write, process, worker, dynamic-code or logging calls in src", () => {
  const banned = /\bfetch\s*\(|XMLHttpRequest|WebSocket|\brequire\s*\(|\bimport\s*\(|child_process|worker_threads|node:(net|http|https|http2|dns|tls|dgram|child_process|worker_threads|vm)\b|writeFile|appendFile|createWriteStream|mkdir|unlink|\beval\s*\(|new Function\s*\(|console\.(log|error|warn|info|debug)|process\.stdout\.write/;
  for (const [f, text] of sources) {
    const code = text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, banned, f);
  }
});

test("the only environment variable read is CANLI_TOOLSETS", () => {
  for (const [f, text] of sources) for (const m of text.matchAll(/process\.env(?:\.(\w+)|\[)/g)) assert.equal(m[1], "CANLI_TOOLSETS", `${f} reads process.env.${m[1] ?? "[...]"}`);
});

test("it runs under Node's permission model: reads only its own package, no writes, processes or workers", async (t) => {
  const client = new Client({ name: "privacy-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--permission", `--allow-fs-read=${ROOT}`, path.join(SRC, "server.mjs")], env: { PATH: process.env.PATH ?? "", CANLI_TOOLSETS: "" } }));
  t.after(() => client.close());
  const P = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.01 * Math.sin(i / 7) + 0.0004 * i));
  for (const [name, args] of [
    ["sharpe_ratio", { returns: [0.01, -0.02, 0.015, 0.003, -0.004] }],
    ["triple_barrier_labels", { prices: P, include_rows: false }],
    ["annotate_price_series", { prices: P }],
    ["run_sleeve", { id: "tsmom-63-long", prices: P }],
  ]) {
    const r = await client.callTool({ name: "run_tool", arguments: { name, arguments: args, receipt: true } });
    assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
    assert.match(r.structuredContent.receipt.output_sha256, /^[0-9a-f]{64}$/);
  }
  const priv = JSON.parse((await client.readResource({ uri: "canli-quant://privacy" })).contents[0].text);
  assert.equal(priv.network, "none");
});
