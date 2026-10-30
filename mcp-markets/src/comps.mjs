// A comparable-companies table: the company beside its listed peers in the same SEC industry code,
// the ones nearest in size, on the same fiscal-year footing as screen_companies, with the peers'
// median and the company's rank on each measure.
import { z } from "zod";

import { ALL_METRICS, fiscalRow, screenCompanies } from "./research.mjs";
import { getText, resolveEntity, submissions } from "./sources.mjs";

const DEFAULT = ["revenue", "revenue_growth", "gross_margin", "operating_margin", "net_margin", "roe", "rd_intensity", "fcf_margin"];

export const compsInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  metrics: z.array(z.string().refine((m) => ALL_METRICS.includes(m), { message: `a metric: ${ALL_METRICS.join(", ")}` })).min(1).max(12).optional().describe("Measures to compare; default revenue, growth, margins, ROE, R&D intensity and FCF margin."),
  companies: z.array(z.string().min(1).max(120)).min(1).max(30).optional().describe("The peers to compare, by ticker, CIK or name, instead of the industry's nearest in size. Foreign filers work: IFRS accounts are read and figures put in dollars."),
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

// A table from each company's own facts: for named companies, whatever their accounts or currency.
function tableFrom(self, peers, shown, extra) {
  const out = ["ticker", "name", "period_end", ...shown], all = [self, ...peers];
  const foreign = all.filter((c) => c.currency !== "USD" || c.standard !== "US GAAP");
  return {
    company: { cik: self.cik, name: self.name, ticker: self.ticker },
    columns: out,
    rows: all.map((c) => [c.ticker, c.name, c.period_end, ...shown.map((m) => c.get(m))]),
    peer_median: Object.fromEntries(shown.map((m) => [m, median(peers.map((p) => p.get(m)))])),
    company_vs_peers: Object.fromEntries(shown.map((m) => {
      const v = self.get(m), others = peers.map((p) => p.get(m)).filter((y) => y != null && Number.isFinite(y));
      return [m, v == null ? null : { value: v, peer_median: median(others), above: others.filter((y) => y < v).length, of: others.length }];
    })),
    ...(foreign.length ? { foreign_accounts: { columns: ["ticker", "standard", "currency", "converted_at"], rows: foreign.map((c) => [c.ticker, c.standard, c.currency, c.converted?.rate ?? null]) } } : {}),
    ...extra,
    meaning: "Each company's latest fiscal year from its own annual XBRL, money in dollars at the latest rate. Fiscal years can end months apart: compare period_end.",
    limits: ["Companies tag line items differently, and IFRS and US GAAP measure some of them differently: operating profit and cash flow most of all.", "Converting at one rate leaves growth and margins as reported.", "Not investment advice."],
  };
}

export async function comps(session, args) {
  const a = compsInput.parse(args);
  const shownFor = (m) => [...new Set(["revenue", ...m])];
  if (a.companies) {
    if (a.period || a.fiscal_year_end) throw new Error("With named companies, comps reads each one's latest fiscal year: leave out period and fiscal_year_end.");
    const [self, ...peers] = await Promise.all([a.company, ...a.companies].map((c) => fiscalRow(session, c)));
    return tableFrom(self, peers, shownFor(a.metrics ?? DEFAULT), { sources: [self, ...peers].map((c) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(c.cik).padStart(10, "0")}.json`) });
  }
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
  // Not in the frames: a filer in IFRS or another currency. Its own facts stand beside the nearest peers.
  if (!self) {
    const own = await fiscalRow(session, a.company).catch(() => null);
    if (own?.get("revenue") > 0 && own.currency + own.standard !== "USDUS GAAP") {
      const peerRows = rows.filter((y) => y.revenue > 0).sort((p, q2) => Math.abs(Math.log(p.revenue / own.get("revenue"))) - Math.abs(Math.log(q2.revenue / own.get("revenue")))).slice(0, a.peers ?? 8);
      const asPeer = (y) => ({ cik: y.cik, name: y.x[col("name")], ticker: y.x[col("ticker")], period_end: y.x[col("period_end")], currency: "USD", standard: "US GAAP", get: (m) => y.x[col(m)] });
      return tableFrom(own, peerRows.map(asPeer), shown, { period: r.period, industry_filers_listed: rows.length, sources: [...r.sources, `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(own.cik).padStart(10, "0")}.json`] });
    }
  }
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
