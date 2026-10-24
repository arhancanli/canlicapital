// A comparable-companies table: the company beside its listed peers in the same SEC industry code,
// the ones nearest in size, on the same fiscal-year footing as screen_companies, with the peers'
// median and the company's rank on each measure.
import { z } from "zod";

import { ALL_METRICS, screenCompanies } from "./research.mjs";
import { getText, resolveEntity, submissions } from "./sources.mjs";

const DEFAULT = ["revenue", "revenue_growth", "gross_margin", "operating_margin", "net_margin", "roe", "rd_intensity", "fcf_margin"];

export const compsInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  metrics: z.array(z.string().refine((m) => ALL_METRICS.includes(m), { message: `a metric: ${ALL_METRICS.join(", ")}` })).min(1).max(12).optional().describe("Measures to compare; default revenue, growth, margins, ROE, R&D intensity and FCF margin."),
  peers: z.number().int().min(2).max(30).optional().describe("Peers to show, nearest in revenue; default 8."),
  period: z.string().max(12).optional().describe("FY2025: each company's fiscal year that best overlaps calendar 2025 (the default is the last complete year)."),
  fiscal_year_end: z.tuple([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().describe("Instead of period: each company's fiscal year ending in this window (slower: more data to read)."),
}).strict();

// Every filer EDGAR lists under one SIC code (its company browse, as an Atom feed), up to 500.
async function sicFilers(session, sic) {
  const out = new Set();
  for (let start = 0; start < 500; start += 100) {
    const xml = await getText(session, `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&type=10-K&dateb=&owner=include&start=${start}&count=100&output=atom`, { maxBytes: 4 * 1024 * 1024 });
    const ciks = [...xml.matchAll(/<cik>(\d{1,10})<\/cik>/g)].map((m) => Number(m[1]));
    for (const c of ciks) out.add(c);
    if (ciks.length < 100) break;
  }
  return out;
}

const median = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };

export async function comps(session, args) {
  const a = compsInput.parse(args);
  const ent = await resolveEntity(session, a.company);
  const sub = await submissions(session, ent.cik);
  if (!sub.sic) throw new Error(`${sub.name ?? a.company} has no SIC code at the SEC, so it has no industry peers there.`);
  const metrics = a.metrics ?? DEFAULT;
  if (a.period && a.fiscal_year_end) throw new Error("Send period or fiscal_year_end, not both.");
  const basis = a.fiscal_year_end ? { fiscal_year_end: a.fiscal_year_end } : a.period ? { period: a.period } : {};
  const ciks = await sicFilers(session, sub.sic);
  ciks.add(Number(ent.cik));
  const shown = [...new Set(["revenue", ...metrics])];
  const r = await screenCompanies(session, { ...basis, sort_by: "revenue", columns: shown.filter((m) => m !== "revenue"), limit: 500, include_suspect: true }, { ciks });
  const col = (name) => r.columns.indexOf(name);
  const rows = r.rows.map((x) => ({ x, cik: Number(x[col("cik")]), revenue: x[col("revenue")] }));
  const self = rows.find((y) => y.cik === Number(ent.cik));
  if (!self) throw new Error(`${sub.name} has no figures for ${r.period} in the XBRL frames (or it is not listed on NYSE or Nasdaq); pass another period or fiscal_year_end.`);
  const n = a.peers ?? 8;
  const peers = rows.filter((y) => y !== self && y.revenue > 0).sort((p, q2) => Math.abs(Math.log(p.revenue / self.revenue)) - Math.abs(Math.log(q2.revenue / self.revenue))).slice(0, n);
  const table = [self, ...peers];
  const out = ["ticker", "name", "period_end", ...shown];
  const rank = Object.fromEntries(shown.map((m) => {
    const v = self.x[col(m)], others = peers.map((p) => p.x[col(m)]).filter((y) => y != null && Number.isFinite(y));
    return [m, v == null ? null : { value: v, peer_median: median(others), above: others.filter((y) => y < v).length, of: others.length }];
  }));
  return {
    company: { cik: ent.cik, name: sub.name, ticker: self.x[col("ticker")], sic: sub.sic, industry: sub.sicDescription ?? null },
    period: r.period, industry_filers_listed: rows.length,
    columns: out,
    rows: table.map((y) => out.map((c) => y.x[col(c)])),
    peer_median: Object.fromEntries(shown.map((m) => [m, median(peers.map((p) => p.x[col(m)]))])),
    company_vs_peers: rank,
    definitions: r.definitions,
    meaning: `Peers are NYSE- and Nasdaq-listed filers under the same SEC SIC code (${sub.sic}${sub.sicDescription ? `, ${sub.sicDescription}` : ""}), the ${n} nearest in revenue. Ratios and growth are fractions. above counts the peers the company exceeds on each measure.`,
    sources: r.sources,
    limits: [...r.limits, "A SIC code is the filer's main line of business as SEC records it: conglomerates and companies that changed business can sit with unlike peers."],
  };
}
