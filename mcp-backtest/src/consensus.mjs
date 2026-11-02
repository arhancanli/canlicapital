// Consensus among agents, counted honestly. Five models that agree are not five votes if they share
// their training and their mistakes. So this measures how many independent views a group really holds,
// from how their errors move together, and weights each by its record. Agreement among copies adds
// nothing, and the answer says so.
import { z } from "zod";

const prob = z.number().min(0).max(1);
export const consensusInput = z.object({
  agents: z.array(z.object({
    name: z.string().min(1).max(60),
    forecasts: z.array(z.object({ question: z.string().min(1).max(200), probability: prob }).strict()).min(1).max(5000),
  }).strict()).min(2).max(200).describe("Each agent's probability for each question."),
  outcomes: z.array(z.object({ question: z.string().min(1).max(200), happened: z.boolean() }).strict()).max(5000).optional().describe("Questions already settled. Their forecasts give each agent a record; the rest are combined."),
}).strict();

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const clip = (p) => Math.min(0.99, Math.max(0.01, p));
const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
const unlogit = (x) => 1 / (1 + Math.exp(-x));

export function correlation(a, b) {
  const ma = mean(a), mb = mean(b);
  let up = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i += 1) { up += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 1e-12 && db > 1e-12 ? up / Math.sqrt(da * db) : null;
}

// k for unrelated views, 1 for copies: (sum of eigenvalues)^2 / sum of squared eigenvalues of the
// correlation matrix. A pair with no measurable spread counts as the same view.
export function independentViews(series) {
  const k = series.length;
  let squares = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) { const c = i === j ? 1 : correlation(series[i], series[j]) ?? 1; squares += c * c; }
  return k * k / squares;
}

export function agentConsensus(args) {
  const a = consensusInput.parse(args);
  const happened = new Map((a.outcomes ?? []).map((o) => [o.question, o.happened ? 1 : 0]));
  const own = a.agents.map((x) => new Map(x.forecasts.map((f) => [f.question, f.probability])));
  const allQuestions = [...new Set(a.agents.flatMap((x) => x.forecasts.map((f) => f.question)))];
  const settled = allQuestions.filter((q) => happened.has(q) && own.every((m) => m.has(q)));
  const open = allQuestions.filter((q) => !happened.has(q));
  const base = settled.length ? mean(settled.map((q) => happened.get(q))) : null;
  const baseBrier = base == null ? null : mean(settled.map((q) => (base - happened.get(q)) ** 2));

  const records = a.agents.map((x, i) => {
    const errors = settled.map((q) => own[i].get(q) - happened.get(q));
    const brier = errors.length ? mean(errors.map((e) => e * e)) : null;
    return { name: x.name, errors, brier };
  });
  // Weighted by record once there is one; a Brier score near chance earns little, and with fewer than
  // ten settled questions everyone counts the same.
  const useRecord = settled.length >= 10;
  const raw = records.map((r) => (useRecord ? 1 / Math.max(r.brier, 0.01) : 1)), total = raw.reduce((x, y) => x + y, 0);
  const weights = raw.map((w) => w / total);

  const basis = settled.length >= 5 ? "their errors on settled questions, after each agent's usual error on that outcome" : "their forecasts, since few questions are settled";
  const shared = allQuestions.filter((q) => own.every((m) => m.has(q)));
  // Good forecasters' errors all lean the same way, because they are all right about the same outcomes.
  // What shows shared thinking is what is left once each agent's usual error on that outcome is removed.
  const residual = (errors) => {
    const usual = (hit) => { const xs = errors.filter((_, i) => happened.get(settled[i]) === hit); return xs.length ? mean(xs) : 0; };
    const yes = usual(1), no = usual(0);
    return errors.map((e, i) => e - (happened.get(settled[i]) === 1 ? yes : no));
  };
  const series = settled.length >= 5 ? records.map((r) => residual(r.errors)) : own.map((m) => shared.map((q) => m.get(q)));
  const views = series[0]?.length >= 3 ? independentViews(series) : null;

  const rows = open.map((q) => {
    const have = own.map((m, i) => [m.get(q), weights[i]]).filter(([p]) => p !== undefined);
    const sum = have.reduce((n, [, w]) => n + w, 0);
    const combined = unlogit(have.reduce((n, [p, w]) => n + logit(p) * w, 0) / sum);
    const ps = have.map(([p]) => p);
    return [q, have.length, round(combined), round(mean(ps)), round(Math.min(...ps)), round(Math.max(...ps))];
  });
  const k = a.agents.length;
  return {
    agents: k,
    independent_views: round(views, 1),
    independent_views_from: views == null ? "too few shared questions to measure" : basis,
    reading: views == null ? "Too few shared questions to say how independent these agents are." : `These ${k} agents hold about ${round(views, 1)} independent ${views < 1.5 ? "view" : "views"} between them.${views < k / 2 ? " Most of their agreement is shared thinking, so it should not raise confidence the way separate opinions would." : ""}`,
    records: { columns: ["agent", "settled_questions", "brier_score", "skill_against_base_rate", "weight"], rows: records.map((r, i) => [r.name, settled.length, round(r.brier), r.brier != null && baseBrier ? round(1 - r.brier / baseBrier) : null, round(weights[i])]) },
    combined: { columns: ["question", "agents", "combined_probability", "plain_average", "lowest", "highest"], rows },
    meaning: "A Brier score is the mean squared error of a probability (lower is better; always saying 50% scores 0.25). Skill above 0 beats always saying the base rate. The combined probability is a weighted average of log-odds.",
    limits: ["With few settled questions the records and the count of views are noisy.", "A group's record says how it did on these questions. It does not say it will keep doing so."],
  };
}
