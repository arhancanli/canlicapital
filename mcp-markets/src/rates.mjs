// reference_rates: the money-market and policy rates central banks publish themselves. SOFR,
// TGCR, BGCR, EFFR and OBFR from the New York Fed, with the percentiles and volume it publishes
// beside each; the euro short-term rate (€STR) and the ECB's three policy rates; SONIA and Bank
// Rate from the Bank of England; and the policy rate of about forty central banks as the BIS
// collects them. Every row comes from the publisher's own service, oldest first.
import { z } from "zod";

import { getJson, getText, NotFound, own } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const NYFED = "Federal Reserve Bank of New York", ECB = "European Central Bank", BOE = "Bank of England", BIS = "Bank for International Settlements";

export const RATES = Object.freeze({
  sofr: { name: "Secured Overnight Financing Rate (SOFR)", publisher: NYFED, kind: "nyfed", path: "secured/sofr" },
  tgcr: { name: "Tri-Party General Collateral Rate (TGCR)", publisher: NYFED, kind: "nyfed", path: "secured/tgcr" },
  bgcr: { name: "Broad General Collateral Rate (BGCR)", publisher: NYFED, kind: "nyfed", path: "secured/bgcr" },
  effr: { name: "Effective Federal Funds Rate (EFFR)", publisher: NYFED, kind: "nyfed", path: "unsecured/effr" },
  obfr: { name: "Overnight Bank Funding Rate (OBFR)", publisher: NYFED, kind: "nyfed", path: "unsecured/obfr" },
  estr: { name: "Euro short-term rate (€STR)", publisher: ECB, kind: "ecb", flow: "EST", key: "B.EU000A2X2A25.WT" },
  ecb_deposit: { name: "ECB deposit facility rate", publisher: ECB, kind: "ecb_changes", flow: "FM", key: "B.U2.EUR.4F.KR.DFR.LEV" },
  ecb_refi: { name: "ECB main refinancing operations rate (fixed rate tenders)", publisher: ECB, kind: "ecb_changes", flow: "FM", key: "B.U2.EUR.4F.KR.MRR_FR.LEV" },
  ecb_marginal: { name: "ECB marginal lending facility rate", publisher: ECB, kind: "ecb_changes", flow: "FM", key: "B.U2.EUR.4F.KR.MLFR.LEV" },
  sonia: { name: "Sterling Overnight Index Average (SONIA)", publisher: BOE, kind: "boe", code: "IUDSOIA" },
  bank_rate: { name: "Bank of England Bank Rate", publisher: BOE, kind: "boe", code: "IUDBEDR" },
});

// Names people use for each rate.
const ALIASES = Object.freeze({
  "fed funds": "effr", "federal funds": "effr", "fed funds rate": "effr", "effective fed funds": "effr", "effective federal funds rate": "effr",
  "secured overnight financing rate": "sofr", "overnight bank funding rate": "obfr", "tri-party general collateral rate": "tgcr", "broad general collateral rate": "bgcr",
  "€str": "estr", "ester": "estr", "euro short-term rate": "estr", "euro short term rate": "estr", "eonia": "estr",
  "ecb deposit rate": "ecb_deposit", "deposit facility rate": "ecb_deposit", "ecb rate": "ecb_deposit", "ecb policy rate": "ecb_deposit",
  "ecb refinancing rate": "ecb_refi", "main refinancing rate": "ecb_refi", "ecb marginal lending rate": "ecb_marginal",
  "sterling overnight index average": "sonia", "boe rate": "bank_rate", "bank of england rate": "bank_rate", "uk bank rate": "bank_rate",
});

// Central banks by the names people use, as the BIS codes their areas (XM is the euro area).
export const POLICY_AREAS = Object.freeze({
  US: "United States", XM: "Euro area", GB: "United Kingdom", JP: "Japan", CN: "China", CA: "Canada", AU: "Australia", NZ: "New Zealand",
  CH: "Switzerland", SE: "Sweden", NO: "Norway", DK: "Denmark", PL: "Poland", CZ: "Czechia", HU: "Hungary", RO: "Romania", RS: "Serbia",
  IS: "Iceland", TR: "Türkiye", IL: "Israel", SA: "Saudi Arabia", ZA: "South Africa", IN: "India", ID: "Indonesia", KR: "Korea", MY: "Malaysia",
  PH: "Philippines", TH: "Thailand", HK: "Hong Kong SAR", BR: "Brazil", MX: "Mexico", CL: "Chile", CO: "Colombia", PE: "Peru", AR: "Argentina",
  RU: "Russia", MK: "North Macedonia", HR: "Croatia",
});
const AREA_NAMES = Object.freeze(Object.fromEntries(Object.entries(POLICY_AREAS).flatMap(([code, name]) => [[name.toLowerCase(), code], [code.toLowerCase(), code]])
  .concat([["usa", "US"], ["uk", "GB"], ["britain", "GB"], ["euro zone", "XM"], ["eurozone", "XM"], ["euro", "XM"], ["ea", "XM"], ["turkey", "TR"], ["south korea", "KR"], ["hong kong", "HK"], ["czech republic", "CZ"]])));

export const ratesInput = z.object({
  rate: z.string().min(2).max(60).describe("sofr, tgcr, bgcr, effr or obfr (New York Fed); estr, ecb_deposit, ecb_refi or ecb_marginal (ECB); sonia or bank_rate (Bank of England); or policy:<country>, a central bank's policy rate as the BIS collects it (policy:JP, policy:Brazil, policy:euro area)."),
  start: DATE.optional().describe("First date; default 90 days before end."),
  end: DATE.optional().describe("Last date; default today."),
}).strict();

// Which rate was asked for: a key above, a name people use, or a central bank's policy rate.
export function resolveRate(input) {
  const raw = String(input).trim(), q = raw.toLowerCase().replace(/\s+/g, " ");
  const policy = q.match(/^(?:policy(?: rate)?[:\s]+|central bank(?: rate)?[:\s]+)(.+)$/) ?? q.match(/^(.+?)(?:'s)? policy rate$/);
  if (policy) {
    const code = own(AREA_NAMES, policy[1].trim());
    if (!code) throw new NotFound(`No central bank policy rate for "${policy[1].trim()}". Areas: ${Object.entries(POLICY_AREAS).map(([c, n]) => `${c} (${n})`).join(", ")}.`);
    return { id: `policy:${code}`, name: `${POLICY_AREAS[code]} central bank policy rate`, publisher: BIS, kind: "bis", code };
  }
  const key = own(RATES, q.replace(/[\s-]+/g, "_")) ? q.replace(/[\s-]+/g, "_") : own(ALIASES, q);
  if (!key) throw new NotFound(`No rate "${raw}". Rates: ${Object.keys(RATES).join(", ")}, or policy:<country> (policy:JP). For yields and FRED series use treasury_yields or economic_series.`);
  return { id: key, ...RATES[key] };
}

const iso = (d) => d.toISOString().slice(0, 10);
const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// A small RFC 4180 reader: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === "\"" && text[i + 1] === "\"") { field += "\""; i++; } else if (c === "\"") quoted = false; else field += c;
    } else if (c === "\"") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ""])));
}

async function nyfed(session, rate, start, end) {
  const url = `https://markets.newyorkfed.org/api/rates/${rate.path}/search.json?startDate=${start}&endDate=${end}`;
  const data = await getJson(session, url);
  const list = Array.isArray(data?.refRates) ? data.refRates : [];
  const target = list.some((r) => r.targetRateFrom !== undefined);
  const columns = ["date", "rate", "percentile_1", "percentile_25", "percentile_75", "percentile_99", "volume_usd_billion", ...(target ? ["target_from", "target_to"] : []), "revised"];
  const rows = list.filter((r) => r.effectiveDate >= start && r.effectiveDate <= end).sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
    .map((r) => [r.effectiveDate, num(r.percentRate), num(r.percentPercentile1), num(r.percentPercentile25), num(r.percentPercentile75), num(r.percentPercentile99), num(r.volumeInBillions), ...(target ? [num(r.targetRateFrom), num(r.targetRateTo)] : []), r.revisionIndicator ? r.revisionIndicator : null]);
  return { url, columns, rows, limits: ["As the New York Fed publishes it, at about 8:00 a.m. ET for the previous business day; a rate it revises later that day is marked in revised. Percentiles are of volume-weighted transactions."] };
}

async function ecbSeries(session, rate, start, end) {
  const url = `https://data-api.ecb.europa.eu/service/data/${rate.flow}/${rate.key}?startPeriod=${start}&endPeriod=${end}&format=csvdata`;
  const text = await getText(session, url, { headers: { Accept: "text/csv" } });
  const rows = parseCsv(text).map((r) => [r.TIME_PERIOD, num(r.OBS_VALUE)]).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] !== null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { url, columns: ["date", "rate"], rows, limits: ["As the ECB publishes it, each business day for the previous one, from transactions reported under money-market statistical reporting."] };
}

// The ECB's policy rates are published as the dates they change: the rate in effect on the first
// day is the last change before it.
async function ecbChanges(session, rate, start, end) {
  const url = `https://data-api.ecb.europa.eu/service/data/${rate.flow}/${rate.key}?endPeriod=${end}&format=csvdata`;
  const text = await getText(session, url, { headers: { Accept: "text/csv" } });
  const changes = parseCsv(text).map((r) => [r.TIME_PERIOD, num(r.OBS_VALUE)]).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] !== null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const before = changes.filter((c) => c[0] <= start).at(-1);
  const rows = [...(before ? [[start, before[1], `in effect since ${before[0]}`]] : []), ...changes.filter((c) => c[0] > start && c[0] <= end).map((c) => [c[0], c[1], "change"])];
  return { url, columns: ["date", "rate", "event"], rows, limits: ["The ECB publishes these rates as the dates they take effect; the first row is the rate in effect on the first day asked for."] };
}

const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const boeDate = (d) => { const [day, mon, year] = d.trim().split(/\s+/); return MONTHS[mon] ? `${year}-${MONTHS[mon]}-${day.padStart(2, "0")}` : null; };
const boeParam = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${Object.keys(MONTHS)[Number(m) - 1]}/${y}`; };

async function boe(session, rate, start, end) {
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${boeParam(start)}&Dateto=${boeParam(end)}&SeriesCodes=${rate.code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const text = await getText(session, url, { headers: { Accept: "text/csv" } });
  if (/<html/i.test(text.slice(0, 200))) throw new Error("The Bank of England database answered with a web page instead of data; try again later.");
  const rows = parseCsv(text).map((r) => [boeDate(r.DATE ?? ""), num(r[rate.code])]).filter((r) => r[0] && r[1] !== null && r[0] >= start && r[0] <= end).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { url, columns: ["date", "rate"], rows, limits: ["As the Bank of England's database publishes it; SONIA for a day is published at 9:00 a.m. London time the next business day."] };
}

async function bis(session, rate, start, end) {
  const url = `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${rate.code}?startPeriod=${start}&endPeriod=${end}&format=csv`;
  const records = parseCsv(await getText(session, url, { headers: { Accept: "text/csv" } }));
  const rows = records.map((r) => [r.TIME_PERIOD, num(r.OBS_VALUE)]).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] !== null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const note = records.find((r) => r.TITLE)?.TITLE ?? null;
  return { url, columns: ["date", "rate"], rows, ...(note ? { definition: note } : {}), limits: ["Central bank policy rates as the BIS collects them, daily; the BIS can show a decision a few days after the central bank announces it, and the definition note says which rate stands for policy."] };
}

const FETCH = { nyfed, ecb: ecbSeries, ecb_changes: ecbChanges, boe, bis };

export async function referenceRates(session, args) {
  const a = ratesInput.parse(args);
  const rate = resolveRate(a.rate);
  const end = a.end ?? iso(new Date(session.now()));
  const start = a.start ?? iso(new Date(Date.parse(`${end}T00:00:00Z`) - 90 * 86400000));
  if (start > end) throw new Error(`start ${start} is after end ${end}.`);
  const got = await FETCH[rate.kind](session, rate, start, end);
  const cap = 5000;
  const rows = got.rows.length > cap ? got.rows.slice(-cap) : got.rows;
  const last = rows.at(-1);
  return {
    rate: { id: rate.id, name: rate.name, publisher: rate.publisher, unit: "percent a year", ...(got.definition ? { definition: got.definition } : {}) },
    start, end, count: rows.length,
    latest: last ? { date: last[0], rate: last[1] } : null,
    columns: got.columns, rows,
    ...(got.rows.length > cap ? { truncated_to_last: cap } : {}),
    ...(rows.length ? {} : { note: "No observations in this window: the publisher has none for these dates (a weekend or holiday, or before the rate began). Widen start and end." }),
    source: got.url,
    limits: [...got.limits, "Not investment advice."],
  };
}
