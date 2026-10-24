// Every tool in every pack, called with hostile arguments: words that are built-in property names
// ("constructor"), empty and very long strings, unusual unicode, edge numbers, empty and very long
// arrays, and no arguments at all. A tool passes when each call gives an answer or a clean error.
// Reported: crashes (TypeError and the like), calls that time out, messages that leak "undefined"
// or "function Object()", and answers holding NaN, Infinity or "[object Object]".
//
// Offline and contained: every request gets a 404, and each tool runs in its own process whose home, CANLI_HOME
// and working directory are a fresh temporary folder (some tools write ledgers or output files).
//
//   node bench/robustness.mjs [--pack quant] [--tool name] [--json]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(SELF, "..", "..");
const STRINGS = ["constructor", "__proto__", "toString", "", " ", "x".repeat(5000), "Ünïcödé 😀 漢字", "' OR 1=1 --", "(.*)+$", "-1", "NaN", "\u0000", "a/b\\c"];
const NUMBERS = [-1, 0, 0.5, 1e308, 2 ** 53];
const LEAKS = /\bundefined\b|\[object Object\]|function [A-Za-z]*\(\) \{ \[native code\] \}/;
// zod's own wording ("expected array, received undefined") says what was missing; it is not a leak.
const ZOD_WORDING = /received undefined/;
const CRASHES = new Set(["TypeError", "ReferenceError", "SyntaxError", "InternalError"]);
// A RangeError a tool throws on purpose says what range it wants; these come from the engine instead.
const ENGINE_RANGE = /Maximum call stack|Invalid (array|string|typed array) length|Invalid time value|toFixed|toPrecision|toExponential|out of memory|BigInt/i;
// Numbers no real input reaches: an answer that overflows on them is reported apart.
const EXTREME = /=(1e\+308|9007199254740992)$/;

// A plausible value for a JSON-schema node, enough to get past validation to the tool's own code.
function sample(p) {
  if (!p) return "x";
  if (p.enum) return p.enum[0];
  if (p.const !== undefined) return p.const;
  if (p.anyOf) return sample(p.anyOf.find((x) => x.type !== "null") ?? p.anyOf[0]);
  switch (p.type) {
    case "string": return /\\d\{4\}|YYYY/i.test(`${p.pattern ?? ""} ${p.description ?? ""}`) ? "2024-01-31" : "x";
    case "integer": return Math.max(p.minimum ?? 1, Math.min(p.maximum ?? 5, 5));
    case "number": return Math.max(p.minimum ?? 0.01, Math.min(p.maximum ?? 0.5, 0.5));
    case "boolean": return false;
    case "array": return Array.from({ length: Math.max(p.minItems ?? 0, 24) }, (_, i) => (p.items?.type === "number" ? 100 + Math.sin(i) * 3 + i * 0.1 : sample(p.items)));
    case "object": return Object.fromEntries(Object.entries(p.properties ?? {}).filter(([k]) => (p.required ?? []).includes(k)).map(([k, v]) => [k, sample(v)]));
    default: return "x";
  }
}

// The calls for one tool: its base arguments, then each property in turn made hostile.
function variants(schema) {
  const base = sample(schema), out = [["no arguments", {}], ["base", base]];
  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    const types = new Set([p.type, ...(p.anyOf ?? []).map((x) => x.type)]);
    if (types.has("string") && !p.enum) for (const s of STRINGS) out.push([`${k}=${JSON.stringify(s.slice(0, 24))}${s.length > 24 ? "…" : ""}`, { ...base, [k]: s }]);
    if (types.has("number") || types.has("integer")) for (const n of NUMBERS) out.push([`${k}=${n}`, { ...base, [k]: n }]);
    if (types.has("array")) {
      out.push([`${k}=[]`, { ...base, [k]: [] }]);
      const item = (p.items ?? p.anyOf?.find((x) => x.type === "array")?.items);
      out.push([`${k}=[20000]`, { ...base, [k]: Array.from({ length: 20000 }, (_, i) => (item?.type === "number" ? 100 + Math.sin(i) + i * 1e-4 : sample(item))) }]);
    }
  }
  return out;
}

function nonFinite(v, depth = 0) {
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v === "string") return /\[object Object\]/.test(v);
  if (!v || typeof v !== "object" || depth > 12) return false;
  return Object.values(v).some((x) => nonFinite(x, depth + 1));
}

// Child: one tool, every variant, one JSON line per finding.
async function child(name) {
  // Every request is refused as not found, which no source client retries.
  globalThis.fetch = async () => new Response("offline: the robustness sweep allows no network", { status: 404 });
  const { z } = await import("zod");
  const { loadPack } = await import(join(ROOT, "src", "packs.mjs"));
  const index = JSON.parse(readFileSync(join(ROOT, "src", "index.json"), "utf8"));
  const row = index.tools.find((t) => t[0] === name);
  const tool = (await loadPack(row[1])).get(name);
  const schema = z.toJSONSchema(tool.input, { io: "input" });
  let ran = 0, refused = 0;
  for (const [label, args] of variants(schema)) {
    const parsed = tool.input.safeParse(args);
    if (!parsed.success) { refused++; continue; }
    ran++;
    try {
      const out = await tool.run(parsed.data, tool.pack === "quant" ? { digits: 15 } : undefined);
      if (nonFinite(out)) console.log(JSON.stringify({ tool: name, pack: row[1], call: label, kind: EXTREME.test(label) ? "non-finite answer from an extreme number" : "non-finite or [object Object] in the answer" }));
    } catch (e) {
      const type = e?.constructor?.name ?? typeof e;
      const message = String(e?.message ?? e);
      if (CRASHES.has(type) || (type === "RangeError" && ENGINE_RANGE.test(message))) console.log(JSON.stringify({ tool: name, pack: row[1], call: label, kind: `crash (${type})`, message: message.slice(0, 200) }));
      else if (LEAKS.test(message) && !ZOD_WORDING.test(message)) console.log(JSON.stringify({ tool: name, pack: row[1], call: label, kind: "message leaks internals", message: message.slice(0, 200) }));
    }
  }
  console.log(JSON.stringify({ tool: name, ran, refused }));
}

function parent() {
  const arg = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : null; };
  const index = JSON.parse(readFileSync(join(ROOT, "src", "index.json"), "utf8"));
  const tools = index.tools.filter((t) => (!arg("--pack") || t[1] === arg("--pack")) && (!arg("--tool") || t[0] === arg("--tool")));
  const findings = [];
  let ran = 0, refused = 0;
  for (const [name, pack] of tools) {
    const home = mkdtempSync(join(tmpdir(), "canli-sweep-"));
    const r = spawnSync(process.execPath, [SELF, "--child", name], { cwd: home, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: home, CANLI_HOME: home, CANLI_PACKS: "all", TMPDIR: home } });
    for (const line of (r.stdout ?? "").split("\n")) {
      if (!line.startsWith("{")) continue;
      const x = JSON.parse(line);
      if ("ran" in x) { ran += x.ran; refused += x.refused; } else findings.push(x);
    }
    if (r.error?.code === "ETIMEDOUT" || r.signal) findings.push({ tool: name, pack, kind: "timed out (60 s for every call)" });
    else if (r.status !== 0) findings.push({ tool: name, pack, kind: "process failed", message: (r.stderr ?? "").trim().split("\n").slice(-3).join(" | ").slice(0, 300) });
    rmSync(home, { recursive: true, force: true });
  }
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ tools: tools.length, calls: ran, refused_by_validation: refused, findings }, null, 1)); return; }
  const byTool = new Map();
  for (const f of findings) (byTool.get(f.tool) ?? byTool.set(f.tool, []).get(f.tool)).push(f);
  console.log(`${tools.length} tools, ${ran} calls run (${refused} more refused by argument validation); ${byTool.size} tools with findings, ${findings.length} findings.`);
  for (const [name, list] of byTool) {
    console.log(`\n${name} (${list[0].pack})`);
    for (const f of list.slice(0, 6)) console.log(`  ${f.kind}${f.call ? ` | ${f.call}` : ""}${f.message ? ` | ${f.message}` : ""}`);
    if (list.length > 6) console.log(`  ... ${list.length - 6} more`);
  }
}

if (process.argv[2] === "--child") await child(process.argv[3]);
else parent();
