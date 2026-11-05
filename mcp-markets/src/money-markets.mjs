// money_markets: the US money markets' plumbing in one answer, with no key: overnight repo by segment (SOFR, TGCR and
// BGCR from the New York Fed; tri-party without the Fed, GCF and cleared bilateral DVP from the OFR's U.S. Repo Markets
// release), each rate with its volume, beside the Fed's own rates (interest on reserves, the overnight reverse repo);
// what US money market funds hold, by type and by repo counterparty, from the OFR's Money Market Fund Monitor (SEC Form
// N-MFP); and primary dealers' net positions in Treasuries by maturity, from the New York Fed's weekly statistics.
import { z } from "zod";

import { fredCsv, getJson, NotFound } from "./sources.mjs";

const OFR = (mnemonics, start) => `https://data.financialresearch.gov/v1/series/multifull?mnemonics=${mnemonics.join(",")}&start_date=${start}`;
const PD = (key) => `https://markets.newyorkfed.org/api/pd/get/SBN2024/timeseries/${key}.json`;
const PAGES = {
  repo: "https://www.financialresearch.gov/short-term-funding-monitor/datasets/repo/",
  funds: "https://www.financialresearch.gov/money-market-funds/",
  dealers: "https://www.newyorkfed.org/markets/counterparties/primary-dealers-statistics",
};

// Overnight repo: each segment's rate and the volume behind it.
const REPO = [
  ["sofr", "FNYR-SOFR-A", "FNYR-SOFR_UV-A", "SOFR: overnight repo backed by Treasuries, tri-party and cleared (New York Fed)"],
  ["tgcr", "FNYR-TGCR-A", "FNYR-TGCR_UV-A", "TGCR: tri-party general collateral repo (New York Fed)"],
  ["bgcr", "FNYR-BGCR-A", "FNYR-BGCR_UV-A", "BGCR: tri-party and GCF general collateral repo (New York Fed)"],
  ["tri_party", "REPO-TRIV1_AR_OO-P", "REPO-TRIV1_TV_OO-P", "tri-party repo without the Fed's own trades, overnight and open (OFR, preliminary)"],
  ["gcf", "REPO-GCF_AR_OO-P", "REPO-GCF_TV_OO-P", "FICC's GCF repo, overnight and open (OFR, preliminary)"],
  ["dvp", "REPO-DVP_AR_OO-P", "REPO-DVP_TV_OO-P", "FICC's cleared bilateral (DVP) repo, overnight and open (OFR, preliminary)"],
];
// What money market funds hold (the parts add up to the total), and whom their repo is with (adding up to repo).
const FUNDS = [
  ["treasuries", "MMF-MMF_T_TOT-M", "US Treasury securities"],
  ["repo", "MMF-MMF_RP_TOT-M", "repurchase agreements"],
  ["agency", "MMF-MMF_AG_TOT-M", "federal agency and GSE securities"],
  ["bank_related", "MMF-MMF_BRA_TOT-M", "bank-related assets: financial commercial paper, certificates of deposit, other deposits"],
  ["other", "MMF-MMF_OA_TOT-M", "other assets: municipal securities, commercial paper, asset-backed securities"],
];
const COUNTERPARTIES = [
  ["federal_reserve", "MMF-MMF_RP_wFR-M", "the Federal Reserve (its overnight reverse repo)"],
  ["ficc", "MMF-MMF_RP_wFICC-M", "cleared by FICC (sponsored repo)"],
  ["us_financial", "MMF-MMF_RP_wDFI-M", "US financial institutions"],
  ["foreign_financial", "MMF-MMF_RP_wFFI-M", "foreign financial institutions"],
  ["other", "MMF-MMF_RP_wOCP-M", "other counterparties"],
];
const FUNDS_TOTAL = "MMF-MMF_TOT-M";
// Primary dealers' net positions (long less short) in Treasuries excluding TIPS, by maturity as published.
const DEALERS = [
  ["total", "PDPOSGST-TOT", "all Treasuries excluding TIPS"],
  ["bills", "PDPOSGS-B", "bills"],
  ["floating_rate_notes", "PDPOSGS-BFRN", "floating rate notes"],
  ["coupons_2y_or_less", "PDPOSGSC-L2", "coupons due in 2 years or less"],
  ["coupons_2_to_3y", "PDPOSGSC-G2L3", "coupons due in 2 to 3 years"],
  ["coupons_3_to_6y", "PDPOSGSC-G3L6", "coupons due in 3 to 6 years"],
  ["coupons_6_to_7y", "PDPOSGSC-G6L7", "coupons due in 6 to 7 years"],
  ["coupons_7_to_11y", "PDPOSGSC-G7L11", "coupons due in 7 to 11 years"],
  ["coupons_11_to_21y", "PDPOSGSC-G11L21", "coupons due in 11 to 21 years"],
  ["coupons_over_21y", "PDPOSGSC-G21", "coupons due in more than 21 years"],
];

export const moneyInput = z.object({
  part: z.enum(["repo", "money_funds", "dealers"]).optional().describe("One part with its history: repo (each segment's rate and volume day by day, against the Fed's rates), money_funds (what US money market funds hold, month by month) or dealers (primary dealers' net Treasury positions, week by week). Default: all three, latest."),
  periods: z.number().int().min(1).max(260).optional().describe("part: observations shown, latest last; default 20 for repo, 13 for money_funds and dealers."),
}).strict();

const DAY = 86400000;
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const bp = (a, b) => (a == null || b == null ? null : Math.round((a - b) * 100));
const billions = (x) => (x == null ? null : round(x / 1e9, 1));
const signed = (x) => (x > 0 ? `+${x}` : `${x}`);
const pctText = (x) => `${Number(x).toFixed(2)}%`;
// An amount in billions said as trillions from a thousand billion up.
const money = (b) => (b == null ? null : Math.abs(b) >= 1000 ? `$${(b / 1000).toFixed(2)} trillion` : `$${b.toLocaleString("en-US")} billion`);

// The OFR's series as maps of date to value, every observation kept (a missing one is a day without trading or held back
// for confidentiality, the OFR says).
async function ofr(session, mnemonics, start) {
  const d = await getJson(session, OFR(mnemonics, start), { timeoutMs: 30000 });
  return Object.fromEntries(mnemonics.map((m) => [m, new Map((d?.[m]?.timeseries?.aggregation ?? []).filter(([, v]) => v != null && Number.isFinite(v)))]));
}
const lastOf = (map) => [...map].at(-1) ?? null;
// The value on or before a date, from an observation within the slack (so a missing day does not borrow a stale one).
const onOrBefore = (map, date, slack = 7) => { const keys = [...map.keys()].filter((d) => d <= date); const k = keys.at(-1); return k && Date.parse(k) >= Date.parse(date) - slack * DAY ? map.get(k) : null; };
const back = (date, days) => new Date(Date.parse(date) - days * DAY).toISOString().slice(0, 10);

async function readRepo(session) {
  const start = back(new Date(session.now()).toISOString().slice(0, 10), 400);
  const [series, iorb, rrp] = await Promise.all([
    ofr(session, REPO.flatMap(([, rate, volume]) => [rate, volume]), start),
    fredCsv(session, "IORB", { start }).then((s) => new Map(s.rows.filter(([, v]) => v != null)), () => new Map()),
    fredCsv(session, "RRPONTSYAWARD", { start }).then((s) => new Map(s.rows.filter(([, v]) => v != null)), () => new Map()),
  ]);
  return { series, iorb, rrp };
}

async function readFunds(session) {
  return ofr(session, [FUNDS_TOTAL, ...FUNDS.map((f) => f[1]), ...COUNTERPARTIES.map((c) => c[1])], back(new Date(session.now()).toISOString().slice(0, 10), 800));
}

async function readDealers(session) {
  const got = await Promise.all(DEALERS.map(([, key]) => getJson(session, PD(key)).then((d) => new Map((d?.pd?.timeseries ?? []).filter((x) => /^-?\d+(\.\d+)?$/.test(String(x.value).trim())).map((x) => [x.asofdate, Number(x.value)])), () => new Map())));
  return Object.fromEntries(DEALERS.map(([k], i) => [k, got[i]]));
}

function repoPart({ series, iorb, rrp }) {
  const rows = REPO.map(([key, rate, volume, about]) => {
    const last = lastOf(series[rate]);
    if (!last) return null;
    const [date, v] = last;
    const month = onOrBefore(series[rate], back(date, 30)), year = onOrBefore(series[rate], back(date, 365), 10);
    return [key, about, date, v, billions(series[volume].get(date) ?? null), bp(v, month), bp(v, year), bp(v, onOrBefore(iorb, date, 3)), bp(v, onOrBefore(rrp, date, 3))];
  }).filter(Boolean);
  if (!rows.length) return null;
  const sofr = series["FNYR-SOFR-A"];
  const recent = [...sofr].slice(-20).filter(([d]) => onOrBefore(iorb, d, 3) != null);
  const above = recent.filter(([d, v]) => v > onOrBefore(iorb, d, 3)).length;
  return {
    columns: ["rate", "about", "date", "rate_pct", "volume_billions", "change_bp_on_month", "change_bp_on_year", "spread_bp_to_iorb", "spread_bp_to_on_rrp"], rows,
    fed: { iorb_pct: lastOf(iorb)?.[1] ?? null, on_rrp_pct: lastOf(rrp)?.[1] ?? null, as_of: lastOf(iorb)?.[0] ?? null },
    sofr_above_iorb: { sessions: recent.length, above },
  };
}

function fundsPart(series) {
  const total = series[FUNDS_TOTAL], last = lastOf(total);
  if (!last) return null;
  const [month, t] = last;
  const change = (map, days) => { const now = map.get(month), then = onOrBefore(map, back(month, days), 6); return now != null && then ? round((now / then - 1) * 100, 1) : null; };
  const row = ([key, m, about]) => [key, about, billions(series[m].get(month) ?? null), round(((series[m].get(month) ?? NaN) / t) * 100, 1), change(series[m], 28), change(series[m], 364)];
  return {
    month: month.slice(0, 7), total_billions: billions(t), change_on_month_pct: change(total, 28), change_on_year_pct: change(total, 364),
    columns: ["holding", "about", "billions", "share_pct", "change_on_month_pct", "change_on_year_pct"], rows: FUNDS.map(row),
    repo_counterparties: { columns: ["counterparty", "about", "billions", "share_of_all_holdings_pct", "change_on_month_pct", "change_on_year_pct"], rows: COUNTERPARTIES.map(row) },
  };
}

function dealersPart(series) {
  const last = lastOf(series.total);
  if (!last) return null;
  const [week, total] = last;
  const rows = DEALERS.map(([key, , about]) => {
    const now = series[key].get(week) ?? null, month = onOrBefore(series[key], back(week, 28), 3), year = onOrBefore(series[key], back(week, 364), 3);
    return [key, about, billions(now == null ? null : now * 1e6), month == null || now == null ? null : billions((now - month) * 1e6), year == null || now == null ? null : billions((now - year) * 1e6)];
  });
  const buckets = DEALERS.slice(1).reduce((s, [key]) => s + (series[key].get(week) ?? 0), 0);
  return { week, total_billions: billions(total * 1e6), buckets_billions: billions(buckets * 1e6), columns: ["position", "about", "net_billions", "change_on_4_weeks", "change_on_year"], rows };
}

const LIMITS = [
  "The OFR's repo rates are preliminary (its final figures follow months later) and, it says, for information only: not administered to IOSCO standards nor meant to be referenced in contracts; a day missing in a segment had no trading or was held back to protect confidential information.",
  "Money market fund holdings are month ends from SEC Form N-MFP, published by the OFR about a week after each month; dealers' positions are the New York Fed's weekly FR 2004 statistics, net of short positions, published with about a week's lag. The maturity buckets as published add up to less than the total.",
  "Not investment advice.",
];

export async function moneyMarkets(session, args) {
  const a = moneyInput.parse(args);
  const want = a.part ? [a.part] : ["repo", "money_funds", "dealers"];
  const [repoData, fundsData, dealerData] = await Promise.all([
    want.includes("repo") ? readRepo(session).catch((e) => (a.part ? Promise.reject(e) : null)) : null,
    want.includes("money_funds") ? readFunds(session).catch((e) => (a.part ? Promise.reject(e) : null)) : null,
    want.includes("dealers") ? readDealers(session).catch((e) => (a.part ? Promise.reject(e) : null)) : null,
  ]);
  const repo = repoData && repoPart(repoData), funds = fundsData && fundsPart(fundsData), dealers = dealerData && dealersPart(dealerData);
  if (!repo && !funds && !dealers) throw new NotFound("None of the money market sources answered (the OFR, the New York Fed and FRED).");
  const n = a.periods;
  if (a.part === "repo") {
    const dates = [...repoData.series["FNYR-SOFR-A"].keys()].slice(-(n ?? 20));
    return {
      ...repo,
      history: { columns: ["date", ...REPO.map((r) => `${r[0]}_pct`), "iorb_pct", "on_rrp_pct", "sofr_volume_billions"], rows: dates.map((d) => [d, ...REPO.map(([, rate]) => repoData.series[rate].get(d) ?? null), onOrBefore(repoData.iorb, d, 3), onOrBefore(repoData.rrp, d, 3), billions(repoData.series["FNYR-SOFR_UV-A"].get(d) ?? null)]) },
      reading: "Each overnight repo rate with its volume, its change in basis points and its spread to the Fed's interest on reserves and its overnight reverse repo rate; history gives each day.", source: `${PAGES.repo}; New York Fed reference rates via the OFR; FRED IORB and RRPONTSYAWARD`, limits: LIMITS,
    };
  }
  if (a.part === "money_funds") {
    const months = [...fundsData[FUNDS_TOTAL].keys()].slice(-(n ?? 13));
    return {
      ...funds,
      history: { columns: ["month", "total_billions", ...FUNDS.map((f) => `${f[0]}_billions`), "repo_with_fed_billions"], rows: months.map((m) => [m.slice(0, 7), billions(fundsData[FUNDS_TOTAL].get(m)), ...FUNDS.map(([, k]) => billions(fundsData[k].get(m) ?? null)), billions(fundsData["MMF-MMF_RP_wFR-M"].get(m) ?? null)]) },
      reading: "What US money market funds held at each month end, in billions of dollars: by type (adding up to the total) and their repo by counterparty (adding up to repo).", source: PAGES.funds, limits: LIMITS,
    };
  }
  if (a.part === "dealers") {
    const weeks = [...dealerData.total.keys()].slice(-(n ?? 13));
    return {
      ...dealers,
      history: { columns: ["week", ...DEALERS.map((d) => `${d[0]}_billions`)], rows: weeks.map((w) => [w, ...DEALERS.map(([k]) => billions(dealerData[k].get(w) == null ? null : dealerData[k].get(w) * 1e6))]) },
      reading: "Primary dealers' net positions in Treasuries excluding TIPS each week, in billions of dollars (long less short), in total and by maturity as published.", source: PAGES.dealers, limits: LIMITS,
    };
  }
  const summary = [];
  if (repo) {
    const r = Object.fromEntries(repo.rows.map((x) => [x[0], x]));
    const s = r.sofr;
    if (s) summary.push(`SOFR was ${pctText(s[3])} on ${s[2]} on ${money(s[4])} of trades, ${Math.abs(s[7])} bp ${s[7] >= 0 ? "above" : "below"} the Fed's interest on reserves (${pctText(repo.fed.iorb_pct)}) and ${Math.abs(s[8])} bp ${s[8] >= 0 ? "above" : "below"} its overnight reverse repo rate (${pctText(repo.fed.on_rrp_pct)}); it was above interest on reserves on ${repo.sofr_above_iorb.above} of the last ${repo.sofr_above_iorb.sessions} sessions.`);
    const seg = ["tri_party", "dvp", "gcf"].filter((k) => r[k]).map((k) => `${{ tri_party: "tri-party (without the Fed)", dvp: "cleared bilateral (DVP)", gcf: "GCF" }[k]} ${pctText(r[k][3])}${r[k][4] != null ? ` on ${money(r[k][4])}` : ""} (${r[k][2]})`);
    if (seg.length) summary.push(`By segment: ${seg.join(", ")}.`);
  }
  if (funds) {
    const f = Object.fromEntries(funds.rows.map((x) => [x[0], x])), c = Object.fromEntries(funds.repo_counterparties.rows.map((x) => [x[0], x]));
    summary.push(`US money market funds held ${money(funds.total_billions)} at the end of ${funds.month} (${signed(funds.change_on_month_pct)}% on the month, ${signed(funds.change_on_year_pct)}% on a year): Treasuries ${f.treasuries[3]}%, repo ${f.repo[3]}% (${money(f.repo[2])}, of which ${money(c.federal_reserve[2])} with the Fed and ${money(c.ficc[2])} cleared by FICC), agency ${f.agency[3]}%, bank-related ${f.bank_related[3]}%.`);
  }
  if (dealers) {
    const t = dealers.rows[0], b = dealers.rows[1];
    summary.push(`Primary dealers were net long ${money(t[2])} of Treasuries (excluding TIPS) in the week to ${dealers.week}${t[3] != null ? `, ${t[3] >= 0 ? "up" : "down"} ${money(Math.abs(t[3]))} on four weeks` : ""}${t[4] != null ? ` and ${t[4] >= 0 ? "up" : "down"} ${money(Math.abs(t[4]))} on a year` : ""}; bills ${money(b[2])}.`);
  }
  return {
    summary,
    ...(repo ? { repo } : {}), ...(funds ? { money_funds: funds } : {}), ...(dealers ? { dealers } : {}),
    reading: "repo: each overnight repo rate with its volume, changes in basis points and spreads to the Fed's rates; money_funds: what US money market funds hold by type and whom their repo is with, in billions; dealers: primary dealers' net Treasury positions by maturity, in billions. part gives one with its history.",
    source: `${PAGES.repo}; ${PAGES.funds}; ${PAGES.dealers}; FRED IORB and RRPONTSYAWARD`, limits: LIMITS,
  };
}
