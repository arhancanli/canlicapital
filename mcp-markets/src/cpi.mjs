// inflation_breakdown: what is driving US consumer prices, from the BLS's CPI as FRED carries it: all items, core, food
// (at home and away), energy and gasoline, core goods and used cars, core services, shelter, rent, owners' equivalent
// rent, medical care and transportation services, each with its change on the month (seasonally adjusted), its pace
// over three months (annualized) and its change on a year (on the index as published, as the BLS states it). No key.
import { z } from "zod";

import { fredCsv, NotFound } from "./sources.mjs";

// Each component: its key, the BLS's name, and FRED's seasonally adjusted and unadjusted series.
export const COMPONENTS = [
  ["all_items", "all items", "CPIAUCSL", "CPIAUCNS"],
  ["core", "all items less food and energy", "CPILFESL", "CPILFENS"],
  ["food", "food", "CPIUFDSL", "CPIUFDNS"],
  ["food_at_home", "food at home", "CUSR0000SAF11", "CUUR0000SAF11"],
  ["food_away_from_home", "food away from home", "CUSR0000SEFV", "CUUR0000SEFV"],
  ["energy", "energy", "CPIENGSL", "CPIENGNS"],
  ["gasoline", "gasoline (all types)", "CUSR0000SETB01", "CUUR0000SETB01"],
  ["core_goods", "commodities less food and energy commodities", "CUSR0000SACL1E", "CUUR0000SACL1E"],
  ["used_cars", "used cars and trucks", "CUSR0000SETA02", "CUUR0000SETA02"],
  ["core_services", "services less energy services", "CUSR0000SASLE", "CUUR0000SASLE"],
  ["shelter", "shelter", "CUSR0000SAH1", "CUUR0000SAH1"],
  ["rent", "rent of primary residence", "CUSR0000SEHA", "CUUR0000SEHA"],
  ["owners_equivalent_rent", "owners' equivalent rent of residences", "CUSR0000SEHC", "CUUR0000SEHC"],
  ["medical_care", "medical care", "CPIMEDSL", "CPIMEDNS"],
  ["transportation_services", "transportation services", "CUSR0000SAS4", "CUUR0000SAS4"],
];

// The names sentences use.
const SHORT = { all_items: "all items", core: "core", food_at_home: "food at home", food_away_from_home: "food away from home", gasoline: "gasoline", core_goods: "core goods", used_cars: "used cars", core_services: "core services", owners_equivalent_rent: "owners' equivalent rent", medical_care: "medical care", transportation_services: "transportation services" };
const short = (key, name) => SHORT[key] ?? name;

export const cpiInput = z.object({
  months: z.number().int().min(1).max(36).optional().describe("Months of the headline and core shown, latest last; default 13."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const pct = (a, b) => (a == null || !b ? null : (a / b - 1) * 100);
const monthBack = (yyyymm, n) => { const [y, m] = yyyymm.split("-").map(Number); const i = y * 12 + m - 1 - n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };

export async function inflationBreakdown(session, args) {
  const a = cpiInput.parse(args);
  const start = new Date(session.now() - 1300 * 86400000).toISOString().slice(0, 10);
  const ids = COMPONENTS.flatMap(([, , sa, nsa]) => [sa, nsa]);
  const got = [];
  // FRED refuses connections when too many open at once: eight at a time.
  for (let i = 0; i < ids.length; i += 8) got.push(...(await Promise.all(ids.slice(i, i + 8).map((id) => fredCsv(session, id, { start }).then((s) => new Map(s.rows.filter(([, v]) => v != null).map(([d, v]) => [d.slice(0, 7), v])), () => null)))));
  const series = Object.fromEntries(ids.map((id, i) => [id, got[i]]));
  const headline = series.CPIAUCSL;
  if (!headline?.size) throw new NotFound("FRED returned no CPI.");
  const month = [...headline.keys()].sort().at(-1);
  const rows = COMPONENTS.map(([key, name, sa, nsa]) => {
    const s = series[sa], n = series[nsa];
    if (!s?.has(month)) return null;
    const mom = pct(s.get(month), s.get(monthBack(month, 1)));
    const three = s.get(monthBack(month, 3)) ? ((s.get(month) / s.get(monthBack(month, 3))) ** 4 - 1) * 100 : null;
    const yoy = pct(n?.get(month), n?.get(monthBack(month, 12)));
    const yoyBefore = pct(n?.get(monthBack(month, 1)), n?.get(monthBack(month, 13)));
    return [key, name, round(mom), round(three, 1), round(yoy), round(yoyBefore)];
  }).filter(Boolean);
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  const parts = ["shelter", "core_goods", "core_services", "energy", "food"].filter((k) => by[k]?.[4] != null).map((k) => `${short(k, by[k][1])} ${by[k][4]}%`);
  const ranked = rows.filter((r) => !["all_items", "core"].includes(r[0]) && r[4] != null).sort((x, y) => y[4] - x[4]);
  const history = (a.months ?? 13);
  // A month's change by its sign, and the year's only where there is an index a year earlier (the BLS published none
  // for October 2025, during the shutdown).
  const sayChange = (what, r) => {
    if (!r) return `${what} were not published`;
    const month = r[2] == null ? "" : r[2] > 0 ? `rose ${r[2]}% on the month` : r[2] < 0 ? `fell ${Math.abs(r[2])}% on the month` : "were unchanged on the month";
    const adjusted = month && r[0] === "all_items" ? " (seasonally adjusted)" : "";
    if (r[4] == null) return `${what} ${month || "were not published for the month"}${adjusted}, with no index a year earlier for the change on a year`;
    return `${what} ${month}${adjusted}${month ? " and " : ""}were ${r[4] >= 0 ? "up" : "down"} ${Math.abs(r[4])}% on a year${r[5] != null ? ` (${r[5]}% the month before)` : ""}`;
  };
  return {
    month,
    summary: [
      `In ${month} ${sayChange("consumer prices", by.all_items)}; ${sayChange("core prices", by.core)}.`,
      ...(parts.length ? [`On a year: ${parts.join(", ")}.`] : []),
      ...(ranked.length > 1 ? [`Fastest on a year: ${short(ranked[0][0], ranked[0][1])} (${ranked[0][4]}%); slowest: ${short(ranked.at(-1)[0], ranked.at(-1)[1])} (${ranked.at(-1)[4]}%).`] : []),
    ],
    columns: ["component", "bls_name", "change_on_month_pct", "three_months_annualized_pct", "change_on_year_pct", "change_on_year_month_before_pct"], rows,
    headline_and_core: {
      columns: ["month", "all_items_month_pct", "all_items_year_pct", "core_month_pct", "core_year_pct"],
      rows: Array.from({ length: history }, (_, i) => monthBack(month, history - 1 - i)).map((m) => [m, round(pct(series.CPIAUCSL?.get(m), series.CPIAUCSL?.get(monthBack(m, 1)))), round(pct(series.CPIAUCNS?.get(m), series.CPIAUCNS?.get(monthBack(m, 12)))), round(pct(series.CPILFESL?.get(m), series.CPILFESL?.get(monthBack(m, 1)))), round(pct(series.CPILFENS?.get(m), series.CPILFENS?.get(monthBack(m, 12))))]),
    },
    reading: "Each component's change on the month (seasonally adjusted index), its pace over three months at an annual rate, and its change on a year (unadjusted index, as the BLS states it) with the month before's, in percent.",
    source: `FRED (BLS CPI for all urban consumers): ${ids.join(", ")}`,
    limits: [
      "Changes are computed from the indexes, as the BLS computes its own; they can differ from the BLS's release in the last decimal where the BLS rounds the index.",
      "A component's change is its own, not its contribution to the headline: shelter weighs about a third of the index, used cars about two percent.",
      "Not investment advice.",
    ],
  };
}
