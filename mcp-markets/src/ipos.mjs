// The IPO pipeline: registration statements filed (Form S-1, or F-1 for a foreign company) and
// offerings priced (the final prospectus, Rule 424(b)(4)), from EDGAR full-text search. A filer with
// no ticker yet is an IPO candidate; a blank-check company (SIC 6770, or "Acquisition" in its name)
// is a SPAC; a filer that already trades is registering a follow-on or a resale. A priced deal's
// price and share count are read from its prospectus cover.
import { z } from "zod";

import { getJson, getText } from "./sources.mjs";
import { htmlToText } from "./html.mjs";

const EFTS = "https://efts.sec.gov/LATEST/search-index";

export const ipoInput = z.object({
  days: z.number().int().min(1).max(120).optional().describe("Filings in the last this many days; default 30."),
  kind: z.enum(["ipo", "spac", "fund", "all"]).optional().describe("ipo (default): companies with no ticker yet; spac: blank-check companies; fund: ETF and trust registrations (crypto ETFs, say); all: every S-1 and F-1, follow-ons and resales too."),
  priced: z.number().int().min(0).max(40).optional().describe("Priced offerings (424B4) to read the cover of; default 15."),
}).strict();

// Display names read "Name  (TICK, TICKW)  (CIK 0001234567)".
export function parseFiler(display) {
  const m = /^(.*?)\s+(?:\(([A-Z0-9., -]+)\)\s+)?\(CIK (\d{10})\)$/.exec(String(display ?? "").trim());
  return m ? { name: m[1].trim(), tickers: m[2] ? m[2].split(",").map((t) => t.trim()).filter(Boolean) : [], cik: Number(m[3]) } : { name: display ?? null, tickers: [], cik: null };
}
export function kindOf(filer, sics, { priced = false } = {}) {
  if ((sics ?? []).includes("6770") || /\bacquisition (?:corp|company|co|ltd|limited|inc)\b/i.test(filer.name ?? "")) return "spac";
  if (/\b(?:ETF|Trust|Fund)\b/.test(filer.name ?? "") || (sics ?? []).includes("6221")) return "fund";
  // A priced deal has its ticker by then, so a ticker tells nothing there.
  if (!priced && filer.tickers.length) return "listed";
  return priced ? "company" : "ipo";
}

// The price per share and the shares offered, from a prospectus cover's first words.
export function coverTerms(text) {
  const t = String(text).slice(0, 12000).replace(/\s+/g, " ");
  // The first "$X per share" that is not a par value ("par value $0.0001 per share").
  let p = null;
  for (const m of t.matchAll(/\$\s?(\d{1,4}(?:\.\d{1,4})?)\s*per (?:share|unit|ADS)/gi)) {
    if (/par value\s*(?:of\s*)?$/i.test(t.slice(Math.max(0, m.index - 25), m.index))) continue;
    p = Number(m[1]); break;
  }
  const shares = /([\d,]{5,})\s+(?:shares|units|American Depositary Shares)\b/i.exec(t);
  const n = shares ? Number(shares[1].replace(/,/g, "")) : null;
  return { price: p, shares: n, gross: p && n ? Math.round(p * n) : null };
}

async function search(session, forms, from, to, pages) {
  const byAcc = new Map();
  for (let page = 0; page < pages; page += 1) {
    const p = new URLSearchParams({ q: "\"\"", forms, dateRange: "custom", startdt: from, enddt: to, from: String(page * 100) });
    const r = await getJson(session, `${EFTS}?${p}`);
    const hits = r?.hits?.hits ?? [];
    for (const h of hits) {
      const [acc, file] = String(h._id).split(":"), s = h._source ?? {};
      const cur = byAcc.get(acc);
      // The main document is the one whose type is the form itself (exhibits come as EX-...).
      const main = s.file_type === s.form || (!String(s.file_type ?? "").startsWith("EX") && !cur?.main);
      if (!cur || (main && !cur.main)) byAcc.set(acc, { acc, file, form: s.form, filed: s.file_date, display: (s.display_names ?? [])[0], sics: s.sics ?? [], place: (s.biz_locations ?? [])[0] ?? null, cik: Number((s.ciks ?? [])[0]) || null, main });
    }
    if (hits.length < 100) break;
  }
  return [...byAcc.values()];
}

export async function ipoPipeline(session, args) {
  const a = ipoInput.parse(args);
  const to = new Date(session.now()).toISOString().slice(0, 10), from = new Date(session.now() - (a.days ?? 30) * 86400000).toISOString().slice(0, 10);
  const want = a.kind ?? "ipo";
  const [registered, prospectuses] = await Promise.all([search(session, "S-1,F-1", from, to, 6), search(session, "424B4", from, to, 2)]);
  // Each company once, at its latest registration filing (an amendment means the deal is moving).
  const latest = new Map();
  for (const f of registered.sort((x, y) => y.filed.localeCompare(x.filed))) { const k = f.cik ?? f.display; if (!latest.has(k)) latest.set(k, f); }
  const all = [...latest.values()].map((f) => ({ ...f, filer: parseFiler(f.display) })).map((f) => ({ ...f, kind: kindOf(f.filer, f.sics) }));
  const filed = all.filter((f) => want === "all" || f.kind === want);
  const priced = [];
  for (const f of prospectuses.sort((x, y) => y.filed.localeCompare(x.filed)).slice(0, a.priced ?? 15)) {
    const filer = parseFiler(f.display), url = f.cik ? `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.acc.replace(/-/g, "")}/${f.file}` : null;
    let terms = { price: null, shares: null, gross: null };
    if (url && /\.(?:htm|html|txt)$/i.test(f.file)) { try { terms = coverTerms(htmlToText(await getText(session, url, { maxBytes: 8 * 1024 * 1024, variant: "cover" }))); } catch { /* listed without terms */ } }
    priced.push([f.filed, filer.name, filer.tickers.join(", ") || null, terms.price, terms.shares, terms.gross, kindOf(filer, f.sics, { priced: true }), url]);
  }
  return {
    from, to, kind: want,
    registrations: { note: "Companies that filed a registration statement (S-1, F-1) or an amendment (S-1/A, F-1/A) in the window, each once at its latest filing, newest first.", columns: ["filed", "company", "tickers", "kind", "form", "sic", "location", "url"], rows: filed.slice(0, 80).map((f) => [f.filed, f.filer.name, f.filer.tickers.join(", ") || null, f.kind, f.form, f.sics[0] ?? null, f.place, f.cik ? `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.acc.replace(/-/g, "")}/${f.file}` : null]) },
    counts: Object.fromEntries(["ipo", "spac", "fund", "listed"].map((k) => [k, all.filter((f) => f.kind === k).length])),
    priced: { note: "Final prospectuses (424B4) in the window, newest first; price and shares are read from the cover's first words and can miss a range or a unit structure.", columns: ["filed", "company", "tickers", "price", "shares", "gross_proceeds", "kind", "url"], rows: priced },
    source: `${EFTS} (EDGAR full-text search: forms S-1, F-1 and 424B4)`,
    limits: ["Full-text search indexes filings within a day or so; a registration filed confidentially (as most large IPOs first are) appears only when made public, about 15 days before the roadshow.", "Not investment advice."],
  };
}
