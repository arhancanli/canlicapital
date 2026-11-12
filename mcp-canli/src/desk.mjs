// One call, many workers. A model asks once and the server does the fan-out itself: brief runs every
// tool that says something about one company, swarm runs one tool over hundreds of companies. Workers
// are plain calls to the pack tools, not model calls, so they cost no model tokens; what comes back is
// a digest, with each worker's full answer kept under a ref for show_result.
import { z } from "zod";

const NAME = z.string().min(1).max(120);
export const briefInput = z.object({
  company: NAME.describe("Ticker, CIK or name."),
  years: z.number().int().min(1).max(10).optional().describe("Fiscal years of figures; default 3."),
  seconds: z.number().int().min(5).max(55).optional().describe("Longest to wait for slower workers; default 30. Late ones are named, and a later call answers from what they fetched."),
}).strict();

export const swarmInput = z.object({
  tool: z.string().min(1).max(100).optional().describe("The tool to run for each company (find_tool finds one), e.g. forensic_scores, debt_profile, company_reverse_dcf."),
  companies: z.array(NAME).min(1).max(500).optional().describe("Tickers, CIKs or names to run it over."),
  over: z.object({ tool: z.string().max(100), arguments: z.record(z.string(), z.any()).optional(), column: z.string().max(60).optional() }).strict().optional().describe("Instead of companies: names from another tool's table, e.g. {tool:\"index_constituents\", arguments:{index:\"VOO\"}, column:\"ticker\"} or {tool:\"screen_companies\", arguments:{...}, column:\"ticker\"}. Up to 500."),
  arguments: z.record(z.string(), z.any()).optional().describe("Arguments every call shares."),
  argument: z.string().max(60).optional().describe("The argument that takes the name; default company, else symbol."),
  fields: z.array(z.string().max(120)).min(1).max(20).optional().describe("Dotted paths to keep from each answer, e.g. [\"piotroski.f_score\",\"altman.z_score\"]. Default: that tool's headline figures, or its top-level numbers."),
  sort_by: z.string().max(120).optional().describe("A field to rank by."),
  order: z.enum(["desc", "asc"]).optional().describe("Default desc."),
  limit: z.number().int().min(1).max(500).optional().describe("Rows to return; default 50. All of them stay under ref."),
  concurrency: z.number().int().min(1).max(16).optional().describe("Workers at once; default 8. SEC's rate limit is kept whatever this is."),
  seconds: z.number().int().min(5).max(55).optional().describe("Longest this call runs; default 45. Unfinished work comes back as resume."),
  resume: z.string().max(20).optional().describe("The resume ref of an earlier call: carries on where it stopped."),
}).strict();

export const DESK = Object.freeze([
  { name: "brief", pack: "desk", toolset: "desk", title: "Everything on one company, in one call", input: briefInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    description: "Run every tool that bears on one company at once (accounts, latest results and guidance, segments, valuation, debt, accounting screens, peers, shorts, options, news; pipelines for drug makers, call reports for banks) and get one short digest with cross-checked flags, each naming its evidence. Each worker's full answer stays under a ref for show_result.",
    keywords: "everything overview summary deep dive due diligence tear sheet research company analyst one call fan out sub agents workers flags red flags", args: "company: string, years?: integer, seconds?: integer" },
  { name: "swarm", pack: "desk", toolset: "desk", title: "One tool over hundreds of companies", input: swarmInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    description: "Run one read-only tool over up to 500 companies at once and get one ranked table of the fields you choose, with medians and any failures, instead of hundreds of separate answers. Long runs come back in parts with a resume ref.",
    keywords: "many companies whole index universe bulk batch rank all sp500 fan out parallel sub agents workers map scan every", args: "tool: string, companies?: string[], over?: {tool,arguments,column}, arguments?: object, argument?: string, fields?: string[], sort_by?: string, order?: desc|asc, limit?: integer, concurrency?: integer, seconds?: integer, resume?: string" },
]);

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const pct = (x) => (num(x) == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const big = (x) => (num(x) == null ? "n/a" : Math.abs(x) >= 1e12 ? `${(x / 1e12).toFixed(2)}T` : Math.abs(x) >= 1e9 ? `${(x / 1e9).toFixed(1)}B` : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(0)}M` : String(Math.round(x)));
const tableRow = (t, i = 0) => (t?.columns && t.rows?.[i] ? Object.fromEntries(t.columns.map((c, k) => [c, t.rows[i][k]])) : null);
const median = (xs) => { const v = xs.filter((x) => num(x) != null).sort((a, b) => a - b); if (!v.length) return null; const h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };

// Each worker's answer reduced to what a reader needs first. Flags point at what deserves a look: a
// rule fired on these figures, which is a reason to read on rather than a finding.
const DIGESTS = {
  report(r, out, flag) {
    const rows = r.financials?.rows ?? [], cols = r.financials?.columns ?? [];
    const y = rows.at(-1) && Object.fromEntries(cols.map((c, k) => [c, rows.at(-1)[k]]));
    const p = rows.at(-2) && Object.fromEntries(cols.map((c, k) => [c, rows.at(-2)[k]]));
    out.company = r.company;
    out.latest_year = y ? { fiscal_year_end: y.fiscal_year_end, ...(r.company?.accounts ? { in: r.company.accounts.currency } : {}), revenue: y.revenue, revenue_growth: y.revenue_growth, gross_margin: y.gross_margin, operating_margin: y.operating_margin, net_margin: y.net_margin, eps_diluted: y.eps_diluted, free_cash_flow: y.free_cash_flow, roe: y.roe } : null;
    if (r.market && !r.market.error) out.market = { price: r.market.price, as_of: r.market.price_date, market_cap: r.market.market_cap, pe: r.market.pe, ps: r.market.ps, fcf_yield: r.market.fcf_yield, return_1y: r.market.total_return_1y, beta: r.market.beta_1y_vs_spy, max_drawdown_1y: r.market.max_drawdown_1y, ...(r.market.listed_share ? { ordinary_shares_per_listed_share: r.market.listed_share.ordinary_shares_each } : {}) };
    if (r.financials?.behind) flag("watch", r.financials.behind, "report");
    if (r.market?.note) flag("info", r.market.note, "report");
    if (y?.restated) flag("watch", `Restated in later filings: ${y.restated}.`, "report");
    if (num(y?.operating_margin) != null && num(p?.operating_margin) != null && y.operating_margin < p.operating_margin - 0.05) flag("watch", `Operating margin fell from ${pct(p.operating_margin)} to ${pct(y.operating_margin)} in a year.`, "report");
    if (y?.operating_cash_flow != null && y?.net_income > 0 && y.operating_cash_flow < 0.5 * y.net_income) flag("watch", `Operating cash flow ${big(y.operating_cash_flow)} is under half of net income ${big(y.net_income)}.`, "report");
    const i = r.insiders_180d;
    if (i) { out.insiders_180d = { bought: i.open_market_purchases?.value ?? 0, sold: i.open_market_sales?.value ?? 0, sellers: i.open_market_sales?.insiders ?? 0 }; if (i.open_market_sales?.value > 1e7 && i.open_market_sales.value > 10 * (i.open_market_purchases?.value ?? 0)) flag("info", `Insiders sold ${big(i.open_market_sales.value)} on the open market in 180 days and bought ${big(i.open_market_purchases?.value ?? 0)}; many such sales are pre-planned.`, "report"); }
  },
  release(r, out, flag) {
    const rows = r.results?.rows ?? [], cols = r.results?.columns ?? [];
    out.latest_results = { filed: r.release?.filed, headline: r.release?.headline, url: r.release?.url, key_lines: [...new Set(rows.map((x) => x[cols.indexOf("quote")]).filter(Boolean))].slice(0, 4), guidance_items: r.guidance?.rows?.length ?? 0 };
    const g = r.previous_guidance_vs_results;
    if (g?.rows?.length) {
      const c = g.columns ?? [], st = c.findIndex((x) => /verdict|against|result|status/.test(x));
      if (st >= 0) { const miss = g.rows.filter((x) => /below|miss|under/i.test(String(x[st]))); out.latest_results.guidance_checked = g.rows.length; if (miss.length) flag("watch", `${miss.length} of ${g.rows.length} items came in below last quarter's guidance.`, "release"); }
    }
  },
  calendar(r, out, flag) {
    if (r.next) out.next_earnings = { expected: r.next.expected, earliest: r.next.earliest, latest: r.next.latest, estimate: true };
    if (r.next?.status && /^late/.test(r.next.status)) flag("watch", `Results look late: expected about ${r.next.expected}, nothing filed yet.`, "calendar");
  },
  segments(r, out) {
    const t = r.segments, c = t?.columns ?? [], rev = c.findIndex((x) => /^revenue_/.test(x));
    if (rev >= 0) out.segments = (t.rows ?? []).filter((x) => num(x[rev]) != null).sort((a, b) => b[rev] - a[rev]).slice(0, 5).map((x) => [x[0], x[rev]]);
  },
  forensic(r, out, flag) {
    out.accounting_screens = { beneish_m: r.beneish?.m_score ?? null, piotroski_f: r.piotroski?.f_score ?? null, altman_z: r.altman?.z_score ?? null, ...(r.altman?.not_applicable ? { note: "not meaningful for a financial company" } : {}) };
    if (r.beneish?.m_score > -1.78) flag("watch", `Beneish M-score ${r.beneish.m_score} is above -1.78 (${r.beneish.indices ? `sales growth index ${r.beneish.indices.sgi}, accruals ${r.beneish.indices.tata}` : "see the indices"}); fast growth alone can do this.`, "forensic");
    if (r.piotroski?.f_score <= 2) flag("watch", `Piotroski F-score ${r.piotroski.f_score} of 9.`, "forensic");
    if (/^distress/.test(r.altman?.zone ?? "")) flag("watch", `Altman Z ${r.altman.z_score} is in the distress zone; the model was fitted on manufacturers.`, "forensic");
  },
  debt(r, out, flag) {
    const c = r.cost_and_cover ?? {}, m = r.maturities ?? {};
    out.debt = { total: r.debt?.total ?? null, net_debt: r.net_debt ?? null, due_12m: m.next_12_months ?? null, interest_coverage: c.interest_coverage ?? null };
    const liquid = (r.cash_and_equivalents ?? 0) + (r.current_marketable_securities ?? 0);
    if (m.next_12_months > liquid && liquid > 0) flag("watch", `${big(m.next_12_months)} of debt falls due in 12 months against ${big(liquid)} of cash and securities.`, "debt");
    if (num(c.interest_coverage) != null && c.interest_coverage < 2) flag("high", `Operating income covers interest only ${c.interest_coverage} times.`, "debt");
  },
  valuation(r, out, flag) {
    out.priced_in = { implied_fcf_growth: r.implied_growth ?? null, fcf_growth_5y: r.history?.fcf_cagr_5y ?? null, revenue_growth_5y: r.history?.revenue_cagr_5y ?? null, assuming: { discount_rate: r.inputs?.discount_rate, terminal_growth: r.inputs?.terminal_growth, years: r.inputs?.years } };
    const history = [r.history?.fcf_cagr_5y, r.history?.revenue_cagr_5y].filter((x) => num(x) != null);
    if (num(r.implied_growth) != null && history.length && r.implied_growth > Math.max(...history) + 0.1) flag("watch", `The price needs free cash flow to grow ${pct(r.implied_growth)} a year; the last five years did ${history.map(pct).join(" and ")} (cash flow, revenue).`, "valuation");
  },
  peers(r, out) {
    const v = r.company_vs_peers ?? {};
    out.against_peers = { peers: (r.rows ?? []).slice(1).map((x) => x[0]), ...Object.fromEntries(["revenue_growth", "gross_margin", "operating_margin", "net_margin", "roe"].filter((k) => v[k]).map((k) => [k, { value: v[k].value, peer_median: v[k].peer_median, beats: `${v[k].above} of ${v[k].of}` }])) };
  },
  shorts(r, out, flag) {
    const l = r.latest;
    if (!l) return;
    out.short_interest = { share_of_outstanding: l.pct_of_shares_outstanding ?? null, days_to_cover: l.days_to_cover ?? null, settled: l.settlement_date };
    if (l.pct_of_shares_outstanding >= 0.15 || l.days_to_cover >= 8) flag("watch", `Short interest is high: ${pct(l.pct_of_shares_outstanding)} of shares, ${l.days_to_cover} days to cover.`, "shorts");
  },
  options(r, out) {
    const s = r.summary;
    if (s) out.options = { expiration: r.expiration, days: r.days_to_expiration, ...(r.spans_earnings ? { spans_next_earnings: true } : {}), atm_iv: s.atm_iv ?? null, expected_move: s.expected_move?.fraction_of_price ?? null, put_call_oi: s.put_call_open_interest_ratio ?? null };
  },
  letters(r, out, flag) {
    const recent = r.recent?.rows?.[0]?.[0];
    out.sec_staff_letters = { since: r.since, staff_letters: r.staff_letters ?? 0, latest: recent ?? null };
  },
  cross_check(r, out, flag) {
    out.figures_cross_checked = { fiscal_year_end: r.fiscal_year_end, checked: r.checked, agree: r.agreements };
    if (r.disagreements) flag("watch", `Separate roads to the figures disagree: ${r.disagreement_text}.`, "cross_check");
  },
  news(r, out) {
    const t = r.articles;
    out.headlines = (t?.rows ?? []).slice(0, 4).map((x) => ({ seen: x[0], title: x[1], outlet: x[2], url: x[5] }));
  },
  pipeline(r, out) {
    out.drug_pipeline = { active_trials: r.active_trials ?? null, by_phase: r.by_phase ?? null };
  },
  bank(r, out) {
    const y = tableRow(r);
    if (y) out.bank = y;
  },
};

// Runs each worker; a slow or failed one costs only its own part of the digest.
async function fanOut(ctx, tasks, seconds) {
  const log = [], store = new Map();
  const start = Date.now();
  const running = tasks.map(async (t) => {
    const t0 = Date.now();
    try {
      // A slow source (news, whose index rations requests) waits no longer than its budget.
      const result = await (t.budget ? Promise.race([ctx.call(t.tool, t.args), new Promise((_, no) => { setTimeout(() => no(new Error(`no answer in ${t.budget} seconds`)), t.budget * 1000).unref?.(); })]) : ctx.call(t.tool, t.args));
      store.set(t.id, result);
      log.push({ id: t.id, tool: t.tool, ms: Date.now() - t0, status: "ok" });
    } catch (e) { log.push({ id: t.id, tool: t.tool, ms: Date.now() - t0, status: "failed", error: String(e.message).slice(0, 160) }); }
  });
  let timer;
  await Promise.race([Promise.all(running), new Promise((res) => { timer = setTimeout(res, seconds * 1000); })]);
  clearTimeout(timer);
  for (const t of tasks) if (!log.some((x) => x.id === t.id)) log.push({ id: t.id, tool: t.tool, ms: Date.now() - start, status: "still running" });
  return { store, log };
}

export async function runBrief(ctx, args) {
  const a = briefInput.parse(args);
  const c = a.company, began = Date.now(), seconds = a.seconds ?? 30;
  const first = { id: "report", tool: "company_report", args: { company: c, years: a.years ?? 3 } };
  const tasks = [first,
    { id: "release", tool: "earnings_release", args: { company: c, compare: true } },
    { id: "calendar", tool: "earnings_calendar", args: { company: c } },
    { id: "segments", tool: "segment_revenue", args: { company: c } },
    { id: "forensic", tool: "forensic_scores", args: { company: c } },
    { id: "debt", tool: "debt_profile", args: { company: c } },
    { id: "valuation", tool: "company_reverse_dcf", args: { company: c } },
    { id: "peers", tool: "comps", args: { company: c, peers: 5 } },
    { id: "letters", tool: "comment_letters", args: { company: c, years: 3 } },
    { id: "news", tool: "news", args: { company: c, days: 14, limit: 6, tone: false }, budget: 15 },
    { id: "cross_check", tool: "triangulate", args: { company: c } },
  ];
  // Tickers take the symbol tools; a name or CIK is resolved by the report first.
  const ticker = /^[A-Za-z][A-Za-z.\-]{0,6}$/.test(c) ? c.toUpperCase() : null;
  if (ticker) tasks.push({ id: "shorts", tool: "short_interest", args: { symbol: ticker, periods: 2 } }, { id: "options", tool: "options_chain", args: { symbol: ticker, window: 0.05 } });
  const { store, log } = await fanOut(ctx, tasks, seconds);
  // What the industry adds, once the report says which it is.
  const industry = String(store.get("report")?.company?.industry ?? "");
  const left = Math.max(3, seconds - (Date.now() - began) / 1000);
  const extra = [];
  if (/pharma|biolog|medicinal/i.test(industry)) extra.push({ id: "pipeline", tool: "drug_pipeline", args: { company: c, months: 12 } });
  if (/bank|savings institution/i.test(industry)) extra.push({ id: "bank", tool: "bank_financials", args: { company: c, quarters: 4 } });
  if (!ticker && store.get("report")?.company?.ticker) {
    const t = store.get("report").company.ticker;
    extra.push({ id: "shorts", tool: "short_interest", args: { symbol: t, periods: 2 } }, { id: "options", tool: "options_chain", args: { symbol: t, window: 0.05 } });
  }
  // The nearest expiration is often today's, which says little: the first past the next results if
  // they are near (the market's price for that report), else about a month out.
  const chain = store.get("options"), when = store.get("calendar")?.next?.expected;
  const dated = (chain?.expirations?.rows ?? []).map((x) => ({ date: x[0], days: x[1] }));
  const near = when && chain && (Date.parse(when) - Date.parse(chain.expiration)) / 86400000 <= 45 ? dated.find((x) => x.date > when) : null;
  const pick = near ?? dated.find((x) => x.days >= 25);
  if (pick && pick.date !== chain?.expiration) {
    const next = await ctx.call("options_chain", { symbol: chain.underlying?.symbol ?? ticker, expiration: pick.date, window: 0.05 }).catch(() => null);
    if (next) store.set("options", near ? { ...next, spans_earnings: true } : next);
  }
  if (extra.length) { const more = await fanOut(ctx, extra, left); for (const [k, v] of more.store) store.set(k, v); log.push(...more.log); }
  const out = {}, flags = [];
  const flag = (level, what, from) => flags.push({ level, what, from });
  let full = 0;
  const refs = {};
  for (const [id, result] of store) {
    full += JSON.stringify(result ?? null).length;
    refs[id] = ctx.keep(result);
    try { DIGESTS[id]?.(result, out, flag); } catch (e) { flag("info", `The ${id} worker's answer could not be digested: ${String(e.message).slice(0, 100)}.`, id); }
  }
  // Free cash flow and debt mean something else at a bank or an insurer: deposits are its raw material, and
  // its cash flow swings with its balance sheet. Those figures would mislead here.
  const financial = /bank|savings institution|insurance|security brokers|finance services|credit institution/i.test(industry);
  if (financial) {
    delete out.debt; delete out.priced_in;
    if (out.market) delete out.market.fcf_yield;
    if (out.latest_year) delete out.latest_year.free_cash_flow;
    for (let i = flags.length - 1; i >= 0; i -= 1) if (["debt", "valuation"].includes(flags[i].from) || /Operating cash flow/.test(flags[i].what)) flags.splice(i, 1);
    out.financial_company = "Free cash flow, debt ratios and the implied-growth model are left out: they do not read a financial company properly. Their workers' answers are still under refs.";
  }
  const order = { high: 0, watch: 1, info: 2 };
  flags.sort((x, y) => order[x.level] - order[y.level]);
  const { company, ...rest } = out;
  const digest = {
    company: company ?? { asked: c },
    ...rest,
    flags: { note: "A rule fired on these figures: a reason to read on, not a finding.", rows: flags.map((f) => [f.level, f.what, f.from]), columns: ["level", "what", "from"] },
    workers: { columns: ["worker", "tool", "ms", "status", "ref", "error"], rows: log.map((w) => [w.id, w.tool, w.ms, w.status, refs[w.id] ?? null, w.error ?? null]) },
    next: "show_result with a worker's ref opens its full answer, with its sources; ask again if a worker was still running, since its data is now cached.",
    limits: ["Figures are from the filings and sources each worker names; a worker's limits are in its full answer.", "Not investment advice."],
    elapsed_ms: Date.now() - began,
  };
  digest.size = { full_answers_chars: full, this_digest_chars: JSON.stringify(digest).length };
  return digest;
}

// Headline figures per tool, where a tool's top level holds none.
const DEFAULT_FIELDS = {
  forensic_scores: ["beneish.m_score", "piotroski.f_score", "altman.z_score"],
  company_reverse_dcf: ["implied_growth", "history.fcf_cagr_5y", "history.revenue_cagr_5y", "inputs.enterprise_value"],
  debt_profile: ["debt.total", "net_debt", "maturities.next_12_months", "cost_and_cover.interest_coverage"],
  short_interest: ["latest.pct_of_shares_outstanding", "latest.days_to_cover"],
  company_report: ["market.market_cap", "market.pe", "market.ps", "market.fcf_yield", "market.total_return_1y", "market.beta_1y_vs_spy"],
  options_chain: ["summary.atm_iv", "summary.expected_move.fraction_of_price", "summary.put_call_open_interest_ratio"],
  ownership_breadth: ["change_latest_vs_prior"],
  triangulate: ["fiscal_year_end", "checked", "disagreements", "disagreement_text", "different_measures", "different_measures_text"],
  segment_revenue: ["total_revenue.values.0"],
};

function defaultFields(tool, sample) {
  if (DEFAULT_FIELDS[tool]) return DEFAULT_FIELDS[tool];
  const out = [];
  for (const [k, v] of Object.entries(sample ?? {})) {
    if (typeof v === "number") out.push(k);
    else if (v && typeof v === "object" && !Array.isArray(v) && !["company", "sources", "columns"].includes(k)) for (const [k2, v2] of Object.entries(v)) if (typeof v2 === "number") out.push(`${k}.${k2}`);
    if (out.length >= 8) break;
  }
  return out;
}

export async function runSwarm(ctx, args) {
  const a = swarmInput.parse(args);
  const began = Date.now(), seconds = Math.min(a.seconds ?? 45, ctx.hosted ? 20 : 55);
  let job;
  if (a.resume) {
    job = ctx.get(a.resume);
    if (!job?.swarm) throw new Error(`swarm: "${a.resume}" is not a swarm to resume; it may have aged out, so start again.`);
  } else {
    if (!a.tool) throw new Error("swarm: name a tool to run for each company.");
    if (["brief", "swarm", "stress_worlds", "find_tool", "describe_tool", "run_tool", "show_result"].includes(a.tool)) throw new Error(`swarm cannot run ${a.tool}; name a data tool.`);
    const tool = await ctx.toolFor(a.tool);
    if (tool.annotations?.destructiveHint) throw new Error(`swarm runs read-only tools; ${a.tool} changes an account.`);
    if (!a.companies && !a.over) throw new Error("swarm: pass companies, or over to take them from another tool's table.");
    let names = a.companies;
    if (!names) {
      const from = await ctx.call(a.over.tool, a.over.arguments ?? {});
      const table = from?.rows && from?.columns ? from : Object.values(from ?? {}).find((v) => v?.rows && v?.columns);
      if (!table) throw new Error(`swarm: ${a.over.tool} returned no table to take names from.`);
      const col = a.over.column ?? ["ticker", "symbol", "company", "name"].find((c) => table.columns.includes(c));
      const at = table.columns.indexOf(col);
      if (at < 0) throw new Error(`swarm: ${a.over.tool}'s table has columns ${table.columns.join(", ")}; pass over.column.`);
      names = [...new Set(table.rows.map((r) => r[at]).filter((x) => x != null && x !== ""))].map(String).slice(0, 500);
    }
    const shape = z.toJSONSchema(tool.input, { io: "input" }).properties ?? {};
    const argument = a.argument ?? ["company", "symbol", "query"].find((k) => shape[k]);
    if (!argument || !shape[argument]) throw new Error(`swarm: ${a.tool} has no argument for a company (it takes ${Object.keys(shape).join(", ")}); pass argument.`);
    job = { swarm: true, tool: a.tool, argument, shared: a.arguments ?? {}, fields: a.fields ?? null, sort_by: a.sort_by, order: a.order, limit: a.limit, left: [...names], done: [], failed: [], total: names.length };
  }
  const limit = a.limit ?? job.limit ?? 50, sortBy = a.sort_by ?? job.sort_by, order = a.order ?? job.order ?? "desc";
  const inFlight = new Set();
  let stopped = false;
  const worker = async () => {
    while (!stopped && job.left.length) {
      const name = job.left.shift();
      inFlight.add(name);
      try {
        const result = await ctx.call(job.tool, { ...job.shared, [job.argument]: name });
        if (stopped) return;
        job.fields ??= defaultFields(job.tool, result);
        job.done.push([name, ...job.fields.map((f) => { const v = ctx.at(result, f); return v !== null && typeof v === "object" ? null : v ?? null; })]);
      } catch (e) {
        if (stopped) return;
        job.failed.push([name, String(e.message).slice(0, 140)]);
      }
      inFlight.delete(name);
    }
  };
  let timer;
  await Promise.race([Promise.all(Array.from({ length: Math.min(a.concurrency ?? 8, ctx.hosted ? 4 : 16) }, worker)), new Promise((res) => { timer = setTimeout(res, seconds * 1000); })]);
  clearTimeout(timer);
  stopped = true;
  job.left.unshift(...inFlight);
  const fields = job.fields ?? [];
  const sortAt = sortBy ? fields.indexOf(sortBy) : -1;
  if (sortBy && sortAt < 0) throw new Error(`swarm: sort_by must be one of the fields: ${fields.join(", ")}.`);
  const rows = [...job.done];
  if (sortAt >= 0) rows.sort((x, y) => { const p = x[sortAt + 1], q = y[sortAt + 1]; if (num(p) == null) return 1; if (num(q) == null) return -1; return order === "asc" ? p - q : q - p; });
  const columns = ["company", ...fields];
  const all = { columns, rows, failed: job.failed };
  const unfinished = job.left.length;
  return {
    tool: job.tool, total: job.total, finished: job.done.length, failed: job.failed.length, unfinished,
    columns, rows: rows.slice(0, limit),
    median: Object.fromEntries(fields.map((f, i) => [f, median(rows.map((r) => r[i + 1]))])),
    ...(rows.length > limit ? { shown: limit, ref: ctx.keep(all), next: "show_result with ref and path rows pages through the rest." } : {}),
    ...(job.failed.length ? { failures: { columns: ["company", "error"], rows: job.failed.slice(0, 10) } } : {}),
    ...(unfinished ? { resume: ctx.keep(job), note: `${unfinished} still to run: call swarm with {resume} to carry on. Finished work is kept.` } : {}),
    elapsed_ms: Date.now() - began,
    limits: ["Each row is the named tool's figures as it found them, with that tool's limits; run it on one company for its sources.", "Not investment advice."],
  };
}
