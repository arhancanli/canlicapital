// Planned insider sales: Form 144, the notice an officer, director or large holder files before
// selling restricted or control shares, naming the shares, their value and the approximate sale
// date. Form 4 reports a sale after it happens; Form 144 often comes first, so it is the earliest
// public sign that an insider means to sell.
import { z } from "zod";

import { archiveBase, filings, getText, resolveEntity } from "./sources.mjs";

export const plannedInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name of the issuer."),
  days: z.number().int().min(1).max(730).optional().describe("Notices filed in the last this many days; default 180."),
  limit: z.number().int().min(1).max(60).optional().describe("Most notices to read, newest first; default 25."),
}).strict();

const tag = (xml, name) => { const m = new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`).exec(xml); return m ? m[1].trim() : null; };
const all = (xml, name) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`, "g"))].map((m) => m[1].trim());
const mdy = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? ""); return m ? `${m[3]}-${m[1]}-${m[2]}` : s ?? null; };
const num = (s) => (s == null || s === "" ? null : Number(String(s).replace(/,/g, "")));

// One Form 144's fields (several share lots may be listed; their units and values are summed).
export function parse144(xml) {
  const units = all(xml, "noOfUnitsSold").map(num).filter(Number.isFinite), values = all(xml, "aggregateMarketValue").map(num).filter(Number.isFinite);
  return {
    seller: tag(xml, "nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold"),
    relationship: all(xml, "relationshipToIssuer").join(", ") || null,
    shares: units.length ? units.reduce((a, b) => a + b, 0) : null,
    market_value: values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null,
    outstanding: num(tag(xml, "noOfUnitsOutstanding")),
    approx_sale_date: mdy(tag(xml, "approxSaleDate")),
    acquired: all(xml, "natureOfAcquisitionTransaction").slice(0, 3).join("; ") || null,
    broker: tag(xml, "name"),
    plan_adopted: mdy(tag(xml, "planAdoptionDate") ?? tag(xml, "dateOfPlanAdoption")),
  };
}

export async function plannedInsiderSales(session, args) {
  const a = plannedInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const since = new Date(session.now() - (a.days ?? 180) * 86400000).toISOString().slice(0, 10);
  const { sub, rows } = await filings(session, e.cik, { since });
  const notices = rows.filter((r) => (r.form === "144" || r.form === "144/A") && r.filingDate >= since).slice(0, a.limit ?? 25);
  const out = [], failed = [];
  for (const r of notices) {
    const url = `${archiveBase(e.cik, r.accessionNumber)}/${String(r.primaryDocument).replace(/^xsl[^/]*\//, "")}`;
    try {
      const p = parse144(await getText(session, url, { maxBytes: 2 * 1024 * 1024 }));
      out.push([r.filingDate, p.seller, p.relationship, p.shares, p.market_value, p.shares && p.outstanding ? Math.round((p.shares / p.outstanding) * 1e6) / 1e4 : null, p.approx_sale_date, p.acquired, p.plan_adopted, r.form, url]);
    } catch (err) { failed.push([r.filingDate, r.accessionNumber, String(err.message).slice(0, 120)]); }
  }
  const byPerson = new Map();
  for (const x of out) { const k = x[1] ?? "unnamed"; const v = byPerson.get(k) ?? { notices: 0, shares: 0, value: 0, role: x[2] }; v.notices += 1; v.shares += x[3] ?? 0; v.value += x[4] ?? 0; byPerson.set(k, v); }
  const total = out.reduce((s, x) => s + (x[4] ?? 0), 0);
  return {
    company: { cik: e.cik, name: sub.name ?? e.name, ticker: e.ticker ?? null }, since,
    notices: out.length, planned_value_total: Math.round(total * 100) / 100,
    columns: ["filed", "seller", "relationship", "shares", "market_value", "pct_outstanding", "approx_sale_date", "acquired_as", "plan_adopted", "form", "url"],
    rows: out,
    by_seller: { columns: ["seller", "relationship", "notices", "shares", "market_value"], rows: [...byPerson].sort((x, y) => y[1].value - x[1].value).map(([k, v]) => [k, v.role, v.notices, v.shares, Math.round(v.value * 100) / 100]) },
    ...(failed.length ? { not_read: failed } : {}),
    meaning: "A Form 144 states an intention to sell, at the market value on the day it was filed; the sale may be smaller, later or not happen, and Form 4 reports what was sold. Notices under a 10b5-1 plan name the plan's adoption date.",
    source: `https://data.sec.gov/submissions/CIK${String(e.cik).padStart(10, "0")}.json (form 144)`,
    limits: ["Electronic Form 144 filings began in April 2023; earlier notices were on paper and are not here.", "Not investment advice."],
  };
}
