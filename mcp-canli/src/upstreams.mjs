// mcp-canli/src/upstreams.mjs
//
// Other MCP servers behind this one. Each server named in CANLI_UPSTREAMS, or in upstreams.json in
// CANLI_HOME (which `canli-mcp upstream add` writes), is connected when this server starts. Its tools
// join find_tool's search and run_tool's batches, budgets, receipts, policy file and audit log like a
// pack's, and none of them is in the client's tool list, so a server with hundreds of tools costs the
// model nothing until one is used. A tool that sends orders or changes anything stays off unless its
// server is marked write: true, and then it runs alone, never inside a batch. Keys are written as
// ${NAME} and read from the environment when the server starts, so the file holds no secret.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const UPSTREAM_NAME = /^[a-z]{2,24}$/;
const ENTRY = z.object({
  url: z.string().min(1).max(2000).optional(),
  headers: z.record(z.string().max(200), z.string().max(4000)).optional(),
  command: z.string().min(1).max(400).optional(),
  args: z.array(z.string().max(2000)).max(64).optional(),
  env: z.record(z.string().max(200), z.string().max(4000)).optional(),
  tools: z.array(z.string().min(1).max(80)).max(500).optional(),
  write: z.boolean().optional(),
  title: z.string().max(80).optional(),
}).strict();

// The servers to connect, from CANLI_UPSTREAMS (JSON, or the path of a JSON file) or else
// CANLI_HOME/upstreams.json: an object of entries by name, each a url (with headers) or a command
// (with args and env), optionally the only tools to offer (names, * for any run of characters) and
// write: true to offer the tools that change things.
export function readUpstreams(env = process.env, home = null) {
  const raw = String(env.CANLI_UPSTREAMS ?? "").trim();
  let from = null, text = null;
  if (raw.startsWith("{")) [from, text] = ["CANLI_UPSTREAMS", raw];
  else if (raw) [from, text] = [raw, readFileSync(raw, "utf8")];
  else if (home) {
    from = join(home, "upstreams.json");
    try { text = readFileSync(from, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw new Error(`${from}: ${e.message}`); }
  }
  if (text === null) return [];
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error(`${from}: not JSON (${e.message}).`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${from}: give an object of servers by name.`);
  return Object.entries(parsed).map(([name, v]) => {
    if (!UPSTREAM_NAME.test(name)) throw new Error(`${from}: the server name "${name}" must be 2-24 lowercase letters.`);
    const r = ENTRY.safeParse(v);
    if (!r.success) throw new Error(`${from}: ${name}: ${r.error.issues.map((i) => `${i.path.join(".") || "the entry"}: ${i.message}`).join("; ")}.`);
    if (Boolean(r.data.url) === Boolean(r.data.command)) throw new Error(`${from}: ${name}: give a url or a command, not both.`);
    if (r.data.url && !/^https?:\/\//.test(r.data.url)) throw new Error(`${from}: ${name}: the url must start with https:// (or http:// for this machine).`);
    return { name, ...r.data };
  });
}

// ${NAME} from the environment. A name that is not set stops that server, naming the variable and
// never a value.
export function expand(s, env = process.env) {
  return String(s).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => {
    if (env[k] === undefined || env[k] === "") throw new Error(`${k} is not set`);
    return env[k];
  });
}
const expandAll = (o, env) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, expand(v, env)]));

// Where a server is, for canli://privacy and receipts, without any key in its address.
export function whereIs(u) {
  if (u.command) return [u.command, ...(u.args ?? [])].join(" ").replace(/\$\{[^}]+\}/g, "…").slice(0, 200);
  try { return new URL(u.url.replace(/\$\{[^}]+\}/g, "x")).host; } catch { return "an address that does not parse"; }
}

// A tool name as this server's catalog takes it: lowercase words joined by underscores.
export function plainName(s) {
  return String(s).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "t_$1").slice(0, 64);
}

// Whether a tool changes something. Its own annotations decide when it gives them; otherwise its name:
// one that starts with a reading verb (get, list, search...) reads, one that starts with a verb that
// acts (place, cancel, transfer...) or names orders acts, and anything else reads.
const READS = /^(?:get|list|search|fetch|find|read|query|lookup|look_up|describe|show|check|calc|calculate|compute|analy[sz]e|estimate|screen|scan|preview|stream|download|view|explain|summari[sz]e|compare|history|historical|quote|quotes)(?:_|$)/;
const ACTS = /^(?:place|submit|send|create|cancel|close|liquidate|transfer|withdraw|deposit|buy|sell|delete|remove|update|modify|replace|exercise|swap|bridge|stake|unstake|approve|sign|execute|set|add|post|put|write|open|edit|change|move|pay|mint|burn|borrow|repay|lend|rebalance|trade)(?:_|$)|(?:^|_)orders?(?:_|$)/;
export function changesThings(tool, name) {
  const a = tool.annotations ?? {};
  if (a.destructiveHint === true) return true;
  if (a.readOnlyHint === true) return false;
  if (READS.test(name)) return false;
  return ACTS.test(name);
}

const glob = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
const within = (p, ms, what) => Promise.race([p, new Promise((_, reject) => { const t = setTimeout(() => reject(new Error(`${what} did not answer in ${Math.round(ms / 1000)} s`)), ms); t.unref?.(); })]);

// A tool's result as the packs give theirs: its structured content, else its text read as JSON, else
// the text itself.
function resultOf(r, name) {
  const texts = (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
  if (r?.isError) throw new Error(texts.join("\n").slice(0, 4000) || `${name} failed`);
  if (r?.structuredContent && typeof r.structuredContent === "object") return r.structuredContent;
  const text = texts.join("\n");
  try { const v = JSON.parse(text); if (v && typeof v === "object") return v; } catch { /* plain text */ }
  const other = (r?.content ?? []).filter((c) => c.type !== "text").length;
  return { text, ...(other ? { left_out: `${other} part${other > 1 ? "s" : ""} that are not text (images, audio or files)` } : {}) };
}

// Connects to one server and lists its tools as catalog entries. taken(name) says whether a name is
// already a tool here; a name that is gets the server's name in front of it.
export async function connectUpstream(u, { env = process.env, version = "0", taken = () => false, timeoutMs = 20000 } = {}) {
  const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const client = new Client({ name: "canli-mcp", version });
  // A server run as a command is started from local/commands.mjs, the one place canli-mcp starts programs.
  const transport = u.url
    ? new StreamableHTTPClientTransport(new URL(expand(u.url, env)), { requestInit: { headers: expandAll(u.headers, env) } })
    : (await import("../local/commands.mjs")).stdioTransport({ command: expand(u.command, env), args: (u.args ?? []).map((x) => expand(x, env)), env: expandAll(u.env, env) });
  await within(client.connect(transport), timeoutMs, `The ${u.name} server`);
  const listed = [];
  for (let cursor, page = 0; page < 50; page += 1) {
    const r = await within(client.listTools(cursor ? { cursor } : undefined), timeoutMs, `The ${u.name} server's tool list`);
    listed.push(...(r.tools ?? []));
    cursor = r.nextCursor;
    if (!cursor) break;
  }
  const only = u.tools?.map(glob);
  const tools = [], hidden = [], used = new Set();
  for (const t of listed) {
    if (only && !only.some((re) => re.test(t.name))) continue;
    let name = plainName(t.name);
    if (!name) continue;
    if (taken(name) || used.has(name)) name = `${u.name}_${name}`.slice(0, 64);
    if (taken(name) || used.has(name)) continue;
    const acts = changesThings(t, plainName(t.name));
    if (acts && !u.write) { hidden.push(t.name); continue; }
    let input;
    try { input = z.fromJSONSchema(t.inputSchema ?? { type: "object" }); } catch { input = z.looseObject({}); }
    if (!input.shape) input = z.looseObject({});
    used.add(name);
    tools.push({
      name, original: t.name, pack: u.name, title: t.title ?? t.annotations?.title ?? t.name,
      description: String(t.description ?? "").replace(/\s+/g, " ").trim().slice(0, 2000),
      keywords: "", input,
      annotations: acts ? { ...t.annotations, readOnlyHint: false, destructiveHint: true } : { ...t.annotations, readOnlyHint: true, destructiveHint: false },
      async run(args) { return resultOf(await client.callTool({ name: t.name, arguments: args ?? {} }), t.name); },
    });
  }
  return { client, tools, hidden, listed: listed.length };
}
