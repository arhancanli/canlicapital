// portfolio_rules: where a list of holdings stands against the US lines that bring a filing or cap concentration.
// More than 5% of a class (Schedule 13D or 13G), more than 10% (a Section 16 insider), $100 million in 13(f)
// securities (Form 13F), and the diversified-fund (75-5-10) and RIC tests; each position's share of its class from
// the company's last cover page and its days to exit from FINRA's average volume. The lines are the rules' own
// (their texts linked); the answer is a check against them, not compliance advice.
import { z } from "zod";

import { listedShareRatio } from "./listing.mjs";
import { averageDailyVolume, sharesOutstanding } from "./positioning.mjs";
import { fundTickers, NotFound, resolveEntity, submissions, tickerTable } from "./sources.mjs";
import { latestPrice } from "./tools.mjs";

const round = (x, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const pct = (x) => round(x == null ? null : x * 100, 2);
const sum = (xs) => xs.reduce((t, x) => t + x, 0);

export const rulesInput = z.object({
  holdings: z.array(z.object({
    symbol: z.string().min(1).max(20).describe("A US-listed ticker (AAPL, BRK.B) or a CIK."),
    shares: z.number().positive().describe("Shares held (depositary shares for an ADR)."),
    value: z.number().nonnegative().optional().describe("Market value in US dollars. Without it or price, the latest price is read where this server has prices."),
    price: z.number().positive().optional().describe("Price per share in US dollars, when value is not given."),
    fund: z.boolean().optional().describe("true for an ETF or other investment company: the diversification tests count it as qualifying at any size."),
  }).strict()).min(1).max(100).describe("The positions, one each."),
  cash: z.number().nonnegative().optional().describe("Cash, receivables and US Government securities in US dollars: part of total assets, and qualifying in the diversification tests."),
  participation: z.number().gt(0).max(1).optional().describe("The share of a day's volume you would sell into, for days to exit; default 0.2."),
}).strict();

const OWNERSHIP_LINES = [
  {
    over: 0.05, line: "more than 5% of a class: Schedule 13D or 13G", rule: "Exchange Act 13(d), Rule 13d-1", source: "https://www.law.cornell.edu/cfr/text/17/240.13d-1",
    then: "Schedule 13D within five business days of crossing; or the short Schedule 13G: within five business days for a passive holder (under 20%, no purpose of influencing control), within 45 days after the quarter's end for qualified institutions and exempt holders.",
  },
  {
    over: 0.1, line: "more than 10% of a class: a Section 16 insider", rule: "Exchange Act 16(a) and 16(b)", source: "https://www.law.cornell.edu/uscode/text/15/78p",
    then: "Form 3 within 10 days, then a Form 4 by the end of the second business day after each trade; the company can claim any profit from a purchase and a sale less than six months apart (16(b)).",
  },
];
const FORM_13F = {
  line: "$100 million in 13(f) securities on the last trading day of any month: Form 13F", rule: "Exchange Act 13(f), Rule 13f-1", source: "https://www.law.cornell.edu/cfr/text/17/240.13f-1",
  applies_to: "An institutional investment manager: any person other than a natural person investing for its own account, and anyone with investment discretion over another's account (Exchange Act 13(f)(6)(A)).",
  then: "Form 13F within 45 days after that year's end and after each of the next year's first three quarters.",
};

// One position: the company, its class on the cover page in listed shares, the value, and FINRA's volume.
async function position(session, h, { table, funds }, participation, notes) {
  const asked = h.symbol.trim();
  let who = null;
  try { who = await resolveEntity(session, asked); } catch (err) { if (!(err instanceof NotFound)) throw err; }
  if (who && !["ticker", "cik", "fund ticker"].includes(who.matched_by)) who = null;
  // An ETF or mutual fund is in the SEC's fund file under the trust that registers it, whose cover page (if any) is
  // not this fund's: it is its own issuer, with no share of class here.
  const inFundFile = who?.matched_by === "fund ticker" || (who?.ticker != null && funds.has(who.ticker));
  const fund = h.fund ?? inFundFile;
  const cik = who?.cik ?? null;
  const listings = cik && !inFundFile ? Object.values(table).filter((r) => r.cik_str === Number(cik)) : [];
  const ticker = who?.ticker ?? listings[0]?.ticker ?? null;
  const symbol = ticker ?? asked.toUpperCase();
  if (!cik) notes.unknown.push(symbol);
  if (listings.length > 1) notes.classes.push(symbol);
  let cover = null, listed = null;
  if (cik && inFundFile) notes.funds.push(symbol);
  else if (cik) {
    cover = await sharesOutstanding(session, cik);
    if (cover) {
      const sub = await submissions(session, cik).catch((err) => { if (err instanceof NotFound) return null; throw err; });
      const ratio = await listedShareRatio(session, cik, sub);
      if (ratio) listed = cover.shares / ratio.shares_per_listed_share;
    }
    if (!listed) notes.no_cover.push(symbol);
  }
  let value = h.value ?? (h.price ? h.price * h.shares : null);
  if (value == null && ticker) {
    try {
      const q = await latestPrice(session, { symbol: ticker });
      if (q.currency && q.currency !== "USD") throw new Error(`${ticker} is priced in ${q.currency}; give its value in US dollars.`);
      value = q.price * h.shares;
      notes.priced_from.add(q.source);
    } catch (err) { notes.unpriced_reason ??= err.message; }
  }
  if (value == null) notes.unpriced.push(symbol);
  let volume = null;
  if (ticker) {
    try { volume = await averageDailyVolume(session, ticker); } catch (err) { notes.volume_reason ??= err.message; }
  }
  return {
    symbol, name: who?.name ?? listings[0]?.title ?? null, cik, shares: h.shares, fund,
    share: listed ? h.shares / listed : null, class_shares: listed ? Math.round(listed) : null, class_as_of: cover?.as_of ?? null,
    value, volume, days: volume ? h.shares / (participation * volume.average_daily_volume) : null,
  };
}

// A test of the kind "at least `floor` of total assets is cash, funds, and issuers each at most 5% of assets and
// 10% of their class": true, false, or null when issuers whose class share is unknown decide it.
function qualifyingTest(issuers, total, cash, floor) {
  let sure = cash, unknown = 0;
  for (const i of issuers) {
    if (i.fund) sure += i.value;
    else if (i.value / total <= 0.05) {
      if (i.share == null) unknown += i.value;
      else if (i.share <= 0.1) sure += i.value;
    }
  }
  return { qualifying_pct: pct(sure / total), undecided_pct: unknown ? pct(unknown / total) : 0, passes: sure / total >= floor ? true : (sure + unknown) / total >= floor ? null : false };
}

export async function portfolioRules(session, args) {
  const a = rulesInput.parse(args);
  const participation = a.participation ?? 0.2, cash = a.cash ?? 0;
  const files = { table: await tickerTable(session), funds: await fundTickers(session).catch((err) => { if (err instanceof NotFound) return new Map(); throw err; }) };
  const notes = { unknown: [], classes: [], no_cover: [], funds: [], unpriced: [], priced_from: new Set(), unpriced_reason: null, volume_reason: null };
  const rows = [];
  // A few at a time: each position is a handful of SEC and FINRA reads, and SEC asks for at most ten a second.
  for (let i = 0; i < a.holdings.length; i += 3) rows.push(...(await Promise.all(a.holdings.slice(i, i + 3).map((h) => position(session, h, files, participation, notes)))));
  const priced = rows.every((r) => r.value != null);
  const invested = priced ? sum(rows.map((r) => r.value)) : null;
  const total = priced ? invested + cash : null;
  // One issuer may be held in several lines (two share classes): the asset tests are per issuer.
  const byIssuer = new Map();
  for (const r of rows) {
    const k = r.fund ? `fund ${r.symbol}` : r.cik ?? r.symbol, i = byIssuer.get(k) ?? { symbols: [], value: 0, share: 0, fund: true };
    i.symbols.push(r.symbol); i.value += r.value ?? 0; i.fund &&= r.fund;
    i.share = i.share == null || r.share == null ? null : Math.max(i.share, r.share);
    byIssuer.set(k, i);
  }
  const issuers = [...byIssuer.values()].sort((x, y) => y.value - x.value);
  let concentration = null, diversification = null;
  if (priced && invested > 0) {
    const w = issuers.map((i) => i.value / invested), hhi = sum(w.map((x) => x * x));
    concentration = {
      invested: round(invested, 2), cash: round(cash, 2), total_assets: round(total, 2), issuers: issuers.length,
      largest: { symbols: issuers[0].symbols, pct_of_invested: pct(w[0]) }, top_5_pct_of_invested: pct(sum(w.slice(0, 5))),
      hhi: round(hhi, 4), effective_positions: round(1 / hhi, 2),
    };
    const ric = qualifyingTest(issuers, total, cash, 0.5);
    const big = issuers.filter((i) => !i.fund && i.value / total > 0.25);
    diversification = {
      diversified_fund_75_5_10: {
        ...qualifyingTest(issuers, total, cash, 0.75),
        rule: "At least 75% of total assets in cash, Government securities, other investment companies, and issuers each at most 5% of total assets and 10% of their voting securities (Investment Company Act 5(b)(1)).",
        source: "https://www.law.cornell.edu/uscode/text/15/80a-5",
      },
      regulated_investment_company: {
        ...ric, over_25_pct: big.map((i) => i.symbols.join("/")), passes: ric.passes === false || big.length ? false : ric.passes,
        rule: "At each quarter's end, at least 50% of total assets qualifying as in the 75-5-10 test, and at most 25% in any one issuer other than Government securities and other RICs (Internal Revenue Code 851(b)(3)).",
        source: "https://www.law.cornell.edu/uscode/text/26/851",
      },
    };
  }
  const limits = [
    "A check against the published lines, not legal or compliance advice. Beneficial ownership also counts shares held through others whose voting or selling you share or control, and shares you can acquire within 60 days (options, convertibles), which a list of holdings cannot show.",
    "A position's share of its class divides the shares held by the company's last cover-page figure (date in class_as_of), counted in the listed shares (an ADR at its deposit ratio). A company that issues shares since then moves it.",
    `Days to exit: shares / (${participation} x FINRA's average daily volume in its latest short interest report).`,
    "The diversification tests use only these positions and cash; a fund applies them to all its assets at the times the rules set.",
  ];
  const caveats = [];
  if (notes.classes.length) caveats.push(`${notes.classes.join(", ")}: the company lists more than one class. The 5% and 10% lines are per class, and the cover-page figure used here may count every class together; check the class on the cover page.`);
  if (notes.unknown.length) caveats.push(`${notes.unknown.join(", ")}: not a ticker or CIK in the SEC's list, so no share of class.`);
  if (notes.funds.length) caveats.push(`${notes.funds.join(", ")}: a fund in the SEC's fund file, counted as qualifying in the diversification tests; its shares outstanding are not on a cover page, so no share of class.`);
  if (notes.no_cover.length) caveats.push(`${notes.no_cover.join(", ")}: no share count on a cover page in the SEC's data, so no share of class.`);
  if (notes.unpriced.length) caveats.push(`${notes.unpriced.join(", ")}: no value${notes.unpriced_reason ? ` (${notes.unpriced_reason})` : ""}. Give value or price for each position to get weights, the 13F line and the diversification tests.`);
  if (notes.volume_reason) caveats.push(`FINRA's volume could not be read for every position: ${notes.volume_reason}`);
  return {
    holdings: {
      columns: ["symbol", "name", "cik", "shares", "pct_of_class", "class_shares", "class_as_of", "value", "pct_of_total_assets", "average_daily_volume", "days_to_exit"],
      rows: rows.map((r) => [r.symbol, r.name, r.cik, r.shares, pct(r.share), r.class_shares, r.class_as_of, round(r.value, 2), priced && total > 0 ? pct(r.value / total) : null, r.volume?.average_daily_volume ?? null, round(r.days, 1)]),
    },
    lines: [
      ...OWNERSHIP_LINES.map((l) => ({ line: l.line, crossed_by: rows.filter((r) => r.share > l.over).map((r) => r.symbol), then: l.then, rule: l.rule, source: l.source })),
      { ...FORM_13F, value: priced ? round(invested, 2) : null, crossed: priced ? invested >= 1e8 : null },
    ],
    concentration,
    diversification,
    ...(caveats.length ? { caveats } : {}),
    ...(notes.priced_from.size ? { prices: [...notes.priced_from] } : {}),
    limits,
  };
}
