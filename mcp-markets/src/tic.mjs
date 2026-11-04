// treasury_holders: who holds US Treasury securities, by country, from the Treasury's TIC system (its table of major
// foreign holders, the last thirteen month ends), with each country's change on a year, its share of all foreign
// holdings and its rank, and how much foreign official institutions hold. No key.
import { z } from "zod";

import { getText, NotFound } from "./sources.mjs";

const TABLE = "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/slt_table5.txt";
const ALIASES = { china: "China, Mainland", "mainland china": "China, Mainland", prc: "China, Mainland", korea: "Korea, South", "south korea": "Korea, South", uk: "United Kingdom", britain: "United Kingdom", "great britain": "United Kingdom", uae: "United Arab Emirates", emirates: "United Arab Emirates", hk: "Hong Kong" };
const TOTALS = /^(All Other|Grand Total|Of Which)/i;

export const ticInput = z.object({
  country: z.string().min(2).max(60).optional().describe("A country in the Treasury's table (China, Japan, United Kingdom...); default every one."),
  months: z.number().int().min(1).max(13).optional().describe("Month ends to show, latest last; default 13 for one country, 1 for the table (with the change on a year)."),
}).strict();

const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);

// The table as months (oldest first) and rows of a name and one value a month.
export function ticTable(text) {
  const lines = text.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim()));
  const head = lines.findIndex((c) => c[0] === "Country");
  if (head < 0) throw new Error("The Treasury's table of major foreign holders had no header row.");
  const months = lines[head].slice(1).filter((m) => /^\d{4}-\d{2}$/.test(m));
  const rows = [];
  for (const c of lines.slice(head + 1)) {
    if (!c[0] || /^Notes?:/i.test(c[0])) { if (rows.length) break; continue; }
    const values = months.map((_, i) => { const n = Number(String(c[i + 1] ?? "").replace(/,/g, "")); return c[i + 1] === "" || !Number.isFinite(n) ? null : n; });
    rows.push({ name: c[0], values });
  }
  // Oldest first.
  return { months: [...months].reverse(), rows: rows.map((r) => ({ name: r.name, values: [...r.values].reverse() })) };
}

export async function treasuryHolders(session, args) {
  const a = ticInput.parse(args);
  const { months, rows } = ticTable(await getText(session, TABLE));
  if (!months.length) throw new Error("The Treasury's table of major foreign holders held no months.");
  const total = rows.find((r) => /^Grand Total/i.test(r.name));
  const countries = rows.filter((r) => !TOTALS.test(r.name));
  const last = months.length - 1, ago = months.length - 13;
  const share = (r, i) => (total?.values[i] ? round((r.values[i] / total.values[i]) * 100) : null);
  const ranked = [...countries].sort((x, y) => (y.values[last] ?? 0) - (x.values[last] ?? 0));
  const limits = [
    "The Treasury's own caution: holdings are reported mainly by US custodians, so securities held in custody abroad are counted under the custodian's country (Belgium, Luxembourg, the Cayman Islands and Switzerland hold others' Treasuries), not the owner's.",
    "Billions of dollars at month ends, as the TIC system estimates them; the Treasury revises them.",
    "Not investment advice.",
  ];
  if (a.country) {
    const q = a.country.trim().toLowerCase();
    const name = ALIASES[q] ?? a.country;
    const r = countries.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? countries.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()));
    if (!r) throw new NotFound(`The Treasury's table of major foreign holders names ${countries.map((x) => x.name).join(", ")}; ${a.country} is among "All Other", which the table does not split.`);
    const shown = a.months ?? 13;
    return {
      country: r.name,
      latest: { month: months[last], billions: r.values[last] },
      ...(ago >= 0 ? { year_ago: { month: months[ago], billions: r.values[ago] }, change_on_year: round(r.values[last] - r.values[ago]) } : {}),
      share_of_foreign_pct: share(r, last), rank: ranked.indexOf(r) + 1,
      columns: ["month", "billions"], rows: months.map((m, i) => [m, r.values[i]]).slice(-shown),
      reading: "Treasury bills, notes and bonds held by residents of the country at each month end, in billions of dollars; share and rank are against all foreign holdings.",
      source: TABLE, limits,
    };
  }
  const shown = a.months ?? 1;
  const window = months.slice(-shown);
  return {
    month: months[last],
    columns: ["country", ...window, ...(ago >= 0 ? ["change_on_year"] : []), "share_of_foreign_pct"],
    rows: ranked.map((r) => [r.name, ...r.values.slice(-shown), ...(ago >= 0 ? [round(r.values[last] - r.values[ago])] : []), share(r, last)]),
    totals: Object.fromEntries(rows.filter((r) => TOTALS.test(r.name)).map((r) => [r.name.replace(/^Of Which:\s*/i, "of which ").toLowerCase().replace(/\s+/g, "_"), { [months[last]]: r.values[last], ...(ago >= 0 ? { [months[ago]]: r.values[ago] } : {}) }])),
    reading: "Major foreign holders of Treasury securities at the latest month end, largest first, with the change on a year and the share of all foreign holdings (billions of dollars).",
    source: TABLE, limits,
  };
}
