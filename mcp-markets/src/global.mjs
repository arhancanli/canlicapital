// The world economy and US public finance, from the publishers: the World Bank's World Development
// Indicators for every country and region, and the US Treasury's Fiscal Data (auctions, the debt).
// No key; every result names the URL it came from.
import { z } from "zod";

import { getJson, getText, NotFound, own } from "./sources.mjs";
import { matchWords, vocabulary } from "./words.mjs";

const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---------------------------------------------------------------------------------------------
// world_economy (World Bank World Development Indicators)
// ---------------------------------------------------------------------------------------------
// Common indicators by the words people use; any WDI code also works.
export const WDI_COMMON = Object.freeze([
  ["NY.GDP.MKTP.CD", "gdp nominal size economy output"],
  ["NY.GDP.MKTP.KD.ZG", "gdp growth real economic growth rate annual"],
  ["NY.GDP.PCAP.CD", "gdp per capita income per person"],
  ["NY.GDP.PCAP.PP.CD", "gdp per capita ppp purchasing power parity"],
  ["FP.CPI.TOTL.ZG", "inflation consumer prices cpi annual"],
  ["SL.UEM.TOTL.ZS", "unemployment rate jobless labor force"],
  ["SL.UEM.1524.ZS", "youth unemployment young people ages 15 24"],
  ["GC.DOD.TOTL.GD.ZS", "government debt public debt central government debt to gdp"],
  ["GC.NLD.TOTL.GD.ZS", "budget balance fiscal deficit surplus net lending borrowing to gdp"],
  ["GC.TAX.TOTL.GD.ZS", "tax revenue taxes to gdp"],
  ["BN.CAB.XOKA.GD.ZS", "current account balance to gdp"],
  ["NE.EXP.GNFS.ZS", "exports goods services to gdp trade"],
  ["NE.IMP.GNFS.ZS", "imports goods services to gdp trade"],
  ["BX.KLT.DINV.WD.GD.ZS", "foreign direct investment fdi inflows to gdp"],
  ["FI.RES.TOTL.CD", "foreign exchange reserves total reserves"],
  ["PA.NUS.FCRF", "exchange rate official local currency per us dollar"],
  ["FR.INR.LEND", "lending interest rate bank loans"],
  ["FR.INR.RINR", "real interest rate yield"],
  ["CM.MKT.LCAP.GD.ZS", "stock market capitalization listed companies to gdp"],
  ["NE.GDI.TOTL.ZS", "investment gross capital formation to gdp"],
  ["NY.GNS.ICTR.ZS", "savings gross savings to gdp"],
  ["SP.POP.TOTL", "population total people"],
  ["SP.POP.GROW", "population growth"],
  ["SI.POV.GINI", "gini inequality index income"],
  ["DT.DOD.DECT.CD", "external debt stocks total foreign"],
  ["NV.IND.MANF.ZS", "manufacturing value added share of gdp industry"],
  ["MS.MIL.XPND.GD.ZS", "military spending defense defence expenditure to gdp"],
  ["SP.DYN.LE00.IN", "life expectancy at birth"],
  ["BX.TRF.PWKR.DT.GD.ZS", "remittances personal received migrants to gdp"],
]);

// Names the World Bank spells differently from how people say them.
const COUNTRY_ALIASES = Object.freeze({
  us: "USA", "u.s.": "USA", america: "USA", "united states of america": "USA", uk: "GBR", britain: "GBR", "great britain": "GBR", england: "GBR",
  "euro area": "EMU", eurozone: "EMU", "euro zone": "EMU", eu: "EUU", world: "WLD", global: "WLD", oecd: "OED",
  "south korea": "KOR", korea: "KOR", russia: "RUS", iran: "IRN", egypt: "EGY", turkey: "TUR", turkiye: "TUR", vietnam: "VNM",
  "hong kong": "HKG", venezuela: "VEN", slovakia: "SVK", czechia: "CZE", "czech republic": "CZE", syria: "SYR", laos: "LAO",
  kyrgyzstan: "KGZ", yemen: "YEM", gambia: "GMB", bahamas: "BHS", congo: "COG", "dr congo": "COD", "democratic republic of the congo": "COD",
  macau: "MAC", macao: "MAC", "ivory coast": "CIV", micronesia: "FSM", "st. lucia": "LCA", "saint lucia": "LCA",
  "emerging markets": "LMY", "developing countries": "LMY", "high income": "HIC", "low income": "LIC", "middle income": "MIC",
});
const WB = "https://api.worldbank.org/v2";

// Countries are named separately, so "us" in a request is filler.
const WDI_WORDS = vocabulary({ filler: "us usa" });
export function resolveIndicator(q) {
  const s = String(q).trim();
  if (/^[A-Za-z0-9]+(\.[A-Za-z0-9]+)+$/.test(s)) return { id: s.toUpperCase() };
  const hit = matchWords(WDI_COMMON, (c) => c[1], s, WDI_WORDS);
  if (!hit) throw new NotFound(`No common indicator matches "${q}"; pass a World Bank indicator code (find it at data.worldbank.org). Common: ${WDI_COMMON.slice(0, 10).map((c) => c[0]).join(", ")}.`);
  return { id: hit[0], matched_from: s };
}

async function countryTable(session) {
  const d = await getJson(session, `${WB}/country?format=json&per_page=400`);
  return (d?.[1] ?? []).map((c) => ({ id: c.id, iso2: c.iso2Code, name: c.name, region: c.region?.value?.trim() || null, income: c.incomeLevel?.value?.trim() || null }));
}

// A country or region by ISO code, World Bank name or a common alias.
export function matchCountry(table, q) {
  const s = String(q).trim().toLowerCase().replace(/\s+/g, " ");
  const up = s.toUpperCase();
  const alias = own(COUNTRY_ALIASES, s);
  const hit = table.find((c) => c.id === (alias ?? up)) ?? table.find((c) => c.iso2 === up && up.length === 2)
    ?? table.find((c) => c.name.toLowerCase() === s) ?? table.find((c) => c.name.toLowerCase().split(",")[0].trim() === s)
    ?? table.find((c) => c.name.toLowerCase().startsWith(`${s},`) || c.name.toLowerCase().startsWith(`${s} `));
  if (!hit) throw new NotFound(`The World Bank has no country or region "${q}". Use an ISO code (US, DEU, JPN), a name ("Germany") or a region ("euro area", "world").${s === "taiwan" ? " Taiwan is not a World Bank member, so the World Bank publishes no figures for it." : ""}`);
  return hit;
}

export const worldInput = z.object({
  indicator: z.string().min(1).max(80).describe("Plain words (\"gdp growth\", \"inflation\", \"government debt\", \"current account\", \"unemployment\") or a World Bank indicator code (NY.GDP.MKTP.KD.ZG)."),
  countries: z.array(z.string().min(1).max(60)).min(1).max(20).describe("Countries or regions: names (\"Germany\", \"euro area\", \"world\") or ISO codes (US, DEU)."),
  start: z.number().int().min(1960).max(2100).optional().describe("First year; default ten years before end."),
  end: z.number().int().min(1960).max(2100).optional().describe("Last year; default this year (the latest year is often not yet published)."),
}).strict();

export async function worldEconomy(session, args) {
  const a = worldInput.parse(args);
  const { id, matched_from: matched } = resolveIndicator(a.indicator);
  const table = await countryTable(session);
  const picked = [...new Map(a.countries.map((q) => matchCountry(table, q)).map((c) => [c.id, c])).values()];
  const end = a.end ?? new Date(session.now()).getUTCFullYear();
  const start = a.start ?? end - 10;
  if (start > end) throw new Error("start is after end.");
  const codes = picked.map((c) => c.id).join(";");
  const [data, meta] = await Promise.all([
    getJson(session, `${WB}/country/${codes}/indicator/${encodeURIComponent(id)}?format=json&date=${start}:${end}&per_page=20000`),
    getJson(session, `${WB}/indicator/${encodeURIComponent(id)}?format=json`).catch(() => null),
  ]);
  if (!Array.isArray(data) || data[0]?.message) throw new NotFound(`The World Bank has no indicator ${id}${data?.[0]?.message?.[0]?.value ? ` (${data[0].message[0].value})` : ""}.`);
  const rows = (data[1] ?? []).filter((r) => r.value != null);
  if (!rows.length) throw new NotFound(`The World Bank publishes no ${id} values for ${picked.map((c) => c.name).join(", ")} between ${start} and ${end}.`);
  const years = [...new Set(rows.map((r) => Number(r.date)))].sort((x, y) => x - y);
  const by = new Map(rows.map((r) => [`${r.countryiso3code}|${r.date}`, r.value]));
  const info = meta?.[1]?.[0];
  const latest = picked.map((c) => { const r = rows.filter((x) => x.countryiso3code === c.id).sort((x, y) => Number(y.date) - Number(x.date))[0]; return [c.id, c.name, r ? Number(r.date) : null, r ? round(r.value, 6) : null]; });
  return {
    indicator: { id, name: info?.name ?? rows[0].indicator?.value ?? null, source: info?.source?.value ?? "World Development Indicators", ...(info?.sourceOrganization ? { compiled_from: info.sourceOrganization.replace(/\s+/g, " ").slice(0, 300) } : {}) },
    ...(matched ? { matched_from: matched } : {}),
    countries: { columns: ["id", "name", "region", "income_level"], rows: picked.map((c) => [c.id, c.name, c.region, c.income]) },
    latest: { columns: ["id", "name", "year", "value"], rows: latest },
    columns: ["year", ...picked.map((c) => c.id)],
    rows: years.map((y) => [y, ...picked.map((c) => { const v = by.get(`${c.id}|${y}`); return v == null ? null : round(v, 6); })]),
    source: `https://data.worldbank.org/indicator/${id}?locations=${picked.map((c) => c.iso2).join("-")}`,
    limits: [
      "World Bank World Development Indicators (CC BY 4.0) as published; past values are revised, and the latest year is missing for many countries until it is compiled.",
      "Regions and income groups (euro area, world, OECD members) are the World Bank's own aggregates.",
      "Not investment advice.",
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// treasury_auctions (US Treasury Fiscal Data)
// ---------------------------------------------------------------------------------------------
const FISCAL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const numOrNull = (s) => (s == null || s === "" || s === "null" || !Number.isFinite(Number(s)) ? null : Number(s));
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const isoDay = (session, back = 0) => new Date(session.now() - back * 86400000).toISOString().slice(0, 10);

// "10-year", "10 year note", "5-year tips", "2-year frn", "13-week bill", "bills", "bonds".
export function parseSecurity(q) {
  const s = String(q ?? "").toLowerCase();
  const out = {};
  const term = s.match(/(\d+)\s*-?\s*(week|wk|month|year|yr)s?/);
  if (term) out.term = `${Number(term[1])}-${/^w/.test(term[2]) ? "Week" : /^m/.test(term[2]) ? "Month" : "Year"}`;
  if (/\btips\b|inflation/.test(s)) out.tips = true;
  if (/\bfrns?\b|floating/.test(s)) out.frn = true;
  if (/\bbills?\b|\bcmbs?\b/.test(s) || out.term?.endsWith("Week")) out.type = "Bill";
  else if (/\bbonds?\b/.test(s)) out.type = "Bond";
  else if (/\bnotes?\b/.test(s)) out.type = "Note";
  if (!out.term && !out.type && !out.tips && !out.frn && s.trim()) throw new NotFound(`"${q}" names no Treasury security; try "10-year", "13-week bill", "30-year bond", "5-year TIPS" or "2-year FRN".`);
  return out;
}

export const auctionInput = z.object({
  security: z.string().max(40).optional().describe("Which securities: \"10-year\", \"2-year note\", \"30-year bond\", \"13-week bill\", \"5-year TIPS\", \"2-year FRN\", or a kind (\"bills\", \"notes\", \"bonds\", \"tips\"). Default: all."),
  upcoming: z.boolean().optional().describe("Announced auctions not yet held, soonest first, instead of results."),
  since: DATE.optional().describe("Results from this auction date; default 180 days ago."),
  until: DATE.optional().describe("Results up to this auction date; default today."),
  limit: z.number().int().min(1).max(100).optional().describe("Most auctions to list; default 12."),
}).strict();

function securityLabel(r) {
  const tips = r.inflation_index_security === "Yes", frn = r.floating_rate === "Yes";
  return `${r.security_term} ${r.security_type}${tips ? " TIPS" : ""}${frn ? " FRN" : ""}${r.cash_management_bill_cmb === "Yes" ? " (cash management)" : ""}${r.reopening === "Yes" ? " (reopening)" : ""}`;
}
// The rate an auction cleared at, by kind: bills at their investment (bond-equivalent) rate, FRNs
// at their discount margin, notes and bonds at their yield, TIPS at a real yield.
function clearing(r) {
  if (r.floating_rate === "Yes") return [numOrNull(r.high_discnt_margin), "discount margin over the 13-week bill rate, percent"];
  if (r.security_type === "Bill") return [numOrNull(r.high_investment_rate), "investment rate (bond-equivalent yield), percent"];
  return [numOrNull(r.high_yield), r.inflation_index_security === "Yes" ? "real yield, percent" : "yield, percent"];
}

export async function treasuryAuctions(session, args) {
  const a = auctionInput.parse(args);
  const sec = parseSecurity(a.security);
  const today = isoDay(session);
  const filters = [];
  if (a.upcoming) filters.push(`auction_date:gt:${today}`);
  else filters.push(`auction_date:gte:${a.since ?? isoDay(session, 180)}`, `auction_date:lte:${a.until ?? today}`);
  if (sec.type) filters.push(`security_type:eq:${sec.type}`);
  // A bill auction is usually a reopening of an older, longer bill, so bills match the term being
  // auctioned; notes and bonds match their original term, so a reopened 10-year is still a 10-year.
  if (sec.term) filters.push(sec.term.endsWith("Week") ? `security_term:eq:${sec.term}` : `original_security_term:eq:${sec.term}`);
  if (sec.tips) filters.push("inflation_index_security:eq:Yes");
  else if (sec.term && !sec.term.endsWith("Week") && !sec.frn) filters.push("inflation_index_security:eq:No");
  if (sec.frn) filters.push("floating_rate:eq:Yes");
  else if (sec.term && !sec.term.endsWith("Week") && !sec.tips) filters.push("floating_rate:eq:No");
  const limit = a.limit ?? 12;
  const url = `${FISCAL}/v1/accounting/od/auctions_query?filter=${filters.join(",")}&sort=${a.upcoming ? "" : "-"}auction_date&page[size]=${a.upcoming ? limit : Math.min(limit * 3, 300)}`;
  const d = await getJson(session, url);
  let rows = d?.data ?? [];
  const source = "https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/";
  const limits = ["US Treasury Fiscal Data (Bureau of the Fiscal Service) as published; results appear after each auction's press release.", "Bidder shares are of the competitive amount accepted (indirect bidders include foreign and international monetary authorities bidding through the Federal Reserve Bank of New York).", "Not investment advice."];
  if (a.upcoming) {
    if (!rows.length) throw new NotFound(`No ${a.security ?? ""} Treasury auctions are announced after ${today}; announcements come a few days to a week before each auction.`.replace(/\s+/g, " "));
    return {
      upcoming: true, as_of: today, count: rows.length,
      columns: ["auction_date", "security", "cusip", "offering", "announced", "issue_date", "maturity_date"],
      rows: rows.slice(0, limit).map((r) => [r.auction_date, securityLabel(r), r.cusip, numOrNull(r.offering_amt), r.announcemt_date, r.issue_date, r.maturity_date]),
      source, limits,
    };
  }
  rows = rows.filter((r) => numOrNull(r.total_accepted) != null);
  if (!rows.length) throw new NotFound(`No ${a.security ?? ""} Treasury auction results between ${a.since ?? isoDay(session, 180)} and ${a.until ?? today}.`.replace(/\s+/g, " "));
  const share = (r, k) => { const c = numOrNull(r.comp_accepted); const v = numOrNull(r[k]); return c && v != null ? round(v / c, 4) : null; };
  const kinds = new Set();
  const table = rows.slice(0, limit).map((r) => {
    const [rate, kind] = clearing(r);
    kinds.add(kind);
    const hm = numOrNull(r.high_yield) != null && numOrNull(r.avg_med_yield) != null ? round((Number(r.high_yield) - Number(r.avg_med_yield)) * 100, 1) : null;
    return [r.auction_date, securityLabel(r), r.cusip, rate, numOrNull(r.int_rate), numOrNull(r.bid_to_cover_ratio), numOrNull(r.offering_amt), numOrNull(r.total_accepted), share(r, "indirect_bidder_accepted"), share(r, "direct_bidder_accepted"), share(r, "primary_dealer_accepted"), hm];
  });
  const btc = table.map((t) => t[5]).filter((v) => v != null), ind = table.map((t) => t[8]).filter((v) => v != null);
  const mean = (xs) => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length, 4) : null);
  return {
    count: table.length, since: a.since ?? isoDay(session, 180), until: a.until ?? today,
    ...(kinds.size === 1 ? { rate_is: [...kinds][0] } : { rate_is: "per row: bills at the investment rate, FRNs at the discount margin, notes and bonds at the yield, TIPS at the real yield (percent)" }),
    columns: ["auction_date", "security", "cusip", "high_rate", "coupon", "bid_to_cover", "offering", "accepted", "indirect_share", "direct_share", "dealer_share", "high_minus_median_bp"],
    rows: table,
    ...(sec.term || sec.type ? { averages: { bid_to_cover: mean(btc), indirect_share: mean(ind), over_auctions: table.length } } : {}),
    source, limits,
  };
}

// ---------------------------------------------------------------------------------------------
// federal_debt (US Treasury Fiscal Data: Debt to the Penny, average interest rates)
// ---------------------------------------------------------------------------------------------
export const debtInput = z.object({
  start: DATE.optional().describe("First date; default one year ago."),
  end: DATE.optional().describe("Last date; default today."),
  frequency: z.enum(["daily", "monthly"]).optional().describe("daily, or monthly (the last reported day of each month); default daily up to two years, monthly beyond."),
}).strict();

export async function federalDebt(session, args) {
  const a = debtInput.parse(args);
  const end = a.end ?? isoDay(session), start = a.start ?? isoDay(session, 365);
  if (start > end) throw new Error("start is after end.");
  const monthly = a.frequency ? a.frequency === "monthly" : (Date.parse(end) - Date.parse(start)) / 86400000 > 731;
  const url = `${FISCAL}/v2/accounting/od/debt_to_penny?filter=record_date:gte:${start},record_date:lte:${end}&sort=record_date&page[size]=10000`;
  const [d, rates] = await Promise.all([
    getJson(session, url),
    getJson(session, `${FISCAL}/v2/accounting/od/avg_interest_rates?filter=record_date:lte:${end}&sort=-record_date&page[size]=40`),
  ]);
  let rows = (d?.data ?? []).map((r) => [r.record_date, numOrNull(r.tot_pub_debt_out_amt), numOrNull(r.debt_held_public_amt), numOrNull(r.intragov_hold_amt)]);
  if (!rows.length) throw new NotFound(`No Debt to the Penny records between ${start} and ${end} (published each business day since 1993).`);
  if (monthly) rows = rows.filter((r, i) => i === rows.length - 1 || rows[i + 1][0].slice(0, 7) !== r[0].slice(0, 7));
  const first = rows[0], last = rows[rows.length - 1];
  const month = rates?.data?.[0]?.record_date;
  const avg = (rates?.data ?? []).filter((r) => r.record_date === month).map((r) => [r.security_type_desc, r.security_desc, numOrNull(r.avg_interest_rate_amt)]);
  return {
    latest: { date: last[0], total: last[1], held_by_public: last[2], intragovernmental: last[3] },
    change: { from: first[0], to: last[0], total: round(last[1] - first[1], 2), total_pct: first[1] ? round(last[1] / first[1] - 1, 6) : null },
    frequency: monthly ? "monthly" : "daily", units: "US dollars",
    columns: ["date", "total", "held_by_public", "intragovernmental"],
    rows: rows.slice(-2000), ...(rows.length > 2000 ? { truncated_to_last: 2000 } : {}),
    ...(avg.length ? { average_interest_rates: { month: month, units: "percent a year", columns: ["type", "security", "rate"], rows: avg } } : {}),
    source: "https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/",
    limits: ["US Treasury Fiscal Data as published: total public debt outstanding each business day (debt held by the public plus intragovernmental holdings); average interest rates are monthly, on outstanding securities by type.", "Not investment advice."],
  };
}

// ---------------------------------------------------------------------------------------------
// economic_outlook (OECD Economic Outlook projections)
// ---------------------------------------------------------------------------------------------
const OECD = "https://sdmx.oecd.org/public/rest";
const EO_FLOW = "OECD.ECO.MAD,DSD_EO@DF_EO,";
// Euro-area members report harmonised indices: their inflation measures carry an H.
const HARMONISED = Object.freeze({ CPI_YTYPCT: "CPIH_YTYPCT", PCORE_YTYPCT: "PCOREH_YTYPCT" });
export const EO_MEASURES = Object.freeze([
  ["GDPV_ANNPCT", "gdp growth real economic growth", "Real GDP growth, percent"],
  ["CPI_YTYPCT", "inflation consumer prices cpi headline", "Consumer price inflation, percent"],
  ["PCORE_YTYPCT", "core inflation underlying", "Core inflation, percent"],
  ["UNR", "unemployment rate jobless", "Unemployment rate, percent of the labour force"],
  ["NLGQ", "budget balance fiscal deficit surplus government", "General government balance, percent of GDP"],
  ["GGFLQ", "government debt public debt gross", "General government gross debt, percent of GDP"],
  ["CBGDPR", "current account balance", "Current account balance, percent of GDP"],
  ["IRS", "short term interest rate policy rate money market", "Short-term interest rate, percent"],
  ["IRL", "long term interest rate bond yield 10 year", "Long-term interest rate, percent"],
]);
// The outlook's own codes for groups the World Bank names differently.
const EO_AREAS = Object.freeze({ EMU: "EA17", WLD: "W", OED: "OECD" });

const EO_WORDS = vocabulary();
export function eoMeasure(q) {
  const s = String(q).trim();
  const byCode = EO_MEASURES.find((m) => m[0] === s.toUpperCase());
  if (byCode) return byCode;
  const hit = matchWords(EO_MEASURES, (m) => m[1], s, EO_WORDS);
  if (!hit) throw new NotFound(`No OECD outlook measure matches "${q}". Use: ${EO_MEASURES.map((m) => m[1].split(" ").slice(0, 2).join(" ")).join(", ")}.`);
  return hit;
}

export const outlookInput = z.object({
  countries: z.array(z.string().min(1).max(60)).min(1).max(20).describe("Countries or groups: names (\"Germany\", \"euro area\", \"world\", \"OECD\") or ISO codes (US, JPN)."),
  measures: z.array(z.string().min(1).max(60)).min(1).max(9).optional().describe("What to project: \"gdp growth\", \"inflation\", \"core inflation\", \"unemployment\", \"budget balance\", \"government debt\", \"current account\", \"short term interest rate\", \"long term interest rate\". Default: GDP growth, inflation, unemployment."),
}).strict();

export async function economicOutlook(session, args) {
  const a = outlookInput.parse(args);
  const measures = [...new Map((a.measures ?? ["gdp growth", "inflation", "unemployment"]).map(eoMeasure).map((m) => [m[0], m])).values()];
  const table = await countryTable(session);
  const special = { "euro area": "EA17", eurozone: "EA17", world: "W", global: "W", oecd: "OECD" };
  const areas = [...new Set(a.countries.map((q) => own(special, q.trim().toLowerCase()) ?? (EO_AREAS[matchCountry(table, q).id] ?? matchCountry(table, q).id)))];
  const year = new Date(session.now()).getUTCFullYear();
  // No endPeriod: asking past the outlook's last year makes the OECD's server fail (HTTP 500) for
  // some groups of areas, and the outlook ends where its projections end anyway.
  const codes = [...new Set(measures.flatMap((m) => [m[0], ...(HARMONISED[m[0]] ? [HARMONISED[m[0]]] : [])]))];
  const url = `${OECD}/data/${EO_FLOW}/${areas.join("+")}.${codes.join("+")}.A?startPeriod=${year - 2}`;
  // One request at a time: the OECD's service answers overlapping requests from one client with HTTP 500.
  const csv = await getText(session, url, { headers: { Accept: "application/vnd.sdmx.data+csv; charset=utf-8" }, maxBytes: 4 * 1024 * 1024 });
  const flow = await getJson(session, `${OECD}/dataflow/OECD.ECO.MAD/DSD_EO@DF_EO/latest`, { headers: { Accept: "application/vnd.sdmx.structure+json" } }).catch(() => null);
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const col = (name) => head.indexOf(name);
  const obs = lines.slice(1).map((l) => l.split(",")).map((c) => ({ area: c[col("REF_AREA")], measure: c[col("MEASURE")], year: Number(c[col("TIME_PERIOD")]), value: Number(c[col("OBS_VALUE")]) })).filter((o) => Number.isFinite(o.value));
  if (!obs.length) throw new NotFound(`The OECD Economic Outlook has none of ${measures.map((m) => m[0]).join(", ")} for ${areas.join(", ")}; it covers OECD members, major partners (China, India, Brazil, Indonesia, South Africa and others), the euro area (EA17), the OECD and the world (W).`);
  const years = [...new Set(obs.map((o) => o.year))].sort((x, y) => x - y);
  const edition = flow?.data?.dataflows?.[0];
  const names = new Map(table.map((c) => [EO_AREAS[c.id] ?? c.id, c.name]));
  return {
    outlook: { name: edition?.name ?? "OECD Economic Outlook", dataflow: `DSD_EO@DF_EO ${edition?.version ?? ""}`.trim() },
    columns: ["area", "name", "measure", ...years.map(String)],
    rows: areas.flatMap((ar) => measures.map((m) => {
      // The CPI measure, or the harmonised one where the area reports only that (the euro area).
      const code = !obs.some((x) => x.area === ar && x.measure === m[0]) && HARMONISED[m[0]] && obs.some((x) => x.area === ar && x.measure === HARMONISED[m[0]]) ? HARMONISED[m[0]] : m[0];
      return [ar, ar === "W" ? "World" : ar === "EA17" ? "Euro area (17 countries)" : names.get(ar) ?? ar, code, ...years.map((y) => { const o = obs.find((x) => x.area === ar && x.measure === code && x.year === y); return o ? round(o.value, 4) : null; })];
    })),
    measures: Object.fromEntries(measures.flatMap((m) => [[m[0], m[2]], ...(HARMONISED[m[0]] ? [[HARMONISED[m[0]], `${m[2]} (harmonised index)`]] : [])])),
    note: `${year} and ${year + 1} are the OECD's projections in this edition; earlier years are its estimates of outcomes, which later editions revise.`,
    source: "https://data-explorer.oecd.org/",
    limits: ["OECD Economic Outlook projections as published (OECD data, CC BY 4.0); projections change with each edition (June and December).", "Not investment advice."],
  };
}
