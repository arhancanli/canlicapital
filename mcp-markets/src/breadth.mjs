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
const key = (s) => String(s ?? "").toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]+/g, " ").replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|PLC|HOLDINGS?|GROUP|THE|CL [A-C]|CLASS [A-C]|COM|NEW|DEL)\b/g, " ").replace(/\s+/g, " ").trim();

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

// The CUSIP 13F filers give a company: from information tables that name it, the CUSIP most often
// beside a matching issuer name.
async function cusipOf(session, name) {
  const p = new URLSearchParams({ q: `"${name}"`, forms: "13F-HR" });
  const r = await getJson(session, `${EFTS}?${p}`);
  const want = key(name), votes = new Map();
  for (const h of (r?.hits?.hits ?? []).slice(0, 4)) {
    const [adsh, file] = String(h._id).split(":");
    const cik = Number((h._source.ciks ?? [])[0]);
    if (!adsh || !file || !cik) continue;
    const xml = await getText(session, `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/${file}`, { maxBytes: 8 * 1024 * 1024 }).catch(() => "");
    for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
      const issuer = /<(?:\w+:)?nameOfIssuer>([^<]*)</.exec(m[1])?.[1], cusip = /<(?:\w+:)?cusip>([^<]*)</.exec(m[1])?.[1]?.trim().toUpperCase();
      if (issuer && cusip && key(issuer) === want) votes.set(cusip, (votes.get(cusip) ?? 0) + 1);
    }
    if (votes.size) break;
  }
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function ownershipBreadth(session, args) {
  const a = ownershipInput.parse(args);
  if (!a.company && !a.cusip) throw new Error("ownership_breadth needs company or cusip.");
  let who = null, cusip = a.cusip?.toUpperCase() ?? null;
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    who = { cik: e.cik, name: e.name, ticker: e.ticker ?? null };
    if (!cusip) {
      cusip = await cusipOf(session, e.name ?? a.company);
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
  const change = counts.length > 1 && counts[1] ? Math.round((counts[0] / counts[1] - 1) * 10000) / 10000 : null;
  const holders = (latest?.hits?.hits ?? []).slice(0, a.holders ?? 20).map((h) => [(h._source.display_names ?? [])[0]?.replace(/\s+\(CIK \d+\)$/, "").replace(/\s+/g, " ") ?? null, Number((h._source.ciks ?? [])[0]) || null, h._source.file_date, String(h._id).split(":")[0]]);
  return {
    ...(who ? { company: who } : {}), cusip,
    columns: ["holdings_quarter", "filed_from", "filed_to", "filers", "at_least"],
    rows,
    change_latest_vs_prior: change,
    holders_sample: { note: "13F filers whose latest-quarter information table lists the CUSIP, in search order (not by size).", columns: ["manager", "cik", "filed", "accession"], rows: holders },
    meaning: "filers counts the 13F information tables filed in each window that list the CUSIP: the number of institutions (managers with over $100 million in US equities) reporting the stock. The newest window may still be filling: 13Fs are due 45 days after the quarter. Chen, Hong and Stein (2002): a fall in breadth predicted lower returns.",
    source: `${EFTS} (EDGAR full-text search over 13F information tables)`,
    limits: ["A count of filings that list the CUSIP, not of shares or value.", "Options and other share classes have other CUSIPs; pass cusip to count one class.", "Not investment advice."],
  };
}
