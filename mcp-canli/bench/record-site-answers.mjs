// Records the answers shown on canlicapital.com/mcp-servers/answers: runs each page's call
// (config/mcp-answers.json) through the flagship over stdio with no API keys in the environment, as a
// fresh install would, and writes public/demos/canli-mcp/answers/<slug>.json with the call, the result
// and the characters the model read, one value per line so the site's numbers audit reads each.
// Run from mcp-canli: node bench/record-site-answers.mjs [slug ...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "public/demos/canli-mcp/answers");
const version = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")).version;
const { answers } = JSON.parse(readFileSync(resolve(ROOT, "config/mcp-answers.json"), "utf8"));
const only = new Set(process.argv.slice(2));
// Only what Node needs to run: no keys, so every answer is one a keyless install gets.
const env = { PATH: process.env.PATH, HOME: process.env.HOME };
const c = new Client({ name: "site-answer-recorder", version: "0" });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(import.meta.dirname, "../src/server.mjs")], env }));

mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const a of answers) {
  if (only.size && !only.has(a.slug)) continue;
  const input = { ...a.call, digits: 6 };
  const t0 = Date.now(), r = await c.callTool({ name: "run_tool", arguments: input });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError) { failed++; process.stderr.write(`${a.slug}: ${text.slice(0, 200)}\n`); continue; }
  writeFileSync(resolve(OUT, `${a.slug}.json`), JSON.stringify({ version, recorded: new Date().toISOString(), call: a.call, model_chars: text.length, ms: Date.now() - t0, result: r.structuredContent ?? JSON.parse(text) }, null, 1));
  process.stdout.write(`${a.slug}: ${text.length} chars, ${Date.now() - t0} ms\n`);
}
await c.close();
process.exitCode = failed ? 1 : 0;
