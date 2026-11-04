// factor_returns: the Fama-French factors from Kenneth French's data library at Dartmouth, the series most
// factor regressions use. The market's return over the T-bill (Mkt-RF), size (SMB), value (HML),
// profitability (RMW), investment (CMA), momentum (Mom) and the one-month T-bill rate (RF), monthly, daily or
// by year, as fractions, so they go straight into a regression.
import { z } from "zod";

import { getZipText, NotFound } from "./sources.mjs";

const LIBRARY = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french";
const FILES = Object.freeze({
  ff3: { monthly: "F-F_Research_Data_Factors_CSV.zip", daily: "F-F_Research_Data_Factors_daily_CSV.zip" },
  ff5: { monthly: "F-F_Research_Data_5_Factors_2x3_CSV.zip", daily: "F-F_Research_Data_5_Factors_2x3_daily_CSV.zip" },
  momentum: { monthly: "F-F_Momentum_Factor_CSV.zip", daily: "F-F_Momentum_Factor_daily_CSV.zip" },
});
// Which files make each model; momentum adds only its own column.
const MODELS = Object.freeze({ ff3: ["ff3"], ff5: ["ff5"], momentum: ["momentum"], carhart: ["ff3", "momentum"], ff5_momentum: ["ff5", "momentum"] });
const PERIOD = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export const factorInput = z.object({
  model: z.enum(["ff3", "ff5", "momentum", "carhart", "ff5_momentum"]).optional().describe("ff3 (market, size, value), ff5 (adds profitability and investment), momentum, carhart (ff3 and momentum) or ff5_momentum. Default ff3."),
  frequency: z.enum(["monthly", "daily", "annual"]).optional().describe("Default monthly."),
  start: z.string().regex(PERIOD, "YYYY, YYYY-MM or YYYY-MM-DD").optional().describe("First period: YYYY, YYYY-MM or YYYY-MM-DD. Default ten years before the latest (one year for daily; every year for annual)."),
  end: z.string().regex(PERIOD, "YYYY, YYYY-MM or YYYY-MM-DD").optional().describe("Last period. Default the latest published."),
}).strict();

// The library's CSV: a few lines of notes, then sections, each a header (",Mkt-RF,SMB,...") and rows of a
// period (YYYYMM, YYYYMMDD or YYYY) and values in percent. A monthly file holds a monthly section and then
// "Annual Factors: January-December". -99.99 and -999 mark a missing value.
export function parseLibrary(text) {
  const out = { monthly: new Map(), daily: new Map(), annual: new Map(), columns: null, through: null };
  let columns = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const through = /using the (\d{6}) CRSP database/i.exec(line);
    if (through) out.through = `${through[1].slice(0, 4)}-${through[1].slice(4)}`;
    if (line.startsWith(",")) { columns = line.split(",").slice(1).map((s) => s.trim()).filter(Boolean); out.columns ??= columns; continue; }
    const cells = line.split(",").map((s) => s.trim());
    if (!columns || !/^\d{4}(\d{2}(\d{2})?)?$/.test(cells[0])) continue;
    const p = cells[0], values = cells.slice(1, columns.length + 1).map((v) => { const x = Number(v); return Number.isFinite(x) && x > -99.99 ? Math.round(x * 1e4) / 1e6 : null; });
    const [kind, key] = p.length === 8 ? ["daily", `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6)}`] : p.length === 6 ? ["monthly", `${p.slice(0, 4)}-${p.slice(4)}`] : ["annual", p];
    out[kind].set(key, Object.fromEntries(columns.map((c, i) => [c, values[i] ?? null])));
  }
  return out;
}

// A period bound at the frequency's precision: "2016" starts at "2016-01" monthly and ends at "2016-12".
function bound(s, frequency, last) {
  if (!s) return null;
  const [y, m, d] = s.split("-");
  if (frequency === "annual") return y;
  if (frequency === "monthly") return `${y}-${m ?? (last ? "12" : "01")}`;
  return `${y}-${m ?? (last ? "12" : "01")}-${d ?? (last ? "31" : "01")}`;
}
const back = (latest, frequency) => (frequency === "monthly" ? `${Number(latest.slice(0, 4)) - 10}${latest.slice(4)}` : frequency === "daily" ? `${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}` : null);

export async function factorReturns(session, args) {
  const a = factorInput.parse(args ?? {});
  const model = a.model ?? "ff3", frequency = a.frequency ?? "monthly";
  const files = MODELS[model];
  const read = await Promise.all(files.map(async (f) => [f, parseLibrary(await getZipText(session, `${LIBRARY}/ftp/${FILES[f][frequency === "daily" ? "daily" : "monthly"]}`))]));
  // Momentum adds only its own column; the other files give the market, the factors and the T-bill rate.
  const columns = [...new Set(read.flatMap(([f, p]) => (f === "momentum" && read.length > 1 ? p.columns.filter((c) => c !== "RF") : p.columns)))];
  const maps = read.map(([, p]) => p[frequency]);
  let periods = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k))).sort();
  if (!periods.length) throw new NotFound(`The library has no ${frequency} ${model} factors.`);
  const latest = periods[periods.length - 1];
  const from = bound(a.start, frequency, false) ?? back(latest, frequency), to = bound(a.end, frequency, true);
  periods = periods.filter((p) => (!from || p >= from) && (!to || p <= to));
  if (!periods.length) throw new NotFound(`No ${frequency} ${model} factors between ${from ?? "the first"} and ${to ?? latest}; the library runs from ${[...maps[0].keys()].sort()[0]} to ${latest}.`);
  const kept = periods.slice(-5000);
  const rows = kept.map((p) => [p, ...columns.map((c) => maps.find((m) => c in (m.get(p) ?? {}))?.get(p)[c] ?? null)]);
  return {
    model, frequency,
    units: "fractions of one per period (0.01 is 1%), from the library's percent",
    data_through: read[0][1].through,
    columns: ["period", ...columns], rows, count: rows.length,
    ...(periods.length > kept.length ? { truncated_to_last: kept.length } : {}),
    source: `${LIBRARY}/data_library.html`,
    limits: [
      "Kenneth R. French's data library as published (Fama and French's factors from CRSP, updated about monthly); a revision of past values by the library shows up the next time it is read.",
      "Mkt-RF is the US market's return over the one-month T-bill rate (RF). Factors are long-short portfolio returns, not tradable as published (no costs).",
    ],
  };
}
