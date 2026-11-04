// scenario_risk: a portfolio's own holdings under a macro shock or a past crisis, the way institutional risk
// systems run scenarios. Each holding's weekly returns are regressed on the weekly moves of eight market
// factors over the last years. A shock to some factors moves the others by their mean given the shocked
// ones, under the factors' covariance in the same years, and each holding moves by its betas. A past crisis
// replays the factors' actual moves beside each holding's actual return where it was listed then, so the
// model can be checked against what happened.
import { z } from "zod";

import { NotFound } from "./sources.mjs";
import { economicSeries, priceHistory } from "./tools.mjs";

// How each factor's weekly move is measured: a log return for a price, a change in level for a yield, a
// spread or the VIX. FRED series need no key; SPY's prices come through price_history. The credit spread is
// Baa over Aaa, two corporate yields: a spread over Treasuries holds the Treasury yield itself, so a bond
// fund's rate sensitivity would split between the two and a crisis's widening would undo its rally.
export const FACTORS = Object.freeze([
  { key: "equities", about: "US stocks (SPY, dividends in)", id: "SPY", price: true, units: "return" },
  { key: "rates_2y", about: "the 2-year Treasury yield", id: "DGS2", units: "percentage points" },
  { key: "rates_10y", about: "the 10-year Treasury yield", id: "DGS10", units: "percentage points" },
  { key: "credit_spread", about: "Moody's Baa corporate bond yield over Aaa", id: ["DBAA", "DAAA"], units: "percentage points" },
  { key: "oil", about: "WTI crude oil", id: "DCOILWTICO", units: "return" },
  { key: "dollar", about: "the Fed's broad trade-weighted dollar index", id: "DTWEXBGS", units: "return" },
  { key: "gold", about: "gold (GLD)", id: "GLD", price: true, units: "return" },
  { key: "volatility", about: "the VIX", id: "VIXCLS", units: "VIX points" },
]);
const RETURN = (f) => f.units === "return";

// The same windows as canli-backtest-mcp's crisis_replay, so the two tools speak of the same crises.
export const CRISES = Object.freeze({
  dotcom_bust: { from: "2000-03-24", to: "2002-10-09", what: "the 2000-02 dot-com bust" },
  bank_crisis: { from: "2008-09-02", to: "2009-03-09", what: "the 2008-09 bank crisis" },
  debt_ceiling_2011: { from: "2011-04-29", to: "2011-10-03", what: "the 2011 US downgrade and euro debt scare" },
  taper_tantrum: { from: "2013-05-22", to: "2013-09-05", what: "the 2013 taper tantrum in bonds" },
  oil_collapse: { from: "2014-06-20", to: "2016-02-11", what: "the 2014-16 oil collapse" },
  dollar_surge: { from: "2014-07-01", to: "2015-03-13", what: "the 2014-15 surge in the dollar" },
  q4_2018: { from: "2018-09-20", to: "2018-12-24", what: "the late 2018 sell-off" },
  pandemic_crash: { from: "2020-02-19", to: "2020-03-23", what: "the February-March 2020 crash" },
  inflation_shock: { from: "2022-01-03", to: "2022-06-16", what: "the 2022 inflation and rate shock" },
  compute_bust: { from: "2022-01-03", to: "2022-10-14", what: "the 2022 fall in chip and compute stocks" },
  regional_bank_run: { from: "2023-03-01", to: "2023-03-24", what: "the March 2023 regional bank run" },
});

const shock = (what) => z.number().finite().optional().describe(what);
export const scenarioInput = z.object({
  holdings: z.array(z.object({
    symbol: z.string().min(1).max(24).describe("A stock, ETF or fund as price_history reads it (AAPL, TLT, SAP.DE)."),
    weight: z.number().finite().min(-10).max(10).describe("Its share of the portfolio's value as a fraction (0.25 is a quarter; negative for a short)."),
  }).strict()).min(1).max(25).describe("The portfolio, up to 25 holdings. Weights are used as given: they need not sum to 1 (a hedged book can sum to 0)."),
  shocks: z.object({
    equities: shock("US stocks' return, as a fraction (-0.2 is a 20% fall)."),
    rates_2y: shock("The 2-year Treasury yield's change in percentage points (0.5 is 50 basis points)."),
    rates_10y: shock("The 10-year Treasury yield's change in percentage points."),
    credit_spread: shock("The Baa-over-Aaa corporate spread's change in percentage points."),
    oil: shock("Oil's return, as a fraction (0.5 is a 50% rise)."),
    dollar: shock("The broad dollar index's return, as a fraction."),
    gold: shock("Gold's return, as a fraction."),
    volatility: shock("The VIX's change in points (15 takes 20 to 35)."),
  }).strict().optional().describe("A hypothetical scenario: the factors you move. Those you leave out move by what history implies given yours."),
  scenario: z.enum(Object.keys(CRISES)).optional().describe("A past crisis to replay instead of shocks: dotcom_bust, bank_crisis, debt_ceiling_2011, taper_tantrum, oil_collapse, dollar_surge, q4_2018, pandemic_crash, inflation_shock, compute_bust or regional_bank_run."),
  years: z.number().int().min(2).max(10).optional().describe("Years of weekly history the betas and the factors' covariance come from. Default 5."),
  horizon_weeks: z.number().int().min(1).max(52).optional().describe("Weeks a hypothetical shock plays out over, which sets the range around the answer. Default 4."),
  portfolio_value: z.number().positive().optional().describe("The portfolio's value, to give the results in money too."),
}).strict();

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e3) / 1e3);

// Every Friday from the first on or after `from` to `to`.
export function fridays(from, to) {
  let t = Date.parse(`${from}T00:00:00Z`);
  t += ((5 - new Date(t).getUTCDay() + 7) % 7) * DAY;
  const out = [];
  for (const end = Date.parse(`${to}T00:00:00Z`); t <= end; t += 7 * DAY) out.push(iso(t));
  return out;
}

// Each week's last value (Saturday to Friday), or null for a week with none.
export function weekly(dates, values, grid) {
  const out = [];
  let j = 0, last = null, lastDate = null;
  for (const f of grid) {
    while (j < dates.length && dates[j] <= f) {
      if (values[j] != null && Number.isFinite(values[j])) { last = values[j]; lastDate = dates[j]; }
      j += 1;
    }
    out.push(lastDate && Date.parse(f) - Date.parse(lastDate) < 7 * DAY ? last : null);
  }
  return out;
}

// A move from one level to the next: a log return for a price (null at or below zero), else the change.
const move = (a, b, isReturn) => (a == null || b == null ? null : isReturn ? (a > 0 && b > 0 ? Math.log(b / a) : null) : b - a);

// The last value on or before a date, with its date.
function at(dates, values, day) {
  let hit = null;
  for (let i = 0; i < dates.length && dates[i] <= day; i += 1) if (values[i] != null && Number.isFinite(values[i])) hit = i;
  return hit == null ? null : { date: dates[hit], value: values[hit] };
}

// Solves A x = b for a small square A by Gaussian elimination with partial pivoting.
export function solve(A, b) {
  const n = A.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-18) throw new Error("The factors' moves are too collinear to solve; shock fewer factors or use more years.");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function covariance(rows) {
  const T = rows.length, K = rows[0].length;
  const mean = Array.from({ length: K }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / T);
  return Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => rows.reduce((s, r) => s + (r[i] - mean[i]) * (r[j] - mean[j]), 0) / (T - 1)));
}

// The other factors' mean given the shocked ones, Σ_US Σ_SS⁻¹ s, and the covariance left to them,
// Σ_UU − Σ_US Σ_SS⁻¹ Σ_SU. Means are taken as zero: a week's drift is small beside a shock.
export function conditional(cov, given) {
  const S = [...given.keys()], U = cov.map((_, i) => i).filter((i) => !given.has(i));
  const Sss = S.map((i) => S.map((j) => cov[i][j]));
  const w = solve(Sss, S.map((i) => given.get(i)));
  const mean = cov.map((_, i) => (given.has(i) ? given.get(i) : S.reduce((x, j, k) => x + cov[i][j] * w[k], 0)));
  const toU = U.map((u) => solve(Sss, S.map((s) => cov[s][u])));
  const left = cov.map(() => cov.map(() => 0));
  U.forEach((a) => U.forEach((b, ib) => { left[a][b] = cov[a][b] - S.reduce((x, s, k) => x + cov[a][s] * toU[ib][k], 0); }));
  return { mean, left };
}

// A holding's betas by least squares on the factor moves with an intercept. The intercept (its past drift)
// is reported but never added to a scenario's result.
export function regress(y, X) {
  const T = y.length, K = X[0].length;
  const Z = X.map((r) => [1, ...r]);
  const XtX = Array.from({ length: K + 1 }, (_, i) => Array.from({ length: K + 1 }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: K + 1 }, (_, i) => Z.reduce((s, r, t) => s + r[i] * y[t], 0));
  for (let j = 0; j <= K; j += 1) XtX[j][j] *= 1 + 1e-10;
  const b = solve(XtX, Xty);
  const fit = Z.map((r) => r.reduce((s, x, j) => s + x * b[j], 0));
  const my = y.reduce((s, v) => s + v, 0) / T;
  const ssr = y.reduce((s, v, t) => s + (v - fit[t]) ** 2, 0), sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  return { alpha: b[0], betas: b.slice(1), r2: sst > 0 ? Math.max(0, 1 - ssr / sst) : 0, resid_var: ssr / Math.max(1, T - K - 1), weeks: T };
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

async function prices(session, symbol, start, end) {
  const p = await priceHistory(session, { symbol, start, end, interval: "1Day" });
  return { symbol: p.symbol ?? symbol, dates: p.dates ?? [], values: p.close ?? [] };
}
// One FRED series, or the difference of two on the dates both have.
async function fred(session, id, start, end) {
  const read = (x) => economicSeries(session, { series: x, start, ...(end ? { end } : {}) });
  if (!Array.isArray(id)) { const s = await read(id); return { dates: s.dates, values: s.values, url: s.source }; }
  const [p, q] = await Promise.all(id.map(read));
  const other = new Map(q.dates.map((d, i) => [d, q.values[i]]));
  const dates = [], values = [];
  p.dates.forEach((d, i) => { if (other.has(d)) { dates.push(d); values.push(Math.round((p.values[i] - other.get(d)) * 1e6) / 1e6); } });
  return { dates, values, url: [p.source, q.source] };
}

export async function scenarioRisk(session, args) {
  const a = scenarioInput.parse(args);
  const given = a.shocks ? Object.entries(a.shocks).filter(([, v]) => v != null) : [];
  if (!a.scenario && !given.length) throw new Error("Give shocks (for example { \"equities\": -0.2 }) or a past scenario to replay (for example \"pandemic_crash\").");
  if (a.scenario && given.length) throw new Error("Give shocks or a scenario, not both: a scenario replays what the factors actually did.");
  const seen = new Set();
  for (const h of a.holdings) {
    const k = h.symbol.trim().toUpperCase();
    if (seen.has(k)) throw new Error(`${h.symbol} is listed twice; give each holding once with its whole weight.`);
    seen.add(k);
  }
  const years = a.years ?? 5, horizon = a.horizon_weeks ?? 4;
  const today = iso(session.now());
  const start = iso(Date.parse(`${today}T00:00:00Z`) - Math.round(years * 365.25) * DAY - 10 * DAY);
  const grid = fridays(iso(Date.parse(`${start}T00:00:00Z`) + 10 * DAY), today);

  // Every series is read once for the betas' years and, for a replay, once more around the crisis.
  const crisis = a.scenario ? { name: a.scenario, ...CRISES[a.scenario] } : null;
  const cFrom = crisis ? iso(Date.parse(`${crisis.from}T00:00:00Z`) - 10 * DAY) : null;
  const tolerate = (p) => p.catch((e) => ({ error: e?.message ?? String(e) }));
  const [holdingData, factorData, crisisHoldings, crisisFactors] = await Promise.all([
    Promise.all(a.holdings.map((h) => tolerate(prices(session, h.symbol, start, today)))),
    Promise.all(FACTORS.map((f) => (f.price ? prices(session, f.id, start, today) : fred(session, f.id, start)))),
    crisis ? Promise.all(a.holdings.map((h) => tolerate(prices(session, h.symbol, cFrom, crisis.to)))) : null,
    crisis ? Promise.all(FACTORS.map((f) => tolerate(f.price ? prices(session, f.id, cFrom, crisis.to) : fred(session, f.id, cFrom, crisis.to)))) : null,
  ]);

  // The factors' weekly moves, kept only in weeks where all of them moved.
  const fw = factorData.map((d) => weekly(d.dates, d.values, grid));
  const fm = FACTORS.map((f, j) => fw[j].map((v, k) => (k ? move(fw[j][k - 1], v, RETURN(f)) : null)));
  const full = grid.map((_, k) => k).filter((k) => fm.every((m) => m[k] != null));
  if (full.length < 52) throw new NotFound(`Only ${full.length} weeks have every factor's move in the last ${years} years; at least 52 are needed.`);
  const cov = covariance(full.map((k) => fm.map((m) => m[k])));

  // Each holding's betas on the weeks it and every factor moved.
  const models = a.holdings.map((h, i) => {
    const d = holdingData[i];
    if (d.error) return { i, symbol: h.symbol, weight: h.weight, why: d.error };
    const w = weekly(d.dates, d.values, grid);
    const rows = full.filter((k) => w[k] != null && w[k - 1] != null && w[k] > 0 && w[k - 1] > 0);
    if (rows.length < 52) return { i, symbol: d.symbol, weight: h.weight, why: `only ${rows.length} weeks of prices in the last ${years} years; at least 52 are needed` };
    const fit = regress(rows.map((k) => Math.log(w[k] / w[k - 1])), rows.map((k) => fm.map((m) => m[k])));
    return { i, symbol: d.symbol, weight: h.weight, ...fit };
  });
  const modeled = models.filter((m) => m.betas);
  if (!modeled.length) throw new NotFound(`No holding has enough price history to model: ${models.map((m) => `${m.symbol} (${m.why})`).join("; ")}.`);

  // The scenario's factor moves, in the model's units (log returns for prices).
  let f, how, left = null, factorNote = null;
  if (!crisis) {
    const g = new Map(given.map(([k, v]) => {
      const j = FACTORS.findIndex((x) => x.key === k);
      if (RETURN(FACTORS[j]) && v <= -1) throw new Error(`${k} cannot fall by 100% or more.`);
      return [j, RETURN(FACTORS[j]) ? Math.log(1 + v) : v];
    }));
    const c = conditional(cov, g);
    f = c.mean;
    left = c.left;
    how = FACTORS.map((_, j) => (g.has(j) ? "given" : "implied by the given moves"));
  } else {
    const actual = FACTORS.map((fx, j) => {
      const d = crisisFactors[j];
      if (d.error) return null;
      const s = at(d.dates, d.values, crisis.from), e = at(d.dates, d.values, crisis.to);
      return s && e && Date.parse(crisis.from) - Date.parse(s.date) < 8 * DAY ? move(s.value, e.value, RETURN(fx)) : null;
    });
    const known = new Map(actual.map((v, j) => [j, v]).filter(([, v]) => v != null));
    if (!known.size) throw new NotFound(`None of the factors has data for ${crisis.what}.`);
    const c = known.size < FACTORS.length ? conditional(cov, known) : null;
    f = c ? c.mean : actual;
    how = FACTORS.map((_, j) => (known.has(j) ? "actual" : "estimated from the others (no data then)"));
    if (c) factorNote = `${FACTORS.filter((_, j) => !known.has(j)).map((x) => x.key).join(" and ")} had no data for the whole window, so ${known.size === FACTORS.length - 1 ? "its move is" : "their moves are"} estimated from the factors that did.`;
  }

  const results = modeled.map((m) => {
    const logMove = dot(m.betas, f);
    let actual = null, actualNote = null;
    if (crisis) {
      const d = crisisHoldings[m.i];
      if (d && !d.error) {
        const s = at(d.dates, d.values, crisis.from), e = at(d.dates, d.values, crisis.to);
        if (s && e && Date.parse(crisis.from) - Date.parse(s.date) < 8 * DAY) actual = e.value / s.value - 1;
        else actualNote = d.dates.length ? `first price ${d.dates[0]}, after the crisis began` : "no prices for the window";
      } else actualNote = d?.error ?? "no prices for the window";
    }
    return { m, model: Math.exp(logMove) - 1, actual, actualNote };
  });

  const port = results.reduce((s, r) => s + r.m.weight * r.model, 0);
  const betaP = FACTORS.map((_, j) => modeled.reduce((s, m) => s + m.weight * m.betas[j], 0));
  let range = null;
  if (left) {
    const factorVar = betaP.reduce((s, bi, i) => s + betaP.reduce((x, bj, j) => x + bi * bj * left[i][j], 0), 0);
    const residVar = modeled.reduce((s, m) => s + m.weight ** 2 * m.resid_var, 0);
    const sd = Math.sqrt(Math.max(0, horizon * (factorVar + residVar)));
    range = [r4(port - 1.645 * sd), r4(port + 1.645 * sd)];
  }
  const allActual = crisis && results.every((r) => r.actual != null);
  const actualPort = allActual ? results.reduce((s, r) => s + r.m.weight * r.actual, 0) : null;
  const replay = crisis ? results.reduce((s, r) => s + r.m.weight * (r.actual ?? r.model), 0) : null;
  // How far the replay's model landed from what each holding listed then actually did.
  const compared = results.filter((r) => r.actual != null);
  const miss = (r) => Math.abs(r.model - r.actual);
  const worstMiss = compared.length ? compared.reduce((x, r) => (miss(r) > miss(x) ? r : x)) : null;
  const modelCheck = worstMiss ? {
    holdings_compared: compared.length,
    mean_abs_error: r4(compared.reduce((s, r) => s + miss(r), 0) / compared.length),
    worst_miss: { symbol: worstMiss.m.symbol, model_return: r4(worstMiss.model), actual_return: r4(worstMiss.actual) },
    ...(allActual ? { portfolio_error: r4(port - actualPort) } : {}),
  } : null;
  const ranked = [...results].sort((x, y) => x.model - y.model);
  const money = (x) => (a.portfolio_value && x != null ? Math.round(x * a.portfolio_value * 100) / 100 : undefined);
  const weightOf = (list) => r4(list.reduce((s, m) => s + m.weight, 0));
  const notModeled = models.filter((m) => !m.betas);

  return {
    kind: crisis ? "historical" : "hypothetical",
    ...(crisis ? { scenario: { name: crisis.name, what: crisis.what, from: crisis.from, to: crisis.to } } : { horizon_weeks: horizon }),
    betas_from: { from: grid[full[0]], to: grid[full.at(-1)], weeks: full.length },
    factors: {
      columns: ["factor", "about", "units", "move", "how", "weekly_sd"],
      rows: FACTORS.map((fx, j) => [fx.key, fx.about, fx.units, r4(RETURN(fx) ? Math.exp(f[j]) - 1 : f[j]), how[j], r4(Math.sqrt(cov[j][j]))]),
    },
    holdings: {
      columns: ["symbol", "weight", "model_return", ...(crisis ? ["actual_return"] : []), "contribution", "r_squared", ...FACTORS.map((fx) => `beta_${fx.key}`)],
      rows: results.map((r) => [r.m.symbol, r.m.weight, r4(r.model), ...(crisis ? [r4(r.actual)] : []), r4(r.m.weight * r.model), r3(r.m.r2), ...r.m.betas.map(r3)]),
    },
    portfolio: {
      model_return: r4(port),
      ...(range ? { range_90: range } : {}),
      ...(crisis ? { actual_return: r4(actualPort), replay_return: r4(replay) } : {}),
      ...(a.portfolio_value ? { model_pnl: money(port), ...(range ? { range_90_pnl: range.map(money) } : {}), ...(allActual ? { actual_pnl: money(actualPort) } : {}) } : {}),
      worst: { symbol: ranked[0].m.symbol, model_return: r4(ranked[0].model) },
      best: { symbol: ranked.at(-1).m.symbol, model_return: r4(ranked.at(-1).model) },
      net_weight: weightOf(a.holdings), modeled_weight: weightOf(modeled),
      betas: Object.fromEntries(FACTORS.map((fx, j) => [fx.key, r3(betaP[j])])),
    },
    ...(modelCheck ? { model_check: modelCheck } : {}),
    ...(notModeled.length ? { not_modeled: notModeled.map((m) => ({ symbol: m.symbol, weight: m.weight, why: m.why })) } : {}),
    ...(crisis && !allActual ? { not_listed_then: results.filter((r) => r.actual == null).map((r) => ({ symbol: r.m.symbol, why: r.actualNote })) } : {}),
    ...(factorNote ? { factor_note: factorNote } : {}),
    method: crisis
      ? "Today's betas (weekly, least squares on eight factors) times the factors' actual moves over the crisis, beside each holding's actual return."
      : "Weekly betas on eight factors; factors left out move by their mean given the shocked ones under the factors' covariance; the range is about 90% (normal) over the horizon.",
    source: [...new Set(factorData.flatMap((d) => d.url ?? []))].concat("Yahoo Finance chart data through price_history (no key)"),
    limits: [
      `A linear model of the last ${years} years' weekly moves: sensitivities can change in a crisis, and moves beyond history's are extrapolated. A holding's own past drift is left out of every result.`,
      "Returns combine as a weighted sum of each holding's return; the range treats the holdings' own moves as independent.",
      crisis ? "A replay uses today's betas on the crisis's factor moves; the actual return is the holding's own over the same dates, dividends in, where it was listed then." : "Factors left out of the shock follow their average relation to the shocked ones; a scenario that breaks those relations (stocks and bonds falling together after years of the opposite) needs each factor given.",
      "Prices from Yahoo Finance's chart data without a key (the local server); factors from FRED. Not investment advice.",
    ],
  };
}
