// mcp-backtest/src/pit.mjs
//
// Point-in-time factors from SEC XBRL data: for each company and each date, only values whose
// filing had reached EDGAR on or before that date, each as it stood then (later restatements are
// not visible earlier). Data and selection come from canli-fundamentals-mcp (loadCompany,
// resolveSeries); the rule here is the one its cross_section and known_as_of tools use.
//
// A ratio pairs numerator and denominator from the same fiscal period; growth compares a fiscal
// year with the one before it, both as known on the date. A signal row is dated with the date it
// was known, so pass it to backtest_signal with lag_days of at least 1.

export const FACTORS = Object.freeze({
  roa: { needs: ["net_income", "assets"], meaning: "net income / total assets, same fiscal year" },
  gross_margin: { needs: ["gross_profit", "revenue"], meaning: "gross profit / revenue, same fiscal year" },
  operating_margin: { needs: ["operating_income", "revenue"], meaning: "operating income / revenue, same fiscal year" },
  revenue_growth: { needs: ["revenue"], meaning: "latest fiscal-year revenue / the year before - 1" },
  asset_growth: { needs: ["assets"], meaning: "latest fiscal-year total assets / the year before - 1" },
  accruals: { needs: ["net_income", "operating_cash_flow", "assets"], meaning: "(net income - operating cash flow) / total assets, same fiscal year" },
});

export const PIT_LIMITS_TEXT = Object.freeze([
  "Values are what companies reported to the SEC in XBRL, as filed by each date; a company that files late, files outside XBRL or changes its tags can be missing.",
  "Ticker symbols are resolved to today's SEC assignment; a ticker reused by another company maps to the current holder, so check the matched names.",
]);

// Annual periods of one series known on `asOf`, newest first: [{ end, val, filed, accn }].
export function annualAsOf(series, asOf) {
  const out = [];
  for (const p of series.periods) {
    if (p.kind !== "annual") continue;
    let v = null;
    for (const x of p.vintages) if (x.filed <= asOf) v = x; // vintages are oldest first
    if (v) out.push({ end: p.end, val: v.val, filed: v.filed, accn: v.accn });
  }
  return out.sort((a, b) => (a.end < b.end ? 1 : -1));
}

const byEnd = (rows, end) => rows.find((r) => r.end === end) ?? null;
const ratio = (a, b) => (a && b && b.val !== 0 ? a.val / b.val : null);

// series: { name -> resolved series } for one company. Returns the factor value known on asOf.
export function factorAsOf(factor, series, asOf) {
  if (factor.startsWith("level:")) {
    const s = series[factor.slice(6)];
    return s ? annualAsOf(s, asOf)[0]?.val ?? null : null;
  }
  const known = Object.fromEntries(Object.entries(series).map(([k, s]) => [k, annualAsOf(s, asOf)]));
  switch (factor) {
    case "roa": { const n = known.net_income?.[0]; return n ? ratio(n, byEnd(known.assets ?? [], n.end)) : null; }
    case "gross_margin": { const g = known.gross_profit?.[0]; return g ? ratio(g, byEnd(known.revenue ?? [], g.end)) : null; }
    case "operating_margin": { const o = known.operating_income?.[0]; return o ? ratio(o, byEnd(known.revenue ?? [], o.end)) : null; }
    case "revenue_growth": case "asset_growth": {
      const rows = known[factor === "revenue_growth" ? "revenue" : "assets"] ?? [];
      return rows.length >= 2 && rows[1].val !== 0 ? rows[0].val / rows[1].val - 1 : null;
    }
    case "accruals": {
      const n = known.net_income?.[0];
      if (!n) return null;
      const c = byEnd(known.operating_cash_flow ?? [], n.end), a = byEnd(known.assets ?? [], n.end);
      return c && a && a.val !== 0 ? (n.val - c.val) / a.val : null;
    }
    default: throw new RangeError(`unknown factor ${JSON.stringify(factor)}; choose from ${Object.keys(FACTORS).join(", ")} or level:<measure>`);
  }
}

export function factorNeeds(factor) {
  if (factor.startsWith("level:")) return [factor.slice(6)];
  const f = FACTORS[factor];
  if (!f) throw new RangeError(`unknown factor ${JSON.stringify(factor)}; choose from ${Object.keys(FACTORS).join(", ")} or level:<measure>`);
  return f.needs;
}

// Builds the panel. loadSeries(ticker, names) -> { matchedName, series: { name -> series } } or throws.
export async function buildFactorPanel({ factor, tickers, dates, loadSeries, parallel = 4 }) {
  const needs = factorNeeds(factor);
  const values = Object.fromEntries(tickers.map((t) => [t, dates.map(() => null)]));
  const matched = {}, missing = {};
  let next = 0;
  const worker = async () => {
    while (next < tickers.length) {
      const t = tickers[next++];
      try {
        const { matchedName, series } = await loadSeries(t, needs);
        matched[t] = matchedName;
        dates.forEach((d, i) => { values[t][i] = factorAsOf(factor, series, d); });
      } catch (err) {
        missing[t] = String(err.message ?? err).split(". ")[0];
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, tickers.length) }, worker));
  const coverage = dates.map((d, i) => ({ date: d, companies_with_value: tickers.filter((t) => values[t][i] !== null).length }));
  return { dates, tickers, values, matched, missing, coverage };
}
