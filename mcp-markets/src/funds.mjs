// What US mutual funds and ETFs hold, from their own SEC filings: Form N-PORT, filed monthly and
// made public for the last month of each fiscal quarter. Positions with values and weights, the
// fund's exposures, its monthly returns and the money that came in and went out.
import { z } from "zod";

import { getJson, getText, NotFound, tickerTable } from "./sources.mjs";
import { child, children, num, parseXml, textAt } from "./xml.mjs";

const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// N-PORT Part C codes (Form N-PORT General Instructions, items C.4 and C.5).
export const ASSET_CATEGORIES = Object.freeze({
  EC: "equity, common", EP: "equity, preferred", DBT: "debt", "ABS-MBS": "mortgage-backed security", "ABS-ASBS": "asset-backed security",
  "ABS-CBDO": "collateralized bond or debt obligation", "ABS-O": "other asset-backed security", STIV: "short-term investment vehicle (money market fund, cash sweep)",
  RA: "repurchase agreement", LON: "loan", DCO: "derivative, commodity", DCR: "derivative, credit", DE: "derivative, equity", DFE: "derivative, foreign exchange",
  DIR: "derivative, interest rate", DO: "derivative, other", SN: "structured note", RE: "real estate", COMM: "commodity", OTHER: "other",
});
export const ISSUER_CATEGORIES = Object.freeze({
  CORP: "corporate", UST: "US Treasury", USGA: "US government agency", USGSE: "US government-sponsored entity", MUN: "municipal",
  NUSS: "non-US sovereign", PF: "private fund", RF: "registered fund", OTHER: "other",
});

// Fund share classes by ticker, from SEC's mutual fund and ETF ticker table.
async function fundTable(session) {
  const d = await getJson(session, "https://www.sec.gov/files/company_tickers_mf.json", { maxBytes: 8 * 1024 * 1024 });
  const at = Object.fromEntries((d.fields ?? []).map((f, i) => [f, i]));
  return (d.data ?? []).map((r) => ({ cik: r[at.cik], series: r[at.seriesId], class: r[at.classId], ticker: r[at.symbol] }));
}

export async function resolveFund(session, query) {
  const q = String(query ?? "").trim().toUpperCase().replace(/^\$/, "");
  const rows = await fundTable(session);
  const hit = /^S\d{9}$/.test(q) ? rows.find((r) => r.series === q) ?? { series: q, cik: null, class: null, ticker: null }
    : /^C\d{9}$/.test(q) ? rows.find((r) => r.class === q) : rows.find((r) => r.ticker === q);
  if (hit) return hit;
  const listed = Object.values(await tickerTable(session)).find((r) => r.ticker === q.replace(/\./g, "-"));
  if (listed) throw new NotFound(`${q} (${listed.title}) files no Form N-PORT: unit investment trusts such as SPY and DIA, grantor trusts such as GLD, and operating companies are not registered funds that report holdings this way. For a manager's 13F holdings use fund_holdings.`);
  throw new NotFound(`No US mutual fund or ETF has the ticker ${q} in SEC's fund ticker table. Pass a fund ticker (VOO, IVV, AGG, FXAIX) or a series id (S000004310).`);
}

// A series' public N-PORT filings, newest first, from EDGAR's filing list for that series.
async function seriesFilings(session, series) {
  const xml = await getText(session, `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${series}&type=NPORT-P&dateb=&owner=include&count=12&output=atom`, { maxBytes: 2 * 1024 * 1024 });
  const out = [];
  for (const entry of xml.split(/<entry>/).slice(1)) {
    const get = (t) => entry.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null;
    const href = get("filing-href");
    if (get("filing-type") !== "NPORT-P" || !href) continue;
    out.push({ accession: get("accession-number"), filed: get("filing-date"), base: href.replace(/\/[^/]+-index\.html?$/, "") });
  }
  return out;
}

const MONTHS = (period) => {
  const [y, m] = period.split("-").map(Number);
  return [2, 1, 0].map((back) => { const d = new Date(Date.UTC(y, m - 1 - back, 1)); return d.toISOString().slice(0, 7); });
};

// The filing, read without building one tree for the whole document: a large bond fund's N-PORT
// runs to 16 MB and 13,000 positions, so each position is parsed on its own.
export function parseNport(xml) {
  const first = xml.indexOf("<invstOrSec>"), last = xml.lastIndexOf("</invstOrSec>");
  const head = parseXml(first < 0 ? xml : xml.slice(0, first) + xml.slice(last + "</invstOrSec>".length));
  const form = child(child(head, "edgarSubmission"), "formData") ?? child(head, "formData");
  if (!form) throw new Error("not an N-PORT filing");
  const gen = child(form, "genInfo"), fund = child(form, "fundInfo");
  const flows = ["mon1Flow", "mon2Flow", "mon3Flow"].map((k) => child(fund, k)?.attrs ?? {});
  const returns = children(child(child(fund, "returnInfo"), "monthlyTotReturns"), "monthlyTotReturn").map((r) => ({ class: r.attrs.classId ?? null, months: [num(r.attrs.rtn1), num(r.attrs.rtn2), num(r.attrs.rtn3)] }));
  const holdings = [];
  if (first >= 0) {
    for (const chunk of xml.slice(first, last + "</invstOrSec>".length).split("</invstOrSec>")) {
      const start = chunk.indexOf("<invstOrSec>");
      if (start < 0) continue;
      const h = child(parseXml(chunk.slice(start) + "</invstOrSec>"), "invstOrSec");
      const ids = child(h, "identifiers");
      const debt = child(h, "debtSec");
      holdings.push({
        name: textAt(h, "name"), title: textAt(h, "title"), cusip: textAt(h, "cusip"), lei: textAt(h, "lei"),
        isin: child(ids, "isin")?.attrs.value ?? null, ticker: child(ids, "ticker")?.attrs.value ?? null,
        balance: num(textAt(h, "balance")), units: textAt(h, "units"), currency: textAt(h, "curCd") ?? child(h, "currencyConditional")?.attrs.curCd ?? null,
        value: num(textAt(h, "valUSD")), pct: num(textAt(h, "pctVal")), payoff: textAt(h, "payoffProfile"),
        asset: textAt(h, "assetCat") ?? (child(h, "assetConditional") ? "OTHER" : null), issuer: textAt(h, "issuerCat") ?? (child(h, "issuerConditional") ? "OTHER" : null),
        country: textAt(h, "invCountry"), level: textAt(h, "fairValLevel"),
        ...(debt ? { maturity: textAt(debt, "maturityDt"), coupon: num(textAt(debt, "annualizedRt")), coupon_kind: textAt(debt, "couponKind"), defaulted: textAt(debt, "isDefault") === "Y" } : {}),
      });
    }
  }
  return {
    series: { name: textAt(gen, "seriesName"), id: textAt(gen, "seriesId") }, registrant: { name: textAt(gen, "regName"), cik: num(textAt(gen, "regCik")) },
    period: textAt(gen, "repPdDate"), fiscal_year_end: textAt(gen, "repPdEnd"),
    total_assets: num(textAt(fund, "totAssets")), total_liabilities: num(textAt(fund, "totLiabs")), net_assets: num(textAt(fund, "netAssets")),
    returns, flows: flows.map((f) => ({ sales: num(f.sales), reinvestment: num(f.reinvestment), redemption: num(f.redemption) })), holdings,
  };
}

async function loadNport(session, filing) {
  const url = `${filing.base}/primary_doc.xml`;
  return { url, ...parseNport(await getText(session, url, { maxBytes: 48 * 1024 * 1024 })) };
}

const weightBy = (holdings, key, labels) => {
  const by = new Map();
  for (const h of holdings) { const k = h[key] ?? "unknown"; by.set(k, (by.get(k) ?? 0) + (h.pct ?? 0)); }
  return [...by].sort((a, b) => b[1] - a[1]).map(([k, w]) => (labels ? [k, labels[k] ?? null, round(w / 100, 4)] : [k, round(w / 100, 4)]));
};

// A bond fund's coupon and maturity, weighted by each bond's share of net assets.
function bondProfile(holdings, period) {
  const bonds = holdings.filter((h) => h.maturity && h.pct != null && h.pct > 0);
  const w = bonds.reduce((s, h) => s + h.pct, 0);
  if (w < 20) return null;
  const years = (h) => (Date.parse(h.maturity) - Date.parse(period)) / (365.25 * 86400000);
  const buckets = [["under 1 year", 0, 1], ["1 to 3 years", 1, 3], ["3 to 5 years", 3, 5], ["5 to 10 years", 5, 10], ["10 to 20 years", 10, 20], ["20 years and over", 20, Infinity]];
  return {
    bonds: bonds.length, weight: round(w / 100, 4),
    weighted_coupon_pct: round(bonds.reduce((s, h) => s + (h.coupon ?? 0) * h.pct, 0) / w, 3),
    weighted_years_to_maturity: round(bonds.reduce((s, h) => s + Math.max(0, years(h)) * h.pct, 0) / w, 2),
    maturity: { columns: ["bucket", "weight"], rows: buckets.map(([name, lo, hi]) => [name, round(bonds.filter((h) => years(h) >= lo && years(h) < hi).reduce((s, h) => s + h.pct, 0) / 100, 4)]) },
    defaulted_weight: round(bonds.filter((h) => h.defaulted).reduce((s, h) => s + h.pct, 0) / 100, 4),
    note: "Years to final maturity, not duration; callable and amortizing bonds and mortgage pools pay back sooner.",
  };
}

const posKey = (h) => `${h.cusip && h.cusip !== "000000000" && h.cusip !== "N/A" ? h.cusip : h.isin ?? h.name}|${h.payoff ?? ""}`;

export const portfolioInput = z.object({
  fund: z.string().min(1).max(20).describe("A mutual fund or ETF ticker (VOO, IVV, QQQ, AGG, FXAIX, ARKK) or an SEC series id (S000004310)."),
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Report date, the last day of a fiscal quarter's last month (2026-06-30); default the latest public one."),
  top: z.number().int().min(1).max(500).optional().describe("Most positions to list, by value; default 25."),
  compare: z.boolean().optional().describe("Also compare with the previous public report; default true."),
}).strict();

export async function fundPortfolio(session, args) {
  const a = portfolioInput.parse(args);
  const f = await resolveFund(session, a.fund);
  const list = await seriesFilings(session, f.series);
  if (!list.length) throw new NotFound(`Series ${f.series}${f.ticker ? ` (${f.ticker})` : ""} has no public Form N-PORT on EDGAR; money market funds report on Form N-MFP instead, and a fund that has just launched has none yet.`);
  let i = 0, cur = await loadNport(session, list[0]);
  if (a.period) {
    while (cur.period !== a.period && ++i < list.length) cur = await loadNport(session, list[i]);
    if (cur.period !== a.period) throw new NotFound(`No public N-PORT for ${f.series} reports ${a.period}; the latest ${list.length} cover other quarters.`);
  }
  const top = a.top ?? 25;
  const hs = cur.holdings;
  const ranked = [...hs].sort((x, y) => Math.abs(y.value ?? 0) - Math.abs(x.value ?? 0));
  const months = MONTHS(cur.period);
  const ret = cur.returns.find((r) => r.class === f.class) ?? cur.returns[0];
  const out = {
    fund: { name: cur.series.name, ticker: f.ticker, series_id: cur.series.id ?? f.series, class_id: ret?.class ?? f.class, registrant: cur.registrant.name, registrant_cik: cur.registrant.cik },
    period: cur.period, filed: list[i].filed, accession: list[i].accession,
    net_assets: cur.net_assets, total_assets: cur.total_assets, positions: hs.length,
    weights_add_to: round(hs.reduce((s, h) => s + (h.pct ?? 0), 0) / 100, 4),
    columns: ["name", "title", "cusip", "isin", "value_usd", "weight", "asset_category", "issuer_category", "country", "payoff"],
    rows: ranked.slice(0, top).map((h) => [h.name, h.title, h.cusip, h.isin, h.value, round(h.pct / 100, 6), h.asset, h.issuer, h.country, h.payoff]),
    exposure: {
      asset_category: { columns: ["code", "meaning", "weight"], rows: weightBy(hs, "asset", ASSET_CATEGORIES) },
      issuer_category: { columns: ["code", "meaning", "weight"], rows: weightBy(hs, "issuer", ISSUER_CATEGORIES) },
      country: { columns: ["country", "weight"], rows: weightBy(hs, "country").slice(0, 15) },
      currency: { columns: ["currency", "weight"], rows: weightBy(hs, "currency").slice(0, 10) },
    },
    ...(bondProfile(hs, cur.period) ? { bonds: bondProfile(hs, cur.period) } : {}),
    ...(ret ? { monthly_returns: { class_id: ret.class, columns: ["month", "total_return"], rows: months.map((m, k) => [m, ret.months[k] == null ? null : round(ret.months[k] / 100, 6)]) } } : {}),
    flows: { units: "US dollars", columns: ["month", "sales", "reinvestment", "redemption", "net"], rows: months.map((m, k) => { const x = cur.flows[k]; return [m, x.sales, x.reinvestment, x.redemption, x.sales == null || x.redemption == null ? null : round(x.sales + (x.reinvestment ?? 0) - x.redemption, 2)]; }) },
  };
  if (a.compare !== false && list[i + 1]) {
    const prev = await loadNport(session, list[i + 1]);
    const before = new Map(prev.holdings.map((h) => [posKey(h), h])), now = new Map(hs.map((h) => [posKey(h), h]));
    const changes = [];
    for (const [k, h] of now) {
      const p = before.get(k);
      if (!p) changes.push(["new", h.name, h.cusip, 0, h.balance, h.value]);
      else if (h.balance !== p.balance) changes.push([h.balance > p.balance ? "added" : "reduced", h.name, h.cusip, p.balance, h.balance, h.value]);
    }
    for (const [k, p] of before) if (!now.has(k)) changes.push(["exited", p.name, p.cusip, p.balance, 0, 0]);
    const order = { new: 0, exited: 1, added: 2, reduced: 3 };
    changes.sort((x, y) => order[x[0]] - order[y[0]] || Math.abs(y[5] ?? 0) - Math.abs(x[5] ?? 0));
    out.changes_since = {
      period: prev.period, accession: list[i + 1].accession, columns: ["change", "name", "cusip", "balance_before", "balance_now", "value_now"],
      rows: changes.slice(0, Math.max(top, 25)), counts: Object.fromEntries(Object.keys(order).map((k) => [k, changes.filter((c) => c[0] === k).length])),
    };
  }
  out.source = `${list[i].base}/${list[i].accession}-index.htm`;
  out.limits = [
    "From the fund's Form N-PORT as filed with the SEC; funds file it monthly, and only the last month of each fiscal quarter is made public, 60 days after that month ends.",
    "Weights are percentages of net assets as filed; short positions and derivatives can make them add to more or less than 100 percent. Balances are shares, principal amounts or contracts, as each position's units say.",
    "Sales and redemptions are shares issued and redeemed in dollars (creations and redemptions for an ETF); monthly returns are the share class's total returns as filed.",
    "Not investment advice.",
  ];
  return out;
}

// ---------------------------------------------------------------------------------------------
// index_constituents: an index's members through an ETF that tracks it, from the ETF's N-PORT
// ---------------------------------------------------------------------------------------------
export const INDEX_ETFS = Object.freeze({
  "s&p 500": ["IVV", "S&P 500"], "sp 500": ["IVV", "S&P 500"], spx: ["IVV", "S&P 500"],
  "nasdaq 100": ["QQQ", "Nasdaq-100"], ndx: ["QQQ", "Nasdaq-100"],
  "russell 1000": ["IWB", "Russell 1000"], "russell 2000": ["IWM", "Russell 2000"], "russell 3000": ["IWV", "Russell 3000"],
  "s&p 400": ["IJH", "S&P MidCap 400"], "s&p midcap 400": ["IJH", "S&P MidCap 400"], "s&p 600": ["IJR", "S&P SmallCap 600"], "s&p smallcap 600": ["IJR", "S&P SmallCap 600"],
  "total market": ["VTI", "CRSP US Total Market"], "msci eafe": ["EFA", "MSCI EAFE"], "msci emerging markets": ["EEM", "MSCI Emerging Markets"],
  "msci world": ["URTH", "MSCI World"], "msci acwi": ["ACWI", "MSCI ACWI"], "aggregate bond": ["AGG", "Bloomberg US Aggregate Bond"],
});
const UIT_INDEXES = Object.freeze({ dow: "DIA", "dow jones": "DIA", djia: "DIA", "dow jones industrial average": "DIA" });

export const indexInput = z.object({
  index: z.string().min(1).max(60).describe("An index by name (\"S&P 500\", \"Nasdaq 100\", \"Russell 2000\", \"S&P 400\", \"MSCI EAFE\"), or the ticker of an ETF that tracks the index you want (VOO, IWM)."),
  limit: z.number().int().min(1).max(5000).optional().describe("Most members to list, by weight; default 50."),
}).strict();

export async function indexConstituents(session, args) {
  const a = indexInput.parse(args);
  const key = a.index.trim().toLowerCase().replace(/[-\s]+/g, " ").replace(/ index$/, "");
  if (UIT_INDEXES[key]) throw new NotFound(`The Dow's ETF (${UIT_INDEXES[key]}) is a unit investment trust, which files no N-PORT. The Dow's 30 members are listed by S&P Dow Jones Indices; screen_companies and company_profile cover each of them.`);
  const [etf, indexName] = INDEX_ETFS[key] ?? [a.index.trim().toUpperCase(), null];
  const f = await resolveFund(session, etf);
  const list = await seriesFilings(session, f.series);
  if (!list.length) throw new NotFound(`${etf} has no public N-PORT to read its holdings from.`);
  const cur = await loadNport(session, list[0]);
  const members = cur.holdings.filter((h) => (h.asset === "EC" || h.asset === "EP") && (h.pct ?? 0) > 0).sort((x, y) => y.pct - x.pct);
  if (!members.length) throw new NotFound(`${etf}'s latest N-PORT holds no stocks; for a bond index use fund_portfolio.`);
  const limit = a.limit ?? 50;
  const weight = members.reduce((s, h) => s + h.pct, 0);
  return {
    index: indexName ?? `the index ${etf} tracks`, through: { etf, fund: cur.series.name, series_id: cur.series.id },
    as_of: cur.period, filed: list[0].filed, members: members.length,
    stock_weight_of_fund: round(weight / 100, 4),
    top_10_weight: round(members.slice(0, 10).reduce((s, h) => s + h.pct, 0) / weight, 4),
    columns: ["name", "title", "cusip", "isin", "country", "weight_in_index"],
    rows: members.slice(0, limit).map((h) => [h.name, h.title, h.cusip, h.isin, h.country, round(h.pct / weight, 6)]),
    source: `${list[0].base}/${list[0].accession}-index.htm`,
    limits: [
      `Members and weights are ${etf}'s stock holdings in its latest public N-PORT (the last month of a fiscal quarter, made public 60 days later), rescaled to add to 1. An ETF that samples its index can hold fewer names or different weights than the index itself.`,
      "The index provider's own list is authoritative; members added or removed since the report date are not shown.",
      "Not investment advice.",
    ],
  };
}
