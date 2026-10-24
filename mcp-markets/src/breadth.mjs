// Breadth of institutional ownership: how many 13F filers report holding a company's shares, quarter
// by quarter, from EDGAR full-text search over 13F information tables (each manager's quarterly list
// of holdings, which the search indexes). Chen, Hong and Stein (2002) found that a fall in breadth
// (fewer institutions holding a stock) predicted lower returns: the holders who would sell are out.
// The company's CUSIP is read from a 13F information table that lists it, unless one is given.
import { z } from "zod";

import { getJson, getText, resolveEntity } from "./sources.mjs";

export const ownershipInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name."),
  cusip: z.string().regex(/^[0-9A-Z]{8}[0-9]$/i).optional().describe("Or the share class's 9-character CUSIP (037833100 for Apple)."),
  quarters: z.number().int().min(2).max(12).optional().describe("Quarters of 13F filings to count, newest first; default 6."),
  holders: z.number().int().min(0).max(100).optional().describe("Filers to list from the latest quarter; default 20."),
}).strict();

const EFTS = "https://efts.sec.gov/LATEST/search-index";
const key = (s) => String(s ?? "").replace(/&(amp|apos|#39);/gi, (_, e) => (e.toLowerCase() === "amp" ? "&" : "'")).toUpperCase().replace(/\/[A-Z]{2,3}\/?/g, " ").replace(/&/g, " AND ").replace(/[^A-Z0-9 ]+/g, " ").replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|PLC|HOLDINGS?|GROUP|THE|CL [A-C]|CLASS [A-C]|COM|NEW|DEL)\b/g, " ").replace(/\s+/g, " ").trim();

// 13F reports are due 45 days after a quarter ends: filings made in a calendar quarter report the
// quarter before it. Each window is a calendar quarter of filing dates.
export function filingQuarters(today, n) {
  const d = new Date(today);
  let y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3); // current quarter (0-3), still filling
  const out = [];
  for (let k = 0; k < n; k += 1) {
    q -= 1; if (q < 0) { q = 3; y -= 1; }
    const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    const endMonth = q * 3 + 3, last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const holdingsQ = q === 0 ? `${y - 1}Q4` : `${y}Q${q}`;
    out.push({ filed_from: start, filed_to: `${y}-${String(endMonth).padStart(2, "0")}-${last}`, holdings_quarter: holdingsQ });
  }
  return out;
}

// 13F tables shorten issuer names ("COSTCO WHSL CORP NEW" for Costco Wholesale): two names match when
// they have the same words, each the same or one an abbreviation of the other (its letters in order,
// starting with the same letter), and the same first word.
const abbreviates = (a, b) => { if (a.length > b.length) [a, b] = [b, a]; if (a.length < 2 || a[0] !== b[0]) return false; let i = 0; for (const ch of b) if (ch === a[i]) i += 1; return i === a.length; };
export function sameIssuer(a, b) {
  const x = key(a).split(" ").filter(Boolean), y = key(b).split(" ").filter(Boolean);
  return x.length > 0 && x.length === y.length && x[0] === y[0] && x.every((w, i) => w === y[i] || abbreviates(w, y[i]));
}
// A CUSIP's ninth character is a check digit (the "modulus 10 double add double" of the first eight).
export function cusipValid(c) {
  if (!/^[0-9A-Z*@#]{8}[0-9]$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const ch = c[i], v = /\d/.test(ch) ? Number(ch) : /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : { "*": 36, "@": 37, "#": 38 }[ch];
    const d = i % 2 ? v * 2 : v;
    sum += Math.floor(d / 10) + (d % 10);
  }
  return (10 - (sum % 10)) % 10 === Number(c[8]);
}

// The CUSIP 13F filers give a company: from information tables that name it, the valid CUSIP most
// often beside a matching issuer name, and the other classes seen (Alphabet's A and C shares share a
// name). The search is by the name's first word, since the tables abbreviate the rest; the company's
// own 13Fs are skipped (a bank's or insurer's can be too large to read).
async function cusipOf(session, name) {
  const words = key(name).split(" ").filter(Boolean);
  // The first two words as a phrase when there are two ("JPMORGAN CHASE", not every JPMorgan ETF), then
  // the first alone ("COSTCO", whose tables say "COSTCO WHSL").
  const queries = [...new Set([words.slice(0, 2).join(" "), words[0]].filter(Boolean))];
  // Last year's filings only: their information tables are XML, and the CUSIP is the current one.
  const day = (t) => new Date(t).toISOString().slice(0, 10), now = session.now();
  const hits = [];
  for (const q of queries) {
    const p = new URLSearchParams({ q: `"${q}"`, forms: "13F-HR", dateRange: "custom", startdt: day(now - 400 * 86400000), enddt: day(now) });
    hits.push(...((await getJson(session, `${EFTS}?${p}`))?.hits?.hits ?? []).filter((h) => /\.xml$/i.test(String(h._id))));
  }
  const votes = new Map(), seen = new Set();
  let read = 0, matched = 0;
  for (const h of hits) {
    if (read >= 8) break;
    if (seen.has(h._id)) continue;
    seen.add(h._id);
    const filer = (h._source.display_names ?? [])[0]?.replace(/\s+\(CIK \d+\)$/, "") ?? "";
    if (sameIssuer(filer, name)) continue;
    const [adsh, file] = String(h._id).split(":");
    const cik = Number((h._source.ciks ?? [])[0]);
    if (!adsh || !file || !cik) continue;
    read += 1;
    const xml = await getText(session, `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/${file}`, { maxBytes: 8 * 1024 * 1024 }).catch(() => "");
    const here = new Map();
    for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
      const issuer = /<(?:\w+:)?nameOfIssuer>([^<]*)</.exec(m[1])?.[1], cusip = /<(?:\w+:)?cusip>([^<]*)</.exec(m[1])?.[1]?.trim().toUpperCase();
      const title = /<(?:\w+:)?titleOfClass>([^<]*)</.exec(m[1])?.[1]?.trim() ?? null;
      if (!issuer || !cusip || !cusipValid(cusip) || !sameIssuer(issuer, name)) continue;
      if (!here.has(cusip)) here.set(cusip, title);
    }
    // One vote per table, and three tables that name it: one filer's slip does not decide it.
    for (const [cusip, title] of here) { const v = votes.get(cusip) ?? { cusip, title_of_class: title, tables: 0 }; v.tables += 1; votes.set(cusip, v); }
    if (here.size) matched += 1;
    if (matched >= 3) break;
  }
  let classes = [...votes.values()].sort((a, b) => b.tables - a.tables).slice(0, 4);
  // More than one: the one most filers list in the latest quarter (a class most hold, or the CUSIP
  // most still use after a change), each with its count.
  if (classes.length > 1) {
    const w = filingQuarters(now, 1)[0];
    for (const c of classes) {
      const p = new URLSearchParams({ q: `"${c.cusip}"`, forms: "13F-HR", dateRange: "custom", startdt: w.filed_from, enddt: w.filed_to });
      c.filers = (await getJson(session, `${EFTS}?${p}`))?.hits?.total?.value ?? 0;
    }
    classes = classes.sort((a, b) => b.filers - a.filers);
  }
  return { cusip: classes[0]?.cusip ?? null, classes };
}

export async function ownershipBreadth(session, args) {
  const a = ownershipInput.parse(args);
  if (!a.company && !a.cusip) throw new Error("ownership_breadth needs company or cusip.");
  let who = null, cusip = a.cusip?.toUpperCase() ?? null, classes = null;
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    who = { cik: e.cik, name: e.name, ticker: e.ticker ?? null };
    if (!cusip) {
      ({ cusip, classes } = await cusipOf(session, e.name ?? a.company));
      if (!cusip) throw new Error(`No 13F information table names ${e.name ?? a.company} in a way that gives its CUSIP; pass cusip (the share class's 9-character CUSIP).`);
    }
  }
  const windows = filingQuarters(session.now(), a.quarters ?? 6);
  const rows = [];
  let latest = null;
  for (const w of windows) {
    const p = new URLSearchParams({ q: `"${cusip}"`, forms: "13F-HR", dateRange: "custom", startdt: w.filed_from, enddt: w.filed_to });
    const r = await getJson(session, `${EFTS}?${p}`);
    const total = r?.hits?.total?.value ?? 0;
    rows.push([w.holdings_quarter, w.filed_from, w.filed_to, total, r?.hits?.total?.relation === "gte"]);
    latest ??= r;
  }
  const counts = rows.map((x) => x[3]);
  // Filers in recent quarters and none before: a CUSIP new in that time (a company's CUSIP changes in a
  // reorganisation or redomicile), not a jump in ownership.
  const firstSeen = counts.findIndex((n, i) => n > 0 && counts.slice(i + 1).length > 0 && counts.slice(i + 1).every((m) => m === 0));
  const change = counts.length > 1 && counts[1] ? Math.round((counts[0] / counts[1] - 1) * 10000) / 10000 : null;
  const holders = (latest?.hits?.hits ?? []).slice(0, a.holders ?? 20).map((h) => [(h._source.display_names ?? [])[0]?.replace(/\s+\(CIK \d+\)$/, "").replace(/\s+/g, " ") ?? null, Number((h._source.ciks ?? [])[0]) || null, h._source.file_date, String(h._id).split(":")[0]]);
  return {
    ...(who ? { company: who } : {}), cusip,
    ...(classes?.length > 1 ? { other_cusips: { note: "CUSIPs 13F tables list under this name (share classes, or a CUSIP that changed); the one most filers list in the latest quarter is counted. Pass cusip to count another.", columns: ["cusip", "title_of_class", "filers_latest_quarter"], rows: classes.map((c) => [c.cusip, c.title_of_class, c.filers]) } } : {}),
    columns: ["holdings_quarter", "filed_from", "filed_to", "filers", "at_least"],
    rows,
    change_latest_vs_prior: change,
    ...(firstSeen >= 0 ? { warning: `No 13F lists ${cusip} before ${rows[firstSeen][0]}: a CUSIP new then, as when a company's CUSIP changes in a reorganisation; earlier quarters were filed under the old one (pass it as cusip to count them).` } : {}),
    holders_sample: { note: "13F filers whose latest-quarter information table lists the CUSIP, in search order (not by size).", columns: ["manager", "cik", "filed", "accession"], rows: holders },
    meaning: "filers counts the 13F information tables filed in each window that list the CUSIP: the number of institutions (managers with over $100 million in US equities) reporting the stock. The newest window may still be filling: 13Fs are due 45 days after the quarter. Chen, Hong and Stein (2002): a fall in breadth predicted lower returns.",
    source: `${EFTS} (EDGAR full-text search over 13F information tables)`,
    limits: ["A count of filings that list the CUSIP, not of shares or value.", "Options and other share classes have other CUSIPs; pass cusip to count one class.", "Not investment advice."],
  };
}
