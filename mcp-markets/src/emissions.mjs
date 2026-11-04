// company_emissions: a company's greenhouse-gas emissions from its US facilities, as the facilities reported them
// to EPA's Greenhouse Gas Reporting Program (every site emitting 25,000 tonnes of CO2e or more a year). Read from
// EPA's Envirofacts service with no key: the facilities whose reported parent companies include the company,
// each one's emissions by gas, and the company's share where a facility has several owners. The E of ESG from
// the measurements themselves rather than a vendor's score.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const EF = "https://data.epa.gov/efservice";
const GASES = Object.freeze({ 1: "co2", 2: "methane", 3: "nitrous_oxide", 8: "biogenic_co2" });
export const emissionsInput = z.object({
  company: z.string().min(3).max(80).describe("The parent company as its facilities name it: \"Exxon\", \"Duke Energy\", \"Dow\"."),
  year: z.number().int().min(2010).max(2100).optional().describe("The reporting year; default the latest EPA has published (data for a year comes out the autumn after)."),
  trend: z.number().int().min(2).max(5).optional().describe("Also the total for this many years before, to the year asked for."),
  top: z.number().int().min(1).max(50).optional().describe("How many facilities to list, largest first; default 10."),
}).strict();

const r0 = (x) => Math.round(x);
// The company's share of a facility, from the parent list ("ExxonMobil Corporation (36.4%); BP America Inc. (26.4%)").
export function ownerShare(parents, company) {
  const want = company.toLowerCase();
  for (const part of String(parents ?? "").split(";")) {
    const m = /^(.*?)\s*\((\d+(?:\.\d+)?)%\)\s*$/.exec(part.trim());
    if (m && m[1].toLowerCase().includes(want)) return Number(m[2]) / 100;
  }
  return null;
}

async function yearOf(session, company, year) {
  const rows = await getJson(session, `${EF}/PUB_DIM_FACILITY/PARENT_COMPANY/CONTAINING/${encodeURIComponent(company)}/YEAR/=/${year}/PUB_FACTS_SUBP_GHG_EMISSION/JSON`, { maxAgeMs: 86400000, timeoutMs: 60000 });
  const facilities = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.year !== year) continue;
    const f = facilities.get(r.facility_id) ?? { name: r.facility_name, city: r.city, state: r.state, naics: r.naics_code, parents: r.parent_company, direct: 0, biogenic: 0, gases: {} };
    const v = Number(r.co2e_emission) || 0, gas = GASES[r.gas_id] ?? "other";
    if (gas === "biogenic_co2") f.biogenic += v; else { f.direct += v; f.gases[gas] = (f.gases[gas] ?? 0) + v; }
    facilities.set(r.facility_id, f);
  }
  return [...facilities.values()];
}
const totals = (list, company) => {
  const share = (f) => ownerShare(f.parents, company) ?? 1;
  const sum = (fn) => r0(list.reduce((t, f) => t + fn(f), 0));
  return { facilities: list.length, direct_tonnes_co2e: sum((f) => f.direct), owned_share_tonnes_co2e: sum((f) => f.direct * share(f)), biogenic_co2_tonnes: sum((f) => f.biogenic) };
};

export async function companyEmissions(session, args) {
  const a = emissionsInput.parse(args);
  let year = a.year, list = null;
  if (year) list = await yearOf(session, a.company, year);
  else {
    // The latest published year: last year's comes out in the autumn, so the last three are read at once
    // and the newest with facilities kept.
    const now = new Date(session.now()).getUTCFullYear(), years = [now - 1, now - 2, now - 3];
    const lists = await Promise.all(years.map((y) => yearOf(session, a.company, y)));
    const i = lists.findIndex((l) => l.length);
    if (i >= 0) [year, list] = [years[i], lists[i]];
  }
  if (!list?.length) throw new NotFound(`No facility reporting to EPA names a parent company like "${a.company}"${a.year ? ` in ${a.year}` : " in the last three years"}. Try a shorter part of the name ("Exxon", not "Exxon Mobil Corporation").`);
  const gas = (k) => r0(list.reduce((t, f) => t + (f.gases[k] ?? 0), 0));
  const trend = a.trend ? await Promise.all(Array.from({ length: a.trend }, (_, i) => year - a.trend + 1 + i).map(async (y) => [y, y === year ? totals(list, a.company).direct_tonnes_co2e : totals(await yearOf(session, a.company, y), a.company).direct_tonnes_co2e])) : null;
  const top = [...list].sort((x, y) => y.direct - x.direct).slice(0, a.top ?? 10);
  return {
    company: a.company, year,
    totals: totals(list, a.company),
    by_gas_tonnes_co2e: { co2: gas("co2"), methane: gas("methane"), nitrous_oxide: gas("nitrous_oxide"), other: gas("other") },
    ...(trend ? { trend: { columns: ["year", "direct_tonnes_co2e"], rows: trend } } : {}),
    facilities: { columns: ["facility", "city", "state", "naics", "direct_tonnes_co2e", "company_share_pct", "parent_companies"], rows: top.map((f) => [f.name, f.city, f.state, f.naics, r0(f.direct), ownerShare(f.parents, a.company) === null ? null : Math.round(ownerShare(f.parents, a.company) * 1000) / 10, f.parents]) },
    source: "https://ghgdata.epa.gov/ghgp/main.do",
    limits: [
      "EPA's Greenhouse Gas Reporting Program as published: direct (scope 1) emissions of US facilities emitting 25,000 tonnes of CO2e a year or more, in metric tonnes of CO2e; not the company's foreign operations, its electricity bought (scope 2) or its products' use (scope 3).",
      "Facilities are matched by the parent companies they report, as text: a short name can match another company (check parent_companies); owned_share weights each facility by the company's reported ownership.",
      "Biogenic CO2 (from burning biomass) is shown apart and left out of the direct total, as EPA does.",
    ],
  };
}
