// Who depends on whom, from what companies say in their own annual reports: every filer that names a
// company, with the passage, and whether it reads as a supplier, a customer or a competitor. It follows a
// name through EDGAR's full-text search, so it sees what no fund report or data vendor's list shows.
import { z } from "zod";

import { htmlToText } from "./html.mjs";
import { getText } from "./sources.mjs";
import { searchFilings } from "./tools.mjs";

export const exposureInput = z.object({
  name: z.string().min(2).max(80).describe("The company or thing to follow, as filings write it, such as Taiwan Semiconductor."),
  also: z.array(z.string().min(2).max(80)).max(5).optional().describe("Other names for it, such as TSMC."),
  forms: z.array(z.string().min(1).max(10)).max(5).optional().describe("Default 10-K and 20-F."),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Filed since this date; default about 15 months ago, so each filer's latest annual report is in."),
  limit: z.number().int().min(1).max(40).optional().describe("Most filers to read; default 20, and 10 on the hosted server."),
}).strict();

const SUPPLIER = /\b(?:suppliers?|sole[- ]sourced?|single[- ]sourced?|foundr(?:y|ies)|contract manufactur\w*|manufactured by|fabricat\w*|wafers?|rel(?:y|ies|iance) (?:on|upon)|depend(?:s|ent|ence)? (?:on|upon)|purchase[sd]? from|sourced? from|licens\w+ from)\b/i;
const CUSTOMER = /\b(?:customers?|accounted for|percent of (?:our |total |net )*(?:sales|revenues?)|% of (?:our |total |net )*(?:sales|revenues?)|sales to|sold to)\b/i;
const COMPETITOR = /\b(?:compet\w+|rivals?)\b/i;

// By rules on the words around the name. A supplier's words win over a customer's, since a filing about a
// supplier also talks about its own customers.
export function relationIn(passage) {
  if (SUPPLIER.test(passage)) return "supplier";
  if (COMPETITOR.test(passage)) return "competitor";
  if (CUSTOMER.test(passage)) return "customer";
  return "mentioned";
}

// The best passage around each mention: the window that names a relation, if any does.
export function passagesAbout(text, names, { reach = 170, most = 12 } = {}) {
  const flat = String(text).replace(/\s+/g, " "), lower = flat.toLowerCase(), out = [];
  for (const name of names) {
    const n = name.toLowerCase();
    for (let at = lower.indexOf(n); at >= 0 && out.length < most * names.length; at = lower.indexOf(n, at + n.length + reach)) {
      out.push(flat.slice(Math.max(0, at - reach), at + n.length + reach).trim());
    }
  }
  const rank = { supplier: 0, customer: 1, competitor: 2, mentioned: 3 };
  return out.map((text_) => ({ text: text_, relation: relationIn(text_) })).sort((a, b) => rank[a.relation] - rank[b.relation]);
}

export const parseFiler = (filer) => {
  const m = String(filer).match(/^(.*?)\s*(?:\(([A-Z0-9.,\s-]{1,30})\)\s*)?\(CIK (\d+)\)/);
  return m ? { name: m[1].trim(), ticker: m[2]?.split(/[,\s]/)[0] ?? null, cik: m[3] } : { name: String(filer), ticker: null, cik: null };
};

export async function exposureMap(session, args) {
  const a = exposureInput.parse(args);
  const names = [a.name, ...(a.also ?? [])];
  const since = a.since ?? new Date(session.now() - 456 * 86400000).toISOString().slice(0, 10);
  const query = names.map((n) => `"${n.replace(/"/g, "")}"`).join(" OR ");
  const found = await searchFilings(session, { query, forms: a.forms ?? ["10-K", "20-F"], since, limit: 100 });
  const at = (name) => found.columns.indexOf(name);
  // Each filer once, its latest report. A filer's own reports do not count as someone depending on it.
  const self = new RegExp(`^${a.name.split(/\s+/)[0].replace(/[^\w]/g, "")}\\b`, "i");
  const filers = new Map();
  for (const row of found.rows ?? []) {
    const f = parseFiler(row[at("filer")]);
    if (self.test(f.name)) continue;
    const key = f.cik ?? f.name, have = filers.get(key);
    if (!have || row[at("filed")] > have.filed) filers.set(key, { ...f, filed: row[at("filed")], form: row[at("form")], url: row[at("url")] });
  }
  const list = [...filers.values()].slice(0, session.env.VERCEL ? Math.min(a.limit ?? 10, 10) : a.limit ?? 20);
  const rows = [], unread = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
    while (next < list.length) {
      const f = list[next]; next += 1;
      try {
        const text = await getText(session, f.url, { maxBytes: 32 * 1024 * 1024, transform: (t) => (/\.txt$/i.test(f.url) ? t : htmlToText(t)) });
        const [best] = passagesAbout(text, names);
        if (best) rows.push([f.name, f.ticker, f.filed, f.form, best.relation, best.text.slice(0, 340), f.url]);
        else unread.push(f.name);
      } catch { unread.push(f.name); }
    }
  }));
  const order = { supplier: 0, customer: 1, competitor: 2, mentioned: 3 };
  rows.sort((x, y) => order[x[4]] - order[y[4]] || (x[2] < y[2] ? 1 : -1));
  return {
    name: a.name, ...(a.also?.length ? { also: a.also } : {}),
    filers_found: filers.size, filers_read: rows.length, documents_matching: found.total ?? null,
    counts: Object.fromEntries(Object.keys(order).map((k) => [k, rows.filter((r) => r[4] === k).length])),
    columns: ["filer", "ticker", "filed", "form", "relation", "passage", "url"], rows,
    ...(unread.length ? { not_read: unread.slice(0, 12) } : {}),
    meaning: `relation is what the words around "${a.name}" suggest about how it relates to the filer: a supplier of the filer, a customer, a competitor, or only mentioned. Read the passage: this is by rules on the words, not understanding.`,
    sources: ["EDGAR full-text search, and the filers' own reports"],
    limits: [
      "A name in a filing is a mention, not a measure: most filers do not say how much they depend on anyone, and many keep suppliers unnamed.",
      "The search returns documents, so a filer can be missed, and a common name can bring in something unrelated.",
    ],
  };
}
