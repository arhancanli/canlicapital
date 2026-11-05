// commodity_prices: world commodity prices from the World Bank's Pink Sheet, monthly since 1960 in US dollars: oil,
// gas, LNG and coal, metals and precious metals, grains, oilseeds, beverages, sugar, cotton, rubber, timber and
// fertilizers, each with its change on a month, a year and five years and its record; the World Bank's price indexes
// by sector; or one commodity month by month. The workbook's address changes each month, so it is read from the World
// Bank's page. No key.
import { z } from "zod";

import { getText, getZipText, NotFound } from "./sources.mjs";
import { xlsxSheets } from "./xlsx.mjs";

const PAGE = "https://www.worldbank.org/en/research/commodity-markets";
const HEADLINE = ["Crude oil, Brent", "Crude oil, WTI", "Natural gas, US", "Natural gas, Europe", "Liquefied natural gas, Japan", "Coal, Australian", "Gold", "Silver", "Copper", "Aluminum", "Iron ore, cfr spot", "Nickel", "Wheat, US HRW", "Maize", "Soybeans", "Rice, Thai 5%", "Sugar, world", "Coffee, Arabica", "Cocoa", "Palm oil", "Cotton, A Index", "Urea", "DAP"];
const ALIASES = { oil: "Crude oil, average", "crude oil": "Crude oil, average", brent: "Crude oil, Brent", wti: "Crude oil, WTI", dubai: "Crude oil, Dubai", gas: "Natural gas, US", "natural gas": "Natural gas, US", "henry hub": "Natural gas, US", "european gas": "Natural gas, Europe", ttf: "Natural gas, Europe", lng: "Liquefied natural gas, Japan", coal: "Coal, Australian", corn: "Maize", "iron ore": "Iron ore, cfr spot", wheat: "Wheat, US HRW", rice: "Rice, Thai 5%", sugar: "Sugar, world", coffee: "Coffee, Arabica", cotton: "Cotton, A Index", rubber: "Rubber, RSS3", tea: "Tea, avg 3 auctions", potash: "Potassium chloride", fertilizer: "Urea" };

export const commodityInput = z.object({
  commodity: z.string().min(2).max(60).optional().describe("One commodity by name (copper, Brent, iron ore, cocoa, urea, LNG...): its price month by month with its record."),
  all: z.boolean().optional().describe("Every commodity in the Pink Sheet (about seventy), not only the headline ones."),
  months: z.number().int().min(1).max(800).optional().describe("commodity: months shown, latest last; default 25."),
}).strict();

const num = (s) => { const t = String(s ?? "").trim(); const n = Number(t); return t === "" || t === "…" || !Number.isFinite(n) ? null : n; };
const sig = (x) => (x == null ? null : Number(x.toPrecision(x >= 100 ? 6 : 4)));
const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const change = (a, b) => (a == null || !b ? null : round((a / b - 1) * 100));
const month = (label) => label.replace(/^(\d{4})M(\d{2})$/, "$1-$2");
const clean = (name) => String(name ?? "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();

// The workbook's two tabs: prices (names, units, a row a month) and the sector indexes (named by their deepest header).
export function pinkSheet(bytes) {
  const [prices, indices] = xlsxSheets(bytes, ["Monthly Prices", "Monthly Indices"]);
  const updated = /Updated on (.+)$/.exec(prices.flat().find((c) => /^Updated on /.test(c)) ?? "")?.[1] ?? null;
  const dataRows = (rows) => rows.filter((r) => /^\d{4}M\d{2}$/.test(r[0]));
  const head = prices.findIndex((r) => r[0] === "" && r.slice(1).some((c) => /Crude oil/.test(c)));
  const cols = prices[head].map((h, i) => [clean(h), prices[head + 1]?.[i] ?? "", i]).filter(([h, , i]) => i > 0 && h);
  const first = indices.findIndex((r) => /^\d{4}M\d{2}$/.test(r[0]));
  const indexCols = (indices[first] ?? []).map((_, i) => i).filter((i) => i > 0).map((i) => [clean(indices.slice(0, first).map((r) => r[i]).filter((c) => clean(c)).at(-1)), i]).filter(([n]) => n);
  return JSON.stringify({
    updated,
    prices: { names: cols.map(([h]) => h), units: cols.map(([, u]) => u.replace(/^\(|\)$/g, "")), months: dataRows(prices).map((r) => month(r[0])), values: dataRows(prices).map((r) => cols.map(([, , i]) => sig(num(r[i])))) },
    indices: { names: indexCols.map(([n]) => n), months: dataRows(indices).map((r) => month(r[0])), values: dataRows(indices).map((r) => indexCols.map(([, i]) => sig(num(r[i])))) },
  });
}

async function workbook(session) {
  const page = await getText(session, PAGE, { maxBytes: 4 * 1024 * 1024 });
  const link = /href="(https:\/\/thedocs\.worldbank\.org\/[^"]*CMO-Historical-Data-Monthly\.xlsx)"/.exec(page)?.[1];
  if (!link) throw new NotFound("The World Bank's commodity page links no monthly Pink Sheet workbook.");
  return { link, data: JSON.parse(await getZipText(session, link, { decode: pinkSheet })) };
}

export function findCommodity(names, words) {
  const want = clean(ALIASES[String(words).trim().toLowerCase()] ?? words).toLowerCase();
  const lower = names.map((n) => n.toLowerCase());
  const i = [lower.indexOf(want), lower.findIndex((n) => n.startsWith(want)), lower.findIndex((n) => n.includes(want))].find((k) => k >= 0);
  if (i == null) throw new NotFound(`The Pink Sheet has no ${words}; it has ${names.join(", ")}.`);
  return i;
}

// A column's latest value with its changes, and its record.
function reading(months, values, j) {
  let last = -1;
  for (let k = values.length - 1; k >= 0; k--) if (values[k][j] != null) { last = k; break; }
  if (last < 0) return null;
  const v = values[last][j], at = (n) => values[last - n]?.[j] ?? null;
  let peak = last;
  for (let k = 0; k < values.length; k++) if (values[k][j] != null && values[k][j] > values[peak][j]) peak = k;
  return { month: months[last], value: v, month_pct: change(v, at(1)), year_pct: change(v, at(12)), five_years_pct: change(v, at(60)), record: { month: months[peak], value: values[peak][j] } };
}

const LIMITS = [
  "Source: World Bank, Commodity Price Data (the Pink Sheet), monthly averages in nominal US dollars; the World Bank revises recent months.",
  "These are the World Bank's assessments; other benchmarks of the same commodity differ (October 2026 WTI: 97.7 here, 102.07 in the EIA's monthly average; Brent 125 against the EIA's 123.93).",
  "Not investment advice.",
];

export async function commodityPrices(session, args) {
  const a = commodityInput.parse(args);
  const { link, data } = await workbook(session);
  const P = data.prices;
  if (a.commodity) {
    const j = findCommodity(P.names, a.commodity), r = reading(P.months, P.values, j);
    if (!r) throw new NotFound(`The Pink Sheet has no prices for ${P.names[j]}.`);
    const shown = (a.months ?? 25);
    return {
      commodity: P.names[j], unit: P.units[j], updated: data.updated,
      summary: [`${P.names[j]} averaged ${r.value} ${P.units[j]} in ${r.month}, ${r.year_pct >= 0 ? "up" : "down"} ${Math.abs(r.year_pct)}% on a year${r.record.month === r.month ? ", a record" : `; its record is ${r.record.value} (${r.record.month})`}.`],
      latest: r,
      columns: ["month", "price"], rows: P.months.map((m, k) => [m, P.values[k][j]]).filter(([, v]) => v != null).slice(-shown),
      reading: `The World Bank's monthly average price of ${P.names[j]} in ${P.units[j]}, oldest first.`,
      source: `${link} (${PAGE})`, limits: LIMITS,
    };
  }
  const pick = a.all ? P.names.map((_, j) => j) : HEADLINE.map((n) => P.names.indexOf(n)).filter((j) => j >= 0);
  const rows = pick.map((j) => { const r = reading(P.months, P.values, j); return r && [P.names[j], P.units[j], r.month, r.value, r.month_pct, r.year_pct, r.five_years_pct]; }).filter(Boolean);
  const I = data.indices;
  const indexRows = I.names.map((n, j) => { const r = reading(I.months, I.values, j); return r && [n, r.month, r.value, r.month_pct, r.year_pct]; }).filter(Boolean);
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  const say = (n, label) => by[n] && `${label} ${by[n][3]} ${by[n][1]} (${by[n][5] >= 0 ? "+" : ""}${by[n][5]}% on a year)`;
  return {
    month: rows[0]?.[2] ?? null, updated: data.updated,
    summary: [`In ${rows[0]?.[2]}: ${[say("Crude oil, Brent", "Brent"), say("Gold", "gold"), say("Copper", "copper"), say("Wheat, US HRW", "wheat")].filter(Boolean).join("; ")}.`],
    columns: ["commodity", "unit", "month", "price", "change_on_month_pct", "change_on_year_pct", "change_five_years_pct"], rows,
    indices: { columns: ["index", "month", "value_2010_100", "change_on_month_pct", "change_on_year_pct"], rows: indexRows },
    reading: "Each commodity's monthly average price in the latest month with its change on a month, a year and five years; the World Bank's sector indexes (2010 = 100) beside them.",
    source: `${link} (${PAGE})`, limits: LIMITS,
  };
}
