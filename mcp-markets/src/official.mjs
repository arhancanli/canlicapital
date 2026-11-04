// world_series: a country's economy from the statistics office or central bank that publishes it, in one shape.
// Inflation, core inflation, unemployment, GDP growth, the policy rate, the 10-year yield, the exchange rate and
// house prices for 70 countries and the euro area, one country or up to 30 side by side. Where a country's own
// office has an open, keyless service it is read there (Statistics Canada, the ONS, the ABS, the Bank of Japan,
// the Riksbank...); elsewhere the IMF's or the BIS's compilation of that country's official figures is read, and
// the answer says so. Any series at those publishers is reachable by its own code (series: "statcan:2062815",
// "ecb:ICP/M.DE.N.000000.4.ANR", "imf:CPI/IND.CPI._T.YOY_PCH_PA_PT.M"). check: true reads the same figure from a
// second official publisher and compares the two. No key anywhere.
import { z } from "zod";

import { csvRows } from "./cycle.mjs";
import { DEFAULT_USER_AGENT, fredCsv, getEncodedText, getJson, getText, NotFound, own, postJson } from "./sources.mjs";

// ---------------------------------------------------------------------------------------------
// Countries and groups
// ---------------------------------------------------------------------------------------------
const COUNTRY_LINES = `US|USA|United States|usa|u.s.|us|america|united states of america
CA|CAN|Canada
MX|MEX|Mexico
BR|BRA|Brazil|brasil
AR|ARG|Argentina
CL|CHL|Chile
CO|COL|Colombia
PE|PER|Peru
UY|URY|Uruguay
GB|GBR|United Kingdom|uk|u.k.|britain|great britain|england
IE|IRL|Ireland
FR|FRA|France
DE|DEU|Germany
IT|ITA|Italy
ES|ESP|Spain
PT|PRT|Portugal
NL|NLD|Netherlands|holland|the netherlands
BE|BEL|Belgium
LU|LUX|Luxembourg
AT|AUT|Austria
CH|CHE|Switzerland
DK|DNK|Denmark
SE|SWE|Sweden
NO|NOR|Norway
FI|FIN|Finland
IS|ISL|Iceland
PL|POL|Poland
CZ|CZE|Czechia|czech republic
SK|SVK|Slovakia
HU|HUN|Hungary
RO|ROU|Romania
BG|BGR|Bulgaria
HR|HRV|Croatia
SI|SVN|Slovenia
EE|EST|Estonia
LV|LVA|Latvia
LT|LTU|Lithuania
GR|GRC|Greece
CY|CYP|Cyprus
MT|MLT|Malta
RS|SRB|Serbia
UA|UKR|Ukraine
TR|TUR|Turkey|turkiye|türkiye
RU|RUS|Russia|russian federation
IL|ISR|Israel
SA|SAU|Saudi Arabia
AE|ARE|United Arab Emirates|uae|emirates
QA|QAT|Qatar
KW|KWT|Kuwait
EG|EGY|Egypt
MA|MAR|Morocco
NG|NGA|Nigeria
KE|KEN|Kenya
GH|GHA|Ghana
ZA|ZAF|South Africa
IN|IND|India
PK|PAK|Pakistan
BD|BGD|Bangladesh
LK|LKA|Sri Lanka
CN|CHN|China|prc|mainland china
HK|HKG|Hong Kong|hong kong sar
JP|JPN|Japan
KR|KOR|South Korea|korea|republic of korea
SG|SGP|Singapore
MY|MYS|Malaysia
TH|THA|Thailand
ID|IDN|Indonesia
PH|PHL|Philippines
VN|VNM|Vietnam|viet nam
AU|AUS|Australia
NZ|NZL|New Zealand
KZ|KAZ|Kazakhstan
EA|EA|Euro area|eurozone|euro zone|euro-area|the euro area`;

export const COUNTRIES = Object.freeze(COUNTRY_LINES.split("\n").map((line) => {
  const [code, iso3, name, ...aka] = line.split("|");
  return Object.freeze({ code, iso3, name, aka });
}));
const EURO = new Set(["AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
const EU = new Set([...EURO, "CZ", "DK", "HU", "PL", "RO", "SE"]);
export const GROUPS = Object.freeze({
  g7: ["US", "JP", "DE", "GB", "FR", "IT", "CA"],
  g20: ["AR", "AU", "BR", "CA", "CN", "FR", "DE", "IN", "ID", "IT", "JP", "KR", "MX", "RU", "SA", "ZA", "TR", "GB", "US", "EA"],
  eu: [...EU],
  "euro area members": [...EURO],
  brics: ["BR", "RU", "IN", "CN", "ZA", "EG", "AE", "ID"],
  nordics: ["DK", "FI", "IS", "NO", "SE"],
  asean: ["ID", "MY", "PH", "SG", "TH", "VN"],
  "latin america": ["AR", "BR", "CL", "CO", "MX", "PE", "UY"],
});
const GROUP_NAMES = { "g-7": "g7", "g-20": "g20", "european union": "eu", eurozone_members: "euro area members", "eurozone members": "euro area members", "euro members": "euro area members", latam: "latin america", "nordic countries": "nordics" };

const squash = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.\- ]+/g, " ").replace(/\s+/g, " ").trim();
export function findCountry(q) {
  const s = squash(q), up = String(q).trim().toUpperCase();
  return COUNTRIES.find((c) => c.code === up || c.iso3 === up) ?? COUNTRIES.find((c) => squash(c.name) === s || c.aka.includes(s)) ?? null;
}
// Names, codes and groups as one list of countries, each once, in the order asked.
export function countryList(items) {
  const out = [], unknown = [];
  for (const raw of items) {
    const g = own(GROUPS, own(GROUP_NAMES, squash(raw)) ?? squash(raw));
    const codes = g ?? [findCountry(raw)?.code ?? null];
    if (codes[0] === null) { unknown.push(raw); continue; }
    for (const code of codes) if (!out.some((c) => c.code === code)) out.push(COUNTRIES.find((c) => c.code === code));
  }
  return { countries: out, unknown };
}

// ---------------------------------------------------------------------------------------------
// Periods and numbers
// ---------------------------------------------------------------------------------------------
const num = (x) => {
  if (x == null) return null;
  const s = String(x).trim().replace(/,(?=\d{3}\b)/g, "");
  if (s === "" || /^(\.|\.\.|NaN|NA|N\/A|-|x)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
// No negative zero: a difference of nothing reads 0.
const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n) => String(n).padStart(2, "0");

// Every publisher's period written one way: 2026-09 for a month, 2026-Q3 for a quarter, 2026 for a year,
// 2026-11-04 for a day.
export function period(raw) {
  const s = String(raw).trim();
  let m;
  if ((m = /^(\d{4})-?M(\d{1,2})$/i.exec(s))) return `${m[1]}-${p2(m[2])}`;
  if ((m = /^(\d{4})-?[QK](\d)$/i.exec(s))) return `${m[1]}-Q${m[2]}`;
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return s;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) return `${m[3]}-${m[2]}-${m[1]}`;
  if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})$/.exec(s)) && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${p2(MONTHS[m[2].toLowerCase()])}-${p2(m[1])}`;
  if ((m = /^(\d{4}) ([A-Za-z]{3})$/.exec(s)) && MONTHS[m[2].toLowerCase()]) return `${m[1]}-${p2(MONTHS[m[2].toLowerCase()])}`;
  if ((m = /^(\d{4}) Q(\d)$/i.exec(s))) return `${m[1]}-Q${m[2]}`;
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{4})(\d{2})$/.exec(s))) return `${m[1]}-${m[2]}`;
  if (/^\d{4}$/.test(s)) return s;
  return s;
}
const kind = (p) => (/^\d{4}-\d{2}-\d{2}$/.test(p) ? "day" : /^\d{4}-Q\d$/.test(p) ? "quarter" : /^\d{4}-\d{2}$/.test(p) ? "month" : /^\d{4}$/.test(p) ? "year" : "other");
const FREQUENCY = { day: "daily", month: "monthly", quarter: "quarterly", year: "annual", other: "as published" };

// Dates on the first of a month that step by months, quarters or years are months, quarters or years.
export function compactDates(rows) {
  if (!rows.length || !rows.every(([p]) => /^\d{4}-\d{2}-01$/.test(p))) return rows;
  const ms = rows.map(([p]) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1);
  const steps = ms.slice(1).map((m, i) => m - ms[i]);
  const step = steps.length ? Math.min(...steps) : 1;
  if (step === 12 && rows.every(([p]) => p.slice(5, 7) === "01")) return rows.map(([p, v]) => [p.slice(0, 4), v]);
  if (step === 3 && rows.every(([p]) => ["01", "04", "07", "10"].includes(p.slice(5, 7)))) return rows.map(([p, v]) => [`${p.slice(0, 4)}-Q${(Number(p.slice(5, 7)) + 2) / 3}`, v]);
  if (step >= 1) return rows.map(([p, v]) => [p.slice(0, 7), v]);
  return rows;
}

// The same period a year earlier.
function yearBefore(p) {
  const k = kind(p);
  if (k === "year") return String(Number(p) - 1);
  if (k === "month" || k === "quarter") return `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;
  if (k === "day") return `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;
  return null;
}
// Percent change on the same period a year earlier, from a level.
export function onAYear(rows) {
  const at = new Map(rows.map(([p, v]) => [p, v]));
  return rows.map(([p, v]) => { const b = at.get(yearBefore(p)); return [p, v != null && b ? round((v / b - 1) * 100, 4) : null]; }).filter(([, v]) => v != null);
}
// The observation on or before a day, for daily series.
const onOrBefore = (rows, day) => { let hit = null; for (const r of rows) { if (r[0] <= day) hit = r; else break; } return hit; };

// ---------------------------------------------------------------------------------------------
// Publishers: each reads one series by its own code and returns [period, value] rows, oldest first.
// want: observations wanted (more are fine); from: an ISO date to read from (overrides want where supported).
// ---------------------------------------------------------------------------------------------
const SDMX_CSV = { Accept: "application/vnd.sdmx.data+csv;version=2.0.0" };
const BROWSER_UA = { "User-Agent": DEFAULT_USER_AGENT };
const AREA_COLUMNS = ["REF_AREA", "COUNTRY", "BORROWERS_CTY", "REGION", "geo"];

// An SDMX-CSV answer as one series, or as one series per area when byArea is set.
export function sdmxSeries(text, { byArea = false } = {}) {
  const t = text.replace(/^\uFEFF/, "");
  const head = t.slice(0, t.search(/\r?\n/));
  const sep = (head.match(/;/g) ?? []).length > (head.match(/,/g) ?? []).length ? ";" : ",";
  const rows = csvRows(t, sep);
  if (!rows.length) return byArea ? new Map() : null;
  const cols = Object.keys(rows[0]);
  const ti = cols.indexOf("TIME_PERIOD");
  if (ti < 0 || !cols.includes("OBS_VALUE")) throw new Error("The answer was not SDMX data (no TIME_PERIOD and OBS_VALUE columns).");
  const dims = cols.slice(0, ti).filter((c) => !/^(STRUCTURE.*|STRUCTURE_ID|ACTION|DATAFLOW)$/.test(c));
  const area = AREA_COLUMNS.find((c) => cols.includes(c));
  const groups = new Map();
  for (const r of rows) {
    const key = r.KEY || dims.map((d) => r[d]).join(".");
    const g = groups.get(key) ?? { key, area: area ? r[area] : null, title: r.TITLE || r.TITLE_COMPL || r.TITLE_EN || null, unit: r.UNIT || r.UNIT_MEASURE || null, rows: [] };
    const v = num(r.OBS_VALUE);
    if (v != null) g.rows.push([period(r.TIME_PERIOD), v]);
    groups.set(key, g);
  }
  for (const g of groups.values()) g.rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (byArea) {
    const out = new Map();
    for (const g of groups.values()) if (g.rows.length) out.set(g.area, out.has(g.area) ? { ...g, more: true } : g);
    return out;
  }
  const full = [...groups.values()].filter((g) => g.rows.length);
  if (full.length > 1) throw new Error(`The code matched ${full.length} series (${full.slice(0, 6).map((g) => g.key).join("; ")}${full.length > 6 ? "; ..." : ""}); give every part of the key.`);
  return full[0] ?? null;
}

const lastOr = (want, from, { start = "startPeriod", last = "lastNObservations", fromFormat = (d) => d } = {}) => (from ? `${start}=${fromFormat(from)}` : `${last}=${want}`);

function sdmxPublisher(name, base, { format, headers, path = (flow, key) => `${flow}/${key}`, page, retries, timeoutMs }) {
  const where = (code, want, from) => {
    const m = /^([^/]+)\/(.+)$/.exec(code);
    if (!m) throw new Error(`${name} codes are a dataflow and a series key, e.g. ${page.example}.`);
    return `${base}/${path(m[1], m[2])}?${format ? `format=${format}&` : ""}${lastOr(want, from)}`;
  };
  return {
    name, page,
    read: async (session, code, { want, from }) => {
      const url = where(code, want, from);
      const s = sdmxSeries(await getText(session, url, { headers, retries, timeoutMs }));
      if (!s) throw new NotFound(`${name} has no observations for ${code}.`);
      return { rows: s.rows, title: s.title, unit: s.unit, url };
    },
    readMany: async (session, code, { want, from }) => {
      const url = where(code, want, from);
      return new Map([...sdmxSeries(await getText(session, url, { headers, retries, timeoutMs }), { byArea: true })].map(([a, s]) => [a, { rows: s.rows, title: s.title, unit: s.unit, url, more: s.more }]));
    },
  };
}

const IMF = "https://api.imf.org/external/sdmx/3.0/data/dataflow";
const imfPeriod = (from) => from.slice(0, 4);
function imfUrl(code, want, from) {
  const m = /^(?:([A-Z][A-Z.]*):)?([A-Z0-9_]+)\/(.+)$/.exec(code);
  if (!m) throw new Error("IMF codes are a dataflow and a key, e.g. CPI/IND.CPI._T.YOY_PCH_PA_PT.M (agency IMF.STA unless named, as IMF.RES:PCPS/...).");
  return `${IMF}/${m[1] ?? "IMF.STA"}/${m[2]}/+/${m[3]}?${from ? `c%5BTIME_PERIOD%5D=ge:${imfPeriod(from)}` : `lastNObservations=${want}`}`;
}

function eurostatUrl(code, want, from) {
  const m = /^([a-z0-9_]+)(?:\?(.*))?$/i.exec(code);
  if (!m) throw new Error("Eurostat codes are a dataset and its filters, e.g. une_rt_m?geo=DE&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT.");
  return `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${m[1]}?${m[2] ? `${m[2]}&` : ""}lastTimePeriod=${from ? 600 : want}`;
}

export const PUBLISHERS = {
  imf: {
    name: "International Monetary Fund", page: { url: "https://data.imf.org", example: "imf:CPI/IND.CPI._T.YOY_PCH_PA_PT.M" },
    read: async (session, code, { want, from }) => {
      const url = imfUrl(code, want, from);
      const s = sdmxSeries(await getText(session, url, { headers: SDMX_CSV }));
      if (!s) throw new NotFound(`The IMF has no observations for ${code}.`);
      return { rows: s.rows, title: null, unit: s.unit, url };
    },
    readMany: async (session, code, { want, from }) => {
      const url = imfUrl(code, want, from);
      return new Map([...sdmxSeries(await getText(session, url, { headers: SDMX_CSV }), { byArea: true })].map(([a, s]) => [a, { rows: s.rows, title: null, unit: s.unit, url, more: s.more }]));
    },
  },
  bis: sdmxPublisher("Bank for International Settlements", "https://stats.bis.org/api/v1/data", { format: "csv", page: { url: "https://data.bis.org", example: "bis:WS_CBPOL/D.KR" } }),
  ecb: sdmxPublisher("European Central Bank", "https://data-api.ecb.europa.eu/service/data", { format: "csvdata", timeoutMs: 12000, page: { url: "https://data.ecb.europa.eu", example: "ecb:ICP/M.DE.N.000000.4.ANR" } }),
  bbk: sdmxPublisher("Deutsche Bundesbank", "https://api.statistiken.bundesbank.de/rest/data", { format: "sdmx_csv", page: { url: "https://www.bundesbank.de/en/statistics/time-series-databases", example: "bbk:BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A" } }),
  norges: sdmxPublisher("Norges Bank", "https://data.norges-bank.no/api/data", { format: "csv", page: { url: "https://app.norges-bank.no/query/", example: "norges:IR/B.KPRA.SD.R" } }),
  boi: sdmxPublisher("Bank of Israel", "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS", { format: "csv", path: (flow, key) => `${flow}/1.0/${key}`, page: { url: "https://www.boi.org.il/en/economic-roles/statistics/", example: "boi:BR/MNT_RIB_BOI_D" } }),
  abs: sdmxPublisher("Australian Bureau of Statistics", "https://data.api.abs.gov.au/rest/data", { format: "csv", path: (flow, key) => `ABS,${flow}/${key}`, page: { url: "https://dataexplorer.abs.gov.au", example: "abs:CPI/3.10001.10.50.M" } }),
  oecd: sdmxPublisher("OECD", "https://sdmx.oecd.org/public/rest/data", { format: "csvfilewithlabels", retries: 0, page: { url: "https://data-explorer.oecd.org", example: "oecd:OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0/JPN.M.N.CPI.PA._T.N.GY" } }),
  ilo: sdmxPublisher("International Labour Organization", "https://sdmx.ilo.org/rest/data", { format: "csv", path: (flow, key) => `ILO,${flow}/${key}`, page: { url: "https://ilostat.ilo.org/data/", example: "ilo:DF_UNE_DEAP_SEX_AGE_RT/BRA.M.SEX_T.AGE_YTHADULT_YGE15" } }),
  eurostat: {
    name: "Eurostat", page: { url: "https://ec.europa.eu/eurostat/databrowser", example: "eurostat:une_rt_m?geo=DE&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT" },
    readMany: async (session, code, { want, from }) => {
      const url = eurostatUrl(code, want, from);
      const d = await getJson(session, url);
      return new Map(jsonStat(d).filter((x) => x.rows.length).map((x) => [x.key.geo, { rows: x.rows, title: d.label ?? null, unit: x.key.unit ?? null, url, updated: d.updated ?? null }]));
    },
    read: async (session, code, { want, from }) => {
      const url = eurostatUrl(code, want, from);
      const d = await getJson(session, url);
      const series = jsonStat(d);
      if (series.length > 1) throw new Error(`The filters matched ${series.length} series (they differ in ${Object.keys(series[0].key).filter((k) => series.some((s) => s.key[k] !== series[0].key[k])).join(", ")}); give one value of each.`);
      if (!series[0]?.rows.length) throw new NotFound(`Eurostat has no observations for ${code}.`);
      return { rows: series[0].rows, title: d.label ?? null, unit: series[0].key.unit ?? null, url, updated: d.updated ?? null };
    },
  },
  fred: {
    name: "Federal Reserve Bank of St. Louis (FRED)", page: { url: "https://fred.stlouisfed.org", example: "fred:UNRATE" },
    read: async (session, code, { from }) => {
      const r = await fredCsv(session, code, { start: from });
      return { rows: compactDates(r.rows.filter(([, v]) => v != null)), title: null, unit: null, url: r.url };
    },
  },
  statcan: {
    name: "Statistics Canada", page: { url: "https://www150.statcan.gc.ca", example: "statcan:2062815" },
    read: async (session, code, { want, from }) => {
      const id = Number(String(code).replace(/^v/i, ""));
      if (!Number.isInteger(id) || id <= 0) throw new Error("Statistics Canada codes are vector numbers, e.g. 2062815 (v2062815).");
      const [d, info] = await Promise.all([
        postJson(session, "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods", [{ vectorId: id, latestN: from ? 600 : want }]),
        postJson(session, "https://www150.statcan.gc.ca/t1/wds/rest/getSeriesInfoFromVector", [{ vectorId: id }]).catch(() => null),
      ]);
      const o = d?.[0];
      if (o?.status !== "SUCCESS") throw new NotFound(`Statistics Canada has no vector v${id}.`);
      const rows = compactDates((o.object.vectorDataPoint ?? []).map((p) => [p.refPer, num(p.value)]).filter(([, v]) => v != null));
      const api = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods";
      return { rows, title: info?.[0]?.object?.SeriesTitleEn?.replace(/;/g, "; ") ?? null, unit: null, url: o.object.productId ? `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=${o.object.productId}01` : api, api };
    },
  },
  boc: {
    name: "Bank of Canada", page: { url: "https://www.bankofcanada.ca/valet/docs", example: "boc:V39079" },
    read: async (session, code, { want, from }) => {
      const url = `https://www.bankofcanada.ca/valet/observations/${encodeURIComponent(code)}/json?${from ? `start_date=${from}` : `recent=${want}`}`;
      const d = await getJson(session, url);
      const detail = d.seriesDetail?.[code];
      if (!detail) throw new NotFound(`The Bank of Canada has no series ${code}.`);
      return { rows: (d.observations ?? []).map((o) => [o.d, num(o[code]?.v)]).filter(([, v]) => v != null), title: detail.label ?? null, description: detail.description ?? null, unit: null, url };
    },
  },
  ons: {
    name: "Office for National Statistics", page: { url: "https://www.ons.gov.uk/timeseriestool", example: "ons:D7G7" },
    read: async (session, code) => {
      const [cdid, dataset] = String(code).toLowerCase().split("/");
      if (!/^[a-z0-9]{4}$/.test(cdid)) throw new Error("ONS codes are a four-character series ID, optionally with its dataset, e.g. D7G7 or MGSX/LMS.");
      const found = await getJson(session, `https://api.beta.ons.gov.uk/v1/search?q=${cdid}&content_type=timeseries&limit=20`);
      const uris = (found.items ?? []).map((i) => i.uri).filter((u) => new RegExp(`/timeseries/${cdid}/${dataset ?? "[a-z0-9]+"}$`).test(u ?? ""));
      if (!uris.length) throw new NotFound(`The ONS has no time series ${cdid.toUpperCase()}${dataset ? ` in ${dataset.toUpperCase()}` : ""}.`);
      const page = `https://www.ons.gov.uk${uris[0]}`;
      const d = await getJson(session, `${page}/data`);
      const pick = d.months?.length ? d.months : d.quarters?.length ? d.quarters : d.years ?? [];
      return { rows: pick.map((o) => [period(o.date), num(o.value)]).filter(([, v]) => v != null), title: d.description?.title ?? null, unit: d.description?.unit || null, url: page, updated: d.description?.releaseDate ?? null };
    },
  },
  boe: {
    name: "Bank of England", page: { url: "https://www.bankofengland.co.uk/boeapps/database/", example: "boe:IUDBEDR" },
    read: async (session, code, { want, from }) => {
      if (!/^[A-Z0-9]{5,10}$/.test(code)) throw new Error("Bank of England codes are its database series codes, e.g. IUDBEDR (Bank Rate) or XUDLUSS.");
      const end = new Date(session.now()), start = from ? new Date(`${from}T00:00:00Z`) : new Date(session.now() - Math.max(45, Math.ceil(want * 1.6)) * 86400000);
      const fmt = (d) => `${p2(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
      const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${fmt(start)}&Dateto=${fmt(end)}&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
      const text = await getText(session, url);
      const lines = text.trim().split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim()));
      if (lines[0]?.[1] !== code) throw new NotFound(`The Bank of England has no series ${code}.`);
      return { rows: lines.slice(1).map((c) => [period(c[0]), num(c[1])]).filter(([, v]) => v != null), title: null, unit: null, url };
    },
  },
  boj: {
    name: "Bank of Japan", page: { url: "https://www.stat-search.boj.or.jp/index_en.html", example: "boj:FM01/STRDCLUCON" },
    read: async (session, code, { want, from }) => {
      const m = /^([A-Z0-9]+)[/'](.+)$/i.exec(code);
      if (!m) throw new Error("Bank of Japan codes are a database and a series code, e.g. FM01/STRDCLUCON (the overnight call rate) or FM08/FXERD01.");
      const back = from ? new Date(`${from}T00:00:00Z`) : new Date(session.now() - Math.max(2, Math.ceil(want / 18) + 1) * 31 * 86400000);
      const url = `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=${m[1].toUpperCase()}&code=${encodeURIComponent(m[2])}&startDate=${back.getUTCFullYear()}${p2(back.getUTCMonth() + 1)}`;
      const d = await getJson(session, url);
      const r = d.RESULTSET?.[0];
      if (!r || d.STATUS !== 200) throw new NotFound(`The Bank of Japan has no series ${code}${d.MESSAGE ? ` (${d.MESSAGE})` : ""}.`);
      const dates = r.VALUES?.SURVEY_DATES ?? [], vals = r.VALUES?.VALUES ?? [];
      return { rows: dates.map((t, i) => [period(String(t)), num(vals[i])]).filter(([, v]) => v != null), title: r.NAME_OF_TIME_SERIES ?? null, unit: r.UNIT ?? null, url };
    },
  },
  rba: {
    name: "Reserve Bank of Australia", page: { url: "https://www.rba.gov.au/statistics/tables/", example: "rba:F1/FIRMMCRTD" },
    read: async (session, code) => {
      const m = /^([A-Z][0-9.]*[0-9])\/([A-Z0-9]+)$/i.exec(code);
      if (!m) throw new Error("Reserve Bank of Australia codes are a statistical table and a series ID, e.g. F1/FIRMMCRTD (the cash rate target) or F11.1/FXRUSD.");
      const url = `https://www.rba.gov.au/statistics/tables/csv/${m[1].toLowerCase()}-data.csv`;
      const lines = (await getText(session, url, { headers: BROWSER_UA })).replace(/^\uFEFF/, "").split(/\r?\n/).map(parseLine);
      const ids = lines.find((c) => c[0] === "Series ID"), titles = lines.find((c) => c[0] === "Title"), units = lines.find((c) => c[0] === "Units");
      const j = ids ? ids.indexOf(m[2].toUpperCase()) : -1;
      if (j < 1) throw new NotFound(`The Reserve Bank of Australia's table ${m[1].toUpperCase()} has no series ${m[2]}.`);
      const rows = lines.filter((c) => /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(c[0] ?? "")).map((c) => [period(c[0]), num(c[j])]).filter(([, v]) => v != null);
      return { rows, title: titles?.[j] ?? null, unit: units?.[j] ?? null, url };
    },
  },
  bcb: {
    name: "Banco Central do Brasil", page: { url: "https://www3.bcb.gov.br/sgspub/", example: "bcb:13522" },
    read: async (session, code, { want, from }) => {
      if (!/^\d{1,6}$/.test(code)) throw new Error("Banco Central do Brasil codes are SGS series numbers, e.g. 13522 (IPCA over twelve months) or 432 (the Selic target).");
      const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
      const range = (since) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${br(since)}`;
      // The latest twenty first (the most the API gives that way), then a date range when more are wanted:
      // daily series by days, the rest by months. Daily ranges are limited to ten years.
      let url = from ? range(from) : `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/20?formato=json`;
      let d = await getJson(session, url);
      if (!Array.isArray(d) || !d.length) throw new NotFound(`Banco Central do Brasil has no observations for series ${code}.`);
      if (!from && want > 20 && d.length === 20) {
        const daily = !compactDates(d.map((o) => [period(o.data), 1])).every(([p]) => /^\d{4}-\d{2}$/.test(p));
        const back = daily ? Math.min(3600, Math.ceil(want * 1.5)) : Math.ceil(want * 31);
        url = range(new Date(session.now() - back * 86400000).toISOString().slice(0, 10));
        d = await getJson(session, url);
      }
      return { rows: compactDates(d.map((o) => [period(o.data), num(o.valor)]).filter(([, v]) => v != null)), title: null, unit: null, url };
    },
  },
  ibge: {
    name: "IBGE (Brazil)", page: { url: "https://sidra.ibge.gov.br", example: "ibge:5932/v/6561/c11255/90707" },
    read: async (session, code, { want }) => {
      const m = /^(\d+)\/v\/(\d+)((?:\/c\d+\/\d+)*)$/.exec(code);
      if (!m) throw new Error("IBGE codes are a SIDRA table, a variable and any classifications, e.g. 5932/v/6561/c11255/90707.");
      const url = `https://apisidra.ibge.gov.br/values/t/${m[1]}/n1/all/v/${m[2]}/p/last%20${Math.min(want, 120)}${m[3]}`;
      const d = await getJson(session, url);
      if (!Array.isArray(d) || d.length < 2) throw new NotFound(`IBGE's SIDRA has no observations for ${code}.`);
      const quarterly = /trimestre/i.test(d[1].D3N ?? "");
      const rows = d.slice(1).map((o) => [quarterly ? `${o.D3C.slice(0, 4)}-Q${Number(o.D3C.slice(4))}` : period(o.D3C), num(o.V)]).filter(([, v]) => v != null);
      return { rows, title: d[1].D2N ?? null, unit: d[1].MN ?? null, url };
    },
  },
  riksbank: {
    name: "Sveriges Riksbank", page: { url: "https://www.riksbank.se/en-gb/statistics/", example: "riksbank:SECBREPOEFF" },
    read: async (session, code, { want, from }) => {
      if (!/^[A-Z0-9_]{4,20}$/i.test(code)) throw new Error("Riksbank codes are SWEA series IDs, e.g. SECBREPOEFF (the policy rate) or SEKUSDPMI.");
      const since = from ?? new Date(session.now() - Math.max(60, Math.ceil(want * 1.6)) * 86400000).toISOString().slice(0, 10);
      const url = `https://api.riksbank.se/swea/v1/Observations/${code}/${since}`;
      const d = await getJson(session, url);
      if (!Array.isArray(d) || !d.length) throw new NotFound(`The Riksbank has no observations for ${code} since ${since}.`);
      return { rows: d.map((o) => [period(o.date), num(o.value)]).filter(([, v]) => v != null), title: null, unit: null, url };
    },
  },
  snb: {
    name: "Swiss National Bank", page: { url: "https://data.snb.ch/en", example: "snb:snboffzisa/LZ" },
    read: async (session, code) => {
      const [cube, ...items] = String(code).split("/");
      if (!/^[a-z0-9]+$/i.test(cube) || !items.length) throw new Error("Swiss National Bank codes are a data cube and its dimension items, e.g. snboffzisa/LZ (the SNB policy rate) or devkum/M0/USD1.");
      const url = `https://data.snb.ch/api/cube/${cube}/data/csv/en`;
      const text = (await getText(session, url)).replace(/^\uFEFF/, "");
      const at = text.search(/^"?Date"?;/m);
      if (at < 0) throw new NotFound(`The Swiss National Bank has no data cube ${cube}.`);
      const rows = csvRows(text.slice(at), ";");
      const dims = Object.keys(rows[0] ?? {}).filter((k) => /^D\d+$/.test(k));
      const mine = rows.filter((r) => dims.every((d, i) => r[d] === items[i]));
      if (!mine.length) throw new NotFound(`The Swiss National Bank's cube ${cube} has no series ${items.join("/")}.`);
      return { rows: mine.map((r) => [period(r.Date), num(r.Value)]).filter(([, v]) => v != null), title: null, unit: null, url, updated: /PublishingDate";"([^"]+)/.exec(text)?.[1] ?? null };
    },
  },
  ssb: pxweb("Statistics Norway", "https://data.ssb.no/api/v0/en/table", { url: "https://www.ssb.no/en/statbank", example: "ssb:03013?Konsumgrp=TOTAL&ContentsCode=Tolvmanedersendring" }),
  scb: pxweb("Statistics Sweden", "https://api.scb.se/OV0104/v1/doris/en/ssd", { url: "https://www.statistikdatabasen.scb.se", example: "scb:PR/PR0101/PR0101A/KPItotM?ContentsCode=000004VV" }),
  mof: {
    name: "Ministry of Finance Japan", page: { url: "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/", example: "mof:10Y" },
    read: async (session, code) => {
      const tenor = String(code).toUpperCase();
      if (!/^\d{1,2}Y$/.test(tenor)) throw new Error("Ministry of Finance Japan codes are a JGB maturity, e.g. 10Y.");
      const url = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
      const history = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv";
      const rowsOf = (text) => {
        const lines = text.split(/\r?\n/).map((l) => l.split(","));
        const head = lines.find((c) => c[0] === "Date");
        const j = head ? head.findIndex((h) => h.trim() === tenor) : -1;
        if (j < 1) throw new NotFound(`The Ministry of Finance publishes no ${tenor} JGB yield.`);
        return lines.filter((c) => /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(c[0])).map((c) => { const [y, mo, d] = c[0].split("/"); return [`${y}-${p2(mo)}-${p2(d)}`, num(c[j])]; }).filter(([, v]) => v != null);
      };
      const [now, before] = await Promise.all([getEncodedText(session, url, { encoding: "shift_jis" }), getEncodedText(session, history, { encoding: "shift_jis" })]);
      return { rows: [...rowsOf(before), ...rowsOf(now)], title: `JGB ${tenor} yield`, unit: "percent", url, api: history };
    },
  },
};

// A plain line of comma-separated values, quoted fields allowed.
function parseLine(line) {
  return csvRows(`${line.split(",").map((_, i) => `c${i}`).join(",")}\n${line}`).map((r) => Object.values(r))[0] ?? [];
}

// PxWeb tables (the Nordic offices): a table path and its selections; the last periods come from "top".
function pxweb(name, base, page) {
  return {
    name, page,
    read: async (session, code, { want }) => {
      const m = /^([A-Za-z0-9/_]+)\?(.+)$/.exec(code);
      if (!m) throw new Error(`${name} codes are a table and a value for each of its variables, e.g. ${page.example.split(":")[1]}.`);
      const query = [...new URLSearchParams(m[2])].map(([k, v]) => ({ code: k, selection: { filter: "item", values: v.split(",") } }));
      const url = `${base}/${m[1]}`;
      const meta = await getJson(session, url);
      const time = (meta.variables ?? []).find((v) => v.time || /^(tid|time|month|quarter|year)$/i.test(v.code));
      if (!time) throw new NotFound(`${name} has no table ${m[1]}.`);
      query.push({ code: time.code, selection: { filter: "top", values: [String(Math.min(want, 600))] } });
      const d = await postJson(session, url, { query, response: { format: "json-stat2" } });
      const series = jsonStat(d);
      if (series.length > 1) throw new Error(`The selections matched ${series.length} series; give one value for each variable of ${m[1]} (${(meta.variables ?? []).map((v) => v.code).join(", ")}).`);
      return { rows: series[0]?.rows ?? [], title: d.label ?? meta.title ?? null, unit: null, url: `${page.url}`, api: url, updated: d.updated ?? null };
    },
  };
}

// JSON-stat 2.0 (Eurostat, the Nordic offices) as one series per combination of the non-time dimensions.
export function jsonStat(d) {
  const ids = d.id ?? [], size = d.size ?? [];
  const timeId = ids.find((k) => (d.role?.time ?? []).includes(k)) ?? ids.find((k) => /^(time|tid|month|quarter|year)$/i.test(k)) ?? ids.at(-1);
  const codes = ids.map((k) => { const idx = d.dimension[k].category.index; return Array.isArray(idx) ? idx : Object.keys(idx).sort((a, b) => idx[a] - idx[b]); });
  const total = size.reduce((a, b) => a * b, 1);
  const value = (j) => (Array.isArray(d.value) ? d.value[j] : d.value?.[String(j)]);
  const groups = new Map();
  for (let j = 0; j < total; j += 1) {
    let rest = j; const at = {};
    for (let i = ids.length - 1; i >= 0; i -= 1) { at[ids[i]] = codes[i][rest % size[i]]; rest = Math.floor(rest / size[i]); }
    const key = Object.fromEntries(ids.filter((k) => k !== timeId).map((k) => [k, at[k]]));
    const name = JSON.stringify(key);
    const g = groups.get(name) ?? { key, rows: [] };
    const v = num(value(j));
    if (v != null) g.rows.push([period(at[timeId]), v]);
    groups.set(name, g);
  }
  for (const g of groups.values()) g.rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return [...groups.values()].filter((g) => g.rows.length || groups.size === 1);
}

// ---------------------------------------------------------------------------------------------
// The measures: each country's own publisher first, then the EU's, then the IMF's or BIS's compilation.
// ---------------------------------------------------------------------------------------------
// Eurostat writes Greece EL; the euro area is EA (as it was at each date) or EA21 (today's members throughout).
const geo = (c, area = "EA") => (c.code === "EA" ? area : c.code === "GR" ? "EL" : c.code);
const IMF_BY = (c) => `International Monetary Fund, from ${c.name}'s official statistics`;
const BIS_BY = (c) => `Bank for International Settlements, from ${c.name === "Euro area" ? "the European Central Bank" : `${c.name}'s central bank`}`;
const OECD_BY = (c) => `OECD, from ${c.name}'s official statistics`;
const OECD_MEMBERS = new Set(["AUS", "AUT", "BEL", "CAN", "CHL", "COL", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "IRL", "ISR", "ITA", "JPN", "KOR", "LVA", "LTU", "LUX", "MEX", "NLD", "NZL", "NOR", "POL", "PRT", "SVK", "SVN", "ESP", "SWE", "CHE", "TUR", "GBR", "USA"]);
const G20 = new Set(["ARG", "AUS", "BRA", "CAN", "CHN", "FRA", "DEU", "IND", "IDN", "ITA", "JPN", "KOR", "MEX", "RUS", "SAU", "ZAF", "TUR", "GBR", "USA"]);
const bisArea = (c) => (c.code === "EA" ? "XM" : c.code);
// A spec that can be read for many countries in one request: its code with {} where the area goes.
const batched = (tpl, area, rest) => ({ s: tpl.replace("{}", area), batch: [tpl, area], ...rest });

export const MEASURES = {
  inflation: {
    words: "inflation cpi consumer price prices index cost of living hicp headline",
    basis: "Consumer prices, percent change on the same period a year earlier.",
    national: {
      US: { s: "fred:CPIAUCNS", yoy: true, by: "U.S. Bureau of Labor Statistics, through FRED", title: "CPI for all urban consumers, all items, not seasonally adjusted: change on a year" },
      CA: { s: "statcan:41690973", yoy: true, by: "Statistics Canada", title: "Consumer Price Index, all-items, not seasonally adjusted: change on a year" },
      GB: { s: "ons:D7G7/MM23", by: "Office for National Statistics", title: "CPI annual rate, all items" },
      AU: { s: "abs:CPI/3.10001.10.50.M", by: "Australian Bureau of Statistics", title: "Monthly CPI, all groups, weighted average of the eight capital cities: change on a year" },
      BR: { s: "bcb:13522", by: "IBGE's IPCA, through Banco Central do Brasil", title: "IPCA, change over twelve months" },
      NO: { s: "ssb:14710?ContentsCode=KpiIndMnd", yoy: true, by: "Statistics Norway", title: "Consumer Price Index (2025=100): change on a year" },
      SE: { s: "scb:PR/PR0101/PR0101A/KPI2020M?ContentsCode=00000804", by: "Statistics Sweden", title: "CPI (2020=100), annual change" },
      CH: { s: "snb:plkopr/VVP", by: "Swiss Federal Statistical Office's CPI, through the Swiss National Bank", title: "Swiss consumer prices: change on the same month a year earlier" },
    },
    eu: (c) => batched("eurostat:prc_hicp_minr?geo={}&unit=RCH_A&coicop18=TOTAL", geo(c), { by: `Eurostat's harmonised index (HICP), from ${c.code === "EA" ? "the euro area members' statistics offices" : `${c.name}'s statistics office`}`, title: "HICP, all items (ECOICOP 2): annual rate of change" }),
    world: (c) => (c.code === "EA" ? null : batched("imf:CPI/{}.CPI._T.YOY_PCH_PA_PT.M", c.iso3, { by: IMF_BY(c), title: "Consumer price index, all items: change on the same month a year earlier" })),
    tolerance: 0.15,
  },
  core_inflation: {
    words: "core inflation underlying inflation core cpi excluding food energy trimmed mean",
    basis: "Consumer prices without the most volatile items (each publisher's own core measure), percent change on a year.",
    national: {
      US: { s: "fred:CPILFENS", yoy: true, by: "U.S. Bureau of Labor Statistics, through FRED", title: "CPI less food and energy, not seasonally adjusted: change on a year" },
      CA: { s: "statcan:108785713", by: "Statistics Canada (the Bank of Canada's CPI-trim)", title: "CPI-trim: change on a year" },
      GB: { s: "ons:DKO8/MM23", by: "Office for National Statistics", title: "CPI excluding energy, food, alcohol and tobacco: 12-month rate" },
    },
    eu: (c) => batched("eurostat:prc_hicp_minr?geo={}&unit=RCH_A&coicop18=TOT_X_NRG_FOOD", geo(c), { by: `Eurostat's harmonised index (HICP), from ${c.code === "EA" ? "the euro area members' statistics offices" : `${c.name}'s statistics office`}`, title: "HICP excluding energy, food, alcohol and tobacco: annual rate of change" }),
    tolerance: 0.15,
  },
  unemployment: {
    words: "unemployment unemployment rate jobless joblessness labour labor market",
    basis: "Unemployed people as a percent of the labour force.",
    national: {
      US: { s: "fred:UNRATE", by: "U.S. Bureau of Labor Statistics, through FRED", title: "Unemployment rate, 16 and over, seasonally adjusted" },
      CA: { s: "statcan:2062815", by: "Statistics Canada", title: "Unemployment rate, 15 and over, seasonally adjusted" },
      GB: { s: "ons:MGSX/LMS", by: "Office for National Statistics", title: "Unemployment rate, 16 and over, seasonally adjusted (the three months centred on the month shown)" },
      AU: { s: "abs:LF/M13.3.1599.20.AUS.M", by: "Australian Bureau of Statistics", title: "Unemployment rate, persons 15 and over, seasonally adjusted" },
      BR: { s: "bcb:24369", by: "IBGE's PNAD Contínua, through Banco Central do Brasil", title: "Unemployment rate, the three months ending in the month shown" },
    },
    eu: (c) => batched("eurostat:une_rt_m?geo={}&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT", geo(c, "EA21"), { by: `Eurostat, from ${c.code === "EA" ? "the members'" : `${c.name}'s`} labour force survey (ILO definition)`, title: "Unemployment rate, 15 to 74, seasonally adjusted" }),
    oecd: (c) => (OECD_MEMBERS.has(c.iso3) ? batched("oecd:OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,1.0/{}.UNE_LF_M.PT_LF_SUB._Z.Y._T.Y_GE15._Z.M", c.iso3, { by: OECD_BY(c), title: "Unemployment rate, 15 and over, seasonally adjusted" }) : null),
    world: (c) => (c.code === "EA" ? null : { s: [`imf:LS/${c.iso3}.U.PT.M`, `imf:LS/${c.iso3}.U.PT.Q`, `imf:LS/${c.iso3}.U.PT.A`], batch: ["imf:LS/{}.U.PT.M", c.iso3], by: IMF_BY(c), title: "Unemployment rate" }),
    tolerance: 0.15,
  },
  gdp_growth: {
    words: "gdp growth economic growth real gdp output economy expansion recession national accounts",
    basis: "Real GDP, percent change on the same quarter a year earlier.",
    national: {
      US: { s: "fred:GDPC1", yoy: true, by: "U.S. Bureau of Economic Analysis, through FRED", title: "Real GDP (chained 2017 dollars, seasonally adjusted): change on the same quarter a year earlier. The BEA's headline is the quarter's change at an annual rate (fred:A191RL1Q225SBEA)." },
      CA: { s: "statcan:62305752", yoy: true, by: "Statistics Canada", title: "Real GDP at market prices (chained 2017 dollars, seasonally adjusted): change on a year" },
      GB: { s: "ons:IHYR/QNA", by: "Office for National Statistics", title: "GDP, chained volume measure, seasonally adjusted: quarter on the same quarter a year earlier" },
      BR: { s: "ibge:5932/v/6561/c11255/90707", by: "IBGE (Brazil's quarterly national accounts)", title: "GDP at market prices: change on the same quarter a year earlier" },
    },
    eu: (c) => batched("eurostat:namq_10_gdp?geo={}&na_item=B1GQ&unit=CLV_PCH_SM&s_adj=SCA", geo(c, "EA21"), { by: `Eurostat, from ${c.code === "EA" ? "the members'" : `${c.name}'s`} national accounts`, title: "GDP, chain-linked volumes, seasonally and calendar adjusted: change on the same quarter a year earlier" }),
    oecd: (c) => (G20.has(c.iso3) || OECD_MEMBERS.has(c.iso3) ? batched(`oecd:OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_${G20.has(c.iso3) ? "G20" : "OECD"},1.1/Q.Y.{}.S1.S1.B1GQ._Z._Z._Z.PC.L.GY.T0102`, c.iso3, { by: OECD_BY(c), title: "Real GDP, seasonally adjusted: change on the same quarter a year earlier" }) : null),
    // The IMF's quarterly volume series for China follows nominal GDP (8.6% for 2026-Q2 against the
    // National Bureau of Statistics' 4 to 5%), so China is left to the OECD.
    world: (c) => (c.code === "EA" || c.code === "CN" ? null : { s: [`imf:QNEA/${c.iso3}.B1GQ.Q.SA.XDC.Q`, `imf:QNEA/${c.iso3}.B1GQ.Q.NSA.XDC.Q`], batch: ["imf:QNEA/{}.B1GQ.Q.SA.XDC.Q", c.iso3], yoy: true, by: IMF_BY(c), title: "Real GDP: change on the same quarter a year earlier, computed from the IMF's level series" }),
    tolerance: 0.3,
  },
  policy_rate: {
    words: "policy rate interest rate central bank rate key rate bank rate base rate cash rate selic repo rate fed funds overnight rate deposit rate",
    basis: "The central bank's policy interest rate, percent a year.",
    daily: true,
    national: {
      US: { s: "fred:DFEDTARU", by: "Federal Reserve, through FRED", title: "Federal funds target range, upper limit", note: "The BIS records the middle of the Fed's target range, 0.125 below its upper limit." },
      CA: { s: "boc:V39079", by: "Bank of Canada", title: "Target for the overnight rate" },
      GB: { s: "boe:IUDBEDR", by: "Bank of England", title: "Bank Rate" },
      EA: { s: "ecb:FM/D.U2.EUR.4F.KR.DFR.LEV", by: "European Central Bank", title: "Deposit facility rate (the rate the ECB steers policy with)" },
      AU: { s: "rba:F1/FIRMMCRTD", by: "Reserve Bank of Australia", title: "Cash rate target" },
      BR: { s: "bcb:432", by: "Banco Central do Brasil", title: "Selic target rate" },
      NO: { s: "norges:IR/B.KPRA.SD.R", by: "Norges Bank", title: "Policy rate (sight deposit rate)" },
      SE: { s: "riksbank:SECBREPOEFF", by: "Sveriges Riksbank", title: "Policy rate" },
      CH: { s: "snb:snboffzisa/LZ", by: "Swiss National Bank", title: "SNB policy rate (monthly)" },
      IL: { s: "boi:BR/MNT_RIB_BOI_D", by: "Bank of Israel", title: "Bank of Israel interest rate" },
    },
    euro: "EA",
    world: (c) => batched("bis:WS_CBPOL/D.{}", bisArea(c), { by: BIS_BY(c), title: "Central bank policy rate" }),
    tolerance: 0.01,
  },
  ten_year_yield: {
    words: "10 year yield ten year 10-year government bond yield long-term interest rate sovereign yield treasury gilt bund jgb",
    basis: "The 10-year government bond yield, percent a year.",
    daily: true,
    monthly: "average",
    national: {
      US: { s: "fred:DGS10", by: "Federal Reserve (H.15), through FRED", title: "10-year Treasury, constant maturity" },
      CA: { s: "boc:BD.CDN.10YR.DQ.YLD", by: "Bank of Canada", title: "10-year benchmark bond yield" },
      GB: { s: "boe:IUDMNZC", by: "Bank of England", title: "10-year nominal zero-coupon gilt yield" },
      DE: { s: "bbk:BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A", by: "Deutsche Bundesbank", title: "Federal securities, 10-year residual maturity (term structure estimate)" },
      EA: { s: "ecb:YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", by: "European Central Bank", title: "10-year spot rate, AAA-rated euro area governments" },
      JP: { s: "mof:10Y", by: "Ministry of Finance Japan", title: "10-year JGB yield" },
      AU: { s: "rba:F2/FCMYGBAG10D", by: "Reserve Bank of Australia", title: "10-year Australian government bond yield" },
      NO: { s: "norges:GOVT_GENERIC_RATES/B.10Y.GBON", by: "Norges Bank", title: "10-year government bond, generic yield" },
      SE: { s: "riksbank:SEGVB10YC", by: "Sveriges Riksbank", title: "10-year government bond yield" },
    },
    eu: (c) => (c.code === "EA" ? null : batched("eurostat:irt_lt_mcby_m?geo={}", geo(c), { by: `Eurostat, from ${c.name}'s central bank (the convergence-criterion yield)`, title: "10-year government bond yield, monthly average" })),
    world: (c) => (c.code === "EA" ? null : batched("imf:MFS_IR/{}.S13BOND_RT_PT_A_PT.M", c.iso3, { by: IMF_BY(c), title: "Government bond yield, monthly (each country's benchmark maturity, mostly ten years)" })),
    tolerance: 0.15,
  },
  exchange_rate: {
    words: "exchange rate currency fx forex dollar per us dollar usd conversion",
    basis: "The currency against the US dollar, as each publisher quotes it (see quote).",
    daily: true,
    monthly: "average",
    national: {
      US: { s: "fred:DTWEXBGS", by: "Federal Reserve, through FRED", title: "Nominal broad US dollar index", quote: "index, January 2006 = 100 (the dollar against a basket of currencies)" },
      CA: { s: "boc:FXUSDCAD", by: "Bank of Canada", title: "US dollar in Canadian dollars", quote: "Canadian dollars per US dollar" },
      GB: { s: "boe:XUDLUSS", by: "Bank of England", title: "US dollars to the pound, spot", quote: "US dollars per pound", inverse: true },
      EA: { s: "ecb:EXR/D.USD.EUR.SP00.A", by: "European Central Bank", title: "Euro reference rate, US dollar", quote: "US dollars per euro", inverse: true },
      JP: { s: "boj:FM08/FXERD01", by: "Bank of Japan", title: "US dollar/yen spot rate at 9:00, Tokyo market", quote: "yen per US dollar" },
      AU: { s: "rba:F11.1/FXRUSD", by: "Reserve Bank of Australia", title: "Australian dollar in US dollars", quote: "US dollars per Australian dollar", inverse: true },
      BR: { s: "bcb:1", by: "Banco Central do Brasil", title: "US dollar, selling rate (PTAX)", quote: "reais per US dollar" },
      NO: { s: "norges:EXR/B.USD.NOK.SP", by: "Norges Bank", title: "US dollar in kroner", quote: "kroner per US dollar" },
      SE: { s: "riksbank:SEKUSDPMI", by: "Sveriges Riksbank", title: "US dollar in kronor", quote: "kronor per US dollar" },
      CH: { s: "snb:devkum/M0/USD1", by: "Swiss National Bank", title: "US dollar in francs, monthly average", quote: "francs per US dollar" },
      IL: { s: "boi:EXR/RER_USD_ILS", by: "Bank of Israel", title: "Representative rate, US dollar", quote: "shekels per US dollar" },
    },
    euro: "EA",
    world: (c) => (c.code === "EA" ? { s: "fred:DEXUSEU", by: "Federal Reserve (H.10), through FRED", title: "US dollars to one euro, noon buying rates in New York", quote: "US dollars per euro", inverse: true } : batched("imf:ER/{}.XDC_USD.PA_RT.M", c.iso3, { by: IMF_BY(c), title: "National currency per US dollar, monthly average", quote: "national currency per US dollar" })),
    tolerance: 0.005,
    relative: true,
  },
  house_prices: {
    words: "house prices home prices housing property prices real estate residential",
    basis: "Residential property prices, nominal, percent change on a year.",
    national: {},
    world: (c) => batched("bis:WS_SPP/Q.{}.N.771", bisArea(c), { by: `Bank for International Settlements, from ${c.name === "Euro area" ? "the ECB" : `${c.name}'s national source`}`, title: "Residential property prices, nominal: change on a year" }),
    tolerance: 0.3,
  },
};

// The publishers to try for a measure in a country, best first: its own, the EU's, the OECD's, the IMF's or BIS's.
export function chain(measure, c) {
  const m = MEASURES[measure];
  if (m.euro && EURO.has(c.code) && !own(m.national, c.code)) return chain(measure, COUNTRIES.find((x) => x.code === "EA")).map((l) => ({ ...l, by: `${l.by} (${c.name} uses the euro)` }));
  const out = [];
  const nat = own(m.national, c.code);
  if (nat) out.push(nat);
  if (m.eu && (EU.has(c.code) || c.code === "EA")) out.push(m.eu(c));
  if (m.oecd) out.push(m.oecd(c));
  if (m.world) out.push(m.world(c));
  return out.filter(Boolean);
}

export function findMeasure(q) {
  const s = squash(q).replace(/[-_]/g, " ");
  if (own(MEASURES, s.replace(/ /g, "_"))) return s.replace(/ /g, "_");
  if (/\b(core|underlying|trimmed)\b/.test(s)) return "core_inflation";
  const words = s.split(" ").filter((w) => w.length > 1 && !["the", "of", "in", "a", "rate", "rates", "and", "for", "latest", "current"].includes(w));
  let best = null, bestScore = 0;
  for (const [k, m] of Object.entries(MEASURES)) {
    const vocab = ` ${m.words} ${k.replace(/_/g, " ")} `;
    const score = (vocab.includes(` ${s} `) ? 3 : 0) + words.filter((w) => vocab.includes(` ${w} `) || vocab.includes(` ${w}s `)).length / Math.max(1, words.length);
    if (score > bestScore) { best = k; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------
async function readCode(session, code, opts) {
  const hit = opts.prefetched?.get(code);
  if (hit) return hit;
  const m = /^([a-z]+):(.+)$/i.exec(String(code).trim());
  const p = m && own(PUBLISHERS, m[1].toLowerCase());
  if (!p) throw new Error(`Name the publisher before the code, e.g. ${Object.values(PUBLISHERS).slice(0, 4).map((x) => x.page.example).join(", ")}. Publishers: ${Object.keys(PUBLISHERS).join(", ")}.`);
  const key = `${code}|${opts.want}|${opts.from ?? ""}`;
  if (opts.inflight?.has(key)) return opts.inflight.get(key);
  const pending = (async () => {
    const r = await p.read(session, m[2].trim(), opts);
    const rows = [...new Map([...r.rows].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)))];
    return { ...r, rows, publisher: p.name, code: `${m[1].toLowerCase()}:${m[2].trim()}` };
  })();
  opts.inflight?.set(key, pending);
  return pending;
}

// One spec: its first code with observations (a spec may list alternatives), as a change on a year when it is a level.
async function readSpec(session, spec, opts) {
  const codes = [spec.s].flat();
  const got = await Promise.all(codes.map(async (code) => {
    try {
      const r = await readCode(session, code, { ...opts, want: spec.yoy ? opts.want + 13 : opts.want });
      const rows = spec.yoy ? onAYear(r.rows) : r.rows;
      if (!rows.length) return { error: new NotFound(`${code} has ${r.rows.length ? "too few observations to compare with a year earlier" : "no observations"}.`) };
      return { r: { ...r, rows, spec } };
    } catch (err) { return { error: err }; }
  }));
  const latestOf = (g) => startOf(g.r.rows.at(-1)[0]);
  const ok = got.filter((g) => g.r).sort((x, y) => (latestOf(y) > latestOf(x) ? 1 : latestOf(y) < latestOf(x) ? -1 : 0));
  if (ok.length) return ok[0].r;
  throw got[0].error;
}

// The country's figure from the first publisher in its chain that answers; the rest are alternatives.
async function readMeasure(session, measure, c, opts) {
  const links = chain(measure, c);
  if (!links.length) throw new NotFound(`No open source read here covers ${measure.replace(/_/g, " ")} for ${c.name}${measure === "core_inflation" ? " (core inflation is read for the US, Canada, the UK and the EU; for others ask for inflation, or a series by its code)" : ""}.`);
  const tried = [];
  for (let i = 0; i < links.length; i += 1) {
    if (links[i].batch && opts.failed?.has(links[i].batch[0])) { tried.push({ series: [links[i].s].flat()[0], by: links[i].by, error: "the publisher did not answer the combined request" }); continue; }
    try {
      const r = await readSpec(session, links[i], opts);
      return { r, link: links[i], others: links.slice(i + 1), tried };
    } catch (err) {
      tried.push({ series: [links[i].s].flat()[0], by: links[i].by, error: String(err?.message ?? err).slice(0, 200) });
    }
  }
  throw new NotFound(`No publisher answered for ${c.name}: ${tried.map((t) => `${t.series}: ${t.error}`).join("; ")}`);
}

// Many countries' first publishers, one request per publisher and code pattern instead of one per country.
async function prefetch(session, links, opts, failed) {
  const groups = new Map();
  for (const l of links) if (l?.batch) { const [tpl, area] = l.batch; const g = groups.get(tpl) ?? { areas: [], yoy: l.yoy }; g.areas.push(area); groups.set(tpl, g); }
  const got = new Map();
  await Promise.all([...groups].filter(([, g]) => g.areas.length > 1).map(async ([tpl, g]) => {
    const pub = tpl.slice(0, tpl.indexOf(":")), p = own(PUBLISHERS, pub);
    if (!p?.readMany) return;
    const code = tpl.slice(pub.length + 1).replace("{}", [...new Set(g.areas)].join(pub === "eurostat" ? "&geo=" : "+"));
    try {
      const many = await p.readMany(session, code, { ...opts, want: g.yoy ? opts.want + 13 : opts.want });
      for (const a of g.areas) {
        const hit = many.get(a);
        if (hit?.rows.length && !hit.more) got.set(tpl.replace("{}", a), { ...hit, publisher: p.name, code: tpl.replace("{}", a) });
      }
    } catch { failed.add(tpl); }
  }));
  return got;
}

function summary(rows) {
  const last = rows.at(-1), prev = rows.at(-2);
  if (!last) return {};
  const ago = kind(last[0]) === "day" ? onOrBefore(rows, yearBefore(last[0])) : rows.find(([p]) => p === yearBefore(last[0]));
  return {
    latest: { period: last[0], value: round(last[1], 6) },
    ...(prev ? { previous: { period: prev[0], value: round(prev[1], 6) } } : {}),
    ...(ago ? { year_ago: { period: ago[0], value: round(ago[1], 6) } } : {}),
  };
}

// A policy rate's moves in what was read, latest last.
export function moves(rows, n = 8) {
  const out = [];
  for (let i = 1; i < rows.length; i += 1) if (rows[i][1] !== rows[i - 1][1]) out.push({ date: rows[i][0], from: round(rows[i - 1][1], 6), to: round(rows[i][1], 6) });
  return out.slice(-n);
}

// Daily observations as each month's last, or each month's average.
const monthEnds = (rows) => [...new Map(rows.map(([p, v]) => [p.slice(0, 7), v]))];
const monthMeans = (rows) => { const by = new Map(); for (const [p, v] of rows) { const k = p.slice(0, 7); const g = by.get(k) ?? [0, 0]; by.set(k, [g[0] + v, g[1] + 1]); } return [...by].map(([k, [t, n]]) => [k, t / n]); };

// The latest period both publishers report, and how far apart they are there.
export function compare(a, b, m, note) {
  let ra = a.rows, rb = b.rows;
  const ka = kind(ra.at(-1)[0]), kb = kind(rb.at(-1)[0]);
  const monthly = m.monthly === "average" ? monthMeans : monthEnds;
  if (ka === "day" && kb === "month") ra = monthly(ra); else if (kb === "day" && ka === "month") rb = monthly(rb);
  // US dollars per unit against units per US dollar: the other figure upside down.
  const flip = Boolean(a.spec?.inverse) !== Boolean(b.spec?.inverse);
  if (flip) rb = rb.map(([p, v]) => [p, v ? 1 / v : null]).filter(([, v]) => v != null);
  const other = { series: b.code, by: b.spec.by, latest: { period: b.rows.at(-1)[0], value: round(b.rows.at(-1)[1], 6) } };
  const at = new Map(rb);
  const both = [...ra].reverse().find(([p]) => at.has(p));
  if (!both) return { other, note: "The two publishers share no period in what was read (one publishes later or less often)." };
  const [p, va] = both, vb = at.get(p);
  const gap = vb - va, rel = va ? gap / Math.abs(va) : null;
  const agree = m.relative ? rel != null && Math.abs(rel) <= m.tolerance : Math.abs(gap) <= m.tolerance;
  return {
    other, period: p, value: round(va, 6), other_value: round(vb, 6), difference: round(gap, 6),
    ...(m.relative && rel != null ? { difference_pct: round(rel * 100, 3) } : {}),
    agree, tolerance: m.relative ? `${m.tolerance * 100}% of the value` : `${m.tolerance} points`,
    ...(flip ? { compared_as: `the other publisher's figure turned over to quote it as this one does (${a.spec.quote ?? "the same way"})` } : {}),
    ...(kb !== ka ? { aligned: `daily figures as each month's ${m.monthly === "average" ? "average" : "last"}` } : {}),
    ...(note ? { note } : {}),
    reading: "A gap can come from a definition (a national CPI against the EU's harmonised index, seasonally adjusted against not, a range's top against its middle) as well as from an error; the titles say what each figure is.",
  };
}

export const worldSeriesInput = z.object({
  country: z.string().min(2).max(60).optional().describe("One country or the euro area: a name (Brazil, South Korea, euro area) or an ISO code (BR, KOR)."),
  countries: z.array(z.string().min(2).max(60)).min(1).max(30).optional().describe("Several side by side, or a group: G7, G20, EU, euro area members, BRICS, Nordics, ASEAN, Latin America. Up to 30."),
  measure: z.string().min(2).max(80).optional().describe("inflation, core_inflation, unemployment, gdp_growth, policy_rate, ten_year_yield, exchange_rate or house_prices; plain words work (\"jobless rate\", \"10-year bond yield\")."),
  series: z.string().min(4).max(300).optional().describe("Any series by its publisher's own code instead: imf:, bis:, ecb:, eurostat:, oecd:, ilo:, fred:, statcan:, boc:, ons:, boe:, boj:, mof:, rba:, abs:, bcb:, ibge:, riksbank:, scb:, ssb:, norges:, snb:, bbk:, boi: (e.g. \"statcan:2062815\", \"eurostat:une_rt_m?geo=DE&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT\")."),
  periods: z.number().int().min(1).max(600).optional().describe("Observations to return, latest last. Default 13 (one country), 1 (several)."),
  start: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).optional().describe("Return everything from this date (YYYY, YYYY-MM or YYYY-MM-DD) instead, up to 600 observations."),
  check: z.boolean().optional().describe("Also read the same figure from a second official publisher (the IMF, BIS, OECD or Eurostat) and compare the latest period both report."),
}).strict();

const startDate = (s) => (s ? (s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s) : null);
// The first day of a period, so periods of any length compare with a start date.
const startOf = (p) => { const k = kind(p); return k === "year" ? `${p}-01-01` : k === "quarter" ? `${p.slice(0, 4)}-${p2((Number(p.slice(6)) - 1) * 3 + 1)}-01` : k === "month" ? `${p}-01` : p; };
const keepFrom = (rows, start) => (start ? rows.filter(([p]) => startOf(p) >= start) : rows);

async function limited(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

// A figure whose latest observation is more than eighteen months old.
const staleSince = (session, rows) => { const p = rows.at(-1)?.[0]; return p && Date.parse(`${startOf(p)}T00:00:00Z`) < session.now() - 548 * 86400000 ? p : null; };

const LIMITS = [
  "Figures as each publisher holds them today: they are revised, and the latest period differs by country (each office publishes on its own calendar). A change on a year computed here (series.computed) is from the publisher's own levels.",
  "Definitions differ between countries even for one measure (national CPIs against the EU's harmonised index, national unemployment surveys); the title and basis say what each figure is. Compare countries with that in mind.",
  "Not investment advice.",
];

export async function worldSeries(session, args) {
  const a = worldSeriesInput.parse(args);
  const from0 = startDate(a.start);
  // Reading a year before the start lets a change on a year cover the first period.
  const from = from0 ? `${Number(from0.slice(0, 4)) - 1}${from0.slice(4)}` : null;
  if (a.series) {
    if (a.country || a.countries || a.measure) throw new Error("Give either series (a publisher's code) or country and measure, not both.");
    const r = await readCode(session, a.series, { want: Math.min(1200, (a.periods ?? 13) + 380), from });
    const rows = keepFrom(r.rows, from0).slice(-(a.start ? 600 : a.periods ?? 13));
    if (!rows.length) throw new NotFound(`${r.publisher} returned no observations for ${a.series}${a.start ? ` since ${a.start}` : ""}.`);
    return {
      series: { id: r.code, publisher: r.publisher, title: r.title ?? null, ...(r.description ? { description: r.description } : {}), unit: r.unit ?? null, frequency: FREQUENCY[kind(rows.at(-1)[0])], ...(r.updated ? { updated: r.updated } : {}) },
      ...summary(r.rows),
      columns: ["period", "value"], rows: rows.map(([p, v]) => [p, round(v, 6)]),
      source: r.url, sources: [r.url, ...(r.api ? [r.api] : [])], limits: LIMITS,
    };
  }
  if (!a.measure) throw new Error(`Name a measure (${Object.keys(MEASURES).join(", ")}) with a country, or a series by its publisher's code.`);
  if (OVERVIEW.test(squash(a.measure))) return overview(session, a);
  const measure = findMeasure(a.measure);
  if (!measure) throw new Error(`"${a.measure}" is not a measure read here. Measures: ${Object.keys(MEASURES).join(", ")}. For anything else give a series by its publisher's code (series: "imf:...", "eurostat:...", "fred:...").`);
  const m = MEASURES[measure];
  const asked = a.countries ?? (a.country ? [a.country] : null);
  if (!asked) throw new Error("Name a country (country) or several (countries).");
  const { countries, unknown } = countryList(asked);
  if (!countries.length) throw new NotFound(`No country matched ${unknown.join(", ")}. Covered: ${COUNTRIES.map((c) => c.name).join(", ")}; groups: ${Object.keys(GROUPS).join(", ")}.`);
  if (countries.length > 30) throw new Error(`That is ${countries.length} countries; ask for up to 30 at once.`);
  const single = countries.length === 1 && !a.countries;
  const shown = a.start ? 600 : a.periods ?? (single ? 13 : 1);
  const want = Math.min(1200, shown + (m.daily ? 380 : 13));

  const inflight = new Map();
  if (single) {
    const c = countries[0];
    const { r, link, others } = await readMeasure(session, measure, c, { want, from, inflight });
    const rows = keepFrom(r.rows, from0).slice(-shown);
    let check = null;
    if (a.check) {
      for (const o of others) {
        try { check = compare(r, await readSpec(session, o, { want, from, inflight }), m, link.note); break; } catch (err) { check = { other: { series: [o.s].flat()[0], by: o.by }, error: String(err?.message ?? err).slice(0, 200) }; }
      }
      if (!check) check = { note: `No second publisher carries this measure for ${c.name} here.` };
    }
    const changes = measure === "policy_rate" ? moves(r.rows) : null;
    return {
      country: c.name, measure, basis: m.basis,
      series: { id: r.code, publisher: link.by, title: link.title ?? r.title ?? null, ...(link.quote ? { quote: link.quote } : {}), frequency: FREQUENCY[kind(r.rows.at(-1)[0])], ...(link.yoy ? { computed: "change on a year, from the publisher's levels" } : {}), ...(r.updated ? { updated: r.updated } : {}) },
      ...summary(r.rows),
      ...(staleSince(session, r.rows) ? { stale: `The latest observation is for ${r.rows.at(-1)[0]}; ${link.by.split(",")[0]} has published nothing newer for ${c.name}.` } : {}),
      ...(changes ? (changes.length ? { changes } : { unchanged_since: r.rows[0][0] }) : {}),
      columns: ["period", "value"], rows: rows.map(([p, v]) => [p, round(v, 6)]),
      ...(check ? { check } : {}),
      ...(others.length ? { also_from: others.map((o) => ({ series: [o.s].flat()[0], by: o.by })) } : {}),
      source: r.url, sources: [r.url, ...(r.api ? [r.api] : [])], limits: LIMITS,
    };
  }

  const failed = new Set();
  const prefetched = await prefetch(session, countries.map((c) => chain(measure, c)[0]), { want, from }, failed);
  const results = await limited(countries, 6, async (c) => {
    try { return { c, ...(await readMeasure(session, measure, c, { want, from, prefetched, failed, inflight })) }; } catch (err) { return { c, error: String(err?.message ?? err).slice(0, 300) }; }
  });
  const ok = results.filter((x) => !x.error);
  if (!ok.length) throw new NotFound(`No publisher answered for any of them: ${results.map((x) => `${x.c.name}: ${x.error}`).join("; ").slice(0, 900)}`);
  return {
    measure, basis: m.basis,
    columns: ["country", "period", "value", "quote", "publisher", "series"],
    rows: ok.map(({ c, r, link }) => { const last = r.rows.at(-1); return [c.name, last[0], round(last[1], 6), link.quote ?? null, link.by, r.code]; }),
    ...(shown > 1 ? { history: Object.fromEntries(ok.map(({ c, r }) => [c.name, keepFrom(r.rows, from0).slice(-shown).map(([p, v]) => [p, round(v, 6)])])) } : {}),
    ...(ok.some(({ r }) => staleSince(session, r.rows)) ? { stale: ok.filter(({ r }) => staleSince(session, r.rows)).map(({ c, r }) => `${c.name}: latest ${r.rows.at(-1)[0]}`) } : {}),
    ...(unknown.length || results.some((x) => x.error) ? { not_found: [...unknown.map((u) => `${u}: not a country or group covered here`), ...results.filter((x) => x.error).map((x) => `${x.c.name}: ${x.error}`)] } : {}),
    source: ok[0].r.url, sources: [...new Set(ok.map(({ r }) => r.url))], limits: LIMITS,
  };
}

// measure "all": one country's every measure at once, each from the first publisher that answers.
const OVERVIEW = /^(all|overview|everything|economy|dashboard|snapshot|summary|all measures|the economy)$/;
async function overview(session, a) {
  if (a.countries || !a.country) throw new Error("measure \"all\" reads one country (country); for several countries name one measure.");
  const c = findCountry(a.country);
  if (!c) throw new NotFound(`No country matched ${a.country}. Covered: ${COUNTRIES.map((x) => x.name).join(", ")}.`);
  const inflight = new Map();
  const got = await Promise.all(Object.keys(MEASURES).map(async (measure) => {
    const m = MEASURES[measure];
    try {
      const { r, link } = await readMeasure(session, measure, c, { want: 1 + (m.daily ? 380 : 13), inflight });
      const s = summary(r.rows);
      return { measure, row: [measure, s.latest.period, s.latest.value, s.year_ago?.value ?? null, link.quote ?? null, link.by, r.code], url: r.url, stale: staleSince(session, r.rows) };
    } catch (err) { return { measure, error: String(err?.message ?? err).slice(0, 200) }; }
  }));
  const ok = got.filter((g) => g.row);
  if (!ok.length) throw new NotFound(`No publisher answered for ${c.name}: ${got.map((g) => `${g.measure}: ${g.error}`).join("; ")}`);
  return {
    country: c.name, measure: "all",
    columns: ["measure", "period", "value", "year_ago", "quote", "publisher", "series"],
    rows: ok.map((g) => g.row),
    ...(ok.some((g) => g.stale) ? { stale: ok.filter((g) => g.stale).map((g) => `${g.measure}: latest ${g.stale}`) } : {}),
    ...(got.some((g) => g.error) ? { not_found: got.filter((g) => g.error).map((g) => `${g.measure}: ${g.error}`) } : {}),
    reading: "Each row is the latest figure from its own publisher, with the same period a year earlier. Ask for one measure (measure: \"inflation\", check: true) for its history and a second publisher's figure.",
    source: ok[0].url, sources: [...new Set(ok.map((g) => g.url))], limits: LIMITS,
  };
}
