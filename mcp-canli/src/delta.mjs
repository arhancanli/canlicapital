// mcp-canli/src/delta.mjs
//
// Changes since the last read. An agent that asks the same thing again (a filing list, insider trades, a yield curve)
// reads the whole answer again, though most of it has not changed. With changes_only, run_tool keeps each call's last
// whole result in this session and answers with what changed: table rows added and removed, fields whose values
// changed, and nothing else; the whole result stays under its ref. Where a figure came from and when it was fetched
// (evidence, snapshot) and the fixed words (limits, meaning) are left out of the comparison, since they change on
// every read. The hosted server keeps nothing between requests, so there it never has an earlier read.
import { createHash } from "node:crypto";

const MAX_KEPT = 64;
const IGNORED = new Set(["evidence", "snapshot", "limits", "meaning", "limits_and_meaning", "ref", "time_machine", "preview_only"]);

const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v));
const same = (a, b) => canonical(a) === canonical(b);
const isTable = (v) => v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.columns) && Array.isArray(v.rows);

// Items of b not in a, and of a not in b, counting repeats.
function listChanges(a, b) {
  const count = new Map();
  for (const x of a) count.set(canonical(x), (count.get(canonical(x)) ?? 0) + 1);
  const added = [];
  for (const x of b) {
    const k = canonical(x), n = count.get(k) ?? 0;
    if (n > 0) count.set(k, n - 1);
    else added.push(x);
  }
  const removed = [];
  const left = new Map([...count].filter(([, n]) => n > 0));
  for (const x of a) {
    const k = canonical(x), n = left.get(k) ?? 0;
    if (n > 0) { removed.push(x); left.set(k, n - 1); }
  }
  return { added, removed };
}

// What changed from a to b, or undefined when nothing did.
export function diff(a, b, depth = 0) {
  if (same(a, b)) return undefined;
  if (isTable(a) && isTable(b) && same(a.columns, b.columns)) {
    const { added, removed } = listChanges(a.rows, b.rows);
    return { columns: b.columns, rows_added: added, rows_removed: removed };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const { added, removed } = listChanges(a, b);
    return { added, removed };
  }
  if (depth < 6 && a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (depth === 0 && IGNORED.has(k)) continue;
      if (!(k in b)) out[k] = { removed: a[k] };
      else if (!(k in a)) out[k] = { added: b[k] };
      else {
        const d = diff(a[k], b[k], depth + 1);
        if (d !== undefined) out[k] = d;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }
  return { from: a, to: b };
}

export function createDelta() {
  const last = new Map();
  return {
    // What to answer a changes_only call with, given its whole result; the result is kept for the next call.
    changes(name, args, result, at = new Date().toISOString()) {
      const key = createHash("sha256").update(canonical([name, args ?? {}])).digest("hex");
      const before = last.get(key);
      last.delete(key);
      last.set(key, { result, at });
      if (last.size > MAX_KEPT) last.delete(last.keys().next().value);
      if (!before) return { changes: "first read of this call in this session: the whole result follows; ask again with changes_only for what changed", ...result };
      const changed = diff(before.result, result);
      return changed === undefined ? { changes_since: before.at, unchanged: true } : { changes_since: before.at, changed };
    },
  };
}
