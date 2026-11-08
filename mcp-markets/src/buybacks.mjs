// Share buybacks, period by period, from the company's own XBRL (SEC company facts): the cash it paid,
// the shares it bought and the value it recorded for them, the average price, the program its board
// authorized and what remained of it, and how the share count moved. Every figure names the filing that
// first reported it; a figure the company does not tag is said to be untagged, never estimated.
import { z } from "zod";

import { factBook } from "./listing.mjs";
import { archiveBase, getJson, resolveEntity } from "./sources.mjs";

export const buybacksInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
  quarterly: z.boolean().optional().describe("Fiscal quarters instead of fiscal years; default false."),
  periods: z.number().int().min(1).max(40).optional().describe("Periods to show, newest first; default 10 years or 8 quarters."),
}).strict();

const ANNUAL = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const REPORTS = new Set([...ANNUAL, "10-Q", "10-Q/A"]);
// A report's own period is the latest one its cash flow statement (or income) covers: the year, or the
// year to date in a 10-Q. Its comparatives end earlier.
const SPINE = ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations", "NetIncomeLoss", "ProfitLoss"];
const CASH = ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"];
// The shares bought and the value recorded for them, in the pairs companies tag them: an average price
// takes both from one pair.
const BOUGHT = [
  ["StockRepurchasedDuringPeriodShares", "StockRepurchasedDuringPeriodValue"],
  ["StockRepurchasedAndRetiredDuringPeriodShares", "StockRepurchasedAndRetiredDuringPeriodValue"],
  ["TreasuryStockSharesAcquired", "TreasuryStockValueAcquiredCostMethod"],
];
// The program's size and what remained of it: amounts on a date, then the older tags, over a period.
const AUTHORIZED = ["StockRepurchaseProgramAuthorizedAmount1", "StockRepurchaseProgramAuthorizedAmount"];
const REMAINING = ["StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1", "StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount"];
const TREASURY = ["TreasuryStockCommonShares", "TreasuryStockShares"];
// Every tag read (scripts/capture-buybacks-fixtures.mjs keeps these).
export const BUYBACK_TAGS = [...SPINE, ...CASH, ...BOUGHT.flat(), ...AUTHORIZED, ...REMAINING, "CommonStockSharesOutstanding", "CommonStockSharesIssued", ...TREASURY];

const COLUMNS = ["period", "start", "end", "cash_spent", "shares_repurchased", "value_repurchased", "average_price", "authorized", "remaining_authorized", "shares_outstanding", "share_count_change", "share_count_change_pct", "filing", "from"];
const DAY = 86400000;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const shift = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const round = (x, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const byFiled = (a, b) => (a.filed === b.filed ? String(a.accn).localeCompare(String(b.accn)) : a.filed < b.filed ? -1 : 1);
const rowsOf = (f, tag, unit) => (f[tag]?.units?.[unit] ?? []).filter((r) => REPORTS.has(r.form) && r.accn && r.filed && r.end && Number.isFinite(r.val));

// Each report's own period: the latest end among its cash flow (or income) figures for a year (in a 10-K)
// or up to nine months (in a 10-Q), over the longest span ending then. One report a period, the first
// filed: an amendment repeats its original's.
function reportPeriods(f, unit) {
  const own = new Map();
  for (const tag of SPINE) for (const r of rowsOf(f, tag, unit)) {
    const annual = ANNUAL.has(r.form), span = r.start ? days(r.start, r.end) : 0;
    if (annual ? span < 350 || span > 380 : span < 60 || span > 300) continue;
    const p = own.get(r.accn);
    if (!p || r.end > p.end || (r.end === p.end && r.start < p.start)) own.set(r.accn, { start: r.start, end: r.end, accn: r.accn, filed: r.filed, fy: r.fy ?? null, fp: r.fp ?? null, annual });
  }
  const out = new Map();
  for (const p of [...own.values()].sort(byFiled)) if (!out.has(`${p.start} ${p.end}`)) out.set(`${p.start} ${p.end}`, p);
  return [...out.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
}

// A year's quarters from its reports: each report ends a quarter that starts the day after the one before
// (the first on the year's first day). One longer than 130 days spans a missing report and is left out.
function quarterPeriods(reports) {
  const years = new Map();
  for (const p of reports) years.set(p.start, [...(years.get(p.start) ?? []), p]);
  const out = [];
  for (const [start, list] of years) {
    list.sort((a, b) => (a.end < b.end ? -1 : 1)).forEach((p, i) => {
      const from = i ? shift(list[i - 1].end, 1) : start;
      const q = p.annual ? "Q4" : /^Q[1-3]$/.test(p.fp ?? "") ? p.fp : `Q${i + 1}`;
      if (days(from, p.end) <= 130) out.push({ ...p, start: from, yearStart: start, label: p.fy ? `${q} FY${p.fy}` : `${q} of the year from ${start}` });
    });
  }
  return out.sort((a, b) => (a.end < b.end ? 1 : -1));
}

// A tag's figure for exactly these dates as first reported, with a different later one.
function reported(rows, start, end) {
  const hits = rows.filter((r) => r.start === start && r.end === end).sort(byFiled);
  if (!hits.length) return null;
  const first = hits[0], last = hits.at(-1);
  return { val: first.val, accn: first.accn, ...(last.val !== first.val ? { later: { val: last.val, accn: last.accn } } : {}) };
}

// A stock split between two reports: the same date's share count as each gave it, apart by a whole or
// half factor (4 for a 4-for-1 split, 1.5 for 3-for-2, 0.1 for 1-for-10). 1 when they agree or share no date.
function splitBetween(f, later, earlier) {
  const near = (y) => Math.round(y * 2) / 2;
  for (const tag of ["CommonStockSharesOutstanding", "CommonStockSharesIssued"]) {
    const rows = rowsOf(f, tag, "shares").filter((r) => !r.start);
    const then = new Map(rows.filter((r) => r.accn === earlier && r.val > 0).map((r) => [r.end, r.val]));
    const both = rows.find((r) => r.accn === later && then.has(r.end));
    if (!both) continue;
    const x = both.val / then.get(both.end), k = x >= 1 ? near(x) : 1 / near(1 / x);
    return k > 0 && k !== 1 && Number.isFinite(k) && Math.abs(x / k - 1) < 0.01 ? k : 1;
  }
  return 1;
}

// A flow over a period: its own figure, or, for a quarter the reports give only year to date, the year
// to date at its end less the year to date the day before it starts (a count in the earlier report
// scaled by any split between the two). The first tag that has either.
function flow(f, tags, unit, start, end, yearStart) {
  for (const tag of tags) {
    const rows = rowsOf(f, tag, unit);
    const own = reported(rows, start, end);
    if (own) return { tag, ...own };
    if (start === yearStart) continue;
    const to = reported(rows, yearStart, end), before = reported(rows, yearStart, shift(start, -1));
    const k = to && before && unit === "shares" ? splitBetween(f, to.accn, before.accn) : 1;
    if (to && before) return { tag, val: to.val - before.val * k, accn: to.accn, less: before.accn, ...(k !== 1 ? { split: k } : {}) };
  }
  return null;
}

// The shares bought and the value recorded for them: the first pair tagging both for the period from the
// same filings (so they make an average price), else each from the first pair that tags it.
function bought(f, unit, start, end, yearStart) {
  const each = BOUGHT.map(([s, v]) => [flow(f, [s], "shares", start, end, yearStart), flow(f, [v], unit, start, end, yearStart)]);
  const both = each.find(([s, v]) => s && v && s.accn === v.accn && s.less === v.less);
  if (both) return { shares: both[0], value: both[1], paired: true };
  return { shares: each.find(([s]) => s)?.[0] ?? null, value: each.find(([, v]) => v)?.[1] ?? null, paired: false };
}

// A program amount: the latest the company tagged with a date inside the period (an amount on that date,
// or an older tag's period ending then), first reported.
function program(f, tags, unit, start, end) {
  for (const tag of tags) {
    const hits = rowsOf(f, tag, unit).filter((r) => r.end >= start && r.end <= end);
    if (!hits.length) continue;
    const on = hits.reduce((m, r) => (r.end > m ? r.end : m), "");
    const first = hits.filter((r) => r.end === on).sort(byFiled)[0];
    return { tag, val: first.val, accn: first.accn, on };
  }
  return null;
}

// Shares outstanding on a date, the given report's figure first: the count the company tags, or shares
// issued less those held in treasury (banks often tag only these).
const instantOn = (f, tag, date, accn) => { const hits = rowsOf(f, tag, "shares").filter((r) => !r.start && r.end === date).sort(byFiled); return hits.find((r) => r.accn === accn) ?? hits[0] ?? null; };
const outstandingOn = (f, date, accn) => { const r = instantOn(f, "CommonStockSharesOutstanding", date, accn); return r && { val: r.val, accn: r.accn, tag: "CommonStockSharesOutstanding" }; };
function netOfTreasuryOn(f, date, accn) {
  const issued = instantOn(f, "CommonStockSharesIssued", date, accn);
  for (const tag of issued ? TREASURY : []) {
    const held = instantOn(f, tag, date, issued.accn);
    if (held) return { val: issued.val - held.val, accn: issued.accn, tag: `CommonStockSharesIssued less ${tag}` };
  }
  return null;
}

// The count at the period's end against the day before it starts, both read the same way; a count from
// an earlier report is scaled by any split between the two.
function shareCount(f, start, end, accn) {
  const ways = [outstandingOn, netOfTreasuryOn].map((read) => [read(f, end, accn), read(f, shift(start, -1), accn)]);
  const [last, first] = ways.find(([e, s]) => e && s) ?? ways.find(([e]) => e) ?? [];
  if (!last) return null;
  const k = first && first.accn !== last.accn ? splitBetween(f, last.accn, first.accn) : 1;
  const change = first ? last.val - first.val * k : null;
  const elsewhere = first && (first.accn !== accn || last.accn !== accn);
  return { tag: last.tag, val: last.val, accn: last.accn, change, pct: first?.val ? round(change / (first.val * k)) : null, ...(elsewhere ? { less: first.accn } : {}), ...(k !== 1 ? { split: k } : {}) };
}

function rowFor(f, unit, p, yearStart) {
  const from = {}, used = {}, revised = [];
  const less = (x) => `${x.accn} less ${x.less}${x.split ? ` times ${x.split} (a stock split between the two)` : ""}`;
  const take = (name, x) => {
    if (!x) return null;
    used[name] = x.tag;
    if (x.less) from[name] = less(x);
    else if (x.on && x.on !== p.end) from[name] = `as of ${x.on}${x.accn === p.accn ? "" : ` in ${x.accn}`}`;
    else if (x.accn !== p.accn) from[name] = x.accn;
    if (x.later) revised.push([name, x.val, x.later.val, x.later.accn]);
    return x.val;
  };
  const cash = take("cash_spent", flow(f, CASH, unit, p.start, p.end, yearStart));
  const pair = bought(f, unit, p.start, p.end, yearStart);
  const shares = take("shares_repurchased", pair.shares), value = take("value_repurchased", pair.value);
  const authorized = take("authorized", program(f, AUTHORIZED, unit, p.start, p.end)), remaining = take("remaining_authorized", program(f, REMAINING, unit, p.start, p.end));
  const count = shareCount(f, p.start, p.end, p.accn);
  if (count) {
    used.shares_outstanding = count.tag;
    if (count.accn !== p.accn) from.shares_outstanding = count.accn;
    if (count.less) from.share_count_change = less(count);
  }
  const average = pair.paired && shares > 0 && value > 0 ? round(value / shares, 2) : null;
  // Figures from the same place share one entry: "cash_spent, shares_repurchased": "A less B".
  const where = new Map();
  for (const [k, s] of Object.entries(from)) where.set(s, [...(where.get(s) ?? []), k]);
  return {
    row: [p.label, p.start, p.end, cash, shares, value, average, authorized, remaining, count?.val ?? null, count?.change ?? null, count?.pct ?? null, p.accn, where.size ? Object.fromEntries([...where].map(([s, ks]) => [ks.join(", "), s])) : null],
    used, revised,
  };
}

// The latest period a company tagged one of these for, from the report that first gave it.
function lastTagged(f, tags, unit) {
  let best = null;
  for (const tag of tags) for (const r of rowsOf(f, tag, unit)) if (!best || r.end > best.end || (r.end === best.end && byFiled(r, best) < 0)) best = { ...r, tag };
  return best;
}

export async function buybacks(session, args) {
  const a = buybacksInput.parse(args);
  const e = await resolveEntity(session, a.company);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.cik).padStart(10, "0")}.json`;
  const cf = await getJson(session, url, { maxBytes: 96 * 1024 * 1024 });
  return buybacksFromFacts(cf, { entity: e, url, quarterly: a.quarterly === true, periods: a.periods });
}

// The answer from a companyfacts document (pure, for tests).
export function buybacksFromFacts(cf, { entity: e = {}, url = null, quarterly = false, periods } = {}) {
  const book = factBook(cf), f = book.facts, unit = book.currency;
  const name = cf?.entityName ?? e.name ?? "The company", cik = e.cik ?? cf?.cik ?? null;
  if (book.taxonomy === "ifrs-full") throw new Error(`${name} reports under IFRS; buybacks reads the US GAAP tags for repurchases. shareholder_returns gives what it paid for its own shares each year.`);
  if (![...CASH, ...BOUGHT.flat(), ...AUTHORIZED, ...REMAINING].some((t) => f[t])) throw new Error(`${name}${cik ? ` (CIK ${cik})` : ""} tags no share repurchases in its XBRL: no cash paid for them, no shares bought and no program amounts in its company facts. read_filing with find "repurchase" reads what its filings say.`);
  const reports = reportPeriods(f, unit);
  const list = quarterly ? quarterPeriods(reports) : reports.filter((p) => p.annual).map((p) => ({ ...p, yearStart: p.start, label: p.fy ? `FY${p.fy}` : `year ending ${p.end}` }));
  if (!list.length) throw new Error(quarterly ? `${name} has no quarterly reports in its XBRL (a foreign filer reports only yearly); ask for years.` : `${name} has no annual report in its XBRL.`);
  const built = list.slice(0, periods ?? (quarterly ? 8 : 10)).map((p) => rowFor(f, unit, p, p.yearStart));
  const rows = built.map((b) => b.row);
  // The fiscal year so far, when a quarterly report is newer than the last annual one.
  const now = reports[0];
  const ytd = !quarterly && now && !now.annual && now.end > rows[0][2] ? rowFor(f, unit, { ...now, label: now.fy && now.fp ? `${now.fp} FY${now.fy} year to date` : `year to date ending ${now.end}` }, now.start) : null;

  const col = (k) => COLUMNS.indexOf(k);
  // Each figure missing from a period shown: how many have it, and when the company last tagged it if the
  // newest period has none.
  const notTagged = [];
  for (const [k, tags, u, as] of [["cash_spent", CASH, unit], ["shares_repurchased", BOUGHT.map(([s]) => s), "shares"], ["value_repurchased", BOUGHT.map(([, v]) => v), unit], ["authorized", AUTHORIZED, unit, true], ["remaining_authorized", REMAINING, unit, true], ["shares_outstanding", ["CommonStockSharesOutstanding", "CommonStockSharesIssued"], "shares", true]]) {
    const have = rows.filter((r) => r[col(k)] != null).length;
    if (have === rows.length) continue;
    const last = rows[0][col(k)] == null ? lastTagged(f, tags, u) : null;
    const when = last ? `last tagged ${as ? "as of" : "for the period ending"} ${last.end} (${last.tag}, ${last.form} ${last.accn} filed ${last.filed})` : null;
    notTagged.push(`${k}: ${[have ? `tagged for ${have} of the ${rows.length} periods shown` : null, when ?? (have ? null : `never tagged (${tags.join(", ")})`)].filter(Boolean).join("; ")}.`);
  }
  if (rows.some((r) => r[col("shares_repurchased")] != null) && !rows.some((r) => r[col("average_price")] != null)) notTagged.push("average_price: no period shown has both the shares and the value recorded for them under one tag pair, so there is none. cash_spent is not divided by the shares: it can include shares withheld for taxes on stock awards and trades settled from an earlier period.");

  const tags = Object.fromEntries(["cash_spent", "shares_repurchased", "value_repurchased", "authorized", "remaining_authorized", "shares_outstanding"].map((k) => {
    const seen = [...new Set([...built, ...(ytd ? [ytd] : [])].map((b) => b.used[k]).filter(Boolean))];
    return [k, seen.length ? seen : null];
  }));
  const revised = [...built, ...(ytd ? [ytd] : [])].flatMap((b) => b.revised.map(([k, first, later, accn]) => [b.row[0], k, first, later, accn]));
  // Every filing a figure comes from, with its form and date from the facts themselves.
  const cited = new Set([...rows, ...(ytd ? [ytd.row] : [])].flatMap((r) => [r[col("filing")], ...Object.values(r[col("from")] ?? {}).flatMap((s) => s.match(/\d{10}-\d{2}-\d{6}/g) ?? [])]).concat(revised.map((r) => r[4])));
  const meta = new Map();
  for (const tag of BUYBACK_TAGS) for (const u of [unit, "shares"]) for (const r of rowsOf(f, tag, u)) if (cited.has(r.accn) && !meta.has(r.accn)) meta.set(r.accn, r);
  const ends = new Map(reports.map((p) => [p.accn, p.end]));
  const filings = [...cited].map((accn) => [accn, meta.get(accn)?.form ?? null, meta.get(accn)?.filed ?? null, ends.get(accn) ?? null, cik ? `${archiveBase(cik, accn)}/${accn}-index.htm` : null]).sort((x, y) => String(y[2]).localeCompare(String(x[2])));

  return {
    company: { cik, name, ticker: e.ticker ?? null, ...(unit !== "USD" ? { accounts: { standard: "US GAAP", currency: unit } } : {}) },
    basis: `fiscal ${quarterly ? "quarters" : "years"}, newest first, each figure as first reported`,
    columns: COLUMNS,
    rows,
    ...(ytd ? { year_to_date: Object.fromEntries(COLUMNS.map((c, i) => [c, ytd.row[i]])) } : {}),
    filings: { columns: ["accession", "form", "filed", "period_end", "url"], rows: filings },
    tags,
    ...(notTagged.length ? { not_tagged: notTagged } : {}),
    ...(revised.length ? { revised: { columns: ["period", "figure", "first_reported", "later", "later_filing"], rows: revised } } : {}),
    source: url,
    meaning: "cash_spent is what the cash flow statement says was paid to buy back common stock in the period. shares_repurchased and value_repurchased are the shares bought and the amount recorded for them; average_price is value_repurchased over shares_repurchased, given only when one tag pair has both for the period. authorized is the program's size as the company tagged it (for some, the total since the program began) and remaining_authorized what remained of it, each the latest it tagged with a date inside the period. shares_outstanding is the count at the period's end and share_count_change its change over the period (buybacks less new shares; pct is a fraction of the count at the start). filing is the report that first gave the period's figures; from names the figures taken elsewhere: \"A less B\" is a figure in A less one in B (a quarter the reports give only year to date, or a count at the start from an earlier report), \"as of\" a program amount's own date. year_to_date is the fiscal year so far, when a quarterly report is newer than the last annual one.",
    limits: [
      "Figures are what the company tagged, as first reported; a later report's different figure is listed under revised. SEC's company facts hold only standard tags with no breakdown, so a figure tagged by program, share class or equity component, in the company's own tags or only in its text is not here: untagged is not the same as no buyback. read_filing with find \"repurchase\" (or filing_tables with find \"share repurchases\") reads the filing itself.",
      "cash_spent can include shares withheld for taxes on employees' stock awards and trades settled after the period they were made in, so it can differ from value_repurchased; it is never used for average_price.",
      "Shares are often tagged rounded to millions, which makes average_price approximate to that rounding.",
      "share_count_change nets buybacks against shares issued for stock awards, options and deals, so it is not shares_repurchased; tags.shares_outstanding names how the count is read. Counts are as each report gave them, so a stock split shows as a step, and a quarter worked out across a split does not compare.",
      "Not investment advice.",
    ],
  };
}
