// A US bank's quarterly condition from its call reports, as the FDIC publishes them (BankFind, no
// key): assets, deposits and the share uninsured, loans and the share not performing, capital ratios,
// earnings, margin and returns, quarter by quarter. Without a bank, the latest bank failures.
// Figures are for the insured bank, not its holding company, and the FDIC reports dollars in thousands.
import { z } from "zod";

import { getJson, resolveEntity } from "./sources.mjs";

const API = "https://api.fdic.gov/banks";
const FIELDS = ["REPDTE", "ASSET", "DEP", "DEPUNA", "LNLSNET", "NCLNLS", "EQTOT", "NETINC", "ROA", "ROE", "NIMY", "RBC1AAJ", "RBCRWAJ", "IDT1CER"];

export const bankInput = z.object({
  company: z.string().min(1).max(120).optional().describe("A bank or its holding company: ticker, CIK or name (WAL, \"Zions\")."),
  cert: z.number().int().min(1).max(999999).optional().describe("Or the bank's FDIC certificate number."),
  quarters: z.number().int().min(1).max(40).optional().describe("Quarters to return, newest first; default 8."),
  failures: z.number().int().min(1).max(200).optional().describe("With no bank: the latest failures to list; default 10."),
  failures_year: z.number().int().min(1934).max(2100).optional().describe("With no bank: failures in one year."),
  failures_state: z.string().regex(/^[A-Za-z]{2}$/, "a two-letter state").optional().describe("With no bank: failures in one state, e.g. KS."),
}).strict();

const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|HOLDINGS?|GROUP|THE|BANCORP|BANCORPORATION|BANCSHARES|BCORP|FINANCIAL|FINL|N ?A|NATIONAL ASSOCIATION)\b\.?/gi;
export const bankWords = (name) => String(name).replace(/\s*\/\s*[A-Z]{2}\s*\/?\s*$/, "").replace(/[.,/&-]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// The largest active bank whose name or holding company contains the words, from the FDIC's
// fuzzy search (which alone may rank another bank first).
export function pickBank(rows, words) {
  const want = squash(words);
  const hit = rows.filter((r) => squash(r.NAME).includes(want) || squash(r.NAMEHCR).includes(want));
  return (hit.length ? hit : []).sort((a, b) => (b.ASSET ?? 0) - (a.ASSET ?? 0))[0] ?? null;
}

const pct = (a, b) => (Number.isFinite(a) && b > 0 ? Math.round((a / b) * 10000) / 100 : null);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
// The failures list dates as M/D/YYYY.
export const isoDate = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "")); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s ?? null; };

export async function bankFinancials(session, args) {
  const a = bankInput.parse(args);
  if (!a.company && !a.cert) {
    const filters = [a.failures_year ? `FAILYR:${a.failures_year}` : null, a.failures_state ? `PSTALP:${a.failures_state.toUpperCase()}` : null].filter(Boolean).join(" AND ");
    const url = `${API}/failures?${new URLSearchParams({ fields: "NAME,CERT,CITYST,FAILDATE,QBFASSET,QBFDEP,COST,RESTYPE1", sort_by: "FAILDATE", sort_order: "DESC", limit: String(a.failures ?? 10), ...(filters ? { filters } : {}) })}`;
    const r = await getJson(session, url);
    return {
      failures: { columns: ["bank", "cert", "place", "failed", "assets_thousands", "deposits_thousands", "estimated_cost_thousands", "resolution"], rows: (r.data ?? []).map(({ data: d }) => [d.NAME, d.CERT, d.CITYST ?? null, isoDate(d.FAILDATE), d.QBFASSET ?? null, d.QBFDEP ?? null, d.COST ?? null, d.RESTYPE1 ?? null]) },
      ...(filters ? { matched: r.meta?.total ?? null } : { total_failures_since_1934: r.meta?.total ?? null }), source: url,
      limits: ["Cost is the FDIC's estimate of the loss to the Deposit Insurance Fund and is revised.", "Not investment advice."],
    };
  }
  let bank;
  if (a.cert) {
    const r = await getJson(session, `${API}/institutions?${new URLSearchParams({ filters: `CERT:${a.cert}`, fields: "NAME,CERT,NAMEHCR,CITY,STALP,ASSET,ACTIVE", limit: "1" })}`);
    bank = r.data?.[0]?.data;
    if (!bank) throw new Error(`The FDIC has no institution with certificate ${a.cert}.`);
  } else {
    let name = a.company;
    if (/^[A-Za-z.]{1,6}$|^\d{1,10}$/.test(a.company)) { try { name = (await resolveEntity(session, a.company)).name ?? a.company; } catch { /* searched as a name */ } }
    const words = bankWords(name);
    const r = await getJson(session, `${API}/institutions?${new URLSearchParams({ search: `NAME:"${words}"`, filters: "ACTIVE:1", fields: "NAME,CERT,NAMEHCR,CITY,STALP,ASSET,ACTIVE", sort_by: "ASSET", sort_order: "DESC", limit: "25" })}`);
    bank = pickBank((r.data ?? []).map((x) => x.data), words);
    if (!bank) throw new Error(`No active FDIC-insured bank's name or holding company contains "${words}"; pass cert (its FDIC certificate number).`);
  }
  const url = `${API}/financials?${new URLSearchParams({ filters: `CERT:${bank.CERT}`, fields: FIELDS.join(","), sort_by: "REPDTE", sort_order: "DESC", limit: String(a.quarters ?? 8) })}`;
  const fin = await getJson(session, url);
  const rows = (fin.data ?? []).map(({ data: d }) => [ymd(d.REPDTE), d.ASSET, d.DEP, d.DEPUNA ?? null, pct(d.DEPUNA, d.DEP), d.LNLSNET, pct(d.NCLNLS, d.LNLSNET), d.EQTOT, d.NETINC, r2(d.ROA), r2(d.ROE), r2(d.NIMY), r2(d.RBC1AAJ), r2(d.RBCRWAJ), r2(d.IDT1CER)]);
  return {
    bank: { name: bank.NAME, cert: bank.CERT, holding_company: bank.NAMEHCR || null, place: [bank.CITY, bank.STALP].filter(Boolean).join(", ") || null },
    columns: ["quarter_end", "assets", "deposits", "uninsured_deposits", "uninsured_pct", "net_loans", "noncurrent_loans_pct", "equity", "net_income_ytd", "roa_pct", "roe_pct", "net_interest_margin_pct", "tier1_leverage_pct", "total_capital_ratio_pct", "cet1_ratio_pct"],
    rows,
    units: "Dollar figures in thousands; net income is year to date; ratios in percent.",
    meaning: "Uninsured deposits (above the $250,000 limit) are the ones that run first; noncurrent loans are 90 days or more past due or no longer accruing. Well capitalized means a tier 1 leverage ratio of at least 5% and a total capital ratio of at least 10%.",
    links: { bankfind: `https://banks.data.fdic.gov/bankfind-suite/bankfind/details/${bank.CERT}` },
    source: url,
    limits: ["The insured bank only: a holding company's other subsidiaries and its own debt are not here.", "Call reports are filed about 30 days after each quarter.", "Not investment advice."],
  };
}
