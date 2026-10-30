// Government bond yields beyond the US, each from the central bank or ministry that publishes it,
// and the BIS credit cycle. The curves are not built alike (par, zero-coupon, benchmark), so each
// says what it is; a spread across them is a guide, not a trade.
import { z } from "zod";

import { getEncodedText, getJson, getText, NotFound, own, treasuryYear } from "./sources.mjs";

const ECB = (tenors) => `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${tenors.map((t) => `SR_${t}`).join("+")}?lastNObservations=1&format=csvdata`;
const ECB_TENORS = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"];
const BOC_SERIES = { "3M": "TB.CDN.90D.MID", "6M": "TB.CDN.180D.MID", "1Y": "TB.CDN.1Y.MID", "2Y": "BD.CDN.2YR.DQ.YLD", "3Y": "BD.CDN.3YR.DQ.YLD", "5Y": "BD.CDN.5YR.DQ.YLD", "7Y": "BD.CDN.7YR.DQ.YLD", "10Y": "BD.CDN.10YR.DQ.YLD", "30Y": "BD.CDN.LONG.DQ.YLD" };
const BOE_SERIES = { "5Y": "IUDSNZC", "10Y": "IUDMNZC", "20Y": "IUDLNZC" };
const MOF = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
const US_TENORS = { "1 Mo": "1M", "3 Mo": "3M", "6 Mo": "6M", "1 Yr": "1Y", "2 Yr": "2Y", "3 Yr": "3Y", "5 Yr": "5Y", "7 Yr": "7Y", "10 Yr": "10Y", "20 Yr": "20Y", "30 Yr": "30Y" };
const ORDER = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "15Y", "20Y", "25Y", "30Y", "40Y"];
const num = (x) => { const n = Number(String(x ?? "").trim()); return x === "" || x == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000; };

export function ecbCurve(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const [t, v, k] = ["TIME_PERIOD", "OBS_VALUE", "DATA_TYPE_FM"].map((h) => head.indexOf(h));
  const yields = {}; let date = null;
  for (const l of lines.slice(1)) { const c = l.split(","); const m = c[k]?.match(/^SR_(\w+)$/); if (m && num(c[v]) != null) { yields[m[1]] = num(c[v]); date = c[t]; } }
  return { as_of: date, yields };
}
export function mofCurve(text) {
  const lines = text.split(/\r?\n/).map((l) => l.split(",")).filter((c) => c.length > 2);
  const head = lines.find((c) => c[0] === "Date");
  const row = lines.filter((c) => /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(c[0]) && c.slice(1).some((x) => num(x) != null)).at(-1);
  if (!head || !row) throw new Error("The Japanese Ministry of Finance's file did not hold a dated row.");
  const yields = {};
  head.forEach((h, i) => { if (i && num(row[i]) != null) yields[h.trim()] = num(row[i]); });
  const [y, m, d] = row[0].split(/[/-]/);
  return { as_of: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, yields };
}
export function boeCurve(csv) {
  const lines = csv.trim().split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim()));
  const head = lines[0];
  const row = lines.slice(1).filter((c) => c.slice(1).some((x) => num(x) != null)).at(-1);
  if (!row) throw new Error("The Bank of England's file held no observation.");
  const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const [d, m, y] = row[0].split(" ");
  const byCode = Object.fromEntries(Object.entries(BOE_SERIES).map(([t, c]) => [c, t]));
  const yields = {};
  head.forEach((h, i) => { if (i && byCode[h] && num(row[i]) != null) yields[byCode[h]] = num(row[i]); });
  return { as_of: `${y}-${months[m] ?? "01"}-${d.padStart(2, "0")}`, yields };
}

const CURVES = Object.freeze({
  us: { name: "United States", basis: "Treasury par yields", source: "U.S. Treasury", load: async (session) => {
    const year = new Date(session.now()).getUTCFullYear();
    const r = await treasuryYear(session, year, "nominal");
    const row = r.rows[0];
    if (!row) throw new NotFound("The Treasury has published no yields this year yet.");
    const yields = {};
    r.header.forEach((h, i) => { const t = own(US_TENORS, h); if (t && row[i] != null) yields[t] = row[i]; });
    return { as_of: row[0], yields, url: r.url };
  } },
  euro: { name: "Euro area", basis: "zero-coupon spot rates, AAA-rated governments", source: "European Central Bank", load: async (session) => {
    const url = ECB(ECB_TENORS);
    return { ...ecbCurve(await getText(session, url)), url };
  } },
  uk: { name: "United Kingdom", basis: "nominal zero-coupon gilt yields, published with a few days' lag", source: "Bank of England", load: async (session) => {
    const end = new Date(session.now()), start = new Date(session.now() - 21 * 86400000);
    const fmt = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}/${d.getUTCFullYear()}`;
    const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${fmt(start)}&Dateto=${fmt(end)}&SeriesCodes=${Object.values(BOE_SERIES).join(",")}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
    return { ...boeCurve(await getText(session, url)), url };
  } },
  japan: { name: "Japan", basis: "JGB par yields", source: "Ministry of Finance Japan", load: async (session) => ({ ...mofCurve(await getEncodedText(session, MOF, { encoding: "shift_jis" })), url: MOF }) },
  canada: { name: "Canada", basis: "benchmark bond yields and treasury bills", source: "Bank of Canada", load: async (session) => {
    const url = `https://www.bankofcanada.ca/valet/observations/${Object.values(BOC_SERIES).join(",")}/json?recent=7`;
    const obs = (await getJson(session, url)).observations ?? [];
    const yields = {}; let date = null;
    for (const [t, code] of Object.entries(BOC_SERIES)) for (const o of [...obs].reverse()) { const v = num(o[code]?.v); if (v != null) { yields[t] = v; if (!date || o.d > date) date = o.d; break; } }
    return { as_of: date, yields, url };
  } },
});

export const worldYieldsInput = z.object({
  countries: z.array(z.enum(["us", "euro", "uk", "japan", "canada"])).min(1).max(5).optional().describe("Which curves; default all five."),
}).strict();

export async function worldYields(session, args) {
  const a = worldYieldsInput.parse(args);
  const keys = a.countries ?? Object.keys(CURVES);
  const got = await Promise.all(keys.map(async (k) => { try { return [k, await CURVES[k].load(session)]; } catch (err) { return [k, { error: String(err?.message ?? err) }]; } }));
  const ok = got.filter(([, r]) => !r.error);
  if (!ok.length) throw new Error(`No curve could be read: ${got.map(([k, r]) => `${k}: ${r.error}`).join("; ")}`);
  const tenors = ORDER.filter((t) => ok.some(([, r]) => r.yields[t] != null));
  const us10 = ok.find(([k]) => k === "us")?.[1].yields["10Y"] ?? null;
  return {
    columns: ["maturity", ...ok.map(([k]) => k)],
    rows: tenors.map((t) => [t, ...ok.map(([, r]) => r.yields[t] ?? null)]),
    curves: Object.fromEntries(got.map(([k, r]) => [k, r.error ? { name: CURVES[k].name, error: r.error } : { name: CURVES[k].name, as_of: r.as_of, basis: CURVES[k].basis, source: CURVES[k].source, url: r.url, "10y_minus_2y": r.yields["10Y"] != null && r.yields["2Y"] != null ? Math.round((r.yields["10Y"] - r.yields["2Y"]) * 1000) / 1000 : null }])),
    ...(us10 != null ? { ten_year_minus_us: Object.fromEntries(ok.filter(([k, r]) => k !== "us" && r.yields["10Y"] != null).map(([k, r]) => [k, Math.round((r.yields["10Y"] - us10) * 1000) / 1000])) } : {}),
    limits: ["Percent a year. The curves are built differently (see basis) and dated differently (see as_of), so a spread between countries is approximate. Yields are in each country's own currency, before any hedge."],
  };
}

const BIS = "https://stats.bis.org/api/v1/data";

export const creditCycleInput = z.object({
  countries: z.array(z.string().regex(/^[A-Za-z]{2}$/, "a two-letter country code")).min(1).max(8).describe("ISO country codes, e.g. [\"US\", \"CN\", \"GB\"]."),
  quarters: z.number().int().min(1).max(40).optional().describe("Quarters of history for each; default 8."),
}).strict();

export function creditRows(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const at = (h) => head.indexOf(h);
  const out = new Map();
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const v = num(c[at("OBS_VALUE")]);
    if (v == null) continue;
    const key = `${c[at("BORROWERS_CTY")]}|${c[at("TIME_PERIOD")]}`;
    const row = out.get(key) ?? { country: c[at("BORROWERS_CTY")], quarter: c[at("TIME_PERIOD")] };
    row[{ A: "credit_to_gdp_pct", B: "trend_pct", C: "gap_pct_points" }[c[at("CG_DTYPE")]]] = v;
    out.set(key, row);
  }
  return [...out.values()];
}

export async function creditCycle(session, args) {
  const a = creditCycleInput.parse(args);
  const codes = a.countries.map((c) => c.toUpperCase());
  const n = a.quarters ?? 8;
  const url = `${BIS}/WS_CREDIT_GAP/Q.${codes.join("+")}.P.A.A+B+C/?lastNObservations=${n}&format=csv`;
  let rows;
  try { rows = creditRows(await getText(session, url)); } catch (err) { if (err instanceof NotFound) throw new NotFound(`The BIS publishes no credit gap for ${codes.join(", ")}.`); throw err; }
  if (!rows.length) throw new NotFound(`The BIS publishes no credit gap for ${codes.join(", ")}.`);
  const latest = codes.map((c) => rows.filter((r) => r.country === c).at(-1)).filter(Boolean);
  return {
    latest: { columns: ["country", "quarter", "credit_to_gdp_pct", "trend_pct", "gap_pct_points"], rows: latest.map((r) => [r.country, r.quarter, r.credit_to_gdp_pct ?? null, r.trend_pct ?? null, r.gap_pct_points ?? null]) },
    missing: codes.filter((c) => !latest.some((r) => r.country === c)),
    columns: ["country", "quarter", "credit_to_gdp_pct", "trend_pct", "gap_pct_points"],
    rows: rows.map((r) => [r.country, r.quarter, r.credit_to_gdp_pct ?? null, r.trend_pct ?? null, r.gap_pct_points ?? null]),
    gap_means: "Credit to the private non-financial sector as a share of GDP, less its long-run trend. Basel III's guide for the countercyclical capital buffer starts at a gap of 2 points and reaches its maximum at 10; a high gap has often preceded banking stress, and is not a forecast.",
    source: url,
  };
}
