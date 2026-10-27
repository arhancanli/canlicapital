// What executives are paid, against how the company did: the pay-versus-performance table every
// proxy statement has tagged in XBRL since 2023 (Item 402(v)): the CEO's reported pay and the pay
// actually earned, the other executives' averages, total shareholder return against the peer group,
// net income and the company's own chosen measure. One company from its proxy; the market from
// SEC's XBRL frames, with figures that fail a plausibility check held out.
import { z } from "zod";

import { archiveBase, filings, getJson, getText, NotFound, resolveEntity } from "./sources.mjs";
import { all, child, children, parseXml } from "./xml.mjs";

// Text of an element and everything inside it: a text fact such as a CEO's name can come wrapped in
// HTML (<span>Tim Cook</span>).
const deepText = (el) => (el.text + el.children.map(deepText).join(" ")).replace(/\s+/g, " ").trim();
const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const num = (s) => (s == null || s === "" || !Number.isFinite(Number(s)) ? null : Number(s));

const CONCEPTS = Object.freeze({
  PeoTotalCompAmt: "ceo_reported_pay", PeoActuallyPaidCompAmt: "ceo_pay_actually_paid", NonPeoNeoAvgTotalCompAmt: "other_executives_reported_avg",
  NonPeoNeoAvgCompActuallyPaidAmt: "other_executives_actually_paid_avg", TotalShareholderRtnAmt: "tsr_value_of_100", PeerGroupTotalShareholderRtnAmt: "peer_tsr_value_of_100",
  NetIncomeLoss: "net_income", CoSelectedMeasureAmt: "company_selected_measure",
});

// The proxy's XBRL instance, read into facts by fiscal year (and by individual when a year had two CEOs).
export function parsePayTable(xml) {
  const root = parseXml(xml);
  const doc = child(root, "xbrl") ?? root;
  const contexts = new Map();
  for (const c of children(doc, "context")) {
    const period = child(c, "period");
    const members = all(c, "explicitMember").map((m) => ({ axis: (m.attrs.dimension ?? "").replace(/^.*:/, ""), member: m.text.trim().replace(/^.*:/, "") }));
    contexts.set(c.attrs.id, { start: child(period, "startDate")?.text.trim() ?? null, end: (child(period, "endDate") ?? child(period, "instant"))?.text.trim() ?? null, members });
  }
  const years = new Map();
  let measureName = null;
  const names = new Map();
  for (const el of doc.children) {
    const ctx = contexts.get(el.attrs.contextRef);
    if (!ctx) continue;
    if (el.name === "CoSelectedMeasureName") measureName = measureName ?? (deepText(el) || null);
    const person = ctx.members.find((m) => m.axis === "IndividualAxis")?.member ?? null;
    if (el.name === "PeoName") {
      // Some filers also put other executives' names here, marked as non-CEO executives.
      if (ctx.members.some((m) => m.axis === "ExecutiveCategoryAxis" && m.member !== "PeoMember")) continue;
      const name = deepText(el);
      if (name) names.set(`${ctx.end}|${person ?? ""}`, name);
      continue;
    }
    const field = CONCEPTS[el.name];
    // Only the table's own facts: no dimensions other than the individual.
    if (!field || ctx.members.some((m) => m.axis !== "IndividualAxis")) continue;
    const key = `${ctx.end}|${person ?? ""}`;
    const row = years.get(key) ?? { year_end: ctx.end, year_start: ctx.start, individual: person };
    if (row[field] == null) row[field] = num(el.text);
    years.set(key, row);
  }
  // A name tagged for one person (Apple tags "Mr. Cook" under its CookMember) names that year's
  // table row when it is the only name tagged for the year.
  const sameYear = (end) => [...new Set([...names].filter(([k]) => k.startsWith(`${end}|`)).map(([, v]) => v))];
  const rows = [...years.values()].map((r) => ({ ...r, ceo: names.get(`${r.year_end}|${r.individual ?? ""}`) ?? names.get(`${r.year_end}|`) ?? (!r.individual && sameYear(r.year_end).length === 1 ? sameYear(r.year_end)[0] : null) }));
  rows.sort((a, b) => String(b.year_end).localeCompare(String(a.year_end)) || String(a.individual ?? "").localeCompare(String(b.individual ?? "")));
  return { rows, measure_name: measureName };
}

async function latestProxy(session, cik) {
  const { sub, rows } = await filings(session, cik, {});
  const proxies = rows.filter((r) => /^DEF 14A(\/A)?$/.test(r.form));
  for (const p of proxies.slice(0, 3)) {
    const dir = await getJson(session, `${archiveBase(cik, p.accessionNumber)}/index.json`);
    const inst = (dir?.directory?.item ?? []).find((i) => /_htm\.xml$/i.test(i.name));
    if (inst) return { sub, filing: p, url: `${archiveBase(cik, p.accessionNumber)}/${inst.name}` };
  }
  return { sub, filing: proxies[0] ?? null, url: null };
}

const FIELDS = ["year_end", "ceo", "ceo_reported_pay", "ceo_pay_actually_paid", "other_executives_reported_avg", "other_executives_actually_paid_avg", "tsr_value_of_100", "peer_tsr_value_of_100", "net_income", "company_selected_measure"];

export const payInput = z.object({
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name. Without it, every company that tagged a pay-versus-performance table for the year, ranked."),
  year: z.number().int().min(2021).max(2100).optional().describe("Across the market, the fiscal year (by calendar year); default last year."),
  rank_by: z.enum(["ceo_reported_pay", "ceo_pay_actually_paid", "tsr"]).optional().describe("Across the market: the CEO's reported pay (default), pay actually paid, or total shareholder return."),
  limit: z.number().int().min(1).max(100).optional().describe("Across the market, most companies to list; default 25."),
}).strict();

// Values tagged in thousands as dollars are the usual slip (a $3.78 million package filed as $3.78
// billion), and such a filing scales every column: when even the other executives' average is
// above SLIPPED_AVG the row is held out. A CEO figure above CONFIRM_PAY may be a real mega-grant
// (they exist), so it stays in, flagged to be confirmed in the filing.
export const SLIPPED_AVG = 100_000_000;
export const CONFIRM_PAY = 300_000_000;

export async function executivePay(session, args) {
  const a = payInput.parse(args);
  const limits = [
    "From the pay-versus-performance table each proxy statement tags in XBRL (Regulation S-K Item 402(v)), as filed; reported pay is the Summary Compensation Table total, and pay actually paid revalues equity awards at each year end, so it swings with the stock price and can be negative.",
    "Total shareholder return is the value of $100 invested at the start of the table's first year; the peer group is the company's own choice.",
    "Not investment advice.",
  ];
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    const { sub, filing, url } = await latestProxy(session, e.cik);
    if (!filing) throw new NotFound(`${sub.name} has filed no proxy statement (DEF 14A); smaller reporting companies and foreign private issuers often file none.`);
    if (!url) throw new NotFound(`${sub.name}'s latest proxy statements carry no XBRL pay-versus-performance table (required from fiscal years ending after December 15, 2022).`);
    const { rows, measure_name } = parsePayTable(await getText(session, url, { maxBytes: 16 * 1024 * 1024 }));
    if (!rows.length) throw new NotFound(`${sub.name}'s proxy XBRL (${filing.accessionNumber}) has no pay-versus-performance facts.`);
    const flagged = rows.filter((r) => (r.ceo_reported_pay ?? 0) > CONFIRM_PAY || (r.other_executives_reported_avg ?? 0) > SLIPPED_AVG);
    return {
      company: { cik: e.cik, name: sub.name, ticker: sub.tickers?.[0] ?? e.ticker ?? null },
      proxy: { filed: filing.filingDate, accession: filing.accessionNumber },
      company_selected_measure_name: measure_name,
      columns: [...FIELDS.slice(0, 2), ...(rows.some((r) => r.individual) ? ["individual"] : []), ...FIELDS.slice(2)],
      rows: rows.map((r) => [r.year_end, r.ceo, ...(rows.some((x) => x.individual) ? [r.individual] : []), ...FIELDS.slice(2).map((f) => r[f] ?? null)]),
      ...(flagged.length ? { check: `Unusually large pay in ${flagged.map((r) => r.year_end).join(", ")}: confirm against the filing's Summary Compensation Table; amounts filed in thousands but tagged as dollars are a common slip.` } : {}),
      source: url,
      limits,
    };
  }
  const year = a.year ?? new Date(session.now()).getUTCFullYear() - 1;
  const rankBy = a.rank_by ?? "ceo_reported_pay", limit = a.limit ?? 25;
  const frame = (tag) => getJson(session, `https://data.sec.gov/api/xbrl/frames/ecd/${tag}/USD/CY${year}.json`, { maxBytes: 16 * 1024 * 1024 }).catch((err) => { if (err instanceof NotFound) return { data: [] }; throw err; });
  const [peo, cap, neo, tsr] = await Promise.all(["PeoTotalCompAmt", "PeoActuallyPaidCompAmt", "NonPeoNeoAvgTotalCompAmt", "TotalShareholderRtnAmt"].map(frame));
  if (!peo.data?.length) throw new NotFound(`SEC's XBRL frames have no pay-versus-performance figures for ${year} yet.`);
  const by = (f) => new Map((f.data ?? []).map((r) => [r.cik, r]));
  const capBy = by(cap), neoBy = by(neo), tsrBy = by(tsr);
  const all = peo.data.map((r) => ({ cik: r.cik, name: r.entityName, end: r.end, accn: r.accn, ceo: r.val, cap: capBy.get(r.cik)?.val ?? null, neo: neoBy.get(r.cik)?.val ?? null, tsr: tsrBy.get(r.cik)?.val ?? null }));
  const implausible = (r) => (r.neo ?? 0) > SLIPPED_AVG || (r.neo == null && r.ceo > 1e9);
  const kept = all.filter((r) => !implausible(r)), held = all.filter(implausible);
  const key = { ceo_reported_pay: (r) => r.ceo, ceo_pay_actually_paid: (r) => r.cap, tsr: (r) => r.tsr }[rankBy];
  const ranked = kept.filter((r) => key(r) != null).sort((x, y) => key(y) - key(x));
  return {
    year, ranked_by: rankBy, companies: all.length,
    columns: ["company", "cik", "fiscal_year_end", "ceo_reported_pay", "ceo_pay_actually_paid", "other_executives_reported_avg", "tsr_value_of_100", "confirm", "proxy_accession"],
    rows: ranked.slice(0, limit).map((r) => [r.name, r.cik, r.end, r.ceo, r.cap, r.neo, r.tsr, r.ceo > CONFIRM_PAY ? "very large: confirm in the filing" : null, r.accn]),
    held_out: { reason: `The other executives' average is above $${SLIPPED_AVG / 1e6} million, so every column is most likely tagged in thousands as dollars; check each filing before using them.`, count: held.length, columns: ["company", "cik", "ceo_reported_pay", "other_executives_reported_avg", "proxy_accession"], rows: held.sort((x, y) => y.ceo - x.ceo).slice(0, 20).map((r) => [r.name, r.cik, r.ceo, r.neo, r.accn]) },
    source: `https://data.sec.gov/api/xbrl/frames/ecd/PeoTotalCompAmt/USD/CY${year}.json`,
    limits: [...limits, "SEC's frames give one figure per company for the calendar year closest to its fiscal year, so a company whose latest proxy is not yet filed, or whose fiscal year falls between two calendar years, may be missing."],
  };
}
