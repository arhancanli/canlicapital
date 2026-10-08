#!/usr/bin/env node
// canli-mcp: every Canli Capital MCP server in one process, behind three discovery tools.
//
// Efficiency, by design:
// - Context: the model sees find_tool, describe_tool and run_tool (about 1,000 tokens) instead of
//   six servers' tool lists (18,158 tokens measured); the list is byte-identical across launches.
// - Startup: only a prebuilt index is read; a pack's code loads the first time one of its tools is
//   described or run.
// - Round trips: run_tool takes a batch of calls, runs independent ones concurrently, and lets a
//   call take an earlier call's output ({"$result": i, "path": "..."}) so intermediate data never
//   passes through the model; return: "last" sends back only the final result.
// - Input tokens: any argument can be {"$file": "data.csv", "column": "close"}, read here.
// Privacy: canli://privacy states what each pack sends and stores; CANLI_OFFLINE=1 keeps only the
// packs that never use the network, and their code is the only code loaded.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { resolveRefs } from "./files.mjs";
import { OMITTED, PACKS, RENAMES, enabledPacks, loadPack } from "./packs.mjs";
import { buildIndex, search } from "./search.mjs";

const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const INDEX = JSON.parse(readFileSync(new URL("./index.json", import.meta.url), "utf8"));
export const SERVER_NAME = "canli-mcp";
export const SERVER_VERSION = PKG.version;
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME, version: SERVER_VERSION, title: "Canli Capital",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [{ src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }, { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});

export const ENTRIES = INDEX.tools.map(([name, pack, toolset, title, description, keywords]) => ({ name, pack, toolset, title, description, keywords }));
const BY_NAME = new Map(ENTRIES.map((e) => [e.name, e]));
const SEARCH = buildIndex(ENTRIES);

export function instructions(packs) {
  const n = ENTRIES.filter((e) => packs.includes(e.pack)).length;
  return `Canli Capital's finance tools in one server: ${n} tools in ${packs.length} packs (${packs.join(", ")}). Call find_tool with what you need in plain words, then run_tool with the tool's name and arguments; describe_tool gives the exact input schema. To save tokens: pass long data as {"$file": "path.csv", "column": "close"} instead of pasting numbers; put several calls in one run_tool, using {"$result": i, "path": "field"} to feed one call's output into the next, and return: "last" when only the final answer matters. Returns are simple fractions (0.01 = 1%), oldest first. canli://privacy says what each pack sends and stores.`;
}

const sha256 = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const open = z.looseObject({});
const ok = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
const fail = (err) => ({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] });
const guard = (fn) => async (args) => { try { return ok(await fn(args)); } catch (err) { return fail(err); } };

async function toolFor(name, packs) {
  const e = BY_NAME.get(name);
  if (!e || !packs.includes(e.pack)) {
    const near = search(SEARCH, name.replace(/_/g, " "), { packs, limit: 3 }).map((t) => t.name);
    const off = e ? ` It is in the ${e.pack} pack, which is not enabled here (CANLI_PACKS, CANLI_OFFLINE).` : "";
    throw new Error(`No tool ${name}.${off}${near.length ? ` Closest: ${near.join(", ")}.` : ""} find_tool searches all of them.`);
  }
  return (await loadPack(e.pack)).get(name);
}

// Dotted path into a result: "rows", "multiple_testing.best.id", "rows.0".
const at = (v, path) => (path ? String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), v) : v);
function resolveResults(value, done) {
  if (Array.isArray(value)) return value.map((v) => resolveResults(v, done));
  if (value && typeof value === "object") {
    if (Number.isInteger(value.$result)) {
      const i = value.$result;
      if (!(i >= 0 && i < done.length)) throw new Error(`$result ${i} refers to a call that has not run; refer only to earlier calls.`);
      if (done[i].error) throw new Error(`$result ${i} failed: ${done[i].error}`);
      let v = at(done[i].result, value.path);
      if (v === undefined) throw new Error(`$result ${i} has nothing at "${value.path}".`);
      if (Array.isArray(value.pick)) v = v.map((row) => (value.pick.length === 1 ? row[value.pick[0]] : value.pick.map((c) => row[c])));
      return v;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveResults(v, done)]));
  }
  return value;
}
const usesResults = (v) => (Array.isArray(v) ? v.some(usesResults) : v && typeof v === "object" ? Number.isInteger(v.$result) || Object.values(v).some(usesResults) : false);

async function runOne(packs, { name, arguments: args }, { digits }, files) {
  const tool = await toolFor(name, packs);
  const parsed = tool.input.safeParse(resolveRefs(args ?? {}, files));
  if (!parsed.success) throw new Error(`${name}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ")}. describe_tool ${name} gives the exact input schema.`);
  const out = await tool.run(parsed.data, digits ? { digits } : undefined);
  if (!digits || tool.pack === "quant") return out;
  const { compact } = await import("canli-quant-mcp/src/math.mjs");
  return compact(out, digits);
}

export function registerAll(server, packs = enabledPacks()) {
  server.registerTool("find_tool", {
    title: "Find a tool",
    description: `Search the ${ENTRIES.filter((e) => packs.includes(e.pack)).length} finance tools (packs: ${packs.join(", ")}) by what you need, e.g. "deflated sharpe", "black scholes greeks", "revenue as of 2019". Returns names, packs and one-line descriptions, best first.`,
    annotations: { title: "Find a tool", ...READ_ONLY },
    inputSchema: z.object({ query: z.string().max(200).describe("What you need, in plain words."), pack: z.enum(packs).optional().describe("Only this pack."), limit: z.number().int().min(1).max(50).optional().describe("Default 8.") }).strict(),
    outputSchema: open,
  }, guard(({ query, pack, limit }) => {
    const found = search(SEARCH, query, { packs: pack ? [pack] : packs, limit: limit ?? 8 });
    return { columns: ["name", "pack", "description"], rows: found.map((t) => [t.name, t.pack, t.description.split(/(?<=\.)\s/)[0]]), next: "describe_tool for the input schema, then run_tool." };
  }));
  server.registerTool("describe_tool", {
    title: "Describe a tool",
    description: "Get one tool's full description and exact input JSON Schema before calling run_tool.",
    annotations: { title: "Describe a tool", ...READ_ONLY },
    inputSchema: z.object({ name: z.string().max(100).describe("A tool name from find_tool.") }).strict(),
    outputSchema: open,
  }, guard(async ({ name }) => {
    const t = await toolFor(name, packs), schema = z.toJSONSchema(t.input, { io: "input" });
    delete schema.$schema;
    return { name: t.name, pack: t.pack, title: t.title, description: t.description, input_schema: schema, ...(t.annotations?.destructiveHint ? { destructive: true } : {}) };
  }));
  server.registerTool("run_tool", {
    title: "Run tools",
    description: "Run one tool ({name, arguments}) or several in one call ({calls: [...]}). Any argument can be {\"$file\": \"path.csv\", \"column\": \"close\"} (or \"columns\": [...] / \"all\") instead of pasted numbers; in a batch, {\"$result\": i, \"path\": \"rows\"} passes call i's output into a later call.",
    annotations: { title: "Run tools", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    inputSchema: z.object({
      name: z.string().max(100).optional().describe("Tool name from find_tool (single call)."),
      arguments: z.record(z.string(), z.unknown()).optional().describe("The tool's arguments (single call)."),
      calls: z.array(z.object({ name: z.string().max(100), arguments: z.record(z.string(), z.unknown()).optional() }).strict()).min(1).max(25).optional().describe("Several calls in one round trip. Calls without $result references run concurrently."),
      return: z.enum(["all", "last"]).optional().describe("For a batch: every result (default) or only the last one."),
      digits: z.number().int().min(3).max(10).optional().describe("Round every number in the results to this many significant figures (4-6 saves output tokens); default: as each tool returns them."),
      receipt: z.boolean().optional().describe("Add input and output SHA-256 and pack versions so the result can be recomputed and compared."),
    }).strict(),
    outputSchema: open,
  }, guard(async (a) => {
    if (!a.calls && !a.name) throw new Error("Pass name (and arguments) for one call, or calls for several.");
    if (a.calls && a.name) throw new Error("Pass either name or calls, not both.");
    const calls = a.calls ?? [{ name: a.name, arguments: a.arguments }], files = [], opts = { digits: a.digits };
    const destructive = await Promise.all(calls.map(async (c) => { try { return (await toolFor(c.name, packs)).annotations?.destructiveHint; } catch { return false; } }));
    if (calls.length > 1 && destructive.some(Boolean)) throw new Error("A tool that sends orders cannot run inside a batch; call it on its own after previewing.");
    const done = [];
    if (calls.some((c) => usesResults(c.arguments))) {
      for (const c of calls) {
        try { done.push({ name: c.name, result: await runOne(packs, { name: c.name, arguments: resolveResults(c.arguments ?? {}, done) }, opts, files) }); }
        catch (e) { done.push({ name: c.name, error: e.message }); }
      }
    } else {
      done.push(...await Promise.all(calls.map((c) => runOne(packs, c, opts, files).then((result) => ({ name: c.name, result }), (e) => ({ name: c.name, error: e.message })))));
    }
    const receipt = a.receipt ? { server: `${SERVER_NAME}@${SERVER_VERSION}`, packs: Object.fromEntries([...new Set(calls.map((c) => BY_NAME.get(c.name)?.pack))].filter(Boolean).map((p) => [p, INDEX.versions[p]])), input_sha256: sha256({ calls, digits: a.digits ?? null }), output_sha256: sha256(done) } : undefined;
    if (!a.calls) { if (done[0].error) throw new Error(done[0].error); return { ...done[0].result, ...(files.length ? { files_read: files } : {}), ...(receipt ? { receipt } : {}) }; }
    const results = a.return === "last" ? done.slice(-1) : done;
    return { results, ...(files.length ? { files_read: files } : {}), ...(receipt ? { receipt } : {}) };
  }));
  registerResources(server, packs);
}

export const PRIVACY = (packs) => ({
  packs: Object.fromEntries(packs.map((p) => [p, { network: PACKS[p].network, disk: PACKS[p].disk }])),
  files: "{\"$file\": ...} arguments are read on this machine; nothing is uploaded and nothing is written by the reader",
  telemetry: "none: no analytics, logging or crash reporting",
  offline: "CANLI_OFFLINE=1 enables only the packs whose network is none (quant, validation), and no other pack's code is loaded",
  receipts: "opt-in receipts carry SHA-256 hashes, never the data",
});

function registerResources(server, packs) {
  const json = (uri, v) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(v) }] });
  server.registerResource("catalog", "canli://catalog", { title: "Tool catalog", description: "Every tool: name, pack and title.", mimeType: "application/json" },
    (uri) => json(uri.href, { tools: ENTRIES.filter((e) => packs.includes(e.pack)).length, columns: ["name", "pack", "title"], rows: ENTRIES.filter((e) => packs.includes(e.pack)).map((e) => [e.name, e.pack, e.title]) }));
  server.registerResource("packs", "canli://packs", { title: "Packs", description: "Each pack: its source package and version, tool count, network and disk use, and renamed or omitted tools.", mimeType: "application/json" },
    (uri) => json(uri.href, { enabled: packs, packs: Object.fromEntries(Object.entries(PACKS).map(([k, p]) => [k, { ...p, version: INDEX.versions[k], tools: ENTRIES.filter((e) => e.pack === k).length, renamed: RENAMES[k] ?? {}, omitted: OMITTED[k] ?? {} }])) }));
  server.registerResource("privacy", "canli://privacy", { title: "Privacy", description: "What each enabled pack sends off this machine and keeps on disk.", mimeType: "application/json" },
    (uri) => json(uri.href, PRIVACY(packs)));
  server.registerResource("tool-schema", new ResourceTemplate("canli://tools/{name}", { list: undefined, complete: { name: (v) => ENTRIES.filter((e) => packs.includes(e.pack)).map((e) => e.name).filter((n) => n.startsWith(v ?? "")).slice(0, 50) } }), { title: "Tool schema", description: "One tool's description and input JSON Schema.", mimeType: "application/json" },
    async (uri, { name }) => { const t = await toolFor(String(name), packs), s = z.toJSONSchema(t.input, { io: "input" }); delete s.$schema; return json(uri.href, { name: t.name, pack: t.pack, description: t.description, input_schema: s }); });
}

const isMain = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const packs = enabledPacks();
  const server = new McpServer(SERVER_INFO, { instructions: instructions(packs) });
  registerAll(server, packs);
  await server.connect(new StdioServerTransport());
}
