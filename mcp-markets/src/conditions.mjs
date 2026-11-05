// financial_conditions: how loose or tight US financial conditions are and how much stress markets show, in one
// answer: the OFR's daily Financial Stress Index with what each of its five categories and three regions adds, the
// Chicago Fed's NFCI with its risk, credit and leverage parts, the St. Louis and Kansas City Feds' stress indexes, the
// Fed Board's Gilchrist-Zakrajšek credit spread and excess bond premium, corporate bond spreads by rating (ICE BofA,
// option-adjusted), Moody's Baa less the 10-year Treasury and the VIX; each with its changes, where it stands in its
// own history and when it was last this low or this high. No key.
import { z } from "zod";

import { fredCsv, getText, NotFound } from "./sources.mjs";

const OFR = "https://www.financialresearch.gov/financial-stress-index/data/fsi.csv";
const OFR_PAGE = "https://www.financialresearch.gov/financial-stress-index/";
const EBP = "https://www.federalreserve.gov/econres/notes/feds-notes/ebp_csv.csv";
export const EBP_PAGE = "https://www.federalreserve.gov/econres/notes/feds-notes/updating-the-recession-risk-and-the-excess-bond-premium-20161006.html";
// The OFR's columns: the index, its five categories and its three regions (each set adds up to the index).
const OFR_PARTS = { credit: "Credit", equity_valuation: "Equity valuation", safe_assets: "Safe assets", funding: "Funding", volatility: "Volatility" };
const OFR_REGIONS = { united_states: "United States", other_advanced_economies: "Other advanced economies", emerging_markets: "Emerging markets" };

// Each measure: key, where it is read (the OFR's file, the Fed Board's, or a FRED id), what it is, its unit.
const MEASURES = [
  ["ofr_fsi", "ofr", "OFR Financial Stress Index (daily, 33 market measures; 0 is average stress)", "index"],
  ["nfci", "NFCI", "Chicago Fed National Financial Conditions Index (weekly, 105 measures; 0 is average, above 0 tighter)", "index"],
  ["anfci", "ANFCI", "NFCI adjusted for the economy and inflation (above 0: tighter than they would explain)", "index"],
  ["nfci_risk", "NFCIRISK", "NFCI risk subindex: volatility and funding risk", "index"],
  ["nfci_credit", "NFCICREDIT", "NFCI credit subindex: credit conditions", "index"],
  ["nfci_leverage", "NFCILEVERAGE", "NFCI leverage subindex: debt and equity measures", "index"],
  ["stlfsi", "STLFSI4", "St. Louis Fed Financial Stress Index (weekly, 18 measures; 0 is average stress)", "index"],
  ["kcfsi", "KCFSI", "Kansas City Fed Financial Stress Index (monthly, 11 measures; 0 is average stress)", "index"],
  ["gz_spread", "ebp:gz_spread", "Gilchrist-Zakrajšek spread: US nonfinancial firms' bonds over matching Treasuries (Fed Board, monthly)", "points"],
  ["excess_bond_premium", "ebp:ebp", "Excess bond premium: the part of that spread expected defaults do not explain (Fed Board, monthly)", "points"],
  ["investment_grade", "BAMLC0A0CM", "ICE BofA US corporate (investment grade) option-adjusted spread over Treasuries", "points"],
  ["bbb", "BAMLC0A4CBBB", "ICE BofA BBB US corporate option-adjusted spread", "points"],
  ["high_yield", "BAMLH0A0HYM2", "ICE BofA US high yield option-adjusted spread", "points"],
  ["ccc", "BAMLH0A3HYC", "ICE BofA CCC and lower US high yield option-adjusted spread", "points"],
  ["emerging_markets", "BAMLEMCBPIOAS", "ICE BofA emerging markets corporate plus option-adjusted spread", "points"],
  ["euro_high_yield", "BAMLHE00EHYIOAS", "ICE BofA euro high yield option-adjusted spread", "points"],
  ["baa_spread", "BAA10Y", "Moody's seasoned Baa corporate bond yield less the 10-year Treasury", "points"],
  ["vix", "VIXCLS", "Cboe VIX: the S&P 500's expected volatility over 30 days, from options", "percent"],
];
const KEYS = MEASURES.map((m) => m[0]);

export const conditionsInput = z.object({
  measure: z.enum(KEYS).optional().describe(`One measure's history instead of the overview: ${KEYS.join(", ")}.`),
  periods: z.number().int().min(1).max(600).optional().describe("measure: observations shown, latest last; default 26."),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("measure: from this date instead (YYYY-MM-DD), up to 600 observations."),
}).strict();

const DAY = 86400000;
const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const signed = (x) => (x > 0 ? `+${x}` : `${x}`);

// The OFR's file (daily since 2000, 0.5 MB) kept as rows: date, the index, its categories, its regions.
export function ofrFile(text) {
  const [head, ...lines] = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = head.split(",").map((s) => s.trim());
  const at = ["Date", "OFR FSI", ...Object.values(OFR_PARTS), ...Object.values(OFR_REGIONS)].map((w) => cols.indexOf(w));
  if (at.some((i) => i < 0)) throw new Error(`The OFR's stress index file no longer has the columns read here (it has ${cols.join(", ")}).`);
  const num = (s) => (s == null || s.trim() === "" ? null : Number(s));
  return JSON.stringify(lines.map((l) => l.split(",")).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p[at[0]]?.trim())).map((p) => [p[at[0]].trim(), ...at.slice(1).map((i) => num(p[i]))]));
}

// The Fed Board's file (monthly since 1973): date, the GZ spread, the excess bond premium, and its model's chance of
// a recession in the next twelve months.
export function ebpFile(text) {
  const [head, ...lines] = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = head.split(",").map((s) => s.trim().toLowerCase());
  const at = ["date", "gz_spread", "ebp", "est_prob"].map((w) => cols.indexOf(w));
  if (at.some((i) => i < 0)) throw new Error(`The Fed Board's excess bond premium file no longer has the columns read here (it has ${cols.join(", ")}).`);
  return JSON.stringify(lines.map((l) => l.split(",")).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p[at[0]]?.trim())).map((p) => [p[at[0]].trim(), ...at.slice(1).map((i) => (p[i]?.trim() ? Number(p[i]) : null))]));
}

const readOfr = (session) => getText(session, OFR, { transform: ofrFile, parse: JSON.parse, timeoutMs: 30000 });
export const readEbp = (session) => getText(session, EBP, { transform: ebpFile, parse: JSON.parse });

// A measure's observations, [date, value] with no gaps, oldest first.
async function series(session, source, files) {
  if (source === "ofr") return (await (files.ofr ??= readOfr(session))).map((r) => [r[0], r[1]]).filter(([, v]) => v != null);
  if (source.startsWith("ebp:")) { const col = source === "ebp:gz_spread" ? 1 : 2; return (await (files.ebp ??= readEbp(session))).map((r) => [r[0], r[col]]).filter(([, v]) => v != null); }
  return (await fredCsv(session, source)).rows.filter(([, v]) => v != null);
}

// The value a given number of days before the latest observation, from an observation close to that day (so a
// monthly series has no change on a week).
function ago(rows, days, slack = 8) {
  const last = Date.parse(rows.at(-1)[0]), cut = iso(last - days * DAY), floor = iso(last - (days + slack) * DAY);
  for (let i = rows.length - 2; i >= 0; i--) if (rows[i][0] <= cut) return rows[i][0] >= floor ? rows[i][1] : null;
  return null;
}

// Where the latest observation stands in the series' own history, and when it was last lower (when it is in the
// lower half) or higher (in the upper half).
export function standing(rows) {
  const [date, v] = rows.at(-1), n = rows.length;
  const below = rows.filter(([, x]) => x < v).length, above = rows.filter(([, x]) => x > v).length;
  const low = below <= above;
  let since = null;
  for (let i = n - 2; i >= 0; i--) if (low ? rows[i][1] < v : rows[i][1] > v) { since = rows[i][0]; break; }
  return {
    date, value: v, from: rows[0][0],
    percentile: Math.round((100 * rows.filter(([, x]) => x <= v).length) / n),
    below_pct: Math.round((100 * below) / n), above_pct: Math.round((100 * above) / n),
    side: low ? "lowest" : "highest", since,
  };
}

// "the lowest since 2007-06-01", only when that is more than ninety days back; "the lowest in its history" when it is.
function extreme(s) {
  if (!s.since) return `the ${s.side} in its history (from ${s.from})`;
  return Date.parse(s.date) - Date.parse(s.since) > 90 * DAY ? `the ${s.side} since ${s.since}` : null;
}

const LIMITS = [
  "Each index is built its own way: the OFR's from 33 market measures each day, the NFCI from 105 measures of risk, credit and leverage each week (revised as its inputs are), the St. Louis Fed's from 18 weekly series, the Kansas City Fed's from 11 monthly ones. Each is 0 at its own average, so their levels compare in sign, not in size.",
  "FRED carries the ICE BofA spreads for the past three years only, so their place in history is within those years; Moody's Baa spread runs from 1986, the VIX from 1990, the NFCI from 1971 and the Fed Board's GZ spread from 1973.",
  "The ICE BofA index data is ICE Data Indices' copyright, which FRED provides for internal use only, not to be published or passed to anyone else without ICE's approval; Moody's yields may not be redistributed without Moody's consent. They are read from FRED for your own use.",
  "Not investment advice.",
];
const SOURCE = `${OFR_PAGE} (OFR Financial Stress Index); ${EBP_PAGE} (Fed Board: GZ spread and excess bond premium); FRED: ${MEASURES.filter((m) => /^[A-Z]/.test(m[1])).map((m) => m[1]).join(", ")}`;

async function history(session, a) {
  const [key, source, about, unit] = MEASURES.find((m) => m[0] === a.measure);
  const files = {};
  const all = await series(session, source, files);
  if (!all.length) throw new NotFound(`No observations of ${key} could be read.`);
  const cut = (rows) => (a.start ? rows.filter((r) => r[0] >= a.start).slice(0, 600) : rows.slice(-(a.periods ?? 26)));
  const s = standing(all);
  const base = {
    measure: key, about, unit, latest: { date: s.date, value: round(s.value), percentile_in_history: s.percentile, history_from: s.from, most_extreme_since: extreme(s) },
    source: source === "ofr" ? OFR_PAGE : source.startsWith("ebp:") ? EBP_PAGE : `https://fred.stlouisfed.org/series/${source}`, limits: LIMITS,
  };
  if (source === "ofr") {
    const rows = cut((await files.ofr).filter((r) => r[1] != null));
    return { ...base, columns: ["date", "ofr_fsi", ...Object.keys(OFR_PARTS), ...Object.keys(OFR_REGIONS)], rows, reading: "The OFR's index each day with what each category and each region adds; each set adds up to the index (0 is average stress)." };
  }
  if (source.startsWith("ebp:")) {
    const rows = cut((await files.ebp).filter((r) => r[1] != null)).map(([d, gz, ebp, p]) => [d.slice(0, 7), round(gz), round(ebp), round(p == null ? null : p * 100, 1)]);
    return { ...base, columns: ["month", "gz_spread", "excess_bond_premium", "recession_chance_12m_pct"], rows, reading: "The Fed Board's GZ spread and excess bond premium each month, in percentage points, and its model's chance of a recession in the next twelve months." };
  }
  return { ...base, columns: ["date", key], rows: cut(all).map(([d, v]) => [d, round(v)]), reading: `${about}, each observation, in ${unit === "points" ? "percentage points" : unit}.` };
}

export async function financialConditions(session, args) {
  const a = conditionsInput.parse(args);
  if (a.measure) return history(session, a);
  const files = { ofr: readOfr(session).catch(() => null), ebp: readEbp(session).catch(() => null) };
  // FRED refuses too many open connections at once: eight at a time.
  const got = [];
  for (let i = 0; i < MEASURES.length; i += 8) got.push(...(await Promise.all(MEASURES.slice(i, i + 8).map((m) => series(session, m[1], files).catch(() => null)))));
  const rows = [], by = {};
  MEASURES.forEach(([key, , about, unit], i) => {
    const all = got[i];
    if (!all?.length) return;
    const s = standing(all);
    const change = (days, slack) => { const b = ago(all, days, slack); return b == null ? null : round(s.value - b); };
    by[key] = { ...s, all };
    rows.push([key, about, unit, s.date, round(s.value), change(7), change(30), change(365, 10), s.percentile, s.from, extreme(s)]);
  });
  if (!rows.length) throw new NotFound("None of the financial conditions measures could be read (the OFR, the Fed Board and FRED all failed).");
  const summary = [];
  const ofr = await files.ofr;
  const o = ofr?.filter((r) => r[1] != null).at(-1);
  if (o && by.ofr_fsi) {
    const s = by.ofr_fsi, parts = Object.keys(OFR_PARTS).map((k, i) => `${k.replace("_", " ")} ${signed(round(o[2 + i], 2))}`);
    summary.push(`The OFR's Financial Stress Index was ${round(o[1], 2)} on ${o[0]} (0 is average stress), ${s.side === "lowest" ? `lower than on ${s.above_pct}%` : `higher than on ${s.below_pct}%`} of days since ${s.from.slice(0, 4)}; by category, ${parts.join(", ")} (the categories add up to the index).`);
  }
  if (by.nfci) {
    const s = by.nfci, others = [by.stlfsi && `the St. Louis Fed's stress index ${round(by.stlfsi.value, 2)} (${by.stlfsi.date})`, by.kcfsi && `the Kansas City Fed's ${round(by.kcfsi.value, 2)} (${by.kcfsi.date.slice(0, 7)})`].filter(Boolean);
    summary.push(`The Chicago Fed's NFCI was ${round(s.value)} in the week to ${s.date} (${s.value < 0 ? "below 0: looser than average" : "above 0: tighter than average"}), ${s.side === "lowest" ? `looser than in ${s.above_pct}%` : `tighter than in ${s.below_pct}%`} of weeks since ${s.from.slice(0, 4)}${others.length ? `; ${others.join(" and ")}` : ""}.`);
  }
  const spreads = ["investment_grade", "bbb", "high_yield", "ccc"].filter((k) => by[k]);
  if (spreads.length) {
    const d = by[spreads[0]].date, words = { investment_grade: "investment grade", bbb: "BBB", high_yield: "high yield", ccc: "CCC and lower" };
    const part = (k, i) => { const y = ago(by[k].all, 365, 10); return `${words[k]} ${round(by[k].value, 2)}${i === 0 ? " points" : ""}${y == null ? "" : ` (${signed(round(by[k].value - y, 2))})`}`; };
    summary.push(`Corporate bonds paid over Treasuries on ${d} (ICE BofA, option-adjusted), with the change on a year: ${spreads.map(part).join(", ")}.`);
  }
  if (by.baa_spread) {
    const s = by.baa_spread, x = extreme(s);
    summary.push(`Moody's Baa yield less the 10-year Treasury was ${round(s.value, 2)} points on ${s.date}, ${s.side === "lowest" ? `lower than on ${s.above_pct}%` : `higher than on ${s.below_pct}%`} of days since ${s.from.slice(0, 4)}${x ? `, ${x}` : ""}.`);
  }
  if (by.excess_bond_premium) {
    const s = by.excess_bond_premium;
    summary.push(`The Fed Board's excess bond premium was ${round(s.value, 2)} points in ${s.date.slice(0, 7)} (${s.value < 0 ? "below 0: investors asking less than expected defaults warrant" : "above 0: investors asking more than expected defaults warrant"})${by.gz_spread ? `, the GZ spread ${round(by.gz_spread.value, 2)}` : ""}.`);
  }
  if (by.vix) {
    const s = by.vix;
    summary.push(`The VIX closed at ${round(s.value, 2)} on ${s.date}, ${s.side === "lowest" ? `lower than on ${s.above_pct}%` : `higher than on ${s.below_pct}%`} of days since ${s.from.slice(0, 4)}.`);
  }
  return {
    summary,
    columns: ["measure", "about", "unit", "as_of", "latest", "change_on_week", "change_on_month", "change_on_year", "percentile_in_history", "history_from", "most_extreme_since"], rows,
    ...(o ? { ofr: { date: o[0], index: round(o[1]), categories: Object.fromEntries(Object.keys(OFR_PARTS).map((k, i) => [k, round(o[2 + i])])), regions: Object.fromEntries(Object.keys(OFR_REGIONS).map((k, i) => [k, round(o[7 + i])])) } } : {}),
    reading: "Each measure's latest reading with its change on a week, a month and a year (in its own units: index points, percentage points of spread, VIX points) and its percentile in its own history (100 is the highest it has been). The stress and conditions indexes are 0 at their average; spreads and the VIX have no fixed line and are read against their history.",
    source: SOURCE, limits: LIMITS,
  };
}
