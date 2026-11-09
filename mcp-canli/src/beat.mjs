// mcp-canli/src/beat.mjs
//
// beat_probability, a Canli model: the chance a company's next result lands above, within or below its own guided
// range, from its record against its word (guidance_record) blended with the market's base rate: its own counts plus
// four quarters' worth at the base rate. Validated walk-forward on the S&P 500 guidance dataset of 2 November 2026, each
// quarter predicted only from what was filed before it (scripts/research/beat-probability/validate.mjs; the numbers
// below are config/research/beat-probability-v1/validation.json's, and a test keeps them equal).
import { z } from "zod";

export const BEAT_MODEL = Object.freeze({
  version: "beat_probability v1", k: 4,
  base: { eps: { above: 318, within: 136, below: 41 }, revenue: { above: 217, within: 158, below: 22 } },
  validation: {
    method: "walk-forward on the S&P 500 guidance dataset of 2 November 2026 (press releases of VOO's 500 companies, up to 12 quarters each); each quarter predicted from what was filed before it; Brier score over above, within and below; 95% interval from resampling companies",
    eps: { quarters_scored: 356, companies: 56, brier: { base_rate: 0.494, own_record: 0.4291, blend: 0.4076 }, gain_over_base_rate: { mean: 0.0865, ci95_by_company: [0.0457, 0.1318] } },
    revenue: { quarters_scored: 278, companies: 42, brier: { base_rate: 0.5279, own_record: 0.4947, blend: 0.469 }, gain_over_base_rate: { mean: 0.059, ci95_by_company: [0.0093, 0.1146] } },
  },
});

export const BEAT_LIMITS = "A model of where a result lands against management's own guided range, from the company's past record and the market's: not a forecast of the share price or of the result itself, and not advice. Validated on 56 companies (EPS) and 42 (revenue) over about three years, which is little; the base rates come from those same years. Only guidance given in press releases counts.";

const OUT = ["above the range", "within the range", "below the range"];
export const BEAT_TOOL = Object.freeze({
  name: "beat_probability", pack: "desk", toolset: "desk", title: "The chance a company lands above its own guidance",
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  input: z.object({
    company: z.string().min(1).max(120).describe("Ticker, CIK or name."),
    measure: z.enum(["eps", "revenue"]).optional().describe("Default eps."),
    filed_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Only releases filed before this day: the model as it stood then."),
  }).strict(),
  description: "A Canli model: the chance a company's next reported EPS or revenue lands above, within or below its own guided range, from its record against its guidance blended with the market's base rate. Validated walk-forward on S&P 500 guidance (2023 to 2026): it beat the base rate out of sample for EPS and revenue, with the intervals stated. Not a forecast of the price, and not advice.",
  keywords: "beat guidance probability earnings surprise model forecast above range sandbag conservative guidance management credibility",
  args: "company: string, measure?: eps|revenue, filed_before?: date",
});

// From a company's guided quarters (oldest first: positions as guidance_record names them) to the three chances.
export function beatFrom(positions, measure = "eps") {
  const base = BEAT_MODEL.base[measure], total = base.above + base.within + base.below;
  const prior = [base.above, base.within, base.below].map((c) => (c + 1) / (total + 3));
  const own = OUT.map((o) => positions.filter((p) => p === o).length), n = own[0] + own[1] + own[2], k = BEAT_MODEL.k;
  const p = own.map((c, i) => (c + k * prior[i]) / (n + k));
  return { above: p[0], within: p[1], below: p[2], own: { above: own[0], within: own[1], below: own[2] }, base_rate: { above: prior[0], within: prior[1], below: prior[2] }, weight_on_own_record: n / (n + k) };
}

// ctx: { call(name, args) }.
export async function runBeat(ctx, args) {
  const a = BEAT_TOOL.input.parse(args ?? {}), measure = a.measure ?? "eps";
  const rec = await ctx.call("guidance_record", { company: a.company, measure, quarters: 12, ...(a.filed_before ? { filed_before: a.filed_before } : {}) });
  const cols = rec.columns ?? [], at = (n) => cols.indexOf(n);
  const seen = new Set(), quarters = [];
  for (const row of [...(rec.rows ?? [])].sort((x, y) => String(x[at("filed")]).localeCompare(String(y[at("filed")])))) {
    if (row[at("measure")] !== measure || !OUT.includes(row[at("position")]) || seen.has(row[at("quarter")])) continue;
    seen.add(row[at("quarter")]);
    quarters.push({ quarter: row[at("quarter")], filed: row[at("filed")], guided_low: row[at("guided_low")], guided_high: row[at("guided_high")], actual: row[at("actual")], position: row[at("position")] });
  }
  const m = beatFrom(quarters.map((q) => q.position), measure), pct = (x) => `${(x * 100).toFixed(0)}%`;
  const r3 = (x) => Number(x.toFixed(3));
  const v = BEAT_MODEL.validation[measure];
  return {
    company: rec.company ?? a.company, measure, ...(a.filed_before ? { as_of: a.filed_before } : {}),
    next_quarter: { above_range: r3(m.above), within_range: r3(m.within), below_range: r3(m.below) },
    from: { own_record: m.own, guided_quarters: quarters.length, weight_on_own_record: r3(m.weight_on_own_record), market_base_rate: { above: r3(m.base_rate.above), within: r3(m.base_rate.within), below: r3(m.base_rate.below) } },
    reading: quarters.length
      ? `${rec.company ?? a.company} landed above its ${measure === "eps" ? "EPS" : "revenue"} range in ${m.own.above} of its ${quarters.length} guided quarters read; blended with the market's rate, the chance its next result lands above the range is about ${pct(m.above)}, within ${pct(m.within)}, below ${pct(m.below)}.`
      : `No guided ${measure === "eps" ? "EPS" : "revenue"} range was found in ${rec.company ?? a.company}'s press releases, so this is the market's base rate alone: above ${pct(m.above)}, within ${pct(m.within)}, below ${pct(m.below)}.`,
    quarters: { columns: ["quarter", "filed", "guided_low", "guided_high", "actual", "position"], rows: quarters.map((q) => [q.quarter, q.filed, q.guided_low, q.guided_high, q.actual, q.position]) },
    model: { version: BEAT_MODEL.version, blend: `the company's own quarters plus ${BEAT_MODEL.k} quarters' worth at the market's base rate`, validation: { method: BEAT_MODEL.validation.method, ...v } },
    limits: BEAT_LIMITS,
  };
}
