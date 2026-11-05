// state_economy: a US state's economy beside the nation's, from FRED's state series: the unemployment rate (BLS),
// payroll jobs (BLS), the Philadelphia Fed's coincident index of activity, house prices (FHFA) and real GDP (BEA), each
// with its change on a year; or every state and DC ranked by one of them. No key.
import { z } from "zod";

import { fredCsv, NotFound } from "./sources.mjs";

export const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
// Each measure: FRED's id for a state and for the nation, its unit, and how its change is measured.
const MEASURES = {
  unemployment: { id: (s) => `${s}UR`, us: "UNRATE", label: "unemployment rate", unit: "percent", change: "points" },
  jobs: { id: (s) => `${s}NA`, us: "PAYEMS", label: "payroll jobs", unit: "thousands", change: "pct" },
  activity: { id: (s) => `${s}PHCI`, us: "USPHCI", label: "coincident index of activity (Philadelphia Fed)", unit: "index", change: "pct" },
  house_prices: { id: (s) => `${s}STHPI`, us: "USSTHPI", label: "house price index (FHFA, all transactions)", unit: "index", change: "pct" },
  // The nation's real GDP is in billions; the states' in millions.
  real_gdp: { id: (s) => `${s}RQGSP`, us: "GDPC1", usScale: 1000, label: "real GDP (millions of chained dollars, annual rate)", unit: "millions", change: "pct" },
};

export const stateInput = z.object({
  state: z.string().min(2).max(40).optional().describe("A state or DC by name or postal code (\"Texas\", \"TX\")."),
  rank: z.enum(["unemployment", "jobs", "activity", "house_prices"]).optional().describe("Instead of one state: every state and DC ranked by this measure (unemployment by its rate, the others by their change on a year)."),
}).strict();

const DAY = 86400000;
const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);

export function stateCode(words) {
  const w = String(words ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(w) && STATES[w.toUpperCase()]) return w.toUpperCase();
  const hit = Object.entries(STATES).find(([, name]) => name.toLowerCase() === w.toLowerCase().replace(/^state of /, "").replace(/^washington,? d\.?c\.?$/, "district of columbia"));
  if (!hit) throw new NotFound(`${w} is not a US state or DC; name one, as "Texas" or "TX".`);
  return hit[0];
}

// A series' latest value and its change on a year (points or percent).
async function reading(session, id, change) {
  const rows = (await fredCsv(session, id, { start: new Date(session.now() - 800 * DAY).toISOString().slice(0, 10) })).rows.filter(([, v]) => v != null);
  if (!rows.length) return null;
  const [date, value] = rows.at(-1);
  // The same month or quarter a year earlier, or no change: FRED has gaps (October 2025, during the shutdown).
  const then = rows.find(([d]) => d === `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`);
  return { date: date.slice(0, 7), value, change: then ? (change === "points" ? round(value - then[1], 2) : round((value / then[1] - 1) * 100)) : null };
}

// FRED refuses too many open connections at once: eight at a time.
async function inBatches(jobs, size = 8) {
  const out = [];
  for (let i = 0; i < jobs.length; i += size) out.push(...(await Promise.all(jobs.slice(i, i + size).map((job) => job()))));
  return out;
}

const LIMITS = [
  "State figures are the BLS's, the Philadelphia Fed's, the FHFA's and the BEA's as FRED carries them; state payrolls and unemployment are revised each March, and real GDP by state comes a quarter after the nation's.",
  "Not investment advice.",
];

export async function stateEconomy(session, args) {
  const a = stateInput.parse(args);
  if (a.rank) {
    const m = MEASURES[a.rank];
    const codes = Object.keys(STATES);
    const got = await inBatches(codes.map((s) => () => reading(session, m.id(s), m.change).catch(() => null)));
    const us = await reading(session, m.us, m.change).catch(() => null);
    const missing = codes.filter((s, i) => got[i]?.value == null).map((s) => STATES[s]);
    const key = a.rank === "unemployment" ? (r) => r.value : (r) => r.change;
    const rows = codes.map((s, i) => [STATES[s], s, got[i]?.date ?? null, round(got[i]?.value, 2), got[i]?.change ?? null]).filter((r) => r[3] != null)
      .sort((x, y) => (key({ value: y[3], change: y[4] }) ?? -1e9) - (key({ value: x[3], change: x[4] }) ?? -1e9));
    const top = rows[0], bottom = rows.at(-1);
    const how = (r) => (a.rank === "unemployment" ? `${r[3]}%` : `${r[4] >= 0 ? "+" : ""}${r[4]}% on a year`);
    return {
      rank: a.rank, measure: m.label,
      summary: top ? [`${a.rank === "unemployment" ? "Highest unemployment" : "Fastest growth"}: ${top[0]} (${how(top)}); ${a.rank === "unemployment" ? "lowest" : "slowest"}: ${bottom[0]} (${how(bottom)})${us ? `; the US ${a.rank === "unemployment" ? `${us.value}%` : `${us.change >= 0 ? "+" : ""}${us.change}% on a year`} (${us.date})` : ""}.`] : [],
      us: us && { date: us.date, value: round(us.value, 2), change_on_year: us.change },
      columns: ["state", "code", "as_of", "latest", m.change === "points" ? "change_on_year_points" : "change_on_year_pct"], rows,
      reading: `Every state and DC ranked by ${a.rank === "unemployment" ? "its unemployment rate, highest first" : `the change in its ${m.label} on a year, fastest first`}.`,
      source: `FRED: ${m.id("{ST}")} for each state, ${m.us} for the US`,
      limits: [...(missing.length ? [`FRED returned nothing for ${missing.join(", ")} this time; ${missing.length === 1 ? "it is" : "they are"} left out of the ranking.`] : []), ...LIMITS],
    };
  }
  if (!a.state) throw new NotFound("Name a state (\"Texas\") or ask for a ranking (rank: \"unemployment\").");
  const code = stateCode(a.state);
  const fetched = await inBatches(Object.values(MEASURES).flatMap((m) => [() => reading(session, m.id(code), m.change).catch(() => null), () => reading(session, m.us, m.change).catch(() => null)]));
  const pairs = Object.values(MEASURES).map((_, i) => [fetched[2 * i], fetched[2 * i + 1]]);
  const rows = Object.entries(MEASURES).map(([key, m], i) => {
    const [st, us] = pairs[i];
    return st ? [key, m.label, st.date, round(st.value, 2), st.change, m.change === "points" ? "points" : "pct", us ? round(us.value * (m.usScale ?? 1), 2) : null, us?.change ?? null] : null;
  }).filter(Boolean);
  if (!rows.length) throw new NotFound(`FRED returned none of ${STATES[code]}'s series.`);
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  const summary = [];
  // A clause on the US or on the year only where FRED gave it.
  const us = (v) => (v == null ? "" : ` (the US ${v}%)`);
  const u = by.unemployment, j = by.jobs, h = by.house_prices;
  if (u) summary.push(`${STATES[code]}'s unemployment rate was ${u[3]}% in ${u[2]}${us(u[6])}${u[4] == null ? "" : `, ${u[4] >= 0 ? "up" : "down"} ${Math.abs(u[4])} points on a year`}.`);
  const jobs = j?.[4] == null ? null : `Payroll jobs ${j[4] >= 0 ? "grew" : "fell"} ${Math.abs(j[4])}% on a year${us(j[7])}`;
  const homes = h?.[4] == null ? null : `house prices ${h[4] >= 0 ? "rose" : "fell"} ${Math.abs(h[4])}%${us(h[7])}`;
  if (jobs || homes) summary.push(`${jobs ?? ""}${jobs && homes ? "; " : ""}${jobs ? homes ?? "" : homes ? `${homes[0].toUpperCase()}${homes.slice(1)} on a year` : ""}.`);
  return {
    state: STATES[code], code, summary,
    columns: ["measure", "about", "as_of", "latest", "change_on_year", "change_unit", "us_latest", "us_change_on_year"], rows,
    reading: `${STATES[code]}'s latest reading of each measure and its change on a year, beside the US.`,
    source: `FRED: ${Object.values(MEASURES).map((m) => m.id(code)).join(", ")} and ${Object.values(MEASURES).map((m) => m.us).join(", ")}`,
    limits: LIMITS,
  };
}
