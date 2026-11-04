// financial_cycle: where a country stands in its financial cycle, from the Bank for International Settlements'
// own series: house prices (real and nominal, and their change on a year), the share of income households
// and companies spend servicing debt, credit to households, companies and government as a share of GDP, and
// the currency's real and nominal effective exchange rate. Comparable across 40 to 60 economies. No key.
import { z } from "zod";

import { getText, NotFound } from "./sources.mjs";

const BIS = "https://stats.bis.org/api/v1/data";
const MEASURES = ["house_prices", "debt_service", "credit", "exchange_rate"];

export const cycleInput = z.object({
  countries: z.array(z.string().regex(/^[A-Za-z]{2}$/, "a two-letter country code")).min(1).max(8).describe("ISO country codes, e.g. [\"CA\", \"AU\", \"CN\"]; XM is the euro area."),
  measures: z.array(z.enum(MEASURES)).min(1).max(4).optional().describe("house_prices, debt_service, credit and exchange_rate. Default all four."),
  periods: z.number().int().min(1).max(40).optional().describe("Quarters of history for each series (months three times as many for exchange rates). Default 8."),
}).strict();

// RFC 4180 rows: the BIS quotes fields that hold commas (its series titles do).
export function csvRows(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c !== "")) rows.push(row); }
  if (!rows.length) return [];
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] ?? ""])));
}

const num = (s) => (s === "" || s == null || s === "NaN" ? null : Number(s));

async function read(session, flow, key, n) {
  const url = `${BIS}/${flow}/${key}/?lastNObservations=${n}&format=csv`;
  try { return { url, rows: csvRows(await getText(session, url)) }; } catch (err) { if (err instanceof NotFound) return { url, rows: [] }; throw err; }
}

// Each measure's request (several countries in one) and how its series become named columns.
const SPEC = {
  house_prices: { flow: "WS_SPP", key: (cc) => `Q.${cc}.N+R.628+771`, area: "REF_AREA", name: (r) => `${r.VALUE === "R" ? "real" : "nominal"}_${r.UNIT_MEASURE === "628" ? "index_2010" : "change_on_year_pct"}`, keep: ["real_index_2010", "real_change_on_year_pct", "nominal_change_on_year_pct"] },
  debt_service: { flow: "WS_DSR", key: (cc) => `Q.${cc}.H+N+P`, area: "BORROWERS_CTY", name: (r) => ({ H: "households_pct_income", N: "companies_pct_income", P: "private_sector_pct_income" })[r.DSR_BORROWERS] },
  credit: { flow: "WS_TC", key: (cc) => `Q.${cc}.H+N+P+G.A.M+N.770.A`, area: "BORROWERS_CTY", name: (r) => `${({ H: "households", N: "companies", P: "private_sector", G: "government" })[r.TC_BORROWERS]}_pct_gdp${r.VALUATION === "N" ? "@nominal" : ""}` },
  exchange_rate: { flow: "WS_EER", key: (cc) => `M.N+R.B.${cc}`, area: "REF_AREA", name: (r) => `${r.EER_TYPE === "R" ? "real" : "nominal"}_index_2020`, monthly: true },
};

// One table per measure: a row per country and period, a column per series.
function tabulate(rows, spec) {
  const byKey = new Map();
  for (const r of rows) {
    const v = num(r.OBS_VALUE), name = spec.name(r);
    if (v == null || !name) continue;
    const k = `${r[spec.area]}|${r.TIME_PERIOD}`;
    const row = byKey.get(k) ?? { country: r[spec.area], period: r.TIME_PERIOD };
    row[name] = Math.round(v * 100) / 100;
    byKey.set(k, row);
  }
  // Government debt at market value where the BIS has it, at nominal value otherwise; the other sectors at market value.
  for (const row of byKey.values()) {
    for (const k of Object.keys(row).filter((x) => x.endsWith("@nominal"))) {
      const base = k.slice(0, -"@nominal".length);
      if (row[base] == null) { row[base] = row[k]; row[`${base}_basis`] = "nominal value"; }
      delete row[k];
    }
  }
  const out = [...byKey.values()].sort((x, y) => (x.country === y.country ? (x.period < y.period ? -1 : 1) : x.country < y.country ? -1 : 1));
  const columns = ["country", "period", ...[...new Set(out.flatMap((r) => Object.keys(r)))].filter((c) => c !== "country" && c !== "period").sort()];
  return { columns, rows: out.map((r) => columns.map((c) => r[c] ?? null)) };
}

export async function financialCycle(session, args) {
  const a = cycleInput.parse(args);
  const codes = [...new Set(a.countries.map((c) => c.toUpperCase()))];
  const measures = a.measures ?? MEASURES, n = a.periods ?? 8;
  const reads = await Promise.all(measures.map((m) => read(session, SPEC[m].flow, SPEC[m].key(codes.join("+")), SPEC[m].monthly ? n * 3 : n)));
  const tables = {}, latest = Object.fromEntries(codes.map((c) => [c, {}])), missing = [];
  measures.forEach((m, i) => {
    const t = tabulate(reads[i].rows, SPEC[m]);
    tables[m] = t;
    for (const cc of codes) {
      const mine = t.rows.filter((r) => r[0] === cc);
      if (!mine.length) { missing.push(`${cc}: ${m}`); continue; }
      const last = mine.at(-1);
      latest[cc][m] = Object.fromEntries(t.columns.slice(1).map((c, j) => [c, last[j + 1]]).filter(([, v]) => v != null));
    }
  });
  if (missing.length === codes.length * measures.length) throw new NotFound(`The BIS publishes none of these series for ${codes.join(", ")}.`);
  return {
    latest, ...tables,
    ...(missing.length ? { not_published: missing } : {}),
    reading: "House price indices are 2010 = 100, the effective exchange rates 2020 = 100 (a higher rate is a stronger currency). Debt service is interest and principal as a share of income; credit is all lenders' credit as a share of GDP, at market value (government at nominal value where the BIS has no market value).",
    source: "Bank for International Settlements statistics (stats.bis.org SDMX API, no key)",
    sources: reads.map((r) => r.url),
    limits: [
      "As the Bank for International Settlements publishes them from central banks and statistics offices; quarters arrive about two quarters late and are revised.",
      "Coverage differs: debt service ratios cover about 30 economies, house prices and credit 40 to 60. A measure with no series for a country is listed under not_published.",
      "Not investment advice.",
    ],
  };
}
