// labor_market: the US jobs picture in one answer, from the BLS and the Labor Department as FRED carries them: payrolls
// with the month's gain and the three-month average, the unemployment rate and U-6, participation and the prime-age
// employment ratio, wages and hours, JOLTS openings, quits and layoffs with openings per unemployed person, and weekly
// jobless claims, each beside the reading before and a year before. No key.
import { z } from "zod";

import { fredCsv, NotFound } from "./sources.mjs";

// Each measure: key, FRED id, what it is, its unit, and how its change is measured.
const SERIES = [
  ["payrolls", "PAYEMS", "nonfarm payroll jobs", "thousands", "level"],
  ["unemployment_rate", "UNRATE", "unemployment rate", "percent", "points"],
  ["u6_rate", "U6RATE", "unemployment and underemployment (U-6)", "percent", "points"],
  ["participation_rate", "CIVPART", "labor force participation rate", "percent", "points"],
  ["prime_age_employment_ratio", "LNS12300060", "employed share of people aged 25 to 54", "percent", "points"],
  ["average_hourly_earnings", "CES0500000003", "average hourly earnings, private employees", "dollars", "pct"],
  ["average_weekly_hours", "AWHAETP", "average weekly hours, private employees", "hours", "level"],
  ["job_openings", "JTSJOL", "job openings (JOLTS)", "thousands", "pct"],
  ["quits_rate", "JTSQUR", "quits rate (JOLTS)", "percent", "points"],
  ["layoffs_rate", "JTSLDR", "layoffs and discharges rate (JOLTS)", "percent", "points"],
  ["initial_claims", "ICSA", "initial jobless claims, weekly", "claims", "pct"],
  ["continuing_claims", "CCSA", "continuing jobless claims, weekly", "claims", "pct"],
];

export const laborInput = z.object({
  months: z.number().int().min(1).max(60).optional().describe("Months of payroll gains and the unemployment rate shown, latest last; default 13."),
}).strict();

const DAY = 86400000;
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);

export async function laborMarket(session, args) {
  const a = laborInput.parse(args);
  const start = new Date(session.now() - 900 * DAY).toISOString().slice(0, 10);
  const ids = [...SERIES.map((s) => s[1]), "UNEMPLOY"], got = [];
  // FRED refuses too many open connections at once: seven at a time.
  for (let i = 0; i < ids.length; i += 7) got.push(...(await Promise.all(ids.slice(i, i + 7).map((id) => fredCsv(session, id, { start }).then((s) => s.rows.filter(([, v]) => v != null), () => null)))));
  const byId = Object.fromEntries(ids.map((id, i) => [id, got[i]]));
  const rows = [];
  for (const [key, id, about, unit, how] of SERIES) {
    const s = byId[id];
    if (!s?.length) continue;
    const [date, v] = s.at(-1), prev = s.at(-2);
    const yearAgo = s.filter(([d]) => d <= new Date(Date.parse(date) - 360 * DAY).toISOString().slice(0, 10)).at(-1);
    const change = (b) => (b == null ? null : how === "pct" ? round((v / b - 1) * 100, 1) : round(v - b, how === "points" ? 2 : 1));
    // Monthly series are dated by their month; the weekly claims by their week's end.
    rows.push([key, about, unit, /claims$/.test(key) ? date : date.slice(0, 7), v, prev?.[1] ?? null, change(prev?.[1]), yearAgo?.[1] ?? null, change(yearAgo?.[1])]);
  }
  if (!rows.length) throw new NotFound("FRED returned none of the labor market series.");
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  const pay = byId.PAYEMS ?? [];
  const gains = pay.slice(1).map(([d, v], i) => [d.slice(0, 7), round(v - pay[i][1], 0)]);
  const avg3 = gains.length >= 3 ? round(gains.slice(-3).reduce((s, [, g]) => s + g, 0) / 3, 0) : null;
  const unemployed = byId.UNEMPLOY ?? [];
  const openingsPerUnemployed = by.job_openings ? round(by.job_openings[4] / (unemployed.find(([d]) => d.slice(0, 7) === by.job_openings[3])?.[1] ?? NaN), 2) : null;
  const summary = [];
  if (gains.length) summary.push(`Payrolls ${gains.at(-1)[1] >= 0 ? "rose" : "fell"} ${Math.abs(gains.at(-1)[1])} thousand in ${gains.at(-1)[0]} (three-month average ${avg3} thousand)${by.unemployment_rate ? `; unemployment was ${by.unemployment_rate[4]}% (${by.unemployment_rate[5]}% the month before)` : ""}${by.u6_rate ? `, U-6 ${by.u6_rate[4]}%` : ""}.`);
  if (by.average_hourly_earnings) summary.push(`Average hourly earnings rose ${by.average_hourly_earnings[8]}% on a year.`);
  if (by.job_openings) summary.push(`There were ${round(by.job_openings[4] / 1000, 2)} million job openings in ${by.job_openings[3]}${openingsPerUnemployed != null ? ` (${openingsPerUnemployed} per unemployed person)` : ""}; quits ${by.quits_rate?.[4]}%, layoffs ${by.layoffs_rate?.[4]}%.`);
  if (by.initial_claims) summary.push(`Initial jobless claims were ${by.initial_claims[4].toLocaleString("en-US")} in the week to ${by.initial_claims[3]}.`);
  const months = a.months ?? 13, rate = new Map((byId.UNRATE ?? []).map(([d, v]) => [d.slice(0, 7), v]));
  return {
    summary,
    columns: ["measure", "about", "unit", "as_of", "latest", "previous", "change_on_previous", "year_ago", "change_on_year"], rows,
    openings_per_unemployed: openingsPerUnemployed,
    payrolls: { columns: ["month", "jobs_added_thousands", "unemployment_rate"], rows: gains.slice(-months).map(([m, g]) => [m, g, rate.get(m) ?? null]), three_month_average_thousands: avg3 },
    reading: "Each measure's latest reading beside the one before and a year before (changes in points for rates, percent for levels and wages, units for hours); payrolls gives the jobs added each month.",
    source: `FRED: ${ids.join(", ")} (BLS employment situation, JOLTS; Labor Department claims)`,
    limits: [
      "Payrolls are revised for two months after each release and again each February; JOLTS comes a month after the jobs report.",
      "Not investment advice.",
    ],
  };
}
