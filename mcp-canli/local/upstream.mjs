// `canli-mcp upstream add|list|remove`: the other MCP servers this one connects to, kept in
// CANLI_HOME/upstreams.json, readable only by its owner. Keys go in as ${NAME} and are read from the
// environment when canli-mcp starts, so the file need hold no secret.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { UPSTREAM_NAME, readUpstreams, whereIs } from "../src/upstreams.mjs";

const fileOf = (home) => join(home, "upstreams.json");
const saved = (home) => { try { return JSON.parse(readFileSync(fileOf(home), "utf8")); } catch { return {}; } };
const save = (home, all) => {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(home), `${JSON.stringify(all, null, 1)}\n`, { mode: 0o600 });
};
// A header or variable written out in full rather than as ${NAME}, when it looks like a key.
const looksLikeKey = (v) => !/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(v) && /[A-Za-z0-9_\-]{20,}/.test(v);

export const USAGE = `usage:
  canli-mcp upstream add <name> <url> [--header "Name: value"]... [--tools a,b*] [--write]
  canli-mcp upstream add <name> -- <command> [args...]   (with --env NAME=value before the --)
  canli-mcp upstream list
  canli-mcp upstream remove <name>
Write keys as \${NAME}: canli-mcp reads them from its environment when it starts.`;

export function upstreamCommand(home, argv) {
  const [verb, name, ...rest] = argv;
  if (verb === "list") {
    const all = readUpstreams({}, home);
    return { file: fileOf(home), servers: all.map((u) => ({ name: u.name, where: whereIs(u), ...(u.tools ? { tools: u.tools } : {}), write: Boolean(u.write) })) };
  }
  if (verb === "remove") {
    const all = saved(home);
    if (!all[name]) throw new Error(`No upstream named ${name}.`);
    delete all[name];
    save(home, all);
    return { removed: name, file: fileOf(home) };
  }
  if (verb !== "add" || !name) throw new Error(USAGE);
  if (!UPSTREAM_NAME.test(name)) throw new Error(`The name "${name}" must be 2-24 lowercase letters; it becomes the pack's name.`);
  const dash = rest.indexOf("--");
  const opts = dash >= 0 ? rest.slice(0, dash) : rest, command = dash >= 0 ? rest.slice(dash + 1) : [];
  const entry = {}, warnings = [];
  for (let i = 0; i < opts.length; i += 1) {
    const o = opts[i];
    if (o === "--write") entry.write = true;
    else if (o === "--tools") entry.tools = String(opts[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (o === "--header") {
      const h = String(opts[++i] ?? ""), at = h.indexOf(":");
      if (at < 1) throw new Error(`--header takes "Name: value", not "${h}".`);
      (entry.headers ??= {})[h.slice(0, at).trim()] = h.slice(at + 1).trim();
    } else if (o === "--env") {
      const kv = String(opts[++i] ?? ""), at = kv.indexOf("=");
      if (at < 1) throw new Error(`--env takes NAME=value, not "${kv}".`);
      (entry.env ??= {})[kv.slice(0, at)] = kv.slice(at + 1);
    } else if (!entry.url && /^https?:\/\//.test(o)) entry.url = o;
    else throw new Error(`${o}?\n${USAGE}`);
  }
  if (command.length) { entry.command = command[0]; if (command.length > 1) entry.args = command.slice(1); }
  for (const [k, v] of [...Object.entries(entry.headers ?? {}), ...Object.entries(entry.env ?? {}), ["url", entry.url ?? ""]]) {
    if (looksLikeKey(v)) warnings.push(`${k} is written out in full in ${fileOf(home)}; write it as \${NAME} to keep it in your environment instead.`);
  }
  const all = { ...saved(home), [name]: entry };
  readUpstreams({ CANLI_UPSTREAMS: JSON.stringify(all) });
  save(home, all);
  return { added: name, where: whereIs(entry), file: fileOf(home), next: "Restart canli-mcp (your MCP client restarts it): the server's tools then join find_tool and run_tool.", ...(warnings.length ? { warnings } : {}) };
}
