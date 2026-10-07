// Restatement items for FilingFacts v1: a figure a company reported in one annual filing and then
// reported differently in a later one. The question asks for the FIRST-reported value, which a tool
// that only knows each figure's latest value gets wrong and a point-in-time tool gets right.
//
// Built from the raw SEC companyfacts snapshot each company record points to (every filing of every
// fact, with period start dates), not from the record (which keeps the latest filing per period).
// Only money amounts in USD from annual reports: per-share figures and share counts change with
// stock splits without being restated, so they are left out. A duration counts only when both
// filings give the same start date, so a changed fiscal-year boundary is not a restatement.
// checkRestatement re-derives every item from the raw snapshot by a separate index.

import { createHash } from "node:crypto";

import { ANNUAL_FORMS, CONCEPT_NAMES, secFilingUrl } from "./templates.mjs";

export const RESTATEMENT_CONCEPTS = Object.freeze(Object.keys(CONCEPT_NAMES).filter((t) => !t.startsWith("EarningsPerShare")));

function groups(raw, tag) {
  const out = new Map();
  for (const o of raw?.facts?.["us-gaap"]?.[tag]?.units?.USD ?? []) {
    if (o.fp !== "FY" || !ANNUAL_FORMS.has(o.form) || !Number.isFinite(o.val) || typeof o.accn !== "string") continue;
    const key = `${o.start ?? ""}|${o.end}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(o);
  }
  return out;
}

// Every restated period: { tag, first, later }, later being the latest filing whose value differs.
export function restatedPeriods(raw, { filedAfter } = {}) {
  const out = [];
  for (const tag of RESTATEMENT_CONCEPTS) {
    for (const obs of groups(raw, tag).values()) {
      const sorted = [...obs].sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.accn < b.accn ? -1 : 1));
      const first = sorted[0];
      if (sorted.filter((o) => o.filed === first.filed && o.val !== first.val).length) continue; // two values on the first day: ambiguous
      const later = [...sorted].reverse().find((o) => o.val !== first.val && o.filed > first.filed);
      if (!later) continue;
      if (filedAfter && !(later.filed > filedAfter)) continue;
      out.push({ tag, first, later });
    }
  }
  return out.sort((a, b) => (a.later.filed < b.later.filed ? 1 : -1));
}

const cite = (cik, tag, o) => ({ concept: tag, taxonomy: "us-gaap", start: o.start ?? null, end: o.end, val: o.val, unit: "USD", accn: o.accn, form: o.form, filed: o.filed, url: secFilingUrl(cik, o.accn) });

export function restatementItem(record, raw, rng, opts = {}) {
  const periods = restatedPeriods(raw, opts);
  if (!periods.length) return null;
  const { tag, first, later } = periods[Math.floor(rng() * Math.min(periods.length, 6))];
  const name = CONCEPT_NAMES[tag];
  const period = first.start ? `for the fiscal year ended ${first.end}` : `as of ${first.end}`;
  const question = `${record.name} reported ${name} ${period} in its ${later.form} filed ${later.filed} (accession ${later.accn}) as a revised figure. ` +
    `What value had it first reported for that period in its XBRL data, in USD?`;
  const item = {
    schema: "canli.filing-facts-item.v1", template: "restatement", company: { cik: record.cik, name: record.name },
    question, answer: { kind: "number", value: first.val, unit: "USD" },
    facts: [cite(record.cik, tag, first), cite(record.cik, tag, later)],
    derivation: "earliest annual filing of the period, which a later filing revised", hops: 2,
  };
  item.id = createHash("sha256").update(JSON.stringify([item.company.cik, item.template, item.question])).digest("hex").slice(0, 16);
  return item;
}

// Separate path: a flat list of the raw facts, searched directly, not via restatedPeriods.
export function checkRestatement(item, raw) {
  const problems = [];
  const [first, later] = item.facts;
  if (!first || !later) return ["restatement item needs two cited facts"];
  const flat = (raw?.facts?.["us-gaap"]?.[first.concept]?.units?.USD ?? []).filter((o) => o.fp === "FY" && ANNUAL_FORMS.has(o.form));
  const same = flat.filter((o) => (o.start ?? null) === first.start && o.end === first.end);
  const find = (f) => same.find((o) => o.accn === f.accn && o.filed === f.filed && o.val === f.val && o.form === f.form);
  if (!find(first)) problems.push("first-reported fact is not in the snapshot as cited");
  if (!find(later)) problems.push("revising fact is not in the snapshot as cited");
  if (later.concept !== first.concept || later.end !== first.end || later.start !== first.start) problems.push("the two facts are not the same period");
  if (!(later.filed > first.filed)) problems.push("the revision is not filed after the first report");
  if (later.val === first.val) problems.push("the values do not differ");
  if (same.some((o) => o.filed < first.filed)) problems.push("an earlier annual filing reported this period: the cited fact is not the first");
  if (item.answer.kind !== "number" || item.answer.value !== first.val) problems.push("answer is not the first-reported value");
  if (first.concept.startsWith("EarningsPerShare")) problems.push("per-share figures are excluded (splits)");
  if (!item.question.includes(later.accn) || !item.question.includes(first.end)) problems.push("question does not name the revising filing and the period");
  return problems;
}
