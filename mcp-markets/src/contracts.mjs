// Federal contracts: what the US government obligated to a company in a fiscal year, by agency and
// industry code, and its largest contracts, from USAspending.gov (the Treasury's public record of
// federal awards; no key). Recipients are matched by name, so a subsidiary that contracts under
// another name is found only when its name is given in `recipients`.
import { z } from "zod";

import { postJson, resolveEntity } from "./sources.mjs";

const API = "https://api.usaspending.gov/api/v2/search";
const CONTRACTS = ["A", "B", "C", "D"]; // definitive contracts, purchase orders, delivery orders, BPA calls

export const contractsInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name; its SEC name is searched (\"LOCKHEED MARTIN\")."),
  recipients: z.array(z.string().min(3).max(80)).min(1).max(5).optional().describe("Or recipient names to search instead, e.g. a subsidiary [\"Sikorsky\"]."),
  fiscal_year: z.number().int().min(2008).max(2100).optional().describe("US federal fiscal year (October to September); default the last complete one."),
  limit: z.number().int().min(1).max(25).optional().describe("Largest contracts to list; default 10."),
}).strict();

const SUFFIX = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LLC|PLC|HOLDINGS?|GROUP|THE|NEW|DEL|DE)\b\.?/g;
export const searchName = (name) => String(name).toUpperCase().replace(/\s*\/\s*[A-Z]{2}\s*\/?\s*$/, "").replace(/[.,/&]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

// The last complete fiscal year: FY N runs from 1 October N-1 to 30 September N.
export function lastFiscalYear(nowMs) {
  const d = new Date(nowMs);
  return d.getUTCMonth() >= 9 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

const round = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export async function federalContracts(session, args) {
  const a = contractsInput.parse(args);
  if (!a.company && !a.recipients) throw new Error("federal_contracts needs company or recipients.");
  let who = null, names = a.recipients;
  if (!names) {
    const e = await resolveEntity(session, a.company);
    if (!e.name) throw new Error(`${a.company} has no SEC name to search; pass recipients (the names it contracts under).`);
    who = { cik: e.cik, name: e.name, ticker: e.ticker ?? null };
    names = [searchName(e.name)];
  }
  const fy = a.fiscal_year ?? lastFiscalYear(session.now());
  const filters = { recipient_search_text: names, award_type_codes: CONTRACTS, time_period: [{ start_date: `${fy - 1}-10-01`, end_date: `${fy}-09-30` }] };
  const category = (c, limit) => postJson(session, `${API}/spending_by_category/${c}/`, { filters, limit, page: 1 });
  const [recipients, agencies, naics, awards] = await Promise.all([
    category("recipient", 10), category("awarding_agency", 10), category("naics", 8),
    postJson(session, `${API}/spending_by_award/`, { filters, fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Description", "Start Date", "End Date", "generated_internal_id"], limit: a.limit ?? 10, page: 1, sort: "Award Amount", order: "desc" }),
  ]);
  const rec = recipients.results ?? [], ag = agencies.results ?? [];
  // Every matching recipient's obligations fall under some agency, so the agencies sum to the total.
  const total = ag.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    ...(who ? { company: who } : {}), searched: names, fiscal_year: fy, period: filters.time_period[0],
    obligated_total: round(total),
    obligated_note: "Obligations in the fiscal year across every matching recipient (USAspending also matches a recipient's parent, so subsidiaries filed under the parent count), summed over the ten largest agencies; a negative amount is a deobligation.",
    recipients: { columns: ["recipient", "uei", "obligated"], rows: rec.map((r) => [r.name, r.uei ?? null, round(r.amount)]) },
    agencies: { columns: ["agency", "obligated"], rows: ag.map((r) => [r.name, round(r.amount)]) },
    industries: { columns: ["naics", "industry", "obligated"], rows: (naics.results ?? []).map((r) => [r.code, r.name, round(r.amount)]) },
    largest_contracts: {
      note: "Contracts with an action (an award, order or modification) in the fiscal year, by their value over their whole life, not the year's obligation; an old contract still being modified or closed out appears.",
      columns: ["award_id", "recipient", "agency", "lifetime_value", "description", "start", "end", "url"],
      rows: (awards.results ?? []).map((r) => [r["Award ID"], r["Recipient Name"], r["Awarding Agency"], round(r["Award Amount"]), r.Description ?? null, r["Start Date"], r["End Date"], r.generated_internal_id ? `https://www.usaspending.gov/award/${r.generated_internal_id}` : null]),
    },
    source: `${API} (USAspending.gov, the US Treasury's record of federal awards)`,
    limits: ["Recipients are matched by the words of their name: a subsidiary under another name is missed unless named in recipients, and an unrelated company sharing the words is included (check the recipients table).", "Contracts only (not grants or loans); classified awards are not reported.", "Not investment advice."],
  };
}
