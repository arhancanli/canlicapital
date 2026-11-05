// fed_liquidity: the Federal Reserve's footprint in the money markets. From the New York Fed: the overnight reverse
// repo facility's daily take-up (cash money funds park at the Fed), the standing repo facility's lending (the backstop
// banks and dealers tap when funding is tight) and the Fed's securities holdings (SOMA) week by week, with the pace
// they change. From the Fed's weekly balance sheet (H.4.1, read from FRED): total assets, reserve balances, the
// Treasury's General Account and net liquidity, the assets less the TGA and the reverse repo facility. No key.
import { z } from "zod";

import { fredCsv, getJson } from "./sources.mjs";

const NYF = "https://markets.newyorkfed.org/api";
const OPERATIONS = (from, to) => `${NYF}/rp/results/search.json?startDate=${from}&endDate=${to}`;
const SOMA = `${NYF}/soma/summary.json`;
// The H.4.1's Wednesday levels (millions of dollars) and the facility's daily take-up (billions).
const SHEET = [["total_assets", "WALCL", 1e3], ["reserve_balances", "WRBWFRBL", 1e3], ["treasury_general_account", "WDTGAL", 1e3], ["reverse_repo", "RRPONTSYD", 1], ["discount_window", "WLCFLPCL", 1e3]];
const HOLDINGS = [["total", "total"], ["bills", "bills"], ["notes_and_bonds", "notesbonds"], ["tips", "tips"], ["frn", "frn"], ["mbs", "mbs"], ["cmbs", "cmbs"], ["agencies", "agencies"]];

export const liquidityInput = z.object({
  view: z.enum(["overview", "operations", "holdings", "balance_sheet"]).optional().describe("overview (default): the latest of each with its changes; operations: the reverse repo and standing repo facilities day by day; holdings: the Fed's securities week by week; balance_sheet: total assets, reserves, the TGA, the reverse repo and net liquidity week by week."),
  days: z.number().int().min(1).max(260).optional().describe("operations: business days shown, latest last; default 20."),
  weeks: z.number().int().min(1).max(520).optional().describe("holdings and balance_sheet: weeks shown, latest last; default 13."),
}).strict();

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const billions = (s) => { const n = Number(s); return s === "" || s == null || !Number.isFinite(n) ? null : n / 1e9; };
// Small amounts in millions: the facilities often take a few million dollars.
const usd = (x) => (Math.abs(x) < 1 ? `$${Math.round(x * 1000).toLocaleString("en-US")} million` : `$${round(x).toLocaleString("en-US")} billion`);
const LABELS = { bills: "Treasury bills", notes_and_bonds: "notes and bonds", tips: "TIPS", frn: "floating-rate notes", mbs: "mortgage-backed securities", cmbs: "commercial MBS", agencies: "agency debt" };
const moved = (x, up = "rose", down = "fell") => (x >= 0 ? `${up} ${usd(x)}` : `${down} ${usd(-x)}`);

// The facilities' operations, a day a row: the reverse repo's take-up, award rate and counterparties; the standing repo's
// lending (both daily operations) by collateral, and its minimum bid rate. Billions of dollars. The New York Fed's own
// small value exercises (test trades its note names) are kept apart, not counted as use.
export function operationsByDay(ops) {
  const days = new Map();
  for (const o of ops ?? []) {
    if (!o?.operationDate || (o.auctionStatus && o.auctionStatus !== "Results")) continue;
    const d = days.get(o.operationDate) ?? { date: o.operationDate, rrp: null, rrpRate: null, rrpCpty: null, srf: null, treasury: 0, agency: 0, mbs: 0, srfRate: null, terms: [], exercises: 0 };
    const amount = billions(o.totalAmtAccepted) ?? 0;
    days.set(o.operationDate, d);
    if (/small value exercise/i.test(o.note ?? "")) { d.exercises += amount; continue; }
    if (o.operationType === "Reverse Repo") {
      d.rrp = (d.rrp ?? 0) + amount;
      d.rrpRate = o.details?.[0]?.percentAwardRate ?? o.details?.[0]?.percentOfferingRate ?? d.rrpRate;
      d.rrpCpty = (d.rrpCpty ?? 0) + (Number(o.acceptedCpty) || 0);
    } else if (o.operationType === "Repo") {
      d.srf = (d.srf ?? 0) + amount;
      for (const x of o.details ?? []) {
        const k = /treasury/i.test(x.securityType) ? "treasury" : /agency/i.test(x.securityType) ? "agency" : /mortgage/i.test(x.securityType) ? "mbs" : null;
        if (k) d[k] += billions(x.amtAccepted) ?? 0;
        d.srfRate = x.percentOfferingRate ?? x.minimumBidRate ?? d.srfRate;
      }
      if (o.term && o.term !== "Overnight") d.terms.push(`${o.termCalenderDays ?? "?"} days`);
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// SOMA's weekly summary as rows of billions, oldest first.
export function somaWeeks(json) {
  return (json?.soma?.summary ?? []).map((r) => ({ week: r.asOfDate, ...Object.fromEntries(HOLDINGS.map(([k, f]) => [k, billions(r[f])])) })).filter((r) => r.week).sort((a, b) => a.week.localeCompare(b.week));
}

// The value at or before a date (a weekly series a week or a year back, a daily series on a Wednesday).
function at(rows, date, field = 1) {
  let best = null;
  for (const r of rows) { const d = Array.isArray(r) ? r[0] : r.week; if (d <= date) best = r; else break; }
  return best == null ? null : Array.isArray(best) ? best[field] : best;
}

async function readOperations(session, from, to) {
  return operationsByDay((await getJson(session, OPERATIONS(from, to)))?.repo?.operations);
}

// The balance sheet's Wednesdays, with net liquidity: total assets less the TGA and the reverse repo facility.
async function readSheet(session, start) {
  const got = await Promise.all(SHEET.map(([, id]) => fredCsv(session, id, { start })));
  const series = Object.fromEntries(SHEET.map(([k, , per], i) => [k, got[i].rows.filter(([, v]) => v != null).map(([d, v]) => [d, v / per])]));
  return series.total_assets.map(([week, assets]) => {
    const tga = at(series.treasury_general_account, week), rrp = at(series.reverse_repo, week), reserves = at(series.reserve_balances, week);
    return { week, total_assets: assets, reserve_balances: reserves, treasury_general_account: tga, reverse_repo: rrp, net_liquidity: tga == null || rrp == null ? null : assets - tga - rrp, discount_window: at(series.discount_window, week) };
  });
}

const changeOver = (rows, field, weeks) => {
  const last = rows.at(-1);
  const then = at(rows, isoDay(ms(last.week) - weeks * 7 * DAY));
  return then?.[field] == null || last[field] == null || then.week === last.week ? null : round(last[field] - then[field]);
};

const LIMITS = [
  "Net liquidity (the Fed's total assets less the Treasury's General Account and the reverse repo facility) is a market rule of thumb for the cash the Fed's balance sheet leaves with banks and markets, not a Fed measure; it is computed here from the H.4.1's Wednesday levels and the facility's take-up that day.",
  "SOMA holdings are at face value (TIPS without their inflation compensation, mortgage-backed securities at remaining principal); the H.4.1's total assets also count premiums, loans and other assets.",
  "Operations are the New York Fed's results as published after each operation; the standing repo facility lends at its minimum bid rate against Treasury, agency and mortgage-backed collateral.",
  "Not investment advice.",
];
const SOURCE = `${NYF}/rp/results/search.json and ${SOMA} (Federal Reserve Bank of New York); FRED series WALCL, WRBWFRBL, WDTGAL, WLCFLPCL (the Fed's H.4.1) and RRPONTSYD`;

export async function fedLiquidity(session, args) {
  const a = liquidityInput.parse(args);
  const view = a.view ?? "overview";
  const today = session.now();
  if (view === "operations") {
    const days = a.days ?? 20;
    const rows = (await readOperations(session, isoDay(today - (Math.ceil((days * 7) / 5) + 10) * DAY), isoDay(today))).slice(-days);
    return {
      unit: "billions of dollars",
      columns: ["date", "reverse_repo", "reverse_repo_rate_pct", "reverse_repo_counterparties", "standing_repo", "standing_repo_treasury", "standing_repo_agency", "standing_repo_mbs", "standing_repo_minimum_bid_pct", "small_value_exercises"],
      rows: rows.map((d) => [d.date, round(d.rrp, 3), d.rrpRate ?? null, d.rrpCpty, round(d.srf, 3), round(d.treasury, 3), round(d.agency, 3), round(d.mbs, 3), d.srfRate ?? null, round(d.exercises, 3)]),
      reading: "Each business day's overnight reverse repo take-up and the standing repo facility's lending across its morning and afternoon operations, in billions of dollars.",
      source: SOURCE, limits: LIMITS,
    };
  }
  const weeks = a.weeks ?? 13;
  if (view === "holdings") {
    const rows = somaWeeks(await getJson(session, SOMA)).slice(-weeks);
    return {
      unit: "billions of dollars", columns: ["week", ...HOLDINGS.map(([k]) => k)],
      rows: rows.map((r) => [r.week, ...HOLDINGS.map(([k]) => round(r[k]))]),
      reading: "The Fed's securities holdings (the System Open Market Account) each Wednesday, at face value, in billions of dollars.",
      source: SOURCE, limits: LIMITS,
    };
  }
  if (view === "balance_sheet") {
    const rows = (await readSheet(session, isoDay(today - (weeks * 7 + 14) * DAY))).slice(-weeks);
    const keys = ["total_assets", "reserve_balances", "treasury_general_account", "reverse_repo", "net_liquidity", "discount_window"];
    return {
      unit: "billions of dollars", columns: ["week", ...keys],
      rows: rows.map((r) => [r.week, ...keys.map((k) => round(r[k]))]),
      reading: "The Fed's balance sheet each Wednesday (H.4.1): total assets, reserve balances, the Treasury's General Account, the reverse repo facility's take-up, net liquidity and the discount window's primary credit to banks, in billions of dollars.",
      source: SOURCE, limits: LIMITS,
    };
  }
  // The overview: each piece read at once; one that fails is said, the rest stand.
  const [recent, yearAgo, soma, sheet] = await Promise.allSettled([
    readOperations(session, isoDay(today - 45 * DAY), isoDay(today)),
    readOperations(session, isoDay(today - 372 * DAY), isoDay(today - 358 * DAY)),
    getJson(session, SOMA).then(somaWeeks),
    readSheet(session, isoDay(today - 400 * DAY)),
  ]);
  const out = { summary: [] }, failed = [];
  if (recent.status === "fulfilled" && recent.value.length) {
    const days = recent.value, rrpDays = days.filter((d) => d.rrp != null), srfDays = days.filter((d) => d.srf != null).slice(-20);
    const last = rrpDays.at(-1), before = rrpDays.at(-2), window = rrpDays.slice(-20);
    const then = yearAgo.status === "fulfilled" ? yearAgo.value.filter((d) => d.rrp != null && d.date <= isoDay(today - 365 * DAY)).at(-1) ?? null : null;
    if (last) {
      out.reverse_repo = {
        date: last.date, billions: round(last.rrp, 3), rate_pct: last.rrpRate ?? null, counterparties: last.rrpCpty,
        previous_day_billions: before ? round(before.rrp, 3) : null, average_20_days_billions: round(window.reduce((s, d) => s + d.rrp, 0) / window.length, 3),
        year_ago: then ? { date: then.date, billions: round(then.rrp, 3) } : null,
      };
      out.summary.push(`The overnight reverse repo facility took ${usd(last.rrp)} on ${last.date} at ${last.rrpRate}% from ${last.rrpCpty} counterpart${last.rrpCpty === 1 ? "y" : "ies"}${then ? `, against ${usd(then.rrp)} a year earlier (${then.date})` : ""}.`);
    }
    const lent = srfDays.at(-1);
    if (lent) {
      const used = srfDays.filter((d) => d.srf >= 0.0005), largest = [...used].sort((x, y) => y.srf - x.srf)[0];
      out.standing_repo = {
        date: lent.date, billions: round(lent.srf, 3), minimum_bid_rate_pct: lent.srfRate ?? null, days_used: used.length, of_days: srfDays.length,
        largest: largest ? { date: largest.date, billions: round(largest.srf, 3) } : null,
        ...(srfDays.some((d) => d.terms.length) ? { term_operations: srfDays.filter((d) => d.terms.length).map((d) => ({ date: d.date, terms: d.terms })) } : {}),
        ...(days.some((d) => d.exercises) ? { small_value_exercises: days.filter((d) => d.exercises).map((d) => ({ date: d.date, billions: round(d.exercises, 3) })) } : {}),
      };
      out.summary.push(`The standing repo facility lent ${lent.srf >= 0.0005 ? usd(lent.srf) : "nothing"} on ${lent.date} (minimum bid ${lent.srfRate}%); it lent on ${used.length} of the last ${srfDays.length} business days${largest ? `, the most ${usd(largest.srf)} on ${largest.date}` : ""}.`);
    }
  } else failed.push(`the New York Fed's operations (${recent.reason?.message ?? "none returned"})`);
  if (soma.status === "fulfilled" && soma.value.length) {
    const rows = soma.value, last = rows.at(-1);
    const thirteen = changeOver(rows, "total", 13);
    out.holdings = {
      week: last.week, unit: "billions of dollars",
      columns: ["holding", "billions", "change_on_week", "change_4_weeks", "change_13_weeks", "change_on_year"],
      rows: HOLDINGS.map(([k]) => [k, round(last[k]), changeOver(rows, k, 1), changeOver(rows, k, 4), changeOver(rows, k, 13), changeOver(rows, k, 52)]),
      per_month_13_weeks: thirteen == null ? null : round((thirteen * 30.44) / 91),
    };
    const parts = HOLDINGS.slice(1).map(([k]) => [LABELS[k], changeOver(rows, k, 13)]).filter(([, v]) => v != null && Math.abs(v) >= 0.5).map(([k, v]) => `${k} ${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US")} billion`);
    if (thirteen != null) out.summary.push(`The Fed held ${usd(last.total)} of securities on ${last.week}; over 13 weeks its holdings ${moved(thirteen)} (about ${usd(Math.abs(out.holdings.per_month_13_weeks))} a month${parts.length ? `: ${parts.join(", ")}` : ""}).`);
  } else failed.push(`the New York Fed's SOMA holdings (${soma.reason?.message ?? "none returned"})`);
  if (sheet.status === "fulfilled" && sheet.value.length) {
    const rows = sheet.value, last = rows.at(-1);
    const keys = ["total_assets", "reserve_balances", "treasury_general_account", "reverse_repo", "net_liquidity", "discount_window"];
    out.balance_sheet = {
      week: last.week, unit: "billions of dollars",
      columns: ["line", "billions", "change_on_week", "change_4_weeks", "change_on_year"],
      rows: keys.map((k) => [k, round(last[k]), changeOver(rows, k, 1), changeOver(rows, k, 4), changeOver(rows, k, 52)]),
    };
    const four = changeOver(rows, "net_liquidity", 4);
    if (last.net_liquidity != null) out.summary.push(`Net liquidity (total assets less the TGA and the reverse repo facility) was ${usd(last.net_liquidity)} on ${last.week}${four == null ? "" : `, ${four >= 0 ? "up" : "down"} ${usd(Math.abs(four))} in four weeks`}; reserve balances were ${usd(last.reserve_balances)} and the TGA ${usd(last.treasury_general_account)}${last.discount_window == null ? "" : `; banks owed ${usd(last.discount_window)} at the discount window`}.`);
  } else failed.push(`the Fed's weekly balance sheet from FRED (${sheet.reason?.message ?? "none returned"})`);
  if (!out.reverse_repo && !out.standing_repo && !out.holdings && !out.balance_sheet) throw new Error(`No part of the Fed's liquidity could be read: ${failed.join("; ")}.`);
  return {
    ...out,
    reading: "The latest day's reverse repo and standing repo operations, the Fed's securities at the latest Wednesday with their changes, and its balance sheet with net liquidity, in billions of dollars.",
    source: SOURCE,
    limits: [...(failed.length ? [`Not read this time: ${failed.join("; ")}.`] : []), ...LIMITS],
  };
}
