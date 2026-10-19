// Where a company's revenue comes from, read from the XBRL of its own 10-K or 10-Q: revenue (and
// operating income where reported) by business segment, by product or service, and by region,
// with the filing's own labels, each breakdown checked against reported total revenue.
import { z } from "zod";

import { decodeEntities } from "./html.mjs";
import { archiveBase, filings, getJson, getText, NotFound, resolveEntity } from "./sources.mjs";
import { all, child, children, parseXml } from "./xml.mjs";

const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const REVENUE = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"];
const AXES = Object.freeze({ StatementBusinessSegmentsAxis: "segments", ProductOrServiceAxis: "products_and_services", StatementGeographicalAxis: "regions" });
// Qualifiers a segment fact may carry beside its axis without being a different breakdown.
const QUALIFIERS = new Set(["ConsolidationItemsAxis"]);

// "IPhoneMember" -> "IPhone"; "WearablesHomeandAccessoriesMember" -> "Wearables Homeand Accessories".
const humanize = (member) => member.replace(/Member$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

// Labels for the filer's own members from its label linkbase (terse or standard labels).
export function memberLabels(labXml) {
  const out = new Map();
  // Attributes come in any order, so each is read by name.
  for (const m of labXml.matchAll(/<(?:link:)?label\b([^>]*)>([^<]*)<\/(?:link:)?label>/g)) {
    const attr = (name) => m[1].match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? "";
    // "lab_aapl_IPhoneMember_label_en-US" or "msft_ProductivityAndBusinessProcessesMember_lbl".
    const member = attr("xlink:label").match(/([A-Z][A-Za-z0-9]*Member)(?![A-Za-z0-9])/)?.[1];
    if (!member) continue;
    const role = attr("xlink:role").split("/").pop();
    m[3] = m[2];
    const prev = out.get(member);
    if (!prev || (role === "terseLabel" && prev.role !== "terseLabel") || (role === "label" && prev.role === "documentation")) out.set(member, { role, text: decodeEntities(m[3]).replace(/\s*\[Member\]$/, "").trim() });
  }
  return new Map([...out].map(([k, v]) => [k, v.text]));
}

export function parseSegments(xml, labels = new Map()) {
  const doc = child(parseXml(xml), "xbrl");
  if (!doc) throw new Error("not an XBRL instance");
  const contexts = new Map();
  for (const c of children(doc, "context")) {
    const p = child(c, "period");
    contexts.set(c.attrs.id, {
      start: child(p, "startDate")?.text.trim() ?? null, end: child(p, "endDate")?.text.trim() ?? null,
      dims: all(c, "explicitMember").map((m) => ({ axis: (m.attrs.dimension ?? "").replace(/^.*:/, ""), member: m.text.trim() })),
    });
  }
  const label = (q) => { const local = q.replace(/^.*:/, ""); return labels.get(local) ?? (q.startsWith("country:") ? local : humanize(local)); };
  // Facts by concept, period and breakdown.
  const facts = [];
  for (const el of doc.children) {
    const ctx = contexts.get(el.attrs.contextRef);
    if (!ctx?.start || !ctx.end) continue;
    const concept = REVENUE.includes(el.name) ? "revenue" : el.name === "OperatingIncomeLoss" ? "operating_income" : null;
    if (!concept) continue;
    const v = Number(el.text);
    if (!Number.isFinite(v)) continue;
    const main = ctx.dims.filter((d) => !QUALIFIERS.has(d.axis));
    if (main.length > 1) continue;
    const qualifier = ctx.dims.find((d) => QUALIFIERS.has(d.axis))?.member ?? null;
    facts.push({ concept, rank: concept === "revenue" ? REVENUE.indexOf(el.name) : 0, start: ctx.start, end: ctx.end, axis: main[0]?.axis ?? null, member: main[0]?.member ?? null, qualifier, value: v });
  }
  return { facts, label };
}

export const segmentInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  form: z.enum(["10-K", "10-Q"]).optional().describe("Annual (10-K, default: fiscal years) or quarterly (10-Q: the quarter)."),
}).strict();

export async function segmentRevenue(session, args) {
  const a = segmentInput.parse(args);
  const form = a.form ?? "10-K";
  const e = await resolveEntity(session, a.company);
  const { sub, rows } = await filings(session, e.cik, {});
  const filing = rows.find((r) => r.form === form);
  if (!filing) throw new NotFound(`${sub.name} has filed no ${form}${sub.category?.includes("foreign") ? " (foreign private issuers file 20-F or 40-F)" : ""}.`);
  const base = archiveBase(e.cik, filing.accessionNumber);
  const dir = await getJson(session, `${base}/index.json`);
  const items = dir?.directory?.item ?? [];
  const inst = items.find((i) => /_htm\.xml$/i.test(i.name)) ?? items.find((i) => /\.xml$/i.test(i.name) && !/_(cal|def|lab|pre)\.xml$/i.test(i.name) && !/FilingSummary/i.test(i.name));
  if (!inst) throw new NotFound(`${sub.name}'s ${form} ${filing.accessionNumber} has no XBRL instance to read.`);
  // Labels live in a label linkbase, or (Microsoft) embedded in the extension schema.
  const labFile = items.find((i) => /_lab\.xml$/i.test(i.name)) ?? items.find((i) => /\.xsd$/i.test(i.name));
  const [xml, lab] = await Promise.all([
    getText(session, `${base}/${inst.name}`, { maxBytes: 48 * 1024 * 1024 }),
    labFile ? getText(session, `${base}/${labFile.name}`, { maxBytes: 16 * 1024 * 1024 }) : Promise.resolve(""),
  ]);
  const { facts, label } = parseSegments(xml, memberLabels(lab));
  if (!facts.length) throw new NotFound(`${sub.name}'s ${form} XBRL has no revenue facts.`);
  // The periods: a year (10-K) or a quarter (10-Q) ending on a date the filing reports, newest first.
  const days = (f) => (Date.parse(f.end) - Date.parse(f.start)) / 86400000;
  const wantDays = form === "10-K" ? [350, 380] : [80, 100];
  const inPeriod = facts.filter((f) => days(f) >= wantDays[0] && days(f) <= wantDays[1]);
  const periods = [...new Set(inPeriod.filter((f) => f.concept === "revenue" && !f.axis).map((f) => f.end))].sort().reverse().slice(0, 3);
  if (!periods.length) throw new NotFound(`${sub.name}'s ${form} XBRL reports no total revenue for a ${form === "10-K" ? "year" : "quarter"}.`);
  const best = (list) => list.sort((x, y) => x.rank - y.rank)[0];
  const total = Object.fromEntries(periods.map((p) => [p, best(inPeriod.filter((f) => f.concept === "revenue" && !f.axis && f.end === p))?.value ?? null]));
  const breakdowns = {};
  for (const [axis, name] of Object.entries(AXES)) {
    const ofAxis = inPeriod.filter((f) => f.axis === axis && periods.includes(f.end) && (!f.qualifier || /OperatingSegmentsMember$/.test(f.qualifier)));
    if (!ofAxis.some((f) => f.concept === "revenue")) continue;
    const members = [...new Set(ofAxis.filter((f) => f.concept === "revenue").map((f) => f.member))];
    const value = (concept, member, p) => best(ofAxis.filter((f) => f.concept === concept && f.member === member && f.end === p))?.value ?? null;
    const hasOI = ofAxis.some((f) => f.concept === "operating_income");
    const rowsOut = members.map((m) => [label(m), ...periods.map((p) => value("revenue", m, p)), ...(hasOI ? periods.map((p) => value("operating_income", m, p)) : [])]);
    rowsOut.sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0));
    // Members can overlap (Products beside iPhone and Mac), so the sum is checked, not assumed.
    const sum = rowsOut.reduce((s, r) => s + (r[1] ?? 0), 0);
    breakdowns[name] = {
      columns: ["member", ...periods.map((p) => `revenue_${p}`), ...(hasOI ? periods.map((p) => `operating_income_${p}`) : [])],
      rows: rowsOut,
      latest_sum_vs_total: total[periods[0]] ? round(sum / total[periods[0]], 4) : null,
    };
  }
  if (!Object.keys(breakdowns).length) throw new NotFound(`${sub.name}'s ${form} tags no revenue by segment, product or region in XBRL; read_filing with section "segment" or the revenue note gives the text.`);
  return {
    company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
    filing: { form, filed: filing.filingDate, period: filing.reportDate, accession: filing.accessionNumber },
    total_revenue: { columns: periods, values: periods.map((p) => total[p]) },
    ...breakdowns,
    note: "latest_sum_vs_total adds the members for the latest period and divides by total revenue: about 1 means the breakdown is complete; above 1, members overlap (a Products line beside iPhone and Mac); below 1, some revenue is not broken down (eliminations, other).",
    source: `${base}/${inst.name}`,
    limits: [
      "From the XBRL the company filed with its 10-K or 10-Q, as filed; labels are the company's own. Only revenue and operating income broken down along one axis are shown.",
      "Not investment advice.",
    ],
  };
}
