// One page per canli-mcp tool, at /mcp-servers/tools/<name>, so each tool can be found by what it does.
//
// The list is the released package's own: the index that ships with it (mcp-canli/src/index.json) and, for the desk
// tools built into canli-mcp itself, which are in no pack's index, the released server's ENTRIES. Each page says what
// the tool does, its arguments as the server declares them, how a model reaches it, the recorded question pages that
// call it, and the tools nearest to it.
//
// Dates: a tool page's <lastmod> and dateModified are the day its own content last changed, kept in
// config/mcp-tool-pages.json by content hash. A change to the template, the shell or another tool re-dates nothing
// (Google dropped the company pages after a sitewide re-dating on 28 Oct 2026). A deployment never invents a date: a
// page whose content no longer matches the record keeps the recorded date until the record is refreshed locally.
import { createHash } from "node:crypto";

export const TOOL_PAGES_ROUTE = "/mcp-servers/tools";
export const TOOL_PAGES_RECORD = "config/mcp-tool-pages.json";
export const toolSlug = (name) => String(name).replace(/_/g, "-");
export const toolRoute = (name) => `${TOOL_PAGES_ROUTE}/${toolSlug(name)}`;

// The desk: tools canli-mcp runs itself, across the packs, listed with the packs.
export const DESK_PACK = { id: "desk", label: "The desk, built into canli-mcp", package: "canli-mcp", covers: "a whole company in one call, workflows across the packs, holdouts and pre-registration, signed receipts and checks on answers, watches and the week across your holdings" };

// Index rows: [name, pack, toolset, title, description, keywords, args]. The released ENTRIES add the tools no index lists.
export function toolRows(index, entries = []) {
  const rows = index.tools.map((t) => [...t]);
  const have = new Set(rows.map((t) => t[0]));
  for (const e of entries) if (!have.has(e.name)) { rows.push([e.name, e.pack, e.toolset, e.title, e.description, e.keywords ?? "", e.args ?? ""]); have.add(e.name); }
  return rows;
}

// "company: string, rows?: {a, b}[], measure?: eps|revenue" -> [{ name, required, type }], split on top-level commas.
export function parseArgs(signature) {
  const out = [], s = String(signature ?? "").trim();
  if (!s) return out;
  let depth = 0, start = 0;
  const push = (part) => {
    const p = part.trim(); if (!p) return;
    const at = p.indexOf(":");
    const rawName = (at < 0 ? p : p.slice(0, at)).trim();
    out.push({ name: rawName.replace(/\?$/, ""), required: !rawName.endsWith("?"), type: at < 0 ? "" : p.slice(at + 1).trim() });
  };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if ("{[(<".includes(c)) depth += 1; else if ("}])>".includes(c)) depth -= 1;
    else if (c === "," && depth === 0) { push(s.slice(start, i)); start = i + 1; }
  }
  push(s.slice(start));
  return out;
}

const STOP = new Set(["the", "and", "for", "with", "its", "from", "all", "any", "each", "per", "one", "two", "how", "what", "who", "out", "into", "over", "your", "you", "are", "was", "not", "has", "have", "can", "get", "set", "run", "use"]);
const words = (t) => new Set((`${t[0].replace(/_/g, " ")} ${t[3]} ${t[5]}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

// The nearest tools: same pack first, ranked by shared words in name, title and keywords; ties by name.
export function relatedTools(row, rows, n = 6) {
  const mine = words(row);
  return rows.filter((t) => t[0] !== row[0]).map((t) => {
    const w = words(t); let shared = 0; for (const x of w) if (mine.has(x)) shared += 1;
    return { t, shared, score: shared / Math.sqrt(w.size * mine.size || 1) + (t[1] === row[1] ? 0.05 : 0) + (t[2] === row[2] ? 0.05 : 0) };
  }).filter((x) => x.shared >= 2 && x.score > 0.12).sort((a, b) => b.score - a.score || a.t[0].localeCompare(b.t[0])).slice(0, n).map((x) => x.t);
}

// What a page shows, apart from its template: the hash that dates it.
export function contentOf(row, rows, questions) {
  return { row, related: relatedTools(row, rows).map((t) => [t[0], t[3]]), questions: questions.map((q) => [q.slug, q.question]) };
}
export const contentHash = (content) => createHash("sha256").update(JSON.stringify(content)).digest("hex");

// The record of each page's content hash and dates. today: YYYY-MM-DD; refresh false keeps every recorded date
// (a deployment), and a tool new to the record then has no date rather than an invented one.
export function datePages(record, contents, { today, refresh }) {
  const tools = {}, changed = [];
  for (const [name, content] of contents) {
    const hash = contentHash(content), was = record?.tools?.[name];
    if (was && was.sha256 === hash) tools[name] = was;
    else if (refresh) { tools[name] = { sha256: hash, first: was?.first ?? today, changed: today }; changed.push(name); }
    else if (was) tools[name] = was;
    else tools[name] = { sha256: hash, first: null, changed: null };
  }
  return { record: { schema: "canli.mcp-tool-pages.v1", note: "Each tool page's content hash and the day it last changed; refreshed by scripts/build-mcp-pages.mjs --refresh-tool-dates.", tools }, changed };
}
